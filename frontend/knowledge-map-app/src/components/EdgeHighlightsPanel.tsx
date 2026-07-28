/**
 * EdgeHighlightsPanel.tsx（機能2・新仕様 + FB対応）
 *
 * 画面下部のポップアップ。2つのタブを持つ:
 *   1) 注目のつながり : AIが選んだ上位エッジ。まず「つながり＋関係語」を省略表示し、
 *                       「説明を見る」で説明文を展開（FB1）。行をクリックすると
 *                       該当ノード・エッジがマップ上で光る（FB2）。
 *   2) 2つを選んで説明 : ノードを2つ選ぶと、その関係の説明文を生成（FB3）。
 *
 * - 介入度 Lv2: 関係語のみ / Lv3: 説明文まで
 * - 折りたたみ（最小化）可能
 */
import React, { useState } from 'react';
import {
  Link2, ChevronDown, ChevronUp, Loader2, ArrowRight, Sparkles,
} from 'lucide-react';
import { cn } from '@/utils';
import { getEdgeExplanation } from '@/services/mapService';
import type { EdgeHighlight } from '@/services/mapService';

interface Props {
  highlights: EdgeHighlight[];
  /** 介入度 (2: 単語のみ / 3: 説明文) */
  level: number;
  loading?: boolean;
  /** 手動生成タブ用: 選択できるノードのラベル一覧 */
  nodeLabels?: string[];
  /** 現在のメモID（手動生成の記録用） */
  memoId?: number | null;
}

/** 該当ノード・エッジをマップ上で光らせる */
function focusOnMap(source: string, target: string) {
  document.dispatchEvent(
    new CustomEvent('edge-highlight-focus', { detail: { source, target } }),
  );
}

const HighlightCard: React.FC<{ h: EdgeHighlight; level: number }> = ({ h, level }) => {
  const [open, setOpen] = useState(false);
  const hasSentence = level >= 3 && !!h.sentence;

  return (
    <div className="rounded-xl border border-surface-200 bg-surface-50/70 overflow-hidden">
      {/* 概念ペア（クリックで該当箇所を発光） */}
      <button
        onClick={() => focusOnMap(h.source_label, h.target_label)}
        className="w-full flex items-center flex-wrap gap-1.5 px-3 py-2.5 text-left hover:bg-primary-50/70 transition-colors"
        title="クリックでマップ上の該当箇所を強調"
      >
        <span className="text-[11px] font-semibold text-surface-700">{h.source_label}</span>
        <ArrowRight size={11} className="text-surface-400 shrink-0" />
        <span className="text-[11px] font-semibold text-surface-700">{h.target_label}</span>
        {h.word && (
          <span className="ml-1 px-1.5 py-0.5 rounded border border-violet-200 bg-violet-50 text-[10px] font-semibold text-violet-700">
            {h.word}
          </span>
        )}
        {hasSentence && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
            className="ml-auto flex items-center gap-0.5 text-[10px] font-medium text-primary-600 hover:text-primary-700"
          >
            {open ? '閉じる' : '説明を見る'}
            {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </span>
        )}
      </button>

      {/* 説明文（展開時のみ・Lv3） */}
      {hasSentence && open && (
        <p className="px-3 pb-2.5 -mt-0.5 text-[11px] leading-relaxed text-surface-600">
          {h.sentence}
        </p>
      )}
    </div>
  );
};

