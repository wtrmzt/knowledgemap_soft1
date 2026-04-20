"""
Flask アプリケーション エントリポイント
"""
import logging
import os

from flask import Flask, send_from_directory
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

    # 関連科目推薦サービスの初期化（Phase 2）
    # ★ ファイルが未配置でもアプリは正常起動する
    try:
        from relation_service import RelationService
        app.relation_service = RelationService(app)
        logger.info("✓ RelationService 初期化完了")
    except ImportError:
        logger.warning(
            "relation_service.py が見つかりません。"
            "関連科目推薦は time_relation_logic.py で直接処理します。"
        )
        app.relation_service = None
    except Exception as e:
        logger.warning(f"RelationService 初期化エラー: {e}")
        app.relation_service = None

    # ヘルスチェック
    @app.route('/api/health')
    def health():
        return {'status': 'ok'}

    # ★ 追加: フロントエンド静的ファイルの配信 ★
    # ビルド済みフロントエンドのパス（Render 上の相対パス）
    FRONTEND_DIST = os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        '..', 'frontend', 'knowledge-map-app', 'dist'
    )

    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve_frontend(path):
        # 静的ファイル（JS, CSS, 画像など）が存在すればそれを返す
        file_path = os.path.join(FRONTEND_DIST, path)
        if path and os.path.isfile(file_path):
            return send_from_directory(FRONTEND_DIST, path)
        # それ以外は index.html を返す（React Router の SPA ルーティング用）
        return send_from_directory(FRONTEND_DIST, 'index.html')

    return app


# ─── エントリポイント ──────────────────────────────────────────
app = create_app()

if __name__ == "__main__":
    app.run(debug=True, port=5000)