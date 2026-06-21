/**
 * カスタムノード
 *
 * 操作モデル:
 *   左クリック  → ポップアップ表示/非表示（node-clicked イベント）
 *   中央クリック → ノードのドラッグ移動（node-middle-down イベント → KnowledgeMapDisplay が処理）
 *   React Flow の左クリックドラッグは nodesDraggable={false} で無効化済み
 */
import React, { memo, useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, type NodeProps, useStore } from 'reactflow';
import { CheckCircle2, Plus, X, Search, ExternalLink, BookOpen, ChevronRight, Info, Sparkles } from 'lucide-react';
import type { MapNodeData } from '@/types';
import { relationMeta } from '@/utils/relationMeta';

const BORDER: Record<string, string> = {
  currently_writing: '#f59f00', described: '#40c057',
  suggested: '#748ffc', satellite: '#bac8ff',
  relation_past: '#4299e1', relation_future: '#38b2ac',
  relation_past_candidate: '#63b3ed', relation_future_candidate: '#68d391',
  default: '#e2e6ea',
};
const GLOW: Record<string, string> = {
  currently_writing: '0 0 16px 4px rgba(245,159,0,.45),0 0 32px 8px rgba(245,159,0,.2)',
  suggested: '0 0 12px 3px rgba(116,143,252,.3)',
  relation_past: '0 0 10px 2px rgba(66,153,225,.2)',
  relation_future: '0 0 10px 2px rgba(56,178,172,.2)',
  relation_past_candidate: '0 0 8px 2px rgba(99,179,237,.25)',
  relation_future_candidate: '0 0 8px 2px rgba(104,211,145,.25)',
};
const BG: Record<string, string> = {
  currently_writing: '#fffbeb', described: '#f0fdf4', satellite: '#f0f4ff',
  relation_past: '#ebf8ff', relation_future: '#e6fffa',
  relation_past_candidate: '#ebf8ff', relation_future_candidate: '#e6fffa',
};

