"""v3 追加の認証関連ルート.

既存の routes/auth.py には一切手を付けず、別ファイルとして並走させる.
このファイルは routes/__init__.py から register_auth_v3_routes(app) として呼ばれる.

提供エンドポイント:
- GET  /api/auth/config   フロントエンドへ機能フラグを返す
- POST /api/auth/google   Google ログイン

機能フラグ (config.py の Config クラスで定義):
- ALLOW_DEMO_LOGIN     : デモユーザーログインを許可するか
- ALLOW_LEGACY_LOGIN   : 任意 ID ログインを許可するか
- GOOGLE_CLIENT_ID     : Google ログイン用 Client ID
- GOOGLE_ALLOWED_HD    : Google Workspace ドメイン制限(任意)
- ADMIN_EMAILS         : 管理者として扱うメール(set)
- DEMO_USER_IDS        : デモユーザーとして扱う ID リスト(set)
"""
from __future__ import annotations

import logging
from datetime import datetime

from flask import current_app, request

from models import User, db

logger = logging.getLogger(__name__)


def register_auth_v3_routes(app):
    """既存の routes/__init__.py から呼ばれる関数."""

    # ----------------------------------------------------------
    # GET /api/auth/config - フロントへ機能フラグを通知
    # ----------------------------------------------------------
    @app.get("/api/auth/config")
    def auth_config_v3():
        google_enabled = (
            bool(current_app.config.get("GOOGLE_CLIENT_ID"))
            and current_app.config.get("FEATURE_GOOGLE_LOGIN", True)
        )
        return {
            "google_login_enabled": google_enabled,
            "demo_login_enabled": bool(current_app.config.get("ALLOW_DEMO_LOGIN", True)),
            "legacy_login_enabled": bool(current_app.config.get("ALLOW_LEGACY_LOGIN", True)),
            "google_client_id": current_app.config.get("GOOGLE_CLIENT_ID") or None,
        }

    # ----------------------------------------------------------
    # POST /api/auth/google
    # ----------------------------------------------------------
    @app.post("/api/auth/google")
    def login_with_google_v3():
        if not current_app.config.get("FEATURE_GOOGLE_LOGIN", True):
            return {"error": "google_login_disabled"}, 404
        if not current_app.config.get("GOOGLE_CLIENT_ID"):
            return {"error": "google_login_not_configured"}, 503

        body = request.get_json(silent=True) or {}
        credential = body.get("credential")
        if not credential:
            return {"error": "credential required"}, 400

        # google_auth モジュールを遅延 import
        try:
            from services.google_auth import verify_google_id_token, GoogleAuthError
        except ImportError as e:
            logger.error("google_auth module not available: %s", e)
            return {"error": "google_auth_module_missing"}, 503

        try:
            gpayload = verify_google_id_token(credential)
        except GoogleAuthError as e:
            logger.warning("google auth failed: %s", e)
            return {"error": "google_auth_failed", "detail": str(e)}, 401

        sub = gpayload["sub"]
        email = gpayload.get("email")
        name = gpayload.get("name")
        picture = gpayload.get("picture")

        # 検索順: google_sub → email → 新規作成
        user = User.query.filter_by(google_sub=sub).first()
        if user is None and email:
            user = User.query.filter_by(email=email).first()

        admin_emails = current_app.config.get("ADMIN_EMAILS", set())

        if user is None:
            # 新規作成
            user = User(
                user_id=f"g_{sub[:16]}",
                google_sub=sub,
                email=email,
                display_name=name,
                avatar_url=picture,
                auth_provider="google",
                is_admin=(email in admin_emails) if email else False,
            )
            db.session.add(user)
        else:
            # 既存ユーザーに Google アカウントをリンク
            user.google_sub = sub
            if email:
                user.email = email
            if name:
                user.display_name = name
            if picture:
                user.avatar_url = picture
            user.auth_provider = "google"
            if email and email in admin_emails:
                user.is_admin = True

        try:
            user.last_login_at = datetime.utcnow()
        except Exception:
            pass

        db.session.commit()

        # generate_token は既存 auth.py から import
        from auth import generate_token
        token = generate_token(user)
        return {"token": token, "user": _user_to_dict_safe(user)}


def _user_to_dict_safe(user) -> dict:
    """to_dict() が新フィールドを返さない可能性に備えた安全版."""
    base = {}
    # 既存 to_dict() があればそれを使う
    if hasattr(user, "to_dict"):
        try:
            base = user.to_dict()
        except Exception:
            pass
    # 新フィールドを安全に追加
    base.update({
        "email": getattr(user, "email", None),
        "display_name": getattr(user, "display_name", None),
        "avatar_url": getattr(user, "avatar_url", None),
        "auth_provider": getattr(user, "auth_provider", None) or "legacy",
    })
    return base
