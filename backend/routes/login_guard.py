"""ログイン制御ガード (v3 追加).

既存の /api/login エンドポイントに **before_request フック** で介入し、
- ALLOW_DEMO_LOGIN=false ならデモユーザーログインを拒否
- ALLOW_LEGACY_LOGIN=false なら一般 ID ログインを拒否

する. 既存の auth.py には一切手を付けない.
"""
from __future__ import annotations

import logging

from flask import current_app, request

logger = logging.getLogger(__name__)


def register_login_guard(app):
    """既存の /api/login に介入するガードを設置."""

    @app.before_request
    def _guard_login_endpoint():
        # /api/login の POST のみ対象
        if request.path != "/api/login" or request.method != "POST":
            return None

        body = request.get_json(silent=True) or {}
        user_id = (body.get("user_id") or "").strip()
        if not user_id:
            return None  # 既存 auth.py 側でバリデーションさせる

        # デモユーザー判定
        demo_ids = _get_demo_user_ids(app)
        is_demo = user_id in demo_ids

        if is_demo:
            if not app.config.get("ALLOW_DEMO_LOGIN", True):
                logger.info("demo login rejected: user_id=%s", user_id)
                return ({
                    "error": "demo_login_disabled",
                    "message": "デモユーザーログインは現在無効です。"
                }, 403)
        else:
            if not app.config.get("ALLOW_LEGACY_LOGIN", True):
                logger.info("legacy login rejected: user_id=%s", user_id)
                return ({
                    "error": "legacy_login_disabled",
                    "message": "ID ログインは現在無効です。Google ログインをご利用ください。"
                }, 403)

        # 許可されている → 既存 auth.py の login() に処理を流す
        return None


def _get_demo_user_ids(app) -> set[str]:
    raw = app.config.get("DEMO_USER_IDS")
    if isinstance(raw, (set, list, tuple)):
        return set(raw)
    if isinstance(raw, str):
        return set(s.strip() for s in raw.split(",") if s.strip())
    return {"demo_user", "demo"}
