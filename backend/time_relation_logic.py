# time_relation_logic.py (アプリケーション組込版)
import os
import pandas as pd
import numpy as np
import json
import logging
import operator
import time
import requests
from functools import lru_cache
import spacy
from openai import OpenAI

# =============================================================================
# 0. 設定項目 (Configクラス)
# =============================================================================
class Config:
    # --- ファイルパス設定 (呼び出し元からの相対パスを想定) ---
    DATABASE_DIR = "./UECsubject_maps11/"
    GAKUMON_CSV_PATH = "./combined_data_regex.csv"
    SUBJECT_CSV_PATH = "./combined_data_regex.csv"

    # --- APIとモデル設定 ---
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "YOUR_OPENAI_API_KEY_HERE")
    OPENAI_EMBEDDING_MODEL = "text-embedding-3-small"
    
    WIKIDATA_API_ENDPOINT = "https://www.wikidata.org/w/api.php"
    WIKIDATA_SPARQL_ENDPOINT = "https://query.wikidata.org/sparql"
    WIKIDATA_HEADERS = {'User-Agent': 'KnowledgeMapTool/1.2 (flowergumi3@gmail.com)'}
    WIKIDATA_API_SLEEP = 0.05
    WIKIDATA_TIMEOUT = 30

    SIMILARITY_THRESHOLD = 0.0

    # --- CSV列名設定 ---
    COL_ID = 'id'
    COL_LABEL = 'label'
    COL_SENTENCE = 'sentence'
    COL_YEAR = 'year'
    COL_REP_QID = 'representative_qid'
    COL_ALL_QIDS = 'all_node_qids'
    COL_NEIGHBORING_QIDS = 'neighboring_qids'
    COL_EMBEDDING = 'embedding_openai'
    EDGE_COL_SOURCE = 'source'
    EDGE_COL_TARGET = 'target'
    
    # --- 計算パラメータ ---
    TOP_K_SUBJECTS = 3
    TOP_N_NODES_IN_SUBGRAPH = 5
    NEIGHBOR_MAX_QIDS_TO_EXPAND = 7
    NEIGHBOR_LIMIT_PER_DIRECTION = 15
    WEIGHT_GAKUMON_SIM = 0.4
    WEIGHT_INPUT_NODE_SIM = 0.6
    WEIGHT_REP_PATH = 0.4
    WEIGHT_NEIGHBOR_JACCARD = 0.3
    WEIGHT_EMBEDDING_COSINE = 0.3
    NEIGHBOR_OUTGOING_PROPS = ("P31", "P279", "P361", "P101", "P527", "P2579", "P178", "P400", "P179", "P106", "P276", "P800", "P166", "P272", "P495", "P127", "P138", "P159", "P176", "P463", "P30", "P36", "P17", "P47", "P136", "P155", "P156", "P840")
    NEIGHBOR_INCOMING_PROPS = ("P31", "P279", "P361", "P101", "P921", "P1433", "P3095", "P710", "P131", "P171", "P607", "P793", "P50", "P170", "P58", "P86", "P123", "P161", "P184", "P185")

# =============================================================================
# 1. グローバルクライアント・モデル初期化
# =============================================================================
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

client_openai = None
if Config.OPENAI_API_KEY and Config.OPENAI_API_KEY != "YOUR_OPENAI_API_KEY_HERE":
    try:
        client_openai = OpenAI(api_key=Config.OPENAI_API_KEY)
        logging.info("OpenAI APIクライアント初期化成功。")
    except Exception as e:
        logging.error(f"OpenAI APIクライアント初期化失敗: {e}")
else:
    logging.warning("OPENAI_API_KEY未設定またはデフォルト値のままです。OpenAI関連機能はスキップされます。")

nlp = None
try:
    nlp = spacy.load("ja_core_news_sm")
    logging.info("spaCy日本語モデルロード成功。")
except OSError:
    logging.error("spaCy日本語モデル'ja_core_news_sm'が見つかりません。`python -m spacy download ja_core_news_sm`を実行してください。")

# =============================================================================
# 2. ヘルパー関数群 (API連携と類似度計算)
# =============================================================================

