#!/usr/bin/env python3
"""
test_phase2.py — Phase 2 の統合テスト

Flask アプリ環境をシミュレートして、
RelationService → LightweightRelationEngine の一連の動作を検証する。

Usage:
    python test_phase2.py --pkl ./precomputed_data.pkl
"""

import sys
import os
import time
import json
import argparse
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# Phase 1 / Phase 2 のモジュールパスを追加
sys.path.insert(0, os.path.dirname(__file__))


def test_lightweight_engine(pkl_path: str):
    """LightweightRelationEngine の単体テスト"""
    from lightweight_relation_logic import LightweightRelationEngine
    import numpy as np
    import pickle

    logger.info("=" * 60)
    logger.info("Test 1: LightweightRelationEngine 単体テスト")
    logger.info("=" * 60)

    engine = LightweightRelationEngine(pkl_path)
    assert engine.is_loaded, "エンジンのロードに失敗"
    logger.info("  ✓ pickle ロード成功")

    # OpenAI なしでの呼び出し → エラーハンドリング確認
    result = engine.find_temporal_relation({"label": "テスト", "year": 3})
    assert result["method"] == "lightweight"
    assert result.get("error") is not None  # Embedding取得失敗のエラー
    logger.info("  ✓ OpenAI未設定時のエラーハンドリング OK")

    # ラベル無しでの呼び出し
    result = engine.find_temporal_relation({"label": "", "year": 3})
    assert result.get("error") is not None
    logger.info("  ✓ 空ラベルのバリデーション OK")

    # 内部の cosine 計算テスト（pickle データからダミー embedding を借りる）
    with open(pkl_path, "rb") as f:
        data = pickle.load(f)

    maps = data.get("subject_maps", {})
    if maps:
        first_subject = list(maps.keys())[0]
        nodes = maps[first_subject]["nodes"]
        emb_nodes = [n for n in nodes if n.get("embedding") is not None]
        if len(emb_nodes) >= 2:
            vec_a = emb_nodes[0]["embedding"]
            vec_b = emb_nodes[1]["embedding"]
            mat = data["map_node_matrices"][first_subject]["matrix"]

            sims = engine._cosine_similarity(vec_a, mat)
            assert sims.shape[0] == mat.shape[0], f"類似度配列のサイズ不正: {sims.shape}"
            assert np.max(sims) <= 1.01, f"類似度が1を超えている: {np.max(sims)}"
            logger.info(f"  ✓ cosine 一括計算 OK (shape={sims.shape}, max={np.max(sims):.4f})")

            single_sim = engine._cosine_single(vec_a, vec_b)
            assert 0.0 <= single_sim <= 1.01, f"単一cosine類似度が範囲外: {single_sim}"
            logger.info(f"  ✓ cosine 単一計算 OK (sim={single_sim:.4f})")

    logger.info("  → Test 1 完了 ✓\n")


def test_relation_service(pkl_path: str):
    """RelationService の統合テスト（Flask なしで擬似実行）"""
    from relation_service import RelationService

    logger.info("=" * 60)
    logger.info("Test 2: RelationService 統合テスト")
    logger.info("=" * 60)

    # Flask app を模擬する簡易クラス
    class MockApp:
        def __init__(self):
            self.config = {
                "PRECOMPUTED_DATA_PATH": pkl_path,
                "USE_LIGHTWEIGHT_RELATION": "true",
                "FALLBACK_HEAVY_RELATION": "false",  # テスト環境では重量版は無効
            }

    mock_app = MockApp()
    service = RelationService(mock_app)

    assert service._initialized, "サービスが初期化されていない"
    logger.info("  ✓ RelationService 初期化成功")

    # ステータス確認
    status = service.get_status()
    assert status["initialized"] is True
    assert status["lightweight_loaded"] is True
    logger.info(f"  ✓ ステータス OK: {json.dumps(status, default=str, ensure_ascii=False)}")

    # find_temporal_relation 呼び出し（OpenAI なし → エラーだが正常ハンドリング）
    result = service.find_temporal_relation({
        "label": "動的計画法",
        "sentence": "複雑な問題を部分問題に分割して解く手法",
        "year": 3,
    })
    assert "future_map" in result
    assert "past_map" in result
    assert "method" in result
    assert "response_time_ms" in result
    logger.info(
        f"  ✓ find_temporal_relation 応答 OK "
        f"(method={result['method']}, time={result['response_time_ms']}ms, "
        f"error={result.get('error', 'none')[:50] if result.get('error') else 'none'})"
    )

    logger.info("  → Test 2 完了 ✓\n")


