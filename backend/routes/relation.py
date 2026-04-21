"""
routes/relation.py — 関連科目推薦 API ルート

time_relation_logic.py を直接呼び出す。
3指標統合（QID path + Jaccard + cosine embedding）で高精度な推薦を行う。
"""

import math
import logging
import numpy as np
from flask import Blueprint, request, jsonify
from auth import token_required

logger = logging.getLogger(__name__)

relation_bp = Blueprint("relation", __name__)


# =============================================
# ユーティリティ
# =============================================

def _safe_year(value, default=3) -> int:
    """year 値を安全に int に変換"""
    if value is None:
        return default
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return default
        return int(value)
    try:
        v = int(value)
        return v if v > 0 else default
    except (ValueError, TypeError):
        return default


def _sanitize_value(v):
    """JSON非対応の値を安全に変換"""
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    if isinstance(v, (set, frozenset)):
        return list(v)
    if isinstance(v, np.ndarray):
        return None  # embedding は除外
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating,)):
        f = float(v)
        return None if math.isnan(f) else f
    return v


def _sanitize_node(node: dict) -> dict:
    """ノード辞書内の NaN / set / numpy 値をJSON安全に変換"""
    return {k: _sanitize_value(v) for k, v in node.items()}


def _normalize_response(result: dict) -> dict:
    """レスポンスを正規化"""
    for key in ['future_map', 'past_map']:
        if key not in result:
            result[key] = {"nodes": [], "edges": []}
        else:
            sub = result[key]
            if not isinstance(sub, dict):
                result[key] = {"nodes": [], "edges": []}
                continue
            raw_nodes = sub.get("nodes", [])
            if isinstance(raw_nodes, list):
                sub["nodes"] = [_sanitize_node(n) if isinstance(n, dict) else n for n in raw_nodes]
            else:
                sub["nodes"] = []
            if not isinstance(sub.get("edges"), list):
                sub["edges"] = []

    if "method" not in result:
        result["method"] = "heavy"

    return result


# =============================================
# エンドポイント
# =============================================

@relation_bp.route("/api/relations/temporal", methods=["POST"])
@token_required
def get_temporal_relations():
    """
    ノードに関連する基礎/発展科目を返す。
    3指標統合（QID path + Jaccard + cosine）で推薦。

    Request Body:
        { "label": "動的計画法", "sentence": "...", "year": 3, "id": "node_xxx" }
    """
    data = request.get_json()

    if not data:
        return jsonify({"error": "リクエストボディが空です"}), 400

    label = data.get("label")
    if not label:
        return jsonify({"error": "label は必須です"}), 400

    node_data = {
        "label": label,
        "sentence": data.get("sentence", ""),
        "extend_query": data.get("extend_query", []),
        "year": _safe_year(data.get("year"), 3),
        "id": data.get("id"),
        "apiNodeId": data.get("apiNodeId"),
    }

    try:
        from time_relation_logic import find_temporal_relation
        result = find_temporal_relation(node_data)
        result = _normalize_response(result)
        return jsonify(result)
    except Exception as e:
        logger.error(f"関連科目推薦エラー: {e}", exc_info=True)
        return jsonify({
            "future_map": {"nodes": [], "edges": []},
            "past_map": {"nodes": [], "edges": []},
            "method": "heavy",
            "error": str(e),
        })


@relation_bp.route("/api/relations/status", methods=["GET"])
@token_required
def get_relation_status():
    """エンジンの状態"""
    return jsonify({
        "engine": "time_relation_logic (3指標統合)",
        "weights": {
            "rep_path": 0.4,
            "neighbor_jaccard": 0.3,
            "embedding_cosine": 0.3,
        },
        "top_k_subjects": 3,
    })


def register_relation_routes(app):
    """routes/__init__.py から呼ばれる登録関数"""
    app.register_blueprint(relation_bp)