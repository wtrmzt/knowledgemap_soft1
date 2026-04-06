"""
relation_service.py — 関連科目推薦のサービスレイヤー

軽量版（事前計算データ）とフォールバック版（現行time_relation_logic）を
統合管理し、routes/relation.py から呼び出される単一エントリポイントを提供する。

配置先: backend/relation_service.py

使い方:
    # app.py の create_app() 内で初期化
    from relation_service import RelationService
    app.relation_service = RelationService(app)
    
    # routes/relation.py から呼び出し
    from flask import current_app
    result = current_app.relation_service.find_temporal_relation(node_data)
"""

import os
import time
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# =====================================================================
# 軽量版エンジンのインポート（Phase 1 の成果物）
# =====================================================================
try:
    from lightweight_relation_logic import LightweightRelationEngine
    _LIGHTWEIGHT_AVAILABLE = True
except ImportError:
    _LIGHTWEIGHT_AVAILABLE = False
    logger.warning("lightweight_relation_logic が見つかりません。フォールバック版のみ使用します。")

# =====================================================================
# 現行版（フォールバック）のインポート
# =====================================================================
try:
    from time_relation_logic import find_temporal_relation as _heavy_find_temporal_relation
    _HEAVY_AVAILABLE = True
except ImportError:
    _HEAVY_AVAILABLE = False
    logger.warning("time_relation_logic が見つかりません。フォールバック版は無効です。")


