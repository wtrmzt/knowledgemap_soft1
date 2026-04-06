"""ノードエンドポイント: キーワードからAIノード自動生成"""
from flask import Flask, request, jsonify
from auth import token_required


def register_node_routes(app: Flask):

    @app.route("/api/nodes/create_manual", methods=["POST"])
    @token_required
    def create_manual_node():
        from ai_service import generate_node_from_keyword

        data = request.get_json() or {}
        keyword = data.get("keyword", "").strip()
        if not keyword:
            return jsonify({"error": "キーワードが必要です"}), 400

        result = generate_node_from_keyword(keyword)
        return jsonify(result)
