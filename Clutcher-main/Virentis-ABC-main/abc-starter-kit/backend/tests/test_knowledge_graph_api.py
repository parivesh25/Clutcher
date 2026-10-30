"""Knowledge-graph routes inside the main Flask app (auth and database faked, no network)."""
import pytest

import app as app_module
import auth
import db


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(auth, "verify_token", lambda token: {"id": "user-1", "email": "a@b.c"} if token == "good" else None)
    monkeypatch.setattr(auth, "_aal", lambda token: "aal1")
    monkeypatch.setattr(db, "get_role", lambda uid: "user")
    store = {}

    def list_progress(user_id):
        return [r for r in store.values() if r["user_id"] == user_id]

    def replace_progress(user_id, rows):
        for key in [k for k, r in store.items() if r["user_id"] == user_id]:
            del store[key]
        for row in rows:
            row.setdefault("learned_at", "2026-10-28T00:00:00+00:00" if row["state"] == "learned" else None)
            store[(user_id, row["skill_id"])] = row
        return list_progress(user_id)

    monkeypatch.setattr(db, "list_skill_progress", list_progress)
    monkeypatch.setattr(db, "replace_skill_progress", replace_progress)
    return app_module.create_app({"TESTING": True, "SUPABASE_URL": "http://mock", "SUPABASE_ANON_KEY": "a", "SUPABASE_SERVICE_KEY": "s"}).test_client()


AUTH = {"Authorization": "Bearer good"}


def test_catalogue_and_related_are_public(client):
    assert len(client.get("/api/knowledge-graph").get_json()["nodes"]) >= 20
    related = client.get("/api/knowledge-graph/related?skill=node js&limit=3").get_json()
    assert related["source"] == "nodejs" and len(related["items"]) == 3
    assert client.get("/api/knowledge-graph/related?skill=nope").status_code == 400


def test_profile_graph_is_public_and_stateless(client):
    response = client.post("/api/knowledge-graph/profile", json={})
    assert response.status_code == 200
    assert response.get_json()["nodes"] == []


def test_profile_graph_ignores_skills_outside_catalogue(client):
    res = client.post("/api/knowledge-graph/profile", headers=AUTH, json={
        "current_skills": ["Python", "Java", "Arduino"],
        "learned_skills": ["Flask API"],
        "resume_text": "Built PostgreSQL APIs and React interfaces.",
    })
    data = res.get_json()
    assert res.status_code == 200
    assert data["unmatched_skills"] == ["Java", "Arduino"]
    states = {n["id"]: n["state"] for n in data["nodes"]}
    assert states["python"] == "base" and states["postgresql"] == "base" and states["flask_api"] == "learned"
    assert any(n["state"] == "suggested" for n in data["nodes"])
    bad = client.post("/api/knowledge-graph/profile", headers=AUTH, json={"current_skills": ["Python"], "expansion_depth": 9})
    assert bad.status_code == 400


def test_progress_round_trip(client):
    res = client.put("/api/knowledge-graph/progress", headers=AUTH, json={
        "base_skill_ids": ["Python", "react"],
        "learned_skill_ids": ["fastapi"],
        "resume_skill_ids": ["react"],
        "positions": {"python": {"x": 0.25, "y": 0.5}, "react": {"x": 4, "y": 0}},
    })
    data = res.get_json()
    assert res.status_code == 200
    assert sorted(data["base_skill_ids"]) == ["python", "react"]
    assert [l["skill_id"] for l in data["learned"]] == ["fastapi"]
    assert data["resume_skill_ids"] == ["react"]
    assert data["positions"] == {"python": {"x": 0.25, "y": 0.5}}  # out-of-range position dropped
    assert client.put("/api/knowledge-graph/progress", headers=AUTH, json={"learned_skill_ids": ["Cobol"]}).status_code == 400
