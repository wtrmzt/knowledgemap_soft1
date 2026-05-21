/**
 * マップ閲覧画面の上部ツールバー (v3.2).
 *
 * 変更点: 「新しいマップ」ボタンが /dashboard?new=1 に遷移し、
 *         DashboardPage 側で空メモが自動作成されるようにする.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Plus } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import type { AppMode } from '@/types';

interface MapsToolbarProps {
  query: string;
  mode: AppMode | 'all';
  onQueryChange: (q: string) => void;
  onModeChange: (m: AppMode | 'all') => void;
}

const MODE_OPTIONS: Array<{ value: AppMode | 'all'; label: string }> = [
  { value: 'all', label: 'すべて' },
  { value: 'reflection', label: '振り返り' },
  { value: 'research', label: '調べ物' },
  { value: 'idea', label: 'アイデア' },
];

const MapsToolbar: React.FC<MapsToolbarProps> = ({
  query,
  mode,
  onQueryChange,
  onModeChange,
}) => {
  const [localQuery, setLocalQuery] = useState(query);

  useEffect(() => {
    setLocalQuery(query);
  }, [query]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (localQuery !== query) onQueryChange(localQuery);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localQuery]);

  return (
    <div className="flex flex-col gap-3 border-b border-surface-200 bg-white px-6 py-4 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-center">
        {/* 検索 */}
        <div className="relative md:w-80">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none" />
          <Input
            type="search"
            placeholder="タイトル・本文を検索..."
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            aria-label="検索"
            className="pl-9"
          />
        </div>

        {/* モードフィルタ */}
        <div role="tablist" aria-label="モード" className="flex gap-1 rounded-lg bg-surface-100 p-1">
          {MODE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              role="tab"
              aria-selected={mode === opt.value}
              onClick={() => onModeChange(opt.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                mode === opt.value
                  ? 'bg-white text-surface-900 shadow-sm'
                  : 'text-surface-500 hover:text-surface-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ★ 新しいマップ → /dashboard?new=1 に変更 */}
      <Link to="/dashboard?new=1">
        <Button variant="primary">
          <Plus size={14} />
          新しいマップ
        </Button>
      </Link>
    </div>
  );
};

export { MapsToolbar };
export default MapsToolbar;