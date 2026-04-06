"""メモエンドポイント: 一覧取得・メモ＋マップ同時生成"""
from flask import Flask, request, jsonify, g
from models import db, Memo, KnowledgeMap, MapHistory
from auth import token_required


def register_memo_routes(app: Flask):

    @app.route("/api/memos", methods=["GET"])
    @token_required
    def list_memos():
        user_db_id = g.current_user["user_db_id"]
        memos = Memo.query.filter_by(user_id=user_db_id).order_by(
            Memo.created_at.desc()
        ).all()
        return jsonify({"memos": [m.to_dict() for m in memos]})

    @app.route("/api/memos_with_map", methods=["POST"])
    @token_required
    def create_memo_with_map():
        """メモ保存と同時にAIマップ生成"""
        from ai_service import generate_map_from_text

        data = request.get_json() or {}
        content = data.get("content", "").strip()
        mode = data.get("mode", "reflection")
        if not content:
            return jsonify({"error": "メモ内容が必要です"}), 400

        user_db_id = g.current_user["user_db_id"]

        # メモ保存
        memo = Memo(user_id=user_db_id, content=content, mode=mode)
        db.session.add(memo)
        db.session.flush()

        # AIマップ生成
        map_data = generate_map_from_text(content, mode=mode)
        nodes = map_data.get("nodes", [])
        edges = map_data.get("edges", [])

        # KnowledgeMap 保存
        km = KnowledgeMap(memo_id=memo.id, nodes=nodes, edges=edges)
        db.session.add(km)

        # MapHistory（初回バージョン）
        history = MapHistory(
            memo_id=memo.id, version=1,
            nodes=nodes, edges=edges, action="create",
        )
        db.session.add(history)

        db.session.commit()
        return jsonify({"memo": memo.to_dict(), "map": km.to_dict()}), 201
