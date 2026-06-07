"""
管理者ユーザーを作成 / 既存ユーザーを管理者に昇格するスクリプト。

使い方（backend ディレクトリで実行）:
    python create_admin.py --user-id admin --password "好きなパスワード"

  - 同じ user_id が既にいれば「管理者に昇格＋パスワード更新」を行う。
  - user_id は ADMIN_USER_IDS（既定: admin / researcher / admin_user）にすると、
    ログイン側で is_admin を再計算する実装でも確実に管理者になる。

実行後、ログイン画面で その user_id とパスワードでログインすれば管理者になります。
"""
import argparse

from app import app          # app.py の create_app() 済みインスタンス
from models import db, User
from config import Config


def main():
    parser = argparse.ArgumentParser(description="管理者ユーザーを作成/昇格する")
    parser.add_argument("--user-id", required=True, help="ログインID（例: admin）")
    parser.add_argument("--password", required=True, help="ログインパスワード")
    parser.add_argument("--display-name", default="管理者", help="表示名（任意）")
    args = parser.parse_args()

    with app.app_context():
        # テーブルが無い場合に備えて作成（既存環境では何もしない）
        db.create_all()

        user = User.query.filter_by(user_id=args.user_id).first()
        if user is None:
            user = User(user_id=args.user_id, auth_provider="legacy")
            db.session.add(user)
            action = "作成"
        else:
            action = "更新"

        user.is_admin = True
        user.display_name = args.display_name
        user.set_password(args.password)
        db.session.commit()

        in_admin_ids = args.user_id in getattr(Config, "ADMIN_USER_IDS", set())
        print(f"[OK] 管理者ユーザーを{action}しました: "
              f"user_id={user.user_id}, is_admin={user.is_admin}")
        if not in_admin_ids:
            print("[注意] この user_id は ADMIN_USER_IDS に含まれていません。"
                  "ログイン実装が is_admin を再計算する場合、管理者から外れる可能性があります。"
                  "確実にするには user_id を admin / researcher / admin_user のいずれかにするか、"
                  "環境変数 ADMIN_USER_IDS にこの ID を追加してください。")


if __name__ == "__main__":
    main()
