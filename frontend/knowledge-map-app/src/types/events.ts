/**
 * 利用履歴イベントの型定義.
 *
 * すべてのユーザー操作イベントはここに列挙すること.
 * 新規イベントを足すときは ActivityEventType に追加し、
 * 必要なら payload の型を追加する.
 */

export type ActivityEventType =
  // メモ
  | "memo.created"
  | "memo.opened"
  | "memo.archived"

  // マップ生成
  | "map.generated"
  | "map.auto_saved"
  | "map.rolled_back"
  | "map.history_opened"

  // ノード操作
  | "node.added_manual"
  | "node.satellite_clicked"
  | "node.connected"
  | "node.deleted"
  | "node.clicked"
  | "node.popup_opened"

  // 執筆支援
  | "writing.suggestion_clicked"
  | "writing.topic_described"
  | "writing.improve_clicked"

  // モード / ナビゲーション
  | "mode.switched"
  | "page.viewed"

  // セッション
  | "session.started"
  | "session.ended"

  // 認証
  | "auth.login_legacy"
  | "auth.login_google"
  | "auth.logout";

/** すべてのイベントが共有するベース */
export interface ActivityEventBase {
  /** クライアント側で発番した UUID. サーバ側の冪等性キー */
  client_event_id: string;
  type: ActivityEventType;
  /** クライアント時計の ISO8601 (ミリ秒精度) */
  client_ts: string;
  /** 関連メモ ID (任意) */
  memo_id?: number;
  /** イベント固有の追加データ. 個人を識別する自由記述は含めない */
  payload?: Record<string, unknown>;
}

export type ActivityEvent = ActivityEventBase;

/** /api/events に POST する body */
export interface EventBatchRequest {
  session_id: string;
  events: ActivityEvent[];
}

export interface EventBatchResponse {
  accepted: number;
  received: number;
}
