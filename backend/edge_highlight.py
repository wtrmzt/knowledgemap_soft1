"""
edge_highlight.py — エッジ説明機能（新仕様）の追加モジュール。

【仕様変更の背景】
  旧: マップのエッジ上にアイコンを表示し、クリックで説明を表示。
      → クリック操作が不安定・ユーザーの能動的アクションが必要。
  新: ノードとエッジの情報をAIに入力し、「関連性の高い上位3エッジ」を選定・説明。
      画面下部のポップアップとして自動提示する（ユーザー操作不要）。

【設計】
  - ai_service.py を変更せず、本モジュールだけで完結する追加モジュール。
    （OpenAI クライアントは ai_service._get_client() を借りる）
  - 介入度は既存の AppSettings.intervention.edge_explanation を流用。
        Lv1 = OFF（何も返さない） / Lv2 = 単語のみ / Lv3 = 説明文
  - マップ変更のたびにフロントから呼ばれるため、無駄なAI呼び出しを避ける:
        マップ構成（エッジ集合）のシグネチャが前回と同じなら、前回結果をDBから再利用。
  - 個別ペアの説明は既存の edge_explanations テーブルにもキャッシュする。
  - 提示された上位3件は研究データとして edge_highlight_logs に保存する。

【導入手順】
  1) backend/ に本ファイルを置く。
  2) app.py で models を import した後・db.create_all() の前に
         import edge_highlight
     を1行追加（モデル登録）。
  3) app.py の register_all_routes(app) の後に
         edge_highlight.register_edge_highlight_routes(app)
     を追加（POST /api/edges/highlights を有効化）。
  4) テーブル作成:
         python migrate_add_edge_highlight.py
     （本番 Supabase は edge_highlight_logs_supabase.sql を SQL Editor で実行）
"""
import hashlib
import json
import logging
from datetime import datetime, timezone

from models import db

logger = logging.getLogger(__name__)

TOP_K = 3

# 未更新環境でも落ちないよう防御的に取り込む
try:
    from models import AppSettings
except ImportError:  # pragma: no cover
    AppSettings = None

try:
    from models import EdgeExplanation
except ImportError:  # pragma: no cover
    EdgeExplanation = None


