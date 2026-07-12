"""
writing_suggestion_log.py — 記述支援AIの提案（suggestion_type 付き）を DB 保存する追加モジュール。

背景:
  記述支援AIのプロンプト変更で、各提案に `suggestion_type`
  （"redirection" | "expansion" | "deepening"）が追加された。
  どの種類の提案がどれだけ提示され、どれが実際に採用（クリック挿入）されたかは
  研究上の重要データなので、専用テーブルに保存する。

保存する内容:
  - 提示された提案（event="suggested"）: detect_topics が返した提案を1件1行で記録
  - 採用された提案（event="adopted"）: 学習者が提案カードをクリックして本文に挿入したもの

導入手順:
  1) backend/ に本ファイルを置く。
  2) app.py で models を import した後・db.create_all() の前に
        import writing_suggestion_log
     を1行追加（モデル登録）。
  3) app.py の register_all_routes(app) の後に
        writing_suggestion_log.register_suggestion_log_routes(app)
     を追加（POST /api/logs/suggestion を有効化）。
  4) テーブル作成:
        python migrate_add_writing_suggestion_log.py
     （本番 Supabase は writing_suggestion_logs_supabase.sql を SQL Editor で実行）
"""
from datetime import datetime, timezone

from models import db

VALID_SUGGESTION_TYPES = ("redirection", "expansion", "deepening")


class WritingSuggestionLog(db.Model):
    """記述支援AIの提案ログ（提示・採用）"""
    __tablename__ = "writing_suggestion_logs"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    memo_id = db.Column(db.Integer, nullable=True, index=True)

    # "suggested"（提示された） / "adopted"（採用された）
    event = db.Column(db.String(20), nullable=False, default="suggested", index=True)

    # ★ 新データ形式: redirection / expansion / deepening
    suggestion_type = db.Column(db.String(30), nullable=True, index=True)
    node_label = db.Column(db.String(300), default="")
    connector = db.Column(db.String(300), default="")
    prompt_hint = db.Column(db.Text, default="")

    # 提示時の文脈（分析用・任意）
    currently_writing = db.Column(db.String(300), nullable=True)
    described_count = db.Column(db.Integer, nullable=True)
    total_nodes = db.Column(db.Integer, nullable=True)

    created_at = db.Column(
        db.DateTime, default=lambda: datetime.now(timezone.utc), index=True
    )

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "memo_id": self.memo_id,
            "event": self.event,
            "suggestion_type": self.suggestion_type,
            "node_label": self.node_label,
            "connector": self.connector,
            "prompt_hint": self.prompt_hint,
            "currently_writing": self.currently_writing,
            "described_count": self.described_count,
            "total_nodes": self.total_nodes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


def _norm_type(value) -> str:
    v = str(value or "").strip().lower()
    return v if v in VALID_SUGGESTION_TYPES else "expansion"


def record_suggestions(user_id, memo_id, event, suggestions, context=None):
    """提案リストをまとめて記録する（他モジュールからも呼べる）。"""
    context = context or {}
    rows = []
    for s in (suggestions or []):
        if not isinstance(s, dict):
            continue
        rows.append(WritingSuggestionLog(
            user_id=user_id,
            memo_id=memo_id,
            event=event,
            suggestion_type=_norm_type(s.get("suggestion_type")),
            node_label=(s.get("node_label") or "")[:300],
            connector=(s.get("connector") or "")[:300],
            prompt_hint=(s.get("prompt_hint") or ""),
            currently_writing=(context.get("currently_writing") or None),
            described_count=context.get("described_count"),
            total_nodes=context.get("total_nodes"),
        ))
    if rows:
        db.session.add_all(rows)
        db.session.commit()
    return len(rows)


def register_suggestion_log_routes(app):
    """app.py: register_all_routes(app) の後に呼ぶ。"""
    import csv
    import io

    from flask import g, jsonify, request, Response

    try:
        from auth import token_required, admin_required
    except Exception:
        return

    @app.route("/api/logs/suggestion", methods=["POST"])
    @token_required
    def log_writing_suggestion():
        """
        提案の提示・採用を記録する。

        body 例:
          {
            "event": "suggested" | "adopted",
            "memo_id": 12,
            "suggestions": [ {suggestion_type, node_label, connector, prompt_hint}, ... ],
            "context": {"currently_writing": "概念C", "described_count": 2, "total_nodes": 7}
          }
        単一採用時は "suggestion": {...} でも可。
        """
        data = request.get_json(silent=True) or {}
        event = data.get("event") or "suggested"
        if event not in ("suggested", "adopted"):
            event = "suggested"

        suggestions = data.get("suggestions")
        if suggestions is None and isinstance(data.get("suggestion"), dict):
            suggestions = [data["suggestion"]]

        count = record_suggestions(
            user_id=g.current_user.get("user_db_id"),
            memo_id=data.get("memo_id"),
            event=event,
            suggestions=suggestions,
            context=data.get("context") or {},
        )
        return jsonify({"ok": True, "recorded": count})

    @app.route("/api/admin/writing_suggestions.csv", methods=["GET"])
    @admin_required
    def export_writing_suggestions_csv():
        out = io.StringIO()
        w = csv.writer(out)
        w.writerow([
            "id", "user_id", "memo_id", "event", "suggestion_type",
            "node_label", "connector", "prompt_hint",
            "currently_writing", "described_count", "total_nodes", "created_at",
        ])
        for r in WritingSuggestionLog.query.order_by(WritingSuggestionLog.id.asc()).all():
            w.writerow([
                r.id, r.user_id, r.memo_id, r.event, r.suggestion_type,
                r.node_label, r.connector, r.prompt_hint,
                r.currently_writing or "", r.described_count, r.total_nodes,
                r.created_at.isoformat() if r.created_at else "",
            ])
        return Response(
            out.getvalue(),
            mimetype="text/csv",
            headers={
                "Content-Disposition": "attachment; filename=writing_suggestions.csv"
            },
        )