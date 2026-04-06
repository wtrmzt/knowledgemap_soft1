"""
JWT認証・認可モジュール
トークン生成・検証・デコレータを提供
"""
import jwt
from datetime import datetime, timezone
from functools import wraps
from flask import request, jsonify, g
from config import Config

ADMIN_USER_IDS = {"admin", "researcher", "admin_user"}


def generate_token(user):
    """JWTトークンを生成"""
    payload = {
        "user_db_id": user.id,
        "user_id": user.user_id,
        "is_admin": user.is_admin,
        "exp": datetime.now(timezone.utc) + Config.JWT_EXPIRATION,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, Config.SECRET_KEY, algorithm="HS256")


def decode_token(token):
    """JWTトークンをデコード"""
    try:
        return jwt.decode(token, Config.SECRET_KEY, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def is_admin_user_id(user_id: str) -> bool:
    """管理者ユーザーIDかどうかを判定"""
    return user_id in ADMIN_USER_IDS


def token_required(f):
    """JWT認証デコレータ"""
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
    """管理者権限デコレータ"""
    @wraps(f)
    @token_required
    def decorated(*args, **kwargs):
        if not g.current_user.get("is_admin", False):
            return jsonify({"error": "管理者権限が必要です"}), 403
        return f(*args, **kwargs)
    return decorated
