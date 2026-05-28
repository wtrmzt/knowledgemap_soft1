/**
 * Google OAuth コールバックページ (v3.1).
 *
 * Supabase Auth の Google OAuth リダイレクト後にこのページに到達する.
 * authService.exchangeSupabaseSession() でセッションを自前JWTに交換する.
 *
 * ※ 通常フローでは signInWithGoogle() の redirectTo が /login のため
 *    LoginPage.tsx の useEffect → handleAuthRedirect() が処理する。
 *    本ページは redirectTo を /auth/callback に変更した場合や、
 *    直接アクセスされた場合のフォールバックとして機能する。
 *
 * 成功 → /consent（未同意）or /dashboard（同意済み）へ遷移
 * 失敗 → /login へ戻す
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { exchangeSupabaseSession, isAuthenticated } from '@/services/authService';

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        // 既にログイン済みならそのまま遷移
        if (isAuthenticated()) {
          navigate('/consent', { replace: true });
          return;
        }

        const result = await exchangeSupabaseSession();
        if (!mounted) return;

        if (!result) {
          // セッションがない = 直接アクセス → ログインへ
          navigate('/login', { replace: true });
          return;
        }

        // 同意済みかどうかで遷移先を分岐（LoginPage と同じ判定）
        if (result.user.consented) {
          navigate('/dashboard', { replace: true });
        } else {
          navigate('/consent', { replace: true });
        }
      } catch (err) {
        if (!mounted) return;
        console.error('[AuthCallback] 認証エラー:', err);
        setError(err instanceof Error ? err.message : '認証に失敗しました');
        setTimeout(() => {
          if (mounted) navigate('/login', { replace: true });
        }, 3000);
      }
    })();

    return () => { mounted = false; };
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface">
      <div className="text-center">
        {error ? (
          <>
            <p className="text-lg font-medium text-red-600">{error}</p>
            <p className="mt-2 text-sm text-gray-500">
              ログイン画面に戻ります…
            </p>
          </>
        ) : (
          <>
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary-400 border-t-transparent" />
            <p className="mt-4 text-sm text-gray-500">認証中…</p>
          </>
        )}
      </div>
    </div>
  );
}