const H = '!bg-primary-500 !border-white !border-2 !w-3.5 !h-3.5 !opacity-0 group-hover:!opacity-100 !transition-opacity !cursor-crosshair !z-10';
const HANDLE_DEFS: { pos: Position; id: string; style: React.CSSProperties }[] = [
  { pos: Position.Top,    id: 'top',          style: { left: '50%' } },
  { pos: Position.Right,  id: 'top-right',    style: { top: '20%' } },
  { pos: Position.Right,  id: 'bottom-right', style: { top: '80%' } },
  { pos: Position.Bottom, id: 'bottom',       style: { left: '50%' } },
  { pos: Position.Left,   id: 'bottom-left',  style: { top: '80%' } },
  { pos: Position.Left,   id: 'top-left',     style: { top: '20%' } },
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function getFloatParams(id: string, data: MapNodeData) {
  const baseId = data.parentNodeId || data.relationOriginId || id;
  const bh = hashStr(baseId); const ch = hashStr(id);
  return { delay: (bh % 20) * 0.15 + (ch % 5) * 0.08, duration: 3.0 + (bh % 15) * 0.13 };
}

const CustomNode: React.FC<NodeProps<MapNodeData>> = ({ data, selected, id, xPos, yPos }) => {
  const [showPopup, setShowPopup] = useState(false);
  const nodeRef = useRef<HTMLDivElement>(null);
  const status = data.status || 'default';
  const isSat = data.isSatellite ?? false;
  const isRel = data.isRelation ?? false;
  const isCandidate = status === 'relation_past_candidate' || status === 'relation_future_candidate';
  const isRelExpanded = status === 'relation_past' || status === 'relation_future';
  const isPast = status.includes('past');
  const border = selected ? '#4263eb' : (BORDER[status] ?? BORDER.default);
  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(data.label)}`;

  const transform = useStore((s) => s.transform);
  const [popupPos, setPopupPos] = useState<{ x: number; y: number } | null>(null);
  const fp = getFloatParams(id, data);

  // ⓘ ボタン: 必ず開く(force)— 詳細への明示的な入口
  const handleInfoOpen = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    document.dispatchEvent(
      new CustomEvent('node-clicked', { detail: { nodeId: id, force: true } })
    );
  }, [id]);

  // ===== ★ クリック/ドラッグ判定 =====
  //   React Flow の onNodeClick は「ほぼ無移動」でないと発火せず、ドラッグ有効時に
  //   クリックが効かなくなる。そこで pointerdown→pointerup の移動量で自前判定する。
  //   - 小移動(<6px) かつ 短時間 → クリック（パネル開閉）
  //   - 大移動 → ドラッグ（React Flow が処理。ここでは何もしない）
  //   stopPropagation しないので React Flow のドラッグは妨げない。
  const pointerDownRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const isInteractive = (el: EventTarget | null) => {
    const node = el as HTMLElement | null;
    return !!node?.closest?.('button, a, input, textarea, .react-flow__handle');
  };
  const handleNodePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (isInteractive(e.target)) { pointerDownRef.current = null; return; }
    pointerDownRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  }, []);
  const handleNodePointerUp = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const d = pointerDownRef.current;
    pointerDownRef.current = null;
    if (!d || isInteractive(e.target)) return;
    const dist = Math.hypot(e.clientX - d.x, e.clientY - d.y);
    const dt = Date.now() - d.t;
    if (dist <= 6 && dt <= 600) {
      // クリックと判定 → パネルを開閉
      document.dispatchEvent(new CustomEvent('node-clicked', { detail: { nodeId: id } }));
    }
  }, [id]);

  // 周辺概念をこのノード単位でオンデマンド取得
  const handleFetchSurrounding = useCallback(() => {
    setShowPopup(false);
    document.dispatchEvent(
      new CustomEvent('node-fetch-surrounding', { detail: { nodeId: id } })
    );
  }, [id]);

  // ===== ★ 中央クリック → ドラッグ開始イベントを発火 =====
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 1) return;          // 中央ボタンのみ
    e.preventDefault();                   // ブラウザの自動スクロールを防止
    e.stopPropagation();
    document.dispatchEvent(
      new CustomEvent('node-middle-down', {
        detail: { nodeId: id, clientX: e.clientX, clientY: e.clientY, zoom: transform[2] },
      })
    );
  }, [id, transform]);

  // ===== ★ ノードクリック: 自分→toggle(force時は必ず開く)、他→閉じる =====
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const clickedId = detail?.nodeId;
      if (clickedId === id) {
        setShowPopup((prev) => {
          const next = detail?.force ? true : !prev;
          if (next && nodeRef.current) {
            const rect = nodeRef.current.getBoundingClientRect();
            setPopupPos({ x: rect.left + rect.width / 2, y: rect.bottom + 8 });
          }
          return next;
        });
      } else {
        setShowPopup(false);
      }
    };
    document.addEventListener('node-clicked', handler);
    return () => document.removeEventListener('node-clicked', handler);
  }, [id]);

  // ===== ★ キャンバス背景クリック → 閉じる =====
  useEffect(() => {
    const handler = () => setShowPopup(false);
    document.addEventListener('pane-clicked', handler);
    return () => document.removeEventListener('pane-clicked', handler);
  }, []);

  // ポップアップ位置更新（ズーム・パン時）
  useEffect(() => {
    if (!showPopup || !nodeRef.current) return;
    const rect = nodeRef.current.getBoundingClientRect();
    setPopupPos({ x: rect.left + rect.width / 2, y: rect.bottom + 8 });
  }, [showPopup, xPos, yPos, transform]);

  const handleAddToMap = useCallback(() => {
    setShowPopup(false);
    document.dispatchEvent(new CustomEvent('satellite-add-to-map', { detail: { nodeId: id } }));
  }, [id]);

  const handleExpandRelation = useCallback(() => {
    setShowPopup(false);
    document.dispatchEvent(new CustomEvent('relation-expand', { detail: { nodeId: id } }));
  }, [id]);

  const isDashed = isSat || isRel;
  const relColor = isPast ? '#4299e1' : '#38b2ac';
  const relTextColor = isPast ? '#2b6cb0' : '#276749';
  const relLightColor = isPast ? '#63b3ed' : '#68d391';
  const relBgTag = isPast ? '#bee3f8' : '#b2f5ea';
  const dirLabel = isPast ? '過去' : '未来';

  // ===== ★ FB2: 展開済み関連ノードは「根（科目名）」に近いほど大きく・色濃く =====
  //   data.relationDepth が変換で落ちても relationMeta から復元する。
  const relDepth = typeof data.relationDepth === 'number'
    ? data.relationDepth
    : (relationMeta.getDepth(id) ?? 0);
  const depthClamp = Math.max(0, Math.min(relDepth, 4)); // 0..4
  // 根(0)で最大、深くなるほど縮小（差を大きく付ける）: 1.5 → 0.6
  const relScale = isRelExpanded ? Math.max(0.6, 1.5 - depthClamp * 0.22) : 1;
  // 根に近いほど濃い → 遠いほど淡い
  const relPalette = isPast
    ? ['#2b6cb0', '#3182ce', '#4299e1', '#63b3ed', '#90cdf4']
    : ['#276749', '#2f855a', '#38a169', '#48bb78', '#9ae6b4'];
  const relBgPalette = isPast
    ? ['#bee3f8', '#cfe8fb', '#e0f0fb', '#ebf8ff', '#f5fbff']
    : ['#b2f5ea', '#c6f6e6', '#d6f9ec', '#e6fffa', '#f0fff9'];
  const relDepthBorder = relPalette[depthClamp];
  const relDepthBg = relBgPalette[depthClamp];

  // ★ FB1: 候補ノードが展開時に接続する概念のプレビュー（変換で落ちても復元）
  const previewList: string[] =
    (Array.isArray(data.relationPreview) && data.relationPreview.length > 0)
      ? (data.relationPreview as string[])
      : (relationMeta.getPreview(id) || []);

  // ★ 管理者機能D: 関連科目 Lv2 は「科目名のみ」。部分木の展開は不可。
  const relTextOnly = isCandidate && data.relationLevel === 2;

  return (
    <>
      <div
        ref={nodeRef}
        onPointerDown={handleNodePointerDown}
        onPointerUp={handleNodePointerUp}
        onMouseDown={handleMouseDown}
        className={'node-appear group'}
        style={{
          '--float-delay': `${fp.delay}s`,
          '--float-duration': `${fp.duration}s`,
          '--appear-delay': isRel ? `${(hashStr(id) % 8) * 0.1}s` : '0s',
          minWidth: isSat ? 120 : isRelExpanded ? Math.round(150 * relScale) : isRel ? 140 : 140,
          maxWidth: isSat ? 180 : isRelExpanded ? Math.round(260 * relScale) : isRel ? 220 : 220,
          background: isRelExpanded ? relDepthBg : (BG[status] ?? '#fff'),
          border: isRelExpanded
            ? `2px dashed ${relDepthBorder}`
            : (isDashed ? `2px dashed ${border}` : `2px solid ${border}`),
          borderRadius: isDashed ? 20 : 14,
          cursor: 'pointer',
          boxShadow: GLOW[status] ?? '0 1px 4px rgba(0,0,0,.06)',
          transition: 'border-color .3s ease, box-shadow .3s ease',
          opacity: isSat ? 0.85 : isCandidate ? 0.9 : isRelExpanded ? 0.92 : 1,
        } as React.CSSProperties}
      >
        {HANDLE_DEFS.map((h) => (
          <React.Fragment key={h.id}>
            <Handle type="source" position={h.pos} id={`s-${h.id}`} className={H} style={h.style} />
            <Handle type="target" position={h.pos} id={`t-${h.id}`} className={H} style={h.style} />
          </React.Fragment>
        ))}

        {(isCandidate || isRelExpanded) && (
          <div style={{ padding: '3px 10px 0', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{
              fontSize: 9, fontWeight: 700, color: relTextColor,
              background: relBgTag, borderRadius: 4,
              padding: '1px 6px', lineHeight: '16px',
            }}>
              {dirLabel}
            </span>
            {isRelExpanded && data.group && (
              <span style={{ fontSize: 9, color: relLightColor, fontWeight: 500 }}>{data.group}</span>
            )}
          </div>
        )}

        <div style={{
          padding: isSat ? '6px 10px' : isRel ? '5px 10px 7px' : '8px 12px',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          {isSat && <Plus size={12} style={{ color: '#748ffc', flexShrink: 0 }} />}
          {isRel && <BookOpen size={12} style={{ color: relColor, flexShrink: 0 }} />}
          <span style={{
            fontSize: isSat ? 11 : isRelExpanded ? Math.max(9, Math.round(15 * relScale)) : isRel ? 11 : 12,
            fontWeight: isSat ? 500 : isRelExpanded ? 700 : 600,
            color: isRelExpanded ? relDepthBorder : isRel ? relTextColor : isSat ? '#4263eb' : '#1a1d23',
            flex: 1,
          }}>
            {data.label}
          </span>
          {status === 'described' && <CheckCircle2 size={16} color="#40c057" />}
          {status === 'currently_writing' && (
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59f00', animation: 'pulse 1.5s ease-in-out infinite' }} />
          )}
          {isCandidate && <ChevronRight size={13} style={{ color: relColor, flexShrink: 0 }} />}
          {!isCandidate && (
            <button
              onPointerDown={handleInfoOpen}
              title="詳細を表示"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 18, height: 18, flexShrink: 0, marginLeft: 2, padding: 0,
                border: 'none', background: 'transparent', cursor: 'pointer',
                color: '#adb5bd', borderRadius: 4, transition: 'color .15s, background .15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#4263eb'; e.currentTarget.style.background = '#f0f4ff'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#adb5bd'; e.currentTarget.style.background = 'transparent'; }}
            >
              <Info size={13} />
            </button>
          )}
        </div>

        {isCandidate && data.sentence && (
          <div style={{ padding: '0 10px 6px', fontSize: 9, color: relLightColor, fontWeight: 500 }}>
            {data.sentence}
          </div>
        )}
      </div>

      {showPopup && popupPos && createPortal(
        <div
          className="node-popup-portal"
          style={{
            position: 'fixed', left: popupPos.x, top: popupPos.y,
            transform: 'translateX(-50%)', width: 280,
            background: '#fff', borderRadius: 14,
            border: '1px solid #dee2e6',
            boxShadow: '0 12px 48px rgba(0,0,0,0.2)',
            zIndex: 9999, padding: '14px 16px',
            animation: 'popupFadeIn 0.15s ease-out',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => setShowPopup(false)}
            style={{
              position: 'absolute', top: 8, right: 8, width: 28, height: 28,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: '1px solid transparent', borderRadius: 6,
              cursor: 'pointer', color: '#868e96',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f3f5'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
          >
            <X size={14} />
          </button>

          <p style={{ fontSize: 14, fontWeight: 700, color: '#1a1d23', marginBottom: 6, paddingRight: 28 }}>
            {data.label}
          </p>

          {(isCandidate || isRelExpanded) && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{
                fontSize: 11, fontWeight: 700, color: '#fff',
                background: relColor, borderRadius: 6, padding: '2px 8px',
              }}>
                {isPast ? '📘 過去（基礎）' : '📗 未来（発展）'}
              </span>
              {data.group && isRelExpanded && (
                <span style={{ fontSize: 11, color: relLightColor, fontWeight: 500 }}>{data.group}</span>
              )}
            </div>
          )}

          {isCandidate && (
            relTextOnly ? (
              <p style={{ fontSize: 11, color: '#495057', marginBottom: 10, lineHeight: 1.7 }}>
                この知識は「<strong style={{ color: relTextColor }}>{data.label}</strong>」という科目に関連しています。
              </p>
            ) : (
              <>
                <p style={{ fontSize: 11, color: '#718096', marginBottom: 8, lineHeight: 1.6 }}>
                  「詳細を表示」で、以下の概念がこのマップに接続されます。
                </p>
                {previewList.length > 0 ? (
                  <div style={{
                    marginBottom: 10, padding: '8px 10px', borderRadius: 8,
                    background: isPast ? '#ebf8ff' : '#e6fffa',
                    border: `1px solid ${relLightColor}`,
                  }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: relTextColor, marginBottom: 5 }}>
                      接続される概念（{previewList.length}件）
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {previewList.map((p, i) => (
                        <span key={i} style={{
                          fontSize: 10, fontWeight: 500, color: relTextColor,
                          background: '#fff', borderRadius: 6, padding: '2px 7px',
                          border: `1px solid ${relLightColor}`,
                        }}>
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p style={{ fontSize: 10, color: '#a0aec0', marginBottom: 10 }}>
                    接続される概念のプレビューはありません。
                  </p>
                )}
              </>
            )
          )}

          {data.sentence && !isCandidate && (
            <p style={{ fontSize: 12, lineHeight: 1.7, color: '#495057', marginBottom: 10 }}>{data.sentence}</p>
          )}
          {data.extend_query && (
            <p style={{ fontSize: 11, color: '#748ffc', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
              <ExternalLink size={11} />{data.extend_query}
            </p>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {isCandidate && !relTextOnly && (
              <button
                onClick={handleExpandRelation}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  fontSize: 12, fontWeight: 600, color: '#fff',
                  padding: '8px 16px', borderRadius: 8,
                  background: relColor, border: 'none', cursor: 'pointer',
                  transition: 'filter .15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(1.1)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.filter = 'none'; }}
              >
                <BookOpen size={13} /> 詳細を表示
              </button>
            )}

            <a href={googleUrl} target="_blank" rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: 12, fontWeight: 500, color: '#4263eb', textDecoration: 'none',
                padding: '7px 14px', borderRadius: 8,
                background: '#f0f4ff', border: '1px solid #dbe4ff', cursor: 'pointer',
              }}
            >
              <Search size={13} /> Googleで検索
            </a>

            {/* ★ 任意のノードから周辺概念を追加取得(衛星・候補ノードを除く)。
                衛星は「マップに追加」で昇格後に取得可能 → 再帰的な探索ができる */}
            {!isSat && !isCandidate && (
              <button onClick={handleFetchSurrounding}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  fontSize: 12, fontWeight: 600, color: '#fff',
                  padding: '7px 14px', borderRadius: 8,
                  background: '#7048e8', border: 'none', cursor: 'pointer',
                  transition: 'filter .15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(1.1)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.filter = 'none'; }}
              >
                <Sparkles size={13} /> 周辺概念を取得
              </button>
            )}

            {isSat && (
              <button onClick={handleAddToMap}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  fontSize: 12, fontWeight: 600, color: '#fff',
                  padding: '7px 14px', borderRadius: 8,
                  background: '#4263eb', border: 'none', cursor: 'pointer',
                }}
              >
                <Plus size={13} /> マップに追加
              </button>
            )}
          </div>
        </div>,
        document.body,
      )}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(1.3)} }
        .node-float:hover, .node-float-slow:hover { animation-play-state: paused !important; }
      `}</style>
    </>
  );
};

export default memo(CustomNode);