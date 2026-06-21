/**
 * ExplainEdge.tsx（機能2: エッジの説明機能）
 *
 * アイコン＋ポップアップは React Flow のレイヤー（edgelabel-renderer）に依存すると、
 * ノード層の下に潜ってクリックを受け取れないことがある。そこで本実装では
 * エッジ中央の「スクリーン座標」を算出し、document.body 直下の固定オーバーレイとして
 * 最前面に描画する（層の重なりの影響を受けず、確実にクリックできる）。
 *
 * - クリック時のみ AI に説明を生成させる（ホバーでは何もしない）。
 * - 取得済み（DBキャッシュ含む）はそのまま表示。
 * - 介入度: Lv1 アイコン非表示 / Lv2 単語のみ / Lv3 説明文。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BaseEdge, getBezierPath, useStore, type EdgeProps } from 'reactflow';

interface ExplainEdgeData {
  explLevel?: number; // 1: OFF / 2: 単語 / 3: 説明文
  sourceLabel?: string;
  targetLabel?: string;
  fetchExplanation?: (
    source: string, target: string,
  ) => Promise<{ word: string; sentence: string; disabled?: boolean }>;
}

const ExplainEdge: React.FC<EdgeProps<ExplainEdgeData>> = (props) => {
  const {
    id, sourceX, sourceY, targetX, targetY,
    sourcePosition, targetPosition, markerEnd, style, data,
  } = props;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition,
  });

  const level = data?.explLevel ?? 3;
  const showIcon = level >= 2;

  // ビューポート変換とコンテナ位置からエッジ中央のスクリーン座標を算出
  const transform = useStore((s) => s.transform);     // [tx, ty, zoom]
  const domNode = useStore((s) => s.domNode);          // React Flow ラッパー要素
  const rect = domNode?.getBoundingClientRect();
  const zoom = transform[2];
  const screenX = (rect?.left ?? 0) + transform[0] + labelX * zoom;
  const screenY = (rect?.top ?? 0) + transform[1] + labelY * zoom;

  const popupRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ word: string; sentence: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (loading || result) return;
    if (!data?.fetchExplanation || !data.sourceLabel || !data.targetLabel) {
      setError('説明に必要な情報がありません');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await data.fetchExplanation(data.sourceLabel, data.targetLabel);
      if (r?.disabled) setError('この機能は現在オフです');
      else setResult({ word: r?.word || '', sentence: r?.sentence || '' });
    } catch {
      setError('説明を取得できませんでした');
    } finally {
      setLoading(false);
    }
  }, [data, loading, result]);

  const toggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (open) { setOpen(false); return; }
    setOpen(true);
    load();
  }, [open, load]);

  // 開いている間: 外側クリック / Esc で閉じる
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popupRef.current?.contains(t) || iconRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const bodyText = level >= 3
    ? (result?.sentence || result?.word || '')
    : (result?.word || '');

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      {showIcon && createPortal(
        <div
          style={{
            position: 'fixed',
            left: screenX,
            top: screenY,
            transform: 'translate(-50%, -50%)',
            zIndex: 9000,
            pointerEvents: 'auto',
          }}
        >
          {/* ◆ ひし形アイコン */}
          <div
            ref={iconRef}
            onMouseDown={toggle}
            title="クリックで関係の説明を表示"
            style={{ padding: 7, cursor: 'pointer' }}
          >
            <div
              style={{
                width: 18, height: 18,
                transform: 'rotate(45deg)',
                background: open ? '#6d28d9' : '#fff',
                border: `2px solid ${open ? '#6d28d9' : '#8b5cf6'}`,
                borderRadius: 4,
                boxShadow: '0 1px 4px rgba(76,29,149,0.30)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <span style={{
                transform: 'rotate(-45deg)', fontSize: 10, lineHeight: 1, fontWeight: 800,
                color: open ? '#fff' : '#7c3aed',
              }}>i</span>
            </div>
          </div>

          {/* 吹き出し */}
          {open && (
            <div
              ref={popupRef}
              style={{
                position: 'absolute',
                left: '50%',
                bottom: 'calc(100% + 4px)',
                transform: 'translateX(-50%)',
                width: 240,
                background: '#fff',
                border: '1px solid #e9e3fb',
                borderRadius: 12,
                boxShadow: '0 12px 32px rgba(76,29,149,0.22)',
                padding: '12px 14px',
                fontSize: 12.5,
                color: '#3f3d56',
                lineHeight: 1.7,
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, color: '#7c3aed', letterSpacing: 0.3 }}>関係の説明</span>
                <button
                  onMouseDown={(e) => { e.stopPropagation(); setOpen(false); }}
                  style={{ fontSize: 12, color: '#a0aec0', cursor: 'pointer', background: 'none', border: 'none', lineHeight: 1 }}
                  aria-label="閉じる"
                >✕</button>
              </div>
              {loading && <span style={{ color: '#9f7aea' }}>AIが説明を生成しています…</span>}
              {!loading && error && <span style={{ color: '#e53e3e' }}>{error}</span>}
              {!loading && !error && (
                bodyText ? <span>{bodyText}</span> : <span style={{ color: '#a0aec0' }}>説明はありません</span>
              )}
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
};

export default ExplainEdge;