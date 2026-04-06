"""
データベースモデル定義モジュール
研究データの正確な記録のため、細粒度な履歴管理とログ取得を設計
"""
from datetime import datetime, timezone
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


class User(db.Model):
    """ユーザー情報"""
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(100), unique=True, nullable=False, index=True)
    display_name = db.Column(db.String(200), default="")
    is_admin = db.Column(db.Boolean, default=False)
    consented = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    memos = db.relationship("Memo", backref="user", lazy="dynamic")
    activity_logs = db.relationship("UserActivityLog", backref="user", lazy="dynamic")

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "display_name": self.display_name,
            "is_admin": self.is_admin,
            "consented": self.consented,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Memo(db.Model):
    """ユーザーが入力した振り返りテキスト"""
    __tablename__ = "memos"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    content = db.Column(db.Text, nullable=False)
    mode = db.Column(db.String(50), default="reflection")  # reflection / research / idea
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))

    knowledge_map = db.relationship("KnowledgeMap", backref="memo", uselist=False)
    map_histories = db.relationship("MapHistory", backref="memo", lazy="dynamic",
                                    order_by="MapHistory.version.desc()")

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "content": self.content,
            "mode": self.mode,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class KnowledgeMap(db.Model):
    """最新の知識マップの状態"""
    __tablename__ = "knowledge_maps"

    id = db.Column(db.Integer, primary_key=True)
    memo_id = db.Column(db.Integer, db.ForeignKey("memos.id"), nullable=False, unique=True, index=True)
    nodes = db.Column(db.JSON, nullable=False, default=list)
    edges = db.Column(db.JSON, nullable=False, default=list)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": self.id,
            "memo_id": self.memo_id,
            "nodes": self.nodes,
            "edges": self.edges,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class MapHistory(db.Model):
    """生成・編集された知識マップのスナップショット履歴"""
    __tablename__ = "map_histories"

    id = db.Column(db.Integer, primary_key=True)
    memo_id = db.Column(db.Integer, db.ForeignKey("memos.id"), nullable=False, index=True)
    version = db.Column(db.Integer, nullable=False, default=1)
    nodes = db.Column(db.JSON, nullable=False, default=list)
    edges = db.Column(db.JSON, nullable=False, default=list)
    action = db.Column(db.String(100), default="update")  # create / update / rollback
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": self.id,
            "memo_id": self.memo_id,
            "version": self.version,
            "nodes": self.nodes,
            "edges": self.edges,
            "action": self.action,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class UserActivityLog(db.Model):
    """ユーザーの操作ログ"""
    __tablename__ = "user_activity_logs"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    action = db.Column(db.String(100), nullable=False)  # node_add, edge_connect, map_save, etc.
    detail = db.Column(db.JSON, default=dict)
    memo_id = db.Column(db.Integer, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "action": self.action,
            "detail": self.detail,
            "memo_id": self.memo_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
