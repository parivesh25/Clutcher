"""Offline tests for the live feed endpoints and the analysis engine (no network)."""
from datetime import date, timedelta

import pytest

import app as app_module
import engine
import skills_vocab
import sources


def make_item(**kw):
    base = {
        "id": "unstop-1", "source": "Unstop", "type": "internship", "title": "Data Analyst Internship",
        "organization": "Acme", "logo": None, "url": "https://unstop.com/x", "location": "Remote", "mode": "Remote",
        "deadline": (date.today() + timedelta(days=10)).isoformat(), "posted": (date.today() - timedelta(days=5)).isoformat(),
        "compensation": "₹10K/month", "skills": ["Python", "SQL", "Data Visualization", "Machine Learning"],
        "requirements": ["Freshers can apply"], "registrations": 500, "views": 4000,
        "description": "", "tags": ["Data Science"],
    }
    base.update(kw)
    return base


FEED = [
    make_item(),
    make_item(id="unstop-2", title="Sales Intern", skills=["Sales", "Communication"], registrations=50),
    make_item(id="devpost-3", source="Devpost", type="hackathon", title="AI Hack", skills=["Machine Learning", "Python"], registrations=20000),
    make_item(id="remotive-4", source="Remotive", type="job", title="React Developer", skills=["React", "TypeScript"], registrations=None),
]


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(sources, "_feed", {"updated_at": "2026-10-28T00:00:00+00:00", "sources": {}, "items": FEED})
    return app_module.create_app({"TESTING": True}).test_client()


def test_skill_aliases_normalise():
    assert skills_vocab.parse_skill_text("python3, ReactJS , dsa,  postgres") == ["Python", "React", "Data Structures", "SQL"]
    assert "Python" in skills_vocab.find_in_text("We need strong Python and Docker skills")


def test_analysis_splits_have_transferable_missing():
    result = engine.analyze(make_item(), ["Python", "SQL", "Data Analysis"])
    assert result["have"] == ["Python", "SQL"]
    assert [t["skill"] for t in result["transferable"]] == ["Data Visualization"]
    assert [g["skill"] for g in result["missing"]] == ["Machine Learning"]
    assert 0 < result["readiness"] < 100
    assert result["steps"] and result["summary"]


def test_recommendations_rank_by_fit_and_skip_unrelated(client):
    res = client.post("/api/recommendations", json={"skills": "Python, SQL"})
    assert res.status_code == 200
    ids = [r["item"]["id"] for r in res.get_json()["items"]]
    assert ids[0] in {"unstop-1", "devpost-3"}
    assert "unstop-2" not in ids  # nothing in common with a sales role
    assert client.post("/api/recommendations", json={}).status_code == 400


def test_trending_uses_registration_counts(client):
    rows = client.get("/api/trending").get_json()["items"]
    assert rows[0]["item"]["id"] == "devpost-3"
    assert all(r["registrations"] for r in rows)


def test_feed_filters_and_prep(client):
    data = client.get("/api/feed?type=hackathon").get_json()
    assert [i["id"] for i in data["items"]] == ["devpost-3"]
    assert data["counts"]["internship"] == 2
    prep = client.post("/api/interview-prep", json={"opportunity_id": "unstop-1", "skills": ["Python"]}).get_json()
    assert prep["role"] == "data" and prep["past_questions"] and prep["predicted_questions"]
    assert client.post("/api/analysis", json={"opportunity_id": "missing"}).status_code == 404
