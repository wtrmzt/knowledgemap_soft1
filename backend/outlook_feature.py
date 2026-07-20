# -*- coding: utf-8 -*-
"""
outlook_feature.py — 関連性接続把握機能「見通す」(追加モジュール)

既存ファイルを変更せずに以下を提供する自己完結モジュール。
app.py に次の2行を追加するだけで有効化される:

    import outlook_feature                      # ← models import 群の後 (create_all の前)
    outlook_feature.register_outlook_routes(app)  # ← register_all_routes(app) の後

【機能概要】
  1. 振り返りマップを選択 → 全ノードを embedding 化し、
     2・3年次の科目との類似度合計で上位3科目を推薦
  2. 科目を選択 → 科目マップ(UECsubject_maps11)を返し、
     振り返りノード ⇔ 科目マップ内ノードの最類似ペア(閾値以上・最大N件)を算出、
     各ペアの繋がりをLLMが短文で説明(DBキャッシュ)
  3. ユーザーの知らない概念向けに、前提知識レベルからの詳細説明をオンデマンド生成
  4. 「本授業とこの科目についてどのような関係性があると思いますか?」への回答を
     履歴追記で保存(画面には最新を表示)
  5. 管理者設定: 機能ON/OFF(バックエンド強制)・類似度閾値・最大説明ノード数

【データソース】
  優先: precompute/precomputed_data.pkl (PRECOMPUTED_DATA_PATH)
    - subjects: [{label, year, embedding(np.ndarray), ...}]
    - subject_maps: {科目名: {nodes, edges, root_id}}
    - map_node_matrices: {科目名: {matrix(L2正規化済), labels, node_ids}}
  フォールバック: combined_data_regex.csv + UECsubject_maps11/*.csv を直接ロード
"""
import io
import csv
import json
import logging
import math
import os
import re
import threading
import zipfile
from datetime import datetime, timezone

import numpy as np
from flask import Blueprint, Flask, current_app, g, jsonify, request, send_file

from auth import admin_required, token_required
from models import db, KnowledgeMap, Memo, User

logger = logging.getLogger(__name__)

# ===========================================================
# DB モデル (新テーブル3つ。db.create_all() で自動作成される)
# ===========================================================

class OutlookSettings(db.Model):
    """「見通す」機能の管理者設定 (単一行 id=1)"""
    __tablename__ = "outlook_settings"

    id = db.Column(db.Integer, primary_key=True)
    data = db.Column(db.JSON, nullable=False, default=dict)
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))

    DEFAULTS = {
        "enabled": True,               # 機能全体のON/OFF (バックエンド強制)
        "similarity_threshold": 0.35,  # これ未満のペアは説明を出さない
        "max_nodes": 10,               # 説明を出す振り返りノードの上限
    }

    @classmethod
    def _merged(cls, raw):
        raw = raw or {}
        out = dict(cls.DEFAULTS)
        if isinstance(raw.get("enabled"), bool):
            out["enabled"] = raw["enabled"]
        try:
            th = float(raw.get("similarity_threshold"))
            if 0.0 <= th <= 1.0:
                out["similarity_threshold"] = th
        except (TypeError, ValueError):
            pass
        try:
            mn = int(raw.get("max_nodes"))
            if 1 <= mn <= 30:
                out["max_nodes"] = mn
        except (TypeError, ValueError):
            pass
        return out

    @classmethod
    def get_data(cls) -> dict:
        row = db.session.get(cls, 1)
        return cls._merged(row.data if row else None)

    @classmethod
    def set_data(cls, new_data: dict) -> dict:
        merged = cls._merged(new_data)
        row = db.session.get(cls, 1)
        if row is None:
            row = cls(id=1, data=merged)
            db.session.add(row)
        else:
            row.data = merged
        db.session.commit()
        return merged


