import hashlib
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock


class Cache:
    def __init__(self, path: Path, ttl=86400):
        self.path = path
        self.ttl = ttl
        self.lock = Lock()
        path.parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as conn:
            conn.execute("CREATE TABLE IF NOT EXISTS responses (key TEXT PRIMARY KEY, payload TEXT NOT NULL, created REAL NOT NULL)")
        path.chmod(0o600)

    def connection(self):
        return sqlite3.connect(self.path, timeout=30)

    def get(self, key, load, refresh=False):
        digest = hashlib.sha256(json.dumps(key, sort_keys=True).encode()).hexdigest()
        # Serialize cache misses to avoid duplicate paid AWS queries.
        with self.lock:
            with self.connection() as conn:
                row = conn.execute("SELECT payload, created FROM responses WHERE key=?", (digest,)).fetchone()
            now = datetime.now(timezone.utc).timestamp()
            if row and not refresh and now - row[1] < self.ttl:
                return {"data": json.loads(row[0]), "meta": {"retrieved_at": datetime.fromtimestamp(row[1], timezone.utc).isoformat(), "cached": True}}
            data = load()
            stamp = datetime.now(timezone.utc)
            with self.connection() as conn:
                conn.execute("INSERT OR REPLACE INTO responses VALUES (?, ?, ?)", (digest, json.dumps(data), stamp.timestamp()))
            return {"data": data, "meta": {"retrieved_at": stamp.isoformat(), "cached": False}}
