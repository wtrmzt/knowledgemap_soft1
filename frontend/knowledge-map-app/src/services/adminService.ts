/**
 * 管理者サービス
 * 統計情報・ユーザー一覧・統合マップ・データエクスポート
 */
import { apiGet, apiGetBlob } from './apiClient';
import type { AdminStats, User, MapNode, MapEdge, Memo, KnowledgeMapData } from '@/types';

export async function getStats(): Promise<AdminStats> {
  return apiGet<AdminStats>('/admin/stats');
}

export async function getUsers(): Promise<User[]> {
  const data = await apiGet<{ users: User[] }>('/admin/users');
  return data.users;
}

export async function getCombinedMap(): Promise<{ nodes: MapNode[]; edges: MapEdge[] }> {
  return apiGet<{ nodes: MapNode[]; edges: MapEdge[] }>('/admin/combined_map');
}

export async function getUserMaps(
  userDbId: number
): Promise<{ memo: Memo; map: KnowledgeMapData | null }[]> {
  const data = await apiGet<{ data: { memo: Memo; map: KnowledgeMapData | null }[] }>(
    `/admin/user/${userDbId}/maps`
  );
  return data.data;
}

export async function exportCsv(): Promise<void> {
  const blob = await apiGetBlob('/admin/export_csv');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `export_${new Date().toISOString().slice(0, 10)}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}
