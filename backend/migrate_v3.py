"""v3 用 DB マイグレーションスクリプト (ワンショット).

既存の SQLite/PostgreSQL DB に対し、v3 で必要な新カラム・新テーブルを追加する.
既存データは保持される.

実行方法:
    cd backend
    python migrate_v3.py

特徴:
- テーブル名は inspector で自動検出(user/users どちらでも対応)
- 既に存在するカラムはスキップ(冪等性あり、何度実行しても安全)
- SQLite / PostgreSQL 両対応
"""
import os
import sys

# プロジェクト直下から起動した場合の import パス調整
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app
from models import db
from sqlalchemy import text, inspect


def _quote_table(dialect: str, table: str) -> str:
    """予約語(user 等)をエスケープしてテーブル名を返す."""
    if dialect == "postgresql":
        return f'"{table}"'
    # SQLite は予約語でも識別子としてそのまま使えるが念のため
    return f'"{table}"'


def _column_exists(insp, table: str, column: str) -> bool:
    try:
        cols = [c["name"] for c in insp.get_columns(table)]
        return column in cols
    except Exception:
        return False


def _table_exists(insp, table: str) -> bool:
    try:
        return table in insp.get_table_names()
    except Exception:
        return False


def _find_table(insp, candidates: list[str]) -> str | None:
    """候補テーブル名の中から実在するものを返す."""
    existing = set(insp.get_table_names())
    for name in candidates:
        if name in existing:
            return name
    return None


def main() -> None:
    app = create_app()

    with app.app_context():
        engine = db.engine
        dialect = engine.dialect.name
        insp = inspect(engine)

        print(f"=== v3 migration ===")
        print(f"Database URL: {engine.url}")
        print(f"Dialect: {dialect}")
        print(f"Existing tables: {insp.get_table_names()}")
        print()

        # ----------------------------------------------------------
        # 1. User テーブルへのカラム追加
        # ----------------------------------------------------------
        user_table = _find_table(insp, ["users", "user"])
        if user_table is None:
            print("[SKIP] users/user table not found; will be created by db.create_all()")
        else:
            print(f"[INFO] Detected user table: {user_table}")
            qt = _quote_table(dialect, user_table)

            user_columns = [
                ("google_sub", "VARCHAR(255)"),
                ("email", "VARCHAR(255)"),
                ("display_name", "VARCHAR(255)"),
                ("avatar_url", "VARCHAR(500)"),
                ("auth_provider", "VARCHAR(20) DEFAULT 'legacy'"),
                ("last_login_at", "TIMESTAMP"),
            ]

            for col_name, col_def in user_columns:
                if _column_exists(insp, user_table, col_name):
                    print(f"  [SKIP] {user_table}.{col_name} already exists")
                    continue
                stmt = f"ALTER TABLE {qt} ADD COLUMN {col_name} {col_def}"
                try:
                    with engine.begin() as conn:
                        conn.execute(text(stmt))
                    print(f"  [OK]   {stmt}")
                except Exception as e:
                    print(f"  [FAIL] {stmt}  -> {e}")

        print()

        # ----------------------------------------------------------
        # 2. Memo テーブルへのカラム追加
        # ----------------------------------------------------------
        memo_table = _find_table(insp, ["memos", "memo"])
        if memo_table is None:
            print("[SKIP] memos/memo table not found")
        else:
            print(f"[INFO] Detected memo table: {memo_table}")
            qt = _quote_table(dialect, memo_table)

            memo_columns = [
                ("title", "VARCHAR(200)"),
                ("thumbnail_url", "VARCHAR(500)"),
                ("node_count", "INTEGER DEFAULT 0"),
                ("edge_count", "INTEGER DEFAULT 0"),
                ("is_archived", "BOOLEAN DEFAULT 0"),  # SQLite で FALSE が動かない場合に備え 0
                ("updated_at", "TIMESTAMP"),
            ]

            for col_name, col_def in memo_columns:
                if _column_exists(insp, memo_table, col_name):
                    print(f"  [SKIP] {memo_table}.{col_name} already exists")
                    continue
                stmt = f"ALTER TABLE {qt} ADD COLUMN {col_name} {col_def}"
                try:
                    with engine.begin() as conn:
                        conn.execute(text(stmt))
                    print(f"  [OK]   {stmt}")
                except Exception as e:
                    print(f"  [FAIL] {stmt}  -> {e}")

            # updated_at の既存レコードを created_at で埋める(NULL のままだとソートで困る)
            if _column_exists(insp, memo_table, "updated_at") and _column_exists(insp, memo_table, "created_at"):
                try:
                    with engine.begin() as conn:
                        conn.execute(text(
                            f"UPDATE {qt} SET updated_at = created_at WHERE updated_at IS NULL"
                        ))
                    print(f"  [OK]   backfilled {memo_table}.updated_at from created_at")
                except Exception as e:
                    print(f"  [WARN] backfill failed: {e}")

        print()

        # ----------------------------------------------------------
        # 3. EventLog テーブルの新規作成 (db.create_all 経由)
        # ----------------------------------------------------------
        print("[INFO] running db.create_all() to create new tables (EventLog etc.)")
        try:
            db.create_all()
            insp2 = inspect(engine)
            if _table_exists(insp2, "event_logs"):
                print("  [OK]   event_logs table exists")
            else:
                print("  [WARN] event_logs table was NOT created")
        except Exception as e:
            print(f"  [FAIL] db.create_all() -> {e}")

        print()
        print("=== Migration done ===")
        print()
        print("Now run the backend:")
        print("    python app.py")


if __name__ == "__main__":
    main()
