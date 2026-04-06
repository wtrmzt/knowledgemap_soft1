"""管理者エンドポイント: 統計・ユーザー一覧・統合マップ・CSVエクスポート"""
import io
import csv
import json
import zipfile
from datetime import datetime, timezone

from flask import Flask, jsonify, send_file
from models import db, User, Memo, KnowledgeMap, MapHistory, UserActivityLog
from auth import admin_required


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

        buf.seek(0)
        return send_file(
            buf,
            mimetype="application/zip",
            as_attachment=True,
            download_name=f"export_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.zip",
        )


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