class OutlookAnswer(db.Model):
    """「本授業とこの科目についてどのような関係性があると思いますか?」への回答。
    履歴追記方式(全回答を保存し、画面には最新のみ表示)。"""
    __tablename__ = "outlook_answers"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    memo_id = db.Column(db.Integer, db.ForeignKey("memos.id"), nullable=False, index=True)
    subject_name = db.Column(db.String(300), nullable=False, index=True)
    answer_text = db.Column(db.Text, nullable=False, default="")
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "memo_id": self.memo_id,
            "subject_name": self.subject_name,
            "answer_text": self.answer_text,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class OutlookExplanation(db.Model):
    """振り返りノード ⇔ 科目マップノードの繋がり説明(短文)のキャッシュ兼提示ログ。
    detail は「詳しく」押下時に生成される詳細説明(未生成なら空)。"""
    __tablename__ = "outlook_explanations"

    id = db.Column(db.Integer, primary_key=True)
    memo_id = db.Column(db.Integer, nullable=False, index=True)
    subject_name = db.Column(db.String(300), nullable=False, index=True)
    source_label = db.Column(db.String(300), nullable=False)   # 振り返り側ノード
    target_label = db.Column(db.String(300), nullable=False)   # 科目側ノード
    similarity = db.Column(db.Float, nullable=False, default=0.0)
    sentence = db.Column(db.Text, nullable=False, default="")  # 短い繋がり説明
    detail = db.Column(db.Text, nullable=False, default="")    # 詳細説明(オンデマンド)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        db.Index("ix_outlook_expl_key", "memo_id", "subject_name", "source_label", "target_label"),
    )

    def to_dict(self):
        return {
            "source_label": self.source_label,
            "target_label": self.target_label,
            "similarity": self.similarity,
            "sentence": self.sentence or "",
            "has_detail": bool(self.detail),
        }


# ===========================================================
# OpenAI ヘルパー (ai_service のクライアントを共用)
# ===========================================================

_OPENAI_CHAT_MODEL = "gpt-4o-mini"
_OPENAI_EMBED_MODEL = "text-embedding-3-small"


def _openai_client():
    from ai_service import _get_client
    return _get_client()


def _embed_texts(texts: list) -> list:
    """複数テキストを1回のAPI呼び出しでembedding化。失敗時は None を並べる。"""
    cleaned = [str(t).replace("\n", " ").strip() or " " for t in texts]
    try:
        client = _openai_client()
        resp = client.embeddings.create(model=_OPENAI_EMBED_MODEL, input=cleaned)
        return [np.array(d.embedding, dtype=np.float32) for d in resp.data]
    except Exception as e:
        logger.error("[outlook] embedding 取得エラー: %s", e)
        return [None] * len(texts)


def _l2norm(v: np.ndarray):
    n = np.linalg.norm(v)
    return v / n if n > 0 else v


# ===========================================================
# エンジン (pkl 優先 / CSV フォールバック)
# ===========================================================

