"""
アプリケーション設定モジュール
環境変数から設定を読み込み、デフォルト値を提供する
"""
import os
from datetime import timedelta
from dotenv import load_dotenv
load_dotenv()  # ← これを追加（import osより前でもOK）


class Config:
    """基本設定"""
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
        # フォールバック: SQLite（絶対パスを使用し、ディレクトリを自動作成）
        base_dir = os.path.abspath(os.path.dirname(__file__))
        instance_dir = os.path.join(base_dir, "instance")
        os.makedirs(instance_dir, exist_ok=True)
        return f"sqlite:///{os.path.join(instance_dir, 'app.db')}"

    # ★ from_object() で読み込まれるよう、クラス属性として SQLALCHEMY_DATABASE_URI を定義
    SQLALCHEMY_DATABASE_URI = None  # __init_subclass__ より前に定義が必要なのでプレースホルダ

    # --- 関連科目推薦（Phase 2） ---
    PRECOMPUTED_DATA_PATH = os.environ.get(
        'PRECOMPUTED_DATA_PATH',
        os.path.join(os.path.dirname(__file__), 'precompute', 'precomputed_data.pkl')
    )
    USE_LIGHTWEIGHT_RELATION = os.environ.get('USE_LIGHTWEIGHT_RELATION', 'true')
    FALLBACK_HEAVY_RELATION = os.environ.get('FALLBACK_HEAVY_RELATION', 'true')


# ★ Config クラス定義完了後に SQLALCHEMY_DATABASE_URI を実際の値で上書き
#    （get_database_uri() はクラス定義完了後でないと Config.DATABASE_URL を参照できないため）
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