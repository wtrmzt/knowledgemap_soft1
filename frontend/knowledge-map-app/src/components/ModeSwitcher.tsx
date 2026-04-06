/**
 * モード切替コンポーネント
 * 振り返り / 調べ物 / アイデア の3モードを切り替え
 */
import React from 'react';
import { BookOpen, Search, Lightbulb } from 'lucide-react';
import { cn } from '@/utils';
import type { AppMode } from '../types';

interface ModeSwitcherProps {
  mode: AppMode;
  onChange: (mode: AppMode) => void;
}

const modes: { key: AppMode; label: string; icon: React.ReactNode; color: string }[] = [
  { key: 'reflection', label: '振り返り', icon: <BookOpen size={15} />, color: 'primary' },
  { key: 'research', label: '調べ物', icon: <Search size={15} />, color: 'blue' },
  { key: 'idea', label: 'アイデア', icon: <Lightbulb size={15} />, color: 'amber' },
];

export const ModeSwitcher: React.FC<ModeSwitcherProps> = ({ mode, onChange }) => {
  return (
    <div className="flex items-center gap-1 p-1 bg-surface-100 rounded-xl">
      {modes.map((m) => {
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
