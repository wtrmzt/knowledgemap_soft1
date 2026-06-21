/**
 * ダッシュボードページ (v3.2.1 完成版)
 *
 * 修正点:
 * - 「新しいマップ」二重作成を防ぐ useRef ガード
 * - タイトル編集欄(currentMemo がある時のみ表示)
 * - ?memo_id=<id> / ?new=1 のクエリ対応
 */
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  History, LogOut, Settings, Save, CheckCircle2, GraduationCap,
  LayoutGrid, HelpCircle, ChevronLeft, ChevronRight, BookOpen,
} from 'lucide-react';
import {
  ModeSwitcher, ReflectionSheet,
  KnowledgeMapDisplay, MapHistoryPanel,
} from '@/components';
import { Button } from '@/components/ui';
import { useDashboard } from '@/hooks/useDashboard';
import { HelpTutorial, shouldAutoOpenTutorial } from '@/components/HelpTutorial';
import { HelpOverlay } from '@/components/HelpOverlay';
import { FLOW_PHASE_LABELS } from '@/types';

const CURRENT_MEMO_KEY = 'kmap_current_memo';

const YEAR_OPTIONS = [
  { value: 1, label: '1年次' },
  { value: 2, label: '2年次' },
  { value: 3, label: '3年次' },
  { value: 4, label: '4年次' },
];

