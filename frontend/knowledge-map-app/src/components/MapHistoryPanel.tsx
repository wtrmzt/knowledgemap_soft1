/**
 * マップ履歴パネル
 * 変更履歴の一覧表示とロールバック
 */
import React, { useState, useEffect } from 'react';
import { History, RotateCcw, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { mapService } from '@/services';
import type { MapHistoryEntry } from '../types';

interface MapHistoryPanelProps {
  memoId: number | null;
  visible: boolean;
  onClose: () => void;
  onRollback: (version: number) => void;
}

const actionLabels: Record<string, string> = {
  create: '初回生成',
  update: '編集',
  rollback: 'ロールバック',
};

export const MapHistoryPanel: React.FC<MapHistoryPanelProps> = ({
  memoId,
  visible,
  onClose,
  onRollback,
}) => {
  const [histories, setHistories] = useState<MapHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !memoId) return;
    setLoading(true);
    mapService
      .getMapHistory(memoId)
      .then(setHistories)
      .catch(() => setHistories([]))
      .finally(() => setLoading(false));
  }, [visible, memoId]);

  if (!visible) return null;

  return (
    <div className="absolute top-3 left-3 w-64 bg-surface-50 rounded-xl shadow-lg border border-surface-200 z-10 animate-fade-in max-h-[70vh] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-surface-200 shrink-0">
        <div className="flex items-center gap-1.5">
          <History size={13} className="text-primary-500" />
          <span className="text-xs font-semibold text-surface-700">変更履歴</span>
        </div>
        <button onClick={onClose} className="text-surface-400 hover:text-surface-600">
          <X size={14} />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading && (
          <div className="flex justify-center py-4">
            <Loader2 size={16} className="animate-spin text-surface-400" />
          </div>
        )}
        {!loading && histories.length === 0 && (
          <p className="text-[11px] text-surface-400 text-center py-4">履歴がありません</p>
        )}
        {histories.map((h) => (
          <div
            key={h.id}
            className="flex items-center justify-between p-2 bg-white rounded-lg border border-surface-200 text-xs"
          >
            <div>
              <span className="font-medium text-surface-700">v{h.version}</span>
              <span className="ml-1.5 text-surface-400">
                {actionLabels[h.action] || h.action}
              </span>
              <div className="text-[10px] text-surface-400 mt-0.5">
                {h.created_at ? new Date(h.created_at).toLocaleString('ja-JP') : ''}
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onRollback(h.version)}
              title="この状態に戻す"
            >
              <RotateCcw size={12} />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
};
