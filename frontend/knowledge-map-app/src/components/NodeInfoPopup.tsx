/**
 * ノード情報ポップアップ
 * 説明文 + 拡張概念 + Google検索リンク
 *
 * 修正: React Flow がマウスイベントを横取りする問題を
 *       onMouseDown の stopPropagation で解消。
 *       ×ボタンのクリック領域を拡大。
 */
import React, { useCallback } from 'react';
import { X, Search, ExternalLink } from 'lucide-react';

interface NodeInfoPopupProps {
  label: string;
  sentence?: string;
  extendQuery?: string;
  onClose: () => void;
}

export const NodeInfoPopup: React.FC<NodeInfoPopupProps> = ({
  label, sentence, extendQuery, onClose,
}) => {
  const url = `https://www.google.com/search?q=${encodeURIComponent(label)}`;

  // React Flow のドラッグ・選択イベントを完全にブロック
  const stopAll = useCallback((e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
  }, []);

  const handleClose = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onClose();
  }, [onClose]);

  return (
    <div
      style={{
        position: 'absolute', top: '100%', left: '50%',
        transform: 'translateX(-50%)', marginTop: 8, width: 260,
        background: '#fff', borderRadius: 12, border: '1px solid #e2e6ea',
        boxShadow: '0 8px 30px rgba(0,0,0,0.12)', zIndex: 50,
        padding: '12px 14px', animation: 'fadeIn 0.2s ease-out',
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={stopAll}
      onPointerDown={stopAll}
    >
      {/* ×閉じるボタン — ヒット領域を24x24に拡大 */}
      <button
        onClick={handleClose}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          position: 'absolute', top: 4, right: 4,
          width: 28, height: 28,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'none', border: '1px solid transparent',
          borderRadius: 6, cursor: 'pointer', color: '#868e96',
          transition: 'background .15s, color .15s',
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.background = '#f1f3f5';
          e.currentTarget.style.color = '#495057';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.background = 'none';
          e.currentTarget.style.color = '#868e96';
        }}
      >
        <X size={14} />
      </button>

      <p style={{ fontSize: 13, fontWeight: 700, color: '#1a1d23', marginBottom: 6, paddingRight: 24 }}>
        {label}
      </p>

      {sentence && (
        <p style={{ fontSize: 11, lineHeight: 1.6, color: '#495057', marginBottom: 8 }}>
          {sentence}
        </p>
      )}

      {extendQuery && (
        <p style={{ fontSize: 10, color: '#748ffc', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
          <ExternalLink size={10} />
          {extendQuery}
        </p>
      )}

      <a
        href={url} target="_blank" rel="noopener noreferrer"
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontSize: 11, fontWeight: 500, color: '#4263eb', textDecoration: 'none',
          padding: '5px 10px', borderRadius: 8,
          background: '#f0f4ff', border: '1px solid #dbe4ff',
        }}
      >
        <Search size={12} />
        Googleで検索
      </a>
    </div>
  );
};