class _OutlookEngine:
    def __init__(self):
        self._lock = threading.Lock()
        self._loaded = False
        self._load_error = None
        # subjects: [{"label", "year_raw", "embedding(np, L2正規化済)"}]
        self.subjects = []
        # subject_maps: {name: {"nodes":[{id,label,sentence}], "edges":[{source,target}], "root_id"}}
        self.subject_maps = {}
        # map_matrices: {name: {"matrix": np(L2正規化済), "node_ids": [...], "labels": [...]}}
        self.map_matrices = {}

    # ---------- ロード ----------
    def ensure_loaded(self):
        if self._loaded:
            return
        with self._lock:
            if self._loaded:
                return
            try:
                if not self._load_from_pkl():
                    self._load_from_csv()
                self._loaded = True
                logger.info("[outlook] engine loaded: subjects=%d maps=%d",
                            len(self.subjects), len(self.subject_maps))
            except Exception as e:
                self._load_error = str(e)
                logger.error("[outlook] engine load failed: %s", e, exc_info=True)
                raise

    def _pkl_path(self):
        try:
            return current_app.config.get("PRECOMPUTED_DATA_PATH", "")
        except RuntimeError:
            from config import Config
            return Config.PRECOMPUTED_DATA_PATH

    def _load_from_pkl(self) -> bool:
        import pickle
        path = self._pkl_path()
        if not path or not os.path.exists(path):
            logger.warning("[outlook] pkl が見つかりません (%s)。CSVフォールバックを試みます。", path)
            return False
        with open(path, "rb") as f:
            data = pickle.load(f)

        for s in data.get("subjects", []):
            emb = s.get("embedding")
            if emb is None:
                continue
            self.subjects.append({
                "label": str(s.get("label", "")),
                "year_raw": s.get("year", 0),
                "embedding": _l2norm(np.asarray(emb, dtype=np.float32)),
            })

        for name, m in (data.get("subject_maps") or {}).items():
            self.subject_maps[name] = {
                "nodes": [
                    {"id": str(n.get("id", "")), "label": str(n.get("label", "")),
                     "sentence": str(n.get("sentence", "") or "")}
                    for n in m.get("nodes", [])
                ],
                "edges": [
                    {"source": str(e.get("source", "")), "target": str(e.get("target", ""))}
                    for e in m.get("edges", [])
                ],
                "root_id": m.get("root_id"),
            }

        for name, mm in (data.get("map_node_matrices") or {}).items():
            mat = np.asarray(mm.get("matrix"), dtype=np.float32)
            if mat.size == 0:
                continue
            self.map_matrices[name] = {
                "matrix": mat,  # precompute 側で L2 正規化済み
                "node_ids": [str(i) for i in mm.get("node_ids", [])],
                "labels": [str(l) for l in mm.get("labels", [])],
            }
        return len(self.subjects) > 0

    def _load_from_csv(self):
        """pkl 不在時のフォールバック: マスタCSV + 科目マップCSVを直接ロード。"""
        import pandas as pd
        from config import Config as AppConfig

        base = os.path.dirname(os.path.abspath(__file__))
        master = os.path.join(base, "combined_data_regex.csv")
        map_dir = os.path.join(base, "UECsubject_maps11")

        def to_vec(x):
            return np.array(json.loads(x), dtype=np.float32) if isinstance(x, str) and x.startswith("[") else None

        df = pd.read_csv(master)
        seen = set()
        for _, row in df.iterrows():
            label = str(row.get("label", ""))
            emb = to_vec(row.get("embedding_openai"))
            if not label or emb is None or label in seen:
                continue
            seen.add(label)
            self.subjects.append({
                "label": label,
                "year_raw": row.get("year", 0),
                "embedding": _l2norm(emb),
            })

        if os.path.isdir(map_dir):
            pat = re.compile(r"^subject_map_(.+)_nodes\.csv$")
            for fn in os.listdir(map_dir):
                m = pat.match(fn)
                if not m:
                    continue
                name = m.group(1)
                try:
                    dfn = pd.read_csv(os.path.join(map_dir, fn))
                    nodes, vecs, ids, labels, root_id = [], [], [], [], None
                    for _, row in dfn.iterrows():
                        nid = str(row.get("id", ""))
                        lab = str(row.get("label", ""))
                        sen = row.get("sentence", "")
                        nodes.append({"id": nid, "label": lab,
                                      "sentence": "" if (isinstance(sen, float) and math.isnan(sen)) else str(sen or "")})
                        if nid.endswith("_0"):
                            root_id = nid
                        v = to_vec(row.get("embedding_openai"))
                        if v is not None:
                            vecs.append(_l2norm(v)); ids.append(nid); labels.append(lab)
                    edges = []
                    ep = os.path.join(map_dir, f"subject_map_{name}_edges.csv")
                    if os.path.exists(ep):
                        dfe = pd.read_csv(ep)
                        edges = [{"source": str(r.get("source", "")), "target": str(r.get("target", ""))}
                                 for _, r in dfe.iterrows()]
                    self.subject_maps[name] = {"nodes": nodes, "edges": edges, "root_id": root_id}
                    if vecs:
                        self.map_matrices[name] = {"matrix": np.vstack(vecs),
                                                   "node_ids": ids, "labels": labels}
                except Exception as e:
                    logger.warning("[outlook] 科目マップ読込失敗 (%s): %s", name, e)

    # ---------- 学年判定 ----------
    @staticmethod
    def _year_ok(year_raw) -> bool:
        """year が 2 / 3 / '2/3' 等(2か3を含む)なら True。"""
        s = str(year_raw)
        digits = set(re.findall(r"\d+", s))
        return bool(digits & {"2", "3"})

    # ---------- 科目説明・接続プレビュー ----------
    def _subject_description(self, subject_name: str) -> str:
        """科目マップのルートノード sentence を科目説明として返す。"""
        smap = self.subject_maps.get(subject_name)
        if not smap:
            return ""
        root_id = smap.get("root_id")
        for n in smap["nodes"]:
            if n["id"] == root_id:
                return n["sentence"]
        return smap["nodes"][0]["sentence"] if smap["nodes"] else ""

    def _preview_pairs(self, refl_labels: list, q: np.ndarray,
                       subject_name: str, k: int = 2) -> list:
        """接続プレビュー: 振り返りノード⇔科目ノードの最類似ペア上位k件。"""
        mm = self.map_matrices.get(subject_name)
        if mm is None or q.size == 0:
            return []
        sims = q @ mm["matrix"].T          # (n_refl, n_subj)
        best_j = np.argmax(sims, axis=1)
        best_sim = sims[np.arange(sims.shape[0]), best_j]
        order = np.argsort(-best_sim)[:k]
        return [
            {
                "source_label": refl_labels[int(i)],
                "target_label": mm["labels"][int(best_j[int(i)])],
                "similarity": round(float(best_sim[int(i)]), 4),
            }
            for i in order if float(best_sim[int(i)]) >= 0.2
        ]

    # ---------- 科目推薦 ----------
    def recommend_subjects(self, node_embs: list, refl_labels: list | None = None,
                           top_k: int = 3) -> list:
        """各振り返りノード embedding と科目 embedding の類似度合計で上位科目を返す。
        refl_labels を渡すと各科目に接続プレビュー(最類似ペア上位2件)を付与する。"""
        self.ensure_loaded()
        pairs = [
            (refl_labels[i] if refl_labels and i < len(refl_labels) else "", _l2norm(e))
            for i, e in enumerate(node_embs) if e is not None
        ]
        if not pairs:
            return []
        labels = [p[0] for p in pairs]
        q = np.vstack([p[1] for p in pairs])  # (n_nodes, dim)
        scored = []
        for s in self.subjects:
            if not self._year_ok(s["year_raw"]):
                continue
            sims = q @ s["embedding"]              # 各ノードとのcos類似度
            total = float(np.sum(sims))
            scored.append({
                "subject_name": s["label"],
                "year": str(s["year_raw"]),
                "score": round(total, 4),
                "mean_similarity": round(float(np.mean(sims)), 4),
                "has_map": s["label"] in self.subject_maps,
            })
        # 同名科目(複数クラス等)は最高スコアのみ残す
        best = {}
        for it in scored:
            k = it["subject_name"]
            if k not in best or it["score"] > best[k]["score"]:
                best[k] = it
        ranked = sorted(best.values(), key=lambda x: x["score"], reverse=True)
        # マップを持つ科目を優先して top_k 件
        with_map = [r for r in ranked if r["has_map"]]
        result = (with_map or ranked)[:top_k]
        for r in result:
            r["description"] = self._subject_description(r["subject_name"])
            r["preview"] = (self._preview_pairs(labels, q, r["subject_name"])
                            if r["has_map"] else [])
        return result

    # ---------- 接続計算 ----------
    def compute_links(self, refl_nodes: list, node_embs: list, subject_name: str,
                      threshold: float, max_nodes: int) -> tuple:
        """振り返り各ノード → 科目マップ内の最類似ノードを求める。

        Returns: (subject_map_dict, links)
          links: [{source_id, source_label, target_id, target_label, similarity}]
        """
        self.ensure_loaded()
        smap = self.subject_maps.get(subject_name)
        mm = self.map_matrices.get(subject_name)
        if smap is None or mm is None:
            return None, []

        mat = mm["matrix"]  # (n_subject_nodes, dim) L2正規化済み
        links = []
        for node, emb in zip(refl_nodes, node_embs):
            if emb is None:
                continue
            sims = mat @ _l2norm(emb)
            bi = int(np.argmax(sims))
            sim = float(sims[bi])
            if sim < threshold:
                continue
            links.append({
                "source_id": node["id"],
                "source_label": node["label"],
                "target_id": mm["node_ids"][bi],
                "target_label": mm["labels"][bi],
                "similarity": round(sim, 4),
            })
        links.sort(key=lambda x: x["similarity"], reverse=True)
        return smap, links[:max_nodes]

    def subject_description(self, subject_name: str) -> str:
        """科目マップのルートノード(科目名_0)の sentence を科目説明として返す。"""
        smap = self.subject_maps.get(subject_name)
        if not smap:
            return ""
        root_id = smap.get("root_id")
        for n in smap["nodes"]:
            if n["id"] == root_id:
                return n.get("sentence", "") or ""
        return ""

    def subject_year(self, subject_name: str) -> str:
        """科目の履修学年(表示用文字列)を返す。"""
        self.ensure_loaded()
        for sub in self.subjects:
            if sub["label"] == subject_name:
                return str(sub["year_raw"])
        return ""

    def status(self) -> dict:
        return {
            "loaded": self._loaded,
            "load_error": self._load_error,
            "subject_count": len(self.subjects),
            "map_count": len(self.subject_maps),
        }


