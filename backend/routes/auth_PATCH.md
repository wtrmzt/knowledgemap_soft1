# `backend/routes/auth.py` への変更

`/api/auth/google` エンドポイントを追加します。

## import 追加

```python
from datetime import datetime
from flask import current_app
from services.google_auth import verify_google_id_token, GoogleAuthError
```

## エンドポイント追加

```python
@bp.post("/auth/google")
def login_with_google():
    """Google ID Token (credential) を受け取り、ログイン or 新規ユーザー作成.

    リクエスト:
        { "credential": "<google id token jwt>" }

    レスポンス:
        { "token": "<our jwt>", "user": {...} }

    400 / 401 を返す場合:
        - credential が無い / 不正
        - GOOGLE_ALLOWED_HD ドメイン制限違反
    """
    body = request.get_json(silent=True) or {}
    credential = body.get("credential")
    if not credential:
        return {"error": "credential required"}, 400

    try:
        gpayload = verify_google_id_token(credential)
    except GoogleAuthError as e:
        current_app.logger.warning("google auth failed: %s", e)
        return {"error": "google_auth_failed", "detail": str(e)}, 401

    sub = gpayload["sub"]
    email = gpayload.get("email")
    name = gpayload.get("name")
    picture = gpayload.get("picture")

    # 1) google_sub で検索
    user = User.query.filter_by(google_sub=sub).first()

    # 2) 同 email の既存(legacy) ユーザーが居ればリンク
    if user is None and email:
        user = User.query.filter_by(email=email).first()

    # 3) 完全新規作成
    if user is None:
        # user_id は Google sub の頭 16 文字を使った一意 ID
        user = User(
            user_id=f"g_{sub[:16]}",
            google_sub=sub,
            email=email,
            display_name=name,
            avatar_url=picture,
            auth_provider="google",
            is_admin=(email in current_app.config.get("ADMIN_EMAILS", set())),
        )
        db.session.add(user)
    else:
        # 既存ユーザーに Google アカウントをリンク・最新化
        user.google_sub = sub
        user.email = email or user.email
        user.display_name = name or user.display_name
        user.avatar_url = picture or user.avatar_url
        user.auth_provider = "google"
        # 管理者フラグの昇格は ADMIN_EMAILS にあるときのみ(降格はしない)
        if email and email in current_app.config.get("ADMIN_EMAILS", set()):
            user.is_admin = True

    user.last_login_at = datetime.utcnow()
    db.session.commit()

    token = generate_token(user)
    return {"token": token, "user": user.to_dict()}
```

## 既存 `/api/login` の修正 (任意)

既存の ID 入力ログインも `last_login_at` を更新するようにしておくと、
管理ページでの「最終アクセス日時」表示に使えます。

```python
@bp.post("/login")
def login_legacy():
    body = request.get_json(silent=True) or {}
    user_id = (body.get("user_id") or "").strip()
    if not user_id:
        return {"error": "user_id required"}, 400

    user = User.query.filter_by(user_id=user_id).first()
    if user is None:
        user = User(
            user_id=user_id,
            auth_provider="legacy",
            is_admin=(user_id in ADMIN_USER_IDS),
        )
        db.session.add(user)

    user.last_login_at = datetime.utcnow()  # 追加
    db.session.commit()

    token = generate_token(user)
    return {"token": token, "user": user.to_dict()}
```

## セキュリティチェックリスト

- [ ] `GOOGLE_CLIENT_ID` を本番環境の環境変数に設定
- [ ] `GOOGLE_ALLOWED_HD` を教育機関ドメインに設定 (例: `uec.ac.jp`)
- [ ] `ADMIN_EMAILS` で管理者を制御(ID 文字列ではなくメールアドレスで指定)
- [ ] HTTPS のみで運用(JWT が漏れるとなりすまし可能)
- [ ] 本番では既存の `/api/login` を 緊急時専用 にする(できれば本番ではOFFに環境変数で切り替え)
