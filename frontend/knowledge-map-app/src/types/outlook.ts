/**
 * types/outlook.ts — 関連性接続把握機能「見通す」の型定義
 * 配置先: frontend/knowledge-map-app/src/types/outlook.ts
 * (既存 types/index.ts は変更せず、利用側で個別importする)
 */

export interface OutlookConfig {
  enabled: boolean;
  similarity_threshold: number;
  max_nodes: number;
  question: string;
}

export interface OutlookMemoSummary {
  memo_id: number;
  title: string;
  /** 振り返り本文(全文) */
  content: string;
  content_excerpt: string;
  mode: string;
  node_count: number;
  created_at: string | null;
  updated_at: string | null;
}

/** 接続プレビュー(科目選択画面用の最類似ペア) */
export interface OutlookPreviewPair {
  source_label: string;
  target_label: string;
  similarity: number;
}

export interface OutlookSubject {
  subject_name: string;
  year: string;
  score: number;
  mean_similarity: number;
  has_map: boolean;
  /** どのような科目か(科目マップのルートノード説明文) */
  description: string;
  /** どのような接続になるか(類似度上位の概念ペア) */
  preview: OutlookPreviewPair[];
}

export interface OutlookSubjectNode {
  id: string;
  label: string;
  sentence: string;
}

export interface OutlookSubjectEdge {
  source: string;
  target: string;
}

export interface OutlookSubjectMap {
  nodes: OutlookSubjectNode[];
  edges: OutlookSubjectEdge[];
  root_id: string | null;
}

export interface OutlookLink {
  source_id: string;      // 振り返り側ノードID
  source_label: string;
  target_id: string;      // 科目側ノードID
  target_label: string;
  similarity: number;
  sentence: string;       // 繋がりの短い説明
}

export interface OutlookAnswerRecord {
  id: number;
  user_id: number;
  memo_id: number;
  subject_name: string;
  answer_text: string;
  created_at: string | null;
}

export interface OutlookConnectionsResult {
  memo_id: number;
  subject_name: string;
  /** 履修学年(表示用: "2", "3", "2/3" など) */
  year: string;
  threshold: number;
  subject_map: OutlookSubjectMap;
  links: OutlookLink[];
  latest_answer: OutlookAnswerRecord | null;
}

export interface OutlookAdminSettings {
  enabled: boolean;
  similarity_threshold: number;
  max_nodes: number;
}

export interface OutlookEngineStatus {
  loaded: boolean;
  load_error: string | null;
  subject_count: number;
  map_count: number;
}