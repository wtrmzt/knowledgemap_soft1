"""Google ID Token 検証.

フロントエンドから受け取った credential (ID Token) を検証し、
Google アカウントの sub / email / name 等を返す.

事前に環境変数 GOOGLE_CLIENT_ID を設定すること.
GOOGLE_ALLOWED_HD で教育機関ドメイン制限も可能.

Google ログインを使わない環境では、本モジュールは import されない.
"""

from __future__ import annotations

from typing import Optional, TypedDict

from flask import current_app


class GoogleUserPayload(TypedDict):
    sub: str
    email: Optional[str]
    email_verified: bool
    name: Optional[str]
    picture: Optional[str]
    hd: Optional[str]


class GoogleAuthError(ValueError):
    """Google 認証関連エラー."""


def is_google_login_enabled() -> bool:
    """環境変数で Google ログインが有効化されているか."""
    return bool(current_app.config.get("GOOGLE_CLIENT_ID"))


def verify_google_id_token(credential: str) -> GoogleUserPayload:
    """Google ID Token を検証し payload を返す.

    Raises:
        GoogleAuthError: GOOGLE_CLIENT_ID 未設定 / Token 不正 / ドメイン制限違反
    """
    client_id = current_app.config.get("GOOGLE_CLIENT_ID")
    if not client_id:
        raise GoogleAuthError("GOOGLE_CLIENT_ID is not configured")

    # 遅延 import: google-auth が未インストールでも、
    # Google ログインを使わない環境では起動できるようにする
    try:
        from google.oauth2 import id_token
        from google.auth.transport import requests as google_requests
    except ImportError as e:
        raise GoogleAuthError(
            f"google-auth library not installed: {e}. "
            "run: pip install google-auth"
        ) from e

    try:
        payload = id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            audience=client_id,
            clock_skew_in_seconds=10,
        )
    except ValueError as e:
        raise GoogleAuthError(f"invalid id_token: {e}") from e

    if not payload.get("email_verified", False):
        raise GoogleAuthError("email not verified by Google")

    # ドメイン制限(Google Workspace 想定. 個人アカウントには hd が無い)
    allowed_hd = current_app.config.get("GOOGLE_ALLOWED_HD")
    if allowed_hd:
        hd = payload.get("hd")
        if hd != allowed_hd:
            raise GoogleAuthError(
                f"domain not allowed (got hd={hd!r}, expected {allowed_hd!r})"
            )

    return GoogleUserPayload(  # type: ignore[typeddict-item]
        sub=payload["sub"],
        email=payload.get("email"),
        email_verified=payload.get("email_verified", False),
        name=payload.get("name"),
        picture=payload.get("picture"),
        hd=payload.get("hd"),
    )