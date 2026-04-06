#!/usr/bin/env python3
"""
precompute_relations.py — 時系列関連データの事前計算バッチスクリプト

Usage:
    python precompute_relations.py \
        --database-dir ./UECsubject_maps11/ \
        --master-csv   ./combined_data_regex.csv \
        --output       ./precomputed_data.pkl

概要:
    1. マスタCSV（学問分野・科目）を読み込み、embedding/QID等を前処理
    2. 全科目マップCSV（nodes + edges）を読み込み、同様に前処理
    3. 全データを pickle ファイルに出力
    4. アプリ起動時にこの pickle を読み込んで高速に類似度計算する
"""

import os
import sys
import json
import pickle
import glob
import re
import time
import logging
import argparse
from datetime import datetime
from typing import Optional

import numpy as np
import pandas as pd

# =============================================================================
# 0. ログ設定
# =============================================================================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


# =============================================================================
# 1. ヘルパー関数
# =============================================================================

def to_set(x) -> set:
    """CSV の QID カラム（カンマ区切り文字列）を set に変換"""
    if pd.isna(x) or not str(x).strip():
        return set()
    return set(str(x).split(","))


def to_vec(x) -> Optional[np.ndarray]:
    """CSV の embedding カラム（JSON 配列文字列）を numpy array に変換"""
    if isinstance(x, np.ndarray):
        return x
    if isinstance(x, str) and x.startswith("["):
        try:
            return np.array(json.loads(x), dtype=np.float32)
        except (json.JSONDecodeError, ValueError):
            return None
    return None


def safe_load_csv(path: str) -> Optional[pd.DataFrame]:
    """CSV を安全に読み込む"""
    try:
        df = pd.read_csv(path)
        logger.info(f"  ✓ {path} ({len(df)} rows)")
        return df
    except FileNotFoundError:
        logger.error(f"  ✗ ファイルが見つかりません: {path}")
        return None
    except Exception as e:
        logger.error(f"  ✗ 読み込みエラー ({path}): {e}")
        return None


# =============================================================================
# 2. マスタデータ前処理
# =============================================================================

# CSVカラム名（time_relation_logic.py の Config に合わせる）
COL_ID = "id"
COL_LABEL = "label"
COL_SENTENCE = "sentence"
COL_YEAR = "year"
COL_REP_QID = "representative_qid"
COL_ALL_QIDS = "all_node_qids"
COL_NEIGHBORING_QIDS = "neighboring_qids"
COL_EMBEDDING = "embedding_openai"
EDGE_COL_SOURCE = "source"
EDGE_COL_TARGET = "target"


def preprocess_master_row(row: pd.Series) -> dict:
    """マスタCSVの1行を前処理して辞書に変換"""
    embedding = to_vec(row.get(COL_EMBEDDING))
    all_qids = to_set(row.get(COL_ALL_QIDS))
    neighboring_qids = to_set(row.get(COL_NEIGHBORING_QIDS))

    return {
        "label": str(row.get(COL_LABEL, "")),
        "year": int(row.get(COL_YEAR, 0)) if pd.notna(row.get(COL_YEAR)) else 0,
        "embedding": embedding,
        "all_qids": all_qids,
        "neighboring_qids": neighboring_qids,
        "rep_qid": str(row.get(COL_REP_QID, "")) if pd.notna(row.get(COL_REP_QID)) else "",
    }


def preprocess_master_csv(csv_path: str) -> tuple[list[dict], list[dict]]:
    """
    マスタCSVを読み込み、学問分野リストと科目リストに分けて前処理する。
    
    注: combined_data_regex.csv が学問分野と科目の両方を含むと想定。
        もし別々のCSVの場合は、この関数を2回呼ぶか引数を変更してください。
    
    Returns:
        (gakumon_fields, subjects) のタプル
    """
    df = safe_load_csv(csv_path)
    if df is None:
        return [], []

    records = []
    for _, row in df.iterrows():
        records.append(preprocess_master_row(row))

    # 学問分野と科目の区別
    # ※ 実際のCSV構造に応じて修正が必要
    # 現状は全レコードを subjects として扱い、gakumon は同一とする
    logger.info(f"  → マスタデータ: {len(records)} レコード")
    return records, records  # (gakumon, subjects) — 同一CSVの場合


# =============================================================================
# 3. 科目マップCSV前処理
# =============================================================================

