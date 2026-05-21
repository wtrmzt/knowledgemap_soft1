/**
 * ダッシュボードページ (v3.2.1 完成版)
 *
 * 修正点:
 * - 「新しいマップ」二重作成を防ぐ useRef ガード
 * - タイトル編集欄(currentMemo がある時のみ表示)
 * - ?memo_id=<id> / ?new=1 のクエリ対応
 */
import React, { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  History, LogOut, Settings, Save, CheckCircle2, GraduationCap,
  LayoutGrid,
} from 'lucide-react';
import {
  ModeSwitcher, ReflectionSheet,
  KnowledgeMapDisplay, MapHistoryPanel,
} from '@/components';
import { Button } from '@/components/ui';
import { useDashboard } from '@/hooks/useDashboard';

const YEAR_OPTIONS = [
  { value: 1, label: '1年次' },
  { value: 2, label: '2年次' },
  { value: 3, label: '3年次' },
  { value: 4, label: '4年次' },
];

const DashboardPage: React.FC = () => {
  const d = useDashboard();
  const [searchParams, setSearchParams] = useSearchParams();

  const memoIdParam = searchParams.get('memo_id');
  const isNewParam = searchParams.get('new') === '1';

  // ★ StrictMode の二重 useEffect 実行を防ぐためのガード(コンポーネント単位)
  const handledMemoIdRef = useRef<string | null>(null);
  const handledNewRef = useRef<boolean>(false);

  // ?memo_id=<id> で既存マップを開く
  useEffect(() => {
    if (!memoIdParam) return;
    // 同じ memo_id を二重処理しない
    if (handledMemoIdRef.current === memoIdParam) return;
    handledMemoIdRef.current = memoIdParam;

    const id = Number(memoIdParam);
    if (Number.isNaN(id)) return;
    if (typeof d.loadExistingMemo === 'function') {
      void d.loadExistingMemo(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memoIdParam]);

  // ?new=1 で空メモを作成
  useEffect(() => {
    if (!isNewParam) return;
    // 二重作成防止(StrictMode 対策 + 連続実行防止)
    if (handledNewRef.current) return;
    handledNewRef.current = true;

    if (d.currentMemo) return;
    if (typeof d.handleCreateBlankMemo !== 'function') return;

    (async () => {
      const memo = await d.handleCreateBlankMemo();
      if (memo) {
        // URL を ?memo_id=<id> に置き換え(リロード・戻る対応 + ?new=1 の再実行防止)
        handledMemoIdRef.current = String(memo.id);  // loadExistingMemo の再取得を防ぐ
        setSearchParams({ memo_id: String(memo.id) }, { replace: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNewParam]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    d.setMemoTitle?.(e.target.value);
  };

  const titleValue = d.memoTitle ?? '';

  return (
    <div className="h-screen flex flex-col bg-surface-50">
      {/* ===== Header ===== */}
      <header className="h-13 shrink-0 flex items-center justify-between px-4 border-b border-surface-200 bg-white">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary-700 text-white flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" /><circle cx="4" cy="8" r="2" /><circle cx="20" cy="8" r="2" />
                <path d="M6 8h4M14 8h4" />
              </svg>
            </div>
            <span className="text-sm font-bold font-display text-surface-700">知識マップ</span>
          </div>

          <ModeSwitcher mode={d.mode} onChange={d.handleModeChange} />

          <div className="flex items-center gap-1.5 ml-2">
            <GraduationCap size={14} className="text-surface-400" />
            <select
              value={d.selectedYear}
              onChange={(e) => d.setSelectedYear(Number(e.target.value))}
              className="text-xs font-medium text-surface-600 bg-surface-50 border border-surface-200 rounded-lg px-2 py-1 cursor-pointer hover:border-surface-300 transition-colors focus:outline-none focus:ring-1 focus:ring-primary-400"
            >
              {YEAR_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <Link
            to="/maps"
            className="ml-2 flex items-center gap-1.5 text-xs text-surface-500 hover:text-primary-600 transition-colors"
            title="マップ一覧"
          >
            <LayoutGrid size={14} />
            マップ一覧
          </Link>
        </div>

        <div className="flex items-center gap-2">
          {/* ★ タイトル編集欄 */}
          {d.currentMemo && (
            <input
              type="text"
              value={titleValue}
              onChange={handleTitleChange}
              placeholder="タイトルを入力..."
              maxLength={100}
              className="w-56 text-xs font-medium text-surface-700 bg-surface-50 border border-surface-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary-400 focus:border-primary-400 placeholder:text-surface-300 transition-colors"
              aria-label="マップタイトル"
            />
          )}

          {d.saveStatus === 'saving' && (
            <span className="text-[11px] text-surface-400 flex items-center gap-1">
              <Save size={12} className="animate-pulse" /> 保存中...
            </span>
          )}
          {d.saveStatus === 'saved' && (
            <span className="text-[11px] text-accent-600 flex items-center gap-1">
              <CheckCircle2 size={12} /> 保存済み
            </span>
          )}

          {d.currentMemo && (
            <Button variant="ghost" size="sm" onClick={() => d.setShowHistory(!d.showHistory)}>
              <History size={14} />
            </Button>
          )}
          {d.isAdminUser && (
            <Button variant="ghost" size="sm" onClick={() => d.navigate('/admin')}>
              <Settings size={14} />
            </Button>
          )}
          <span className="text-[11px] text-surface-400">{d.userId}</span>
          <Button variant="ghost" size="sm" onClick={d.handleLogout}>
            <LogOut size={14} />
          </Button>
        </div>
      </header>

      {/* ===== Main ===== */}
      <div className="flex-1 flex overflow-hidden">
        <aside className="w-[360px] shrink-0 border-r border-surface-200 bg-white overflow-hidden flex flex-col">
          <ReflectionSheet
            phase={d.phase} mode={d.mode}
            memoContent={d.memoContent} onMemoChange={d.setMemoContent}
            onGenerateMap={d.handleGenerateMap}
            onAddNodeRequest={d.handleAddNode}
            onRequestTopicDetection={d.handleTopicDetection}
            loading={d.loading} nodes={d.nodes}
            realNodeCount={d.realNodeCount}
            describedLabels={d.describedLabels}
            currentlyWriting={d.currentlyWriting}
            nextSuggestions={d.nextSuggestions}
            detectingTopics={d.detectingTopics}
          />
        </aside>

        <main className="flex-1 relative">
          {d.nodes.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-surface-400 space-y-2">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto opacity-30">
                  <circle cx="12" cy="12" r="3" /><circle cx="4" cy="8" r="2" /><circle cx="20" cy="8" r="2" />
                  <circle cx="4" cy="16" r="2" /><circle cx="20" cy="16" r="2" />
                  <path d="M6 8h4M14 8h4M6 16h4M14 16h4" />
                </svg>
                <p className="text-sm">左のパネルにメモを入力して</p>
                <p className="text-sm">マップを生成してください</p>
              </div>
            </div>
          ) : (
            <KnowledgeMapDisplay
              nodes={d.nodes} edges={d.edges}
              nodeStatuses={d.nodeStatuses}
              surroundingConcepts={d.surroundingConcepts}
              onNodesChange={d.setNodes} onEdgesChange={d.setEdges}
              onConnect={d.handleConnect} onAutoSave={d.handleAutoSave}
              onSatelliteAdd={d.handleSatelliteAdd}
            />
          )}

          <MapHistoryPanel memoId={d.currentMemo?.id ?? null}
            visible={d.showHistory} onClose={() => d.setShowHistory(false)}
            onRollback={d.handleRollback} />
        </main>
      </div>
    </div>
  );
};

export default DashboardPage;