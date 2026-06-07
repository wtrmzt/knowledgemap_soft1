"""認証ルート（事前登録ユーザー + パスワードログイン版）.

【方針】
- ログインは「ID + パスワード」を主方式とする。
- 事前に seed_users.py で登録され、password_hash を持つユーザーのみログイン可。
  未知の ID は自動作成しない（= 許可リスト方式）。
- 既存の Google ログイン（/api/auth/google）はコードを残すが
  Config.FEATURE_GOOGLE_LOGIN=false の間は 403 で停止する。
- デモ / レガシー(ID-only 自動作成) は Config フラグ次第（既定 OFF）。

【セキュリティ対策】
- パスワードは werkzeug のハッシュで検証（平文比較しない）。
- ユーザー列挙対策: 「IDが無い / パスワード無し設定 / パスワード不一致」を
  すべて同一の汎用エラー + 同等の処理時間（ダミーハッシュ照合）で返す。
- ブルートフォース対策: (user_id, IP) 単位で失敗回数を数え、
  しきい値超過で一定時間ロック（429）。
"""
import time
import threading
from datetime import datetime, timezone

from flask import request, jsonify, g
from sqlalchemy.exc import IntegrityError
from werkzeug.security import check_password_hash, generate_password_hash

from models import User, db
from auth import token_required, generate_token
from config import Config, resolve_is_admin, is_email_allowed

# Google ログインは温存（FEATURE_GOOGLE_LOGIN=false なら停止）。
# supabase_auth が無い環境でも他ルートが動くよう、import 失敗は握りつぶす。
try:
    from supabase_auth import (
        verify_supabase_token,
        extract_identity,
        SupabaseTokenError,
    )
    _SUPABASE_AVAILABLE = True
except Exception:  # pragma: no cover
    _SUPABASE_AVAILABLE = False


# 汎用ログインエラー（ID の有無を漏らさない）
_GENERIC_LOGIN_ERROR = "ユーザーIDまたはパスワードが正しくありません"

# タイミング差で ID 存在を推測されないためのダミーハッシュ（プロセス起動時に1回生成）
_DUMMY_PASSWORD_HASH = generate_password_hash("timing-attack-dummy-password")


# ---------------------------------------------------------------------------
# ログイン試行回数ロック（プロセス内メモリ実装）
#   ※ gunicorn 複数 worker では worker ごとに独立する点に注意。
#     本番で厳密にやる場合は Redis 実装に差し替え推奨（README 参照）。
# ---------------------------------------------------------------------------
_attempt_lock = threading.Lock()
_attempts: dict[str, dict] = {}  # key -> {"fails": int, "last": float, "lock_until": float}


