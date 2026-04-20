/**
 * ダッシュボードページ（Phase 3 v3 修正版）
 *
 * 変更点:
 * - ヘッダーに学年ドロップダウンを追加
 * - RelationPanel は廃止（マップ上に直接表示）
 */
import React from 'react';
import { History, LogOut, Settings, Save, CheckCircle2, GraduationCap } from 'lucide-react';
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

          {/* ★ 学年ドロップダウン */}
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
        </div>

        <div className="flex items-center gap-2">
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