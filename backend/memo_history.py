"""
memo_history.py — メモ本文の変更履歴（memo_history）を DB 保存する追加モジュール。

目的:
  MapHistory（マップのスナップショット）と同様に、メモ「本文(content)/タイトル(title)」の
  遷移をバージョン付きで DB に保存する（研究用データ収集）。

設計:
  - 保存経路（memo.py / memo_v3.py / generate_map 等）に依存せず確実に記録するため、
    SQLAlchemy の before_flush イベントで「content または title が変化した Memo」を検知し、
    memo_histories に1行スナップショットを追加する。
  - 新規メモ作成時は action="create"（version=1）、以降の変更は action="update"（version 連番）。

導入手順:
  1) backend/ に本ファイルを置く。
  2) app.py で models を import した後・db.create_all() の前に  `import memo_history`  を1行追加。
     （これでモデル登録 + イベントリスナ登録が行われる）
  3) `python migrate_add_memo_history.py` を実行（または本番再デプロイで create_all が作成）。
  4) 任意: app.py の register_all_routes(app) の後に
        memo_history.register_memo_history_routes(app)
     を追加すると、履歴取得API と CSV エクスポートAPI が有効になる。
"""
from datetime import datetime, timezone

from sqlalchemy import event, inspect, func
from sqlalchemy.orm import Session

from models import db, Memo


# ============================================================
# モデル
# ============================================================
class MemoHistory(db.Model):
    """メモ本文（content / title）のスナップショット履歴"""
    __tablename__ = "memo_histories"

    id = db.Column(db.Integer, primary_key=True)
    memo_id = db.Column(db.Integer, db.ForeignKey("memos.id"), nullable=False, index=True)
    version = db.Column(db.Integer, nullable=False, default=1)
    content = db.Column(db.Text, default="")
    title = db.Column(db.String(300), default="")
    # 機能3（存在する環境のみ値が入る。無くても空文字で安全）
    relation_note = db.Column(db.Text, default="")
    action = db.Column(db.String(50), default="update")  # create / update
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    # 新規メモ作成時に memo.id が未確定でも、この relationship 経由で FK が後埋めされる
    memo = db.relationship(
        "Memo",
        backref=db.backref("text_histories", lazy="dynamic",
                           order_by="MemoHistory.version.desc()"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "memo_id": self.memo_id,
            "version": self.version,
            "content": self.content,
            "title": self.title,
            "relation_note": self.relation_note,
            "action": self.action,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ============================================================
# 変更検知 + スナップショット記録（before_flush）
# ============================================================
_TRACKED = ("content", "title")  # これらが変化したら記録


def _has_tracked_change(obj) -> bool:
    st = inspect(obj)
    for a in _TRACKED:
        if a in st.attrs and st.attrs[a].history.has_changes():
            return True
    return False


def _next_version(session, memo) -> int:
    if getattr(memo, "id", None) is None:
        return 1
    with session.no_autoflush:
        last = (
            session.query(func.max(MemoHistory.version))
            .filter(MemoHistory.memo_id == memo.id)
            .scalar()
        )
    return (last or 0) + 1


def _snapshot(session, memo, action: str):
    mh = MemoHistory(
        version=_next_version(session, memo),
        content=(getattr(memo, "content", "") or ""),
        title=(getattr(memo, "title", "") or ""),
        relation_note=(getattr(memo, "relation_note", "") or ""),
        action=action,
    )
    # 新規メモ(未フラッシュ)は relationship 経由で memo_id を後埋め、既存メモは直接設定
    if getattr(memo, "id", None) is not None:
        mh.memo_id = memo.id
    else:
        mh.memo = memo
    session.add(mh)


# 二重登録防止
_LISTENER_ATTACHED = False


def _attach_listener():
    global _LISTENER_ATTACHED
    if _LISTENER_ATTACHED:
        return
    _LISTENER_ATTACHED = True

    @event.listens_for(Session, "before_flush")
    def _record_memo_history(session, flush_context, instances):  # noqa: ANN001
        pending = []
        # 新規メモ（作成時の初期スナップショット）
        for obj in session.new:
            if isinstance(obj, Memo):
                pending.append((obj, "create"))
        # 既存メモの本文/タイトル変更
        for obj in session.dirty:
            if isinstance(obj, Memo) and _has_tracked_change(obj):
                pending.append((obj, "update"))
        for memo, action in pending:
            _snapshot(session, memo, action)


_attach_listener()


# ============================================================
# 任意: 履歴取得API + CSVエクスポート（app.py で呼べば有効化）
# ============================================================
def register_memo_history_routes(app):
    """app.py: register_all_routes(app) の後に呼ぶと有効化される（任意）。"""
    import csv
    import io
    from flask import g, jsonify, request, Response

    try:
        from auth import token_required, admin_required
    except Exception:  # 認証デコレータが読めない環境ではAPI登録をスキップ
        return

    @app.route("/api/memos/<int:memo_id>/text_history", methods=["GET"])
    @token_required
    def get_memo_text_history(memo_id):
        memo = Memo.query.get(memo_id)
        if not memo:
            return jsonify({"error": "not found"}), 404
        # 本人 or 管理者のみ
        uid = g.current_user.get("user_db_id")
        if not g.current_user.get("is_admin") and memo.user_id != uid:
            return jsonify({"error": "forbidden"}), 403
        rows = (
            MemoHistory.query.filter_by(memo_id=memo_id)
            .order_by(MemoHistory.version.asc())
            .all()
        )
        return jsonify({"items": [r.to_dict() for r in rows], "count": len(rows)})

    @app.route("/api/admin/memo_histories.csv", methods=["GET"])
    @admin_required
    def export_memo_histories_csv():
        out = io.StringIO()
        w = csv.writer(out)
        w.writerow(["id", "memo_id", "version", "action", "created_at",
                    "title", "content", "relation_note"])
        for r in MemoHistory.query.order_by(
            MemoHistory.memo_id.asc(), MemoHistory.version.asc()
        ).all():
            w.writerow([
                r.id, r.memo_id, r.version, r.action,
                r.created_at.isoformat() if r.created_at else "",
                (r.title or ""), (r.content or ""), (r.relation_note or ""),
            ])
        return Response(
            out.getvalue(),
            mimetype="text/csv",
            headers={"Content-Disposition": "attachment; filename=memo_histories.csv"},
        )