def preprocess_map_node(row: pd.Series) -> dict:
    """科目マップCSVのノード1行を前処理"""
    embedding = to_vec(row.get(COL_EMBEDDING))
    all_qids = to_set(row.get(COL_ALL_QIDS))
    neighboring_qids = to_set(row.get(COL_NEIGHBORING_QIDS))

    return {
        "id": str(row.get(COL_ID, "")),
        "label": str(row.get(COL_LABEL, "")),
        "sentence": str(row.get(COL_SENTENCE, "")) if pd.notna(row.get(COL_SENTENCE)) else "",
        "embedding": embedding,
        "all_qids": all_qids,
        "neighboring_qids": neighboring_qids,
        "rep_qid": str(row.get(COL_REP_QID, "")) if pd.notna(row.get(COL_REP_QID)) else "",
        "year": int(row.get(COL_YEAR, 0)) if pd.notna(row.get(COL_YEAR)) else 0,
    }


def load_subject_map(database_dir: str, subject_name: str) -> Optional[dict]:
    """
    1科目分のマップCSV（nodes + edges）を読み込んで前処理する。
    
    Returns:
        {
            "nodes": [{"id": ..., "label": ..., "embedding": ..., ...}, ...],
            "edges": [{"source": ..., "target": ...}, ...],
            "root_id": "科目名_0" or None
        }
    """
    nodes_path = os.path.join(database_dir, f"subject_map_{subject_name}_nodes.csv")
    edges_path = os.path.join(database_dir, f"subject_map_{subject_name}_edges.csv")

    df_nodes = safe_load_csv(nodes_path)
    if df_nodes is None or df_nodes.empty:
        return None

    # ノード前処理
    nodes = []
    root_id = None
    for _, row in df_nodes.iterrows():
        node = preprocess_map_node(row)
        nodes.append(node)
        # ルートノードの特定（IDが _0 で終わるもの）
        if node["id"].endswith("_0"):
            root_id = node["id"]

    # エッジ読み込み
    edges = []
    df_edges = safe_load_csv(edges_path)
    if df_edges is not None and not df_edges.empty:
        for _, row in df_edges.iterrows():
            edges.append({
                "source": str(row.get(EDGE_COL_SOURCE, "")),
                "target": str(row.get(EDGE_COL_TARGET, "")),
            })

    return {
        "nodes": nodes,
        "edges": edges,
        "root_id": root_id,
        "node_count": len(nodes),
        "edge_count": len(edges),
    }


def discover_subject_names(database_dir: str) -> list[str]:
    """
    UECsubject_maps11/ ディレクトリ内の nodes CSV からすべての科目名を抽出する。
    ファイル名パターン: subject_map_<科目名>_nodes.csv
    """
    pattern = os.path.join(database_dir, "subject_map_*_nodes.csv")
    files = glob.glob(pattern)
    
    names = []
    for f in files:
        basename = os.path.basename(f)
        # "subject_map_アルゴリズム論第二_nodes.csv" → "アルゴリズム論第二"
        match = re.match(r"subject_map_(.+)_nodes\.csv", basename)
        if match:
            names.append(match.group(1))
    
    names.sort()
    return names


# =============================================================================
# 4. QID キャッシュ構築（オプション）
# =============================================================================

def build_qid_cache(subject_maps: dict, gakumon_fields: list, subjects: list) -> dict:
    """
    全データからラベル→QIDの対応表を構築する。
    ランタイムでWikidata検索を回避するためのキャッシュ。
    """
    cache = {}
    
    # マスタデータのラベル → rep_qid
    for entry in gakumon_fields + subjects:
        label = entry.get("label", "")
        rep_qid = entry.get("rep_qid", "")
        if label and rep_qid and not rep_qid.startswith("Q_"):
            cache[label] = rep_qid
    
    # 科目マップのノードラベル → rep_qid
    for subject_name, map_data in subject_maps.items():
        for node in map_data["nodes"]:
            label = node.get("label", "")
            rep_qid = node.get("rep_qid", "")
            if label and rep_qid and not rep_qid.startswith("Q_"):
                if label not in cache:
                    cache[label] = rep_qid
    
    return cache


# =============================================================================
# 5. embedding → numpy 配列の圧縮変換
# =============================================================================

def build_embedding_matrix(entries: list[dict]) -> tuple[np.ndarray, list[str]]:
    """
    エントリリストから embedding 行列と対応するラベルリストを構築する。
    ランタイムで一括 cosine 計算するために使用。
    
    Returns:
        (matrix: [N, D], labels: [N])
    """
    valid_entries = []
    labels = []
    
    for entry in entries:
        emb = entry.get("embedding")
        if emb is not None and isinstance(emb, np.ndarray) and emb.size > 0:
            valid_entries.append(emb)
            labels.append(entry.get("label", ""))
    
    if not valid_entries:
        return np.array([]), []
    
    matrix = np.vstack(valid_entries).astype(np.float32)
    # L2正規化（cosine類似度を内積で計算可能にする）
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    norms[norms == 0] = 1.0  # ゼロ除算防止
    matrix = matrix / norms
    
    return matrix, labels


