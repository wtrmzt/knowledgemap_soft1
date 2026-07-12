"""
AI サービスモジュール
OpenAI APIを用いたマップ生成・ノード生成・周辺概念取得・
振り返り記述支援（トピック検知・次の記述提案）を提供
"""

import json
import uuid
import logging

import numpy as np

logger = logging.getLogger(__name__)

# ─── グローバルクライアント参照 ─────────────────────────────────
_client = None


def init_llm_service(openai_client):
    """app.py から OpenAI クライアントを受け取って設定する。"""
    global _client
    _client = openai_client


def _get_client():
    global _client
    if _client is None:
        try:
            from openai import OpenAI
            from config import Config
            _client = OpenAI(api_key=Config.OPENAI_API_KEY)
        except Exception:
            raise RuntimeError(
                "LLM service が初期化されていません。"
                "init_llm_service() を先に呼んでください。"
            )
    return _client


# =============================================
# モード別プロンプト
# =============================================

_MODE_SYSTEM_PROMPTS = {
    "reflection": (
        "あなたは学習支援AIです。\n"
        "ユーザーの振り返りテキストから学習に関連する単語を選択し知識マップを生成してください。\n"
        "以下のJSON形式で出力してください:\n"
        '{\n  "nodes": [\n    {\n      "id": "node_1",\n'
        '      "label": "概念名",\n      "sentence": "140字以内の説明文",\n'
        '      "extend_query": "関連する拡張概念のキーワード"\n    }\n  ],\n'
        '  "edges": [\n    {\n      "id": "edge_1",\n'
        '      "source": "node_1",\n      "target": "node_2",\n'
        '      "label": "関連性を表す単語"\n    }\n  ]\n}\n'
        "概念間の関係性を適切に抽出し、学習の理解を深めるマップを作成してください。"
    ),
    "idea": (
        "あなたはアイデア発想支援AIです。\n"
        "入力されたアイデアテキストから関連する概念を幅広く展開し、知識マップを生成してください。\n"
        "以下のJSON形式で出力してください:\n"
        '{\n  "nodes": [\n    {\n      "id": "node_1",\n'
        '      "label": "概念名",\n      "sentence": "140字以内の説明文",\n'
        '      "extend_query": "さらに広げられる周辺キーワード"\n    }\n  ],\n'
        '  "edges": [\n    {\n      "id": "edge_1",\n'
        '      "source": "node_1",\n      "target": "node_2",\n'
        '      "label": "関係性 (任意)"\n    }\n  ]\n}\n'
        "入力されたアイデアの核心だけでなく、周辺領域や異分野との接点も積極的に提案してください。"
    ),
    "research": (
        "あなたはリサーチ整理支援AIです。\n"
        "提供されたテキストを分析し、要点を構造化した知識マップを生成してください。\n"
        "以下のJSON形式で出力してください:\n"
        '{\n  "nodes": [\n    {\n      "id": "node_1",\n'
        '      "label": "要点・概念名",\n      "sentence": "140字以内の要約文",\n'
        '      "extend_query": "さらに調査すべきキーワード"\n    }\n  ],\n'
        '  "edges": [\n    {\n      "id": "edge_1",\n'
        '      "source": "node_1",\n      "target": "node_2",\n'
        '      "label": "関係性 (任意)"\n    }\n  ],\n'
        '  "summary": "全体の要約 (200字以内)"\n}\n'
        "情報の階層構造と因果関係を明確にしてください。"
    ),
}


# =============================================
# マップ生成
# =============================================

def generate_map_from_text(text: str, mode: str = "reflection") -> dict:
    """テキストから知識マップ (ノード + エッジ) を生成"""
    system_prompt = _MODE_SYSTEM_PROMPTS.get(
        mode, "知識マップをJSON形式で生成してください。"
    )
    try:
        client = _get_client()
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": text},
            ],
            temperature=0.0,
            response_format={"type": "json_object"},
        )
        result = json.loads(response.choices[0].message.content)
        logger.info(
            "マップ生成完了: mode=%s nodes=%d edges=%d",
            mode, len(result.get("nodes", [])), len(result.get("edges", [])),
        )
        return result
    except Exception as e:
        logger.error("[generate_map_from_text] エラー: %s", e)
        return {"nodes": [], "edges": []}


# 旧名との互換エイリアス
generate_map_from_memo = generate_map_from_text


