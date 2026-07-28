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
// ===== 機能2: エッジ（2ノード間）の説明を取得（DBキャッシュ→無ければAI生成）=====
export interface EdgeExplanationResult {
  source_label?: string;
  target_label?: string;
  word: string;
  sentence: string;
  level?: number;
  cached?: boolean;
  disabled?: boolean;
}

export async function getEdgeExplanation(
  sourceLabel: string,
  targetLabel: string,
  memoId?: number | null,
): Promise<EdgeExplanationResult> {
  return apiPost<EdgeExplanationResult>('/edges/explain', {
    source_label: sourceLabel,
    target_label: targetLabel,
    memo_id: memoId ?? null,
  });
}
// ===== 機能2（新仕様）: マップ全体から関連性の高い上位エッジを取得 =====
//   ノード＋エッジをAIに渡し、上位3件の「つながり」と説明を取得する。
//   介入度 Lv1 は disabled、Lv2 は word のみ、Lv3 は sentence まで返る。
export interface EdgeHighlight {
  source_label: string;
  target_label: string;
  word: string;
  sentence: string;
}

export interface EdgeHighlightsResult {
  level?: number;
  highlights: EdgeHighlight[];
  cached?: boolean;
  disabled?: boolean;
}

export async function getEdgeHighlights(
  memoId: number | null | undefined,
  nodes: MapNode[],
  edges: MapEdge[],
): Promise<EdgeHighlightsResult> {
  return apiPost<EdgeHighlightsResult>('/edges/highlights', {
    memo_id: memoId ?? null,
    // 送信量を抑えるため必要な項目のみ送る
    nodes: nodes.map((n) => ({
      id: n.id,
      label: n.label || n.data?.label || '',
    })),
    edges: edges.map((e) => ({
      source: e.source,
      target: e.target,
      label: e.label || '',
      isSatellite: e.isSatellite || false,
      isRelation: e.isRelation || false,
    })),
  });
}