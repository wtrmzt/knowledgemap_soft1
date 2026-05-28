"""
JWT認証・認可モジュール（完全版）

既存の自前JWT（生成・検証・デコレータ）はそのまま。
変更点は resolve_is_admin() の追加のみ:
  Googleログインユーザーを「メールアドレス」でも管理者判定できるようにする。

※ お手元の auth.py が 5/21 以降の改修で本ファイルと差異がある場合は、
  下の resolve_is_admin() 関数と、Config をインポートしている前提だけを
  既存ファイルに移植してください（他は元のままでOK）。
"""
import jwt
from datetime import datetime, timezone
from functools import wraps
from flask import request, jsonify, g
from config import Config

# IDログイン時代からの管理者ID（温存）
ADMIN_USER_IDS = {"admin", "researcher", "admin_user"}


def generate_token(user):
    """JWTトークンを生成（24時間有効）"""
    payload = {
        "user_db_id": user.id,
        "user_id": user.user_id,
        "is_admin": user.is_admin,
        "exp": datetime.now(timezone.utc) + Config.JWT_EXPIRATION,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, Config.SECRET_KEY, algorithm="HS256")


def decode_token(token):
    """JWTトークンをデコード（無効・期限切れは None）"""
    try:
        return jwt.decode(token, Config.SECRET_KEY, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def is_admin_user_id(user_id: str) -> bool:
    """（旧）管理者ユーザーIDかどうかを判定。後方互換のため残す"""
    return user_id in ADMIN_USER_IDS


def resolve_is_admin(app_user_id: str, email: str | None = None) -> bool:
    """
    管理者かどうかを判定する（新）。
      - ADMIN_USER_IDS（IDログインの管理者）
      - Config.ADMIN_EMAILS（Googleログインの管理者メール）
    のいずれかに該当すれば True。

    Googleログインでは app_user_id にメールが入る運用なので、
    app_user_id 自体がメールのケースもカバーする。
    """
    if app_user_id in ADMIN_USER_IDS:
        return True
    admin_emails = getattr(Config, "ADMIN_EMAILS", set())
    if email and email.lower() in admin_emails:
        return True
    if app_user_id and app_user_id.lower() in admin_emails:
        return True
    return False


def token_required(f):
    """JWT認証デコレータ。g.current_user にペイロードを格納"""
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "認証トークンが必要です"}), 401

        token = auth_header.split(" ", 1)[1]
        payload = decode_token(token)
        if payload is None:
            return jsonify({"error": "トークンが無効または期限切れです"}), 401

        g.current_user = payload
        return f(*args, **kwargs)

    return decorated


def admin_required(f):
    """管理者専用デコレータ。token_required + is_admin チェック"""
    @wraps(f)
    @token_required
    def decorated(*args, **kwargs):
        if not g.current_user.get("is_admin"):
            return jsonify({"error": "管理者権限が必要です"}), 403
        return f(*args, **kwargs)

    return decorated