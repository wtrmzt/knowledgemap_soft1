"""Alembic 環境設定.

Flask app から DB URL と target_metadata を取得して使用する.

初回セットアップ手順:
    cd backend
    alembic init migrations          # alembic.ini と migrations/ ができる
    # この env.py で上書き
    # 既存スキーマに対しては:
    alembic stamp head               # 「現状をベースに据える」
    # 以後の変更:
    alembic revision --autogenerate -m "..."
    alembic upgrade head
"""

from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# Flask アプリを import して metadata を取得
# (循環参照を避けるためファイル先頭ではなく関数内で import)
def _get_metadata_and_url():
    from app import create_app
    from models import db

    app = create_app()
    with app.app_context():
        url = app.config["SQLALCHEMY_DATABASE_URI"]
        return db.metadata, url


# Alembic Config オブジェクト
config = context.config

# logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata, db_url = _get_metadata_and_url()

# alembic.ini の sqlalchemy.url を上書き
config.set_main_option("sqlalchemy.url", db_url)


def run_migrations_offline() -> None:
    context.configure(
        url=db_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
