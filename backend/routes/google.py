import logging
from datetime import datetime
from flask import current_app

from services.google_auth import (
    verify_google_id_token,
    GoogleAuthError,
    is_google_login_enabled,
)

logger = logging.getLogger(__name__)
try:
    from services.google_auth import (
        verify_google_id_token,
        GoogleAuthError,
        is_google_login_enabled,
    )
    _GOOGLE_AVAILABLE = True
except ImportError:
    _GOOGLE_AVAILABLE = False

@bp.post("/auth/google")
def login_with_google():
    """Google ID Token を受け取り、ログイン or 新規ユーザー作成.

    リクエスト:  { "credential": "<google id token jwt>" }
    レスポンス: { "token": "<our jwt>", "user": {...} }
    """
    # 機能フラグ・ライブラリチェック
    if not current_app.config.get("FEATURE_GOOGLE_LOGIN", True):
        return {"error": "google_login_disabled"}, 404
    if not is_google_login_enabled():
        return {"error": "google_login_not_configured"}, 503

    body = request.get_json(silent=True) or {}
    credential = body.get("credential")
    if not credential:
        return {"error": "credential required"}, 400

    try:
        gpayload = verify_google_id_token(credential)
    except GoogleAuthError as e:
        logger.warning("google auth failed: %s", e)
        return {"error": "google_auth_failed", "detail": str(e)}, 401

    sub = gpayload["sub"]
    email = gpayload.get("email")
    name = gpayload.get("name")
    picture = gpayload.get("picture")

    # 1) google_sub で検索
    user = User.query.filter_by(google_sub=sub).first()

    # 2) 同 email の既存(legacy) ユーザーが居ればリンク
    if user is None and email:
        user = User.query.filter_by(email=email).first()

    # 3) 完全新規作成
    if user is None:
        user = User(
            user_id=f"g_{sub[:16]}",
            google_sub=sub,
            email=email,
            display_name=name,
            avatar_url=picture,
            auth_provider="google",
            is_admin=(email in current_app.config.get("ADMIN_EMAILS", set())),
        )
        db.session.add(user)
    else:
        # 既存ユーザーに Google アカウントをリンク・最新化
        user.google_sub = sub
        if email:
            user.email = email
        if name:
            user.display_name = name
        if picture:
            user.avatar_url = picture
        user.auth_provider = "google"
        # 管理者フラグの昇格は ADMIN_EMAILS にあるときのみ
        if email and email in current_app.config.get("ADMIN_EMAILS", set()):
            user.is_admin = True

    user.last_login_at = datetime.utcnow()
    db.session.commit()

    token = generate_token(user)
    return {"token": token, "user": user.to_dict()}