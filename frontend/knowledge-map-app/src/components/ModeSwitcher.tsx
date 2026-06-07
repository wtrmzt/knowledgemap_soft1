/**
 * モード切替コンポーネント
 * 振り返り / 調べ物 / アイデア の3モードを切り替え
 */
import React from 'react';
import { BookOpen, Search, Lightbulb } from 'lucide-react';
import { cn } from '@/utils';
import type { AppMode, EnabledModes } from '../types';

interface ModeSwitcherProps {
  mode: AppMode;
  onChange: (mode: AppMode) => void;
  /** 管理者設定で有効なモードのみ表示（未指定なら全表示） */
  enabledModes?: EnabledModes;
}

const modes: { key: AppMode; label: string; icon: React.ReactNode; color: string }[] = [
  { key: 'reflection', label: '振り返り', icon: <BookOpen size={15} />, color: 'primary' },
  { key: 'research', label: '調べ物', icon: <Search size={15} />, color: 'blue' },
  { key: 'idea', label: 'アイデア', icon: <Lightbulb size={15} />, color: 'amber' },
];

export const ModeSwitcher: React.FC<ModeSwitcherProps> = ({ mode, onChange, enabledModes }) => {
  const visibleModes = enabledModes
    ? modes.filter((m) => enabledModes[m.key])
    : modes;
  return (
    <div className="flex items-center gap-1 p-1 bg-surface-100 rounded-xl">
      {visibleModes.map((m) => {
        const isActive = mode === m.key;
        return (
          <button
            key={m.key}
            onClick={() => onChange(m.key)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200',
              isActive
                ? 'bg-white text-primary-700 shadow-sm'
                : 'text-surface-500 hover:text-surface-700 hover:bg-surface-200'
            )}
          >
            {m.icon}
            {m.label}
          </button>
        );
      })}
    </div>
  );
};