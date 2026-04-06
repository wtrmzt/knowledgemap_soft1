/**
 * マップサービス
 * マップCRUD・ノード生成・関連科目推薦・周辺概念・記述支援
 */
import { apiGet, apiPost, apiPut } from './apiClient';
import type {
  KnowledgeMapData,
  MapNode,
  MapEdge,
  MapHistoryEntry,
  GeneratedNodeResult,
  TemporalRelationResponse,
  TemporalRelationRequest,
  SurroundingConceptsMap,
  TopicDetectionResult,
} from '@/types';

// --- マップ CRUD ---

export async function getMap(memoId: number): Promise<KnowledgeMapData> {
  const data = await apiGet<{ map: KnowledgeMapData }>(`/maps/${memoId}`);
  return data.map;
}

export async function updateMap(
  memoId: number,
  nodes: MapNode[],
  edges: MapEdge[]
): Promise<KnowledgeMapData> {
  const data = await apiPut<{ map: KnowledgeMapData }>(`/maps/${memoId}`, { nodes, edges });
  return data.map;
}

// --- 履歴・ロールバック ---

export async function getMapHistory(memoId: number): Promise<MapHistoryEntry[]> {
  const data = await apiGet<{ histories: MapHistoryEntry[] }>(`/maps/${memoId}/history`);
  return data.histories;
}

export async function rollbackMap(memoId: number, version: number): Promise<KnowledgeMapData> {
  const data = await apiPost<{ map: KnowledgeMapData }>(`/maps/${memoId}/rollback/${version}`);
  return data.map;
}

// --- ノード生成 ---

export async function createManualNode(keyword: string): Promise<GeneratedNodeResult> {
  return apiPost<GeneratedNodeResult>('/nodes/create_manual', { keyword });
}

// --- 関連科目推薦 ---

export async function getTemporalRelations(
  request: TemporalRelationRequest
): Promise<TemporalRelationResponse> {
  return apiPost<TemporalRelationResponse>('/relations/temporal', {
    label: request.label,
    sentence: request.sentence || '',
    extend_query: request.extend_query || [],
    year: request.year ?? 3,
    id: request.id,
  });
}

// --- 周辺概念の取得（新規） ---

export async function getSurroundingConcepts(
  nodes: MapNode[]
): Promise<SurroundingConceptsMap> {
  const data = await apiPost<{ surrounding: SurroundingConceptsMap }>(
    '/surrounding_concepts',
    { nodes }
  );
  return data.surrounding;
}

// --- 振り返り記述支援：トピック検知（新規） ---

export async function detectTopics(
  text: string,
  nodeLabels: string[]
): Promise<TopicDetectionResult> {
  return apiPost<TopicDetectionResult>('/writing/detect_topics', {
    text,
    node_labels: nodeLabels,
  });
}