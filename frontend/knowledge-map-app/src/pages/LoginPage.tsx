/**
 * ログインページ (v3 完成版)
 *
 * 機能:
 * - Google ログイン (VITE_GOOGLE_CLIENT_ID 設定時に有効)
 * - ID ベースログイン (バックエンド側で ALLOW_LEGACY_LOGIN により制御)
 * - デモユーザーログイン (バックエンド側で ALLOW_DEMO_LOGIN により制御)
 *
 * バックエンドの /api/auth/config から各機能の有効状態を取得し、
 * 動的に UI を表示・非表示する.
 */
import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, Zap } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { login, isAuthenticated } from '@/services/authService';
import { apiGet } from '@/services/apiClient';

// ===== Google ログイン =====
const VITE_GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const VITE_GOOGLE_ALLOWED_HD = import.meta.env.VITE_GOOGLE_ALLOWED_HD as string | undefined;

// 動的インポート: @react-oauth/google 未インストールでも落ちないように
const LazyGoogleButton = lazy<React.ComponentType<any>>(async () => {
  try {
    const mod = await import('@react-oauth/google');
    return {
      default: ({ onSuccess, onError }: any) => (
        <mod.GoogleLogin
          onSuccess={onSuccess}
          onError={onError}
          hosted_domain={VITE_GOOGLE_ALLOWED_HD}
          theme="outline"
          size="large"
          text="signin_with"
          locale="ja"
        />
      ),
    };
  } catch {
    return { default: () => null };
  }
});

// ===== サーバ側機能フラグ =====
interface AuthConfig {
  google_login_enabled: boolean;
  demo_login_enabled: boolean;
  legacy_login_enabled: boolean;
  google_client_id: string | null;
}

const DEFAULT_CONFIG: AuthConfig = {
  google_login_enabled: false,
  demo_login_enabled: true,
  legacy_login_enabled: true,
  google_client_id: null,
};

const LoginPage: React.FC = () => {
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [authConfig, setAuthConfig] = useState<AuthConfig>(DEFAULT_CONFIG);
  const [configLoaded, setConfigLoaded] = useState(false);
  const navigate = useNavigate();

  // 既にログイン済みならコンセントへ
  useEffect(() => {
    if (isAuthenticated()) {
      navigate('/consent');
    }
  }, [navigate]);

  // サーバから機能フラグを取得
  useEffect(() => {
    apiGet<AuthConfig>('/auth/config')
      .then((cfg) => {
        setAuthConfig(cfg);
      })
      .catch((e) => {
        // 取得失敗時はデフォルト(全部有効)で動作
        console.warn('[LoginPage] auth config fetch failed:', e);
      })
      .finally(() => {
        setConfigLoaded(true);
      });
  }, []);

  const handleLogin = async (id: string) => {
    setLoading(true);
    setError('');
    try {
      await login(id);
      navigate('/consent');
    } catch (e: any) {
      // サーバから返されたメッセージを優先表示
      const msg = e?.body?.message || e?.message || 'ログインに失敗しました';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = () => {
    // デモユーザー ID は固定. サーバ側 DEMO_USER_IDS と一致させる
    handleLogin('demo_user');
  };

  // ===== Google ログイン =====
  const handleGoogleSuccess = async (cred: { credential?: string }) => {
    if (!cred.credential) {
      setError('Googleログインの応答が不正です');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { loginWithGoogle } = await import('@/services/googleAuthService');
      await loginWithGoogle(cred.credential);
      navigate('/consent');
    } catch (e: any) {
      const msg = e?.body?.detail || e?.body?.message || e?.message || 'Googleログインに失敗しました';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleError = () => {
    setError('Googleログインに失敗しました。再度お試しください。');
  };

  // ===== UI 表示制御 =====
  // VITE_GOOGLE_CLIENT_ID とサーバの両方で許可されている時のみ表示
  const showGoogle = configLoaded
    && authConfig.google_login_enabled
    && Boolean(VITE_GOOGLE_CLIENT_ID);

  const showLegacy = configLoaded && authConfig.legacy_login_enabled;
  const showDemo = configLoaded && authConfig.demo_login_enabled;

  // どれも有効でない異常状態
  const nothingAvailable = configLoaded && !showGoogle && !showLegacy && !showDemo;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 via-white to-accent-400/10">
      <div className="w-full max-w-sm animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary-700 text-white mb-4 shadow-lg">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <circle cx="4" cy="8" r="2" />
              <circle cx="20" cy="8" r="2" />
              <circle cx="4" cy="16" r="2" />
              <circle cx="20" cy="16" r="2" />
              <path d="M6 8h4M14 8h4M6 16h4M14 16h4M12 9V7M12 15v2" />
            </svg>
          </div>
          <h1 className="text-xl font-bold font-display text-surface-700">知識マップ</h1>
          <p className="text-sm text-surface-400 mt-1">振り返り支援システム</p>
        </div>

        {/* Login card */}
        <div className="bg-white rounded-2xl shadow-md border border-surface-200 p-6 space-y-4">

          {nothingAvailable && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-3">
              ログイン手段が設定されていません。管理者に連絡してください。
            </p>
          )}

          {/* ===== Google ログイン ===== */}
          {showGoogle && (
            <>
              <div className="flex justify-center">
                <Suspense fallback={
                  <div className="h-10 w-full bg-surface-100 rounded animate-pulse" />
                }>
                  <LazyGoogleButton
                    onSuccess={handleGoogleSuccess}
                    onError={handleGoogleError}
                  />
                </Suspense>
              </div>

              {(showLegacy || showDemo) && (
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-surface-200" />
                  </div>
                  <div className="relative flex justify-center text-[11px]">
                    <span className="bg-white px-2 text-surface-400">または</span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ===== ID 入力ログイン ===== */}
          {showLegacy && (
            <>
              <div>
                <label className="block text-xs font-medium text-surface-600 mb-1.5">
                  ユーザーID
                </label>
                <Input
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && userId.trim() && handleLogin(userId.trim())}
                  placeholder="IDを入力..."
                  autoFocus={!showGoogle}
                />
              </div>

              <Button
                onClick={() => handleLogin(userId.trim())}
                disabled={!userId.trim() || loading}
                className="w-full"
              >
                <LogIn size={15} />
                ログイン
              </Button>
            </>
          )}

          {error && (
            <p className="text-xs text-red-500">{error}</p>
          )}

          {/* ===== デモユーザーログイン ===== */}
          {showDemo && (
            <>
              {showLegacy && (
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-surface-200" />
                  </div>
                  <div className="relative flex justify-center text-[11px]">
                    <span className="bg-white px-2 text-surface-400">または</span>
                  </div>
                </div>
              )}

              <Button
                variant="secondary"
                onClick={handleDemoLogin}
                disabled={loading}
                className="w-full"
              >
                <Zap size={15} />
                デモユーザーで開始
              </Button>
            </>
          )}
        </div>

        <p className="text-[11px] text-surface-400 text-center mt-4">
          学習支援研究プロジェクト
        </p>
      </div>
    </div>
  );
};

export default LoginPage;