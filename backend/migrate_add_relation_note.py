"""
memos.relation_note 列を追加するマイグレーション（機能3: 過去・未来の記述項目）

特徴:
  - ローカル(SQLite) / 本番(PostgreSQL/Supabase) の両対応
  - 冪等（何度実行しても安全。既に列があれば何もしない）
  - db.create_all() は既存テーブルに列を追加しないため、本スクリプトで明示的に追加する
  - 同時に新規テーブル（edge_explanations 等）も create_all で作成する

使い方（backend ディレクトリで実行）:
    # ローカル(SQLite): DATABASE_URL 未設定のまま
    python migrate_add_relation_note.py

    # 本番(Supabase) に対して流す場合は DATABASE_URL を本番に向けて実行
    #   Windows PowerShell:
    #     $env:DATABASE_URL="postgresql+psycopg2://postgres:[PASS]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres"
    #     python migrate_add_relation_note.py
    #   bash:
    #     DATABASE_URL="postgresql+psycopg2://...:6543/postgres" python migrate_add_relation_note.py
"""
from sqlalchemy import inspect, text

from app import app
from models import db


def column_exists(inspector, table: str, column: str) -> bool:
    try:
        return column in [c["name"] for c in inspector.get_columns(table)]
    except Exception:
        return False


def main():
    with app.app_context():
        # 1) 新規テーブル（edge_explanations など）を作成。既存テーブルは変更しない。
        db.create_all()

        engine = db.engine
        dialect = engine.dialect.name  # 'sqlite' / 'postgresql'
        inspector = inspect(engine)

        # 2) memos テーブルの存在確認
        if "memos" not in inspector.get_table_names():
            print("[ERROR] memos テーブルが見つかりません。DATABASE_URL が正しいか確認してください。")
            return

        # 3) relation_note 列を追加（無ければ）
        if column_exists(inspector, "memos", "relation_note"):
            print(f"[OK] memos.relation_note は既に存在します（dialect={dialect}）。変更なし。")
        else:
            if dialect == "postgresql":
                sql = "ALTER TABLE memos ADD COLUMN IF NOT EXISTS relation_note TEXT"
            else:  # sqlite ほか
                sql = "ALTER TABLE memos ADD COLUMN relation_note TEXT"
            with engine.begin() as conn:
                conn.execute(text(sql))
            print(f"[OK] memos.relation_note を追加しました（dialect={dialect}）。")

        # 4) 既存行の NULL を空文字に整える（任意・安全のため）
        try:
            with engine.begin() as conn:
                conn.execute(text(
                    "UPDATE memos SET relation_note = '' WHERE relation_note IS NULL"
                ))
            print("[OK] 既存行の relation_note(NULL) を空文字で補完しました。")
        except Exception as e:
            print(f"[WARN] NULL 補完はスキップしました: {e}")

        # 5) 確認
        cols = [c["name"] for c in inspect(engine).get_columns("memos")]
        tables = inspect(engine).get_table_names()
        print(f"[INFO] memos の列: {cols}")
        print(f"[INFO] edge_explanations テーブル: {'あり' if 'edge_explanations' in tables else 'なし'}")


if __name__ == "__main__":
    main()