_engine = _OutlookEngine()


# ===========================================================
# LLM 生成
# ===========================================================

def _generate_link_sentences(memo_excerpt: str, subject_name: str, pairs: list) -> dict:
    """複数ペアの繋がり説明を1回のLLM呼び出しで生成。
    pairs: [{source_label, source_sentence, target_label, target_sentence}]
    Returns: {(source_label, target_label): sentence}
    """
    if not pairs:
        return {}
    items = [
        {
            "index": i,
            "reflection_concept": p["source_label"],
            "reflection_context": (p.get("source_sentence") or "")[:140],
            "subject_concept": p["target_label"],
            "subject_context": (p.get("target_sentence") or "")[:140],
        }
        for i, p in enumerate(pairs)
    ]
    system = (
        "あなたは大学の学習支援AIです。学生の振り返り(今学んだこと)の概念と、"
        f"将来履修する科目「{subject_name}」に登場する概念のペアが与えられます。\n"
        "各ペアについて、2つの概念がどう繋がるかを1〜2文(80字以内)の日本語で説明してください。\n"
        "重要: 科目側の概念は学生がまだ知らない可能性が高いため、"
        "専門用語を避け、振り返り側の概念を足がかりに平易に説明してください。\n"
        '出力は次のJSON形式のみ: {"explanations": [{"index": 0, "sentence": "..."}]}'
    )
    user = json.dumps({"memo_excerpt": memo_excerpt[:300], "pairs": items}, ensure_ascii=False)
    try:
        client = _openai_client()
        resp = client.chat.completions.create(
            model=_OPENAI_CHAT_MODEL,
            messages=[{"role": "system", "content": system},
                      {"role": "user", "content": user}],
            temperature=0.2,
            response_format={"type": "json_object"},
        )
        data = json.loads(resp.choices[0].message.content)
        out = {}
        for ex in data.get("explanations", []):
            try:
                i = int(ex.get("index"))
                p = pairs[i]
                out[(p["source_label"], p["target_label"])] = str(ex.get("sentence", "")).strip()
            except (TypeError, ValueError, IndexError):
                continue
        return out
    except Exception as e:
        logger.error("[outlook] 繋がり説明生成エラー: %s", e)
        return {}


