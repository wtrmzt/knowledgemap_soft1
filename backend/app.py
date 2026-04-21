"""
Flask アプリケーション エントリポイント
"""
import logging

from flask import Flask, jsonify
from flask_cors import CORS

from config import Config
from models import db
from routes import register_all_routes

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    # DB 初期化
    db.init_app(app)
    with app.app_context():
        db.create_all()

    # CORS
    CORS(app, origins=app.config.get('CORS_ORIGINS', '*'))

    # ルート登録
    register_all_routes(app)

    # ヘルスチェック
    @app.route('/api/health')
    def health():
        return jsonify({"status": "ok"})

    return app


# ─── エントリポイント ──────────────────────────────────────────
app = create_app()

if __name__ == "__main__":
    app.run(debug=True, port=5000)