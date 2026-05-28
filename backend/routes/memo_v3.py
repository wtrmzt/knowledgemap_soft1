"""v3 追加のメモ関連ルート (v3.2.2).

既存の routes/memo.py には一切手を付けず、別ファイルで並走する.

提供エンドポイント:
- GET   /api/memos/list           マップ一覧(ユーザー別)
- GET   /api/memos/<int:id>       単一メモ取得
- POST  /api/memos/<int:id>/update タイトル・本文を部分更新(自動保存用)  ★メイン
- PATCH /api/memos/<int:id>       同上(PATCH 版も用意。どちらでも可)
- POST  /api/memos/blank          空のメモを作成して返す
"""
from __future__ import annotations

import logging
from datetime import datetime

from flask import current_app, g, request

from auth import token_required
from models import Memo, KnowledgeMap, MapHistory, db

logger = logging.getLogger(__name__)


def register_memo_v3_routes(app):
    """既存の routes/__init__.py から呼ばれる関数."""

    # ==========================================================
    # GET /api/memos/list - ユーザー別マップ一覧
    # ==========================================================
    @app.get("/api/memos/list")
    @token_required
    def list_memos_v3():
        user_id = g.current_user["user_db_id"]

        try:
            page = max(1, int(request.args.get("page", 1)))
            per_page = max(1, min(50, int(request.args.get("per_page", 20))))
        except (TypeError, ValueError):
            return {"error": "invalid pagination params"}, 400

        mode = request.args.get("mode")
        q = (request.args.get("q") or "").strip()
        archived_flag = request.args.get("archived") == "1"

        from sqlalchemy import or_
        query = Memo.query.filter(Memo.user_id == user_id)
        if hasattr(Memo, "is_archived"):
            query = query.filter(Memo.is_archived == archived_flag)
        if mode in ("reflection", "research", "idea"):
            query = query.filter(Memo.mode == mode)
        if q:
            like = f"%{q}%"
            conds = [Memo.content.ilike(like)]
            if hasattr(Memo, "title"):
                conds.insert(0, Memo.title.ilike(like))
            query = query.filter(or_(*conds))

        order_col = Memo.updated_at if hasattr(Memo, "updated_at") else Memo.created_at
        pagination = query.order_by(order_col.desc()).paginate(
            page=page, per_page=per_page, error_out=False
        )
        items = [_memo_to_summary_dict(m) for m in pagination.items]

        return {
            "items": items, "page": page, "per_page": per_page,
            "total": pagination.total, "has_next": pagination.has_next,
            "has_prev": pagination.has_prev,
        }

    # ==========================================================
    # GET /api/memos/<id> - 単一取得
    # ==========================================================
    @app.get("/api/memos/<int:memo_id>")
    @token_required
    def get_single_memo_v3(memo_id: int):
        user_id = g.current_user["user_db_id"]
        memo = Memo.query.filter_by(id=memo_id, user_id=user_id).first()
        if memo is None:
            return {"error": "not found"}, 404
        return _memo_to_dict_safe(memo)

    # ==========================================================
    # 更新処理の共通ロジック
    # ==========================================================
    def _do_update(memo_id: int):
        user_id = g.current_user["user_db_id"]
        memo = Memo.query.filter_by(id=memo_id, user_id=user_id).first()
        if memo is None:
            return {"error": "not found"}, 404

        body = request.get_json(silent=True) or {}
        changed = False

        if "title" in body and hasattr(memo, "title"):
            new_title = body.get("title")
            new_title = "" if new_title is None else str(new_title)[:200]
            if memo.title != new_title:
                memo.title = new_title
                changed = True

        if "content" in body:
            new_content = body.get("content")
            new_content = "" if new_content is None else str(new_content)
            if memo.content != new_content:
                memo.content = new_content
                changed = True

        if changed:
            if hasattr(memo, "updated_at"):
                try:
                    memo.updated_at = datetime.utcnow()
                except Exception:
                    pass
            db.session.commit()

        return _memo_to_dict_safe(memo)

    # ==========================================================
    # POST /api/memos/<id>/update - メイン(apiPost 経由で確実に認証)
    # ==========================================================
    @app.post("/api/memos/<int:memo_id>/update")
    @token_required
    def update_memo_v3_post(memo_id: int):
        return _do_update(memo_id)

    # ==========================================================
    # PATCH /api/memos/<id> - PATCH 派生(どちらでも可)
    # ==========================================================
    @app.patch("/api/memos/<int:memo_id>")
    @token_required
    def patch_memo_v3(memo_id: int):
        return _do_update(memo_id)

    # ==========================================================
    # POST /api/memos/<id>/generate_map - 既存メモにマップを生成して保存
    # ----------------------------------------------------------
    # 「?new=1 → ブランクメモ作成 → マップを生成」の経路で、
    # 生成のたびに createMemoWithMap が新規メモを作ってしまい、
    # 本文はメモA・マップはメモB と分かれる二重化が発生していた。
    # このエンドポイントは現在のメモ自身を更新するため、本文・タイトル・
    # マップが必ず同一メモに揃う。レスポンス形は createMemoWithMap と同じ。
    # ==========================================================
    @app.post("/api/memos/<int:memo_id>/generate_map")
    @token_required
    def generate_map_for_memo(memo_id: int):
        from ai_service import generate_map_from_text

        user_id = g.current_user["user_db_id"]
        memo = Memo.query.filter_by(id=memo_id, user_id=user_id).first()
        if memo is None:
            return {"error": "not found"}, 404

        body = request.get_json(silent=True) or {}
        content = (body.get("content") if body.get("content") is not None else memo.content) or ""
        content = str(content).strip()
        mode = body.get("mode") or memo.mode or "reflection"
        if mode not in ("reflection", "research", "idea"):
            mode = "reflection"
        if not content:
            return {"error": "メモ内容が必要です"}, 400

        # 本文・モードを最新化(typed-but-not-yet-saved な状態でも確実に反映)
        if memo.content != content:
            memo.content = content
        if memo.mode != mode:
            memo.mode = mode
        if hasattr(memo, "updated_at"):
            try:
                memo.updated_at = datetime.utcnow()
            except Exception:
                pass

        # AI マップ生成
        try:
            map_data = generate_map_from_text(content, mode=mode) or {}
        except Exception as e:
            logger.error("generate_map_from_text failed: %s", e)
            return {"error": "マップ生成に失敗しました"}, 500
        nodes = map_data.get("nodes", []) or []
        edges = map_data.get("edges", []) or []

        # KnowledgeMap: 既存があれば上書き、なければ作成
        km = KnowledgeMap.query.filter_by(memo_id=memo.id).first()
        if km is None:
            km = KnowledgeMap(memo_id=memo.id, nodes=nodes, edges=edges)
            db.session.add(km)
        else:
            km.nodes = nodes
            km.edges = edges

        # MapHistory(新バージョン)を追加
        latest = (
            MapHistory.query.filter_by(memo_id=memo.id)
            .order_by(MapHistory.version.desc())
            .first()
        )
        new_version = (latest.version + 1) if latest else 1
        db.session.add(MapHistory(
            memo_id=memo.id, version=new_version,
            nodes=nodes, edges=edges, action="create",
        ))

        db.session.commit()

        return {"memo": _memo_to_dict_safe(memo), "map": km.to_dict()}

    # ==========================================================
    # POST /api/memos/blank - 空のメモを作成
    # ==========================================================
    @app.post("/api/memos/blank")
    @token_required
    def create_blank_memo():
        user_id = g.current_user["user_db_id"]
        body = request.get_json(silent=True) or {}
        mode = body.get("mode", "reflection")
        if mode not in ("reflection", "research", "idea"):
            mode = "reflection"

        initial_title = (body.get("title") or "").strip()[:200]

        kwargs = dict(user_id=user_id, content="", mode=mode)
        if hasattr(Memo, "title"):
            kwargs["title"] = initial_title or "新しい振り返り"
        memo = Memo(**kwargs)
        db.session.add(memo)
        db.session.commit()

        # 空の KnowledgeMap も作成(PUT /api/maps/<id> が落ちないように)
        try:
            existing_map = KnowledgeMap.query.filter_by(memo_id=memo.id).first()
            if existing_map is None:
                km = KnowledgeMap(memo_id=memo.id, nodes=[], edges=[])
                db.session.add(km)
                db.session.commit()
        except Exception as e:
            logger.warning("blank map creation failed: %s", e)

        logger.info("blank memo created: id=%s user_id=%s", memo.id, user_id)
        return _memo_to_dict_safe(memo), 201


