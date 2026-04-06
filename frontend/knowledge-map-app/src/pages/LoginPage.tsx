/**
 * ログインページ
 * IDベースログイン + デモユーザー自動ログイン
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, Zap } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { login, isAuthenticated } from '@/services/authService';
import { loggingService } from '@/services';

const LoginPage: React.FC = () => {
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  // 既にログイン済みならダッシュボードへ
  useEffect(() => {
    if (isAuthenticated()) {
      navigate('/consent');
    }
  }, [navigate]);

  const handleLogin = async (id: string) => {
    setLoading(true);
    setError('');
    try {
      await login(id);
      navigate('/consent');
    } catch (e: any) {
      setError(e.message || 'ログインに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = () => handleLogin('demo_user');

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
          <h1 className="text-xl font-bold font-display text-surface-700">
            知識マップ
          </h1>
          <p className="text-sm text-surface-400 mt-1">振り返り支援システム</p>
        </div>

        {/* Login card */}
        <div className="bg-white rounded-2xl shadow-md border border-surface-200 p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-surface-600 mb-1.5">
              ユーザーID
            </label>
            <Input
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && userId.trim() && handleLogin(userId.trim())}
              placeholder="IDを入力..."
              autoFocus
            />
          </div>

          {error && (
            <p className="text-xs text-red-500">{error}</p>
          )}

          <Button
            onClick={() => handleLogin(userId.trim())}
            loading={loading}
            disabled={!userId.trim()}
            className="w-full"
          >
            <LogIn size={15} />
            ログイン
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-surface-200" />
            </div>
            <div className="relative flex justify-center text-[11px]">
              <span className="bg-white px-2 text-surface-400">または</span>
            </div>
          </div>

          <Button
            variant="secondary"
            onClick={handleDemoLogin}
            loading={loading}
            className="w-full"
          >
            <Zap size={15} />
            デモユーザーで開始
          </Button>
        </div>

        <p className="text-[11px] text-surface-400 text-center mt-4">
          学習支援研究プロジェクト
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