const DashboardPage: React.FC = () => {
  const d = useDashboard();
  const navigate = useNavigate();
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

  // ★★★ 項目8: 編集中マップの永続化 + 復元 ★★★
  // 現在のメモIDを sessionStorage に保持（マップ一覧へ往復しても失わない）
  useEffect(() => {
    if (d.currentMemo) {
      try { sessionStorage.setItem(CURRENT_MEMO_KEY, String(d.currentMemo.id)); } catch { /* noop */ }
    }
  }, [d.currentMemo]);

  // memo_id も new も無い「素の /dashboard」で開かれたとき:
  //   - 直前に編集していたマップがあれば復元（?memo_id=<id> に置換）
  //   - 無ければマップ一覧へ誘導（マップ一覧→作成→ダッシュボードの導線に統一）
  const handledRestoreRef = useRef(false);
  useEffect(() => {
    if (memoIdParam || isNewParam) return;
    if (handledRestoreRef.current) return;
    handledRestoreRef.current = true;

    let stored: string | null = null;
    try { stored = sessionStorage.getItem(CURRENT_MEMO_KEY); } catch { /* noop */ }

    if (stored && !Number.isNaN(Number(stored))) {
      setSearchParams({ memo_id: stored }, { replace: true });
    } else {
      navigate('/maps', { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memoIdParam, isNewParam]);

  // ★★★ 項目9 / FB5: チュートリアル（手順ガイド）とヘルプ（領域説明）は別機能 ★★★
  const [helpOpen, setHelpOpen] = useState(false);          // チュートリアル（モーダル）
  const [helpRegionsOpen, setHelpRegionsOpen] = useState(false); // ヘルプ（各領域の説明）
  useEffect(() => {
    if (shouldAutoOpenTutorial()) setHelpOpen(true);
  }, []);

  // ★★★ 管理者機能D: ログイン時の「ようこそ管理者様」（セッション中1回）★★★
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  useEffect(() => {
    if (!d.isAdminUser) return;
    try {
      if (sessionStorage.getItem('kmap_admin_welcomed') !== '1') {
        setWelcomeOpen(true);
        sessionStorage.setItem('kmap_admin_welcomed', '1');
      }
    } catch { /* noop */ }
  }, [d.isAdminUser]);

  // ★★★ 項目3 / 管理者機能D: フェーズ制御（関連Lv1なら接続フェーズなし） ★★★
  const hasMap = d.nodes.length > 0;
  const phaseOrder = d.flowPhases;
  const phaseIndex = phaseOrder.indexOf(d.flowPhase);
  const canPrev = phaseIndex > 0;
  const canNext =
    phaseIndex >= 0 &&
    phaseIndex < phaseOrder.length - 1 &&
    // create→edit はマップ生成が前提
    !(d.flowPhase === 'create' && !hasMap);

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

          <ModeSwitcher mode={d.mode} onChange={d.handleModeChange} enabledModes={d.enabledModes} />

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

          {/* ★★★ FB3: フェーズは「現在の1つ」だけ表示 + 進む/戻る ★★★ */}
          {hasMap && (
            <div className="ml-3 flex items-center gap-1 pl-3 border-l border-surface-200">
              <button
                onClick={d.handlePrevPhase}
                disabled={!canPrev}
                title="前のフェーズ"
                className="flex items-center justify-center w-6 h-6 rounded-md text-surface-500 hover:bg-surface-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={15} />
              </button>

              <span className="text-[11px] px-2.5 py-1 rounded-md font-semibold whitespace-nowrap bg-primary-600 text-white">
                {`${phaseIndex + 1}. ${FLOW_PHASE_LABELS[d.flowPhase]}`}
              </span>

              <button
                onClick={d.handleNextPhase}
                disabled={!canNext}
                title="次のフェーズ"
                className="flex items-center justify-center gap-0.5 h-6 px-1.5 rounded-md text-xs font-medium text-primary-600 hover:bg-primary-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                次へ<ChevronRight size={14} />
              </button>
            </div>
          )}
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

          {/* 変更履歴・使い方ガイド・ヘルプはフッターへ移動（FB-C） */}
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

      {/* ★★★ 管理者機能D: ようこそ管理者様 ★★★ */}
      {welcomeOpen && d.isAdminUser && (
        <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-2 bg-primary-50 border-b border-primary-200">
          <span className="text-xs text-primary-800">
            ようこそ管理者様。設定（モードON/OFF・介入度・プロンプト）は
            <button
              onClick={() => d.navigate('/admin')}
              className="mx-1 font-semibold underline underline-offset-2 hover:text-primary-900"
            >
              管理者ツール
            </button>
            から変更できます。
          </span>
          <button
            onClick={() => setWelcomeOpen(false)}
            className="text-[11px] text-primary-600 hover:text-primary-800 px-2 py-1 rounded-md hover:bg-primary-100 transition-colors"
          >
            閉じる
          </button>
        </div>
      )}

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
            showRelationNote={d.showRelationNote}
            relationNote={d.relationNote}
            onRelationNoteChange={d.handleRelationNoteChange}
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
              edgeExplanationLevel={d.edgeExplanationLevel}
            />
          )}

          <MapHistoryPanel memoId={d.currentMemo?.id ?? null}
            visible={d.showHistory} onClose={() => d.setShowHistory(false)}
            onRollback={d.handleRollback} />

          {/* ★ A対策: 関連科目が0件などのとき、無言ではなく理由を表示 */}
          {d.relationNotice && (d.flowPhase === 'connect_past' || d.flowPhase === 'connect_future') && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 max-w-md flex items-start gap-2 px-3.5 py-2.5 rounded-xl bg-amber-50 border border-amber-200 shadow-md animate-fade-in">
              <span className="text-[12px] leading-relaxed text-amber-800">{d.relationNotice}</span>
              <button
                onClick={d.clearRelationNotice}
                className="text-[11px] text-amber-600 hover:text-amber-800 shrink-0 mt-0.5"
                aria-label="閉じる"
              >
                ✕
              </button>
            </div>
          )}
        </main>
      </div>

      {/* ===== Footer: ツール類（FB-C で移動） ===== */}
      <footer className="h-9 shrink-0 flex items-center justify-end gap-1 px-4 border-t border-surface-200 bg-white">
        {d.currentMemo && (
          <button
            onClick={() => d.setShowHistory(!d.showHistory)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-surface-500 hover:bg-surface-100 hover:text-surface-700 transition-colors"
            title="変更履歴"
          >
            <History size={13} /> 変更履歴
          </button>
        )}
        <button
          onClick={() => setHelpOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-surface-500 hover:bg-surface-100 hover:text-surface-700 transition-colors"
          title="チュートリアル（使い方の手順）"
        >
          <BookOpen size={13} /> 使い方ガイド
        </button>
        <button
          onClick={() => setHelpRegionsOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-surface-500 hover:bg-surface-100 hover:text-surface-700 transition-colors"
          title="ヘルプ（各領域の説明）"
        >
          <HelpCircle size={13} /> ヘルプ
        </button>
      </footer>

      {/* ★★★ 項目9 / FB5 ★★★ */}
      <HelpTutorial open={helpOpen} onClose={() => setHelpOpen(false)} flowPhase={d.flowPhase} />
      <HelpOverlay open={helpRegionsOpen} onClose={() => setHelpRegionsOpen(false)} />
    </div>
  );
};

export default DashboardPage;