def _client_ip() -> str:
    fwd = request.headers.get("X-Forwarded-For", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.remote_addr or "unknown"


def _attempt_key(user_id: str) -> str:
    return f"{user_id}|{_client_ip()}"


def _is_locked(key: str) -> bool:
    now = time.time()
    with _attempt_lock:
        rec = _attempts.get(key)
        if not rec:
            return False
        return rec.get("lock_until", 0) > now


def _record_failure(key: str) -> None:
    now = time.time()
    window = Config.LOGIN_ATTEMPT_WINDOW_SECONDS
    max_fails = Config.LOGIN_MAX_FAILED_ATTEMPTS
    lockout = Config.LOGIN_LOCKOUT_SECONDS
    with _attempt_lock:
        rec = _attempts.get(key)
        if not rec or (now - rec.get("last", 0)) > window:
            rec = {"fails": 0, "last": now, "lock_until": 0}
        rec["fails"] += 1
        rec["last"] = now
        if rec["fails"] >= max_fails:
            rec["lock_until"] = now + lockout
            rec["fails"] = 0  # ロック後はカウンタをリセット
        _attempts[key] = rec


def _clear_attempts(key: str) -> None:
    with _attempt_lock:
        _attempts.pop(key, None)


# ---------------------------------------------------------------------------
def register_auth_routes(app):

    @app.get("/api/auth/config")
    def auth_config():
        """フロントにログイン方式を伝える（ボタンの出し分けに使用）。"""
        return {
            "password_login_enabled": Config.ALLOW_PASSWORD_LOGIN,
            "demo_login_enabled": Config.ALLOW_DEMO_LOGIN,
            "legacy_login_enabled": Config.ALLOW_LEGACY_LOGIN,
            "google_login_enabled": (
                Config.FEATURE_GOOGLE_LOGIN
                and _SUPABASE_AVAILABLE
                and bool(Config.SUPABASE_PROJECT_URL)
            ),
        }

    @app.post("/api/login")
    def login():
        body = request.get_json(silent=True) or {}
        user_id = (body.get("user_id") or "").strip()
        password = body.get("password") or ""

        if not user_id:
            return {"error": "user_id required"}, 400

        key = _attempt_key(user_id)
        if _is_locked(key):
            return {
                "error": "ログイン試行回数が上限に達しました。しばらくしてから再度お試しください。"
            }, 429

        # --- デモユーザー（フラグ ON のときのみ。パスワード不要）---
        if user_id in Config.DEMO_USER_IDS:
            if not Config.ALLOW_DEMO_LOGIN:
                return {"error": _GENERIC_LOGIN_ERROR}, 403
            user = _get_or_create_simple_user(user_id, auth_provider="demo")
            token = generate_token(user)
            _clear_attempts(key)
            return {"token": token, "user": user.to_dict()}

        # --- パスワードログイン（主方式・許可リスト方式）---
        if Config.ALLOW_PASSWORD_LOGIN:
            user = User.query.filter_by(user_id=user_id).first()

            # ID が存在しない / パスワード未設定 / 不一致 を区別せず汎用エラー。
            # いずれの経路でも必ずハッシュ照合を1回行い、処理時間を均一化する。
            if user is None or not getattr(user, "password_hash", None):
                check_password_hash(_DUMMY_PASSWORD_HASH, password)  # ダミー照合
                _record_failure(key)
                return {"error": _GENERIC_LOGIN_ERROR}, 401

            if not password or not check_password_hash(user.password_hash, password):
                _record_failure(key)
                return {"error": _GENERIC_LOGIN_ERROR}, 401

            # 認証成功
            _clear_attempts(key)
            user.last_login_at = datetime.now(timezone.utc)
            db.session.commit()
            token = generate_token(user)
            return {"token": token, "user": user.to_dict()}

        # --- レガシー ID-only ログイン（明示的に有効化した場合のみ）---
        if Config.ALLOW_LEGACY_LOGIN:
            user = _get_or_create_simple_user(user_id, auth_provider="legacy")
            token = generate_token(user)
            _clear_attempts(key)
            return {"token": token, "user": user.to_dict()}

        return {"error": "ログインが無効化されています"}, 403

    @app.post("/api/auth/google")
    def auth_google():
        """Supabase Auth(Google) のアクセストークン交換（既定では停止）。"""
        if not Config.FEATURE_GOOGLE_LOGIN:
            return {"error": "Googleログインは現在無効です"}, 403
        if not _SUPABASE_AVAILABLE:
            return {"error": "Google認証モジュールが利用できません"}, 503

        body = request.get_json(silent=True) or {}
        access_token = body.get("access_token")
        if not access_token:
            return {"error": "access_token が必要です"}, 400

        try:
            claims = verify_supabase_token(access_token)
        except SupabaseTokenError as e:
            return {"error": f"認証に失敗しました: {e}"}, 401

        identity = extract_identity(claims)
        app_user_id = identity["app_user_id"]
        email = identity["email"]
        google_sub = identity.get("supabase_uid")
        display_name = identity.get("name")

        if not is_email_allowed(email):
            return {"error": "このアカウントはログインを許可されていません"}, 403

        now = datetime.now(timezone.utc)
        is_admin = resolve_is_admin(app_user_id, email)
        user = _find_existing_user(app_user_id, email, google_sub)

        if user is None:
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
                db.session.rollback()
                user = _find_existing_user(app_user_id, email, google_sub)
                if user is None:
                    return {"error": "ユーザー作成に失敗しました。再度お試しください"}, 409
                _update_google_user(user, email, google_sub, display_name, is_admin, now)
                db.session.commit()
        else:
            _update_google_user(user, email, google_sub, display_name, is_admin, now)
            db.session.commit()

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


# ---------------------------------------------------------------------------
# ヘルパー
# ---------------------------------------------------------------------------
def _get_or_create_simple_user(user_id: str, auth_provider: str) -> User:
    """デモ/レガシー用: パスワード無しのユーザーを取得 or 作成。"""
    user = User.query.filter_by(user_id=user_id).first()
    if user is None:
        user = User(
            user_id=user_id,
            is_admin=(user_id in Config.ADMIN_USER_IDS),
            auth_provider=auth_provider,
        )
        db.session.add(user)
        try:
            db.session.commit()
        except IntegrityError:
            db.session.rollback()
            user = User.query.filter_by(user_id=user_id).first()
            if user is None:
                raise
    return user


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


def _update_google_user(user, email, google_sub, display_name, is_admin, now):
    if email and not user.email:
        user.email = email
    if google_sub and not user.google_sub:
        user.google_sub = google_sub
    if display_name and not user.display_name:
        user.display_name = display_name
    if user.auth_provider != "google":
        user.auth_provider = "google"
    user.is_admin = is_admin
    user.last_login_at = now