def _generate_concept_detail(subject_name: str, target_label: str, target_sentence: str,
                             source_label: str) -> str:
    """未知概念の詳細説明(前提知識レベルから)を生成。"""
    system = (
        "あなたは大学の学習支援AIです。学生の現在の学びを未来の学びへ繋げるため、"
        "未学習の概念について、既習概念をベースにした動機付けとなる解説を日本語で生成してください。\n\n"
        "■ 構成要件（全体で180文字以内）:\n"
        "1.【概念の正体】その未知の概念を一言で言うと何か（専門用語は必ず一般的な言葉に言い換える）。\n"
        "2.【未来への接続】今学んでいる概念への理解が、未来の学び（未知の概念）をどう助けるか、またはどう地続きになっているか。\n\n"
        "■ 出力フォーマット:\n"
        '{"detail": "..."} のJSON形式のみ。'
    )
    user = json.dumps({
        "subject": subject_name,
        "concept": target_label,
        "concept_context": (target_sentence or "")[:140],
        "student_known_concept": source_label,
    }, ensure_ascii=False)
    try:
        client = _openai_client()
        resp = client.chat.completions.create(
            model=_OPENAI_CHAT_MODEL,
            messages=[{"role": "system", "content": system},
                      {"role": "user", "content": user}],
            temperature=0.3,
            response_format={"type": "json_object"},
        )
        return str(json.loads(resp.choices[0].message.content).get("detail", "")).strip()
    except Exception as e:
        logger.error("[outlook] 詳細説明生成エラー: %s", e)
        return ""


# ===========================================================
# ヘルパー
# ===========================================================

def _current_user_row():
    """g.current_user(JWTペイロード) から User 行を取得。"""
    payload = getattr(g, "current_user", {}) or {}
    uid = payload.get("user_db_id")
    if uid is not None:
        u = db.session.get(User, uid)
        if u:
            return u
    return User.query.filter_by(user_id=payload.get("user_id", "")).first()


def _feature_enabled() -> bool:
    try:
        return bool(OutlookSettings.get_data().get("enabled", True))
    except Exception:
        return True


def _disabled_response():
    return jsonify({"error": "outlook_disabled",
                    "message": "「見通す」機能は現在管理者により無効化されています。"}), 403


def _extract_refl_nodes(km: KnowledgeMap) -> list:
    """KnowledgeMap.nodes(JSON) から {id,label,sentence} を抽出(satellite候補等は除外)。"""
    out = []
    for n in (km.nodes or []):
        if not isinstance(n, dict):
            continue
        data = n.get("data") or {}
        if data.get("isSatellite") or data.get("isRelation"):
            continue  # 未採用の周辺概念候補・関連科目ノードは対象外
        label = data.get("label") or n.get("label") or ""
        if not label:
            continue
        out.append({
            "id": str(n.get("id", "")),
            "label": str(label),
            "sentence": str(data.get("sentence") or n.get("sentence") or ""),
        })
    return out


