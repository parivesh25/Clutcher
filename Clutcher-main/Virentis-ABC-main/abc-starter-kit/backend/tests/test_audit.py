import audit

ROWS = []


def build_chain(n=4):
    rows, prev = [], audit.GENESIS
    for i in range(1, n + 1):
        ts = f"2026-10-24T10:00:0{i}.000+00:00"
        payload = {"title": f"item {i}"}
        h = audit.compute_hash(prev, "user-1", "record.create", "record", f"id{i}", payload, ts)
        rows.append({"id": i, "actor": "user-1", "action": "record.create", "entity": "record",
                     "entity_id": f"id{i}", "payload": payload, "prev_hash": prev, "hash": h, "ts": ts})
        prev = h
    return rows


def test_untouched_chain_verifies():
    assert audit.verify_chain(build_chain()) == {"ok": True, "checked": 4, "broken_at": None}


def test_empty_chain_is_ok():
    assert audit.verify_chain([])["ok"] is True


def test_edited_payload_is_detected():
    rows = build_chain()
    rows[1]["payload"] = {"title": "changed"}
    result = audit.verify_chain(rows)
    assert result["ok"] is False and result["broken_at"] == 2


def test_deleted_row_is_detected():
    rows = build_chain()
    del rows[1]
    assert audit.verify_chain(rows)["ok"] is False


def test_payload_key_order_does_not_matter():
    a = audit.compute_hash("0", "u", "a", "e", "1", {"x": 1, "y": 2}, "t")
    b = audit.compute_hash("0", "u", "a", "e", "1", {"y": 2, "x": 1}, "t")
    assert a == b
