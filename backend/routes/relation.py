"""
routes/relation.py — 関連科目推薦 API ルート

変更点（Phase 2）:
  - RelationService 経由で軽量版 / フォールバック版を自動選択
  - ステータスエンドポイント追加（/api/relations/status）
  - レスポンスに method, response_time_ms を追加

配置先: backend/routes/relation.py（既存ファイルを置換）
"""

from flask import Blueprint, request, jsonify, current_app
from auth import token_required
import logging

logger = logging.getLogger(__name__)

relation_bp = Blueprint("relation", __name__)


@relation_bp.route("/api/relations/temporal", methods=["POST"])
@token_required
def get_temporal_relations():
    """
    ノードに関連する基礎/発展科目を返すエンドポイント。

    Request Body:
        {
            "label": "動的計画法",          # 必須: ノードのラベル
            "sentence": "複雑な問題を...",   # 任意: ノードの説明文
            "extend_query": ["メモ化"],      # 任意: 拡張検索クエリ
            "year": 3,                      # 任意: 学年（デフォルト 3）
            "id": "node_xxx"                # 任意: ノードID（重複除外用）
        }

    Response:
        {
            "future_map": {
                "nodes": [{"id": ..., "label": ..., "sentence": ..., "group": ...}, ...],
                "edges": [{"source": ..., "target": ...}, ...]
            },
            "past_map": {
                "nodes": [...],
                "edges": [...]
            },
            "method": "lightweight" | "heavy" | "none",
            "response_time_ms": 1234,
            "error": null | "エラーメッセージ"
        }
    """
    data = request.get_json()

    if not data:
        return jsonify({"error": "リクエストボディが空です"}), 400

    label = data.get("label")
    if not label:
        return jsonify({"error": "label は必須です"}), 400

    # 入力データの組み立て
    node_data = {
        "label": label,
        "sentence": data.get("sentence", ""),
        "extend_query": data.get("extend_query", []),
        "year": data.get("year", 3),
        "id": data.get("id"),
        "apiNodeId": data.get("apiNodeId"),
    }

    # RelationService 経由で処理
    service = getattr(current_app, "relation_service", None)

    if service:
        result = service.find_temporal_relation(node_data)
    else:
        # RelationService 未初期化の場合 → 直接フォールバック
        logger.warning("RelationService が未初期化です。直接 time_relation_logic を呼び出します。")
        result = _direct_fallback(node_data)

    return jsonify(result)


@relation_bp.route("/api/relations/status", methods=["GET"])
@token_required
def get_relation_status():
    """
    関連科目推薦エンジンの状態を返す（管理者向け）。

    Response:
        {
            "initialized": true,
            "lightweight_enabled": true,
            "lightweight_loaded": true,
            "fallback_enabled": true,
            "precomputed_version": "1.0",
            "precomputed_generated_at": "2025-XX-XX",
            "precomputed_subject_count": 50,
            "precomputed_map_count": 48
        }
    """
    service = getattr(current_app, "relation_service", None)

    if service:
        return jsonify(service.get_status())
    else:
        return jsonify({
            "initialized": False,
            "error": "RelationService が未初期化です",
        })


def register_relation_routes(app):
    """routes/__init__.py から呼ばれる登録関数"""
    app.register_blueprint(relation_bp)


def _direct_fallback(node_data: dict) -> dict:
    """
    RelationService が利用できない場合の直接フォールバック。
    既存の time_relation_logic.find_temporal_relation をそのまま呼ぶ。
    """
    try:
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
        logger.error(f"直接フォールバックでエラー: {e}", exc_info=True)
        return {
            "future_map": {"nodes": [], "edges": []},
            "past_map": {"nodes": [], "edges": []},
            "method": "none",
            "error": str(e),
        }