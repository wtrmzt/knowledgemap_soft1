/**
 * LoginPage.tsx（差し替え版・修正済み）
 *
 * 修正点:
 *   - authService の修正後シグネチャに合わせて呼び出しを調整
 *     （login は {token,user} を返す。handleAuthRedirect も同様）
 *   - Button の import 元は既存に合わせて調整可能（下記コメント参照）
 *
 * 既存の「IDログイン / デモユーザー」に加えて「Googleでログイン」を追加。
 * OAuthリダイレクトで戻ってきた場合は handleAuthRedirect() が
 * 自動でトークン交換し、Consent へ遷移させる。
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
// Button の import 元は既存プロジェクトに合わせる。
// 既存が「@/components/ui」のバレル経由ならこのまま。直接なら下記に変更:
//   import { Button } from "@/components/ui/Button";
import { Button } from "@/components/ui";
import {
  login,
  signInWithGoogle,
  handleAuthRedirect,
  isAuthenticated,
} from "@/services/authService";

const DEMO_USER_ID = "demo_user";

export default function LoginPage() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 初回マウント: OAuthリダイレクト帰りかどうかを確認し、帰りなら交換処理
  useEffect(() => {
    (async () => {
      try {
        if (isAuthenticated()) {
          navigate("/consent");
          return;
        }
        const result = await handleAuthRedirect();
        if (result) {
          navigate("/consent");
          return;
        }
      } catch (e) {
        console.error(e);
        setError("Googleログインの処理に失敗しました。もう一度お試しください。");
      } finally {
        setChecking(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGoogle = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle(); // ここで Google へリダイレクト（戻りは useEffect で処理）
    } catch (e) {
      console.error(e);
      setError("Googleログインを開始できませんでした。");
      setGoogleLoading(false);
    }
  };

  const handleIdLogin = async (id: string) => {
    setError(null);
    setLoading(true);
    try {
      await login(id);
      navigate("/consent");
    } catch (e) {
      console.error(e);
      setError("ログインに失敗しました。IDを確認してください。");
    } finally {
      setLoading(false);
    }
  };

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

        {/* --- 推奨: Googleログイン --- */}
        <button
          onClick={handleGoogle}
          disabled={googleLoading}
          className="mb-4 flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
        >
          <GoogleIcon />
          {googleLoading ? "リダイレクト中…" : "Googleでログイン"}
        </button>

        <div className="my-4 flex items-center gap-3 text-xs text-gray-400">
          <span className="h-px flex-1 bg-gray-200" />
          または
          <span className="h-px flex-1 bg-gray-200" />
        </div>

        {/* --- 既存: IDログイン（デモ・検証用） --- */}
        <div className="space-y-3">
          <input
            type="text"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="ユーザーID"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
          <Button
            variant="default"
            size="lg"
            disabled={loading || !userId.trim()}
            onClick={() => handleIdLogin(userId.trim())}
            className="w-full"
          >
            {loading ? "ログイン中…" : "IDでログイン"}
          </Button>
          <Button
            variant="ghost"
            size="lg"
            onClick={() => handleIdLogin(DEMO_USER_ID)}
            className="w-full"
          >
            デモユーザーで開始
          </Button>
        </div>
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