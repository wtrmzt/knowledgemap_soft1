"""
memo_histories テーブルを作成するマイグレーション（メモ本文の変更履歴）。

- 新規テーブルのため db.create_all() で作成される（既存テーブルは変更しない）。
- ローカル(SQLite) / 本番(Supabase/PostgreSQL) 両対応・冪等（何度実行してもOK）。

使い方（backend ディレクトリで）:
    # ローカル(SQLite)
    python migrate_add_memo_history.py

    # 本番(Supabase) へ流す場合は DATABASE_URL を本番に向けて実行
    #   bash:
    #     DATABASE_URL="postgresql+psycopg2://postgres:[PASS]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres" \
    #       python migrate_add_memo_history.py
    #   PowerShell:
    #     $env:DATABASE_URL="postgresql+psycopg2://...:6543/postgres"; python migrate_add_memo_history.py
"""
from sqlalchemy import inspect

from app import app
from models import db
import memo_history  # ← MemoHistory モデルを登録するために import する


def main():
    with app.app_context():
        db.create_all()  # 未作成のテーブル(memo_histories)のみ作成
        tables = inspect(db.engine).get_table_names()
        if "memo_histories" in tables:
            cols = [c["name"] for c in inspect(db.engine).get_columns("memo_histories")]
            print(f"[OK] memo_histories テーブルを確認しました（dialect={db.engine.dialect.name}）。")
            print(f"[INFO] 列: {cols}")
        else:
            print("[ERROR] memo_histories が作成されませんでした。app.py の import と DATABASE_URL を確認してください。")


if __name__ == "__main__":
    main()
