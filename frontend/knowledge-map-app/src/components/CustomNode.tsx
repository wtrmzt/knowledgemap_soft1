/**
 * カスタムノード（Phase 3 v4）
 *
 * 修正:
 * - ★ ポップアップ: mouseDown/mouseUp 方式を廃止
 *   → React Flow の `dragging` プロップで判定する方式に変更
 *   → dragging が true になったフレームを記録し、
 *     onClick 時に「直前までドラッグ中だったか」で判別
 * - ハンドルは Fragment ルート直下（前回の修正を維持）
 * - cursor: grab / grabbing
 *
 * 既存機能維持:
 * - 浮遊アニメーション・関連科目ノード・Portal ポップアップ・satellite
 */
import React, { memo, useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, type NodeProps, useStore } from 'reactflow';
import { CheckCircle2, Plus, X, Search, ExternalLink, BookOpen } from 'lucide-react';
import type { MapNodeData } from '@/types';

// ===== スタイル定数 =====

const BORDER: Record<string, string> = {
  currently_writing: '#f59f00', described: '#40c057',
  suggested: '#748ffc', satellite: '#bac8ff',
  relation_past: '#4299e1', relation_future: '#38b2ac',
  default: '#e2e6ea',
};
const GLOW: Record<string, string> = {
  currently_writing: '0 0 16px 4px rgba(245,159,0,.45),0 0 32px 8px rgba(245,159,0,.2)',
  suggested: '0 0 12px 3px rgba(116,143,252,.3)',
  relation_past: '0 0 10px 2px rgba(66,153,225,.2)',
  relation_future: '0 0 10px 2px rgba(56,178,172,.2)',
};
const BG: Record<string, string> = {
  currently_writing: '#fffbeb', described: '#f0fdf4', satellite: '#f0f4ff',
  relation_past: '#ebf8ff', relation_future: '#e6fffa',
};

const H_STYLE = '!w-[3px] !h-[3px] !bg-transparent !border-none !min-w-0 !min-h-0';

const HANDLE_DEFS: { pos: Position; id: string; style: React.CSSProperties }[] = [
  { pos: Position.Top,    id: 'top',          style: { left: '50%' } },
  { pos: Position.Right,  id: 'top-right',    style: { top: '20%' } },
  { pos: Position.Right,  id: 'bottom-right', style: { top: '80%' } },
  { pos: Position.Bottom, id: 'bottom',       style: { left: '50%' } },
  { pos: Position.Left,   id: 'bottom-left',  style: { top: '80%' } },
  { pos: Position.Left,   id: 'top-left',     style: { top: '20%' } },
];

// ===== 浮遊アニメーション =====

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function getFloatParams(id: string, data: MapNodeData) {
  const baseId = data.parentNodeId || data.relationOriginId || id;
  const baseHash = hashStr(baseId);
  const childHash = hashStr(id);
  return {
    delay: (baseHash % 20) * 0.15 + (childHash % 5) * 0.08,
    duration: 3.0 + (baseHash % 15) * 0.13,
  };
}

// ===== メインコンポーネント =====