# ===========================================================
# ルート
# ===========================================================

outlook_bp = Blueprint("outlook", __name__)


@outlook_bp.route("/api/outlook/config", methods=["GET"])
@token_required
def outlook_config():
    settings = OutlookSettings.get_data()
    return jsonify({
        "enabled": settings["enabled"],
        "similarity_threshold": settings["similarity_threshold"],
        "max_nodes": settings["max_nodes"],
        "question": "本授業とこの科目についてどのような関係性があると思いますか?",
    })


@outlook_bp.route("/api/outlook/memos", methods=["GET"])
@token_required
def outlook_memos():
    """マップを持つ自分のメモ一覧(選択画面用)。"""
    if not _feature_enabled():
        return _disabled_response()
    user = _current_user_row()
    if user is None:
        return jsonify({"error": "user not found"}), 404
    memos = (Memo.query.filter_by(user_id=user.id)
             .order_by(Memo.created_at.desc()).all())
    result = []
    for m in memos:
        if getattr(m, "is_archived", False):
            continue
        km = KnowledgeMap.query.filter_by(memo_id=m.id).first()
        if km is None or not (km.nodes or []):
            continue
        node_count = len([n for n in km.nodes
                          if isinstance(n, dict)
                          and not (n.get("data") or {}).get("isSatellite")
                          and not (n.get("data") or {}).get("isRelation")])
        result.append({
            "memo_id": m.id,
            "title": getattr(m, "title", None) or "",
            "content": m.content or "",
            "content_excerpt": (m.content or "")[:80],
            "mode": m.mode,
            "node_count": node_count,
            "created_at": m.created_at.isoformat() if m.created_at else None,
            "updated_at": m.updated_at.isoformat() if getattr(m, "updated_at", None) else None,
        })
    return jsonify({"memos": result})


@outlook_bp.route("/api/outlook/subjects", methods=["POST"])
@token_required
def outlook_subjects():
    """選択された振り返りマップに対し、2・3年次の推薦科目 上位3件を返す。"""
    if not _feature_enabled():
        return _disabled_response()
    body = request.get_json() or {}
    memo_id = body.get("memo_id")
    if not memo_id:
        return jsonify({"error": "memo_id は必須です"}), 400

    user = _current_user_row()
    memo = db.session.get(Memo, int(memo_id))
    if memo is None or user is None or memo.user_id != user.id:
        return jsonify({"error": "メモが見つかりません"}), 404
    km = KnowledgeMap.query.filter_by(memo_id=memo.id).first()
    refl_nodes = _extract_refl_nodes(km) if km else []
    if not refl_nodes:
        return jsonify({"error": "このメモにはマップがありません"}), 400

    try:
        _engine.ensure_loaded()
    except Exception:
        return jsonify({"error": "engine_not_ready",
                        "message": "科目データを読み込めませんでした。",
                        "status": _engine.status()}), 503

    embs = _embed_texts([f"{n['label']} {n['sentence']}" for n in refl_nodes])
    subjects = _engine.recommend_subjects(
        embs, refl_labels=[n["label"] for n in refl_nodes], top_k=3)

    # ★ FB対応: 各科目に「どのような科目か(説明)」と「どのような接続か(プレビュー)」を付与
    for s in subjects:
        s["description"] = _engine.subject_description(s["subject_name"])
        s["preview"] = []
        if s.get("has_map"):
            try:
                _, plinks = _engine.compute_links(
                    refl_nodes, embs, s["subject_name"], threshold=0.0, max_nodes=3)
                s["preview"] = [
                    {"source_label": lk["source_label"],
                     "target_label": lk["target_label"],
                     "similarity": lk["similarity"]}
                    for lk in plinks
                ]
            except Exception as e:
                logger.warning("[outlook] preview 計算失敗 (%s): %s", s["subject_name"], e)

    return jsonify({
        "memo_id": memo.id,
        "memo": {
            "title": getattr(memo, "title", None) or "",
            "content": memo.content or "",
        },
        "node_count": len(refl_nodes),
        "subjects": subjects,
    })


