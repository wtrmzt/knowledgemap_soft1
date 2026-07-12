/**
 * suggestionLogService.ts
 *
 * 記述支援AIの提案（suggestion_type 付き）を DB に記録するサービス。
 *   - 提示された提案: recordSuggested(...)
 *   - 採用された提案: recordAdopted(...)
 *
 * バックエンド: POST /api/logs/suggestion（writing_suggestion_log.py）
 * 失敗しても学習体験を阻害しないよう、エラーは握りつぶす（既存 loggingService と同方針）。
 */
import { apiPost } from './apiClient';
import type { WritingSuggestion } from '@/types';

export interface SuggestionLogContext {
  currently_writing?: string | null;
  described_count?: number;
  total_nodes?: number;
}

async function post(body: Record<string, unknown>): Promise<void> {
  try {
    await apiPost('/logs/suggestion', body);
  } catch {
    // ログ送信の失敗は無視
  }
}

/** AIが提示した提案（複数）を記録 */
export async function recordSuggested(
  suggestions: WritingSuggestion[],
  memoId?: number,
  context: SuggestionLogContext = {},
): Promise<void> {
  if (!suggestions || suggestions.length === 0) return;
  await post({
    event: 'suggested',
    memo_id: memoId,
    suggestions,
    context,
  });
}

/** 学習者がクリックして採用した提案（単一）を記録 */
export async function recordAdopted(
  suggestion: WritingSuggestion,
  memoId?: number,
  context: SuggestionLogContext = {},
): Promise<void> {
  if (!suggestion) return;
  await post({
    event: 'adopted',
    memo_id: memoId,
    suggestion,
    context,
  });
}