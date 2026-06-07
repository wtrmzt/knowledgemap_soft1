"""
アプリケーション設定モジュール
環境変数から設定を読み込み、デフォルト値を提供する

【v3 変更点】
- 既存設定はすべて保持
- Redis / Google ログイン / レート制限 / サムネイル用設定を追加(全て optional)
- 既存の `from_object(Config)` で読み込まれる挙動を維持

【今回の変更点（許可ユーザー + パスワードログイン化）】
- ALLOW_PASSWORD_LOGIN を追加（ID + パスワードでのログインを主方式に）
- 既定値をセキュアに変更:
    ALLOW_DEMO_LOGIN  : true  -> false
    ALLOW_LEGACY_LOGIN: true  -> false   （ID のみの自動作成ログインを無効化）
    FEATURE_GOOGLE_LOGIN: true -> false  （コードは残すがフラグで停止）
- ログイン試行回数ロック（ブルートフォース対策）の設定を追加
- ALLOWED_EMAILS / ALLOWED_EMAIL_DOMAINS は Google 用として温存（パスワード方式では未使用）
"""
import os
from datetime import timedelta
from dotenv import load_dotenv
load_dotenv()

BASE_DIR = os.path.abspath(os.path.dirname(__file__))


def _as_bool(value: str, default: bool = False) -> bool:
    if value is None or value == "":
        return default
    return str(value).strip().lower() in ("1", "true", "yes", "on")


class Config:
    """基本設定"""
    # ===== 既存設定(変更なし) =====
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-key-change-in-production")
    JWT_EXPIRATION = timedelta(hours=24)
    OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
    OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4")
    OPENAI_EMBEDDING_MODEL = os.environ.get("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")

    # CORS
    CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")

    # Database
    DATABASE_URL = os.environ.get("DATABASE_URL", "")
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    @staticmethod
    def get_database_uri():
        url = os.environ.get("DATABASE_URL", "").strip()

        # 本番(PostgreSQL等)が指定されていればそのまま使う
        if url and not url.startswith("sqlite"):
            return url

        # SQLite: instance/ を絶対パスで解決し、無ければ作成する
        instance_dir = os.path.join(BASE_DIR, "instance")
        os.makedirs(instance_dir, exist_ok=True)
        db_path = os.path.join(instance_dir, "local.db")
        return "sqlite:///" + db_path.replace("\\", "/")

    SQLALCHEMY_DATABASE_URI = None  # 後段で実値を設定

    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
        "pool_recycle": 280,
        "pool_size": int(os.environ.get("DB_POOL_SIZE", "5")),
        "max_overflow": int(os.environ.get("DB_MAX_OVERFLOW", "10")),
    }

    # --- 関連科目推薦(Phase 2)--- (既存設定そのまま)
    PRECOMPUTED_DATA_PATH = os.environ.get(
        'PRECOMPUTED_DATA_PATH',
        os.path.join(os.path.dirname(__file__), 'precompute', 'precomputed_data.pkl')
    )
    USE_LIGHTWEIGHT_RELATION = os.environ.get('USE_LIGHTWEIGHT_RELATION', 'true')
    FALLBACK_HEAVY_RELATION = os.environ.get('FALLBACK_HEAVY_RELATION', 'true')

    # ===========================================================
    # v3 追加（すべて optional）
    # ===========================================================
    REDIS_URL = os.environ.get("REDIS_URL", "")
    OPENAI_RPM_LIMIT = int(os.environ.get("OPENAI_RPM_LIMIT", "800"))
    OPENAI_TPM_LIMIT = int(os.environ.get("OPENAI_TPM_LIMIT", "160000"))
    OPENAI_CACHE_TTL = int(os.environ.get("OPENAI_CACHE_TTL", "60"))

    # --- Supabase Auth（Google ログイン用。今回は既定OFF）---
    SUPABASE_PROJECT_URL = os.environ.get("SUPABASE_PROJECT_URL", "")
    SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET", "")

    GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
    GOOGLE_ALLOWED_HD = os.environ.get("GOOGLE_ALLOWED_HD", "") or None

    # --- Google ログイン用の許可メール（パスワード方式では未使用・温存）---
    ALLOWED_EMAILS = set(
        e.strip().lower() for e in os.environ.get("ALLOWED_EMAILS", "").split(",") if e.strip()
    )
    ALLOWED_EMAIL_DOMAINS = set(
        d.strip().lower().lstrip("@") for d in os.environ.get("ALLOWED_EMAIL_DOMAINS", "").split(",") if d.strip()
    )
    ADMIN_EMAILS = set(
        e.strip().lower() for e in os.environ.get("ADMIN_EMAILS", "").split(",") if e.strip()
    )

    # ===========================================================
    # ▼▼▼ ログイン方式の制御（今回の主変更） ▼▼▼
    # ===========================================================

    # --- ★ パスワードログイン（ID + パスワード）= 主方式 ---
    # 事前登録（seed_users.py）したユーザーのみログイン可。未知IDは自動作成しない。
    ALLOW_PASSWORD_LOGIN = _as_bool(os.environ.get("ALLOW_PASSWORD_LOGIN"), True)

    # --- ログイン試行回数ロック（ブルートフォース対策）---
    LOGIN_MAX_FAILED_ATTEMPTS = int(os.environ.get("LOGIN_MAX_FAILED_ATTEMPTS", "5"))
    LOGIN_LOCKOUT_SECONDS = int(os.environ.get("LOGIN_LOCKOUT_SECONDS", "300"))      # 5分ロック
    LOGIN_ATTEMPT_WINDOW_SECONDS = int(os.environ.get("LOGIN_ATTEMPT_WINDOW_SECONDS", "300"))

    # --- デモユーザーログイン（既定 OFF）---
    ALLOW_DEMO_LOGIN = _as_bool(os.environ.get("ALLOW_DEMO_LOGIN"), False)
    DEMO_USER_IDS = set(
        s.strip() for s in os.environ.get("DEMO_USER_IDS", "demo_user,demo").split(",")
        if s.strip()
    )

    # --- レガシー ID-only ログイン（パスワード無しの自動作成。既定 OFF）---
    # ALLOW_PASSWORD_LOGIN=true の間は使用されない（パスワード方式が優先）。
    ALLOW_LEGACY_LOGIN = _as_bool(os.environ.get("ALLOW_LEGACY_LOGIN"), False)

    # --- 管理者扱いする ID リスト ---
    ADMIN_USER_IDS = set(
        s.strip() for s in os.environ.get("ADMIN_USER_IDS", "admin,researcher,admin_user").split(",")
        if s.strip()
    )

    # --- マップサムネイル(任意) ---
    THUMBNAIL_DIR = os.environ.get(
        "THUMBNAIL_DIR",
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "instance", "thumbnails"),
    )
    THUMBNAIL_PUBLIC_BASE_URL = os.environ.get(
        "THUMBNAIL_PUBLIC_BASE_URL", "/static/thumbnails"
    )

    # --- 機能フラグ ---
    # ★ Google ログインは既定 OFF（コードは残す。env で true にすれば復活）
    FEATURE_GOOGLE_LOGIN = _as_bool(os.environ.get("FEATURE_GOOGLE_LOGIN"), False)
    FEATURE_MAPS_LIST = _as_bool(os.environ.get("FEATURE_MAPS_LIST"), True)
    FEATURE_EVENT_LOG = _as_bool(os.environ.get("FEATURE_EVENT_LOG"), True)
    FEATURE_RATE_LIMIT = _as_bool(os.environ.get("FEATURE_RATE_LIMIT"), True)