# =============================================
# ノード生成
# =============================================

def generate_node_from_keyword(keyword: str) -> dict:
    """キーワードからノード情報を生成"""
    try:
        client = _get_client()
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "キーワードから知識マップのノード情報を生成してください。\n"
                        "以下のJSON形式で出力:\n"
                        '{"id":"node_xxx","label":"概念名",'
                        '"sentence":"140字以内の説明文","extend_query":"拡張概念キーワード"}'
                    ),
                },
                {"role": "user", "content": keyword},
            ],
            temperature=0.0,
            response_format={"type": "json_object"},
        )
        result = json.loads(response.choices[0].message.content)
        if "id" not in result:
            result["id"] = f"node_{uuid.uuid4().hex[:8]}"
        return result
    except Exception as e:
        logger.error("[generate_node_from_keyword] エラー: %s", e)
        return {
            "id": f"node_{uuid.uuid4().hex[:8]}",
            "label": keyword, "sentence": "", "extend_query": "",
        }


# =============================================
# 周辺概念の自動取得
# =============================================

def generate_surrounding_concepts(nodes: list) -> dict:
    """各ノードに2〜3個の周辺概念を生成"""
    node_labels = [
        n.get("label", n.get("data", {}).get("label", "")) for n in nodes
    ]
    if not node_labels:
        return {}

    prompt = (
        "以下の概念リストの各概念について、関連する周辺概念を2〜3個ずつ提案してください。\n\n"
        f"概念リスト: {json.dumps(node_labels, ensure_ascii=False)}\n\n"
        "以下のJSON形式で出力してください:\n"
        '{"概念名1":[{"label":"周辺概念A","relation":"140字以内の説明"}],"概念名2":[...]}'
    )
    try:
        client = _get_client()
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
            response_format={"type": "json_object"},
        )
        result = json.loads(response.choices[0].message.content)
        logger.info("周辺概念生成完了: %d ノード分", len(result))
        return result
    except Exception as e:
        logger.error("[generate_surrounding_concepts] エラー: %s", e)
        return {}


# =============================================
# 記述支援：トピック検知 + 次の記述提案
# =============================================

VALID_SUGGESTION_TYPES = ("redirection", "expansion", "deepening")


