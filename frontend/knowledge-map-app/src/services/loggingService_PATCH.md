# `frontend/knowledge-map-app/src/services/loggingService.ts` への変更

既存の `logActivity(...)` を `analytics.track(...)` に委譲する互換シムに置き換えます。
段階的に呼び出し元を `analytics` に置き換えていき、最終的にこのファイルは削除します。

## 置き換え後の loggingService.ts

```ts
/**
 * @deprecated これは互換用のシムです.
 * 新規コードでは `import { analytics } from "@/services/analytics"` を使用してください.
 */
import { analytics } from "./analytics";
import type { ActivityEventType } from "@/types/events";

/**
 * 旧 API 互換の logActivity.
 * 内部で analytics.track を呼ぶ. action 文字列が ActivityEventType に
 * 該当する場合はそれを、そうでなければ "page.viewed" にフォールバック.
 */
export async function logActivity(
  action: string,
  detail?: Record<string, unknown>,
  memoId?: number
): Promise<void> {
  const knownTypes: ActivityEventType[] = [
    "memo.created", "memo.opened", "memo.archived",
    "map.generated", "map.auto_saved", "map.rolled_back", "map.history_opened",
    "node.added_manual", "node.satellite_clicked", "node.connected",
    "node.deleted", "node.clicked", "node.popup_opened",
    "writing.suggestion_clicked", "writing.topic_described", "writing.improve_clicked",
    "mode.switched", "page.viewed",
    "session.started", "session.ended",
    "auth.login_legacy", "auth.login_google", "auth.logout",
  ];

  const type = (knownTypes as string[]).includes(action)
    ? (action as ActivityEventType)
    : "page.viewed";

  // 旧 action 名を payload に保存しておく(後方互換性のため)
  const payload: Record<string, unknown> = {
    ...(detail ?? {}),
    legacy_action: action,
  };

  analytics.track(type, payload, memoId);
}
```

## 段階移行の指針

各呼び出し元 (主に `useDashboard.ts` 内) を順次以下のように書き換える:

```ts
// 旧:
logActivity("manual_node_added", { keyword }, memo.id);

// 新:
analytics.track("node.added_manual", { keyword }, memo.id);
```

すべての呼び出し元を移行しおえたら `loggingService.ts` を削除。
