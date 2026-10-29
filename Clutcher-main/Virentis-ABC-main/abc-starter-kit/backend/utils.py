"""Small helpers: a rate limiter (protects your AI quota) and a cache (reuse demo answers)."""
import threading
import time


class RateLimiter:
    """Allow at most `max_calls` per `per_seconds` for each key (for example, each user)."""

    def __init__(self, max_calls=10, per_seconds=60):
        self.max_calls = max_calls
        self.per_seconds = per_seconds
        self._hits = {}
        self._lock = threading.Lock()

    def allow(self, key):
        now = time.monotonic()
        with self._lock:
            recent = [t for t in self._hits.get(key, []) if now - t < self.per_seconds]
            if len(recent) >= self.max_calls:
                self._hits[key] = recent
                return False
            recent.append(now)
            self._hits[key] = recent
            return True

    def reset(self):
        with self._lock:
            self._hits.clear()


class TTLCache:
    """Remember results for `ttl_seconds`. Repeated demo inputs then do not spend API quota."""

    def __init__(self, ttl_seconds=600):
        self.ttl = ttl_seconds
        self._data = {}
        self._lock = threading.Lock()

    def get(self, key):
        with self._lock:
            item = self._data.get(key)
            if not item:
                return None
            value, stored_at = item
            if time.monotonic() - stored_at > self.ttl:
                del self._data[key]
                return None
            return value

    def set(self, key, value):
        with self._lock:
            self._data[key] = (value, time.monotonic())

    def clear(self):
        with self._lock:
            self._data.clear()