# ============================================================
# ヘルパー
# ============================================================

def _memo_to_summary_dict(memo) -> dict:
    content = memo.content or ""
    preview = content[:200]

    title = None
    if hasattr(memo, "title") and memo.title:
        title = memo.title
    if not title:
        title = (preview[:40] or f"Memo #{memo.id}")

    thumbnail_url = getattr(memo, "thumbnail_url", None)

    node_count = getattr(memo, "node_count", None)
    edge_count = getattr(memo, "edge_count", None)
    if node_count is None or edge_count is None:
        km = KnowledgeMap.query.filter_by(memo_id=memo.id).first()
        if km is not None:
            node_count = len(km.nodes or [])
            edge_count = len(km.edges or [])
        else:
            node_count = node_count or 0
            edge_count = edge_count or 0

    return {
        "id": memo.id,
        "title": title,
        "preview": preview,
        "mode": memo.mode,
        "thumbnail_url": thumbnail_url,
        "node_count": node_count or 0,
        "edge_count": edge_count or 0,
        "is_archived": bool(getattr(memo, "is_archived", False)),
        "created_at": memo.created_at.isoformat() if getattr(memo, "created_at", None) else None,
        "updated_at": (memo.updated_at.isoformat()
                       if getattr(memo, "updated_at", None) else
                       (memo.created_at.isoformat() if getattr(memo, "created_at", None) else None)),
    }


def _memo_to_dict_safe(memo) -> dict:
    base = {}
    if hasattr(memo, "to_dict"):
        try:
            base = memo.to_dict()
        except Exception:
            pass
    if not base:
        base = {
            "id": memo.id,
            "user_id": memo.user_id,
            "content": memo.content,
            "mode": memo.mode,
            "created_at": memo.created_at.isoformat() if getattr(memo, "created_at", None) else None,
        }
    base.update({
        "title": getattr(memo, "title", None),
        "thumbnail_url": getattr(memo, "thumbnail_url", None),
        "node_count": getattr(memo, "node_count", 0) or 0,
        "edge_count": getattr(memo, "edge_count", 0) or 0,
        "is_archived": bool(getattr(memo, "is_archived", False)),
        "updated_at": (memo.updated_at.isoformat()
                       if getattr(memo, "updated_at", None) else None),
    })
    return base