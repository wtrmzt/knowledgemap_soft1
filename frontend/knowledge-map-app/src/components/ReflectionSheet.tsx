/**
 * 振り返りシート
 *
 * 修正: デバウンスを useDashboard 側に一本化。
 * ReflectionSheet はテキスト変更のたびに onRequestTopicDetection を呼ぶだけ。
 */
import React, { useState, useCallback, useRef } from 'react';
import { Sparkles, Plus, Loader2 } from 'lucide-react';
import { Button, Textarea } from '@/components/ui';
import { WritingProgress } from './WritingProgress';
import { WritingSuggestions } from './WritingSuggestions';
import { cn } from '@/utils';
import type { AppMode, ReflectionPhase, WritingSuggestion, MapNode } from '@/types';

interface Props {
  phase: ReflectionPhase;
  mode: AppMode;
  memoContent: string;
  onMemoChange: (v: string) => void;
  onGenerateMap: (v: string) => void;
  onAddNodeRequest: (kw: string) => void;
  /** テキスト変更時に呼ぶ（デバウンスは useDashboard 側で管理） */
  onRequestTopicDetection: (text: string) => void;
  loading: boolean;
  nodes: MapNode[];
  realNodeCount: number;
  describedLabels: string[];
  currentlyWriting: string | null;
  nextSuggestions: WritingSuggestion[];
  detectingTopics: boolean;
}

const LABELS: Record<AppMode, string> = {
  reflection: '学習の振り返り', research: '調べ物メモ', idea: 'アイデアメモ',
};
const PH: Record<AppMode, string> = {
  reflection: '今日学んだことを振り返って書いてみましょう...',
  research: '調べたいことを書いてみましょう...',
  idea: 'アイデアを自由に書き出してみましょう...',
};

export const ReflectionSheet: React.FC<Props> = (props) => {
  const {
    phase, mode, memoContent, onMemoChange, onGenerateMap,
    onAddNodeRequest, onRequestTopicDetection, loading, nodes,
    realNodeCount, describedLabels, currentlyWriting, nextSuggestions, detectingTopics,
  } = props;

  const [nodeKw, setNodeKw] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);

  const totalNodes = realNodeCount;
  const allDescribed = totalNodes > 0 && describedLabels.length >= totalNodes;

  // テキスト変更 → 親に通知（デバウンスは useDashboard 側）
  const handleChange = useCallback((v: string) => {
    onMemoChange(v);
    if (phase === 'revise' && v.trim()) {
      onRequestTopicDetection(v);
    }
  }, [phase, onMemoChange, onRequestTopicDetection]);

  // 提案クリック → テキスト末尾に挿入
  const handleSuggClick = useCallback((s: WritingSuggestion) => {
    const ins = `\n${s.connector}${s.prompt_hint}`;
    const nxt = memoContent + ins;
    onMemoChange(nxt);
    // 挿入後もトピック検知をトリガー
    if (phase === 'revise') onRequestTopicDetection(nxt);
    setTimeout(() => {
      const ta = taRef.current;
      if (ta) { ta.focus(); ta.selectionStart = ta.selectionEnd = nxt.length; ta.scrollTop = ta.scrollHeight; }
    }, 50);
  }, [memoContent, onMemoChange, onRequestTopicDetection, phase]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-surface-200">
        <h2 className="text-sm font-semibold text-surface-700">{LABELS[mode]}</h2>
        <p className="text-[11px] text-surface-400 mt-0.5">
          {phase === 'write' ? 'テキストを入力してマップを生成' : 'マップを参照しながら振り返りを深めましょう'}
        </p>
      </div>

      {phase === 'revise' && (
        <WritingProgress
          totalNodes={totalNodes}
          describedCount={describedLabels.length}
          currentlyWriting={currentlyWriting}
          describedLabels={describedLabels}
          detecting={detectingTopics}
        />
      )}

      <div className="flex-1 p-4 overflow-y-auto space-y-3">
        <Textarea
          value={memoContent}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={PH[mode]}
          rows={8}
          className="min-h-[140px]"
        />

        {phase === 'write' && (
          <Button onClick={() => memoContent.trim() && onGenerateMap(memoContent)}
            disabled={!memoContent.trim() || loading} className="w-full">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} マップを生成
          </Button>
        )}

        {phase === 'revise' && (
          <div className="space-y-3 animate-fade-in">
            <WritingSuggestions
              suggestions={nextSuggestions}
              allDescribed={allDescribed}
              onSuggestionClick={handleSuggClick}
            />
            <div className="border-t border-surface-200 pt-3">
              <p className="text-[11px] font-medium text-surface-500 mb-1.5">ノードを手動追加</p>
              <div className="flex gap-2">
                <input type="text" value={nodeKw}
                  onChange={(e) => setNodeKw(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && nodeKw.trim()) { onAddNodeRequest(nodeKw.trim()); setNodeKw(''); } }}
                  placeholder="キーワード..."
                  className={cn('flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-surface-300',
                    'focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400')}
                />
                <Button size="sm" onClick={() => { if (nodeKw.trim()) { onAddNodeRequest(nodeKw.trim()); setNodeKw(''); } }}
                  disabled={!nodeKw.trim()}>
                  <Plus size={13} />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {nodes.length > 0 && (
        <div className="px-4 py-2 border-t border-surface-200 text-[11px] text-surface-400 flex items-center justify-between">
          <span>通常ノード: {realNodeCount}個</span>
          {detectingTopics && (
            <span className="flex items-center gap-1 text-primary-400">
              <Loader2 size={10} className="animate-spin" /> 解析中...
            </span>
          )}
        </div>
      )}
    </div>
  );
};