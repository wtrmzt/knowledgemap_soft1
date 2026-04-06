"""操作ログエンドポイント"""
from flask import Flask, request, jsonify, g
from models import db, UserActivityLog
from auth import token_required


def register_log_routes(app: Flask):

    @app.route("/api/logs", methods=["POST"])
    @token_required
    def create_log():
        data = request.get_json() or {}
        log = UserActivityLog(
            user_id=g.current_user["user_db_id"],
            action=data.get("action", "unknown"),
            detail=data.get("detail", {}),
            memo_id=data.get("memo_id"),
        )
        db.session.add(log)
        db.session.commit()
        return jsonify({"ok": True}), 201
