"""マップエンドポイント: 取得・保存・履歴・ロールバック"""
from flask import Flask, request, jsonify
from models import db, KnowledgeMap, MapHistory
from auth import token_required

# 機能2: エッジ説明モデル / 設定は未更新環境でも落ちないよう防御的に取り込む
try:
    from models import EdgeExplanation
except ImportError:
    EdgeExplanation = None
try:
    from models import AppSettings
except ImportError:
    AppSettings = None


def register_map_routes(app: Flask):

    # ===== 機能2: エッジ（2ノード間）の説明を取得 =====
    #   DBキャッシュにあれば即返す。無ければAI生成→保存。
    #   介入度 Lv1 のときは生成せず disabled を返す。
    @app.route("/api/edges/explain", methods=["POST"])
    @token_required
    def explain_edge():
        body = request.get_json() or {}
        source = (body.get("source_label") or "").strip()
        target = (body.get("target_label") or "").strip()
        if not source or not target:
            return jsonify({"error": "source_label と target_label は必須です"}), 400

        # 介入度（Lv1: OFF）
        level = 3
        if AppSettings is not None:
            try:
                level = int(AppSettings.get_data()["intervention"].get("edge_explanation", 3))
            except Exception:
                level = 3
        if level <= 1:
            return jsonify({"disabled": True, "level": level})

        # キャッシュ参照（向きの違いも吸収して再利用）
        cached = None
        if EdgeExplanation is not None:
            cached = (EdgeExplanation.query
                      .filter_by(source_label=source, target_label=target).first()
                      or EdgeExplanation.query
                      .filter_by(source_label=target, target_label=source).first())
        if cached is not None:
            d = cached.to_dict()
            d["level"] = level
            d["cached"] = True
            return jsonify(d)

        # 生成
        try:
            from ai_service import generate_edge_explanation
            gen = generate_edge_explanation(source, target)
        except Exception as e:
            return jsonify({"error": str(e), "word": "", "sentence": ""}), 200

        # 保存（モデルがあれば）
        if EdgeExplanation is not None:
            try:
                row = EdgeExplanation(
                    source_label=source, target_label=target,
                    word=gen.get("word", ""), sentence=gen.get("sentence", ""),
                )
                db.session.add(row)
                db.session.commit()
            except Exception:
                db.session.rollback()

        return jsonify({
            "source_label": source, "target_label": target,
            "word": gen.get("word", ""), "sentence": gen.get("sentence", ""),
            "level": level, "cached": False,
        })

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