@lru_cache(maxsize=16384)
def get_embedding_openai(text, model=Config.OPENAI_EMBEDDING_MODEL):
    if not client_openai or not text: return None
    try:
        text_to_embed = str(text).replace("\n", " ").strip()
        if not text_to_embed: return None
        response = client_openai.embeddings.create(input=[text_to_embed], model=model)
        return np.array(response.data[0].embedding)
    except Exception as e: 
        logging.error(f"OpenAI埋め込み取得エラー ('{text[:30]}...'): {e}")
        return None

@lru_cache(maxsize=16384)
def search_wikidata_entity_qid(term):
    if not term or not str(term).strip(): return None
    params = {"action": "wbsearchentities", "format": "json", "language": "ja", "uselang": "ja", "search": str(term).strip(), "limit": 1}
    try:
        response = requests.get(Config.WIKIDATA_API_ENDPOINT, params=params, timeout=Config.WIKIDATA_TIMEOUT, headers=Config.WIKIDATA_HEADERS)
        response.raise_for_status()
        results = response.json().get("search", [])
        return results[0].get("id") if results else None
    except Exception as e: 
        logging.debug(f"Wikidataエンティティ検索エラー (term='{term}'): {e}")
        return None

@lru_cache(maxsize=8192)
def get_qids_from_terms_list(terms_tuple):
    all_qids = set()
    if not terms_tuple: return all_qids
    for term in terms_tuple:
        qid = search_wikidata_entity_qid(term)
        if qid: all_qids.add(qid)
        time.sleep(Config.WIKIDATA_API_SLEEP)
    return all_qids

@lru_cache(maxsize=8192)
def get_neighbor_qids_for_node(initial_qids_tuple):
    if not initial_qids_tuple: return set()
    aggregated_neighbors, qids_processed_count = set(), 0
    for qid in initial_qids_tuple:
        if qids_processed_count >= Config.NEIGHBOR_MAX_QIDS_TO_EXPAND: break
        if not qid: continue
        union_blocks = []
        if Config.NEIGHBOR_OUTGOING_PROPS: union_blocks.append(f"{{ wd:{qid} ?prop_out ?related . VALUES ?prop_out {{ {' '.join(f'wdt:{p}' for p in Config.NEIGHBOR_OUTGOING_PROPS)} }} }}")
        if Config.NEIGHBOR_INCOMING_PROPS: union_blocks.append(f"{{ ?related ?prop_in wd:{qid} . VALUES ?prop_in {{ {' '.join(f'wdt:{p}' for p in Config.NEIGHBOR_INCOMING_PROPS)} }} }}")
        if not union_blocks: qids_processed_count += 1; continue
        sparql_query = f"SELECT DISTINCT ?related WHERE {{ {' UNION '.join(union_blocks)} FILTER(STRSTARTS(STR(?related), 'http://www.wikidata.org/entity/Q')) FILTER(?related != wd:{qid}) }} LIMIT {Config.NEIGHBOR_LIMIT_PER_DIRECTION}"
        try:
            response = requests.get(Config.WIKIDATA_SPARQL_ENDPOINT, headers={'Accept': 'application/sparql-results+json', **Config.WIKIDATA_HEADERS}, params={'query': sparql_query, 'format': 'json'}, timeout=Config.WIKIDATA_TIMEOUT)
            response.raise_for_status()
            for binding in response.json().get("results", {}).get("bindings", []):
                if (value_uri := binding.get("related", {}).get("value", "")).startswith("http://www.wikidata.org/entity/Q"): aggregated_neighbors.add(value_uri.split('/')[-1])
        except Exception as e: logging.error(f"SPARQL隣接QID取得エラー (qid='{qid}'): {e}")
        qids_processed_count += 1; time.sleep(Config.WIKIDATA_API_SLEEP / 2)
    return aggregated_neighbors

def calculate_jaccard_similarity(set1: set, set2: set) -> float:
    if not isinstance(set1, set) or not isinstance(set2, set) or not set1 or not set2: return 0.0
    intersection = len(set1.intersection(set2)); union = len(set1.union(set2))
    return intersection / union if union > 0 else 0.0

def calculate_cosine_similarity(vec1: np.ndarray, vec2: np.ndarray) -> float:
    if vec1 is None or vec2 is None or not isinstance(vec1, np.ndarray) or not isinstance(vec2, np.ndarray) or vec1.shape != vec2.shape: return 0.0
    dot_product = np.dot(vec1, vec2)
    norm_a, norm_b = np.linalg.norm(vec1), np.linalg.norm(vec2)
    if norm_a == 0 or norm_b == 0: return 0.0
    return dot_product / (norm_a * norm_b)