# =============================================================================
# 6. 統計情報の収集
# =============================================================================

def compute_stats(data: dict) -> dict:
    """事前計算データの統計情報"""
    stats = {
        "gakumon_count": len(data.get("gakumon_fields", [])),
        "subject_count": len(data.get("subjects", [])),
        "subject_map_count": len(data.get("subject_maps", {})),
        "total_map_nodes": 0,
        "total_map_edges": 0,
        "subjects_with_maps": [],
        "subjects_without_maps": [],
        "embedding_dim": 0,
        "qid_cache_size": len(data.get("qid_cache", {})),
    }
    
    for name, map_data in data.get("subject_maps", {}).items():
        n = map_data.get("node_count", 0)
        e = map_data.get("edge_count", 0)
        stats["total_map_nodes"] += n
        stats["total_map_edges"] += e
        stats["subjects_with_maps"].append(f"{name} ({n}N/{e}E)")
    
    # embedding次元数の確認
    for entry in data.get("subjects", []):
        emb = entry.get("embedding")
        if emb is not None and isinstance(emb, np.ndarray):
            stats["embedding_dim"] = emb.shape[0]
            break
    
    return stats


# =============================================================================
# 7. メインバッチ処理
# =============================================================================

def run_precomputation(
    database_dir: str,
    master_csv: str,
    output_path: str,
):
    """
    事前計算のメインルーチン。
    
    Args:
        database_dir: UECsubject_maps11/ のパス
        master_csv:   combined_data_regex.csv のパス
        output_path:  出力 pickle ファイルのパス
    """
    start_time = time.time()
    logger.info("=" * 60)
    logger.info("事前計算バッチ処理を開始します")
    logger.info("=" * 60)

    # ------------------------------------------------------------------
    # Step 1: マスタCSV読み込み
    # ------------------------------------------------------------------
    logger.info("\n[Step 1/5] マスタCSVの読み込みと前処理...")
    gakumon_fields, subjects = preprocess_master_csv(master_csv)
    
    if not subjects:
        logger.error("マスタCSVの読み込みに失敗しました。処理を中断します。")
        sys.exit(1)

    logger.info(f"  学問分野: {len(gakumon_fields)} 件")
    logger.info(f"  科目: {len(subjects)} 件")

    # 年次分布
    years = [s["year"] for s in subjects if s["year"] > 0]
    if years:
        logger.info(f"  年次分布: min={min(years)}, max={max(years)}, unique={sorted(set(years))}")

    # ------------------------------------------------------------------
    # Step 2: 科目マップCSV読み込み
    # ------------------------------------------------------------------
    logger.info("\n[Step 2/5] 科目マップCSVの読み込みと前処理...")
    subject_names = discover_subject_names(database_dir)
    logger.info(f"  検出された科目数: {len(subject_names)}")

    subject_maps = {}
    for name in subject_names:
        logger.info(f"\n  --- {name} ---")
        map_data = load_subject_map(database_dir, name)
        if map_data:
            subject_maps[name] = map_data
            logger.info(f"  → {map_data['node_count']} ノード, {map_data['edge_count']} エッジ, ルート: {map_data['root_id']}")
        else:
            logger.warning(f"  → マップデータなし（スキップ）")

    # ------------------------------------------------------------------
    # Step 3: embedding 行列の構築
    # ------------------------------------------------------------------
    logger.info("\n[Step 3/5] embedding 行列の構築...")
    
    # 科目マスタの embedding 行列
    subject_matrix, subject_labels = build_embedding_matrix(subjects)
    logger.info(f"  科目マスタ embedding 行列: {subject_matrix.shape}")
    
    # 学問分野の embedding 行列
    gakumon_matrix, gakumon_labels = build_embedding_matrix(gakumon_fields)
    logger.info(f"  学問分野 embedding 行列: {gakumon_matrix.shape}")

    # 各科目マップのノード embedding 行列
    map_node_matrices = {}
    for name, map_data in subject_maps.items():
        mat, labels = build_embedding_matrix(map_data["nodes"])
        if mat.size > 0:
            map_node_matrices[name] = {
                "matrix": mat,
                "labels": labels,
                "node_ids": [n["id"] for n in map_data["nodes"] if n.get("embedding") is not None],
            }
            logger.info(f"  {name}: {mat.shape}")

    # ------------------------------------------------------------------
    # Step 4: QID キャッシュ構築
    # ------------------------------------------------------------------
    logger.info("\n[Step 4/5] QIDキャッシュの構築...")
    qid_cache = build_qid_cache(subject_maps, gakumon_fields, subjects)
    logger.info(f"  キャッシュエントリ数: {len(qid_cache)}")

    # ------------------------------------------------------------------
    # Step 5: pickle 出力
    # ------------------------------------------------------------------
    logger.info("\n[Step 5/5] pickle ファイルの出力...")
    
    output_data = {
        "version": "1.0",
        "generated_at": datetime.now().isoformat(),
        
        # マスタデータ
        "gakumon_fields": gakumon_fields,
        "subjects": subjects,
        
        # 科目マップデータ
        "subject_maps": subject_maps,
        
        # 高速検索用 embedding 行列（L2正規化済み）
        "subject_matrix": subject_matrix,
        "subject_labels": subject_labels,
        "gakumon_matrix": gakumon_matrix,
        "gakumon_labels": gakumon_labels,
        "map_node_matrices": map_node_matrices,
        
        # QID キャッシュ
        "qid_cache": qid_cache,
    }

    # 統計情報
    stats = compute_stats(output_data)
    output_data["stats"] = stats

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    with open(output_path, "wb") as f:
        pickle.dump(output_data, f, protocol=pickle.HIGHEST_PROTOCOL)

    file_size_mb = os.path.getsize(output_path) / (1024 * 1024)
    elapsed = time.time() - start_time

    logger.info(f"\n  出力: {output_path} ({file_size_mb:.1f} MB)")
    logger.info(f"  処理時間: {elapsed:.1f} 秒")

    # ------------------------------------------------------------------
    # 統計サマリー
    # ------------------------------------------------------------------
    logger.info("\n" + "=" * 60)
    logger.info("事前計算完了 — サマリー")
    logger.info("=" * 60)
    logger.info(f"  学問分野数:       {stats['gakumon_count']}")
    logger.info(f"  科目数:           {stats['subject_count']}")
    logger.info(f"  マップ科目数:     {stats['subject_map_count']}")
    logger.info(f"  マップノード合計: {stats['total_map_nodes']}")
    logger.info(f"  マップエッジ合計: {stats['total_map_edges']}")
    logger.info(f"  embedding次元:    {stats['embedding_dim']}")
    logger.info(f"  QIDキャッシュ:    {stats['qid_cache_size']} エントリ")
    logger.info(f"  出力サイズ:       {file_size_mb:.1f} MB")
    logger.info(f"  処理時間:         {elapsed:.1f} 秒")

    if stats["subjects_with_maps"]:
        logger.info(f"\n  マップあり科目:")
        for s in stats["subjects_with_maps"]:
            logger.info(f"    - {s}")

    return output_data


