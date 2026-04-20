/**
 * 型定義モジュール（Phase 3 v3）
 */

// =============================================
// ユーザー・認証
// =============================================

export interface User {
  id: number;
  user_id: string;
  display_name: string;
  is_admin: boolean;
  consented: boolean;
  created_at: string | null;
}

export interface AuthPayload {
  user_db_id: number;
  user_id: string;
  is_admin: boolean;
  exp: number;
  iat: number;
}

// =============================================
// メモ
// =============================================

export type AppMode = 'reflection' | 'research' | 'idea';

export interface Memo {
  id: number;
  user_id: number;
  content: string;
  mode: AppMode;
  created_at: string | null;
  updated_at: string | null;
}

// =============================================
// 知識マップ
// =============================================

/** ノードの記述状態 */
export type NodeStatus =
  | 'default'
  | 'described'
  | 'currently_writing'
  | 'suggested'
  | 'satellite'
  | 'relation_past'
  | 'relation_future'
  | 'relation_past_candidate'
  | 'relation_future_candidate';

export interface MapNodeData {
  label: string;
  sentence?: string;
  extend_query?: string;
  status?: NodeStatus;
  satellites?: SatelliteConcept[];
  isSatellite?: boolean;
  parentNodeId?: string;
  /** 関連科目ノード（候補 or 展開済み）かどうか */
  isRelation?: boolean;
  /** 関連科目の方向 */
  relationDirection?: 'past' | 'future';
  /** 接続元のメインノードID */
  relationOriginId?: string;
  /** 候補ノードの場合: 科目名（キャッシュキー） */
  relationSubjectName?: string;
  /** 科目グループ名 */
  group?: string;
  [key: string]: unknown;
}

export interface MapNode {
  id: string;
  label?: string;
  type?: string;
  position: { x: number; y: number };
  data?: MapNodeData;
  sentence?: string;
  extend_query?: string;
  _memo_id?: number;
}

export interface MapEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  isSatellite?: boolean;
  isRelation?: boolean;
  sourceHandle?: string;
  targetHandle?: string;
  _memo_id?: number;
}

export interface KnowledgeMapData {
  id: number;
  memo_id: number;
  nodes: MapNode[];
  edges: MapEdge[];
  updated_at: string | null;
}

export interface MapHistoryEntry {
  id: number;
  memo_id: number;
  version: number;
  nodes: MapNode[];
  edges: MapEdge[];
  action: string;
  created_at: string | null;
}

// =============================================
// 周辺概念（satellite）
// =============================================

export interface SatelliteConcept {
  label: string;
  relation: string;
}

export type SurroundingConceptsMap = Record<string, SatelliteConcept[]>;

// =============================================
// 振り返り記述支援
// =============================================

export interface WritingSuggestion {
  node_label: string;
  connector: string;
  prompt_hint: string;
}

export interface TopicDetectionResult {
  described: string[];
  currently_writing: string | null;
  next_suggestions: WritingSuggestion[];
}

// =============================================
// AI 応答
// =============================================

export interface GeneratedNodeResult {
  id: string;
  label: string;
  sentence: string;
  extend_query: string;
}

export interface ImproveResult {
  improved_text: string;
  suggestions: string[];
  comments: string[];
}

// =============================================
// 関連科目推薦
// =============================================

export interface RelationMapNode {
  id: string;
  label: string;
  sentence?: string;
  group?: string;
}

export interface RelationMapEdge {
  source: string;
  target: string;
}

export interface RelationSubMap {
  nodes: RelationMapNode[];
  edges: RelationMapEdge[];
}

export interface TemporalRelationResponse {
  future_map: RelationSubMap;
  past_map: RelationSubMap;
  method?: 'lightweight' | 'heavy' | 'heavy_direct' | 'none';
  response_time_ms?: number;
  error?: string | null;
}

export interface TemporalRelationRequest {
  label: string;
  sentence?: string;
  extend_query?: string[];
  year?: number;
  id?: string;
}

/** キャッシュ: 1科目分のサブグラフ */
export interface RelationSubGraphCache {
  subjectName: string;
  direction: 'past' | 'future';
  originNodeId: string;
  nodes: RelationMapNode[];
  edges: RelationMapEdge[];
}

/** 旧互換 */
export interface SubjectScore {
  subject_name: string;
  year: number;
  score: number;
}

export interface TemporalRelation {
  past: SubjectScore[];
  future: SubjectScore[];
}

// =============================================
// 管理者
// =============================================

export interface AdminStats {
  user_count: number;
  memo_count: number;
  map_count: number;
  log_count: number;
}

// =============================================
// 振り返りフェーズ
// =============================================

export type ReflectionPhase = 'write' | 'revise';