def calculate_representative_path_score(node1: dict, node2: dict) -> float:
    rep1, all1 = node1.get('rep_qid'), node1.get('all_qids', set())
    rep2, all2 = node2.get('rep_qid'), node2.get('all_qids', set())
    if rep1 and rep1 in all2: return 1.0
    if rep2 and rep2 in all1: return 1.0
    if all1 and all2 and not all1.isdisjoint(all2): return 0.5
    return 0.0

def calculate_final_node_similarity(node1: dict, node2: dict) -> float:
    path_sim = calculate_representative_path_score(node1, node2)
    neighbor_jaccard_sim = calculate_jaccard_similarity(node1.get('neighbor_qids', set()), node2.get('neighbor_qids', set()))
    embed_sim = calculate_cosine_similarity(node1.get('embedding'), node2.get('embedding'))
    return (path_sim * Config.WEIGHT_REP_PATH) + \
           (neighbor_jaccard_sim * Config.WEIGHT_NEIGHBOR_JACCARD) + \
           (embed_sim * Config.WEIGHT_EMBEDDING_COSINE)

def safe_load_csv(path: str) -> pd.DataFrame | None:
    try: return pd.read_csv(path)
    except FileNotFoundError: logging.error(f"ファイルが見つかりません: {path}"); return None
    except Exception as e: logging.error(f"ファイルの読み込み中にエラーが発生しました ({path}): {e}"); return None

# =============================================================================
# 3. 主要処理関数
# =============================================================================

def preprocess_master_data(df: pd.DataFrame) -> pd.DataFrame:
    def to_set(x): return set(str(x).split(',')) if pd.notna(x) and str(x).strip() else set()
    def to_vec(x): return np.array(json.loads(x)) if isinstance(x, str) and x.startswith('[') else None
    
    for col, converter in {Config.COL_ALL_QIDS: to_set, Config.COL_NEIGHBORING_QIDS: to_set, Config.COL_EMBEDDING: to_vec}.items():
        if col in df.columns: df[col] = df[col].apply(converter)
        else:
            logging.warning(f"前処理対象の列 '{col}' が見つかりません。空の列を生成します。")
            df[col] = [converter(None) for _ in range(len(df))]
    
    # ★ year 列の NaN を 0 に置換（int変換エラー防止）
    if Config.COL_YEAR in df.columns:
        df[Config.COL_YEAR] = pd.to_numeric(df[Config.COL_YEAR], errors='coerce').fillna(0).astype(int)
    
    return df

def create_input_node_features(label: str, sentence: str, extend_qid_list: list[str]) -> dict:
    logging.info(f"入力ノードの特徴量を生成中: {label}")
    all_concepts = {label, *extend_qid_list}
    logging.info(f"  QID生成のための検索ターム群: {list(all_concepts)}")

    all_qids = get_qids_from_terms_list(tuple(all_concepts))
    rep_qid = next(iter(get_qids_from_terms_list(tuple([label]))), f"Q_{label.replace(' ', '_')}")
    neighbor_qids = get_neighbor_qids_for_node(tuple(all_qids))
    embedding = get_embedding_openai(f"{label} {sentence}")
    
    input_node = {
        'rep_qid': rep_qid, 'all_qids': all_qids, 
        'neighbor_qids': neighbor_qids, 'embedding': embedding,
        Config.COL_LABEL: label
    }
    logging.info(f"入力ノード '{label}' の特徴量を生成しました (QID数: {len(all_qids)}, 隣接QID数: {len(neighbor_qids)})。")
    return input_node

def find_most_similar_academic_field(input_node: dict, gakumon_df: pd.DataFrame) -> pd.Series | None:
    logging.info("最も類似度の高い学問分野を特定しています...")
    if gakumon_df is None or gakumon_df.empty:
        logging.error("学問分野データが読み込めません。"); return None

    gakumon_df['similarity_to_input'] = gakumon_df.apply(
        lambda row: calculate_final_node_similarity(input_node, {
            'rep_qid': None,
            'all_qids': row.get(Config.COL_ALL_QIDS, set()),
            'neighbor_qids': row.get(Config.COL_NEIGHBORING_QIDS, set()),
            'embedding': row.get(Config.COL_EMBEDDING)
        }),
        axis=1
    )
    most_similar_field = gakumon_df.loc[gakumon_df['similarity_to_input'].idxmax()]
    logging.info(f"最も類似度の高い学問分野を特定: '{most_similar_field.get(Config.COL_LABEL, 'N/A')}' (類似度: {most_similar_field['similarity_to_input']:.4f})")
    return most_similar_field

