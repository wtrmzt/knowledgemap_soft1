"""マップエンドポイント: 取得・保存・履歴・ロールバック"""
from flask import Flask, request, jsonify
from models import db, KnowledgeMap, MapHistory
from auth import token_required


def register_map_routes(app: Flask):

    @app.route("/api/maps/<int:memo_id>", methods=["GET"])
    @token_required
    def get_map(memo_id):
        km = KnowledgeMap.query.filter_by(memo_id=memo_id).first()
        if not km:
            return jsonify({"error": "マップが見つかりません"}), 404
        return jsonify({"map": km.to_dict()})

    @app.route("/api/maps/<int:memo_id>", methods=["PUT"])
    @token_required
    def update_map(memo_id):
        """マップ自動保存（バックグラウンド）"""
        data = request.get_json() or {}
        nodes = data.get("nodes", [])
        edges = data.get("edges", [])

        km = KnowledgeMap.query.filter_by(memo_id=memo_id).first()
        if not km:
            return jsonify({"error": "マップが見つかりません"}), 404

        km.nodes = nodes
        km.edges = edges

        latest = MapHistory.query.filter_by(memo_id=memo_id).order_by(
            MapHistory.version.desc()
        ).first()
        new_version = (latest.version + 1) if latest else 1

        history = MapHistory(
            memo_id=memo_id, version=new_version,
            nodes=nodes, edges=edges, action="update",
        )
        db.session.add(history)
        db.session.commit()
        return jsonify({"map": km.to_dict()})

    @app.route("/api/maps/<int:memo_id>/history", methods=["GET"])
    @token_required
    def get_map_history(memo_id):
        histories = MapHistory.query.filter_by(memo_id=memo_id).order_by(
            MapHistory.version.desc()
        ).all()
        return jsonify({"histories": [h.to_dict() for h in histories]})

    @app.route("/api/maps/<int:memo_id>/rollback/<int:version>", methods=["POST"])
    @token_required
    def rollback_map(memo_id, version):
        """指定バージョンへロールバック"""
        target = MapHistory.query.filter_by(
            memo_id=memo_id, version=version
        ).first()
        if not target:
            return jsonify({"error": "指定バージョンが見つかりません"}), 404

        km = KnowledgeMap.query.filter_by(memo_id=memo_id).first()
        if not km:
            return jsonify({"error": "マップが見つかりません"}), 404

        km.nodes = target.nodes
        km.edges = target.edges

        latest = MapHistory.query.filter_by(memo_id=memo_id).order_by(
            MapHistory.version.desc()
        ).first()
        new_version = (latest.version + 1) if latest else 1

        history = MapHistory(
            memo_id=memo_id, version=new_version,
            nodes=target.nodes, edges=target.edges, action="rollback",
        )
        db.session.add(history)
        db.session.commit()
        return jsonify({"map": km.to_dict()})