@outlook_bp.route("/api/outlook/connections", methods=["POST"])
@token_required
def outlook_connections():
    """科目選択後: 科目マップ + 振り返りノード⇔科目ノードの接続 + 繋がり説明を返す。"""
    if not _feature_enabled():
        return _disabled_response()
    body = request.get_json() or {}
    memo_id = body.get("memo_id")
    subject_name = (body.get("subject_name") or "").strip()
    if not memo_id or not subject_name:
        return jsonify({"error": "memo_id と subject_name は必須です"}), 400

    user = _current_user_row()
    memo = db.session.get(Memo, int(memo_id))
    if memo is None or user is None or memo.user_id != user.id:
        return jsonify({"error": "メモが見つかりません"}), 404
    km = KnowledgeMap.query.filter_by(memo_id=memo.id).first()
    refl_nodes = _extract_refl_nodes(km) if km else []
    if not refl_nodes:
        return jsonify({"error": "このメモにはマップがありません"}), 400

    settings = OutlookSettings.get_data()
    threshold = float(settings["similarity_threshold"])
    max_nodes = int(settings["max_nodes"])

    try:
        _engine.ensure_loaded()
    except Exception:
        return jsonify({"error": "engine_not_ready",
                        "message": "科目データを読み込めませんでした。"}), 503

    embs = _embed_texts([f"{n['label']} {n['sentence']}" for n in refl_nodes])
    smap, links = _engine.compute_links(refl_nodes, embs, subject_name, threshold, max_nodes)
    if smap is None:
        return jsonify({"error": f"科目「{subject_name}」のマップが見つかりません"}), 404

    # --- 繋がり説明: キャッシュ確認 → 不足分のみ一括生成 ---
    sentence_of = {}
    for lk in links:
        row = OutlookExplanation.query.filter_by(
            memo_id=memo.id, subject_name=subject_name,
            source_label=lk["source_label"], target_label=lk["target_label"],
        ).first()
        if row and row.sentence:
            sentence_of[(lk["source_label"], lk["target_label"])] = row.sentence

    subj_sentence = {n["id"]: n["sentence"] for n in smap["nodes"]}
    refl_sentence = {n["id"]: n["sentence"] for n in refl_nodes}
    missing = [
        {
            "source_label": lk["source_label"],
            "source_sentence": refl_sentence.get(lk["source_id"], ""),
            "target_label": lk["target_label"],
            "target_sentence": subj_sentence.get(lk["target_id"], ""),
        }
        for lk in links
        if (lk["source_label"], lk["target_label"]) not in sentence_of
    ]
    if missing:
        generated = _generate_link_sentences((memo.content or ""), subject_name, missing)
        for key, sentence in generated.items():
            sentence_of[key] = sentence
            db.session.add(OutlookExplanation(
                memo_id=memo.id, subject_name=subject_name,
                source_label=key[0], target_label=key[1],
                similarity=next((lk["similarity"] for lk in links
                                 if (lk["source_label"], lk["target_label"]) == key), 0.0),
                sentence=sentence,
            ))
        try:
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            logger.warning("[outlook] 説明キャッシュ保存失敗: %s", e)

    for lk in links:
        lk["sentence"] = sentence_of.get((lk["source_label"], lk["target_label"]), "")

    # 最新回答(あれば)
    latest = (OutlookAnswer.query
              .filter_by(user_id=user.id, memo_id=memo.id, subject_name=subject_name)
              .order_by(OutlookAnswer.created_at.desc()).first())

    return jsonify({
        "memo_id": memo.id,
        "subject_name": subject_name,
        "year": _engine.subject_year(subject_name),
        "threshold": threshold,
        "subject_map": smap,
        "links": links,
        "latest_answer": latest.to_dict() if latest else None,
    })


@outlook_bp.route("/api/outlook/explain_concept", methods=["POST"])
@token_required
def outlook_explain_concept():
    """「詳しく」: 科目側の未知概念について前提知識レベルからの詳細説明を返す。"""
    if not _feature_enabled():
        return _disabled_response()
    body = request.get_json() or {}
    memo_id = body.get("memo_id")
    subject_name = (body.get("subject_name") or "").strip()
    source_label = (body.get("source_label") or "").strip()
    target_label = (body.get("target_label") or "").strip()
    if not memo_id or not subject_name or not target_label:
        return jsonify({"error": "memo_id / subject_name / target_label は必須です"}), 400

    row = OutlookExplanation.query.filter_by(
        memo_id=int(memo_id), subject_name=subject_name,
        source_label=source_label, target_label=target_label,
    ).first()
    if row and row.detail:
        return jsonify({"detail": row.detail, "cached": True})

    # 科目マップから概念の説明文を引く(エンジン未ロードでも動くよう防御)
    target_sentence = ""
    try:
        _engine.ensure_loaded()
        smap = _engine.subject_maps.get(subject_name) or {"nodes": []}
        for n in smap["nodes"]:
            if n["label"] == target_label:
                target_sentence = n["sentence"]
                break
    except Exception:
        pass

    detail = _generate_concept_detail(subject_name, target_label, target_sentence, source_label)
    if not detail:
        return jsonify({"error": "説明の生成に失敗しました"}), 502

    if row:
        row.detail = detail
    else:
        db.session.add(OutlookExplanation(
            memo_id=int(memo_id), subject_name=subject_name,
            source_label=source_label, target_label=target_label,
            similarity=0.0, sentence="", detail=detail,
        ))
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
    return jsonify({"detail": detail, "cached": False})


