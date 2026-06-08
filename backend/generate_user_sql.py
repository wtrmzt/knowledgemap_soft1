"""
ユーザー登録用 SQL 生成スクリプト（DB に接続しない）。

パスワードをローカルでハッシュ化し、Supabase の SQL Editor に貼り付けて実行できる
INSERT 文（users.sql）を生成する。あわせて配布用の平文 credentials CSV も出力する。

DB 接続も .env も不要。必要なのは werkzeug（Flask の依存で既に入っている）だけ。

----------------------------------------------------------------------
使い方
----------------------------------------------------------------------
学生（番号一覧 students.txt、パスワード = @+番号）＋管理者（ランダム強パスワード）:
    python generate_user_sql.py \
        --ids-file students.txt --password-prefix "@" \
        --admin-ids admin,researcher

学生だけ:
    python generate_user_sql.py --ids-file students.txt --password-prefix "@"

CSV で細かく指定（列: user_id,password,is_admin。password 空欄ならランダム）:
    python generate_user_sql.py --csv users.csv

出力:
    users.sql                 ← SQL Editor に貼って Run する
    credentials_<日時>.csv    ← user_id と平文パスワード（管理者のランダム値はここにしか無い）
"""
import argparse
import csv
import secrets
import string
import sys
from datetime import datetime

from werkzeug.security import generate_password_hash


# 紛らわしい文字を除いた集合（管理者のランダムパスワード用）
_PW_ALPHABET = "".join(
    c for c in (string.ascii_letters + string.digits) if c not in "O0oIl1"
) + "!@#$%*?"

# pbkdf2 はどの環境でも検証可能（サーバ側 check_password_hash がハッシュ先頭の方式を自動判別）
_HASH_METHOD = "pbkdf2:sha256"


def generate_password(length: int = 16) -> str:
    return "".join(secrets.choice(_PW_ALPHABET) for _ in range(length))


def sql_str(value: str) -> str:
    """SQL 文字列リテラル化（シングルクオートをエスケープ）。"""
    return "'" + value.replace("'", "''") + "'"


def parse_args():
    p = argparse.ArgumentParser(description="ユーザー登録 SQL を生成（DB非接続）")
    p.add_argument("--ids", help="カンマ区切りの user_id 一覧（学生）")
    p.add_argument("--ids-file", help="1行1IDのテキスト/CSV（学生番号一覧）")
    p.add_argument("--csv", help="user_id[,password][,is_admin] の CSV")
    p.add_argument("--admin-ids", help="管理者にする user_id（カンマ区切り。ランダム強パスワード）")
    p.add_argument("--password-prefix", help='学生パスワードを「接頭辞+ID」にする（例: "@"）')
    p.add_argument("--password-length", type=int, default=16, help="ランダムパスワード長（既定16）")
    p.add_argument("--table", default="users", help="テーブル名（既定 users）")
    p.add_argument("--out", default="users.sql", help="出力SQLファイル（既定 users.sql）")
    return p.parse_args()


def read_ids_file(path):
    ids = []
    with open(path, newline="", encoding="utf-8-sig") as f:
        for line in f:
            s = line.strip()
            if not s or s.startswith("#"):
                continue
            s = s.split(",")[0].strip()  # CSV なら1列目だけ
            if s:
                ids.append(s)
    return ids


def collect(args):
    """[(user_id, password, is_admin)] を組み立てる。password 未確定は None。"""
    rows: list[list] = []  # [uid, password_or_None, is_admin]

    # 学生（--ids / --ids-file）
    student_ids = []
    if args.ids:
        student_ids += [u.strip() for u in args.ids.split(",") if u.strip()]
    if args.ids_file:
        student_ids += read_ids_file(args.ids_file)
    for uid in student_ids:
        pw = (args.password_prefix + uid) if args.password_prefix is not None else None
        rows.append([uid, pw, False])

    # 管理者（--admin-ids）
    if args.admin_ids:
        for uid in args.admin_ids.split(","):
            uid = uid.strip()
            if uid:
                rows.append([uid, None, True])

    # CSV（明示指定。password 空欄ならランダム）
    if args.csv:
        with open(args.csv, newline="", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            for row in reader:
                uid = (row.get("user_id") or "").strip()
                if not uid:
                    continue
                pw = (row.get("password") or "").strip() or None
                is_admin = str(row.get("is_admin", "")).strip().lower() in ("1", "true", "yes")
                rows.append([uid, pw, is_admin])

    # uid 重複除去（後勝ち＝CSV/admin の指定を優先）
    merged: dict[str, list] = {}
    for uid, pw, is_admin in rows:
        if uid in merged:
            # 既存に上書き（password 指定があれば優先、is_admin は True を優先）
            if pw is not None:
                merged[uid][1] = pw
            merged[uid][2] = merged[uid][2] or is_admin
        else:
            merged[uid] = [uid, pw, is_admin]

    # 未確定パスワードはランダム生成
    final = []
    for uid, pw, is_admin in merged.values():
        if pw is None:
            pw = generate_password(args.password_length)
        final.append((uid, pw, is_admin))
    return final


def main():
    args = parse_args()
    targets = collect(args)
    if not targets:
        print("対象がありません。--ids / --ids-file / --csv / --admin-ids のいずれかを指定してください。")
        sys.exit(1)

    table = args.table
    lines = []
    lines.append("-- 自動生成: ユーザー登録 SQL（Supabase SQL Editor に貼り付けて Run）")
    lines.append("-- password_hash はローカルで pbkdf2 ハッシュ化済み。平文は含みません。")
    lines.append("BEGIN;")
    for uid, pw, is_admin in targets:
        pw_hash = generate_password_hash(pw, method=_HASH_METHOD)
        admin_sql = "true" if is_admin else "false"
        lines.append(
            f"INSERT INTO {table} (user_id, password_hash, is_admin, consented, auth_provider, created_at)\n"
            f"VALUES ({sql_str(uid)}, {sql_str(pw_hash)}, {admin_sql}, false, 'password', now())\n"
            f"ON CONFLICT (user_id) DO UPDATE\n"
            f"  SET password_hash = EXCLUDED.password_hash,\n"
            f"      is_admin      = EXCLUDED.is_admin,\n"
            f"      auth_provider = EXCLUDED.auth_provider;"
        )
    lines.append("COMMIT;")

    with open(args.out, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    # 平文 credentials CSV（配布・記録用）
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    creds_path = f"credentials_{stamp}.csv"
    with open(creds_path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["user_id", "password", "is_admin"])
        for uid, pw, is_admin in targets:
            w.writerow([uid, pw, "true" if is_admin else "false"])

    n_admin = sum(1 for _, _, a in targets if a)
    print(f"[OK] {len(targets)} 件（うち管理者 {n_admin} 件）の SQL を生成: {args.out}")
    print(f"[OK] 平文パスワード一覧: {creds_path}")
    print("     1) users.sql の中身を Supabase の SQL Editor に貼り付けて Run")
    print("     2) credentials CSV は配布後に安全に削除")


if __name__ == "__main__":
    main()