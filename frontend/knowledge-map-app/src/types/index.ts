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
  title?: string | null;
  /** 機能3: 過去・未来の科目関連の記述 */
  relation_note?: string;
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
  /** 候補ノードの場合: 展開時に接続される概念ラベルのプレビュー（項目1） */
  relationPreview?: string[];
  /** 展開済み関連ノードの「根（科目名）」からの距離。小さいほど根に近い（項目2） */
  relationDepth?: number;
  /** 候補ノードの関連科目介入度（2:科目名のみ / 3:部分木接続）。管理者機能D */
  relationLevel?: number;
  /** ノードの由来（収集データ）: 'ai' | 'manual' | 'satellite' | 'relation' */
  origin?: 'ai' | 'manual' | 'satellite' | 'relation' | string;
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

/** 提案の方向性（記述支援AI 新プロンプト） */
export type SuggestionType = 'redirection' | 'expansion' | 'deepening';

export interface WritingSuggestion {
  /** 提案の種類: 軌道修正 / 展開 / 深掘り */
  suggestion_type?: SuggestionType;
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

// =============================================
// アプリ設定（管理者機能D）
// =============================================

export type InterventionLevel = 1 | 2 | 3;

export interface InterventionLevels {
  /** リアルタイムトピック検知＆記述提案 (1:可視化なし / 2:状態可視化のみ / 3:提案カード) */
  topic_detection: InterventionLevel;
  /** 周辺概念(Satellite) (1:非表示 / 2:ラベルのみ / 3:フル提示) */
  satellite: InterventionLevel;
  /** 関連科目推薦 (1:非表示 / 2:科目名のみ / 3:部分木接続) */
  relation: InterventionLevel;
  /** エッジ説明 (1:OFF / 2:単語のみ / 3:説明文) 機能2 */
  edge_explanation: InterventionLevel;
}

export interface EnabledModes {
  reflection: boolean;
  research: boolean;
  idea: boolean;
}

/** 表示系の機能トグル（機能3など） */
export interface FeatureFlags {
  /** 過去・未来の記述項目（左パネル下部）の表示 */
  relation_note: boolean;
}

/** 公開設定（ダッシュボードのゲーティング用） */
export interface PublicSettings {
  enabled_modes: EnabledModes;
  intervention: InterventionLevels;
  features: FeatureFlags;
}

/** 管理者向けフル設定（プロンプト含む） */
export interface AppSettingsData extends PublicSettings {
  prompts: {
    map_generation: string;
    surrounding: string;
    edge_explanation: string;
  };
}

// =============================================
// 作業フロー フェーズ（項目3）
//   create        : 初期マップ作成（メモ入力 → 生成）
//   edit          : マップ編集（ノード追加・周辺概念など）
//   connect_past  : 過去（基礎）科目の接続
//   connect_future: 未来（発展）科目の接続
// =============================================

export type FlowPhase = 'create' | 'edit' | 'connect_past' | 'connect_future';

export const FLOW_PHASE_ORDER: FlowPhase[] = [
  'create', 'edit', 'connect_past', 'connect_future',
];

export const FLOW_PHASE_LABELS: Record<FlowPhase, string> = {
  create: '初期マップ作成',
  edit: 'マップ編集',
  connect_past: '過去の科目接続',
  connect_future: '未来の科目接続',
};

// =============================================
// ロギング
// =============================================

export type LogAction =
  | 'map_generate'
  | 'mode_switch'
  | 'node_add'
  | 'node_add_manual'
  | 'node_connect'
  | 'satellite_add'
  | 'satellite_suggested'
  | 'satellite_adopted'
  | 'memo_edit'
  | 'relation_expanded'
  | 'map_rollback'
  | 'map_autosave';