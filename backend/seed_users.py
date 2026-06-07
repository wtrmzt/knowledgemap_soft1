"""
許可ユーザーの事前登録スクリプト（パスワードログイン用）。

「こちら側で予め設定したユーザーID」をこのスクリプトで DB に登録する。
登録されたユーザー（password_hash 付き）だけが /api/login でログインできる。

----------------------------------------------------------------------
使い方
----------------------------------------------------------------------
1) ID を列挙して自動でパスワード生成（推奨・最も手軽）
    python seed_users.py --ids subject01,subject02,subject03

2) CSV から登録（列: user_id[,password][,is_admin]）
    python seed_users.py --csv users.csv
   CSV 例:
       user_id,password,is_admin
       subject01,,false        # password 空欄なら自動生成
       subject02,Kx9!mq2,false
       researcher01,,true

3) 既存ユーザーのパスワードを上書きリセット
    python seed_users.py --ids subject01 --reset

4) 連番で一括作成（例: subject01〜subject30）
    python seed_users.py --prefix subject --count 30

----------------------------------------------------------------------
出力
----------------------------------------------------------------------
登録/更新した user_id と「平文パスワード」を credentials_<日時>.csv に書き出す。
このファイルは配布のためだけに使い、配布後は安全に削除すること
（平文パスワードは DB には保存されない＝ここでしか取得できない）。
"""
import argparse
import csv
import secrets
import string
import sys
from datetime import datetime

from flask import Flask

from config import get_config, Config
from models import db, User


# 紛らわしい文字（O/0, l/1 等）を除いた文字集合
_PW_ALPHABET = "".join(
    c for c in (string.ascii_letters + string.digits)
    if c not in "O0oIl1"
) + "!@#$%*?"


def build_app() -> Flask:
    app = Flask(__name__)
    cfg = get_config()
    app.config["SQLALCHEMY_DATABASE_URI"] = cfg.SQLALCHEMY_DATABASE_URI
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = cfg.SQLALCHEMY_ENGINE_OPTIONS
    db.init_app(app)
    return app


def generate_password(length: int = 14) -> str:
    return "".join(secrets.choice(_PW_ALPHABET) for _ in range(length))


def parse_args():
    p = argparse.ArgumentParser(description="許可ユーザーを登録/更新する")
    p.add_argument("--ids", help="カンマ区切りの user_id 一覧")
    p.add_argument("--csv", help="user_id[,password][,is_admin] の CSV")
    p.add_argument("--prefix", help="連番作成の接頭辞（例: subject）")
    p.add_argument("--count", type=int, default=0, help="連番作成の件数")
    p.add_argument("--start", type=int, default=1, help="連番の開始番号（既定 1）")
    p.add_argument("--pad", type=int, default=2, help="連番のゼロ埋め桁数（既定 2）")
    p.add_argument("--reset", action="store_true", help="既存ユーザーのパスワードも上書き")
    p.add_argument("--password-length", type=int, default=14)
    return p.parse_args()


def collect_targets(args):
    """[(user_id, explicit_password_or_None, is_admin), ...] を返す。"""
    targets: list[tuple[str, str | None, bool]] = []

    if args.ids:
        for uid in args.ids.split(","):
            uid = uid.strip()
            if uid:
                targets.append((uid, None, uid in Config.ADMIN_USER_IDS))

    if args.csv:
        with open(args.csv, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                uid = (row.get("user_id") or "").strip()
                if not uid:
                    continue
                pw = (row.get("password") or "").strip() or None
                is_admin = str(row.get("is_admin", "")).strip().lower() in ("1", "true", "yes")
                is_admin = is_admin or (uid in Config.ADMIN_USER_IDS)
                targets.append((uid, pw, is_admin))

    if args.prefix and args.count > 0:
        for i in range(args.start, args.start + args.count):
            uid = f"{args.prefix}{str(i).zfill(args.pad)}"
            targets.append((uid, None, uid in Config.ADMIN_USER_IDS))

    return targets


def main():
    args = parse_args()
    targets = collect_targets(args)
    if not targets:
        print("対象がありません。--ids / --csv / --prefix+--count のいずれかを指定してください。")
        sys.exit(1)

    app = build_app()
    results: list[tuple[str, str, str]] = []  # (user_id, password, status)

    with app.app_context():
        # password_hash カラムの存在確認（未マイグレーションを早期に検知）
        if not hasattr(User, "password_hash"):
            print("[ERROR] User モデルに password_hash がありません。models.py を更新してください。")
            sys.exit(1)

        for uid, explicit_pw, is_admin in targets:
            user = User.query.filter_by(user_id=uid).first()
            password = explicit_pw or generate_password(args.password_length)

            if user is None:
                user = User(user_id=uid, is_admin=is_admin, auth_provider="password")
                user.set_password(password)
                db.session.add(user)
                results.append((uid, password, "created"))
            else:
                if args.reset or explicit_pw or not getattr(user, "password_hash", None):
                    user.set_password(password)
                    user.is_admin = is_admin
                    if getattr(user, "auth_provider", None) in (None, "legacy", "demo"):
                        user.auth_provider = "password"
                    results.append((uid, password, "updated"))
                else:
                    # 既にパスワード設定済みで --reset 無し → 触らない
                    results.append((uid, "(unchanged)", "skipped"))

        db.session.commit()

    # 認証情報を CSV に書き出し
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = f"credentials_{stamp}.csv"
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["user_id", "password", "status"])
        for row in results:
            writer.writerow(row)

    created = sum(1 for r in results if r[2] == "created")
    updated = sum(1 for r in results if r[2] == "updated")
    skipped = sum(1 for r in results if r[2] == "skipped")
    print(f"[OK] created={created} updated={updated} skipped={skipped}")
    print(f"[OK] 認証情報を書き出しました: {out_path}")
    print("     ※ 配布後はこのファイルを安全に削除してください（平文パスワードはここにしかありません）。")


if __name__ == "__main__":
    main()
