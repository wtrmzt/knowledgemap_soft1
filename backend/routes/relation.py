"""
routes/relation.py — 関連科目推薦 API ルート

修正:
  - year の NaN/None を安全にサニタイズ
  - レスポンス形式を正規化（heavy版の不足フィールドを補完）
  - ノードの NaN 値を None に変換
"""

import math
import numpy as np
from flask import Blueprint, request, jsonify, current_app
from auth import token_required
import logging

logger = logging.getLogger(__name__)

relation_bp = Blueprint("relation", __name__)


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


def _sanitize_node(node: dict) -> dict:
    """ノード辞書内の NaN / set / numpy 値を JSON 安全な値に変換"""
    clean = {}
    for k, v in node.items():
        if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
            clean[k] = None
        elif isinstance(v, (set, frozenset)):
            clean[k] = list(v)
        elif isinstance(v, np.ndarray):
            continue  # embedding は除外
        elif isinstance(v, np.integer):
            clean[k] = int(v)
        elif isinstance(v, np.floating):
            clean[k] = None if math.isnan(float(v)) else float(v)
        else:
            clean[k] = v
    return clean


def _normalize_response(result: dict) -> dict:
    """レスポンスを正規化: ノードの NaN 除去 + 必須フィールド補完"""
    for key in ['future_map', 'past_map']:
        if key not in result:
            result[key] = {"nodes": [], "edges": []}
        else:
            sub = result[key]
            if not isinstance(sub, dict):
                result[key] = {"nodes": [], "edges": []}
                continue
            # ノードをサニタイズ
            raw_nodes = sub.get("nodes", [])
            if isinstance(raw_nodes, list):
                sub["nodes"] = [_sanitize_node(n) if isinstance(n, dict) else n for n in raw_nodes]
            else:
                sub["nodes"] = []
            # エッジ
            if not isinstance(sub.get("edges"), list):
                sub["edges"] = []

    # method がなければ追加
    if "method" not in result:
        result["method"] = "heavy_direct"

    return result


@relation_bp.route("/api/relations/temporal", methods=["POST"])
@token_required
def get_temporal_relations():
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

    service = getattr(current_app, "relation_service", None)

    if service:
        result = service.find_temporal_relation(node_data)
    else:
        result = _direct_fallback(node_data)

    # ★ レスポンスを正規化してから返す
    result = _normalize_response(result)
    return jsonify(result)


@relation_bp.route("/api/relations/status", methods=["GET"])
@token_required
def get_relation_status():
    service = getattr(current_app, "relation_service", None)

    if service:
        return jsonify(service.get_status())
    else:
        return jsonify({
            "initialized": False,
            "note": "relation_service.py 未配置。time_relation_logic.py でフォールバック中。",
        })


def register_relation_routes(app):
    """routes/__init__.py から呼ばれる登録関数"""
    app.register_blueprint(relation_bp)


def _direct_fallback(node_data: dict) -> dict:
    """time_relation_logic.py を直接呼ぶフォールバック"""
    try:
        node_data["year"] = _safe_year(node_data.get("year"), 3)

        from time_relation_logic import find_temporal_relation
        result = find_temporal_relation(node_data)
        result["method"] = "heavy_direct"
        return result
    except ImportError:
        logger.error("time_relation_logic モジュールが見つかりません")
        return {
            "future_map": {"nodes": [], "edges": []},
            "past_map": {"nodes": [], "edges": []},
            "method": "none",
            "error": "関連科目推薦モジュールが利用できません。",
        }
    except Exception as e:
        logger.error(f"フォールバックエラー: {e}", exc_info=True)
        return {
            "future_map": {"nodes": [], "edges": []},
            "past_map": {"nodes": [], "edges": []},
            "method": "none",
            "error": str(e),
        }