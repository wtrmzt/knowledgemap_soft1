/**
 * イベントバッファ + バッチ送信.
 *
 * クライアントからのログ送信頻度が高くなるとサーバ DB の hot path に
 * なるため、5 秒間 or 20 件たまるまでバッファし、まとめて POST する.
 *
 * - ページ離脱時は navigator.sendBeacon で確実に送信
 * - 失敗時は次回リトライ (最大 500 件まで保持)
 * - SHA256 を使わずに crypto.randomUUID() で client_event_id を生成
 *
 * 使用例:
 *   import { analytics } from "@/services/analytics";
 *   analytics.track("node.added_manual", { keyword: "微分" }, memoId);
 */

import { apiPost } from "./apiClient";
import type {
  ActivityEvent,
  ActivityEventType,
  EventBatchRequest,
  EventBatchResponse,
} from "@/types/events";

const FLUSH_INTERVAL_MS = 5000;
const MAX_BUFFER_SIZE = 20;
const MAX_RETRY_QUEUE = 500;

class EventBuffer {
  private queue: ActivityEvent[] = [];
  private timer: number | null = null;
  private sessionId: string;
  private isFlushing = false;
  private enabled = true;

  constructor() {
    this.sessionId = this.getOrCreateSessionId();

    // ページ離脱時に sendBeacon でフラッシュ
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", () => this.flushBeacon());
      window.addEventListener("pagehide", () => this.flushBeacon());
      // タブが裏に行ったときも flush(モバイルでは pagehide が来ないことがある)
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") this.flushBeacon();
      });
    }
  }

  /** ログ送信を一時停止/再開 (例: 同意取得前は無効化) */
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  track(
    type: ActivityEventType,
    payload: Record<string, unknown> = {},
    memoId?: number
  ) {
    if (!this.enabled) return;

    const event: ActivityEvent = {
      client_event_id: this.uuid(),
      type,
      client_ts: new Date().toISOString(),
      memo_id: memoId,
      payload,
    };

    this.queue.push(event);

    if (this.queue.length >= MAX_BUFFER_SIZE) {
      void this.flush();
    } else {
      this.scheduleFlush();
    }
  }

  /** 強制フラッシュ (ログアウト前など) */
  async flushNow(): Promise<void> {
    return this.flush();
  }

  // ------------------------------------------------------------------
  // private
  // ------------------------------------------------------------------

  private scheduleFlush() {
    if (this.timer != null) return;
    this.timer = window.setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, FLUSH_INTERVAL_MS);
  }

  private async flush(): Promise<void> {
    if (this.isFlushing) return;
    if (this.queue.length === 0) return;

    if (this.timer != null) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    this.isFlushing = true;
    const events = this.queue.splice(0, this.queue.length);

    try {
      const body: EventBatchRequest = {
        session_id: this.sessionId,
        events,
      };
      await apiPost<EventBatchResponse>("/api/events", body);
    } catch (err) {
      // 失敗時はキュー先頭に戻す (上限を超えたら古い順に捨てる)
      this.queue.unshift(...events);
      if (this.queue.length > MAX_RETRY_QUEUE) {
        this.queue = this.queue.slice(-MAX_RETRY_QUEUE);
      }
      // eslint-disable-next-line no-console
      console.warn("[analytics] flush failed:", err);
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * sendBeacon は同期 API なので、ページ離脱時にも確実に送信できる.
   * fetch keepalive と異なり、レスポンスは取れない (届けばよい).
   */
  private flushBeacon() {
    if (this.queue.length === 0) return;
    const events = this.queue.splice(0);
    const body: EventBatchRequest = {
      session_id: this.sessionId,
      events,
    };

    // JWT を URL クエリで渡すと漏洩リスクがあるので、Beacon は別経路を推奨
    // ここでは単純化のため Authorization ヘッダの代わりに同じ Cookie 認証 or
    // 公開 endpoint としてのバージョンを別途用意するのが理想.
    // 暫定対応: localStorage の token をリクエストボディに含めて送る案
    const token = this.readToken();
    const blob = new Blob(
      [JSON.stringify({ ...body, _token: token })],
      { type: "application/json" }
    );

    try {
      navigator.sendBeacon("/api/events", blob);
    } catch {
      // sendBeacon が使えない環境では諦める
    }
  }

  private readToken(): string | null {
    try {
      return localStorage.getItem("auth_token");
    } catch {
      return null;
    }
  }

  private getOrCreateSessionId(): string {
    try {
      // セッションごとに新しい ID にしたいので sessionStorage を使う
      const KEY = "analytics_session_id";
      const existing = sessionStorage.getItem(KEY);
      if (existing) return existing;
      const id = this.uuid();
      sessionStorage.setItem(KEY, id);
      return id;
    } catch {
      return this.uuid();
    }
  }

  private uuid(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    // フォールバック (古いブラウザ用)
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}

/** シングルトン */
export const analytics = new EventBuffer();