# ============================================================
# モデル（研究データ: どのエッジが提示されたか）
# ============================================================
class EdgeHighlightLog(db.Model):
    """画面下部に提示された上位エッジの記録"""
    __tablename__ = "edge_highlight_logs"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    memo_id = db.Column(db.Integer, nullable=True, index=True)

    # 同一マップ構成の再提示を判定するためのシグネチャ
    map_signature = db.Column(db.String(64), nullable=True, index=True)

    rank = db.Column(db.Integer, nullable=False, default=1)  # 1..3
    source_label = db.Column(db.String(300), default="")
    target_label = db.Column(db.String(300), default="")
    word = db.Column(db.String(300), default="")
    sentence = db.Column(db.Text, default="")

    level = db.Column(db.Integer, nullable=True)       # 提示時の介入度
    node_count = db.Column(db.Integer, nullable=True)
    edge_count = db.Column(db.Integer, nullable=True)

    created_at = db.Column(
        db.DateTime, default=lambda: datetime.now(timezone.utc), index=True
    )

    def to_dict(self):
        return {
            "id": self.id,
            "memo_id": self.memo_id,
            "rank": self.rank,
            "source_label": self.source_label,
            "target_label": self.target_label,
            "word": self.word,
            "sentence": self.sentence,
            "level": self.level,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ============================================================
# ヘルパー
# ============================================================
def _label_map(nodes):
    """ノード配列 → {id: label}（MapNode / React Flow 形式の両方に対応）"""
    out = {}
    for n in (nodes or []):
        if not isinstance(n, dict):
            continue
        nid = str(n.get("id", ""))
        label = n.get("label") or (n.get("data") or {}).get("label") or ""
        if nid:
            out[nid] = str(label)
    return out


def _normalize_edges(nodes, edges):
    """エッジを {source_label, target_label, label} のリストに正規化（周辺概念・関連科目は除外）"""
    lm = _label_map(nodes)
    result = []
    for e in (edges or []):
        if not isinstance(e, dict):
            continue
        if e.get("isSatellite") or e.get("isRelation"):
            continue
        s = lm.get(str(e.get("source", "")), "")
        t = lm.get(str(e.get("target", "")), "")
        if not s or not t:
            continue
        result.append({
            "source_label": s,
            "target_label": t,
            "label": str(e.get("label") or ""),
        })
    return result


def _signature(pairs):
    """エッジ集合のシグネチャ（順序に依存しない）"""
    key = sorted(f"{p['source_label']}|{p['target_label']}|{p['label']}" for p in pairs)
    return hashlib.sha256(json.dumps(key, ensure_ascii=False).encode("utf-8")).hexdigest()


def _get_level():
    """介入度（1: OFF / 2: 単語 / 3: 説明文）"""
    if AppSettings is None:
        return 3
    try:
        return int(AppSettings.get_data()["intervention"].get("edge_explanation", 3))
    except Exception:
        return 3


def _get_prompt_override():
    """管理者が設定したプロンプト上書き（空なら既定を使う）"""
    if AppSettings is None:
        return ""
    try:
        return (AppSettings.get_data().get("prompts", {}) or {}).get("edge_explanation", "") or ""
    except Exception:
        return ""


def _cached_explanation(source, target):
    """既存の edge_explanations キャッシュを参照（向き違いも吸収）"""
    if EdgeExplanation is None:
        return None
    try:
        row = (EdgeExplanation.query
               .filter_by(source_label=source, target_label=target).first()
               or EdgeExplanation.query
               .filter_by(source_label=target, target_label=source).first())
        return row
    except Exception:
        return None


def _store_explanation(source, target, word, sentence, memo_id=None):
    """個別ペアの説明を edge_explanations に保存（既存があれば何もしない）"""
    if EdgeExplanation is None:
        return
    try:
        if _cached_explanation(source, target) is not None:
            return
        row = EdgeExplanation(
            source_label=source, target_label=target,
            word=word or "", sentence=sentence or "",
        )
        if hasattr(EdgeExplanation, "memo_id") and memo_id is not None:
            try:
                row.memo_id = int(memo_id)
            except (TypeError, ValueError):
                pass
        db.session.add(row)
        db.session.commit()
    except Exception:
        db.session.rollback()


# ============================================================
# AI: 上位Kエッジの選定 + 説明生成
# ============================================================
def select_top_edges(pairs, top_k=TOP_K):
    """
    エッジ一覧から「関連性が高く説明する価値の大きい」上位K件を選び、説明を生成する。
    戻り値: [{source_label, target_label, word, sentence}, ...]
    """
    if not pairs:
        return []

    node_labels = sorted({p["source_label"] for p in pairs} | {p["target_label"] for p in pairs})
    edge_lines = "\n".join(
        f'{i + 1}. 「{p["source_label"]}」→「{p["target_label"]}」'
        + (f'（{p["label"]}）' if p["label"] else "")
        for i, p in enumerate(pairs)
    )

    override = _get_prompt_override()
    if override.strip():
        prompt = (
            f"{override.strip()}\n\n"
            f"■ 概念一覧:\n{json.dumps(node_labels, ensure_ascii=False)}\n\n"
            f"■ つながり（エッジ）一覧:\n{edge_lines}\n\n"
            f"上位{top_k}件を厳密にJSONのみで出力してください。\n"
            '{"highlights":[{"source_label":"","target_label":"","word":"","sentence":""}]}'
        )
    else:
        prompt = (
            "あなたは学習振り返り支援AIです。\n"
            "学習者が作成した知識マップから、特に注目して理解を深める価値が高い"
            f"「つながり（エッジ）」を上位{top_k}件選定し、説明してください。\n\n"
            f"■ 概念一覧:\n{json.dumps(node_labels, ensure_ascii=False)}\n\n"
            f"■ つながり（エッジ）一覧:\n{edge_lines}\n\n"
            "【選定の観点】\n"
            "・2つの概念の関係が、学習内容の理解において本質的・重要である\n"
            "・学習者が見落としやすく、説明されることで理解が一段深まる\n"
            "・単なる言い換えや自明な関係は避ける\n\n"
            "【出力条件】\n"
            "・必ず上記のエッジ一覧に実在する組み合わせのみを選ぶこと（新しい概念を作らない）\n"
            "・word: 2概念の関係を一言で表す語（10文字以内。例「前提条件」「因果関係」「具体例」）\n"
            "・sentence: なぜその2つが関係するのかの説明（60〜100字程度、丁寧語）\n\n"
            "厳密にJSON形式のみで出力してください:\n"
            '{"highlights":[{"source_label":"概念A","target_label":"概念B",'
            '"word":"前提条件","sentence":"概念Aは概念Bを理解するための前提となる考え方です。…"}]}'
        )

    try:
        from ai_service import _get_client
        client = _get_client()
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            response_format={"type": "json_object"},
        )
        result = json.loads(response.choices[0].message.content)
    except Exception as e:
        logger.error("[select_top_edges] エラー: %s", e)
        return []

    # 実在するエッジのみ採用（AIの捏造を防ぐ）
    valid = {(p["source_label"], p["target_label"]) for p in pairs}
    valid |= {(p["target_label"], p["source_label"]) for p in pairs}

    out = []
    seen = set()  # 向きを問わず重複を排除する
    for h in (result.get("highlights") or []):
        if not isinstance(h, dict):
            continue
        s = str(h.get("source_label") or "").strip()
        t = str(h.get("target_label") or "").strip()
        if not s or not t or (s, t) not in valid:
            continue
        key = tuple(sorted((s, t)))
        if key in seen:
            continue
        seen.add(key)
        out.append({
            "source_label": s,
            "target_label": t,
            "word": str(h.get("word") or "")[:300],
            "sentence": str(h.get("sentence") or ""),
        })
        if len(out) >= top_k:
            break
    return out


