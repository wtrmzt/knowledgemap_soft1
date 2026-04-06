/**
 * 記述進捗バー + 現在執筆中のトピック + 記述済みタグ
 */
import React from 'react';
import { PenTool, Loader2, CheckCircle2 } from 'lucide-react';
import { cn } from '@/utils';

interface WritingProgressProps {
  totalNodes: number;
  describedCount: number;
  currentlyWriting: string | null;
  describedLabels: string[];
  detecting: boolean;
}

export const WritingProgress: React.FC<WritingProgressProps> = ({
  totalNodes, describedCount, currentlyWriting, describedLabels, detecting,
}) => {
  if (totalNodes === 0) return null;
  const allDone = describedCount >= totalNodes;

  return (
    <div className="px-4 py-2 border-b border-surface-100 bg-surface-50 space-y-1.5">
      {/* バー */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-surface-500">記述の進捗</span>
        <span className={cn('text-[11px] font-bold', allDone ? 'text-emerald-600' : 'text-primary-600')}>
          {describedCount} / {totalNodes}
          {allDone && ' — すべて記述完了!'}
        </span>
      </div>
      <div className="w-full h-1.5 bg-surface-200 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', allDone ? 'bg-emerald-500' : 'bg-primary-500')}
          style={{ width: `${(describedCount / totalNodes) * 100}%` }}
        />
      </div>

      {/* 現在執筆中 */}
      {currentlyWriting && (
        <div className="flex items-center gap-1.5 text-[11px] text-amber-600">
          <PenTool size={11} />
          <span>いま「<strong>{currentlyWriting}</strong>」について記述中</span>
          {detecting && <Loader2 size={10} className="animate-spin ml-1" />}
        </div>
      )}

      {/* 記述済みタグ */}
      {describedLabels.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {describedLabels.map((l, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] text-emerald-700">
              <CheckCircle2 size={9} />{l}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
