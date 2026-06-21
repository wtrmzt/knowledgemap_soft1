"""管理者エンドポイント: 統計・ユーザー一覧・統合マップ・CSVエクスポート"""
import io
import csv
import json
import zipfile
from datetime import datetime, timezone

from flask import Flask, jsonify, send_file, request, g
from models import db, User, Memo, KnowledgeMap, MapHistory, UserActivityLog
from auth import admin_required, token_required

# AppSettings は models.py の更新が必要。未更新でもアプリ全体が起動できるよう防御的に取り込む。
try:
    from models import AppSettings
except ImportError:
    AppSettings = None


def register_admin_routes(app: Flask):

    @app.route("/api/admin/stats", methods=["GET"])
    @admin_required
    def admin_stats():
        return jsonify({
            "user_count": User.query.count(),
            "memo_count": Memo.query.count(),
            "map_count": KnowledgeMap.query.count(),
            "log_count": UserActivityLog.query.count(),
        })

    @app.route("/api/admin/users", methods=["GET"])
    @admin_required
    def admin_users():
        users = User.query.all()
        return jsonify({"users": [u.to_dict() for u in users]})

    @app.route("/api/admin/combined_map", methods=["GET"])
    @admin_required
    def admin_combined_map():
        """全ユーザーの統合マップ"""
        maps = KnowledgeMap.query.all()
        all_nodes = []
        all_edges = []
        for km in maps:
            for node in (km.nodes or []):
                node_copy = dict(node)
                node_copy["_memo_id"] = km.memo_id
                all_nodes.append(node_copy)
            for edge in (km.edges or []):
                edge_copy = dict(edge)
                edge_copy["_memo_id"] = km.memo_id
                all_edges.append(edge_copy)
        return jsonify({"nodes": all_nodes, "edges": all_edges})

    @app.route("/api/admin/user/<int:user_db_id>/maps", methods=["GET"])
    @admin_required
    def admin_user_maps(user_db_id):
        """個別ユーザーのマップ・メモ一覧"""
        memos = Memo.query.filter_by(user_id=user_db_id).all()
        result = []
        for m in memos:
            km = KnowledgeMap.query.filter_by(memo_id=m.id).first()
            result.append({
                "memo": m.to_dict(),
                "map": km.to_dict() if km else None,
            })
        return jsonify({"data": result})

    # ===========================================================
    # ▼▼▼ アプリ設定（プロンプト調整 / モードON-OFF / 介入度）▼▼▼
    # ===========================================================

    @app.route("/api/admin/settings", methods=["GET"])
    @admin_required
    def admin_get_settings():
        """管理者向け: 全設定（プロンプト含む）を返す。"""
        if AppSettings is None:
            return jsonify({"error": "AppSettings モデルが見つかりません。models.py を更新版に差し替えてください。"}), 500
        return jsonify({"settings": AppSettings.get_data()})

    @app.route("/api/admin/settings", methods=["PUT"])
    @admin_required
    def admin_update_settings():
        """管理者向け: 設定を更新。部分更新可（既定値で補完）。"""
        if AppSettings is None:
            return jsonify({"error": "AppSettings モデルが見つかりません。models.py を更新版に差し替えてください。"}), 500
        body = request.get_json() or {}
        incoming = body.get("settings", body)  # {settings:{...}} でも素の {...} でも可

        # --- バリデーション（型・範囲を矯正して安全に保存）---
        current = AppSettings.get_data()
        new_data = {
            "enabled_modes": dict(current["enabled_modes"]),
            "intervention": dict(current["intervention"]),
            "features": dict(current.get("features", {})),
            "prompts": dict(current["prompts"]),
        }

        em = incoming.get("enabled_modes")
        if isinstance(em, dict):
            for k in ("reflection", "research", "idea"):
                if k in em:
                    new_data["enabled_modes"][k] = bool(em[k])
            # 全モードOFFは不可（最低1つは有効に）
            if not any(new_data["enabled_modes"].values()):
                new_data["enabled_modes"]["reflection"] = True

        iv = incoming.get("intervention")
        if isinstance(iv, dict):
            for k in ("topic_detection", "satellite", "relation", "edge_explanation"):
                if k in iv:
                    try:
                        lv = int(iv[k])
                    except (TypeError, ValueError):
                        lv = new_data["intervention"][k]
                    new_data["intervention"][k] = min(3, max(1, lv))

        ft = incoming.get("features")
        if isinstance(ft, dict):
            for k in ("relation_note",):
                if k in ft:
                    new_data["features"][k] = bool(ft[k])

        pr = incoming.get("prompts")
        if isinstance(pr, dict):
            for k in ("map_generation", "surrounding", "edge_explanation"):
                if k in pr and pr[k] is not None:
                    new_data["prompts"][k] = str(pr[k])[:8000]  # 上限を設けて保護

        saved = AppSettings.set_data(new_data)
        return jsonify({"settings": saved})

    # ===========================================================
    # ▼▼▼ 公開設定（ログインユーザーなら誰でも取得可。プロンプトは返さない）▼▼▼
    #   ダッシュボードが各機能のゲーティングに使う。
    # ===========================================================

    @app.route("/api/settings", methods=["GET"])
    @token_required
    def public_settings():
        if AppSettings is None:
            # 未更新でもフロントが安全側（全有効・Lv3）にフォールバックできる既定値を返す
            return jsonify({
                "enabled_modes": {"reflection": True, "research": True, "idea": True},
                "intervention": {"topic_detection": 3, "satellite": 3, "relation": 3, "edge_explanation": 3},
                "features": {"relation_note": True},
            })
        data = AppSettings.get_data()
        return jsonify({
            "enabled_modes": data["enabled_modes"],
            "intervention": data["intervention"],
            "features": data.get("features", {"relation_note": True}),
        })

    @app.route("/api/admin/export_csv", methods=["GET"])
    @admin_required
    def admin_export_csv():
        """全DBデータをCSV群としてZIPダウンロード"""
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            _write_csv(zf, "users.csv", User.query.all(),
                       ["id", "user_id", "display_name", "is_admin", "consented", "created_at"])
            _write_csv(zf, "memos.csv", Memo.query.all(),
                       ["id", "user_id", "content", "mode", "created_at", "updated_at"])
            _write_csv(zf, "knowledge_maps.csv", KnowledgeMap.query.all(),
                       ["id", "memo_id", "nodes", "edges", "updated_at"])
            _write_csv(zf, "map_histories.csv", MapHistory.query.all(),
                       ["id", "memo_id", "version", "nodes", "edges", "action", "created_at"])
            _write_csv(zf, "activity_logs.csv", UserActivityLog.query.all(),
                       ["id", "user_id", "action", "detail", "memo_id", "created_at"])

            # ★ 収集データ2,3: 保存マップから各ノードの由来(origin)一覧を出力
            #   origin: ai / manual / satellite / relation
            #   採用satellite = origin=satellite かつ is_satellite=False
            #   非採用satellite = origin=satellite かつ is_satellite=True
            _write_node_provenance_csv(zf, "node_provenance.csv")

        buf.seek(0)
        return send_file(
            buf,
            mimetype="application/zip",
            as_attachment=True,
            download_name=f"export_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.zip",
        )


