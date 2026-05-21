"""v2 features: google login, map list, event logs

Revision ID: 001_v2_features
Revises:
Create Date: 2026-05-06

このマイグレーションは ARCHITECTURE_v2_proposal.md の Phase 2〜4 で
追加するスキーマ変更をまとめて行う. 段階的に適用する場合は、
このファイルを Phase ごとに分割して個別の revision として作成すること.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "001_v2_features"
down_revision = None  # 既存スキーマがある場合は最後の revision id を入れる
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # Phase 2: User テーブル拡張
    # ------------------------------------------------------------------
    with op.batch_alter_table("user") as batch:
        batch.add_column(sa.Column("google_sub", sa.String(255), nullable=True))
        batch.add_column(sa.Column("email", sa.String(255), nullable=True))
        batch.add_column(sa.Column("display_name", sa.String(255), nullable=True))
        batch.add_column(sa.Column("avatar_url", sa.String(500), nullable=True))
        batch.add_column(
            sa.Column("auth_provider", sa.String(20), nullable=False, server_default="legacy")
        )
        batch.add_column(sa.Column("last_login_at", sa.DateTime, nullable=True))
        batch.create_unique_constraint("uq_user_google_sub", ["google_sub"])
        batch.create_unique_constraint("uq_user_email", ["email"])
        batch.create_index("ix_user_google_sub", ["google_sub"])
        batch.create_index("ix_user_email", ["email"])

    # ------------------------------------------------------------------
    # Phase 3: Memo テーブル拡張
    # ------------------------------------------------------------------
    with op.batch_alter_table("memo") as batch:
        batch.add_column(sa.Column("title", sa.String(200), nullable=True))
        batch.add_column(sa.Column("thumbnail_url", sa.String(500), nullable=True))
        batch.add_column(sa.Column("node_count", sa.Integer, nullable=False, server_default="0"))
        batch.add_column(sa.Column("edge_count", sa.Integer, nullable=False, server_default="0"))
        batch.add_column(
            sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now())
        )
        batch.add_column(
            sa.Column("is_archived", sa.Boolean, nullable=False, server_default=sa.false())
        )
        batch.create_index("ix_memo_user_updated", ["user_id", "updated_at"])
        batch.create_index("ix_memo_user_mode", ["user_id", "mode"])
        batch.create_index("ix_memo_is_archived", ["is_archived"])

    # ------------------------------------------------------------------
    # Phase 4: EventLog 新設
    # ------------------------------------------------------------------
    op.create_table(
        "event_logs",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.String(64), nullable=False),
        sa.Column("session_id", sa.String(64), nullable=True),
        sa.Column("client_event_id", sa.String(64), nullable=False, unique=True),
        sa.Column("event_type", sa.String(64), nullable=False),
        sa.Column("memo_id", sa.Integer, nullable=True),
        sa.Column("payload", sa.JSON, nullable=False),
        sa.Column("client_ts", sa.DateTime, nullable=False),
        sa.Column("server_ts", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("user_agent", sa.String(500), nullable=True),
    )
    op.create_index("ix_event_user_id", "event_logs", ["user_id"])
    op.create_index("ix_event_event_type", "event_logs", ["event_type"])
    op.create_index("ix_event_memo_id", "event_logs", ["memo_id"])
    op.create_index("ix_event_server_ts", "event_logs", ["server_ts"])
    op.create_index("ix_event_session", "event_logs", ["session_id", "client_ts"])
    op.create_index(
        "ix_event_user_type_ts", "event_logs", ["user_id", "event_type", "server_ts"]
    )


def downgrade() -> None:
    op.drop_table("event_logs")

    with op.batch_alter_table("memo") as batch:
        batch.drop_index("ix_memo_is_archived")
        batch.drop_index("ix_memo_user_mode")
        batch.drop_index("ix_memo_user_updated")
        batch.drop_column("is_archived")
        batch.drop_column("updated_at")
        batch.drop_column("edge_count")
        batch.drop_column("node_count")
        batch.drop_column("thumbnail_url")
        batch.drop_column("title")

    with op.batch_alter_table("user") as batch:
        batch.drop_index("ix_user_email")
        batch.drop_index("ix_user_google_sub")
        batch.drop_constraint("uq_user_email", type_="unique")
        batch.drop_constraint("uq_user_google_sub", type_="unique")
        batch.drop_column("last_login_at")
        batch.drop_column("auth_provider")
        batch.drop_column("avatar_url")
        batch.drop_column("display_name")
        batch.drop_column("email")
        batch.drop_column("google_sub")