def find_top_related_subjects(input_node: dict, academic_field: pd.Series, subject_df: pd.DataFrame, input_year: int, op: callable) -> pd.DataFrame:
    logging.info(f"関連科目を抽出 (学年条件: {op.__name__} {input_year})...")
    filtered_subjects = subject_df[op(subject_df[Config.COL_YEAR], input_year)].copy()
    if filtered_subjects.empty: 
        logging.warning("指定された学年条件に合う科目がありません。")
        return pd.DataFrame()
        
    academic_field_node = {'rep_qid': None, 'all_qids': academic_field.get(Config.COL_ALL_QIDS, set()), 'neighbor_qids': academic_field.get(Config.COL_NEIGHBORING_QIDS, set()), 'embedding': academic_field.get(Config.COL_EMBEDDING)}

    def calculate_total_similarity(subject_row):
        subject_node = {'rep_qid': None, 'all_qids': subject_row.get(Config.COL_ALL_QIDS, set()), 'neighbor_qids': subject_row.get(Config.COL_NEIGHBORING_QIDS, set()), 'embedding': subject_row.get(Config.COL_EMBEDDING)}
        sim_with_field = calculate_final_node_similarity(academic_field_node, subject_node)
        sim_with_input = calculate_final_node_similarity(input_node, subject_node)
        return (sim_with_field * Config.WEIGHT_GAKUMON_SIM) + (sim_with_input * Config.WEIGHT_INPUT_NODE_SIM)

    filtered_subjects['total_similarity'] = filtered_subjects.apply(calculate_total_similarity, axis=1)
    top_k = filtered_subjects.nlargest(Config.TOP_K_SUBJECTS, 'total_similarity')
    logging.info(f"上位{len(top_k)}件の関連科目を抽出しました。")
    return top_k

# --- ▼▼▼ ここからが修正対象の関数 ▼▼▼ ---

