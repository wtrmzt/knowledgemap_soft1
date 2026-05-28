"""認証ルート（Supabase Google ログイン + 許可ユーザー制限版）.

既存の /api/login, /api/consent, /api/me はそのまま。
/api/auth/google:
  Supabase Auth(Google) の access_token を検証し、
  許可ユーザー（Config.ALLOWED_EMAILS / ALLOWED_EMAIL_DOMAINS）のみログイン可。
  許可された場合のみ User を作成 or 取得し、自前JWTを発行する。

※ 認証判定ヘルパー（resolve_is_admin / is_email_allowed）は config.py に定義済み。
"""
from datetime import datetime, timezone
from flask import request, jsonify, g
from sqlalchemy.exc import IntegrityError
from models import User, db
from auth import token_required, generate_token
from config import Config, resolve_is_admin, is_email_allowed
from supabase_auth import (
    verify_supabase_token,
    extract_identity,
    SupabaseTokenError,
)


def _find_existing_user(app_user_id, email, google_sub):
    """既存ユーザーを google_sub → email → user_id の順で探す。"""
    user = None
    if google_sub:
        user = User.query.filter_by(google_sub=google_sub).first()
    if user is None and email:
        user = User.query.filter_by(email=email).first()
    if user is None:
        user = User.query.filter_by(user_id=app_user_id).first()
    return user


def register_auth_routes(app):
    @app.post("/api/login")
    def login():
        body = request.get_json(silent=True) or {}
        user_id = (body.get("user_id") or "").strip()
        if not user_id:
            return {"error": "user_id required"}, 400

        # レガシーIDログインの可否（Config フラグを尊重）
        is_demo = user_id in Config.DEMO_USER_IDS
        if is_demo:
            if not Config.ALLOW_DEMO_LOGIN:
                return {"error": "demo login disabled"}, 403
        else:
            if not Config.ALLOW_LEGACY_LOGIN:
                return {"error": "legacy login disabled"}, 403

        user = User.query.filter_by(user_id=user_id).first()
        if user is None:
            user = User(
                user_id=user_id,
                is_admin=(user_id in Config.ADMIN_USER_IDS),
                auth_provider="legacy",
            )
            db.session.add(user)
            try:
                db.session.commit()
            except IntegrityError:
                # 同時リクエストで先に作られた場合は取り直す
                db.session.rollback()
                user = User.query.filter_by(user_id=user_id).first()
                if user is None:
                    raise

        token = generate_token(user)
        return {"token": token, "user": user.to_dict()}

    @app.post("/api/auth/google")
    def auth_google():
        """
        Supabase Auth(Google) のアクセストークンを受け取り検証。
        許可ユーザーのみ User を作成 or 取得し、自前アプリJWTを返す。

        リクエスト: { "access_token": "<supabase access token>" }
        レスポンス: { "token": "<app jwt>", "user": {...} }
        """
        body = request.get_json(silent=True) or {}
        access_token = body.get("access_token")
        if not access_token:
            return {"error": "access_token が必要です"}, 400

        # 1) Supabase トークンを検証
        try:
            claims = verify_supabase_token(access_token)
        except SupabaseTokenError as e:
            return {"error": f"認証に失敗しました: {e}"}, 401

        # 2) 本人情報を抽出
        identity = extract_identity(claims)
        app_user_id = identity["app_user_id"]
        email = identity["email"]
        google_sub = identity.get("supabase_uid")  # Supabase ユーザーUUID
        display_name = identity.get("name")

        # 3) 許可ユーザー判定（許可外は 403 で弾く）
        if not is_email_allowed(email):
            return {"error": "このアカウントはログインを許可されていません"}, 403

        now = datetime.now(timezone.utc)
        is_admin = resolve_is_admin(app_user_id, email)

        # 4) 既存ユーザーを取得（google_sub → email → user_id）
        user = _find_existing_user(app_user_id, email, google_sub)

        if user is None:
            # 新規作成。Googleユーザー用カラムを正しく埋める
            user = User(
                user_id=app_user_id,
                email=email,
                google_sub=google_sub,
                display_name=display_name,
                auth_provider="google",
                is_admin=is_admin,
                last_login_at=now,
            )
            db.session.add(user)
            try:
                db.session.commit()
            except IntegrityError:
                # 同時リクエストによる二重INSERTの競合 → rollback して取り直す
                db.session.rollback()
                user = _find_existing_user(app_user_id, email, google_sub)
                if user is None:
                    # それでも見つからなければ想定外。500ではなく明示エラー
                    return {"error": "ユーザー作成に失敗しました。再度お試しください"}, 409
                # 取り直したユーザーの情報を更新（下の else 相当）
                _update_google_user(user, email, google_sub, display_name, is_admin, now)
                db.session.commit()
        else:
            # 既存ユーザーの情報を最新化
            _update_google_user(user, email, google_sub, display_name, is_admin, now)
            db.session.commit()

        # 5) 自前JWTを発行
        token = generate_token(user)
        return {"token": token, "user": user.to_dict()}

    @app.post("/api/consent")
    @token_required
    def update_consent():
        body = request.get_json(silent=True) or {}
        consented = bool(body.get("consented", True))

        user_id = g.current_user["user_id"]
        user = User.query.filter_by(user_id=user_id).first()
        if user is None:
            return {"error": "user not found"}, 404

        user.consented = consented
        db.session.commit()
        return {"user": user.to_dict()}

    @app.get("/api/me")
    @token_required
    def get_me():
        user_id = g.current_user["user_id"]
        user = User.query.filter_by(user_id=user_id).first()
        if user is None:
            return {"error": "user not found"}, 404
        return user.to_dict()


def _update_google_user(user, email, google_sub, display_name, is_admin, now):
    """既存ユーザーに Google 情報を反映（未設定の項目を埋め、管理者判定を更新）。"""
    if email and not user.email:
        user.email = email
    if google_sub and not user.google_sub:
        user.google_sub = google_sub
    if display_name and not user.display_name:
        user.display_name = display_name
    # legacy で作られた行が Google ログインしてきたら provider を更新
    if user.auth_provider != "google":
        user.auth_provider = "google"
    user.is_admin = is_admin
    user.last_login_at = now