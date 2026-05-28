"""
ルートパッケージ
すべてのルートモジュールを app に登録する
"""
from flask import Flask


def register_all_routes(app: Flask):
    """全ルートを一括登録"""
    from routes.auth import register_auth_routes
    from routes.memo import register_memo_routes
    from routes.map import register_map_routes
    from routes.node import register_node_routes
    from routes.ai_support import register_ai_support_routes
    from routes.relation import register_relation_routes
    from routes.log import register_log_routes
    from routes.admin import register_admin_routes

    register_auth_routes(app)
    register_memo_routes(app)
    register_map_routes(app)
    register_node_routes(app)
    register_ai_support_routes(app)
    register_relation_routes(app)
    register_log_routes(app)
    register_admin_routes(app)

    try:
        from routes.auth_v3 import register_auth_v3_routes
        register_auth_v3_routes(app)
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("auth_v3 failed: %s", e)

    try:
        from routes.login_guard import register_login_guard
        register_login_guard(app)
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("login_guard failed: %s", e)
    
    # ===== ▼▼▼ v3 メモ拡張(今回追加)▼▼▼ =====
    try:
        from routes.memo_v3 import register_memo_v3_routes
        register_memo_v3_routes(app)
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("memo_v3 failed: %s", e)