def _write_node_provenance_csv(zf, filename):
    """保存済みマップの各ノードの由来(origin)を1行ずつ書き出す。"""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "memo_id", "node_id", "label", "origin",
        "is_satellite", "is_relation", "adopted",
    ])
    for km in KnowledgeMap.query.all():
        for node in (km.nodes or []):
            data = node.get("data", {}) if isinstance(node, dict) else {}
            origin = data.get("origin")
            is_sat = bool(data.get("isSatellite"))
            is_rel = bool(data.get("isRelation"))
            if origin is None:
                origin = "satellite" if is_sat else ("relation" if is_rel else "ai")
            # 周辺概念の採用フラグ: origin=satellite かつ 現在 satellite でない = 採用済み
            adopted = ""
            if origin == "satellite":
                adopted = "yes" if not is_sat else "no"
            writer.writerow([
                km.memo_id,
                node.get("id") if isinstance(node, dict) else "",
                data.get("label") or (node.get("label") if isinstance(node, dict) else ""),
                origin, is_sat, is_rel, adopted,
            ])
    zf.writestr(filename, output.getvalue())


def _write_csv(zf, filename, records, columns):
    """ZIPファイルにCSVを書き込むヘルパー"""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(columns)
    for record in records:
        row = []
        for col in columns:
            val = getattr(record, col, "")
            if isinstance(val, (dict, list)):
                val = json.dumps(val, ensure_ascii=False)
            elif isinstance(val, datetime):
                val = val.isoformat()
            row.append(val)
        writer.writerow(row)
    zf.writestr(filename, output.getvalue())