def detect_described_topics(text: str, node_labels: list) -> dict:
    """振り返り文を解析し、記述状況を判定"""
    if not text.strip() or not node_labels:
        return {"described": [], "currently_writing": None, "next_suggestions": []}

    prompt = (
        "あなたは学習振り返り支援AIです。\n"
        f"■ 振り返り文:\n{text}\n\n"
        f"■ マップ上の概念:\n{json.dumps(node_labels, ensure_ascii=False)}\n\n"
        "以下を判定して厳密にJSON形式のみで出力してください:\n"
        '1. "described": 既に「文として記述が完了している」マップ上の概念のリスト。\n'
        '2. "currently_writing": 文末付近で記述が途切れている、まさに今書いている最中の概念（1つ、なければnull）。\n'
        "   【重要・判定ルール】文末が「〜が」「〜について」などの助詞で未完成のまま終わっており、"
        "そこに概念が含まれる場合、それは `described` から除外し、必ず `currently_writing` に設定してください。\n"
        '3. "next_suggestions": 学習者の思考を促すための書き出し提案（最大3つ）。\n\n'
        "   【提案の方向性と優先順位】\n"
        "   現在の状況を分析し、以下の優先順位とアプローチに従って提案を作成してください。\n"
        "   ・優先度1（軌道修正: redirection）: 振り返り文の内容がマップの概念と全く無関係（雑談など）な場合。"
        "無理に文脈を繋げようとせず、「ところで、」「今日の主題に戻ると、」などの話題転換の接続詞を使用し、"
        "未記述の概念へ誘導してください。\n"
        "   ・優先度2（深掘り・継続: deepening）: `currently_writing` が存在する場合。途切れた思考を継続させ、"
        "さらにその概念の理解を一段深める（「なぜか」「具体的には」など）ためのヒントを最優先で作成してください。\n"
        "   ・優先度3（展開: expansion）: 未記述の概念がある場合。前後の文脈から自然に繋がる未記述の概念を選び、記述を促します。\n"
        "   ・優先度4（深掘り: deepening）: すべての概念が記述済みで `currently_writing` もない場合。"
        "`described` の概念に対してメタ認知を促すヒントを作成します。\n\n"
        "   【次なる提案の共通条件】\n"
        "   ・文脈の考慮: 上記のアプローチに合わせ、最も適切な論理接続詞（connector）を選択してください。\n"
        "   ・不完全な書き出し支援文: `prompt_hint`（書き出し支援文）は完全な文章を与えないでください。"
        "ユーザーが自ら続きを考えて書き込める端的で不完全な文にしてください。\n"
        "   ・ヒントの形式: 「…」で終わらない形にしてください。例: 「なぜかというと、」「具体的には、」「一方で、」など。\n\n"
        "   各提案の構成: \n"
        '   suggestion_type("redirection", "expansion", "deepening" のいずれか), '
        "node_label(概念), connector(接続の内容), prompt_hint(書き出し支援文)\n"

        "出力JSONフォーマット例:\n"
        "{\n"
        '  "described": ["概念A"],\n'
        '  "currently_writing": "概念C",\n'
        '  "next_suggestions": [\n'
        "    {\n"
        '      "suggestion_type": "deepening",\n'
        '      "node_label": "概念C",\n'
        '      "connector": "具体化",\n'
        '      "prompt_hint": "その動作原理として具体的に考えられるのは、"\n'
        "    }\n"
        "  ]\n"
        "}"
    )
    try:
        client = _get_client()
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
            response_format={"type": "json_object"},
        )
        result = json.loads(response.choices[0].message.content)

        # --- 正規化: suggestion_type を必ず付与し、想定外の値は 'expansion' にフォールバック ---
        suggestions = result.get("next_suggestions") or []
        normalized = []
        for s in suggestions:
            if not isinstance(s, dict):
                continue
            stype = str(s.get("suggestion_type") or "").strip().lower()
            if stype not in VALID_SUGGESTION_TYPES:
                stype = "expansion"
            normalized.append({
                "suggestion_type": stype,
                "node_label": s.get("node_label") or "",
                "connector": s.get("connector") or "",
                "prompt_hint": s.get("prompt_hint") or "",
            })

        return {
            "described": result.get("described") or [],
            "currently_writing": result.get("currently_writing"),
            "next_suggestions": normalized,
        }
    except Exception as e:
        logger.error("[detect_described_topics] エラー: %s", e)
        return {"described": [], "currently_writing": None, "next_suggestions": []}


# =============================================
# テキスト要約
# =============================================

def summarize_text(text: str) -> dict:
    try:
        client = _get_client()
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": (
                    'テキストを分析し、JSON形式で要約と要点を出力:\n'
                    '{"title":"タイトル","summary":"200字以内","key_points":["…"]}'
                )},
                {"role": "user", "content": text[:8000]},
            ],
            temperature=0.5,
            response_format={"type": "json_object"},
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        logger.error("[summarize_text] エラー: %s", e)
        return {"title": "無題", "summary": "", "key_points": []}


# =============================================
# メモ改善
# =============================================

def improve_memo(memo_text: str, nodes: list, mode: str = "reflection") -> dict:
    node_labels = [
        n.get("label", n.get("data", {}).get("label", "")) for n in nodes
    ]
    prompt = (
        f"振り返りメモを添削・改善しJSON形式で出力。\n"
        f"マップ上の概念: {', '.join(node_labels)}\n\nメモ:\n{memo_text}\n\n"
        f'出力: {{"improved_text":"…","suggestions":["…"],"comments":["…"]}}'
    )
    try:
        client = _get_client()
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
        )
        content = response.choices[0].message.content.strip()
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
        return json.loads(content)
    except Exception as e:
        logger.error("[improve_memo] エラー: %s", e)
        return {"improved_text": memo_text, "suggestions": [], "comments": [str(e)]}


# =============================================
# Embedding / 類似度
# =============================================

def get_text_embedding(text: str) -> list:
    try:
        client = _get_client()
        response = client.embeddings.create(model="text-embedding-3-small", input=text)
        return response.data[0].embedding
    except Exception as e:
        logger.error("[get_text_embedding] エラー: %s", e)
        return []


def cosine_similarity(vec_a: list, vec_b: list) -> float:
    a, b = np.array(vec_a), np.array(vec_b)
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na == 0 or nb == 0:
        return 0.0
    return float(np.dot(a, b) / (na * nb))