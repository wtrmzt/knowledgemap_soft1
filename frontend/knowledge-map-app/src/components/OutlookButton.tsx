/**
 * OutlookButton.tsx — ヘッダー用「見通す」ボタン
 * 配置先: frontend/knowledge-map-app/src/components/OutlookButton.tsx
 *
 * 使い方(/maps ダッシュボードとワークスペース両方のヘッダーに設置):
 *   import { OutlookButton } from '@/components/OutlookButton';
 *   ...
 *   <OutlookButton />   // 「振り返り」表示の横に置く
 *
 * 機能が管理者設定でOFFの場合はボタン自体を表示しない。
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Telescope } from 'lucide-react';
import * as outlookService from '@/services/outlookService';

export const OutlookButton: React.FC<{ className?: string }> = ({ className }) => {
  const navigate = useNavigate();
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    outlookService
      .getConfig()
      .then((c) => setEnabled(c.enabled))
      .catch(() => setEnabled(false));
  }, []);

  if (!enabled) return null;

  return (
    <button
      onClick={() => navigate('/outlook')}
      title="振り返りと将来の科目とのつながりを見通す"
      className={
        className ||
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ' +
        'border border-primary-200 bg-primary-50 text-primary-700 ' +
        'hover:bg-primary-100 transition-colors'
      }
    >
      <Telescope size={14} />
      見通す
    </button>
  );
};

export default OutlookButton;