/**
 * 汎用入力コンポーネント
 */
import React from 'react';
import { cn } from '@/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input: React.FC<InputProps> = ({ className, ...props }) => {
  return (
    <input
      className={cn(
        'w-full px-3 py-2 text-sm rounded-lg border border-surface-300',
        'bg-white placeholder:text-surface-400',
        'focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400',
        'transition-all duration-150',
        className
      )}
      {...props}
    />
  );
};

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea: React.FC<TextareaProps> = ({ className, ...props }) => {
  return (
    <textarea
      className={cn(
        'w-full px-3 py-2 text-sm rounded-lg border border-surface-300',
        'bg-white placeholder:text-surface-400 resize-none',
        'focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400',
        'transition-all duration-150',
        className
      )}
      {...props}
    />
  );
};
