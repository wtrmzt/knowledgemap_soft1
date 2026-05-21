"""認証ルート (元の auth.py 復旧版)."""
from datetime import datetime
from flask import request, jsonify, g
from models import User, db
from auth import token_required, generate_token

ADMIN_USER_IDS = {"admin", "researcher", "admin_user"}


def register_auth_routes(app):
    @app.post("/api/login")
    def login():
        body = request.get_json(silent=True) or {}
        user_id = (body.get("user_id") or "").strip()
        if not user_id:
            return {"error": "user_id required"}, 400

        user = User.query.filter_by(user_id=user_id).first()
        if user is None:
            user = User(
                user_id=user_id,
                is_admin=(user_id in ADMIN_USER_IDS),
            )
            db.session.add(user)
            db.session.commit()

        token = generate_token(user)
        return {"token": token, "user": user.to_dict()}

    @app.post("/api/consent")
    @token_required
    def update_consent():
        body = request.get_json(silent=True) or {}
        consented = bool(body.get("consented", True))

        user_id = g.current_user["user_id"]
        user = User.query.filter_by(user_id=user_id).first()
        if user is None:
            return {"error": "user not found"}, 404

        user.consented = consented
        db.session.commit()
        return {"user": user.to_dict()}

    @app.get("/api/me")
    @token_required
    def get_me():
        user_id = g.current_user["user_id"]
        user = User.query.filter_by(user_id=user_id).first()
        if user is None:
            return {"error": "user not found"}, 404
        return user.to_dict()