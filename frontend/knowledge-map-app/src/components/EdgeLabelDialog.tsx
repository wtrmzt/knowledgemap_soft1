/**
 * エッジラベル入力ダイアログ
 * 手動でノード同士を接続した際にラベルを入力する
 */
import React, { useState, useRef, useEffect } from 'react';
import { Link2 } from 'lucide-react';

interface EdgeLabelDialogProps {
  sourceLabel: string;
  targetLabel: string;
  onConfirm: (label: string) => void;
  onCancel: () => void;
}

export const EdgeLabelDialog: React.FC<EdgeLabelDialogProps> = ({
  sourceLabel, targetLabel, onConfirm, onCancel,
}) => {
  const [label, setLabel] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const handleSubmit = () => onConfirm(label.trim());

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(2px)',
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 340, background: '#fff', borderRadius: 16,
          boxShadow: '0 16px 48px rgba(0,0,0,0.15)',
          padding: '20px 24px', animation: 'fadeIn 0.2s ease-out',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: '#f0f4ff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Link2 size={16} color="#4263eb" />
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#1a1d23' }}>
              関係性を入力
            </p>
            <p style={{ fontSize: 11, color: '#868e96' }}>
              「{sourceLabel}」→「{targetLabel}」
            </p>
          </div>
        </div>

        <input
          ref={inputRef}
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
            if (e.key === 'Escape') onCancel();
          }}
          placeholder="例: の前提知識, を応用した, と対比する..."
          style={{
            width: '100%', padding: '8px 12px', fontSize: 13,
            border: '1.5px solid #dee2e6', borderRadius: 10,
            outline: 'none', transition: 'border .15s',
          }}
          onFocus={(e) => { e.target.style.borderColor = '#4263eb'; }}
          onBlur={(e) => { e.target.style.borderColor = '#dee2e6'; }}
        />

        <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '6px 16px', fontSize: 12, fontWeight: 500,
              color: '#868e96', background: '#f1f3f5', border: 'none',
              borderRadius: 8, cursor: 'pointer',
            }}
          >
            スキップ
          </button>
          <button
            onClick={handleSubmit}
            style={{
              padding: '6px 16px', fontSize: 12, fontWeight: 600,
              color: '#fff', background: '#4263eb', border: 'none',
              borderRadius: 8, cursor: 'pointer',
            }}
          >
            追加
          </button>
        </div>
      </div>
    </div>
  );
};