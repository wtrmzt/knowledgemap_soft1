/**
 * 周辺概念（satellite）ボタン
 * ノードの右側に表示され、クリックでマップに追加
 */
import React from 'react';
import type { SatelliteConcept } from '@/types';

interface SatelliteButtonsProps {
  satellites: SatelliteConcept[];
  parentNodeId: string;
}

export const SatelliteButtons: React.FC<SatelliteButtonsProps> = ({
  satellites, parentNodeId,
}) => {
  if (satellites.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute', top: -4, left: '100%', marginLeft: 12,
        display: 'flex', flexDirection: 'column', gap: 4, zIndex: 5,
      }}
    >
      {satellites.map((sat, i) => (
        <button
          key={i}
          onClick={(e) => {
            e.stopPropagation();
            const event = new CustomEvent('satellite-click', {
              bubbles: true,
              detail: { label: sat.label, relation: sat.relation, parentNodeId },
            });
            e.currentTarget.dispatchEvent(event);
          }}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '3px 8px', fontSize: 10, fontWeight: 500,
            color: '#748ffc', background: '#f0f4ff',
            border: '1px dashed #bac8ff', borderRadius: 8,
            cursor: 'pointer', whiteSpace: 'nowrap',
            maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis',
            transition: 'all 0.15s',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = '#dbe4ff';
            e.currentTarget.style.borderStyle = 'solid';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = '#f0f4ff';
            e.currentTarget.style.borderStyle = 'dashed';
          }}
          title={`${sat.label}（${sat.relation}）をマップに追加`}
        >
          <span style={{ fontSize: 11 }}>+</span>
          {sat.label}
        </button>
      ))}
    </div>
  );
};
