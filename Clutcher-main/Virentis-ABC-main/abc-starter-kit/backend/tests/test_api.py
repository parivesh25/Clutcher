"""API tests with the database, login and AI faked out, so they run offline."""
import uuid

import pytest
import requests

import ai
import app as app_module
import audit
import auth
import db

USER_A = {"id": str(uuid.uuid4()), "email": "a@example.com"}
USER_B = {"id": str(uuid.uuid4()), "email": "b@example.com"}
TOKENS = {"token-a": USER_A, "token-b": USER_B}


@pytest.fixture
def client(monkeypatch):
    records, audit_rows = {}, []

    monkeypatch.setattr(auth, "verify_token", lambda t: TOKENS.get(t))
    monkeypatch.setattr(db, "get_role", lambda uid: "user")

    def insert_record(data):
        rid = str(uuid.uuid4())
        rec = {"id": rid, "created_at": "2026-10-24T10:00:00+00:00", "status": "open",
               "category": "general", "body": "", "ai_summary": None, **data}
        records[rid] = rec
        return rec

    monkeypatch.setattr(db, "insert_record", insert_record)
    monkeypatch.setattr(db, "list_records", lambda owner=None: [r for r in records.values() if not owner or r["owner"] == owner])
    monkeypatch.setattr(db, "get_record", lambda rid: records.get(rid))
    monkeypatch.setattr(db, "update_record", lambda rid, f: records[rid].update(f) or records[rid])
    monkeypatch.setattr(db, "delete_record", lambda rid: records.pop(rid))
    monkeypatch.setattr(db, "last_audit_hash", lambda: audit_rows[-1]["hash"] if audit_rows else None)
    monkeypatch.setattr(db, "insert_audit", lambda row: audit_rows.append({"id": len(audit_rows) + 1, **row}))
    monkeypatch.setattr(db, "list_audit_all", lambda: list(audit_rows))
    monkeypatch.setattr(db, "list_audit", lambda actor=None, limit=50: [r for r in audit_rows if not actor or r["actor"] == actor])
    monkeypatch.setattr(ai, "summarize", lambda text: "- a short summary")
    app_module.limiter.reset()
    app_module.cache.clear()

    app = app_module.create_app({"TESTING": True, "SUPABASE_URL": "http://x", "SUPABASE_ANON_KEY": "a",
                                 "SUPABASE_SERVICE_KEY": "s", "GEMINI_API_KEY": "g"})
    c = app.test_client()
    c.audit_rows = audit_rows
    return c


def auth_h(token="token-a"):
    return {"Authorization": f"Bearer {token}"}


def test_health_needs_no_login(client):
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json["status"] == "ok" and r.json["gemini_configured"] is True


def test_records_require_login(client):
    assert client.get("/api/records").status_code == 401
    assert client.get("/api/records", headers=auth_h("fake")).status_code == 401


def test_auth_service_outage_is_not_reported_as_expired_login(client, monkeypatch):
    def unavailable(_):
        raise auth.AuthServiceUnavailable

    monkeypatch.setattr(auth, "verify_token", unavailable)
    response = client.get("/api/skills", headers=auth_h())
    assert response.status_code == 503
    assert "temporarily unavailable" in response.json["error"]


def test_token_verifier_reports_network_outage(monkeypatch):
    def connection_failed(*_args, **_kwargs):
        raise requests.ConnectionError("offline")

    monkeypatch.setattr(auth.requests, "get", connection_failed)
    app = app_module.create_app({"TESTING": True, "SUPABASE_URL": "http://x", "SUPABASE_ANON_KEY": "a"})
    with app.app_context(), pytest.raises(auth.AuthServiceUnavailable):
        auth.verify_token("token-a")


def test_roadmap_uses_backend_gaps_and_caches_ai_result(client, monkeypatch):
    opportunity_id = str(uuid.uuid4())
    opportunity = {
        "id": opportunity_id, "title": "Example event", "opportunity_type": "hackathon",
        "review_status": "approved", "source_status": "open",
        "application_deadline_date": "2099-01-01", "required_skill_ids": ["python", "sql"],
        "preferred_skill_ids": [], "eligibility": {"unrestricted": True},
    }
    monkeypatch.setattr(db, "get_opportunity", lambda _id: opportunity)
    monkeypatch.setattr(db, "list_skills", lambda: [{"id": "sql", "name": "SQL"}])
    calls = []

    def learning_actions(kind, skills):
        calls.append((kind, skills))
        return ["Build a small SQL query project."]

    monkeypatch.setattr(ai, "learning_actions", learning_actions)
    body = {"profile": {"skill_ids": ["python"], "country_code": None, "study_level": None, "graduation_year": None}}
    for _ in range(2):
        response = client.post(f"/api/opportunities/{opportunity_id}/roadmap", json=body, headers=auth_h())
        assert response.status_code == 200
        assert response.json["steps"] == [{"skill_id": "sql", "skill_name": "SQL", "action": "Build a small SQL query project."}]
        assert response.json["plan_source"] == "gemini"
    assert calls == [("hackathon", ["SQL"])]


