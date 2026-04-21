/**
 * カスタムノード（クリック応答性 最終版）
 *
 * ポップアップ制御:
 *   開く: 'node-clicked' イベント（自分のID一致時）
 *   閉じ: 'node-clicked' 別ノード / 'pane-clicked' / ×ボタン
 *   ※ document.addEventListener('click') は一切使わない（競合排除）
 */
import React, { memo, useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, type NodeProps, useStore } from 'reactflow';
import { CheckCircle2, Plus, X, Search, ExternalLink, BookOpen, ChevronRight } from 'lucide-react';
import type { MapNodeData } from '@/types';

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

const H = '!bg-primary-400 !border-white !border-2 !w-2 !h-2 !opacity-0';
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
  const downRef = useRef<{ x: number; y: number; t: number } | null>(null);
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

  // ===== ★ 自前クリック検知 =====
  // mousedown で座標+時刻を記録し、document レベルの mouseup で判定。
  // React Flow がポインターイベントを横取りしても mouseup は確実に届く。
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    downRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  }, []);

  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      const d = downRef.current;
      downRef.current = null;
      if (!d) return;

      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const elapsed = Date.now() - d.t;

      // 移動 8px 以内 かつ 500ms 以内 → クリックと判定
      if (dist < 8 && elapsed < 500) {
        document.dispatchEvent(
          new CustomEvent('node-clicked', { detail: { nodeId: id } })
        );
      }
    };
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [id]);

  // ===== ★ ノードクリック: 自分→開く、他→閉じる =====
  useEffect(() => {
    const handler = (e: Event) => {
      const clickedId = (e as CustomEvent).detail?.nodeId;
      if (clickedId === id) {
        setShowPopup((prev) => {
          if (!prev && nodeRef.current) {
            const rect = nodeRef.current.getBoundingClientRect();
            setPopupPos({ x: rect.left + rect.width / 2, y: rect.bottom + 8 });
          }
          return !prev;
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

  return (
    <>
      <div
        ref={nodeRef}
        onMouseDown={handleMouseDown}
        className={isSat || isRel ? 'node-float-slow node-appear' : 'node-float'}
        style={{
          '--float-delay': `${fp.delay}s`,
          '--float-duration': `${fp.duration}s`,
          '--appear-delay': isRel ? `${(hashStr(id) % 8) * 0.1}s` : '0s',
          minWidth: isSat ? 120 : isRel ? 140 : 140,
          maxWidth: isSat ? 180 : isRel ? 220 : 220,
          background: BG[status] ?? '#fff',
          border: isDashed ? `2px dashed ${border}` : `2px solid ${border}`,
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
            fontSize: isSat ? 11 : isRel ? 11 : 12,
            fontWeight: isSat ? 500 : 600,
            color: isRel ? relTextColor : isSat ? '#4263eb' : '#1a1d23',
            flex: 1,
          }}>
            {data.label}
          </span>
          {status === 'described' && <CheckCircle2 size={16} color="#40c057" />}
          {status === 'currently_writing' && (
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59f00', animation: 'pulse 1.5s ease-in-out infinite' }} />
          )}
          {isCandidate && <ChevronRight size={13} style={{ color: relColor, flexShrink: 0 }} />}
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
            <p style={{ fontSize: 11, color: '#718096', marginBottom: 10, lineHeight: 1.6 }}>
              この科目に関連する概念のマップを展開できます。
            </p>
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
            {isCandidate && (
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