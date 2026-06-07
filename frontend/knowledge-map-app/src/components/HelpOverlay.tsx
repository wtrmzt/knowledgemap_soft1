/**
 * ヘルプオーバーレイ（FB5）
 *
 * チュートリアル（手順ガイドのモーダル）とは別機能。
 * 「ヘルプ」を押すと画面を薄暗くし、各領域（ヘッダー / 左の入力パネル / 中央のマップ）に
 * 説明カードを重ねて、それぞれの役割を一目で把握できるようにする。
 *
 * レイアウト前提（DashboardPage）:
 *   - ヘッダー高さ ≒ 52px（h-13）
 *   - 左サイドパネル幅 = 360px
 */
import React, { useEffect } from 'react';
import { X, PanelLeft, Network, LayoutPanelTop } from 'lucide-react';

const HEADER_H = 52;
const SIDEBAR_W = 360;

interface Region {
  key: string;
  icon: React.ReactNode;
  title: string;
  lines: string[];
  /** ハイライト枠の位置 */
  box: React.CSSProperties;
  /** 説明カードの位置 */
  card: React.CSSProperties;
}

const REGIONS: Region[] = [
  {
    key: 'header',
    icon: <LayoutPanelTop size={15} />,
    title: 'ヘッダー',
    lines: [
      'モード切替（振り返り／調べ物／アイデア）と学年を選びます。',
      '現在のフェーズが表示され、「戻る／次へ」で進めます。',
      'タイトル編集・保存状態・履歴・マップ一覧もここから。',
    ],
    box: { top: 2, left: 2, right: 2, height: HEADER_H - 4 },
    card: { top: HEADER_H + 10, left: '50%', transform: 'translateX(-50%)', width: 340 },
  },
  {
    key: 'panel',
    icon: <PanelLeft size={15} />,
    title: '入力パネル（左）',
    lines: [
      'メモを入力して「マップを生成」で知識マップを作成します。',
      '生成後は次に書く内容の提案や、キーワードからの手動ノード追加ができます。',
    ],
    box: { top: HEADER_H + 2, left: 2, width: SIDEBAR_W - 4, bottom: 2 },
    card: { top: HEADER_H + 80, left: 16, width: SIDEBAR_W - 40 },
  },
  {
    key: 'map',
    icon: <Network size={15} />,
    title: '知識マップ（中央）',
    lines: [
      'ノードを左クリックで詳細を表示、中ボタンドラッグで移動できます。',
      '「周辺概念を取得」で関連語を追加、「マップに追加」で正式ノードに昇格。',
      '科目接続フェーズでは、候補の「詳細を表示」で過去・未来の科目をつなげます。',
    ],
    box: { top: HEADER_H + 2, left: SIDEBAR_W + 2, right: 2, bottom: 2 },
    card: { top: HEADER_H + 24, left: SIDEBAR_W + 40, width: 360 },
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export const HelpOverlay: React.FC<Props> = ({ open, onClose }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9997] animate-fade-in" aria-modal="true" role="dialog">
      {/* 薄暗い背景（クリックで閉じる） */}
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />

      {/* 各領域のハイライト枠 */}
      {REGIONS.map((r) => (
        <div
          key={`box-${r.key}`}
          className="absolute rounded-xl border-2 border-primary-400 pointer-events-none"
          style={{ ...r.box, boxShadow: '0 0 0 9999px rgba(0,0,0,0)' }}
        />
      ))}

      {/* 説明カード */}
      {REGIONS.map((r) => (
        <div
          key={`card-${r.key}`}
          className="absolute rounded-xl bg-white shadow-2xl border border-surface-200 p-3.5"
          style={r.card}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-primary-600 text-white">
              {r.icon}
            </span>
            <span className="text-[13px] font-bold text-surface-700">{r.title}</span>
          </div>
          <ul className="space-y-1">
            {r.lines.map((l, i) => (
              <li key={i} className="text-[12px] leading-relaxed text-surface-500 flex gap-1.5">
                <span className="text-primary-400 mt-0.5">•</span>
                <span>{l}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {/* 閉じるボタン（右上固定） */}
      <button
        onClick={onClose}
        className="absolute top-3 right-3 z-10 flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-surface-600 shadow-lg hover:bg-surface-50 transition-colors"
      >
        <X size={14} /> ヘルプを閉じる
      </button>
    </div>
  );
};

export default HelpOverlay;