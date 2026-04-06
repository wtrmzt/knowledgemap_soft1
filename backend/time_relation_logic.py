"""
時系列関連ノード算出モジュール
概念（ノード）に関連する「過去（基礎）」と「未来（発展）」の科目を提案する
OpenAI Embedding + Wikidata を統合した類似度計算を行う
"""
import os
import logging
import pandas as pd
from typing import Optional

logger = logging.getLogger(__name__)

# 科目CSVデータのキャッシュ
_subjects_df: Optional[pd.DataFrame] = None
SUBJECT_DATA_DIR = os.path.join(os.path.dirname(__file__), "UECsubject_maps11")


def _load_subjects() -> pd.DataFrame:
    """科目データをCSVから読み込み（キャッシュ付き）"""
    global _subjects_df
    if _subjects_df is not None:
        return _subjects_df

    all_data = []
    if os.path.exists(SUBJECT_DATA_DIR):
        for fname in os.listdir(SUBJECT_DATA_DIR):
            if fname.endswith(".csv"):
                try:
                    fpath = os.path.join(SUBJECT_DATA_DIR, fname)
                    df = pd.read_csv(fpath, encoding="utf-8")
                    all_data.append(df)
                except Exception as e:
                    logger.warning(f"CSV読み込みエラー ({fname}): {e}")

    if all_data:
        _subjects_df = pd.concat(all_data, ignore_index=True)
    else:
        # サンプルデータ
        _subjects_df = pd.DataFrame({
            "subject_name": [
                "プログラミング基礎", "データ構造とアルゴリズム", "離散数学",
                "線形代数", "確率統計", "機械学習入門",
                "深層学習", "自然言語処理", "コンピュータアーキテクチャ",
                "オペレーティングシステム", "コンピュータネットワーク", "データベース論",
                "ソフトウェア工学", "情報セキュリティ", "人工知能",
            ],
            "year": [1, 2, 1, 1, 2, 3, 3, 3, 2, 2, 2, 2, 3, 3, 3],
            "keywords": [
                "プログラミング,Python,変数,制御構造",
                "リスト,木,ソート,探索,計算量",
                "論理,集合,グラフ理論,組み合わせ",
                "行列,ベクトル,固有値,線形写像",
                "確率分布,推定,検定,回帰",
                "教師あり学習,分類,回帰,特徴量",
                "ニューラルネットワーク,CNN,RNN,誤差逆伝播",
                "形態素解析,word2vec,Transformer,BERT",
                "CPU,メモリ,キャッシュ,パイプライン",
                "プロセス,スレッド,メモリ管理,ファイルシステム",
                "TCP/IP,ルーティング,HTTP,DNS",
                "SQL,正規化,トランザクション,インデックス",
                "設計パターン,テスト,アジャイル,UML",
                "暗号,認証,脆弱性,ファイアウォール",
                "探索,推論,知識表現,エージェント",
            ],
        })
    return _subjects_df


def find_temporal_relation(
    concept: str,
    embedding_similarity_fn=None,
    wikidata_similarity_fn=None,
    top_k: int = 3,
    embedding_weight: float = 0.6,
    wikidata_weight: float = 0.4,
) -> dict:
    """
    入力概念に対する基礎（過去）科目と発展（未来）科目を提案

    Args:
        concept: 入力概念のキーワード
        embedding_similarity_fn: (concept, subject_keywords) -> float
        wikidata_similarity_fn: (concept, subject_name) -> float
        top_k: 返す科目数
        embedding_weight: Embedding類似度の重み
        wikidata_weight: Wikidata類似度の重み

    Returns:
        {"past": [...], "future": [...]} 各要素は {"subject_name", "year", "score"}
    """
    subjects = _load_subjects()
    if subjects.empty:
        return {"past": [], "future": []}

    scores = []
    for _, row in subjects.iterrows():
        subject_name = row.get("subject_name", "")
        keywords = row.get("keywords", "")
        year = row.get("year", 0)

        # 統合類似度の計算
        total_score = 0.0
        if embedding_similarity_fn:
            try:
                emb_score = embedding_similarity_fn(concept, f"{subject_name} {keywords}")
                total_score += emb_score * embedding_weight
            except Exception:
                pass
        if wikidata_similarity_fn:
            try:
                wiki_score = wikidata_similarity_fn(concept, subject_name)
                total_score += wiki_score * wikidata_weight
            except Exception:
                pass

        # フォールバック: 単純なキーワードマッチング
        if total_score == 0.0:
            keyword_list = [k.strip().lower() for k in keywords.split(",")]
            concept_lower = concept.lower()
            match_count = sum(1 for k in keyword_list if k in concept_lower or concept_lower in k)
            total_score = match_count / max(len(keyword_list), 1) * 0.5

        scores.append({
            "subject_name": subject_name,
            "year": int(year),
            "score": round(total_score, 4),
        })

    # スコアでソート
    scores.sort(key=lambda x: x["score"], reverse=True)

    # 中央学年を推定（スコア上位の平均）
    top_items = scores[:5]
    if top_items:
        avg_year = sum(s["year"] for s in top_items) / len(top_items)
    else:
        avg_year = 2

    # 基礎（年次が小さい）と発展（年次が大きい）に分類
    past = [s for s in scores if s["year"] < avg_year and s["score"] > 0][:top_k]
    future = [s for s in scores if s["year"] >= avg_year and s["score"] > 0][:top_k]

    return {"past": past, "future": future}