def test_roadmap_falls_back_when_gemini_denies_access(client, monkeypatch):
    opportunity_id = str(uuid.uuid4())
    monkeypatch.setattr(db, "get_opportunity", lambda _id: {
        "id": opportunity_id, "title": "Example internship", "opportunity_type": "internship",
        "review_status": "approved", "source_status": "open",
        "application_deadline_date": "2099-01-01", "required_skill_ids": ["sql"],
        "preferred_skill_ids": [], "eligibility": {"unrestricted": True},
    })
    monkeypatch.setattr(db, "list_skills", lambda: [{"id": "sql", "name": "SQL"}])

    def denied(*_args):
        raise RuntimeError("project denied")

    monkeypatch.setattr(ai, "learning_actions", denied)
    body = {"profile": {"skill_ids": [], "country_code": None, "study_level": None, "graduation_year": None}}
    response = client.post(f"/api/opportunities/{opportunity_id}/roadmap", json=body, headers=auth_h())
    assert response.status_code == 200
    assert response.json["plan_source"] == "basic"
    assert response.json["steps"][0]["skill_name"] == "SQL"
    assert "portfolio" in response.json["steps"][0]["action"]


def test_roadmap_rejects_bad_opportunity_id(client):
    response = client.post("/api/opportunities/not-an-id/roadmap", json={"profile": {}}, headers=auth_h())
    assert response.status_code == 404


def test_create_list_and_audit(client):
    r = client.post("/api/records", json={"title": "First case", "category": "health"}, headers=auth_h())
    assert r.status_code == 201
    assert len(client.get("/api/records", headers=auth_h()).json) == 1
    assert client.get("/api/audit/verify", headers=auth_h()).json["ok"] is True
    assert client.audit_rows[0]["action"] == "record.create"


def test_validation_rejects_bad_input(client):
    assert client.post("/api/records", json={"title": "  "}, headers=auth_h()).status_code == 400
    assert client.post("/api/records", json={"title": "x", "status": "hacked"}, headers=auth_h()).status_code == 400


def test_only_owner_can_touch_a_record(client):
    rid = client.post("/api/records", json={"title": "Mine"}, headers=auth_h()).json["id"]
    assert client.put(f"/api/records/{rid}", json={"title": "Stolen"}, headers=auth_h("token-b")).status_code == 404
    assert client.delete(f"/api/records/{rid}", headers=auth_h("token-b")).status_code == 404
    assert client.get("/api/records", headers=auth_h("token-b")).json == []


def test_bad_record_id_is_rejected(client):
    assert client.delete("/api/records/not-a-uuid", headers=auth_h()).status_code == 404


def test_update_and_delete_are_audited(client):
    rid = client.post("/api/records", json={"title": "T"}, headers=auth_h()).json["id"]
    assert client.put(f"/api/records/{rid}", json={"status": "done"}, headers=auth_h()).status_code == 200
    assert client.delete(f"/api/records/{rid}", headers=auth_h()).status_code == 200
    assert [r["action"] for r in client.audit_rows] == ["record.create", "record.update", "record.delete"]
    assert client.get("/api/audit/verify", headers=auth_h()).json["ok"] is True


def test_tampering_is_caught_by_verify(client):
    client.post("/api/records", json={"title": "A"}, headers=auth_h())
    client.post("/api/records", json={"title": "B"}, headers=auth_h())
    client.audit_rows[0]["payload"] = {"title": "edited in the database"}
    result = client.get("/api/audit/verify", headers=auth_h()).json
    assert result["ok"] is False and result["broken_at"] == 1


def test_ai_summary_saved_and_rate_limited(client):
    rid = client.post("/api/records", json={"title": "Long text", "body": "hello"}, headers=auth_h()).json["id"]
    r = client.post(f"/api/records/{rid}/summarize", headers=auth_h())
    assert r.status_code == 200 and r.json["ai_summary"] == "- a short summary"
    app_module.limiter.max_calls = 2
    app_module.limiter.reset()
    codes = [client.post("/api/ai/summarize", json={"text": f"t{i}"}, headers=auth_h()).status_code for i in range(3)]
    assert codes == [200, 200, 429]
    app_module.limiter.max_calls = 10


def test_extract_rejects_odd_field_names(client):
    r = client.post("/api/ai/extract", json={"text": "hi", "fields": ["name; drop table"]}, headers=auth_h())
    assert r.status_code == 400


def test_stats_shape(client):
    client.post("/api/records", json={"title": "A", "category": "fraud"}, headers=auth_h())
    s = client.get("/api/stats", headers=auth_h()).json
    assert s["total"] == 1 and s["by_category"] == {"fraud": 1} and s["by_day"][0]["count"] == 1
