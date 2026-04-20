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
        return jsonify({"status": "ok"})

    return app


# ─── エントリポイント ──────────────────────────────────────────
app = create_app()

if __name__ == "__main__":
    app.run(debug=True, port=5000)