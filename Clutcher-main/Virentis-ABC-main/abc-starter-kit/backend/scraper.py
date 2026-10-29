"""Web scraping module using Firecrawl and LLM extraction for PS-61 opportunities."""
import datetime
import json
import os
import re
from urllib.parse import urlparse

import requests
from dotenv import load_dotenv

import domain_schema

load_dotenv()

DEFAULT_CATALOGUE_SKILLS = [
    {"id": "python", "name": "Python", "aliases": ["py", "python3"]},
    {"id": "javascript", "name": "JavaScript", "aliases": ["js", "es6", "node", "nodejs"]},
    {"id": "typescript", "name": "TypeScript", "aliases": ["ts"]},
    {"id": "react", "name": "React", "aliases": ["reactjs", "react.js", "react native"]},
    {"id": "flask", "name": "Flask", "aliases": []},
    {"id": "sql", "name": "SQL", "aliases": ["postgresql", "postgres", "mysql", "sqlite"]},
]


class ScraperError(Exception):
    pass


class FirecrawlScraper:
    """Scrapes internship and hackathon pages using the Firecrawl API."""

    def __init__(self, api_key=None):
        self.api_key = api_key or os.getenv("FIRECRAWL_API_KEY", "")
        if self.api_key == "your-firecrawl-key":
            self.api_key = ""

    def _get_headers(self):
        if not self.api_key:
            raise ScraperError("FIRECRAWL_API_KEY is not configured.")
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def scrape_url(self, url):
        """Scrapes a URL using Firecrawl and returns markdown and metadata."""
        if not (url.startswith("http://") or url.startswith("https://")):
            raise ScraperError("Invalid URL. Must start with http:// or https://")

        headers = self._get_headers()
        payload = {
            "url": url,
            "formats": ["markdown"],
        }
        try:
            resp = requests.post(
                "https://api.firecrawl.dev/v1/scrape",
                headers=headers,
                json=payload,
                timeout=45,
            )
        except requests.RequestException as exc:
            raise ScraperError(f"Failed to connect to Firecrawl: {exc}") from exc

        if resp.status_code == 401:
            raise ScraperError("Invalid Firecrawl API key. Please check your credentials.")
        if resp.status_code == 402:
            raise ScraperError("Firecrawl quota or payment limit exceeded.")
        if resp.status_code >= 400:
            raise ScraperError(f"Firecrawl returned error {resp.status_code}: {resp.text[:250]}")

        data = resp.json()
        if not data.get("success", False):
            raise ScraperError(f"Firecrawl scrape failed: {data.get('error', 'Unknown error')}")

        res_data = data.get("data", {})
        return {
            "markdown": res_data.get("markdown", ""),
            "metadata": res_data.get("metadata", {}),
            "source_url": url,
        }

    def extract_with_gemini(self, markdown, url, catalogue_skills):
        """Uses OpenRouter or Gemini to parse scraped opportunity details from markdown."""
        openrouter_key = os.getenv("OPENROUTER_API_KEY", "") or os.getenv("GEMINI_API_KEY", "")
        if not openrouter_key or openrouter_key in ("your-openrouter-key", "your-gemini-key"):
            return None

        skills_summary = ", ".join(f"{s['id']} ({s['name']})" for s in catalogue_skills)

        prompt = f"""
You are an expert data extractor for an internship and hackathon matcher app.
Analyze the opportunity listing text below from {url} and extract structured JSON matching this exact schema:

{{
  "title": "Title of opportunity (max 150 chars)",
  "organization": "Host company or organizing entity",
  "opportunity_type": "internship" or "hackathon",
  "description": "Concise summary (2-4 sentences)",
  "application_deadline_date": "YYYY-MM-DD" or null if not found,
  "theme_tags": ["list", "of", "relevant", "tags", "e.g.", "ai", "web3", "beginner-friendly"],
  "required_skill_ids": ["skill_ids from catalogue matching required skills"],
  "preferred_skill_ids": ["skill_ids from catalogue matching preferred/optional skills"],
  "eligibility": {{
    "allowed_study_levels": ["school", "undergraduate", "postgraduate"],
    "allowed_countries": ["US", "IN", "GLOBAL", etc.],
    "notes": "Any key eligibility criteria or restrictions"
  }}
}}

Catalogue Skill IDs available:
{skills_summary}

Only use skill IDs from the catalogue above for required_skill_ids and preferred_skill_ids.
If unsure of opportunity_type, default to "hackathon" if it mentions hackathon/build/jam, else "internship".

Text:
<listing>
{markdown[:8000]}
</listing>
"""
        model = os.getenv("OPENROUTER_MODEL", "google/gemini-2.0-flash-exp:free")
        try:
            res = requests.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {openrouter_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.1,
                    "response_format": {"type": "json_object"},
                },
                timeout=30,
            )
            if res.status_code == 200:
                raw = res.json()["choices"][0]["message"]["content"].strip()
                if raw.startswith("```"):
                    raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
                return json.loads(raw)
        except Exception:
            pass
        return None

    def heuristic_extract(self, markdown, metadata, url, catalogue_skills):
        """Rule-based extraction fallback when LLM is unavailable."""
        parsed_url = urlparse(url)
        domain = parsed_url.netloc.lower()
        if "devpost" in domain:
            source_name = "devpost"
            default_type = "hackathon"
        elif "unstop" in domain:
            source_name = "unstop"
            default_type = "hackathon" if "hackathon" in url.lower() else "internship"
        elif "mlh" in domain:
            source_name = "mlh"
            default_type = "hackathon"
        elif "linkedin" in domain:
            source_name = "linkedin"
            default_type = "internship"
        else:
            source_name = domain.replace("www.", "").split(".")[0]
            default_type = "hackathon" if "hackathon" in markdown.lower() else "internship"

        title = metadata.get("title") or metadata.get("og:title") or ""
        if not title:
            first_line = markdown.strip().split("\n")[0]
            title = first_line.lstrip("# ").strip()
        title = re.sub(r"\s*\|\s*.*$", "", title)[:150].strip() or f"Opportunity from {source_name}"

        # Match skills from catalogue
        required_skills = []
        md_lower = markdown.lower()
        for skill in catalogue_skills:
            s_id = skill["id"]
            s_name = skill["name"].lower()
            aliases = [a.lower() for a in skill.get("aliases", [])]
            patterns = [s_name] + aliases
            for p in patterns:
                if re.search(r"\b" + re.escape(p) + r"\b", md_lower):
                    required_skills.append(s_id)
                    break

        # Check for date patterns (e.g. 2026-11-15 or Nov 15, 2026)
        deadline = None
        date_match = re.search(r"\b(202[4-9]-\d{2}-\d{2})\b", markdown)
        if date_match:
            deadline = date_match.group(1)

        return {
            "title": title,
            "organization": metadata.get("og:site_name") or source_name.capitalize(),
            "opportunity_type": default_type,
            "description": (metadata.get("description") or markdown[:300].strip()),
            "application_deadline_date": deadline,
            "theme_tags": [default_type, source_name],
            "required_skill_ids": required_skills[:3],
            "preferred_skill_ids": required_skills[3:],
            "eligibility": {"allowed_study_levels": ["undergraduate", "postgraduate"], "allowed_countries": []},
        }

    def parse_opportunity(self, scraped_data, catalogue_skills=None):
        """Transforms Firecrawl scrape output into PS-61 opportunity schema."""
        catalogue_skills = catalogue_skills or DEFAULT_CATALOGUE_SKILLS
        markdown = scraped_data.get("markdown", "")
        metadata = scraped_data.get("metadata", {})
        url = scraped_data.get("source_url", "")

        parsed_url = urlparse(url)
        source_name = parsed_url.netloc.replace("www.", "").split(".")[0] or "web"

        # Try Gemini extraction first, fallback to heuristic
        extracted = self.extract_with_gemini(markdown, url, catalogue_skills)
        if not extracted or not isinstance(extracted, dict):
            extracted = self.heuristic_extract(markdown, metadata, url, catalogue_skills)

        # Validate skill IDs against catalogue
        valid_skill_ids = {s["id"] for s in catalogue_skills}
        req_skills = [s for s in extracted.get("required_skill_ids", []) if s in valid_skill_ids]
        pref_skills = [s for s in extracted.get("preferred_skill_ids", []) if s in valid_skill_ids]

        # Construct opportunity object
        opportunity = {
            "title": str(extracted.get("title", f"Opportunity from {source_name}")).strip()[:180],
            "organization": str(extracted.get("organization") or source_name.capitalize()).strip()[:100],
            "opportunity_type": extracted.get("opportunity_type") if extracted.get("opportunity_type") in {"internship", "hackathon"} else "hackathon",
            "description": str(extracted.get("description", "")).strip()[:3000],
            "source_name": source_name,
            "source_url": url,
            "application_deadline_date": extracted.get("application_deadline_date"),
            "theme_tags": list(extracted.get("theme_tags") or [source_name]),
            "required_skill_ids": req_skills,
            "preferred_skill_ids": pref_skills,
            "eligibility": extracted.get("eligibility") if isinstance(extracted.get("eligibility"), dict) else {},
            "source_status": "open",
            "review_status": "approved",
        }

        return domain_schema.validate_opportunity(opportunity)


def scrape_and_ingest(url, scraper=None, db_module=None):
    """Convenience function: scrapes a URL with Firecrawl and optionally inserts into Supabase."""
    scraper = scraper or FirecrawlScraper()
    scraped = scraper.scrape_url(url)

    skills = DEFAULT_CATALOGUE_SKILLS
    if db_module:
        try:
            skills = db_module.list_skills() or DEFAULT_CATALOGUE_SKILLS
        except Exception:
            skills = DEFAULT_CATALOGUE_SKILLS

    opportunity = scraper.parse_opportunity(scraped, catalogue_skills=skills)

    if db_module:
        try:
            # Check if source_url already exists
            existing = db_module.find_opportunity_by_source(opportunity["source_name"], opportunity["source_url"])
            if existing:
                return {"opportunity": existing, "action": "already_exists"}
            created = db_module.insert_opportunity(opportunity)
            return {"opportunity": created, "action": "created"}
        except Exception as exc:
            # If database error or not configured, return parsed opportunity
            return {"opportunity": opportunity, "action": "parsed_only", "error": str(exc)}

    return {"opportunity": opportunity, "action": "parsed_only"}
