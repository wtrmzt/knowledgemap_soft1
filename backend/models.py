"""
データベースモデル定義モジュール
研究データの正確な記録のため、細粒度な履歴管理とログ取得を設計
"""
from datetime import datetime, timezone
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash

from sqlalchemy import Index
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

    # ===== v3 追加(Google ログイン)=====
    google_sub = db.Column(db.String(255), unique=True, nullable=True, index=True)
    email = db.Column(db.String(255), unique=True, nullable=True, index=True)
    display_name = db.Column(db.String(255), nullable=True)
    avatar_url = db.Column(db.String(500), nullable=True)
    auth_provider = db.Column(db.String(20), nullable=False, default="legacy")
    last_login_at = db.Column(db.DateTime, nullable=True)

    password_hash = db.Column(db.String(255), nullable=True)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "display_name": self.display_name,
            "is_admin": self.is_admin,
            "consented": self.consented,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            
            # ===== v3 追加 =====
            "email": self.email,
            "display_name": self.display_name,
            "avatar_url": self.avatar_url,
            "auth_provider": self.auth_provider,
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


    # ===== v3 追加 =====
    title = db.Column(db.String(200), nullable=True)
    thumbnail_url = db.Column(db.String(500), nullable=True)
    node_count = db.Column(db.Integer, nullable=False, default=0)
    edge_count = db.Column(db.Integer, nullable=False, default=0)
    is_archived = db.Column(db.Boolean, nullable=False, default=False, index=True)

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


class AppSettings(db.Model):
    """
    アプリ全体の設定（管理者が編集する単一行テーブル / 研究の介入条件など）。

      - enabled_modes : 振り返り/調べ物/アイデア の各モードON/OFF
      - intervention  : 比較実験用の介入度（各機能 Lv1-3）
          topic_detection : リアルタイムトピック検知＆記述提案
          satellite       : 周辺概念(Satellite)の自動提案
          relation        : 関連科目推薦エンジン
      - prompts       : プロンプト調整（空文字 = 既定プロンプトを使用）
          map_generation : 初期マップ生成
          surrounding    : 周辺知識収集

    db.create_all() で自動作成される（既存DBにも不足テーブルとして作られる）。
    """
    __tablename__ = "app_settings"

    id = db.Column(db.Integer, primary_key=True)  # 常に 1 行のみ使用
    data = db.Column(db.JSON, nullable=False, default=dict)
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))

    DEFAULTS = {
        "enabled_modes": {"reflection": True, "research": True, "idea": True},
        "intervention": {
            "topic_detection": 3,  # 1: 可視化なし / 2: 状態可視化のみ / 3: 提案カード(フル)
            "satellite": 3,        # 1: 非表示 / 2: ラベルのみ / 3: フル提示
            "relation": 3,         # 1: 非表示 / 2: 科目名のみ / 3: 部分木接続
        },
        "prompts": {
            "map_generation": "",  # 空 = ai_service の既定プロンプト
            "surrounding": "",
        },
    }

    @classmethod
    def _merged(cls, raw: dict | None) -> dict:
        """保存済みデータに既定値を補完して返す（キー欠落に強くする）。"""
        raw = raw or {}
        d = cls.DEFAULTS
        return {
            "enabled_modes": {**d["enabled_modes"], **(raw.get("enabled_modes") or {})},
            "intervention": {**d["intervention"], **(raw.get("intervention") or {})},
            "prompts": {**d["prompts"], **(raw.get("prompts") or {})},
        }

    @classmethod
    def get_data(cls) -> dict:
        row = cls.query.get(1)
        return cls._merged(row.data if row else None)

    @classmethod
    def set_data(cls, new_data: dict) -> dict:
        row = cls.query.get(1)
        merged = cls._merged(new_data)
        if row is None:
            row = cls(id=1, data=merged)
            db.session.add(row)
        else:
            row.data = merged
        db.session.commit()
        return merged

    def to_dict(self):
        return {
            "data": self._merged(self.data),
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }