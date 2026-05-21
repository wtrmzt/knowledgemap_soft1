/**
 * メモサービス (v3.2.2)
 *
 * 既存関数 (listMemos, createMemoWithMap, improveMemo) は完全維持.
 *
 * v3.2.2 の重要修正:
 *   patchMemo を fetch 直書きから apiPost 経由に変更.
 *   → 認証ヘッダの付与を既存 apiClient に完全に委ねる(localStorage キー名に依存しない).
 *   バックエンド側に POST /api/memos/<id>/update を用意して使う.
 */
import { apiGet, apiPost } from './apiClient';
import type { Memo, KnowledgeMapData, ImproveResult, MapNode, AppMode } from '@/types';

// ============================================================
// 既存関数(変更なし)
// ============================================================

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

// ============================================================
// v3 拡張
// ============================================================

export interface MapSummary {
  id: number;
  title: string;
  preview: string;
  mode: AppMode;
  thumbnail_url: string | null;
  node_count: number;
  edge_count: number;
  is_archived: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface MemosListResponse {
  items: MapSummary[];
  page: number;
  per_page: number;
  total: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface ListMemosParams {
  page?: number;
  per_page?: number;
  mode?: AppMode;
  q?: string;
  archived?: boolean;
}

/** ユーザー別マップ一覧 */
export async function listMemosPaginated(
  params: ListMemosParams = {}
): Promise<MemosListResponse> {
  const sp = new URLSearchParams();
  if (params.page) sp.set('page', String(params.page));
  if (params.per_page) sp.set('per_page', String(params.per_page));
  if (params.mode) sp.set('mode', params.mode);
  if (params.q) sp.set('q', params.q);
  if (params.archived) sp.set('archived', '1');
  const qs = sp.toString();
  return apiGet<MemosListResponse>(`/memos/list${qs ? `?${qs}` : ''}`);
}

/** 単一メモ取得 */
export async function getMemo(memoId: number): Promise<Memo> {
  return apiGet<Memo>(`/memos/${memoId}`);
}

/**
 * メモのタイトル・本文を部分更新(自動保存用).
 *
 * ★ 認証を既存 apiClient に委ねるため apiPost を使う.
 *   バックエンドは POST /api/memos/<id>/update を提供する.
 */
export async function patchMemo(
  memoId: number,
  changes: { title?: string; content?: string }
): Promise<Memo> {
  return apiPost<Memo>(`/memos/${memoId}/update`, changes);
}

/** 空のメモを作成(「新しいマップ」ボタン用) */
export async function createBlankMemo(
  mode: AppMode = 'reflection',
  initialTitle = ''
): Promise<Memo> {
  return apiPost<Memo>('/memos/blank', { mode, title: initialTitle });
}