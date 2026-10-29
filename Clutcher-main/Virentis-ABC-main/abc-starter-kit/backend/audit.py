"""Tamper-evident audit log (a hash chain).

Every entry stores the hash of the entry before it. Edit or delete any old entry and
every hash after it stops matching, so verify_chain() can point at the first broken row.
This is *tamper-evident* (you can detect changes), not tamper-proof.
"""
import hashlib
import json
import threading
from datetime import datetime, timezone

import db

GENESIS = "0" * 64
_lock = threading.Lock()  # one writer at a time inside this process


def canonical(payload):
    """Same data always becomes the same string (sorted keys, no spaces).
    Keep payloads to strings and whole numbers: floats can change shape inside the database."""
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def compute_hash(prev_hash, actor, action, entity, entity_id, payload, ts):
    blob = "|".join([prev_hash, str(actor), action, entity, str(entity_id), canonical(payload), ts])
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def verify_chain(rows):
    """rows must be ordered oldest to newest. Returns {ok, checked, broken_at}."""
    prev = GENESIS
    for i, r in enumerate(rows):
        expected = compute_hash(prev, r["actor"], r["action"], r["entity"], r["entity_id"], r["payload"], r["ts"])
        if r["prev_hash"] != prev or r["hash"] != expected:
            return {"ok": False, "checked": i, "broken_at": r.get("id")}
        prev = r["hash"]
    return {"ok": True, "checked": len(rows), "broken_at": None}


def append(actor, action, entity, entity_id, payload):
    with _lock:
        prev = db.last_audit_hash() or GENESIS
        ts = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
        h = compute_hash(prev, actor, action, entity, entity_id, payload, ts)
        db.insert_audit({
            "actor": str(actor), "action": action, "entity": entity, "entity_id": str(entity_id),
            "payload": payload, "prev_hash": prev, "hash": h, "ts": ts,
        })
