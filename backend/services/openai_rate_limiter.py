"""OpenAI API グローバルレート制限器.

Redis が使えればそれを、使えなければ in-memory token bucket にフォールバック.

【100名同時接続対策】
detect_topics などが連発される状況で、OpenAI の RPM/TPM を超えないよう
サーバ側で先回りして制御する.

使用例:
    from services.openai_rate_limiter import get_rate_limiter, RateLimitExceeded

    try:
        get_rate_limiter().try_acquire(estimated_tokens=1500)
    except RateLimitExceeded:
        # app.py の errorhandler が 429 + Retry-After に変換
        raise

    # 続けて OpenAI を呼ぶ
"""

from __future__ import annotations

import threading
import time
from typing import Optional


class RateLimitExceeded(Exception):
    """OpenAI レート制限到達."""

    def __init__(self, retry_after_seconds: float = 1.0):
        self.retry_after_seconds = retry_after_seconds
        super().__init__(f"rate limit exceeded, retry after {retry_after_seconds:.1f}s")


# ----------------------------------------------------------------------
# Redis 版 (Lua スクリプトで原子的に更新)
# ----------------------------------------------------------------------

_REDIS_BUCKET_LUA = """
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local requested = tonumber(ARGV[4])

local data = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(data[1]) or capacity
local last = tonumber(data[2]) or now

local delta = math.max(0, now - last)
tokens = math.min(capacity, tokens + delta * refill)

if tokens >= requested then
    tokens = tokens - requested
    redis.call('HMSET', key, 'tokens', tokens, 'ts', now)
    redis.call('EXPIRE', key, 3600)
    return {1, math.floor(tokens), 0}
else
    local need = requested - tokens
    local wait_ms = math.ceil((need / refill) * 1000)
    redis.call('HMSET', key, 'tokens', tokens, 'ts', now)
    redis.call('EXPIRE', key, 3600)
    return {0, math.floor(tokens), wait_ms}
end
"""


class _RedisBackend:
    def __init__(self, redis_client, key_prefix: str):
        self.redis = redis_client
        self.key_prefix = key_prefix
        self._script = redis_client.register_script(_REDIS_BUCKET_LUA)

    def consume(self, bucket: str, capacity: int, refill: float, requested: int) -> tuple[bool, int]:
        key = f"{self.key_prefix}:{bucket}"
        result = self._script(
            keys=[key],
            args=[capacity, refill, time.time(), requested],
        )
        success = result[0] == 1
        wait_ms = int(result[2])
        return success, wait_ms


# ----------------------------------------------------------------------
# In-memory 版 (Redis 未使用環境用フォールバック)
# ----------------------------------------------------------------------

class _MemoryBackend:
    def __init__(self):
        self._buckets: dict[str, dict[str, float]] = {}
        self._lock = threading.Lock()

    def consume(self, bucket: str, capacity: int, refill: float, requested: int) -> tuple[bool, int]:
        with self._lock:
            now = time.time()
            state = self._buckets.get(bucket)
            if state is None:
                state = {"tokens": float(capacity), "ts": now}
                self._buckets[bucket] = state

            # 補充
            delta = max(0.0, now - state["ts"])
            state["tokens"] = min(capacity, state["tokens"] + delta * refill)
            state["ts"] = now

            if state["tokens"] >= requested:
                state["tokens"] -= requested
                return True, 0
            else:
                need = requested - state["tokens"]
                wait_ms = int((need / refill) * 1000) + 1
                return False, wait_ms


# ----------------------------------------------------------------------
# レート制限器
# ----------------------------------------------------------------------

class OpenAIRateLimiter:
    """RPM (Requests/min) と TPM (Tokens/min) の 2 本のバケットを保持."""

    def __init__(
        self,
        redis_client=None,
        rpm_limit: int = 800,
        tpm_limit: int = 160_000,
        key_prefix: str = "rl:openai",
        enabled: bool = True,
    ):
        self.enabled = enabled
        self.rpm_capacity = rpm_limit
        self.rpm_refill = rpm_limit / 60.0
        self.tpm_capacity = tpm_limit
        self.tpm_refill = tpm_limit / 60.0

        if redis_client is not None:
            self.backend = _RedisBackend(redis_client, key_prefix)
            self.backend_name = "redis"
        else:
            self.backend = _MemoryBackend()
            self.backend_name = "memory"

    def try_acquire(self, estimated_tokens: int = 1000) -> None:
        """1 リクエスト分 + estimated_tokens 分を取得. 失敗時は RateLimitExceeded."""
        if not self.enabled:
            return

        # RPM
        ok_rpm, wait_rpm = self.backend.consume("rpm", self.rpm_capacity, self.rpm_refill, 1)
        if not ok_rpm:
            raise RateLimitExceeded(retry_after_seconds=wait_rpm / 1000.0)

        # TPM
        ok_tpm, wait_tpm = self.backend.consume(
            "tpm", self.tpm_capacity, self.tpm_refill, estimated_tokens
        )
        if not ok_tpm:
            raise RateLimitExceeded(retry_after_seconds=wait_tpm / 1000.0)


# ----------------------------------------------------------------------
# シングルトン
# ----------------------------------------------------------------------

_limiter: Optional[OpenAIRateLimiter] = None


def init_rate_limiter(
    redis_client=None,
    rpm_limit: int = 800,
    tpm_limit: int = 160_000,
    enabled: bool = True,
) -> OpenAIRateLimiter:
    """app.py の create_app から呼ぶ."""
    global _limiter
    _limiter = OpenAIRateLimiter(
        redis_client=redis_client,
        rpm_limit=rpm_limit,
        tpm_limit=tpm_limit,
        enabled=enabled,
    )
    return _limiter


def get_rate_limiter() -> OpenAIRateLimiter:
    """初期化されていなければ in-memory のデフォルト値で自動生成."""
    global _limiter
    if _limiter is None:
        # 安全側のフォールバック(本来は init_rate_limiter() を呼ぶべき)
        _limiter = OpenAIRateLimiter(redis_client=None)
    return _limiter