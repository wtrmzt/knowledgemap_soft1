/**
 * OutlookPage.tsx — 関連性接続把握機能「見通す」
 * 配置先: frontend/knowledge-map-app/src/pages/OutlookPage.tsx
 *
 * フロー:
 *   Step1 振り返り(マップ付きメモ)を選択
 *   Step2 振り返り内容を確認しつつ、推薦された2・3年次科目(上位3件)から1つ選択
 *         (各科目に「どのような科目か」「どのような接続になるか」を表示 / 選び直し可)
 *   Step3 振り返りマップ ⇔ 科目マップを接続表示 + 繋がり説明 + 「詳しく」 + 回答入力
 *         - 説明カードクリックで対象ノードをハイライト
 *         - 「詳しく」はカード内をインライン展開(生成中→テキスト表示、マップ操作を妨げない)
 *         - 科目名の横に履修学年を表示
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Telescope, Loader2, RefreshCw, ChevronRight, ChevronUp,
  BookOpen, Sparkles, Send, CheckCircle2, HelpCircle, Link2,
} from 'lucide-react';
import { OutlookMapDisplay, type OViewNode, type OViewEdge, type OHighlight }
  from '@/components/OutlookMapDisplay';
import { mapService, loggingService } from '@/services';
import { isAuthenticated } from '@/services/authService';
import * as outlookService from '@/services/outlookService';
import { computeRadialLayout, generateId } from '@/utils';
import type { MapNode, MapEdge } from '@/types';
import type {
  OutlookMemoSummary, OutlookSubject, OutlookConnectionsResult, OutlookLink,
} from '@/types/outlook';

const QUESTION = '本授業とこの科目についてどのような関係性があると思いますか?';

type Step = 'select_memo' | 'select_subject' | 'view';

interface DetailState {
  open: boolean;
  loading: boolean;
  text: string;
  error: string;
}

// ===== 振り返りマップ + 科目マップ → 表示用の結合グラフを構築 =====
function buildCombinedMap(
  reflNodes: MapNode[],
  reflEdges: MapEdge[],
  result: OutlookConnectionsResult,
): { nodes: OViewNode[]; edges: OViewEdge[] } {
  // --- 科目マップ: 放射状レイアウト(既存エンジン流用)
  const subjNodesRaw: MapNode[] = result.subject_map.nodes.map((n) => ({
    id: n.id,
    label: n.label,
    position: { x: 0, y: 0 },
  }));
  const subjEdgesRaw: MapEdge[] = result.subject_map.edges.map((e) => ({
    id: generateId('oedge'),
    source: e.source,
    target: e.target,
  }));
  const laidOut = computeRadialLayout(subjNodesRaw, subjEdgesRaw);
  const posOf: Record<string, { x: number; y: number }> = {};
  laidOut.forEach((n) => { posOf[n.id] = n.position; });

  // --- ルート(科目名)からの距離(BFS) → 深いほど色を薄く
  const adj: Record<string, string[]> = {};
  result.subject_map.nodes.forEach((n) => { adj[n.id] = []; });
  result.subject_map.edges.forEach((e) => {
    if (adj[e.source]) adj[e.source].push(e.target);
    if (adj[e.target]) adj[e.target].push(e.source);
  });
  const depthOf: Record<string, number> = {};
  const rootId = result.subject_map.root_id
    || (result.subject_map.nodes[0] ? result.subject_map.nodes[0].id : '');
  if (rootId) {
    depthOf[rootId] = 0;
    let queue = [rootId];
    while (queue.length > 0) {
      const next: string[] = [];
      for (const cur of queue) {
        for (const nb of adj[cur] || []) {
          if (depthOf[nb] === undefined) {
            depthOf[nb] = depthOf[cur] + 1;
            next.push(nb);
          }
        }
      }
      queue = next;
    }
  }

  // --- 科目マップを振り返りマップの右側へ平行移動
  const reflMaxX = reflNodes.length
    ? Math.max(...reflNodes.map((n) => n.position?.x ?? 0)) : 0;
  const reflMidY = reflNodes.length
    ? reflNodes.reduce((s, n) => s + (n.position?.y ?? 0), 0) / reflNodes.length : 400;
  const xs = laidOut.map((n) => n.position.x);
  const ys = laidOut.map((n) => n.position.y);
  const subjMinX = xs.length ? Math.min(...xs) : 0;
  const subjMidY = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 400;
  const dx = reflMaxX + 600 - subjMinX;
  const dy = reflMidY - subjMidY;

  const sentenceOf: Record<string, string> = {};
  result.subject_map.nodes.forEach((n) => { sentenceOf[n.id] = n.sentence; });

  const nodes: OViewNode[] = [
    ...reflNodes.map((n) => ({
      id: n.id,
      label: n.label || n.data?.label || n.id,
      sentence: n.sentence || n.data?.sentence || '',
      kind: 'reflection' as const,
      position: n.position || { x: 0, y: 0 },
    })),
    ...result.subject_map.nodes.map((n) => ({
      id: n.id,
      label: n.label,
      sentence: sentenceOf[n.id] || '',
      kind: 'subject' as const,
      depth: depthOf[n.id] ?? 2,
      position: {
        x: (posOf[n.id]?.x ?? 0) + dx,
        y: (posOf[n.id]?.y ?? 0) + dy,
      },
    })),
  ];

  const edges: OViewEdge[] = [
    ...reflEdges.map((e) => ({
      id: e.id, source: e.source, target: e.target, kind: 'reflection' as const,
    })),
    ...subjEdgesRaw.map((e) => ({
      id: e.id, source: e.source, target: e.target, kind: 'subject' as const,
    })),
    ...result.links.map((lk) => ({
      id: `cross-${lk.source_id}-${lk.target_id}`,   // ハイライト対象を特定できる決定的ID
      source: lk.source_id,
      target: lk.target_id,
      kind: 'cross' as const,
    })),
  ];

  return { nodes, edges };
}

// ===== メインページ =====
const OutlookPage: React.FC = () => {
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('select_memo');
  const [memos, setMemos] = useState<OutlookMemoSummary[]>([]);
  const [memosLoading, setMemosLoading] = useState(true);
  const [pageError, setPageError] = useState('');

  const [selectedMemo, setSelectedMemo] = useState<OutlookMemoSummary | null>(null);
  const [subjects, setSubjects] = useState<OutlookSubject[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(false);

  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [connLoading, setConnLoading] = useState(false);
  const [connResult, setConnResult] = useState<OutlookConnectionsResult | null>(null);
  const [combined, setCombined] = useState<{ nodes: OViewNode[]; edges: OViewEdge[] }>({ nodes: [], edges: [] });
  const [highlight, setHighlight] = useState<OHighlight | null>(null);
  /** 「詳しく」のインライン展開状態: key = `${source_id}-${target_id}` */
  const [detailOf, setDetailOf] = useState<Record<string, DetailState>>({});

  const [answer, setAnswer] = useState('');
  const [answerSaving, setAnswerSaving] = useState(false);
  const [answerSavedAt, setAnswerSavedAt] = useState<number | null>(null);
  const [latestAnswer, setLatestAnswer] = useState<string>('');

  const reflMapRef = useRef<{ nodes: MapNode[]; edges: MapEdge[] }>({ nodes: [], edges: [] });

  // ---- 認証 & 初期ロード ----
  useEffect(() => {
    if (!isAuthenticated()) { navigate('/login'); return; }
    loggingService.logActivity('outlook_open' as any, {});
    outlookService.getMemos()
      .then(setMemos)
      .catch((e: any) => setPageError(e?.message || '一覧の取得に失敗しました'))
      .finally(() => setMemosLoading(false));
  }, [navigate]);

  // ---- Step1: メモ選択 → 科目推薦 ----
  const handleSelectMemo = useCallback(async (m: OutlookMemoSummary) => {
    setSelectedMemo(m);
    setStep('select_subject');
    setSubjects([]);
    setSubjectsLoading(true);
    setPageError('');
    loggingService.logActivity('outlook_memo_selected' as any, { memo_id: m.memo_id }, m.memo_id);
    try {
      // 振り返りマップ本体も先読み(Step3で使用)
      const [subjRes, mapData] = await Promise.all([
        outlookService.getSubjects(m.memo_id),
        mapService.getMap(m.memo_id),
      ]);
      reflMapRef.current = {
        nodes: (mapData.nodes || []).filter(
          (n) => !n.data?.isSatellite && !n.data?.isRelation
        ),
        edges: (mapData.edges || []).filter((e) => !e.isSatellite && !e.isRelation),
      };
      setSubjects(subjRes.subjects);
      loggingService.logActivity('outlook_subjects_shown' as any, {
        memo_id: m.memo_id,
        subjects: subjRes.subjects.map((s) => ({ name: s.subject_name, score: s.score })),
      }, m.memo_id);
    } catch (e: any) {
      setPageError(e?.message || '科目の算出に失敗しました');
      setStep('select_memo');
    } finally {
      setSubjectsLoading(false);
    }
  }, []);

  // ---- Step2: 科目選択 → 接続計算 ----
  const handleSelectSubject = useCallback(async (subjectName: string) => {
    if (!selectedMemo) return;
    setSelectedSubject(subjectName);
    setStep('view');
    setConnLoading(true);
    setConnResult(null);
    setHighlight(null);
    setPageError('');
    loggingService.logActivity('outlook_subject_selected' as any, {
      memo_id: selectedMemo.memo_id, subject_name: subjectName,
    }, selectedMemo.memo_id);
    try {
      const res = await outlookService.getConnections(selectedMemo.memo_id, subjectName);
      setConnResult(res);
      setCombined(buildCombinedMap(reflMapRef.current.nodes, reflMapRef.current.edges, res));
      setLatestAnswer(res.latest_answer?.answer_text || '');
      setAnswer('');
      setDetailOf({});
    } catch (e: any) {
      setPageError(e?.message || '接続の計算に失敗しました');
      setStep('select_subject');
    } finally {
      setConnLoading(false);
    }
  }, [selectedMemo]);

  // ---- 説明カードクリック → 対象ノードをハイライト(トグル) ----
  const handleLinkClick = useCallback((lk: OutlookLink) => {
    setHighlight((prev) => {
      const same = prev && prev.sourceId === lk.source_id && prev.targetId === lk.target_id;
      if (!same && connResult) {
        loggingService.logActivity('outlook_link_highlighted' as any, {
          memo_id: connResult.memo_id,
          subject_name: connResult.subject_name,
          source_label: lk.source_label,
          target_label: lk.target_label,
        }, connResult.memo_id);
      }
      return same ? null : { sourceId: lk.source_id, targetId: lk.target_id };
    });
  }, [connResult]);

  // ---- 「詳しく」: カード内をインライン展開して詳細説明を表示 ----
  const handleDetailToggle = useCallback((lk: OutlookLink) => {
    if (!connResult) return;
    const key = `${lk.source_id}-${lk.target_id}`;
    const cur = detailOf[key];

    // 取得済み/取得中 → 開閉のみトグル
    if (cur && (cur.text || cur.loading || cur.error)) {
      setDetailOf((prev) => ({ ...prev, [key]: { ...prev[key], open: !prev[key].open } }));
      return;
    }

    // 初回: 「生成中」を表示しつつ取得
    setDetailOf((prev) => ({
      ...prev, [key]: { open: true, loading: true, text: '', error: '' },
    }));
    loggingService.logActivity('outlook_detail_opened' as any, {
      memo_id: connResult.memo_id,
      subject_name: connResult.subject_name,
      target_label: lk.target_label,
    }, connResult.memo_id);
    outlookService
      .explainConcept(connResult.memo_id, connResult.subject_name,
        lk.source_label, lk.target_label)
      .then((d) => setDetailOf((prev) => ({
        ...prev, [key]: { ...prev[key], loading: false, text: d },
      })))
      .catch(() => setDetailOf((prev) => ({
        ...prev, [key]: { ...prev[key], loading: false, error: '説明の取得に失敗しました' },
      })));
  }, [connResult, detailOf]);

  // ---- 回答送信 ----
  const handleSubmitAnswer = useCallback(async () => {
    if (!selectedMemo || !selectedSubject || !answer.trim()) return;
    setAnswerSaving(true);
    try {
      const saved = await outlookService.saveAnswer(
        selectedMemo.memo_id, selectedSubject, answer.trim());
      setLatestAnswer(saved.answer_text);
      setAnswer('');
      setAnswerSavedAt(Date.now());
      setTimeout(() => setAnswerSavedAt(null), 2500);
      loggingService.logActivity('outlook_answer_submitted' as any, {
        memo_id: selectedMemo.memo_id, subject_name: selectedSubject,
        length: saved.answer_text.length,
      }, selectedMemo.memo_id);
    } catch (e: any) {
      setPageError(e?.message || '回答の保存に失敗しました');
    } finally {
      setAnswerSaving(false);
    }
  }, [selectedMemo, selectedSubject, answer]);

  // ===== レンダリング =====
  return (
    <div className="min-h-screen bg-surface-50 flex flex-col">
      {/* ヘッダー */}
      <header className="bg-white border-b border-surface-200 px-4 py-2.5 flex items-center gap-3 shrink-0">
        <button
          onClick={() => navigate('/maps')}
          className="flex items-center gap-1 text-xs text-surface-500 hover:text-surface-700"
        >
          <ArrowLeft size={14} /> 戻る
        </button>
        <div className="flex items-center gap-1.5 text-sm font-semibold text-surface-800">
          <Telescope size={16} className="text-primary-600" /> 見通す
        </div>
        {selectedMemo && (
          <span className="text-[11px] text-surface-400 truncate">
            {selectedMemo.title || selectedMemo.content_excerpt}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {step === 'view' && (
            <button
              onClick={() => { setStep('select_subject'); setHighlight(null); }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] border border-surface-200 text-surface-600 hover:bg-surface-50"
            >
              <RefreshCw size={12} /> 科目を選び直す
            </button>
          )}
          {(step === 'select_subject' || step === 'view') && (
            <button
              onClick={() => {
                setStep('select_memo'); setSelectedMemo(null);
                setConnResult(null); setHighlight(null);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] border border-surface-200 text-surface-600 hover:bg-surface-50"
            >
              振り返りを選び直す
            </button>
          )}
        </div>
      </header>

      {pageError && (
        <div className="bg-red-50 text-red-600 text-xs px-4 py-2">{pageError}</div>
      )}

      {/* Step1: 振り返り選択 */}
      {step === 'select_memo' && (
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-sm font-semibold text-surface-700 mb-1">振り返りを選択</h2>
            <p className="text-[11px] text-surface-400 mb-4">
              選んだ振り返りマップをもとに、つながりの深い2・3年次の科目を算出します。
            </p>
            {memosLoading ? (
              <div className="flex justify-center py-16 text-surface-400">
                <Loader2 size={22} className="animate-spin" />
              </div>
            ) : memos.length === 0 ? (
              <p className="text-xs text-surface-400">マップ付きの振り返りがありません。</p>
            ) : (
              <div className="space-y-2">
                {memos.map((m) => (
                  <button
                    key={m.memo_id}
                    onClick={() => handleSelectMemo(m)}
                    className="w-full text-left bg-white rounded-xl border border-surface-200 p-3.5 hover:border-primary-300 hover:shadow-sm transition-all flex items-center gap-3"
                  >
                    <BookOpen size={16} className="text-primary-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-surface-800 truncate">
                        {m.title || m.content_excerpt || '(無題)'}
                      </p>
                      <p className="text-[11px] text-surface-400">
                        ノード {m.node_count} 件
                        {m.updated_at && ` ・ ${new Date(m.updated_at).toLocaleDateString('ja-JP')}`}
                      </p>
                    </div>
                    <ChevronRight size={14} className="text-surface-300 shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </main>
      )}

      {/* Step2: 科目選択 */}
      {step === 'select_subject' && (
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto">
            {/* 選択中の振り返り内容 */}
            {selectedMemo && (
              <div className="mb-5 rounded-xl border border-surface-200 bg-white p-4">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <BookOpen size={14} className="text-primary-500" />
                  <p className="text-xs font-semibold text-surface-700">
                    {selectedMemo.title || '選択中の振り返り'}
                  </p>
                </div>
                <p className="text-[11px] text-surface-600 leading-relaxed whitespace-pre-wrap max-h-36 overflow-y-auto">
                  {selectedMemo.content || selectedMemo.content_excerpt}
                </p>
              </div>
            )}

            <h2 className="text-sm font-semibold text-surface-700 mb-1">科目を選択</h2>
            <p className="text-[11px] text-surface-400 mb-4">
              この振り返りとつながりの深い2・3年次の科目です。1つ選ぶとマップ同士を接続して表示します。
            </p>
            {subjectsLoading ? (
              <div className="flex flex-col items-center gap-2 py-16 text-surface-400 text-xs">
                <Loader2 size={22} className="animate-spin" />
                各ノードと科目の類似度を計算しています...
              </div>
            ) : subjects.length === 0 ? (
              <p className="text-xs text-surface-400">条件に合う科目が見つかりませんでした。</p>
            ) : (
              <div className="space-y-2.5">
                {subjects.map((s, i) => (
                  <button
                    key={s.subject_name}
                    onClick={() => s.has_map && handleSelectSubject(s.subject_name)}
                    disabled={!s.has_map}
                    className={`w-full text-left bg-white rounded-xl border p-4 transition-all ${
                      s.has_map
                        ? 'border-surface-200 hover:border-primary-300 hover:shadow-sm'
                        : 'border-surface-100 opacity-50 cursor-not-allowed'
                    } ${selectedSubject === s.subject_name ? 'ring-1 ring-primary-400' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-primary-50 text-primary-600 text-[11px] font-semibold flex items-center justify-center shrink-0">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-surface-800">{s.subject_name}</p>
                        <p className="text-[11px] text-surface-400">
                          {s.year}年次 ・ 類似度合計 {s.score.toFixed(2)}
                          {!s.has_map && ' ・ マップ未登録'}
                        </p>
                      </div>
                      <Sparkles size={14} className="text-accent-500 shrink-0" />
                    </div>

                    {/* どのような科目か */}
                    {s.description && (
                      <p className="mt-2 text-[11px] text-surface-600 leading-relaxed bg-surface-50 rounded-lg px-2.5 py-1.5">
                        {s.description}
                      </p>
                    )}

                    {/* どのような接続になるか */}
                    {s.preview.length > 0 && (
                      <div className="mt-2 flex items-start gap-1.5">
                        <Link2 size={12} className="text-primary-400 mt-0.5 shrink-0" />
                        <p className="text-[11px] text-surface-500 leading-relaxed">
                          {s.preview.map((p, pi) => (
                            <span key={pi}>
                              {pi > 0 && ' / '}
                              振り返りの
                              <span className="font-medium text-surface-700">「{p.source_label}」</span>
                              ⇔
                              <span className="font-medium text-teal-700">「{p.target_label}」</span>
                            </span>
                          ))}
                          {' などがつながります'}
                        </p>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </main>
      )}

      {/* Step3: マップ接続表示 + 説明 + 回答 */}
      {step === 'view' && (
        <main className="flex-1 flex overflow-hidden">
          {/* マップ */}
          <div className="flex-1 relative">
            {connLoading ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-surface-400 text-xs">
                <Loader2 size={22} className="animate-spin" />
                「{selectedSubject}」との接続とつながりの説明を生成しています...
              </div>
            ) : connResult ? (
              <OutlookMapDisplay
                key={`${connResult.memo_id}-${connResult.subject_name}`}
                nodes={combined.nodes}
                edges={combined.edges}
                highlight={highlight}
              />
            ) : null}
          </div>

          {/* 右パネル */}
          {connResult && !connLoading && (
            <aside className="w-96 shrink-0 bg-white border-l border-surface-200 flex flex-col overflow-hidden">
              <div className="px-4 py-3 border-b border-surface-100">
                <p className="text-[11px] text-surface-400">接続先の科目</p>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-surface-800">{connResult.subject_name}</h3>
                  {connResult.year && (
                    <span className="shrink-0 px-2 py-0.5 rounded-md bg-teal-50 text-teal-700 text-[11px] font-semibold border border-teal-100">
                      {connResult.year}年次
                    </span>
                  )}
                </div>
              </div>

              {/* 繋がり説明リスト */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
                <p className="text-[11px] font-medium text-surface-500">
                  概念のつながり({connResult.links.length}件)
                  <span className="ml-1 font-normal text-surface-400">クリックでマップ上を強調</span>
                </p>
                {connResult.links.length === 0 && (
                  <p className="text-[11px] text-surface-400">
                    類似度が閾値({connResult.threshold})以上のつながりが見つかりませんでした。
                  </p>
                )}
                {connResult.links.map((lk) => {
                  const key = `${lk.source_id}-${lk.target_id}`;
                  const d = detailOf[key];
                  const opened = !!d?.open;
                  const isActive = !!highlight
                    && highlight.sourceId === lk.source_id
                    && highlight.targetId === lk.target_id;
                  return (
                    <div
                      key={key}
                      onClick={() => handleLinkClick(lk)}
                      className={`rounded-lg border p-2.5 cursor-pointer transition-all ${
                        isActive
                          ? 'border-amber-400 bg-amber-50 shadow-sm'
                          : 'border-surface-200 hover:border-surface-300 hover:bg-surface-50'
                      }`}
                    >
                      <div className="flex items-center gap-1 text-[11px] font-medium text-surface-700 mb-1 flex-wrap">
                        <span className="px-1.5 py-0.5 rounded bg-surface-100">{lk.source_label}</span>
                        <span className="text-surface-300">⇔</span>
                        <span className="px-1.5 py-0.5 rounded bg-teal-50 text-teal-700">{lk.target_label}</span>
                      </div>
                      <p className="text-[11px] text-surface-600 leading-relaxed">
                        {lk.sentence || '(説明を生成できませんでした)'}
                      </p>

                      {/* 「詳しく」: カード内インライン展開 */}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDetailToggle(lk); }}
                        className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-primary-600 hover:text-primary-700"
                      >
                        {opened
                          ? <><ChevronUp size={12} /> 閉じる</>
                          : <><HelpCircle size={12} /> 「{lk.target_label}」を詳しく</>}
                      </button>
                      {opened && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1.5 rounded-lg bg-teal-50/60 border border-teal-100 px-2.5 py-2 animate-fade-in cursor-default"
                        >
                          {d.loading ? (
                            <p className="flex items-center gap-1.5 text-[11px] text-surface-400">
                              <Loader2 size={12} className="animate-spin" /> 生成中...
                            </p>
                          ) : d.error ? (
                            <p className="text-[11px] text-red-500">{d.error}</p>
                          ) : (
                            <p className="text-[11px] text-surface-700 leading-relaxed whitespace-pre-wrap">
                              {d.text}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 回答フォーム */}
              <div className="border-t border-surface-100 px-4 py-3">
                <p className="text-[11px] font-medium text-surface-600 mb-1.5">{QUESTION}</p>
                {latestAnswer && (
                  <div className="mb-2 rounded-lg bg-surface-50 border border-surface-100 p-2">
                    <p className="text-[10px] text-surface-400 mb-0.5">前回の回答</p>
                    <p className="text-[11px] text-surface-600 whitespace-pre-wrap">{latestAnswer}</p>
                  </div>
                )}
                <textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  rows={4}
                  placeholder="つながりの説明やマップを参考に、考えたことを書いてください"
                  className="w-full text-xs rounded-lg border border-surface-200 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary-400 resize-none"
                />
                <div className="mt-1.5 flex items-center gap-2">
                  <button
                    onClick={handleSubmitAnswer}
                    disabled={answerSaving || !answer.trim()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-40"
                  >
                    {answerSaving ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                    送信
                  </button>
                  {answerSavedAt && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-accent-600">
                      <CheckCircle2 size={12} /> 保存しました
                    </span>
                  )}
                </div>
              </div>
            </aside>
          )}
        </main>
      )}
    </div>
  );
};

export default OutlookPage;