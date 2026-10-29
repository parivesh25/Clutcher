"""Tests for the Firecrawl scraper module and opportunity ingestion."""
from unittest.mock import MagicMock, patch

import pytest

import app as app_module
import auth
import scraper


SAMPLE_MARKDOWN = """
# DevPost AI Global Hackathon 2026
Hosted by TechCorp

Join us for a 48-hour global virtual hackathon building generative AI applications!
Eligibility: Undergraduate and postgraduate students worldwide.
Deadline: 2026-11-20

### Technologies
We love prototypes built with Python, React, and SQL. Experience with Flask is a plus.
"""


def test_heuristic_extract_hackathon():
    f_scraper = scraper.FirecrawlScraper(api_key="test-key")
    metadata = {"title": "DevPost AI Global Hackathon 2026", "og:site_name": "Devpost"}
    extracted = f_scraper.heuristic_extract(
        SAMPLE_MARKDOWN,
        metadata,
        "https://devpost.com/hackathons/ai-global-2026",
        scraper.DEFAULT_CATALOGUE_SKILLS,
    )
    assert extracted["opportunity_type"] == "hackathon"
    assert "DevPost AI Global Hackathon" in extracted["title"]
    assert "python" in extracted["required_skill_ids"]
    assert "react" in extracted["required_skill_ids"]
    assert extracted["application_deadline_date"] == "2026-11-20"


def test_parse_opportunity_structure():
    f_scraper = scraper.FirecrawlScraper(api_key="test-key")
    scraped_data = {
        "markdown": SAMPLE_MARKDOWN,
        "metadata": {"title": "TechCorp Summer Internship"},
        "source_url": "https://careers.techcorp.com/jobs/intern-2026",
    }
    opp = f_scraper.parse_opportunity(scraped_data)
    assert opp["source_url"] == "https://careers.techcorp.com/jobs/intern-2026"
    assert "content_hash" in opp
    assert opp["source_status"] == "open"
    assert isinstance(opp["required_skill_ids"], list)


@patch("requests.post")
def test_scrape_url_mocked(mock_post):
    mock_post.return_value.status_code = 200
    mock_post.return_value.json.return_value = {
        "success": True,
        "data": {
            "markdown": SAMPLE_MARKDOWN,
            "metadata": {"title": "Mock Hackathon"},
        },
    }
    f_scraper = scraper.FirecrawlScraper(api_key="fc-test")
    res = f_scraper.scrape_url("https://example.com/hackathon")
    assert "DevPost AI Global Hackathon" in res["markdown"]
    assert res["metadata"]["title"] == "Mock Hackathon"


def test_missing_api_key_raises_error(monkeypatch):
    # An empty key falls back to the environment, which a developer's .env may fill.
    monkeypatch.delenv("FIRECRAWL_API_KEY", raising=False)
    f_scraper = scraper.FirecrawlScraper(api_key="")
    with pytest.raises(scraper.ScraperError):
        f_scraper.scrape_url("https://example.com")


def test_scrape_api_route(monkeypatch):
    monkeypatch.setattr(auth, "verify_token", lambda t: {"id": "test-user-id", "email": "test@example.com"})
    monkeypatch.setattr(auth, "db", MagicMock(get_role=lambda uid: "user"))
    app = app_module.create_app({
        "TESTING": True,
        "SUPABASE_URL": "http://mock",
        "SUPABASE_ANON_KEY": "a",
        "SUPABASE_SERVICE_KEY": "s",
        "FIRECRAWL_API_KEY": "",
    })
    client = app.test_client()
    headers = {"Authorization": "Bearer valid-token"}

    # Route should require URL
    resp = client.post("/api/scrape", json={}, headers=headers)
    assert resp.status_code == 400

    # Route should report 503 when Firecrawl not configured
    resp = client.post("/api/scrape", json={"url": "https://example.com"}, headers=headers)
    assert resp.status_code == 503
