# -*- coding: utf-8 -*-
"""
migrate_outlook.py — 「見通す」機能の新テーブル作成マイグレーション(冪等)

作成テーブル:
  - outlook_settings
  - outlook_answers
  - outlook_explanations

使い方:
  cd backend
  python migrate_outlook.py

新テーブルのみの追加なので db.create_all() で作成できる(既存テーブルへの
カラム追加はないため ALTER TABLE は不要)。既に存在する場合は何もしない。
Render の Pre-Deploy Command に `python migrate_outlook.py` を登録可能。
本番 Supabase に SQL を直接流す場合は supabase_outlook.sql を使用。
"""
import sys

from sqlalchemy import inspect


def main():
    # モデル登録のため import (副作用で db.Model に登録される)
    from app import app  # create_app 済みインスタンス
    import outlook_feature  # noqa: F401
    from models import db

    targets = ["outlook_settings", "outlook_answers", "outlook_explanations"]

    with app.app_context():
        insp = inspect(db.engine)
        existing = set(insp.get_table_names())
        missing = [t for t in targets if t not in existing]

        if not missing:
            print("[OK] outlook テーブルは全て存在します:", ", ".join(targets))
            return 0

        print("[INFO] 作成対象:", ", ".join(missing))
        db.create_all()

        insp = inspect(db.engine)
        existing = set(insp.get_table_names())
        failed = [t for t in targets if t not in existing]
        if failed:
            print("[NG] 作成に失敗:", ", ".join(failed))
            return 1
        for t in targets:
            print(f"[OK] {t} table exists")
        return 0


if __name__ == "__main__":
    sys.exit(main())