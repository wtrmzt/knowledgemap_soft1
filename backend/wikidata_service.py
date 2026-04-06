"""
Wikidata連携モジュール
SPARQLクエリによる概念の関連性取得・Jaccard係数による構造的類似度計算
"""
import logging
import requests

logger = logging.getLogger(__name__)

WIKIDATA_API_URL = "https://www.wikidata.org/w/api.php"
WIKIDATA_SPARQL_URL = "https://query.wikidata.org/sparql"


def search_entity(keyword: str, lang: str = "ja") -> str | None:
    """キーワードからWikidata QIDを検索"""
    try:
        params = {
            "action": "wbsearchentities",
            "search": keyword,
            "language": lang,
            "format": "json",
            "limit": 1,
        }
        resp = requests.get(WIKIDATA_API_URL, params=params, timeout=10)
        data = resp.json()
        results = data.get("search", [])
        if results:
            return results[0]["id"]
        return None
    except Exception as e:
        logger.error(f"Wikidata検索エラー ({keyword}): {e}")
        return None


def get_neighbors(qid: str) -> set:
    """SPARQLでQIDの隣接ノード（プロパティの値）を取得"""
    query = f"""
    SELECT DISTINCT ?neighbor WHERE {{
      wd:{qid} ?p ?neighbor .
      FILTER(STRSTARTS(STR(?neighbor), "http://www.wikidata.org/entity/Q"))
    }}
    LIMIT 50
    """
    try:
        resp = requests.get(
            WIKIDATA_SPARQL_URL,
            params={"query": query, "format": "json"},
            headers={"Accept": "application/sparql-results+json"},
            timeout=15,
        )
        data = resp.json()
        neighbors = set()
        for binding in data.get("results", {}).get("bindings", []):
            uri = binding.get("neighbor", {}).get("value", "")
            if "/entity/Q" in uri:
                neighbors.add(uri.split("/")[-1])
        return neighbors
    except Exception as e:
        logger.error(f"SPARQL隣接ノード取得エラー ({qid}): {e}")
        return set()


def jaccard_similarity(set_a: set, set_b: set) -> float:
    """Jaccard係数で構造的類似度を計算"""
    if not set_a and not set_b:
        return 0.0
    intersection = set_a & set_b
    union = set_a | set_b
    return len(intersection) / len(union) if union else 0.0


def compute_wikidata_similarity(keyword_a: str, keyword_b: str) -> float:
    """2つのキーワード間のWikidata上の構造的類似度を計算"""
    qid_a = search_entity(keyword_a)
    qid_b = search_entity(keyword_b)
    if not qid_a or not qid_b:
        return 0.0
    neighbors_a = get_neighbors(qid_a)
    neighbors_b = get_neighbors(qid_b)
    return jaccard_similarity(neighbors_a, neighbors_b)
