# `backend/app.py` への変更

`create_app()` 内で Redis 接続・レート制限器・キャッシュを初期化し、
新ルート `/api/events` を登録します。

## 変更後の `create_app()` 完成例

```python
import logging
from flask import Flask
from flask_cors import CORS

import redis as redis_lib

from config import Config
from models import db
from services.openai_rate_limiter import init_rate_limiter
from services.openai_cache import init_result_cache


def create_app(config_class=Config) -> Flask:
    app = Flask(__name__)
    app.config.from_object(config_class)
    app.config["SQLALCHEMY_DATABASE_URI"] = Config.get_database_uri()

    # ===== DB 初期化 (既存) =====
    db.init_app(app)
    with app.app_context():
        db.create_all()

    # ===== CORS (既存) =====
    CORS(
        app,
        resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}},
        supports_credentials=True,
    )

    # ===== ロギング =====
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    # ===== Redis & 関連サービス (Phase 1 追加) =====
    redis_client = redis_lib.from_url(
        app.config["REDIS_URL"], decode_responses=True
    )
    app.extensions["redis"] = redis_client
    init_rate_limiter(
        redis_client,
        rpm_limit=app.config["OPENAI_RPM_LIMIT"],
        tpm_limit=app.config["OPENAI_TPM_LIMIT"],
    )
    init_result_cache(redis_client)

    # ===== ルート登録 (既存 + 追加) =====
    import routes
    routes.register_all_routes(app)

    # 新ルート: events
    from routes.events import bp as events_bp
    app.register_blueprint(events_bp)

    # ===== 静的ファイル: サムネイル =====
    # 本番では Nginx / CDN で配信するが、開発時用に Flask が返せるように
    from flask import send_from_directory
    @app.get("/static/thumbnails/<path:filename>")
    def serve_thumbnail(filename: str):
        return send_from_directory(app.config["THUMBNAIL_DIR"], filename)

    # ===== ヘルスチェック (既存) =====
    @app.get("/api/health")
    def health():
        # Redis も含めた health check
        try:
            redis_client.ping()
            redis_ok = True
        except Exception:
            redis_ok = False
        return {
            "status": "ok",
            "db": "ok",
            "redis": "ok" if redis_ok else "ng",
        }

    # ===== グローバルエラーハンドラ =====
    from services.openai_rate_limiter import RateLimitExceeded
    @app.errorhandler(RateLimitExceeded)
    def handle_rate_limit(err):
        from flask import jsonify
        retry = max(1, int(err.retry_after_seconds))
        resp = jsonify({"error": "rate_limited", "retry_after": retry})
        resp.status_code = 429
        resp.headers["Retry-After"] = str(retry)
        return resp

    return app


# ===== Celery 用エントリポイント =====
# celery -A app:celery_app worker -l info で起動
# Celery を Phase 1 で導入しないなら以下は省略可
def _make_celery():
    from services.job_queue import make_celery_with_flask
    flask_app = create_app()
    return make_celery_with_flask(flask_app)


# Celery を有効化する場合のみコメント解除:
# celery_app = _make_celery()


if __name__ == "__main__":
    app = create_app()
    app.run(host="0.0.0.0", port=5000, debug=True)
```

## Gunicorn 起動コマンドの更新

`Procfile` (Render の場合):

```
web: gunicorn app:create_app() --workers 4 --worker-class gevent --worker-connections 200 --timeout 60 --keep-alive 5 --bind 0.0.0.0:$PORT
worker: celery -A app:celery_app worker -l info -c 4
```

> **Note:** Celery を導入しない場合 `worker:` 行は不要です。
> 100 名同時接続だけが目的なら、Phase 1 では Gunicorn + gevent のみで十分。
