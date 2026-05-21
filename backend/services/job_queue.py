"""非同期ジョブキュー (Celery).

長時間 IO バウンドな処理を Web リクエストから切り離す.

主な用途:
1. マップ生成 (10〜20秒) — 同期だと Gunicorn worker を占有する
2. サムネイル生成
3. 重い分析タスク

Phase 1 ですぐ導入する必要はない. まず Gunicorn + gevent で凌ぎ、
detect_topics 等が捌けなくなったら Celery 化する段階移行を推奨.

起動例:
    celery -A services.job_queue.celery_app worker -l info -c 4
"""

from __future__ import annotations

import os
from typing import Any

from celery import Celery

# Celery インスタンス. Flask app context が必要なタスクは
# create_celery_for_flask(app) でラップすること.
celery_app = Celery(
    "knowledge_map",
    broker=os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0"),
    backend=os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/1"),
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_time_limit=120,           # 2分でハードキル
    task_soft_time_limit=90,       # 90秒でソフトタイムアウト
    worker_prefetch_multiplier=2,  # IOバウンドなので軽めに
    task_acks_late=True,           # ワーカ落ちでも再実行
    result_expires=3600,           # 結果は1時間で消える
)


def make_celery_with_flask(app) -> Celery:
    """Flask app context をタスク内で使えるようラップ."""

    class FlaskTask(celery_app.Task):
        abstract = True

        def __call__(self, *args: Any, **kwargs: Any) -> Any:
            with app.app_context():
                return self.run(*args, **kwargs)

    celery_app.Task = FlaskTask
    return celery_app


# ---------------------------------------------------------------------------
# タスク定義
# ---------------------------------------------------------------------------

@celery_app.task(name="generate_map_async", bind=True, max_retries=2)
def generate_map_async(self, memo_id: int) -> dict:
    """メモから知識マップを生成して DB に保存する.

    フロントは POST /api/memos_with_map で job_id を受け取り、
    GET /api/jobs/<job_id> をポーリングする想定.
    """
    # 遅延 import で循環参照を避ける
    from models import Memo, KnowledgeMap, MapHistory, db
    from ai_service import generate_map_from_text

    memo = Memo.query.get(memo_id)
    if memo is None:
        return {"status": "error", "error": "memo not found"}

    try:
        result = generate_map_from_text(memo.content, memo.mode)
    except Exception as exc:
        # OpenAI の transient エラーはリトライ
        raise self.retry(exc=exc, countdown=2 ** self.request.retries)

    # KnowledgeMap upsert
    km = KnowledgeMap.query.filter_by(memo_id=memo.id).first()
    if km is None:
        km = KnowledgeMap(memo_id=memo.id)
        db.session.add(km)
    km.nodes = result["nodes"]
    km.edges = result["edges"]

    # 履歴
    history = MapHistory(
        memo_id=memo.id,
        nodes=result["nodes"],
        edges=result["edges"],
        action="create",
    )
    db.session.add(history)
    db.session.commit()

    # サムネイル生成も連鎖タスクで
    generate_thumbnail_async.delay(memo.id)

    return {
        "status": "ok",
        "memo_id": memo.id,
        "node_count": len(result["nodes"]),
        "edge_count": len(result["edges"]),
    }


@celery_app.task(name="generate_thumbnail_async")
def generate_thumbnail_async(memo_id: int) -> dict:
    """マップサムネイル生成 + 保存."""
    from models import Memo, KnowledgeMap, db
    from .thumbnail import render_map_thumbnail

    km = KnowledgeMap.query.filter_by(memo_id=memo_id).first()
    if km is None:
        return {"status": "error", "error": "map not found"}

    svg = render_map_thumbnail(km.nodes or [], km.edges or [])

    # 保存先は環境に合わせて差し替え
    # ここではローカル fs の例(本番は S3/R2 推奨)
    from pathlib import Path
    out_dir = Path(os.getenv("THUMBNAIL_DIR", "instance/thumbnails"))
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{memo_id}.svg"
    out_path.write_text(svg, encoding="utf-8")

    # Memo.thumbnail_url を更新
    memo = Memo.query.get(memo_id)
    if memo is not None:
        memo.thumbnail_url = f"/static/thumbnails/{memo_id}.svg"
        memo.node_count = len(km.nodes or [])
        memo.edge_count = len(km.edges or [])
        db.session.commit()

    return {"status": "ok", "memo_id": memo_id, "path": str(out_path)}
