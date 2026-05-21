/**
 * マップ閲覧画面 /maps (v3 新規).
 *
 * - グリッド表示 + サムネイル
 * - 検索 + モードフィルタ
 * - 「もっと見る」ページネーション
 *
 * 既存ダッシュボードとの統合:
 *   - カード → /dashboard?memo_id=<id> へ遷移
 *   - DashboardPage 側で ?memo_id= を読み取り、既存マップを開く
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, LogOut } from 'lucide-react';

import MapCard from '@/components/MapCard';
import MapsToolbar from '@/components/MapsToolbar';
import { Button } from '@/components/ui';
import {
  listMemosPaginated,
  type MapSummary,
} from '@/services/memoService';
import { isAuthenticated, logout, getCurrentUserId } from '@/services/authService';
import type { AppMode } from '@/types';

const PER_PAGE = 20;

const MapsListPage: React.FC = () => {
  const navigate = useNavigate();

  const [memos, setMemos] = useState<MapSummary[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<AppMode | 'all'>('all');

  // 認証チェック
  useEffect(() => {
    if (!isAuthenticated()) {
      navigate('/login');
      return;
    }
    // 同意未取得ならコンセントへ
    // (任意の挙動 — ここではシンプルに認証チェックのみ)
  }, [navigate]);

  const fetchPage = useCallback(
    async (targetPage: number, replace: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const res = await listMemosPaginated({
          page: targetPage,
          per_page: PER_PAGE,
          mode: mode === 'all' ? undefined : mode,
          q: query || undefined,
        });
        setMemos((prev) => (replace ? res.items : [...prev, ...res.items]));
        setHasNext(res.has_next);
        setTotal(res.total);
        setPage(targetPage);
      } catch (e: any) {
        const msg = e?.message || '読み込みに失敗しました';
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [query, mode],
  );

  // 検索・モードが変わったら 1 ページ目から
  useEffect(() => {
    void fetchPage(1, true);
  }, [fetchPage]);

  const isEmpty = !loading && memos.length === 0;

  const headline = useMemo(() => {
    if (loading && memos.length === 0) return '読み込み中...';
    if (total === 0) return 'まだマップがありません';
    return `${total} 件のマップ`;
  }, [loading, memos.length, total]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-surface-50">
      {/* ヘッダー */}
      <header className="bg-white border-b border-surface-200">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
              <ArrowLeft size={14} />
              ダッシュボード
            </Button>
            <div className="border-l border-surface-200 pl-3">
              <h1 className="text-base font-bold font-display text-surface-700">マップ一覧</h1>
              <p className="text-[11px] text-surface-400">{headline}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-surface-400">{getCurrentUserId()}</span>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut size={14} />
            </Button>
          </div>
        </div>
      </header>

      {/* ツールバー */}
      <MapsToolbar
        query={query}
        mode={mode}
        onQueryChange={setQuery}
        onModeChange={setMode}
      />

      {/* メイン */}
      <main className="mx-auto max-w-7xl px-6 py-6">
        {error && (
          <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {isEmpty && (
          <div className="rounded-2xl border border-dashed border-surface-300 bg-white p-12 text-center">
            <p className="text-sm text-surface-500">
              {query || mode !== 'all'
                ? '条件に一致するマップが見つかりません。'
                : '「新しいマップ」から最初の振り返りを始めましょう。'}
            </p>
          </div>
        )}

        {memos.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {memos.map((m) => (
              <MapCard key={m.id} memo={m} />
            ))}
          </div>
        )}

        {hasNext && (
          <div className="mt-8 flex justify-center">
            <Button
              variant="secondary"
              disabled={loading}
              onClick={() => void fetchPage(page + 1, false)}
            >
              もっと見る
            </Button>
          </div>
        )}
      </main>
    </div>
  );
};

export default MapsListPage;