def extract_subgraph_from_subject_map(input_node: dict, subject_name: str) -> tuple[pd.DataFrame | None, pd.DataFrame | None, str | None]:
    """
    指定された科目のマップから、入力ノードに最も類似した部分木を抽出する。
    接続点がルートか否かで、部分木の抽出方法を変える。
    
    Returns:
        - 部分木を構成するノードのDataFrame
        - 部分木内のエッジのDataFrame
        - 部分木への接続点となるノードのID
    """
    logging.info(f"  科目 '{subject_name}' のマップから部分木を抽出しています...")
    nodes_path = os.path.join(Config.DATABASE_DIR, f"subject_map_{subject_name}_nodes.csv")
    edges_path = os.path.join(Config.DATABASE_DIR, f"subject_map_{subject_name}_edges.csv")
    
    df_map_nodes, df_map_edges = safe_load_csv(nodes_path), safe_load_csv(edges_path)
    if df_map_nodes is None or df_map_nodes.empty: 
        return None, None, None
        
    df_map_nodes = preprocess_master_data(df_map_nodes)

    # 1. 科目マップ内の各ノードと入力ノードとの類似度を計算
    df_map_nodes['similarity_to_input'] = df_map_nodes.apply(
        lambda row: calculate_final_node_similarity(input_node, {
            'rep_qid': row.get(Config.COL_REP_QID), 'all_qids': row.get(Config.COL_ALL_QIDS, set()),
            'neighbor_qids': row.get(Config.COL_NEIGHBORING_QIDS, set()), 'embedding': row.get(Config.COL_EMBEDDING)
        }),
        axis=1
    )
    
    # 2. 最も類似度が高いノードを「接続点（エントリーポイント）」候補として特定
    entry_point_node = df_map_nodes.loc[df_map_nodes['similarity_to_input'].idxmax()]
    entry_point_id = str(entry_point_node[Config.COL_ID])
    max_similarity = entry_point_node['similarity_to_input']

    # 3. 類似度が閾値未満の場合は、この科目を関連なしと判断し、何も返さない
    if max_similarity < Config.SIMILARITY_THRESHOLD:
        logging.info(f"    '{subject_name}' の最大類似度({max_similarity:.4f})が閾値を下回ったため、マップを生成しません。")
        return None, None, None

    # 4. 接続点の種類に応じて、部分木の抽出ロジックを分岐
    subgraph_nodes_df = pd.DataFrame()
    subgraph_edges_df = pd.DataFrame()


    if entry_point_id.endswith("_0"):
        # 【ケース1】 接続点が科目のルートノードの場合
        logging.info(f"    接続点がルートノード ({entry_point_id}) です。最も関連性の高い部分木を抽出します。")
        # 以前の安定したロジックを踏襲しつつ、子ノードに限定する機能を追加
        
        # a) ルートノードの直接の子ノードIDを取得
        child_edges_df = df_map_edges[df_map_edges[Config.EDGE_COL_SOURCE] == entry_point_id] if df_map_edges is not None else pd.DataFrame()
        child_node_ids = set(child_edges_df[Config.EDGE_COL_TARGET])
        
        # b) 科目マップ全体から、これらの子ノードとルートノードのみを抽出
        nodes_to_consider_ids = child_node_ids.union({entry_point_id})
        df_map_subset = df_map_nodes[df_map_nodes[Config.COL_ID].astype(str).isin(nodes_to_consider_ids)].copy()
        
        # c) 抽出したサブセットの中から、類似度上位のノードを部分木として最終決定
        subgraph_nodes_df = df_map_subset.nlargest(Config.TOP_N_NODES_IN_SUBGRAPH, 'similarity_to_input').copy()

        # d) 最終決定したノード間のエッジのみを抽出
        subgraph_node_ids = set(subgraph_nodes_df[Config.COL_ID].astype(str))
        subgraph_edges_df = df_map_edges[
            df_map_edges[Config.EDGE_COL_SOURCE].isin(subgraph_node_ids) &
            df_map_edges[Config.EDGE_COL_TARGET].isin(subgraph_node_ids)
        ].copy()
    else:
        # 【ケース2】 接続点が個別のノードの場合
        logging.info(f"    接続点が個別ノード ({entry_point_id}) です。ルートまでの経路を抽出します。")
        path_nodes, path_edges = {}, {}
        current_node_id = entry_point_id
        
        # エッジ情報を探索しやすいように準備
        if df_map_edges is not None and not df_map_edges.empty:
            df_map_edges.rename(columns={'from': 'source', 'to': 'target'}, inplace=True, errors='ignore')
            df_map_edges[Config.EDGE_COL_SOURCE] = df_map_edges[Config.EDGE_COL_SOURCE].astype(str)
            df_map_edges[Config.EDGE_COL_TARGET] = df_map_edges[Config.EDGE_COL_TARGET].astype(str)
            
            # 探索ループ
            for _ in range(len(df_map_nodes)): # 無限ループ防止
                node_data = df_map_nodes[df_map_nodes[Config.COL_ID].astype(str) == current_node_id]
                if node_data.empty: break
                path_nodes[current_node_id] = node_data.iloc[0]

                if current_node_id.endswith("_0"): break

                # 親ノードを探索
                parent_edge = df_map_edges[df_map_edges[Config.EDGE_COL_TARGET] == current_node_id]
                if parent_edge.empty: break
                
                parent_id = parent_edge.iloc[0][Config.EDGE_COL_SOURCE]
                path_edges[f"{parent_id}->{current_node_id}"] = parent_edge.iloc[0]
                current_node_id = parent_id
        
        if path_nodes:
            subgraph_nodes_df = pd.DataFrame(path_nodes.values())
        if path_edges:
            subgraph_edges_df = pd.DataFrame(path_edges.values())

    if subgraph_nodes_df.empty:
        return None, None, None

    logging.info(f"    '{subject_name}' から {len(subgraph_nodes_df)} ノード、{len(subgraph_edges_df)} エッジの部分木を抽出しました。接続点: ID {entry_point_id}")
    return subgraph_nodes_df, subgraph_edges_df, entry_point_id


