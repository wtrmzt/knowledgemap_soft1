"""
アプリケーション設定モジュール
環境変数から設定を読み込み、デフォルト値を提供する

【v3 変更点】
- 既存設定はすべて保持
- Redis / Google ログイン / レート制限 / サムネイル用設定を追加(全て optional)
- 既存の `from_object(Config)` で読み込まれる挙動を維持

【今回の変更点】
- ALLOWED_EMAILS / ALLOWED_EMAIL_DOMAINS を追加（ログイン許可ユーザー制限）
- resolve_is_admin() を整理（モジュールレベルで Config を参照する形に統一）
- 末尾の重複モジュールレベル定義（デッドコード）を削除
"""
import os
from datetime import timedelta
from dotenv import load_dotenv
load_dotenv()  # ← これを追加(import osより前でもOK)

BASE_DIR = os.path.abspath(os.path.dirname(__file__))


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
        # Windows のバックスラッシュは / に正規化（SQLite URI 用）
        return "sqlite:///" + db_path.replace("\\", "/")

    # ★ from_object() で読み込まれるよう、クラス属性として SQLALCHEMY_DATABASE_URI を定義
    SQLALCHEMY_DATABASE_URI = None  # __init_subclass__ より前に定義が必要なのでプレースホルダ

    # ★ 追加: コネクションプールの安定化 ★(既存設定そのまま)
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,   # 接続使用前に生存確認(SELECT 1)
        "pool_recycle": 280,     # 280秒ごとに接続をリサイクル(Render の切断より短く)
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
    # ▼▼▼ v3 で追加した設定(すべて optional)▼▼▼
    # ===========================================================

    # --- Redis (任意。未設定なら in-memory フォールバック) ---
    REDIS_URL = os.environ.get("REDIS_URL", "")  # 例: "redis://localhost:6379/0"

    # --- OpenAI レート制限(100名同時接続時の保護)---
    OPENAI_RPM_LIMIT = int(os.environ.get("OPENAI_RPM_LIMIT", "800"))
    OPENAI_TPM_LIMIT = int(os.environ.get("OPENAI_TPM_LIMIT", "160000"))

    # detect_topics 等のキャッシュ TTL(秒)
    OPENAI_CACHE_TTL = int(os.environ.get("OPENAI_CACHE_TTL", "60"))

    # ===========================================================
    # ▼▼▼ Supabase Auth + 認証制御 ▼▼▼
    # ===========================================================

    # --- Supabase Auth（Google ログイン用） ---
    # 例: https://klinnkfmoymowkilozzh.supabase.co
    SUPABASE_PROJECT_URL = os.environ.get("SUPABASE_PROJECT_URL", "")
    # レガシー HS256 検証を使う場合のみ設定（ダッシュボードの JWT Secret）
    SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET", "")

    # --- Google ログイン(旧 @react-oauth/google 用。任意) ---
    GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
    # 教育機関ドメイン制限(例: "uec.ac.jp"). 空なら制限なし（旧実装の名残）
    GOOGLE_ALLOWED_HD = os.environ.get("GOOGLE_ALLOWED_HD", "") or None

    # --- ★ログインを許可するメール（許可ユーザー制限）---
    # 空のとき: 全ユーザー許可（現状の挙動）
    # 設定時: このリストにあるメールのみログイン可。それ以外は 403
    ALLOWED_EMAILS = set(
        e.strip().lower() for e in os.environ.get("ALLOWED_EMAILS", "").split(",") if e.strip()
    )
    # --- ★ドメイン単位で許可（任意。ALLOWED_EMAILS と併用可）---
    # 例: "uec.ac.jp,edu.cc.uec.ac.jp"。@ は付けても付けなくても可。空なら無効。
    ALLOWED_EMAIL_DOMAINS = set(
        d.strip().lower().lstrip("@") for d in os.environ.get("ALLOWED_EMAIL_DOMAINS", "").split(",") if d.strip()
    )

    # --- 管理者にするメール(カンマ区切り) ---
    # 大文字小文字を無視して比較するため lower() で正規化
    ADMIN_EMAILS = set(
        e.strip().lower() for e in os.environ.get("ADMIN_EMAILS", "").split(",") if e.strip()
    )

    # --- デモユーザーログイン ---
    ALLOW_DEMO_LOGIN = os.environ.get("ALLOW_DEMO_LOGIN", "true").lower() == "true"
    DEMO_USER_IDS = set(
        s.strip() for s in os.environ.get("DEMO_USER_IDS", "demo_user,demo").split(",")
        if s.strip()
    )

    # --- 任意 ID ログイン(レガシー) ---
    ALLOW_LEGACY_LOGIN = os.environ.get("ALLOW_LEGACY_LOGIN", "true").lower() == "true"

    # --- 管理者扱いする ID リスト(レガシー互換) ---
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
    FEATURE_GOOGLE_LOGIN = os.environ.get("FEATURE_GOOGLE_LOGIN", "true").lower() == "true"
    FEATURE_MAPS_LIST = os.environ.get("FEATURE_MAPS_LIST", "true").lower() == "true"
    FEATURE_EVENT_LOG = os.environ.get("FEATURE_EVENT_LOG", "true").lower() == "true"
    FEATURE_RATE_LIMIT = os.environ.get("FEATURE_RATE_LIMIT", "true").lower() == "true"


# ★ Config クラス定義完了後に SQLALCHEMY_DATABASE_URI を実際の値で上書き
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
    # app_user_id 自体がメール（Googleログイン）の場合にも対応
    if app_user_id and app_user_id.lower() in Config.ADMIN_EMAILS:
        return True
    return False


def is_email_allowed(email: str | None) -> bool:
    """
    ログインを許可するメールかどうか判定する。
      - ALLOWED_EMAILS / ALLOWED_EMAIL_DOMAINS が両方空 → 全員許可（現状維持）
      - どちらか設定あり → メール または ドメイン が一致すれば許可
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