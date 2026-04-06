/**
 * メモサービス
 * メモの取得・作成（マップ同時生成）・改善
 */
import { apiGet, apiPost } from './apiClient';
import type { Memo, KnowledgeMapData, ImproveResult, MapNode, AppMode } from '@/types';

export async function listMemos(): Promise<Memo[]> {
  const data = await apiGet<{ memos: Memo[] }>('/memos');
  return data.memos;
}

export async function createMemoWithMap(
  content: string,
  mode: AppMode = 'reflection'
): Promise<{ memo: Memo; map: KnowledgeMapData }> {
  return apiPost<{ memo: Memo; map: KnowledgeMapData }>('/memos_with_map', { content, mode });
}

export async function improveMemo(
  content: string,
  nodes: MapNode[],
  mode: AppMode = 'reflection'
): Promise<ImproveResult> {
  return apiPost<ImproveResult>('/improve_memo', { content, nodes, mode });
}