# =============================================================================
# 8. エントリポイント
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="時系列関連データの事前計算バッチスクリプト"
    )
    parser.add_argument(
        "--database-dir",
        default="./UECsubject_maps11/",
        help="科目マップCSVが格納されたディレクトリ (default: ./UECsubject_maps11/)",
    )
    parser.add_argument(
        "--master-csv",
        default="./combined_data_regex.csv",
        help="学問分野・科目マスタCSVのパス (default: ./combined_data_regex.csv)",
    )
    parser.add_argument(
        "--output",
        default="./precompute/precomputed_data.pkl",
        help="出力 pickle ファイルのパス (default: ./precompute/precomputed_data.pkl)",
    )
    parser.add_argument(
        "--verify",
        action="store_true",
        help="出力ファイルの検証のみを実行",
    )

    args = parser.parse_args()

    if args.verify:
        verify_output(args.output)
    else:
        run_precomputation(args.database_dir, args.master_csv, args.output)


def verify_output(pkl_path: str):
    """出力 pickle ファイルの検証"""
    logger.info(f"検証: {pkl_path}")
    
    if not os.path.exists(pkl_path):
        logger.error("ファイルが存在しません")
        sys.exit(1)
    
    with open(pkl_path, "rb") as f:
        data = pickle.load(f)
    
    logger.info(f"  バージョン: {data.get('version')}")
    logger.info(f"  生成日時:   {data.get('generated_at')}")
    
    stats = data.get("stats", {})
    for k, v in stats.items():
        if not isinstance(v, list):
            logger.info(f"  {k}: {v}")
    
    # embedding 行列の形状確認
    sm = data.get("subject_matrix")
    if isinstance(sm, np.ndarray):
        logger.info(f"  subject_matrix shape: {sm.shape}")
    
    gm = data.get("gakumon_matrix")
    if isinstance(gm, np.ndarray):
        logger.info(f"  gakumon_matrix shape: {gm.shape}")
    
    for name, mat_data in data.get("map_node_matrices", {}).items():
        m = mat_data.get("matrix")
        if isinstance(m, np.ndarray):
            logger.info(f"  map_node_matrices[{name}]: {m.shape}")
    
    logger.info("検証完了 ✓")


if __name__ == "__main__":
    main()