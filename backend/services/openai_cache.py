"""OpenAI レスポンスキャッシュ.

Redis があれば使用、無ければ in-memory TTL dict.

特に detect_topics 用. 100 名同時接続環境で似た文章の重複呼び出しを抑える.

使用例(ai_service.py 側):
    from services.openai_cache import get_result_cache

    cache = get_result_cache()
    payload = {"text": text, "labels": sorted(node_labels)}

    cached = cache.get("detect_topics", payload)
    if cached is not None:
        return cached

    result = _client.chat.completions.create(...)
    cache.set("detect_topics", payload, result_dict, ttl_seconds=60)
    return result_dict
"""

from __future__ import annotations

import hashlib
import json
import threading
import time
from typing import Any, Optional


class _MemoryCache:
    """簡易 TTL キャッシュ. スレッドセーフ."""

    def __init__(self, max_entries: int = 5000):
        self._data: dict[str, tuple[float, str]] = {}  # key -> (expire_ts, json_str)
        self._lock = threading.Lock()
        self._max_entries = max_entries

    def get(self, key: str) -> Optional[str]:
        with self._lock:
            entry = self._data.get(key)
            if entry is None:
                return None
            expire_ts, value = entry
            if expire_ts < time.time():
                self._data.pop(key, None)
                return None
            return value

    def setex(self, key: str, ttl_seconds: int, value: str) -> None:
        with self._lock:
            # 容量超過時は適当に削る(LRU ではないが本番影響は小さい)
            if len(self._data) >= self._max_entries:
                # 期限切れを掃除
                now = time.time()
                expired = [k for k, (ts, _) in self._data.items() if ts < now]
                for k in expired:
                    self._data.pop(k, None)
                # まだ超過してたら適当に1割捨てる
                if len(self._data) >= self._max_entries:
                    drop_n = max(1, self._max_entries // 10)
                    for k in list(self._data.keys())[:drop_n]:
                        self._data.pop(k, None)
            self._data[key] = (time.time() + ttl_seconds, value)


class OpenAIResultCache:
    """名前空間 + ペイロードハッシュをキーに使う TTL キャッシュ."""

    def __init__(self, redis_client=None, key_prefix: str = "cache:openai"):
        self.redis = redis_client
        self.key_prefix = key_prefix
        self.backend_name = "redis" if redis_client is not None else "memory"
        self._memory = _MemoryCache() if redis_client is None else None

    @staticmethod
    def _hash(payload: Any) -> str:
        s = json.dumps(payload, ensure_ascii=False, sort_keys=True)
        return hashlib.sha256(s.encode("utf-8")).hexdigest()[:32]

    def get(self, namespace: str, payload: Any) -> Optional[dict]:
        key = f"{self.key_prefix}:{namespace}:{self._hash(payload)}"
        try:
            raw = self.redis.get(key) if self.redis is not None else self._memory.get(key)
        except Exception:
            return None
        if raw is None:
            return None
        try:
            return json.loads(raw)
        except (TypeError, json.JSONDecodeError):
            return None

    def set(self, namespace: str, payload: Any, value: dict, ttl_seconds: int = 60) -> None:
        key = f"{self.key_prefix}:{namespace}:{self._hash(payload)}"
        s = json.dumps(value, ensure_ascii=False)
        try:
            if self.redis is not None:
                self.redis.setex(key, ttl_seconds, s)
            else:
                self._memory.setex(key, ttl_seconds, s)
        except Exception:
            pass  # キャッシュ失敗で本処理を止めない


# ----------------------------------------------------------------------
# シングルトン
# ----------------------------------------------------------------------

_cache: Optional[OpenAIResultCache] = None


def init_result_cache(redis_client=None) -> OpenAIResultCache:
    global _cache
    _cache = OpenAIResultCache(redis_client=redis_client)
    return _cache


def get_result_cache() -> OpenAIResultCache:
    global _cache
    if _cache is None:
        _cache = OpenAIResultCache(redis_client=None)
    return _cache