const CustomNode: React.FC<NodeProps<MapNodeData>> = ({ data, selected, id, xPos, yPos, dragging }) => {
  const [showPopup, setShowPopup] = useState(false);
  const nodeRef = useRef<HTMLDivElement>(null);
  const status = data.status || 'default';
  const isSat = data.isSatellite ?? false;
  const isRel = data.isRelation ?? false;
  const border = selected ? '#4263eb' : (BORDER[status] ?? BORDER.default);
  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(data.label)}`;

  const transform = useStore((s) => s.transform);
  const [popupPos, setPopupPos] = useState<{ x: number; y: number } | null>(null);
  const floatParams = getFloatParams(id, data);

  // ポップアップ位置
  useEffect(() => {
    if (!showPopup || !nodeRef.current) { setPopupPos(null); return; }
    const rect = nodeRef.current.getBoundingClientRect();
    setPopupPos({ x: rect.left + rect.width / 2, y: rect.bottom + 8 });
  }, [showPopup, xPos, yPos, transform]);

  // ★★★ ドラッグ/クリック判別 ★★★
  // dragging が true になったらフラグを立て、
  // 次の onClick で「ドラッグ直後なのでポップアップを出さない」と判定
  const wasDragging = useRef(false);

  useEffect(() => {
    if (dragging) {
      wasDragging.current = true;
      // ドラッグ中はポップアップを閉じる
      setShowPopup(false);
    }
  }, [dragging]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    // ドラッグ直後のクリックは無視
    if (wasDragging.current) {
      wasDragging.current = false;
      return;
    }
    e.stopPropagation();
    setShowPopup((v) => !v);
  }, []);

  // 背景クリックでポップアップ閉じる
  useEffect(() => {
    if (!showPopup) return;
    const close = () => setShowPopup(false);
    const timer = setTimeout(() => document.addEventListener('click', close, { once: true }), 50);
    return () => { clearTimeout(timer); document.removeEventListener('click', close); };
  }, [showPopup]);

  const handleAddToMap = useCallback(() => {
    setShowPopup(false);
    document.dispatchEvent(new CustomEvent('satellite-add-to-map', { detail: { nodeId: id } }));
  }, [id]);

  // ===== ノードスタイル =====
  const isDashed = isSat || isRel;
  const nodeMinW = isSat ? 120 : isRel ? 130 : 140;
  const nodeMaxW = isSat ? 180 : isRel ? 200 : 220;
  const nodePad = isSat ? '6px 10px' : isRel ? '7px 11px' : '8px 12px';
  const nodeRadius = isDashed ? 20 : 14;
  const nodeOpacity = isSat ? 0.85 : isRel ? 0.9 : 1;
  const relIconColor = status === 'relation_past' ? '#4299e1' : '#38b2ac';
  const cursor = dragging ? 'grabbing' : 'grab';

  return (
    <>
      {/* ハンドル（Fragment ルート直下） */}
      {HANDLE_DEFS.map((h) => (
        <React.Fragment key={h.id}>
          <Handle type="source" position={h.pos} id={`s-${h.id}`}
            className={H_STYLE} style={h.style} />
          <Handle type="target" position={h.pos} id={`t-${h.id}`}
            className={H_STYLE} style={h.style} />
        </React.Fragment>
      ))}

      {/* ノード本体 */}
      <div
        ref={nodeRef}
        onClick={handleClick}
        className={isSat || isRel ? 'node-float-slow node-appear' : 'node-float'}
        style={{
          '--float-delay': `${floatParams.delay}s`,
          '--float-duration': `${floatParams.duration}s`,
          '--appear-delay': isRel ? `${(hashStr(id) % 8) * 0.1}s` : '0s',
          minWidth: nodeMinW, maxWidth: nodeMaxW,
          background: BG[status] ?? '#fff',
          border: isDashed ? `2px dashed ${border}` : `2px solid ${border}`,
          borderRadius: nodeRadius, cursor,
          boxShadow: GLOW[status] ?? '0 1px 4px rgba(0,0,0,.06)',
          transition: dragging ? 'none' : 'border-color .3s ease, box-shadow .3s ease, opacity .3s ease',
          opacity: nodeOpacity,
        } as React.CSSProperties}
      >
        <div style={{ padding: nodePad, display: 'flex', alignItems: 'center', gap: 6 }}>
          {isSat && <Plus size={12} style={{ color: '#748ffc', flexShrink: 0 }} />}
          {isRel && <BookOpen size={12} style={{ color: relIconColor, flexShrink: 0 }} />}

          <span style={{
            fontSize: isSat ? 11 : isRel ? 11 : 12,
            fontWeight: isSat ? 500 : isRel ? 600 : 600,
            color: isRel ? (status === 'relation_past' ? '#2b6cb0' : '#276749') : isSat ? '#4263eb' : '#1a1d23',
            flex: 1, userSelect: 'none',
          }}>
            {data.label}
          </span>

          {status === 'described' && <CheckCircle2 size={16} color="#40c057" />}
          {status === 'currently_writing' && (
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59f00', animation: 'pulse 1.5s ease-in-out infinite' }} />
          )}
        </div>

        {isRel && data.group && (
          <div style={{ padding: '0 11px 5px', fontSize: 9, color: status === 'relation_past' ? '#63b3ed' : '#68d391', fontWeight: 500 }}>
            {data.group}
          </div>
        )}
      </div>

      {/* ポップアップ（Portal） */}
      {showPopup && popupPos && createPortal(
        <div className="node-popup-portal" style={{
          position: 'fixed', left: popupPos.x, top: popupPos.y,
          transform: 'translateX(-50%)', width: 280,
          background: '#fff', borderRadius: 14, border: '1px solid #dee2e6',
          boxShadow: '0 12px 48px rgba(0,0,0,0.2)', zIndex: 9999,
          padding: '14px 16px', animation: 'popupFadeIn 0.15s ease-out',
        }} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => setShowPopup(false)} style={{
            position: 'absolute', top: 8, right: 8, width: 28, height: 28,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: '1px solid transparent', borderRadius: 6,
            cursor: 'pointer', color: '#868e96',
          }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f3f5'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
          ><X size={14} /></button>

          <p style={{ fontSize: 14, fontWeight: 700, color: '#1a1d23', marginBottom: 8, paddingRight: 28 }}>{data.label}</p>

          {isRel && (
            <p style={{ fontSize: 10, fontWeight: 600, marginBottom: 6, color: status === 'relation_past' ? '#4299e1' : '#38b2ac' }}>
              {status === 'relation_past' ? '基礎（過去）の関連概念' : '発展（未来）の関連概念'}
              {data.group && ` — ${data.group}`}
            </p>
          )}

          {data.sentence && <p style={{ fontSize: 12, lineHeight: 1.7, color: '#495057', marginBottom: 10 }}>{data.sentence}</p>}
          {data.extend_query && (
            <p style={{ fontSize: 11, color: '#748ffc', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
              <ExternalLink size={11} />{data.extend_query}
            </p>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a href={googleUrl} target="_blank" rel="noopener noreferrer" style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 12, fontWeight: 500, color: '#4263eb', textDecoration: 'none',
              padding: '7px 14px', borderRadius: 8,
              background: '#f0f4ff', border: '1px solid #dbe4ff', cursor: 'pointer',
            }}><Search size={13} /> Googleで検索</a>
            {isSat && (
              <button onClick={handleAddToMap} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: 12, fontWeight: 600, color: '#fff',
                padding: '7px 14px', borderRadius: 8,
                background: '#4263eb', border: 'none', cursor: 'pointer',
              }}><Plus size={13} /> マップに追加</button>
            )}
          </div>
        </div>,
        document.body,
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(1.3)} }`}</style>
    </>
  );
};

export default memo(CustomNode);