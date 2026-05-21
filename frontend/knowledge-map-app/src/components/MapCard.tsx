/**
 * マップ閲覧画面のカードコンポーネント (v3).
 *
 * サムネイル + タイトル + メタ情報. クリックでダッシュボードへ遷移.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { Layers, ArrowRight } from 'lucide-react';
import type { MapSummary } from '@/services/memoService';
import type { AppMode } from '@/types';

interface MapCardProps {
  memo: MapSummary;
}

const MODE_LABEL: Record<AppMode, string> = {
  reflection: '振り返り',
  research: '調べ物',
  idea: 'アイデア',
};

const MODE_CLASS: Record<AppMode, string> = {
  reflection: 'bg-primary-50 text-primary-700',
  research: 'bg-emerald-50 text-emerald-700',
  idea: 'bg-amber-50 text-amber-700',
};

const MapCard: React.FC<MapCardProps> = ({ memo }) => {
  return (
    <Link
      to={`/dashboard?memo_id=${memo.id}`}
      className="group block overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-sm transition hover:shadow-md hover:border-primary-300"
    >
      {/* サムネイル */}
      <div className="aspect-[4/3] w-full overflow-hidden bg-surface-50 border-b border-surface-100">
        {memo.thumbnail_url ? (
          <img
            src={memo.thumbnail_url}
            alt=""
            className="h-full w-full object-contain transition group-hover:scale-[1.02]"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-surface-300">
            <Layers size={48} strokeWidth={1.2} />
          </div>
        )}
      </div>

      {/* メタ情報 */}
      <div className="space-y-2 px-4 py-3">
        <div className="flex items-center justify-between">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${MODE_CLASS[memo.mode]}`}>
            {MODE_LABEL[memo.mode]}
          </span>
          <span className="text-[10px] text-surface-400">
            {formatDate(memo.updated_at || memo.created_at)}
          </span>
        </div>

        <h3 className="line-clamp-2 text-sm font-semibold text-surface-700">
          {memo.title || 'Untitled'}
        </h3>

        <p className="line-clamp-2 text-[11px] leading-relaxed text-surface-500">
          {memo.preview}
        </p>

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-3 text-[10px] text-surface-400">
            <span>ノード {memo.node_count}</span>
            <span>エッジ {memo.edge_count}</span>
          </div>
          <ArrowRight size={14} className="text-surface-300 transition group-hover:translate-x-0.5 group-hover:text-primary-500" />
        </div>
      </div>
    </Link>
  );
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays < 1) {
    const diffHours = Math.floor(diffMs / 3600000);
    if (diffHours < 1) {
      const diffMin = Math.floor(diffMs / 60000);
      return diffMin <= 1 ? 'たった今' : `${diffMin}分前`;
    }
    return `${diffHours}時間前`;
  }
  if (diffDays < 7) return `${diffDays}日前`;
  return d.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

// ★ default export と named export の両方を提供して、
//   どちらの import 形式でも動くようにする
export { MapCard };
export default MapCard;