const ManualTab: React.FC<{ nodeLabels: string[]; memoId?: number | null }> = ({ nodeLabels, memoId }) => {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ word: string; sentence: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canRun = !!a && !!b && a !== b && !loading;

  const run = async () => {
    if (!canRun) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await getEdgeExplanation(a, b, memoId);
      if (r?.disabled) setError('この機能は現在オフです');
      else setResult({ word: r?.word || '', sentence: r?.sentence || '' });
      focusOnMap(a, b);
    } catch {
      setError('説明を生成できませんでした');
    } finally {
      setLoading(false);
    }
  };

  const selectCls =
    'flex-1 min-w-0 text-[11px] rounded-lg border border-surface-300 px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-primary-400';

  return (
    <div className="space-y-2.5">
      <p className="text-[10px] text-surface-400">
        2つの概念を選ぶと、そのつながりの説明を生成します。
      </p>
      <div className="flex items-center gap-2">
        <select value={a} onChange={(e) => setA(e.target.value)} className={selectCls}>
          <option value="">概念を選択…</option>
          {nodeLabels.map((l) => <option key={`a-${l}`} value={l}>{l}</option>)}
        </select>
        <ArrowRight size={13} className="text-surface-400 shrink-0" />
        <select value={b} onChange={(e) => setB(e.target.value)} className={selectCls}>
          <option value="">概念を選択…</option>
          {nodeLabels.map((l) => <option key={`b-${l}`} value={l}>{l}</option>)}
        </select>
        <button
          onClick={run}
          disabled={!canRun}
          className={cn(
            'shrink-0 flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors',
            canRun
              ? 'bg-primary-500 text-white hover:bg-primary-600'
              : 'bg-surface-200 text-surface-400 cursor-not-allowed',
          )}
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          生成
        </button>
      </div>

      {a && b && a === b && (
        <p className="text-[10px] text-amber-600">異なる2つの概念を選んでください。</p>
      )}
      {error && <p className="text-[11px] text-red-500">{error}</p>}
      {result && (
        <div className="rounded-xl border border-surface-200 bg-surface-50/70 px-3 py-2.5">
          <div className="flex items-center flex-wrap gap-1.5">
            <span className="text-[11px] font-semibold text-surface-700">{a}</span>
            <ArrowRight size={11} className="text-surface-400" />
            <span className="text-[11px] font-semibold text-surface-700">{b}</span>
            {result.word && (
              <span className="ml-1 px-1.5 py-0.5 rounded border border-violet-200 bg-violet-50 text-[10px] font-semibold text-violet-700">
                {result.word}
              </span>
            )}
          </div>
          {result.sentence && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-surface-600">{result.sentence}</p>
          )}
        </div>
      )}
    </div>
  );
};

export const EdgeHighlightsPanel: React.FC<Props> = ({
  highlights, level, loading = false, nodeLabels = [], memoId = null,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState<'top' | 'manual'>('top');

  if (level <= 1) return null;

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-[min(760px,calc(100%-2rem))] animate-fade-in">
      <div className="rounded-2xl border border-primary-200 bg-white/95 backdrop-blur shadow-lg overflow-hidden">
        {/* ヘッダー（クリックで折りたたみ） */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="w-full flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-primary-50/60 transition-colors"
          aria-expanded={!collapsed}
        >
          <span className="flex items-center gap-2">
            <Link2 size={14} className="text-primary-500" />
            <span className="text-[12px] font-bold text-surface-700">つながりの説明</span>
            {tab === 'top' && highlights.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-primary-100 text-primary-700 text-[10px] font-bold">
                {highlights.length}
              </span>
            )}
            {loading && tab === 'top' && (
              <Loader2 size={11} className="animate-spin text-primary-400" />
            )}
          </span>
          <span className="flex items-center gap-1 text-[10px] text-surface-400">
            {collapsed ? '開く' : '閉じる'}
            {collapsed ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </span>
        </button>

        {!collapsed && (
          <>
            {/* タブ */}
            <div className="flex gap-1 px-3">
              {([['top', '注目のつながり'], ['manual', '2つを選んで説明']] as const).map(
                ([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setTab(key)}
                    className={cn(
                      'px-3 py-1.5 text-[11px] font-semibold rounded-t-lg transition-colors',
                      tab === key
                        ? 'text-primary-700 border-b-2 border-primary-500'
                        : 'text-surface-400 hover:text-surface-600',
                    )}
                  >
                    {label}
                  </button>
                ),
              )}
            </div>

            {/* 本体 */}
            <div className="px-3 pb-3 pt-2 max-h-[34vh] overflow-y-auto">
              {tab === 'top' ? (
                loading && highlights.length === 0 ? (
                  <p className="px-1 py-3 text-[11px] text-surface-400">
                    つながりを分析しています…
                  </p>
                ) : highlights.length === 0 ? (
                  <p className="px-1 py-3 text-[11px] text-surface-400">
                    提示できるつながりがありません。
                  </p>
                ) : (
                  <div className="space-y-2">
                    {highlights.map((h, i) => (
                      <HighlightCard key={`${h.source_label}-${h.target_label}-${i}`} h={h} level={level} />
                    ))}
                  </div>
                )
              ) : (
                <ManualTab nodeLabels={nodeLabels} memoId={memoId} />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default EdgeHighlightsPanel;