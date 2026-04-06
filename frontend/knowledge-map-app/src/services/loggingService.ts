/**
 * 操作ログサービス
 * UI上の操作をバックエンドのアクティビティログに記録
 */
import { apiPost } from './apiClient';

export type LogAction =
  | 'node_add_manual'
  | 'node_add_ai'
  | 'edge_connect'
  | 'map_save'
  | 'map_generate'
  | 'map_rollback'
  | 'memo_create'
  | 'memo_improve'
  | 'mode_switch'
  | 'relation_view';

export async function logActivity(
  action: LogAction,
  detail: Record<string, unknown> = {},
  memoId?: number
): Promise<void> {
  try {
    await apiPost('/logs', { action, detail, memo_id: memoId });
  } catch (err) {
    // ログ送信失敗は無視（UX影響なし）
    console.warn('Activity log failed:', err);
  }
}
