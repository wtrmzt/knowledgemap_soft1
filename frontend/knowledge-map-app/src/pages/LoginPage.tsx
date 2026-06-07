/**
 * LoginPage.tsx（ID + パスワードログイン版）
 *
 * - 主方式: ユーザーID + パスワード
 * - Google / デモ ボタンは /api/auth/config の結果に応じて出し分け
 *   （既定では Google・デモともに非表示）
 * - Enter キーでログイン送信に対応
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui";
import {
  login,
  signInWithGoogle,
  handleAuthRedirect,
  isAuthenticated,
  isAdmin,
  getAuthConfig,
  type AuthConfig,
} from "@/services/authService";

/** ログイン後の遷移先: 管理者は管理者ダッシュボード、一般は同意画面へ */
function postLoginPath(): string {
  return isAdmin() ? "/admin" : "/consent";
}

const DEMO_USER_ID = "demo_user";

export default function LoginPage() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);

  useEffect(() => {
    (async () => {
      try {
        if (isAuthenticated()) {
          navigate(postLoginPath());
          return;
        }

        // ログイン方式を取得（失敗してもパスワードログインは表示する）
        let cfg: AuthConfig | null = null;
        try {
          cfg = await getAuthConfig();
          setAuthConfig(cfg);
        } catch {
          setAuthConfig({
            password_login_enabled: true,
            demo_login_enabled: false,
            legacy_login_enabled: false,
            google_login_enabled: false,
          });
        }

        // Google が有効な場合のみ OAuth リダイレクト帰りを処理
        if (cfg?.google_login_enabled) {
          const result = await handleAuthRedirect();
          if (result) {
            navigate(postLoginPath());
            return;
          }
        }
      } catch (e) {
        console.error(e);
        setError("ログイン処理の初期化に失敗しました。再読み込みしてください。");
      } finally {
        setChecking(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePasswordLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      await login(userId.trim(), password);
      navigate(postLoginPath());
    } catch (e) {
      console.error(e);
      setError("ユーザーIDまたはパスワードが正しくありません。");
    } finally {
      setLoading(false);
    }
  };

  const handleDemo = async () => {
    setError(null);
    setLoading(true);
    try {
      await login(DEMO_USER_ID);
      navigate(postLoginPath());
    } catch (e) {
      console.error(e);
      setError("デモログインに失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (e) {
      console.error(e);
      setError("Googleログインを開始できませんでした。");
      setGoogleLoading(false);
    }
  };

  const canSubmit = userId.trim().length > 0 && password.length > 0 && !loading;

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <p className="text-gray-500">読み込み中…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg">
        <h1 className="mb-1 text-center text-2xl font-bold text-primary">
          振り返り支援システム
        </h1>
        <p className="mb-6 text-center text-sm text-gray-500">
          知識マップを使って学びを深めましょう
        </p>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* --- 主方式: ID + パスワード --- */}
        <div className="space-y-3">
          <input
            type="text"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="ユーザーID"
            autoComplete="username"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSubmit) handlePasswordLogin();
            }}
            placeholder="パスワード"
            autoComplete="current-password"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
          <Button
            variant="default"
            size="lg"
            disabled={!canSubmit}
            onClick={handlePasswordLogin}
            className="w-full"
          >
            {loading ? "ログイン中…" : "ログイン"}
          </Button>
        </div>

        {/* --- 任意: Google ログイン（config で有効化時のみ）--- */}
        {authConfig?.google_login_enabled && (
          <>
            <div className="my-4 flex items-center gap-3 text-xs text-gray-400">
              <span className="h-px flex-1 bg-gray-200" />
              または
              <span className="h-px flex-1 bg-gray-200" />
            </div>
            <button
              onClick={handleGoogle}
              disabled={googleLoading}
              className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
            >
              <GoogleIcon />
              {googleLoading ? "リダイレクト中…" : "Googleでログイン"}
            </button>
          </>
        )}

        {/* --- 任意: デモログイン（config で有効化時のみ）--- */}
        {authConfig?.demo_login_enabled && (
          <Button
            variant="ghost"
            size="lg"
            onClick={handleDemo}
            className="mt-3 w-full"
          >
            デモユーザーで開始
          </Button>
        )}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}