"""
Flask アプリケーション エントリポイント
"""
import logging
import os

from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS

from config import Config
from models import db
from routes import register_all_routes

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# フロントエンドビルド出力ディレクトリ（build.sh が backend/static にコピー済み）
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

    # ルート登録
    register_all_routes(app)

    # ヘルスチェック
    @app.route('/api/health')
    def health():
        return jsonify({"status": "ok"})

    # ===== フロントエンド配信 =====

    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve_frontend(path):
        # 静的ファイル（JS/CSS/画像等）が存在すればそのまま返す
        full = os.path.join(app.static_folder, path)
        if path and os.path.isfile(full):
            return send_from_directory(app.static_folder, path)
        # それ以外は index.html を返す（React Router に委譲）
        return send_from_directory(app.static_folder, 'index.html')

    return app


# ─── エントリポイント ──────────────────────────────────────────
app = create_app()

if __name__ == "__main__":
    app.run(debug=True, port=5000)