"""
Flask アプリケーション エントリポイント
本番環境では React のビルド済みファイルも配信する
"""
import logging
import os

from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS

from config import get_config, Config
from models import db
from routes import register_all_routes

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# React ビルド出力のパス
STATIC_FOLDER = os.path.join(os.path.dirname(__file__), 'static')


def create_app() -> Flask:
    app = Flask(__name__, static_folder=STATIC_FOLDER, static_url_path='')
    config = get_config()

    app.config["SECRET_KEY"] = config.SECRET_KEY
    app.config["SQLALCHEMY_DATABASE_URI"] = Config.get_database_uri()
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    db.init_app(app)
    CORS(app, origins=config.CORS_ORIGINS, supports_credentials=True)

    with app.app_context():
        db.create_all()

    # 全 API ルートを登録
    register_all_routes(app)

    @app.route("/api/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok"})

    # ★ React SPA のフォールバック
    # /api 以外のリクエストは全て index.html を返す
    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve_frontend(path):
        # 静的ファイル（JS, CSS, 画像）が存在すればそれを返す
        if path and os.path.exists(os.path.join(STATIC_FOLDER, path)):
            return send_from_directory(STATIC_FOLDER, path)
        # それ以外は index.html（React Router が処理）
        return send_from_directory(STATIC_FOLDER, 'index.html')

    return app


# ─── エントリポイント ──────────────────────────────────────────
app = create_app()

if __name__ == "__main__":
    app.run(debug=True, port=5000)