"""AI支援エンドポイント: メモ改善・周辺概念取得・記述トピック検知"""
from flask import Flask, request, jsonify
from auth import token_required


def register_ai_support_routes(app: Flask):

    # --- 振り返り文の改善 ---
    @app.route("/api/improve_memo", methods=["POST"])
    @token_required
    def improve_memo():
        from ai_service import improve_memo as ai_improve

        data = request.get_json() or {}
        memo_text = data.get("content", "")
        nodes = data.get("nodes", [])
        mode = data.get("mode", "reflection")

        result = ai_improve(memo_text, nodes, mode=mode)
        return jsonify(result)

    # --- 周辺概念の自動取得 ---
    @app.route("/api/surrounding_concepts", methods=["POST"])
    @token_required
    def get_surrounding_concepts():
        from ai_service import generate_surrounding_concepts

        data = request.get_json() or {}
        nodes = data.get("nodes", [])
        if not nodes:
            return jsonify({"error": "ノードが必要です"}), 400

        result = generate_surrounding_concepts(nodes)
        return jsonify({"surrounding": result})

    # --- 振り返り記述のトピック検知 ---
    @app.route("/api/writing/detect_topics", methods=["POST"])
    @token_required
    def detect_topics():
        from ai_service import detect_described_topics

        data = request.get_json() or {}
        text = data.get("text", "")
        node_labels = data.get("node_labels", [])

        if not text.strip() or not node_labels:
            return jsonify({
                "described": [],
                "currently_writing": None,
                "next_suggestions": [],
            })

        result = detect_described_topics(text, node_labels)
        return jsonify(result)
