# `backend/models.py` への変更

既存の `User` / `Memo` を拡張し、新たに `EventLog` を追加します。

## 1. import に追加

```python
from datetime import datetime
# 既存に加えて(必要なら):
from sqlalchemy import Index
```

## 2. User クラスに以下のカラムを追加

```python
class User(db.Model):
    # ===== 既存カラム =====
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(64), unique=True, nullable=False)
    is_admin = db.Column(db.Boolean, default=False)
    consented = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # ===== 追加(Phase 2: Google ログイン) =====
    google_sub = db.Column(db.String(255), unique=True, nullable=True, index=True)
    email = db.Column(db.String(255), unique=True, nullable=True, index=True)
    display_name = db.Column(db.String(255), nullable=True)
    avatar_url = db.Column(db.String(500), nullable=True)
    auth_provider = db.Column(db.String(20), default="legacy", nullable=False)
    last_login_at = db.Column(db.DateTime, nullable=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "email": self.email,
            "display_name": self.display_name,
            "avatar_url": self.avatar_url,
            "is_admin": self.is_admin,
            "consented": self.consented,
            "auth_provider": self.auth_provider,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
```

## 3. Memo クラスに以下のカラムとインデックスを追加

```python
class Memo(db.Model):
    # ===== 既存カラム =====
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(64), nullable=False, index=True)
    content = db.Column(db.Text, nullable=False)
    mode = db.Column(db.String(20), default="reflection")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # ===== 追加(Phase 3: マップ閲覧) =====
    title = db.Column(db.String(200), nullable=True)
    thumbnail_url = db.Column(db.String(500), nullable=True)
    node_count = db.Column(db.Integer, default=0, nullable=False)
    edge_count = db.Column(db.Integer, default=0, nullable=False)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
    is_archived = db.Column(db.Boolean, default=False, nullable=False, index=True)

    __table_args__ = (
        db.Index("ix_memo_user_updated", "user_id", "updated_at"),
        db.Index("ix_memo_user_mode", "user_id", "mode"),
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "content": self.content,
            "mode": self.mode,
            "title": self.title,
            "thumbnail_url": self.thumbnail_url,
            "node_count": self.node_count,
            "edge_count": self.edge_count,
            "is_archived": self.is_archived,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def to_summary_dict(self) -> dict:
        """一覧画面用の軽量版. 本文は冒頭のみ."""
        preview = (self.content or "")[:200]
        return {
            "id": self.id,
            "title": self.title or preview[:40] or f"Memo #{self.id}",
            "preview": preview,
            "mode": self.mode,
            "thumbnail_url": self.thumbnail_url,
            "node_count": self.node_count,
            "edge_count": self.edge_count,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
```

## 4. EventLog クラスを新規追加

```python
class EventLog(db.Model):
    """ユーザー操作・行動ログ.

    既存 UserActivityLog より細粒度・型付き. 100名規模での書き込み負荷を
    考慮し、client_event_id によるバルク冪等挿入を前提とする.
    """
    __tablename__ = "event_logs"

    id = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    user_id = db.Column(db.String(64), nullable=False, index=True)
    session_id = db.Column(db.String(64), nullable=True)
    client_event_id = db.Column(db.String(64), unique=True, nullable=False)
    event_type = db.Column(db.String(64), nullable=False, index=True)
    memo_id = db.Column(db.Integer, nullable=True, index=True)
    payload = db.Column(db.JSON, nullable=False, default=dict)
    client_ts = db.Column(db.DateTime, nullable=False)
    server_ts = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)
    user_agent = db.Column(db.String(500), nullable=True)

    __table_args__ = (
        db.Index("ix_event_user_type_ts", "user_id", "event_type", "server_ts"),
        db.Index("ix_event_session", "session_id", "client_ts"),
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "session_id": self.session_id,
            "event_type": self.event_type,
            "memo_id": self.memo_id,
            "payload": self.payload,
            "client_ts": self.client_ts.isoformat() if self.client_ts else None,
            "server_ts": self.server_ts.isoformat() if self.server_ts else None,
        }
```

## 注意事項

- 既存の `UserActivityLog` は当面残し、ログ送信のクライアント実装が `analytics.ts` に置き換わったタイミングで段階的に削除すること
- PostgreSQL では `JSON` より `JSONB` を推奨(インデックス可能)。`from sqlalchemy.dialects.postgresql import JSONB` を使い `db.Column(JSONB, ...)` に置き換えると分析クエリが速くなる
