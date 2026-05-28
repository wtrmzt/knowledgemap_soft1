"""
Supabase アクセストークン検証モジュール（新規）

フロントエンドが Supabase Auth（Googleプロバイダ）でログインして取得した
アクセストークン(JWT)を、バックエンドで検証してユーザー情報を取り出す。

検証方式は2系統に対応:
  1. JWKS 検証（新しい非対称署名鍵 RS256/ES256。推奨）
     SUPABASE_PROJECT_URL の /auth/v1/.well-known/jwks.json から公開鍵を取得。
  2. 共有シークレット検証（レガシー HS256）
     ダッシュボードの "JWT Secret" を SUPABASE_JWT_SECRET に設定。

どちらか設定されている方を使う。両方あれば JWKS を優先し、失敗時に HS256 へフォールバック。

※ ここで検証するのは "Supabase が発行したトークン"。
   検証に成功したら routes/auth.py 側で「自前アプリJWT」を発行し直す（トークン交換方式）。
   それ以降の各APIは従来どおり auth.py の @token_required（自前JWT）で守られる。
"""
import jwt
from jwt import PyJWKClient
from config import Config

# Supabase の access_token は aud="authenticated" を持つ
SUPABASE_AUDIENCE = "authenticated"

# JWKS クライアントはキャッシュが効くので使い回す
_jwks_client = None


def _get_jwks_client():
    global _jwks_client
    if _jwks_client is None and Config.SUPABASE_PROJECT_URL:
        jwks_url = f"{Config.SUPABASE_PROJECT_URL.rstrip('/')}/auth/v1/.well-known/jwks.json"
        _jwks_client = PyJWKClient(jwks_url)
    return _jwks_client


class SupabaseTokenError(Exception):
    """Supabase トークン検証に失敗したときに送出"""
    pass


def verify_supabase_token(token: str) -> dict:
    """
    Supabase アクセストークンを検証してクレーム(dict)を返す。
    失敗時は SupabaseTokenError を送出。

    返り値の主なクレーム:
      - sub:   Supabase ユーザーUUID（恒久的な一意ID）
      - email: メールアドレス（Googleアカウントのメール）
      - user_metadata: { full_name, avatar_url, ... }
    """
    if not token:
        raise SupabaseTokenError("トークンが空です")

    # --- 1) JWKS（非対称鍵）での検証を試行 ---
    client = _get_jwks_client()
    if client is not None:
        try:
            signing_key = client.get_signing_key_from_jwt(token)
            return jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256", "ES256"],
                audience=SUPABASE_AUDIENCE,
                options={"verify_exp": True},
            )
        except Exception as e:
            # HS256 へフォールバックする（プロジェクトがレガシー鍵運用の場合）
            jwks_error = e
    else:
        jwks_error = None

    # --- 2) 共有シークレット HS256 での検証 ---
    if Config.SUPABASE_JWT_SECRET:
        try:
            return jwt.decode(
                token,
                Config.SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                audience=SUPABASE_AUDIENCE,
                options={"verify_exp": True},
            )
        except jwt.ExpiredSignatureError:
            raise SupabaseTokenError("トークンの有効期限が切れています")
        except jwt.InvalidTokenError as e:
            raise SupabaseTokenError(f"トークンが無効です: {e}")

    # ここに来たら検証手段が無い or JWKS失敗かつシークレット未設定
    if jwks_error is not None:
        raise SupabaseTokenError(f"トークン検証に失敗しました: {jwks_error}")
    raise SupabaseTokenError(
        "Supabase 検証設定がありません。SUPABASE_PROJECT_URL または SUPABASE_JWT_SECRET を設定してください"
    )


def extract_identity(claims: dict) -> dict:
    """
    検証済みクレームから、アプリで使う最小限の本人情報を抽出する。
    email を主キー的に利用し、無い場合は sub(UUID) で代替する。
    """
    sub = claims.get("sub")
    email = claims.get("email")
    metadata = claims.get("user_metadata", {}) or {}
    name = metadata.get("full_name") or metadata.get("name")

    # アプリ内ユーザーIDの決定（既存 User.user_id 列にそのまま入れる）
    # Google ログインユーザーは email を user_id として扱う。
    app_user_id = email or f"sb_{sub}"

    return {
        "supabase_uid": sub,
        "email": email,
        "name": name,
        "app_user_id": app_user_id,
    }
