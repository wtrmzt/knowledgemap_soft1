"""
ルートパッケージ
すべてのルートモジュールを app に登録する

【今回の変更】
- routes/login_guard（register_login_guard）の登録を停止。
    これが before_request で /api/login を横取りし、パスワードログインを
    「レガシーログイン」とみなして 403 (legacy_login_disabled) で弾いていた。
    新しい routes/auth.py が許可リスト・パスワード照合・試行回数ロックまで
    すべて自前で行うため、このガードは不要。
- routes/auth_v3（register_auth_v3_routes）の登録も停止。
    新 routes/auth.py が /api/login, /api/auth/google, /api/auth/config 等を
    定義済みで、auth_v3 はルート衝突して失敗登録になるだけのため。
  ※ もし login_guard / auth_v3 に残したいロジックがあれば、新 routes/auth.py に統合します。
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

    # ===== ▼▼▼ 無効化（パスワードログイン化に伴い）▼▼▼ =====
    # 旧 Google ログイン用の追加ルート。新 routes/auth.py に統合済みのため停止。
    # try:
    #     from routes.auth_v3 import register_auth_v3_routes
    #     register_auth_v3_routes(app)
    # except Exception as e:
    #     import logging
    #     logging.getLogger(__name__).warning("auth_v3 failed: %s", e)

    # ★ /api/login を横取りして legacy_login_disabled を返していたガード。停止。
    # try:
    #     from routes.login_guard import register_login_guard
    #     register_login_guard(app)
    # except Exception as e:
    #     import logging
    #     logging.getLogger(__name__).warning("login_guard failed: %s", e)
    # ===== ▲▲▲ 無効化ここまで ▲▲▲ =====

    # ===== ▼▼▼ v3 メモ拡張(無関係なので維持)▼▼▼ =====
    try:
        from routes.memo_v3 import register_memo_v3_routes
        register_memo_v3_routes(app)
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("memo_v3 failed: %s", e)