@outlook_bp.route("/api/outlook/answers", methods=["POST"])
@token_required
def outlook_save_answer():
    """回答を履歴追記で保存。"""
    if not _feature_enabled():
        return _disabled_response()
    body = request.get_json() or {}
    memo_id = body.get("memo_id")
    subject_name = (body.get("subject_name") or "").strip()
    answer_text = (body.get("answer_text") or "").strip()
    if not memo_id or not subject_name:
        return jsonify({"error": "memo_id と subject_name は必須です"}), 400
    if not answer_text:
        return jsonify({"error": "回答が空です"}), 400

    user = _current_user_row()
    memo = db.session.get(Memo, int(memo_id))
    if memo is None or user is None or memo.user_id != user.id:
        return jsonify({"error": "メモが見つかりません"}), 404

    row = OutlookAnswer(user_id=user.id, memo_id=memo.id,
                        subject_name=subject_name, answer_text=answer_text[:8000])
    db.session.add(row)
    db.session.commit()
    return jsonify({"answer": row.to_dict()})


@outlook_bp.route("/api/outlook/answers", methods=["GET"])
@token_required
def outlook_get_answer():
    """最新回答を1件返す(画面表示用)。"""
    memo_id = request.args.get("memo_id", type=int)
    subject_name = (request.args.get("subject_name") or "").strip()
    if not memo_id or not subject_name:
        return jsonify({"error": "memo_id と subject_name は必須です"}), 400
    user = _current_user_row()
    if user is None:
        return jsonify({"answer": None})
    latest = (OutlookAnswer.query
              .filter_by(user_id=user.id, memo_id=memo_id, subject_name=subject_name)
              .order_by(OutlookAnswer.created_at.desc()).first())
    return jsonify({"answer": latest.to_dict() if latest else None})


# ---------- 管理者 ----------

@outlook_bp.route("/api/admin/outlook/settings", methods=["GET"])
@admin_required
def outlook_admin_get_settings():
    return jsonify({"settings": OutlookSettings.get_data(),
                    "engine": _engine.status()})


@outlook_bp.route("/api/admin/outlook/settings", methods=["PUT"])
@admin_required
def outlook_admin_put_settings():
    body = request.get_json() or {}
    incoming = body.get("settings", body)
    current = OutlookSettings.get_data()
    merged_input = dict(current)
    for k in ("enabled", "similarity_threshold", "max_nodes"):
        if k in incoming:
            merged_input[k] = incoming[k]
    saved = OutlookSettings.set_data(merged_input)
    return jsonify({"settings": saved})


@outlook_bp.route("/api/admin/outlook/export_csv", methods=["GET"])
@admin_required
def outlook_admin_export():
    """研究データ: 回答履歴と提示済み説明をCSV ZIPで出力。"""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        def write_rows(name, rows, cols):
            out = io.StringIO()
            w = csv.writer(out)
            w.writerow(cols)
            for r in rows:
                w.writerow([
                    (v.isoformat() if isinstance(v, datetime) else v)
                    for v in (getattr(r, c, "") for c in cols)
                ])
            zf.writestr(name, out.getvalue())

        write_rows("outlook_answers.csv", OutlookAnswer.query.all(),
                   ["id", "user_id", "memo_id", "subject_name", "answer_text", "created_at"])
        write_rows("outlook_explanations.csv", OutlookExplanation.query.all(),
                   ["id", "memo_id", "subject_name", "source_label", "target_label",
                    "similarity", "sentence", "detail", "created_at"])
    buf.seek(0)
    return send_file(
        buf, mimetype="application/zip", as_attachment=True,
        download_name=f"outlook_export_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.zip",
    )


def register_outlook_routes(app: Flask):
    """app.py から呼ぶ登録関数。"""
    app.register_blueprint(outlook_bp)
    logger.info("registered outlook (見通す) blueprint")