# ============================================================
# ルート登録
# ============================================================
def register_edge_highlight_routes(app):
    """app.py: register_all_routes(app) の後に呼ぶ。"""
    import csv
    import io

    from flask import g, jsonify, request, Response

    try:
        from auth import token_required, admin_required
    except Exception:  # pragma: no cover
        return

    @app.route("/api/edges/highlights", methods=["POST"])
    @token_required
    def get_edge_highlights():
        """
        マップ全体（nodes + edges）から、関連性の高い上位3エッジと説明を返す。

        body: {"memo_id": 12, "nodes": [{id,label}...], "edges": [{source,target,label}...]}
        res : {"level": 3, "highlights": [{source_label,target_label,word,sentence}...],
               "cached": false, "disabled": false}
        """
        body = request.get_json(silent=True) or {}
        level = _get_level()
        if level <= 1:
            return jsonify({"disabled": True, "level": level, "highlights": []})

        pairs = _normalize_edges(body.get("nodes"), body.get("edges"))
        if len(pairs) == 0:
            return jsonify({"level": level, "highlights": [], "cached": False})

        memo_id = body.get("memo_id")
        user_id = g.current_user.get("user_db_id")
        sig = _signature(pairs)

        # --- 同一マップ構成なら前回結果を再利用（AI呼び出しを節約）---
        try:
            prev = (EdgeHighlightLog.query
                    .filter_by(memo_id=memo_id, map_signature=sig)
                    .order_by(EdgeHighlightLog.rank.asc())
                    .all()) if memo_id is not None else []
        except Exception:
            prev = []

        if prev:
            highlights = [{
                "source_label": r.source_label,
                "target_label": r.target_label,
                "word": r.word or "",
                "sentence": (r.sentence or "") if level >= 3 else "",
            } for r in prev]
            return jsonify({"level": level, "highlights": highlights, "cached": True})

        # --- AIで選定・生成 ---
        selected = select_top_edges(pairs, TOP_K)
        if not selected:
            return jsonify({"level": level, "highlights": [], "cached": False})

        # 個別ペアのキャッシュへ保存 + 提示ログを記録
        try:
            rows = []
            for i, h in enumerate(selected):
                _store_explanation(h["source_label"], h["target_label"],
                                   h["word"], h["sentence"], memo_id=memo_id)
                rows.append(EdgeHighlightLog(
                    user_id=user_id,
                    memo_id=memo_id,
                    map_signature=sig,
                    rank=i + 1,
                    source_label=h["source_label"],
                    target_label=h["target_label"],
                    word=h["word"],
                    sentence=h["sentence"],
                    level=level,
                    node_count=len(_label_map(body.get("nodes"))),
                    edge_count=len(pairs),
                ))
            db.session.add_all(rows)
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            logger.error("[edge_highlights] ログ保存失敗: %s", e)

        # Lv2 は単語のみ返す
        highlights = [{
            "source_label": h["source_label"],
            "target_label": h["target_label"],
            "word": h["word"],
            "sentence": h["sentence"] if level >= 3 else "",
        } for h in selected]

        return jsonify({"level": level, "highlights": highlights, "cached": False})

    @app.route("/api/admin/edge_highlights.csv", methods=["GET"])
    @admin_required
    def export_edge_highlights_csv():
        out = io.StringIO()
        w = csv.writer(out)
        w.writerow(["id", "user_id", "memo_id", "map_signature", "rank",
                    "source_label", "target_label", "word", "sentence",
                    "level", "node_count", "edge_count", "created_at"])
        for r in EdgeHighlightLog.query.order_by(EdgeHighlightLog.id.asc()).all():
            w.writerow([
                r.id, r.user_id, r.memo_id, r.map_signature, r.rank,
                r.source_label, r.target_label, r.word, r.sentence,
                r.level, r.node_count, r.edge_count,
                r.created_at.isoformat() if r.created_at else "",
            ])
        return Response(
            out.getvalue(),
            mimetype="text/csv",
            headers={"Content-Disposition": "attachment; filename=edge_highlights.csv"},
        )