def test_route_handler_simulation(pkl_path: str):
    """routes/relation.py のハンドラロジックを模擬テスト"""
    from relation_service import RelationService

    logger.info("=" * 60)
    logger.info("Test 3: ルートハンドラ模擬テスト")
    logger.info("=" * 60)

    class MockApp:
        def __init__(self):
            self.config = {
                "PRECOMPUTED_DATA_PATH": pkl_path,
                "USE_LIGHTWEIGHT_RELATION": "true",
                "FALLBACK_HEAVY_RELATION": "false",
            }

    mock_app = MockApp()
    service = RelationService(mock_app)

    # 正常リクエスト模擬
    test_cases = [
        {
            "name": "正常リクエスト",
            "body": {"label": "最短経路問題", "sentence": "グラフ上で最短経路を求める", "year": 2},
            "expect_error": True,  # OpenAI なしなのでエラーだが、ハンドリングは正常
        },
        {
            "name": "year省略（デフォルト3）",
            "body": {"label": "オートマトン", "sentence": "状態遷移"},
            "expect_error": True,
        },
        {
            "name": "extend_query付き",
            "body": {"label": "KMP", "extend_query": ["パターンマッチ", "文字列検索"], "year": 3},
            "expect_error": True,
        },
    ]

    for tc in test_cases:
        node_data = {
            "label": tc["body"].get("label"),
            "sentence": tc["body"].get("sentence", ""),
            "extend_query": tc["body"].get("extend_query", []),
            "year": tc["body"].get("year", 3),
            "id": tc["body"].get("id"),
        }

        start = time.time()
        result = service.find_temporal_relation(node_data)
        elapsed = (time.time() - start) * 1000

        assert "future_map" in result
        assert "past_map" in result
        logger.info(
            f"  ✓ [{tc['name']}] OK "
            f"(method={result.get('method')}, {elapsed:.0f}ms)"
        )

    logger.info("  → Test 3 完了 ✓\n")


def test_performance(pkl_path: str):
    """パフォーマンス測定"""
    from lightweight_relation_logic import LightweightRelationEngine
    import numpy as np
    import pickle

    logger.info("=" * 60)
    logger.info("Test 4: パフォーマンス測定")
    logger.info("=" * 60)

    # ロード時間
    start = time.time()
    engine = LightweightRelationEngine(pkl_path)
    load_ms = (time.time() - start) * 1000
    logger.info(f"  pickle ロード時間: {load_ms:.1f}ms")

    # cosine 一括計算時間
    with open(pkl_path, "rb") as f:
        data = pickle.load(f)

    for name, mat_data in data.get("map_node_matrices", {}).items():
        matrix = mat_data["matrix"]
        # ランダムベクトルで計測
        dummy_vec = np.random.randn(matrix.shape[1]).astype(np.float32)

        # ウォームアップ
        _ = engine._cosine_similarity(dummy_vec, matrix)

        # 計測（100回平均）
        times = []
        for _ in range(100):
            t0 = time.time()
            _ = engine._cosine_similarity(dummy_vec, matrix)
            times.append((time.time() - t0) * 1000)

        avg_ms = sum(times) / len(times)
        logger.info(
            f"  cosine一括({name}, {matrix.shape[0]}ノード): "
            f"平均 {avg_ms:.3f}ms / 回"
        )

    # メモリ使用量（概算）
    pkl_size = os.path.getsize(pkl_path) / (1024 * 1024)
    logger.info(f"  pickle サイズ: {pkl_size:.1f} MB")

    logger.info("  → Test 4 完了 ✓\n")


def main():
    parser = argparse.ArgumentParser(description="Phase 2 統合テスト")
    parser.add_argument("--pkl", default="./precomputed_data.pkl", help="pickle ファイルパス")
    args = parser.parse_args()

    if not os.path.exists(args.pkl):
        logger.error(f"pickle ファイルが見つかりません: {args.pkl}")
        logger.error("先に precompute_relations.py を実行してください。")
        sys.exit(1)

    # Phase 1 のモジュールもパスに追加
    phase1_dir = os.path.join(os.path.dirname(__file__), "..", "phase1")
    if os.path.exists(phase1_dir):
        sys.path.insert(0, os.path.abspath(phase1_dir))

    test_lightweight_engine(args.pkl)
    test_relation_service(args.pkl)
    test_route_handler_simulation(args.pkl)
    test_performance(args.pkl)

    logger.info("=" * 60)
    logger.info("全テスト完了 ✓")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()