def generate_final_map(input_node: dict, top_subjects_df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    関連する各科目のマップから抽出した部分木を結合し、最終的な知識マップを生成する。
    """
    final_nodes_list, final_edges_list = [], []
    
    # グラフの始点となる入力ノードを定義
    input_node_id = f"input_{input_node[Config.COL_LABEL]}"
    input_node_record = {
        'id': input_node_id, 
        'label': input_node[Config.COL_LABEL], 
        'group': 'Input',
        #'all_node_qids': list(input_node.get('all_qids', [])),
        'extend_query': list(input_node.get('all_qids', []))
    }
    final_nodes_list.append(pd.DataFrame([input_node_record]))
    
    # 関連する科目ごとに処理を実行
    for _, subject_row in top_subjects_df.iterrows():
        subject_name = subject_row[Config.COL_LABEL]
        
        # 科目マップから関連部分木とその接続点を抽出
        subgraph_nodes_df, subgraph_edges_df, entry_point_id = extract_subgraph_from_subject_map(input_node, subject_name)
        
        # 有効な部分木と接続点が得られた場合のみ処理を続行
        if subgraph_nodes_df is not None and not subgraph_nodes_df.empty and entry_point_id:
            
            # 1. 部分木のノードを最終リストに追加
            # ★★★ フロントエンドに必要な列のみを選択し、非シリアライズ可能データを除外 ★★★
            required_columns = [Config.COL_ID, Config.COL_LABEL, Config.COL_SENTENCE]
            # 存在する列のみを抽出
            cols_to_select = [col for col in required_columns if col in subgraph_nodes_df.columns]
            
            nodes_to_add = subgraph_nodes_df[cols_to_select].copy()
            nodes_to_add['group'] = subject_name
            
            # all_node_qids列をセットからリストに変換
            if Config.COL_ALL_QIDS in nodes_to_add.columns:
                 nodes_to_add[Config.COL_ALL_QIDS] = nodes_to_add[Config.COL_ALL_QIDS].apply(lambda s: list(s) if isinstance(s, set) else (s if isinstance(s, list) else []))
            
            # フロントエンドでのキー名統一のため、all_node_qidsをextend_queryにもコピー
            #if Config.COL_ALL_QIDS in nodes_to_add.columns:
            #    nodes_to_add['extend_query'] = nodes_to_add[Config.COL_ALL_QIDS]

            final_nodes_list.append(nodes_to_add)
            
            # 2. 入力ノードから部分木の接続点へのエッジを生成
            connection_edge = {Config.EDGE_COL_SOURCE: input_node_id, Config.EDGE_COL_TARGET: entry_point_id}
            final_edges_list.append(pd.DataFrame([connection_edge]))

            # 3. 部分木内部のエッジを最終リストに追加
            if subgraph_edges_df is not None and not subgraph_edges_df.empty:
                final_edges_list.append(subgraph_edges_df[[Config.EDGE_COL_SOURCE, Config.EDGE_COL_TARGET]])

    # 全てのノードとエッジを結合して最終的なDataFrameを作成
    if not final_nodes_list: 
        return pd.DataFrame(), pd.DataFrame()
        
    final_nodes_df = pd.concat(final_nodes_list, ignore_index=True).drop_duplicates(subset=['id'])
    
    if not final_edges_list:
        return final_nodes_df, pd.DataFrame(columns=[Config.EDGE_COL_SOURCE, Config.EDGE_COL_TARGET])
        
    final_edges_df = pd.concat(final_edges_list, ignore_index=True).drop_duplicates()
    
    return final_nodes_df, final_edges_df


# =============================================================================
# 4. メイン実行関数 (app.py から呼び出される)
# =============================================================================

def find_temporal_relation(input_node_data: dict) -> dict:
    """
    入力データに基づいて時間的関係性を持つ科目を特定し、
    未来(発展)と過去(基礎)の知識マップを辞書形式で返す。
    """
    label = input_node_data.get('label')
    extend_qid = input_node_data.get('extend_query', [])
    sentence = input_node_data.get('sentence', '')
    
    # ★ year の NaN/None 安全化
    import math
    _year_raw = input_node_data.get('year', 3)
    if _year_raw is None or (isinstance(_year_raw, float) and math.isnan(_year_raw)):
        year = 3
    else:
        try:
            year = int(_year_raw)
        except (ValueError, TypeError):
            year = 3

    # --- ▼▼▼ ここからが修正箇所 ▼▼▼ ---
    # labelがNoneまたは空文字の場合、処理を中断してエラーを返す
    if not label:
        error_msg = "入力ノードに有効なラベルが含まれていないため、処理を中断しました。"
        logging.error(f"Logic Error: {error_msg} (input_node_data: {input_node_data})")
        return {
            "future_map": {"nodes": [], "edges": []},
            "past_map": {"nodes": [], "edges": []},
            "error": error_msg
        }
    # --- ▲▲▲ 修正ここまで ▲▲▲ ---
    
    logging.info(f"Logic: Calculating temporal relation for '{label}' (Year: {year})")

    try:
        # 1. マスタデータ読み込みと前処理
        df_gakumon = safe_load_csv(Config.GAKUMON_CSV_PATH)
        df_subject = safe_load_csv(Config.SUBJECT_CSV_PATH)
        if df_gakumon is None or df_subject is None:
            raise FileNotFoundError("学問または科目のマスタファイルが見つかりません。")

        df_gakumon = preprocess_master_data(df_gakumon)
        df_subject = preprocess_master_data(df_subject)
        
        # 2. 入力ノードの特徴量生成
        input_node_feature = create_input_node_features(label, sentence, extend_qid)

        # 3. 最も類似した学問分野を特定
        most_similar_field = find_most_similar_academic_field(input_node_feature, df_gakumon)
        if most_similar_field is None:
            raise ValueError("類似する学問分野を特定できませんでした。")

        # 4. 未来 (発展) の関連マップ生成
        logging.info("\n--- 年次の高い(発展)科目群のマップ生成を開始 ---")
        top_future_subjects = find_top_related_subjects(input_node_feature, most_similar_field, df_subject, year, operator.gt)
        future_nodes_df, future_edges_df = generate_final_map(input_node_feature, top_future_subjects)

        # 5. 過去 (基礎) の関連マップ生成
        logging.info("\n--- 年次の低い(基礎)科目群のマップ生成を開始 ---")
        top_past_subjects = find_top_related_subjects(input_node_feature, most_similar_field, df_subject, year, operator.lt)
        past_nodes_df, past_edges_df = generate_final_map(input_node_feature, top_past_subjects)
   
        # 6. 基準ノードの重複を排除
        base_node_id = input_node_data.get('id') or input_node_data.get('apiNodeId')
        if base_node_id:
            base_node_id_str = str(base_node_id)
            logging.info(f"結果から基準ノード (ID: {base_node_id_str}) を除外します。")
            if 'future_nodes_df' in locals() and not future_nodes_df.empty and 'id' in future_nodes_df.columns:
                future_nodes_df = future_nodes_df[future_nodes_df['id'].astype(str) != base_node_id_str].copy()
            if 'past_nodes_df' in locals() and not past_nodes_df.empty and 'id' in past_nodes_df.columns:
                past_nodes_df = past_nodes_df[past_nodes_df['id'].astype(str) != base_node_id_str].copy()
        # --- ▼▼▼ ここからが修正箇所 ▼▼▼ ---
        # 7. JSONシリアライズのためのデータサニタイズ
        # NaN (Not a Number) はJSONに変換できないため、None (JavaScript側でnullになる) に置換する
        if 'future_nodes_df' in locals() and not future_nodes_df.empty:
            future_nodes_df = future_nodes_df.replace({np.nan: None})
        if 'past_nodes_df' in locals() and not past_nodes_df.empty:
            past_nodes_df = past_nodes_df.replace({np.nan: None})
        # --- ▲▲▲ 修正ここまで ▲▲▲ ---
        # 7. 結果をJSONシリアライズ可能な辞書形式に整形して返す
        return {
            "future_map": {
                "nodes": future_nodes_df.to_dict('records') if 'future_nodes_df' in locals() else [],
                "edges": future_edges_df.to_dict('records') if 'future_edges_df' in locals() else []
            },
            "past_map": {
                "nodes": past_nodes_df.to_dict('records') if 'past_nodes_df' in locals() else [],
                "edges": past_edges_df.to_dict('records') if 'past_edges_df' in locals() else []
            }
        }
    
    except (FileNotFoundError, ValueError) as e:
        logging.error(f"Logic Error: {e}", exc_info=True)
        return {
            "future_map": {"nodes": [], "edges": []},
            "past_map": {"nodes": [], "edges": []},
            "error": str(e)
        }
    except Exception as e:
        logging.error(f"Logic Error: An unexpected error occurred for '{label}': {e}", exc_info=True)
        return {
            "future_map": {"nodes": [], "edges": []},
            "past_map": {"nodes": [], "edges": []},
            "error": "An unexpected error occurred."
        }