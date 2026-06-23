/**
 * ヘルプオーバーレイ（FB5）
 *
 * チュートリアル（手順ガイドのモーダル）とは別機能。
 * 「ヘルプ」を押すと画面を薄暗くし、各エリアを1つずつスポットライト表示する。
 *
 * 3カテゴリ構成（順送り）:
 *   1. ヘッダー   : プロジェクト名 / ダッシュボード移動 / 学年
 *   2. 左パネル   : 振り返りの入力 / 過去・未来の科目とのつながり
 *   3. 中央マップ : マップ表示エリア / マップの操作・拡張
 *
 * カテゴリ内の項目は短い箇条書き（ラベル＋一言）にして、1カードで
 * カテゴリ全体を一望できるようにしている。同時表示は1カテゴリのみなので
 * カードどうしの重なりは発生しない。
 *
 * レイアウト前提（DashboardPage）:
 *   - ヘッダー高さ ≒ 52px（h-13）
 *   - 左サイドパネル幅 = 360px
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  LayoutPanelTop,
  PanelLeft,
  Network,
} from 'lucide-react';

const HEADER_H = 52;
const SIDEBAR_W = 360;
const CARD_WIDTH = 340;
const CARD_MARGIN = 16;

interface Item {
  label: string;
  desc: string;
}

interface Step {
  key: string;
  icon: React.ReactNode;
  title: string;
  items: Item[];
  /** ハイライト枠の位置 */
  box: React.CSSProperties;
}

const STEPS: Step[] = [
  {
    key: 'header',
    icon: <LayoutPanelTop size={15} />,
    title: 'ヘッダー',
    items: [
      { label: 'プロジェクト名', desc: '振り返りの名前を編集' },
      { label: 'ダッシュボード', desc: 'トップ画面に戻る' },
      { label: '学年', desc: '科目接続の基礎／発展判定に使用' },
    ],
    box: { top: 2, left: 2, right: 2, height: HEADER_H - 4 },
  },
  {
    key: 'panel',
    icon: <PanelLeft size={15} />,
    title: '入力パネル（左）',
    items: [
      { label: '振り返りの入力', desc: '書いて「マップを生成」' },
      { label: '過去・未来の科目とのつながり', desc: 'つながる科目をメモ' },
    ],
    box: { top: HEADER_H + 2, left: 2, width: SIDEBAR_W - 4, bottom: 2 },
  },
  {
    key: 'map',
    icon: <Network size={15} />,
    title: '知識マップ（中央）',
    items: [
      { label: '表示エリア', desc: '＋／−でズーム、左下のミニマップで全体確認' },
      { label: 'ノード操作', desc: '左クリックで詳細、ドラッグで移動' },
      { label: '周辺概念で拡張', desc: '点線の＋→候補を選んで「マップに追加」' },
      { label: '科目接続', desc: '候補の「詳細を表示」で過去／未来の科目をつなげる' },
    ],
    box: { top: HEADER_H + 2, left: SIDEBAR_W + 2, right: 2, bottom: 2 },
  },
];

/** カード位置をカテゴリごとに決定（ハイライト枠を極力隠さない位置） */
function getCardStyle(stepKey: string, viewportW: number): React.CSSProperties {
  const width = Math.min(CARD_WIDTH, Math.max(260, viewportW - CARD_MARGIN * 2));

  if (stepKey === 'header') {
    return { top: HEADER_H + 14, left: '50%', transform: 'translateX(-50%)', width };
  }

  if (stepKey === 'panel') {
    const fitsBeside = viewportW >= SIDEBAR_W + width + CARD_MARGIN * 2;
    if (fitsBeside) return { top: HEADER_H + CARD_MARGIN, left: SIDEBAR_W + CARD_MARGIN, width };
    return { top: HEADER_H + CARD_MARGIN, left: CARD_MARGIN, width };
  }

  // map: 右端に寄せる
  const left = Math.max(SIDEBAR_W + CARD_MARGIN, viewportW - width - CARD_MARGIN);
  return { top: HEADER_H + CARD_MARGIN, left, width };
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export const HelpOverlay: React.FC<Props> = ({ open, onClose }) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [viewportW, setViewportW] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1280
  );

  useEffect(() => {
    if (open) setStepIndex(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => setViewportW(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
      if (e.key === 'ArrowLeft') setStepIndex((i) => Math.max(i - 1, 0));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const step = STEPS[stepIndex];
  const cardStyle = useMemo(() => getCardStyle(step.key, viewportW), [step.key, viewportW]);
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9997] animate-fade-in" aria-modal="true" role="dialog">
      {/* クリックで閉じる背面レイヤー（見た目は透明。暗さは下のスポットライト枠が担う） */}
      <div className="absolute inset-0" onClick={onClose} />

      {/*
        スポットライト枠（1つだけ表示）。
        box-shadow の spread を画面より十分大きい値（9999px）にすることで、
        枠の「外側」だけを暗く塗り、枠の内側（説明対象エリア）はそのまま明るく見せる。
        枠線自体は primary カラーのまま視認性を保つ。
      */}
      <div
        key={`box-${step.key}`}
        className="absolute rounded-xl border-2 border-primary-400 pointer-events-none transition-all duration-200"
        style={{ ...step.box, boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)' }}
      />

      {/* 説明カード（1つだけ） */}
      <div
        key={`card-${step.key}`}
        className="absolute rounded-xl bg-white shadow-2xl border border-surface-200 p-3.5"
        style={cardStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary-600 text-white shrink-0">
            {step.icon}
          </span>
          <span className="text-[13px] font-bold text-surface-700">{step.title}</span>
          <span className="ml-auto text-[11px] text-surface-400">
            {stepIndex + 1}/{STEPS.length}
          </span>
        </div>

        <ul className="space-y-1.5 mb-3">
          {step.items.map((item, i) => (
            <li key={i} className="text-[12px] leading-relaxed text-surface-500 flex gap-1.5">
              <span className="text-primary-400 mt-0.5 shrink-0">•</span>
              <span>
                <span className="font-semibold text-surface-600">{item.label}</span>
                {' — '}
                {item.desc}
              </span>
            </li>
          ))}
        </ul>

        {/* ナビゲーション（前へ / 進捗ドット / 次へ） */}
        <div className="flex items-center justify-between pt-2.5 border-t border-surface-100">
          <button
            onClick={() => setStepIndex((i) => Math.max(i - 1, 0))}
            disabled={isFirst}
            className="flex items-center gap-0.5 text-xs font-medium text-surface-500 hover:text-surface-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={14} /> 前へ
          </button>

          <div className="flex items-center gap-1.5">
            {STEPS.map((s, i) => (
              <button
                key={s.key}
                onClick={() => setStepIndex(i)}
                aria-label={`${s.title} を表示`}
                className={[
                  'w-1.5 h-1.5 rounded-full transition-colors',
                  i === stepIndex ? 'bg-primary-600' : 'bg-surface-200 hover:bg-surface-300',
                ].join(' ')}
              />
            ))}
          </div>

          {isLast ? (
            <button
              onClick={onClose}
              className="text-xs font-semibold text-primary-600 hover:text-primary-700 transition-colors"
            >
              完了
            </button>
          ) : (
            <button
              onClick={() => setStepIndex((i) => Math.min(i + 1, STEPS.length - 1))}
              className="flex items-center gap-0.5 text-xs font-medium text-surface-500 hover:text-surface-700 transition-colors"
            >
              次へ <ChevronRight size={14} />
            </button>
          )}
        </div>
      </div>

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