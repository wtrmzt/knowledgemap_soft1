"""
Flask アプリケーション エントリポイント

【v3 変更点】
- 既存の create_app(), serve_frontend, register_all_routes 呼び出しは完全保持
- Redis クライアント・レート制限器・キャッシュの初期化を追加
  (REDIS_URL 未設定なら in-memory にフォールバック → 既存環境で動く)
- /api/events ルートを追加(FEATURE_EVENT_LOG=false で無効化可能)
- レート制限超過時の 429 グローバルハンドラを追加
- /static/thumbnails/<filename> で SVG サムネイルを配信
"""
from models import db
import memo_history            # ← 追加（モデル登録＋自動記録を有効化）
import logging
import os
import sqlite3

from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from sqlalchemy import event
from sqlalchemy.engine import Engine

from config import Config
from models import db
from routes import register_all_routes
import writing_suggestion_log                              # create_all の前（モデル登録）

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)




# ===========================================================
# SQLite の "database is locked" 対策
#   - WAL モード: 読み取りと書き込みの並行性を高める
#   - busy_timeout: 書き込みロック時に即エラーにせず最大30秒待つ
#   - synchronous=NORMAL: WAL では安全かつ高速
#   PostgreSQL など他DBでは何もしない。
# ===========================================================
@event.listens_for(Engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):
    if isinstance(dbapi_connection, sqlite3.Connection):
        try:
            cur = dbapi_connection.cursor()
            cur.execute("PRAGMA journal_mode=WAL;")
            cur.execute("PRAGMA busy_timeout=30000;")  # 30秒
            cur.execute("PRAGMA synchronous=NORMAL;")
            cur.close()
        except Exception as e:
            logger.warning("SQLite PRAGMA 設定に失敗: %s", e)

# フロントエンドビルド出力ディレクトリ(build.sh が backend/static にコピー済み)
FRONTEND_DIST = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    'static',
)


def create_app():
    app = Flask(
        __name__,
        static_folder=FRONTEND_DIST,
        static_url_path='',
    )
    app.config.from_object(Config)

    # DB 初期化
    db.init_app(app)
    with app.app_context():
        db.create_all()

    # CORS
    CORS(app, origins=app.config.get('CORS_ORIGINS', '*'))

    # ルート登録(既存)
    register_all_routes(app)

    writing_suggestion_log.register_suggestion_log_routes(app) # register_all_routes(app) の後


    # ===========================================================
    # ▼▼▼ v3 で追加(すべて任意。未設定/失敗でも既存動作は維持)▼▼▼
    # ===========================================================

    # --- Redis & レート制限・キャッシュ初期化 ---
    _init_redis_services(app)

    # --- 新ルート: /api/events (利用履歴強化) ---
    if app.config.get('FEATURE_EVENT_LOG', True):
        try:
            from routes.events import bp as events_bp
            app.register_blueprint(events_bp)
            logger.info("registered /api/events blueprint")
        except Exception as e:
            logger.warning("failed to register events blueprint: %s", e)

    # --- レート制限超過時のグローバルハンドラ ---
    try:
        from services.openai_rate_limiter import RateLimitExceeded

        @app.errorhandler(RateLimitExceeded)
        def handle_rate_limit(err):
            retry = max(1, int(err.retry_after_seconds))
            resp = jsonify({"error": "rate_limited", "retry_after": retry})
            resp.status_code = 429
            resp.headers["Retry-After"] = str(retry)
            return resp
    except ImportError:
        pass  # services モジュールがまだ無い環境でも起動可能

    # --- サムネイル静的配信(ローカル fs 版) ---
    thumb_dir = app.config.get('THUMBNAIL_DIR')
    if thumb_dir:
        os.makedirs(thumb_dir, exist_ok=True)

        @app.route('/static/thumbnails/<path:filename>')
        def serve_thumbnail(filename):
            return send_from_directory(thumb_dir, filename)

    # ===========================================================
    # ▲▲▲ v3 追加分ここまで ▲▲▲
    # ===========================================================

    # ヘルスチェック(v3 で Redis ステータスも返すよう拡張)
    @app.route('/api/health')
    def health():
        result = {"status": "ok"}
        redis_client = app.extensions.get("redis")
        if redis_client is not None:
            try:
                redis_client.ping()
                result["redis"] = "ok"
            except Exception:
                result["redis"] = "ng"
        else:
            result["redis"] = "not_configured"
        return jsonify(result)

    # ===== フロントエンド配信(既存のまま) =====

    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve_frontend(path):
        # 静的ファイル(JS/CSS/画像等)が存在すればそのまま返す
        full = os.path.join(app.static_folder, path)
        if path and os.path.isfile(full):
            return send_from_directory(app.static_folder, path)
        # それ以外は index.html を返す(React Router に委譲)
        return send_from_directory(app.static_folder, 'index.html')

    return app


def _init_redis_services(app: Flask) -> None:
    """Redis に接続できればそれを使い、できなければ in-memory にフォールバックする.

    既存環境(REDIS_URL 未設定)でも動くよう、失敗時は静かにフォールバック.
    """
    redis_url = app.config.get("REDIS_URL", "")
    redis_client = None

    if redis_url:
        try:
            import redis as redis_lib
            redis_client = redis_lib.from_url(redis_url, decode_responses=True)
            redis_client.ping()
            app.extensions["redis"] = redis_client
            logger.info("connected to Redis: %s", redis_url)
        except Exception as e:
            logger.warning("Redis connection failed (%s). falling back to in-memory.", e)
            redis_client = None

    # レート制限・キャッシュは Redis 有無に関わらず初期化
    # (in-memory 実装が内部にある)
    try:
        from services.openai_rate_limiter import init_rate_limiter
        from services.openai_cache import init_result_cache

        init_rate_limiter(
            redis_client=redis_client,
            rpm_limit=app.config.get("OPENAI_RPM_LIMIT", 800),
            tpm_limit=app.config.get("OPENAI_TPM_LIMIT", 160000),
            enabled=app.config.get("FEATURE_RATE_LIMIT", True),
        )
        init_result_cache(redis_client=redis_client)
        logger.info("rate limiter & cache initialized (backend=%s)",
                    "redis" if redis_client else "memory")
    except ImportError:
        # services モジュールが配置されていない場合でも起動可能
        logger.info("services module not found; skipping rate limiter init")
    except Exception as e:
        logger.warning("failed to init rate limiter / cache: %s", e)


# ─── エントリポイント ──────────────────────────────────────────
app = create_app()

if __name__ == "__main__":
    app.run(debug=True, port=5000)