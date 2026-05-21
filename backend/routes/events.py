"""バッチイベント受信エンドポイント.

POST /api/events
    body: {
        "session_id": "uuid",
        "events": [
            {
                "client_event_id": "uuid",
                "type": "node.added_manual",
                "client_ts": "2026-05-06T10:23:45.123Z",
                "memo_id": 42,
                "payload": {...}
            },
            ...
        ]
    }

冪等性: client_event_id ユニーク制約で重複排除 (PostgreSQL ON CONFLICT).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from flask import Blueprint, g, request

from auth import token_required
from models import EventLog, db

bp = Blueprint("events", __name__, url_prefix="/api")

MAX_EVENTS_PER_REQUEST = 200


@bp.post("/events")
@token_required
def post_events():
    """イベントをバッチで受信. 不正なイベントは個別にスキップ."""
    body = request.get_json(silent=True) or {}
    events = body.get("events", [])
    session_id = body.get("session_id")

    if not isinstance(events, list):
        return {"error": "events must be a list"}, 400
    if len(events) > MAX_EVENTS_PER_REQUEST:
        return {
            "error": f"too many events (max {MAX_EVENTS_PER_REQUEST})"
        }, 400

    user_id = g.current_user["user_id"]
    user_agent = request.headers.get("User-Agent", "")[:500]

    rows: list[dict[str, Any]] = []
    for e in events:
        try:
            row = {
                "user_id": user_id,
                "session_id": session_id,
                "client_event_id": e["client_event_id"],
                "event_type": e["type"],
                "memo_id": e.get("memo_id"),
                "payload": e.get("payload") or {},
                "client_ts": _parse_iso(e["client_ts"]),
                "server_ts": datetime.utcnow(),
                "user_agent": user_agent,
            }
        except (KeyError, ValueError, TypeError):
            continue  # 不正イベントはスキップ
        rows.append(row)

    accepted = 0
    if rows:
        accepted = _bulk_insert(rows)

    return {"accepted": accepted, "received": len(events)}, 202


def _parse_iso(s: str) -> datetime:
    """ISO8601 をパース. 末尾 Z を +00:00 に変換."""
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    return datetime.fromisoformat(s)


def _bulk_insert(rows: list[dict[str, Any]]) -> int:
    """重複は無視して bulk insert. 戻り値は実際に挿入された件数(概算).

    PostgreSQL: ON CONFLICT DO NOTHING を使う.
    SQLite: INSERT OR IGNORE で代替.
    """
    dialect = db.engine.dialect.name

    if dialect == "postgresql":
        from sqlalchemy.dialects.postgresql import insert as pg_insert

        stmt = pg_insert(EventLog.__table__).values(rows)
        stmt = stmt.on_conflict_do_nothing(index_elements=["client_event_id"])
        result = db.session.execute(stmt)
        db.session.commit()
        return result.rowcount or len(rows)

    elif dialect == "sqlite":
        from sqlalchemy.dialects.sqlite import insert as sqlite_insert

        stmt = sqlite_insert(EventLog.__table__).values(rows)
        stmt = stmt.on_conflict_do_nothing(index_elements=["client_event_id"])
        result = db.session.execute(stmt)
        db.session.commit()
        return result.rowcount or len(rows)

    else:
        # フォールバック: 1 件ずつ insert (try/except)
        n = 0
        for r in rows:
            try:
                db.session.add(EventLog(**r))
                db.session.commit()
                n += 1
            except Exception:
                db.session.rollback()
        return n
