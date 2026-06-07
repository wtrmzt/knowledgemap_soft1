"""
users テーブルに password_hash カラムを追加するマイグレーション。

db.create_all() は既存テーブルにカラムを追加しないため、
パスワードログイン導入時はこのスクリプトを一度実行すること。

使い方:
    cd backend
    python migrate_add_password.py

SQLite / PostgreSQL(Supabase) どちらでも動作する。
"""
from flask import Flask
from sqlalchemy import inspect, text

from config import get_config
from models import db


def build_app() -> Flask:
    app = Flask(__name__)
    cfg = get_config()
    app.config["SQLALCHEMY_DATABASE_URI"] = cfg.SQLALCHEMY_DATABASE_URI
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = cfg.SQLALCHEMY_ENGINE_OPTIONS
    db.init_app(app)
    return app


def main():
    app = build_app()
    with app.app_context():
        insp = inspect(db.engine)

        tables = insp.get_table_names()
        if "users" not in tables:
            # まだテーブルが無い環境では create_all で一括生成
            db.create_all()
            print("[OK] created all tables (users included)")
            return

        cols = [c["name"] for c in insp.get_columns("users")]
        if "password_hash" in cols:
            print("[SKIP] users.password_hash already exists")
            return

        # ALTER TABLE は SQLite / PostgreSQL 共通でこの構文が使える
        db.session.execute(
            text("ALTER TABLE users ADD COLUMN password_hash VARCHAR(255)")
        )
        db.session.commit()
        print("[OK] added column users.password_hash")


if __name__ == "__main__":
    main()
