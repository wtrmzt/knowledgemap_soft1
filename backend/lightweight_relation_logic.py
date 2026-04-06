"""
lightweight_relation_logic.py — 事前計算データを使った高速な関連科目推薦

このモジュールは precompute_relations.py で生成した pickle データを
アプリ起動時にロードし、ランタイムでは OpenAI Embedding 1回のみで
基礎/発展の関連科目を高速に返却する。

Usage (Flask app.py から):
    from lightweight_relation_logic import LightweightRelationEngine
    
    engine = LightweightRelationEngine("./precompute/precomputed_data.pkl")
    result = engine.find_temporal_relation(input_node_data)
"""

import os
import pickle
import logging
import operator
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)


class LightweightRelationEngine:
    """
    事前計算データを使った高速な関連科目推薦エンジン。
    
    - 起動時に pickle を1回ロード（~20MB、数百ミリ秒）
    - リクエスト時は embedding cosine 計算のみ（~100ミリ秒）
    - OpenAI Embedding 生成は呼び出し元で実行（~500ミリ秒）
    """

    def __init__(self, pkl_path: str, openai_client=None, embedding_model: str = "text-embedding-3-small"):
        self._loaded = False
        self._data = None
        self._openai_client = openai_client
        self._embedding_model = embedding_model
        
        # 設定パラメータ（time_relation_logic.py の Config に対応）
        self.TOP_K_SUBJECTS = 1
        self.TOP_N_NODES_IN_SUBGRAPH = 5
        self.WEIGHT_GAKUMON_SIM = 0.4
        self.WEIGHT_INPUT_NODE_SIM = 0.6

        if os.path.exists(pkl_path):
            self._load(pkl_path)
        else:
            logger.warning(f"事前計算データが見つかりません: {pkl_path}")

    # -----------------------------------------------------------------
    # データロード
    # -----------------------------------------------------------------

    def _load(self, pkl_path: str):
        """pickle ファイルをロード"""
        try:
            with open(pkl_path, "rb") as f:
                self._data = pickle.load(f)
            self._loaded = True
            v = self._data.get("version", "?")
            t = self._data.get("generated_at", "?")
            stats = self._data.get("stats", {})
            logger.info(
                f"事前計算データをロードしました (v{v}, {t}, "
                f"科目数={stats.get('subject_count', '?')}, "
                f"マップ科目数={stats.get('subject_map_count', '?')})"
            )
        except Exception as e:
            logger.error(f"事前計算データのロードに失敗: {e}")
            self._loaded = False

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    def set_openai_client(self, client):
        """OpenAI クライアントを後から設定"""
        self._openai_client = client

    # -----------------------------------------------------------------
    # Embedding 取得
    # -----------------------------------------------------------------

    def _get_embedding(self, text: str) -> Optional[np.ndarray]:
        """OpenAI Embedding を取得（ランタイム唯一のAPI呼び出し）"""
        if not self._openai_client:
            logger.warning("OpenAI クライアントが未設定です")
            return None
        if not text or not text.strip():
            return None

        try:
            text = text.replace("\n", " ").strip()
            response = self._openai_client.embeddings.create(
                input=[text],
                model=self._embedding_model,
            )
            vec = np.array(response.data[0].embedding, dtype=np.float32)
            return vec
        except Exception as e:
            logger.error(f"Embedding取得エラー: {e}")
            return None

    # -----------------------------------------------------------------
    # 類似度計算
    # -----------------------------------------------------------------

    @staticmethod
    def _cosine_similarity(vec: np.ndarray, matrix: np.ndarray) -> np.ndarray:
        """
        1ベクトル vs 行列の cosine 類似度を一括計算。
        matrix は L2正規化済みを想定。
        
        Args:
            vec: (D,) — 入力ベクトル
            matrix: (N, D) — 比較対象行列（L2正規化済み）
        
        Returns:
            (N,) — 各行との cosine 類似度
        """
        if vec is None or matrix is None or matrix.size == 0:
            return np.array([])

        # 入力ベクトルを L2 正規化
        norm = np.linalg.norm(vec)
        if norm == 0:
            return np.zeros(matrix.shape[0])
        vec_normalized = vec / norm

        # 正規化済み行列との内積 = cosine 類似度
        return matrix @ vec_normalized

    # -----------------------------------------------------------------
    # メイン処理: find_temporal_relation
    # -----------------------------------------------------------------

    def find_temporal_relation(self, input_node_data: dict) -> dict:
        """
        入力ノードに対する基礎/発展の関連科目を返す。
        
        Args:
            input_node_data: {
                "label": "動的計画法",
                "sentence": "複雑な問題を部分問題に分割し...",
                "extend_query": ["メモ化", "再帰"],  # optional
                "year": 3,                            # optional, default=3
                "id": "node_xxx"                      # optional
            }
        
        Returns:
            {
                "future_map": {"nodes": [...], "edges": [...]},
                "past_map": {"nodes": [...], "edges": [...]},
                "method": "lightweight",
                "error": null
            }
        """
        label = input_node_data.get("label", "")
        sentence = input_node_data.get("sentence", "")
        year = input_node_data.get("year", 3)
        base_node_id = input_node_data.get("id") or input_node_data.get("apiNodeId")

        # バリデーション
        if not label:
            return self._empty_result("入力ノードにラベルがありません")

        if not self._loaded:
            return self._empty_result("事前計算データが未ロードです")

        logger.info(f"[Lightweight] 関連科目検索: '{label}' (Year={year})")

        try:
            # 1. 入力ノードの embedding を取得
            input_embedding = self._get_embedding(f"{label} {sentence}")
            if input_embedding is None:
                return self._empty_result("Embedding の取得に失敗しました")

            # 2. 最も類似する学問分野を特定
            gakumon_matrix = self._data.get("gakumon_matrix")
            gakumon_labels = self._data.get("gakumon_labels", [])
            gakumon_fields = self._data.get("gakumon_fields", [])

            if gakumon_matrix is not None and gakumon_matrix.size > 0:
                sims = self._cosine_similarity(input_embedding, gakumon_matrix)
                best_idx = int(np.argmax(sims))
                best_field = gakumon_fields[best_idx] if best_idx < len(gakumon_fields) else None
                logger.info(f"  最類似学問分野: {gakumon_labels[best_idx]} (sim={sims[best_idx]:.4f})")
            else:
                best_field = None

            # 3. 発展（未来）科目の検索
            logger.info("  --- 発展科目の検索 ---")
            future_subjects = self._find_related_subjects(
                input_embedding, best_field, year, operator.gt
            )
            future_nodes, future_edges = self._generate_map(
                input_node_data, input_embedding, future_subjects
            )

            # 4. 基礎（過去）科目の検索
            logger.info("  --- 基礎科目の検索 ---")
            past_subjects = self._find_related_subjects(
                input_embedding, best_field, year, operator.lt
            )
            past_nodes, past_edges = self._generate_map(
                input_node_data, input_embedding, past_subjects
            )

            # 5. 基準ノードの除外
            if base_node_id:
                base_id_str = str(base_node_id)
                future_nodes = [n for n in future_nodes if str(n.get("id", "")) != base_id_str]
                past_nodes = [n for n in past_nodes if str(n.get("id", "")) != base_id_str]

            # 6. NaN → None 変換
            future_nodes = self._sanitize_records(future_nodes)
            past_nodes = self._sanitize_records(past_nodes)

            return {
                "future_map": {"nodes": future_nodes, "edges": future_edges},
                "past_map": {"nodes": past_nodes, "edges": past_edges},
                "method": "lightweight",
                "error": None,
            }

        except Exception as e:
            logger.error(f"[Lightweight] エラー: {e}", exc_info=True)
            return self._empty_result(f"処理中にエラーが発生しました: {str(e)}")

    # -----------------------------------------------------------------
    # 内部メソッド
    # -----------------------------------------------------------------

    def _find_related_subjects(
        self,
        input_embedding: np.ndarray,
        best_field: Optional[dict],
        input_year: int,
        op,
    ) -> list[dict]:
        """
        年次条件に合う科目の中から、類似度上位K件を返す。
        """
        subjects = self._data.get("subjects", [])
        
        # 年次フィルタ
        filtered = [s for s in subjects if s.get("year", 0) > 0 and op(s["year"], input_year)]
        if not filtered:
            logger.info(f"    年次条件に合う科目がありません (op={op.__name__}, year={input_year})")
            return []

        # 各科目との cosine 類似度を計算
        scored = []
        for s in filtered:
            s_emb = s.get("embedding")
            if s_emb is None:
                continue

            # 入力ノードとの類似度
            input_sim = self._cosine_single(input_embedding, s_emb)
            
            # 学問分野との類似度（もしあれば）
            if best_field and best_field.get("embedding") is not None:
                field_sim = self._cosine_single(best_field["embedding"], s_emb)
                total_sim = field_sim * self.WEIGHT_GAKUMON_SIM + input_sim * self.WEIGHT_INPUT_NODE_SIM
            else:
                total_sim = input_sim

            scored.append((total_sim, s))

        # 類似度降順ソート → 上位K件
        scored.sort(key=lambda x: x[0], reverse=True)
        top_k = scored[: self.TOP_K_SUBJECTS]

        for sim, s in top_k:
            logger.info(f"    → {s['label']} (Year={s['year']}, sim={sim:.4f})")

        return [s for _, s in top_k]

    def _generate_map(
        self,
        input_node_data: dict,
        input_embedding: np.ndarray,
        related_subjects: list[dict],
    ) -> tuple[list[dict], list[dict]]:
        """
        関連科目の部分木を結合して最終マップを生成する。
        """
        if not related_subjects:
            return [], []

        all_nodes = []
        all_edges = []

        # 入力ノード
        input_node_id = f"input_{input_node_data.get('label', 'unknown')}"
        all_nodes.append({
            "id": input_node_id,
            "label": input_node_data.get("label", ""),
            "group": "Input",
        })

        subject_maps = self._data.get("subject_maps", {})
        map_node_matrices = self._data.get("map_node_matrices", {})

        for subject in related_subjects:
            subject_name = subject.get("label", "")
            map_data = subject_maps.get(subject_name)
            mat_data = map_node_matrices.get(subject_name)

            if not map_data or not mat_data:
                logger.info(f"    {subject_name}: マップデータなし（スキップ）")
                continue

            # 科目マップ内の各ノードと入力ノードの類似度
            matrix = mat_data.get("matrix")
            node_ids = mat_data.get("node_ids", [])
            nodes = map_data.get("nodes", [])
            edges = map_data.get("edges", [])

            if matrix is None or matrix.size == 0:
                continue

            sims = self._cosine_similarity(input_embedding, matrix)

            # 最も類似度が高いノード = エントリーポイント
            best_idx = int(np.argmax(sims))
            entry_point_id = node_ids[best_idx] if best_idx < len(node_ids) else None

            if entry_point_id is None:
                continue

            # 部分木抽出
            subgraph_nodes, subgraph_edges = self._extract_subgraph(
                entry_point_id, nodes, edges, sims, node_ids, map_data.get("root_id")
            )

            if not subgraph_nodes:
                continue

            # ノードに group 情報を付与
            for n in subgraph_nodes:
                n["group"] = subject_name

            all_nodes.extend(subgraph_nodes)

            # 入力ノードからエントリーポイントへのエッジ
            all_edges.append({"source": input_node_id, "target": entry_point_id})
            all_edges.extend(subgraph_edges)

            logger.info(f"    {subject_name}: {len(subgraph_nodes)}N/{len(subgraph_edges)}E (entry={entry_point_id})")

        # 重複排除
        seen_ids = set()
        unique_nodes = []
        for n in all_nodes:
            nid = n.get("id")
            if nid and nid not in seen_ids:
                seen_ids.add(nid)
                unique_nodes.append(n)

        seen_edges = set()
        unique_edges = []
        for e in all_edges:
            key = (e.get("source"), e.get("target"))
            if key not in seen_edges:
                seen_edges.add(key)
                unique_edges.append(e)

        return unique_nodes, unique_edges

    def _extract_subgraph(
        self,
        entry_point_id: str,
        nodes: list[dict],
        edges: list[dict],
        sims: np.ndarray,
        node_ids: list[str],
        root_id: Optional[str],
    ) -> tuple[list[dict], list[dict]]:
        """
        エントリーポイントを起点に部分木を抽出する。
        time_relation_logic.py の extract_subgraph_from_subject_map に対応。
        """
        # ノードID → index のマッピング
        id_to_idx = {nid: i for i, nid in enumerate(node_ids)}
        id_to_node = {n["id"]: n for n in nodes}

        if entry_point_id.endswith("_0"):
            # ケース1: ルートノードが最類似 → 子ノードから上位N件を抽出
            child_edges = [e for e in edges if e["source"] == entry_point_id]
            child_ids = {e["target"] for e in child_edges}.union({entry_point_id})

            # 子ノード＋ルートノードの中から類似度上位を選択
            candidates = []
            for nid in child_ids:
                idx = id_to_idx.get(nid)
                if idx is not None and idx < len(sims):
                    candidates.append((sims[idx], nid))
            candidates.sort(key=lambda x: x[0], reverse=True)

            selected_ids = {nid for _, nid in candidates[: self.TOP_N_NODES_IN_SUBGRAPH]}
            subgraph_nodes = [
                self._node_to_record(id_to_node[nid])
                for nid in selected_ids if nid in id_to_node
            ]
            subgraph_edges = [
                e for e in edges
                if e["source"] in selected_ids and e["target"] in selected_ids
            ]
        else:
            # ケース2: 個別ノードが最類似 → ルートまでの経路を抽出
            # エッジの逆引き（target → source）
            parent_map = {}
            for e in edges:
                parent_map[e["target"]] = e["source"]

            path_nodes = {}
            path_edges = []
            current = entry_point_id

            for _ in range(len(nodes)):  # 無限ループ防止
                if current in id_to_node:
                    path_nodes[current] = id_to_node[current]
                else:
                    break

                if current.endswith("_0"):
                    break

                parent = parent_map.get(current)
                if not parent:
                    break

                path_edges.append({"source": parent, "target": current})
                current = parent

            subgraph_nodes = [self._node_to_record(n) for n in path_nodes.values()]
            subgraph_edges = path_edges

        return subgraph_nodes, subgraph_edges

    @staticmethod
    def _node_to_record(node: dict) -> dict:
        """ノード辞書からフロントエンド用レコードに変換（embeddingは除外）"""
        return {
            "id": node.get("id", ""),
            "label": node.get("label", ""),
            "sentence": node.get("sentence", ""),
        }

    @staticmethod
    def _cosine_single(a: np.ndarray, b: np.ndarray) -> float:
        """2ベクトル間の cosine 類似度"""
        if a is None or b is None:
            return 0.0
        dot = np.dot(a, b)
        na, nb = np.linalg.norm(a), np.linalg.norm(b)
        if na == 0 or nb == 0:
            return 0.0
        return float(dot / (na * nb))

    @staticmethod
    def _sanitize_records(records: list[dict]) -> list[dict]:
        """NaN を None に変換"""
        sanitized = []
        for r in records:
            clean = {}
            for k, v in r.items():
                if isinstance(v, float) and np.isnan(v):
                    clean[k] = None
                elif isinstance(v, (set, frozenset)):
                    clean[k] = list(v)
                elif isinstance(v, np.ndarray):
                    continue  # embedding はフロントエンドに送らない
                else:
                    clean[k] = v
            sanitized.append(clean)
        return sanitized

    @staticmethod
    def _empty_result(error_msg: str = None) -> dict:
        """空の結果を返す"""
        result = {
            "future_map": {"nodes": [], "edges": []},
            "past_map": {"nodes": [], "edges": []},
            "method": "lightweight",
        }
        if error_msg:
            result["error"] = error_msg
            logger.warning(f"[Lightweight] {error_msg}")
        return result