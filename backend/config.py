"""
アプリケーション設定モジュール
環境変数から設定を読み込み、デフォルト値を提供する

【v3 変更点】
- 既存設定はすべて保持
- Redis / Google ログイン / レート制限 / サムネイル用設定を追加(全て optional)
- 既存の `from_object(Config)` で読み込まれる挙動を維持
"""
import os
from datetime import timedelta
from dotenv import load_dotenv
load_dotenv()  # ← これを追加(import osより前でもOK)


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
        db_url = Config.DATABASE_URL
        if db_url:
            # Render PostgreSQL の postgres:// を postgresql:// に変換
            if db_url.startswith("postgres://"):
                db_url = db_url.replace("postgres://", "postgresql://", 1)
            return db_url
        # フォールバック: SQLite(絶対パスを使用し、ディレクトリを自動作成)
        base_dir = os.path.abspath(os.path.dirname(__file__))
        instance_dir = os.path.join(base_dir, "instance")
        os.makedirs(instance_dir, exist_ok=True)
        return f"sqlite:///{os.path.join(instance_dir, 'app.db')}"

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
    # ▼▼▼ ここから v3 で追加する設定(すべて optional)▼▼▼
    # ===========================================================

    # --- Redis (任意。未設定なら in-memory フォールバック) ---
    # `OpenAIRateLimiter` `OpenAIResultCache` の永続化ストレージ
    REDIS_URL = os.environ.get("REDIS_URL", "")  # 例: "redis://localhost:6379/0"

    # --- OpenAI レート制限(100名同時接続時の保護)---
    # OpenAI Tier1 / gpt-4o-mini のデフォルト上限の 80% を目安に設定
    OPENAI_RPM_LIMIT = int(os.environ.get("OPENAI_RPM_LIMIT", "800"))
    OPENAI_TPM_LIMIT = int(os.environ.get("OPENAI_TPM_LIMIT", "160000"))

    # detect_topics 等のキャッシュ TTL(秒)
    OPENAI_CACHE_TTL = int(os.environ.get("OPENAI_CACHE_TTL", "60"))

    # --- Google ログイン(任意。未設定ならエンドポイント自体が無効)---
    GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
    # 教育機関ドメイン制限(例: "uec.ac.jp"). 空なら制限なし
    GOOGLE_ALLOWED_HD = os.environ.get("GOOGLE_ALLOWED_HD", "") or None
    # メールアドレスベースの管理者指定(カンマ区切り)
    ADMIN_EMAILS = set(
        e.strip() for e in os.environ.get("ADMIN_EMAILS", "").split(",") if e.strip()
    )

    # --- デモユーザーログイン ---
    # True : LoginPage の「デモユーザーで開始」ボタンが有効
    # False: ボタンを非表示にし、サーバ側でも拒否(403)
    ALLOW_DEMO_LOGIN = os.environ.get("ALLOW_DEMO_LOGIN", "true").lower() == "true"

    # デモユーザー扱いする ID リスト(カンマ区切り)
    # ここに含まれる ID は ALLOW_DEMO_LOGIN フラグの対象
    DEMO_USER_IDS = set(
        s.strip() for s in os.environ.get("DEMO_USER_IDS", "demo_user,demo").split(",")
        if s.strip()
    )

    # --- 任意 ID ログイン(レガシー) ---
    # True : 任意の文字列でログイン可能(従来挙動)
    # False: Google ログインのみ許可
    ALLOW_LEGACY_LOGIN = os.environ.get("ALLOW_LEGACY_LOGIN", "true").lower() == "true"

    # --- 管理者扱いする ID リスト(レガシー互換)---
    ADMIN_USER_IDS = set(
        s.strip() for s in os.environ.get("ADMIN_USER_IDS", "admin,researcher,admin_user").split(",")
        if s.strip()
    )
    # --- マップサムネイル(任意)---
    # ローカル fs に保存(本番は S3/R2 への切替を推奨)
    THUMBNAIL_DIR = os.environ.get(
        "THUMBNAIL_DIR",
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "instance", "thumbnails"),
    )
    # フロントから参照する公開 URL のベース
    THUMBNAIL_PUBLIC_BASE_URL = os.environ.get(
        "THUMBNAIL_PUBLIC_BASE_URL", "/static/thumbnails"
    )

    # --- 機能フラグ(問題発生時に環境変数で個別停止できるように)---
    FEATURE_GOOGLE_LOGIN = os.environ.get("FEATURE_GOOGLE_LOGIN", "true").lower() == "true"
    FEATURE_MAPS_LIST = os.environ.get("FEATURE_MAPS_LIST", "true").lower() == "true"
    FEATURE_EVENT_LOG = os.environ.get("FEATURE_EVENT_LOG", "true").lower() == "true"
    FEATURE_RATE_LIMIT = os.environ.get("FEATURE_RATE_LIMIT", "true").lower() == "true"


# ★ Config クラス定義完了後に SQLALCHEMY_DATABASE_URI を実際の値で上書き
#    (get_database_uri() はクラス定義完了後でないと Config.DATABASE_URL を参照できないため)
Config.SQLALCHEMY_DATABASE_URI = Config.get_database_uri()


class DevelopmentConfig(Config):
    DEBUG = True


class ProductionConfig(Config):
    DEBUG = False


def get_config():
    env = os.environ.get("FLASK_ENV", "development")
    if env == "production":
        return ProductionConfig()
    return DevelopmentConfig()

# Config クラスに追加
ALLOW_DEMO_LOGIN = os.environ.get("ALLOW_DEMO_LOGIN", "true").lower() == "true"
DEMO_USER_IDS = set(
    s.strip() for s in os.environ.get("DEMO_USER_IDS", "demo_user,demo").split(",")
    if s.strip()
)
ALLOW_LEGACY_LOGIN = os.environ.get("ALLOW_LEGACY_LOGIN", "true").lower() == "true"
ADMIN_USER_IDS = set(
    s.strip() for s in os.environ.get("ADMIN_USER_IDS", "admin,researcher,admin_user").split(",")
    if s.strip()
)