class RelationService:
    """
    関連科目推薦の統合サービス。

    優先順位:
    1. 軽量版（LightweightRelationEngine）— 事前計算データを使い 1-2秒 で応答
    2. フォールバック版（time_relation_logic.find_temporal_relation）— 10-30秒
    3. 空結果（どちらも利用不可の場合）

    初期化は create_app() 内で行い、app オブジェクトに紐付ける:
        app.relation_service = RelationService(app)
    """

    def __init__(self, app=None):
        self._lightweight_engine: Optional[LightweightRelationEngine] = None
        self._use_lightweight: bool = True
        self._fallback_enabled: bool = True
        self._initialized: bool = False

        if app is not None:
            self.init_app(app)

    def init_app(self, app):
        """
        Flask アプリの設定を読み込んでエンジンを初期化する。

        config.py で設定する環境変数:
            PRECOMPUTED_DATA_PATH  — pickle ファイルのパス（デフォルト: ./precompute/precomputed_data.pkl）
            USE_LIGHTWEIGHT_RELATION — "true" で軽量版を有効化（デフォルト: true）
            FALLBACK_HEAVY_RELATION — "true" でフォールバック版も有効化（デフォルト: true）
        """
        # 設定読み込み
        pkl_path = app.config.get(
            "PRECOMPUTED_DATA_PATH",
            os.environ.get(
                "PRECOMPUTED_DATA_PATH",
                os.path.join(os.path.dirname(__file__), "precompute", "precomputed_data.pkl"),
            ),
        )
        self._use_lightweight = (
            app.config.get("USE_LIGHTWEIGHT_RELATION", os.environ.get("USE_LIGHTWEIGHT_RELATION", "true")).lower()
            == "true"
        )
        self._fallback_enabled = (
            app.config.get("FALLBACK_HEAVY_RELATION", os.environ.get("FALLBACK_HEAVY_RELATION", "true")).lower()
            == "true"
        )

        # 軽量版エンジンの初期化
        if self._use_lightweight and _LIGHTWEIGHT_AVAILABLE:
            if os.path.exists(pkl_path):
                self._lightweight_engine = LightweightRelationEngine(pkl_path)

                # OpenAI クライアントの共有（ai_service.py から取得）
                self._inject_openai_client()

                if self._lightweight_engine.is_loaded:
                    logger.info(f"✓ 軽量版関連科目エンジン初期化完了 ({pkl_path})")
                else:
                    logger.error(f"✗ 軽量版エンジンのデータロード失敗 ({pkl_path})")
                    self._lightweight_engine = None
            else:
                logger.warning(
                    f"事前計算データが見つかりません: {pkl_path}\n"
                    f"  → python precompute/precompute_relations.py で生成してください"
                )
        else:
            if not self._use_lightweight:
                logger.info("軽量版関連科目エンジンは無効化されています (USE_LIGHTWEIGHT_RELATION=false)")
            elif not _LIGHTWEIGHT_AVAILABLE:
                logger.warning("lightweight_relation_logic モジュールが見つかりません")

        # フォールバック版の確認
        if self._fallback_enabled and _HEAVY_AVAILABLE:
            logger.info("✓ フォールバック版（time_relation_logic）有効")
        elif self._fallback_enabled and not _HEAVY_AVAILABLE:
            logger.warning("✗ フォールバック版（time_relation_logic）利用不可")
            self._fallback_enabled = False

        self._initialized = True

    def _inject_openai_client(self):
        """ai_service.py の OpenAI クライアントを軽量版エンジンに注入"""
        if self._lightweight_engine is None:
            return

        try:
            from ai_service import _get_client
            client = _get_client()
            if client:
                self._lightweight_engine.set_openai_client(client)
                logger.info("  OpenAI クライアントを軽量版エンジンに注入しました")
            else:
                logger.warning("  OpenAI クライアントが取得できません（Embedding生成不可）")
        except ImportError:
            logger.warning("  ai_service モジュールが見つかりません")
        except Exception as e:
            logger.warning(f"  OpenAI クライアント注入に失敗: {e}")

    # =================================================================
    # メイン API
    # =================================================================

    def find_temporal_relation(self, input_node_data: dict) -> dict:
        """
        入力ノードに対する基礎/発展の関連科目を返す。

        軽量版 → フォールバック版 の順で試行し、最初に成功した結果を返す。

        Args:
            input_node_data: {
                "label": "動的計画法",
                "sentence": "複雑な問題を...",
                "extend_query": ["メモ化"],
                "year": 3,
                "id": "node_xxx"
            }

        Returns:
            {
                "future_map": {"nodes": [...], "edges": [...]},
                "past_map": {"nodes": [...], "edges": [...]},
                "method": "lightweight" | "heavy" | "none",
                "response_time_ms": 1234,
                "error": null | "エラーメッセージ"
            }
        """
        start = time.time()

        # ---- 軽量版を試行 ----
        if self._lightweight_engine and self._lightweight_engine.is_loaded:
            try:
                result = self._lightweight_engine.find_temporal_relation(input_node_data)
                elapsed_ms = int((time.time() - start) * 1000)
                result["response_time_ms"] = elapsed_ms

                # 結果が空でなければ成功
                has_future = bool(result.get("future_map", {}).get("nodes"))
                has_past = bool(result.get("past_map", {}).get("nodes"))

                if has_future or has_past or not result.get("error"):
                    logger.info(
                        f"[RelationService] 軽量版で応答 ({elapsed_ms}ms): "
                        f"future={len(result.get('future_map', {}).get('nodes', []))}N, "
                        f"past={len(result.get('past_map', {}).get('nodes', []))}N"
                    )
                    return result
                else:
                    logger.info(f"[RelationService] 軽量版は空結果 → フォールバックへ")

            except Exception as e:
                logger.error(f"[RelationService] 軽量版でエラー: {e}", exc_info=True)

        # ---- フォールバック版を試行 ----
        if self._fallback_enabled and _HEAVY_AVAILABLE:
            try:
                logger.info("[RelationService] フォールバック版（time_relation_logic）を使用")
                result = _heavy_find_temporal_relation(input_node_data)
                elapsed_ms = int((time.time() - start) * 1000)
                result["method"] = "heavy"
                result["response_time_ms"] = elapsed_ms
                logger.info(
                    f"[RelationService] フォールバック版で応答 ({elapsed_ms}ms): "
                    f"future={len(result.get('future_map', {}).get('nodes', []))}N, "
                    f"past={len(result.get('past_map', {}).get('nodes', []))}N"
                )
                return result

            except Exception as e:
                logger.error(f"[RelationService] フォールバック版でエラー: {e}", exc_info=True)

        # ---- どちらも利用不可 ----
        elapsed_ms = int((time.time() - start) * 1000)
        logger.warning("[RelationService] 利用可能なエンジンがありません")
        return {
            "future_map": {"nodes": [], "edges": []},
            "past_map": {"nodes": [], "edges": []},
            "method": "none",
            "response_time_ms": elapsed_ms,
            "error": "関連科目推薦エンジンが利用できません。事前計算データを確認してください。",
        }

    # =================================================================
    # ステータス情報（管理者向け）
    # =================================================================

    def get_status(self) -> dict:
        """エンジンの状態を辞書で返す（/api/admin/stats 等で使用）"""
        status = {
            "initialized": self._initialized,
            "lightweight_enabled": self._use_lightweight,
            "lightweight_loaded": (
                self._lightweight_engine.is_loaded if self._lightweight_engine else False
            ),
            "fallback_enabled": self._fallback_enabled and _HEAVY_AVAILABLE,
        }

        if self._lightweight_engine and self._lightweight_engine.is_loaded:
            data = self._lightweight_engine._data
            if data:
                stats = data.get("stats", {})
                status["precomputed_version"] = data.get("version")
                status["precomputed_generated_at"] = data.get("generated_at")
                status["precomputed_subject_count"] = stats.get("subject_count")
                status["precomputed_map_count"] = stats.get("subject_map_count")

        return status