Config.SQLALCHEMY_DATABASE_URI = Config.get_database_uri()


class DevelopmentConfig(Config):
    DEBUG = True


class ProductionConfig(Config):
    DEBUG = False


def resolve_is_admin(app_user_id: str, email: str | None = None) -> bool:
    """
    管理者かどうかを判定する。
      - Config.ADMIN_USER_IDS（IDログインの管理者）
      - Config.ADMIN_EMAILS（Googleログインの管理者メール）
    のいずれかに該当すれば True。
    """
    if app_user_id in Config.ADMIN_USER_IDS:
        return True
    if email and email.lower() in Config.ADMIN_EMAILS:
        return True
    if app_user_id and app_user_id.lower() in Config.ADMIN_EMAILS:
        return True
    return False


def is_email_allowed(email: str | None) -> bool:
    """
    （Google ログイン用）ログインを許可するメールかどうか判定する。
    パスワード方式では使用しないが、Google を再有効化した時のために温存。
    """
    allowed_emails = Config.ALLOWED_EMAILS
    allowed_domains = Config.ALLOWED_EMAIL_DOMAINS

    if not allowed_emails and not allowed_domains:
        return True
    if not email:
        return False
    email = email.lower()
    if email in allowed_emails:
        return True
    domain = email.split("@")[-1] if "@" in email else ""
    if domain and domain in allowed_domains:
        return True
    return False


def get_config():
    env = os.environ.get("FLASK_ENV", "development")
    if env == "production":
        return ProductionConfig()
    return DevelopmentConfig()