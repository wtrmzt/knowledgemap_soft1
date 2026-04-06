"""認証エンドポイント: ログイン・同意・ユーザー情報"""
from flask import Flask, request, jsonify, g
from models import db, User
from auth import generate_token, token_required, is_admin_user_id


def register_auth_routes(app: Flask):

    @app.route("/api/login", methods=["POST"])
    def login():
        data = request.get_json() or {}
        user_id = data.get("user_id", "").strip()
        if not user_id:
            return jsonify({"error": "ユーザーIDが必要です"}), 400

        user = User.query.filter_by(user_id=user_id).first()
        if not user:
            user = User(
                user_id=user_id,
                display_name=user_id,
                is_admin=is_admin_user_id(user_id),
            )
            db.session.add(user)
            db.session.commit()

        token = generate_token(user)
        return jsonify({"token": token, "user": user.to_dict()})

    @app.route("/api/consent", methods=["POST"])
    @token_required
    def update_consent():
        data = request.get_json() or {}
        consented = data.get("consented", False)
        user = User.query.get(g.current_user["user_db_id"])
        if user:
            user.consented = consented
            db.session.commit()
        return jsonify({"ok": True})

    @app.route("/api/me", methods=["GET"])
    @token_required
    def get_me():
        user = User.query.get(g.current_user["user_db_id"])
        if not user:
            return jsonify({"error": "ユーザーが見つかりません"}), 404
        return jsonify({"user": user.to_dict()})
