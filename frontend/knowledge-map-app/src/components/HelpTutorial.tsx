/**
 * チュートリアル / ヘルプ（項目9）
 *
 * - ヘッダーの「?」ボタンから開く操作ガイド。
 * - 初回アクセス時は自動で開く（localStorage の既読フラグで制御）。
 * - フェーズ制（初期マップ作成 → マップ編集 → 過去の科目接続 → 未来の科目接続）と
 *   主要なノード操作をまとめて説明する。
 *
 * 使い方:
 *   const [helpOpen, setHelpOpen] = useState(false);
 *   <HelpTutorial open={helpOpen} onClose={() => setHelpOpen(false)} flowPhase={d.flowPhase} />
 *   // 自動初回表示を使う場合は shouldAutoOpenTutorial() を参照。
 */
import React, { useEffect } from 'react';
import {
  X, HelpCircle, PenLine, Pencil, ArrowDownLeft, ArrowUpRight,
  MousePointerClick, Sparkles, Plus, Save, LayoutGrid,
} from 'lucide-react';
import type { FlowPhase } from '@/types';

const SEEN_KEY = 'kmap_tutorial_seen_v1';

/** 初回アクセス（未読）かどうか。true なら自動でチュートリアルを開いてよい。 */
export function shouldAutoOpenTutorial(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) !== '1';
  } catch {
    return false;
  }
}

/** 既読としてマークする。 */
export function markTutorialSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* localStorage 不可環境では何もしない */
  }
}

interface PhaseStep {
  phase: FlowPhase;
  icon: React.ReactNode;
  title: string;
  desc: string;
}

const PHASE_STEPS: PhaseStep[] = [
  {
    phase: 'create',
    icon: <PenLine size={16} />,
    title: '① 初期マップ作成',
    desc: '左のパネルに振り返り・調べ物・アイデアを入力し「マップを生成」を押すと、AIが概念のノードとつながりを自動生成します。',
  },
  {
    phase: 'edit',
    icon: <Pencil size={16} />,
    title: '② マップ編集',
    desc: 'ノードを確認しながら、周辺概念の追加・手動ノード追加・ノード同士の接続でマップを育てます。変更は自動保存されます。',
  },
  {
    phase: 'connect_past',
    icon: <ArrowDownLeft size={16} />,
    title: '③ 過去の科目接続',
    desc: 'いまのマップに関連する「基礎（過去）」の科目候補が左側に現れます。候補ノードの「詳細を表示」で、接続される概念を確認してから展開できます。',
  },
  {
    phase: 'connect_future',
    icon: <ArrowUpRight size={16} />,
    title: '④ 未来の科目接続',
    desc: '次に「発展（未来）」の科目候補が右側に現れます。同様に内容を確認して接続し、学びの前後関係を一望できます。',
  },
];

interface OpStep {
  icon: React.ReactNode;
  title: string;
  desc: string;
}

const OP_STEPS: OpStep[] = [
  {
    icon: <MousePointerClick size={15} />,
    title: 'ノードを開く',
    desc: 'ノードを左クリックすると詳細ポップアップが開きます。中ボタンドラッグでノードを移動できます。',
  },
  {
    icon: <Sparkles size={15} />,
    title: '周辺概念を取得',
    desc: 'ポップアップの「周辺概念を取得」で関連語を点線ノードとして提案します（マップに既にある概念は重複追加されません）。',
  },
  {
    icon: <Plus size={15} />,
    title: 'マップに追加',
    desc: '点線の周辺概念ノードを「マップに追加」で正式なノードに昇格できます。昇格すると保存されます。',
  },
  {
    icon: <Save size={15} />,
    title: '自動保存',
    desc: '本文・タイトル・ノードの追加や移動は自動的に保存されます。ヘッダーに「保存済み」と表示されます。',
  },
  {
    icon: <LayoutGrid size={15} />,
    title: 'マップ一覧',
    desc: 'ヘッダーの「マップ一覧」から保存済みマップを開けます。編集中のマップは一覧へ移動して戻っても保持されます。',
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
  flowPhase?: FlowPhase;
}

export const HelpTutorial: React.FC<Props> = ({ open, onClose, flowPhase }) => {
  // Esc で閉じる
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleClose = () => {
    markTutorialSeen();
    onClose();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 px-4 animate-fade-in"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="sticky top-0 flex items-center justify-between border-b border-surface-200 bg-white px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-700 text-white">
              <HelpCircle size={16} />
            </div>
            <h2 className="text-sm font-bold text-surface-700">使い方ガイド</h2>
          </div>
          <button
            onClick={handleClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-surface-400 transition-colors hover:bg-surface-100 hover:text-surface-600"
            aria-label="閉じる"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-5 px-5 py-4">
          {/* フロー */}
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-surface-400">
              作業の流れ
            </p>
            <div className="space-y-2">
              {PHASE_STEPS.map((s) => {
                const active = flowPhase === s.phase;
                return (
                  <div
                    key={s.phase}
                    className={[
                      'flex gap-3 rounded-xl border p-3 transition-colors',
                      active
                        ? 'border-primary-300 bg-primary-50'
                        : 'border-surface-200 bg-surface-50',
                    ].join(' ')}
                  >
                    <div
                      className={[
                        'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                        active ? 'bg-primary-600 text-white' : 'bg-white text-surface-500 border border-surface-200',
                      ].join(' ')}
                    >
                      {s.icon}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-surface-700">
                        {s.title}
                        {active && (
                          <span className="ml-2 rounded-full bg-primary-600 px-2 py-0.5 text-[10px] font-bold text-white">
                            現在
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-[12px] leading-relaxed text-surface-500">{s.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-surface-400">
              ※ ヘッダーの「次へ／戻る」でフェーズを進めたり戻したりできます。
            </p>
          </section>

          {/* 操作 */}
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-surface-400">
              主な操作
            </p>
            <div className="space-y-2">
              {OP_STEPS.map((s, i) => (
                <div key={i} className="flex gap-3 rounded-xl border border-surface-200 bg-white p-3">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-100 text-surface-500">
                    {s.icon}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-surface-700">{s.title}</p>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-surface-500">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* フッター */}
        <div className="sticky bottom-0 border-t border-surface-200 bg-white px-5 py-3 text-right">
          <button
            onClick={handleClose}
            className="rounded-lg bg-primary-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary-700"
          >
            はじめる
          </button>
        </div>
      </div>
    </div>
  );
};

export default HelpTutorial;