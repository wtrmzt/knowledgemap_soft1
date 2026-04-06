/**
 * 次に書くとよい内容の提案カード
 * クリックで接続詞+ヒントをテキストに挿入
 */
import React from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { cn } from '@/utils';
import type { WritingSuggestion } from '@/types';

interface WritingSuggestionsProps {
  suggestions: WritingSuggestion[];
  allDescribed: boolean;
  onSuggestionClick: (s: WritingSuggestion) => void;
}

export const WritingSuggestions: React.FC<WritingSuggestionsProps> = ({
  suggestions, allDescribed, onSuggestionClick,
}) => {
  return (
    <div className="space-y-3">
      {/* 提案カード */}
      {suggestions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-primary-600 flex items-center gap-1">
            <ArrowRight size={11} />
            次に書くとよい内容
          </p>
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => onSuggestionClick(s)}
              className={cn(
                'w-full text-left p-2.5 rounded-lg border transition-all duration-200',
                'bg-primary-50 border-primary-100 hover:bg-primary-100 hover:border-primary-200',
                'group cursor-pointer',
              )}
            >
              <span className="text-xs font-bold text-primary-700">{s.connector}</span>
              <span className="text-xs font-semibold text-primary-600 ml-1">
                「{s.node_label}」
              </span>
              <p className="text-[11px] text-primary-500 mt-0.5 leading-relaxed">
                {s.prompt_hint}
              </p>
              <span className="text-[10px] text-primary-400 mt-1 block group-hover:text-primary-600">
                クリックして挿入 →
              </span>
            </button>
          ))}
        </div>
      )}

      {/* 全ノード記述完了 */}
      {allDescribed && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-lg border border-emerald-200 text-xs text-emerald-700">
          <CheckCircle2 size={16} />
          <div>
            <p className="font-semibold">すべてのノードについて記述できました!</p>
            <p className="text-[11px] text-emerald-600 mt-0.5">
              さらに深掘りしたい場合はノードを追加してみてください。
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
