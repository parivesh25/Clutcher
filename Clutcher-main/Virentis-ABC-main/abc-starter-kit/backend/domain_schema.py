"""Small dependency-free validators shared by PS-61 routes and ingestion."""
import hashlib
import json

ALLOWED_LEVELS = {"school", "undergraduate", "postgraduate", "other"}


def validate_student_profile(data):
    data = data or {}
    skills = data.get("skill_ids", [])
    if not isinstance(skills, list) or not all(isinstance(v, str) and v.strip() for v in skills):
        raise ValueError("skill_ids must be a list of non-empty strings.")
    country = data.get("country_code")
    if country is not None and (not isinstance(country, str) or len(country) != 2):
        raise ValueError("country_code must be a two-letter code or null.")
    level = data.get("study_level")
    if level is not None and level not in ALLOWED_LEVELS:
        raise ValueError("study_level is invalid.")
    year = data.get("graduation_year")
    if year is not None and (not isinstance(year, int) or year < 1900 or year > 2200):
        raise ValueError("graduation_year must be a valid year or null.")
    return {"skill_ids": sorted(set(v.strip().lower() for v in skills)), "country_code": country.upper() if country else None, "study_level": level, "graduation_year": year}


def validate_opportunity(data):
    data = data or {}
    title = str(data.get("title", "")).strip()
    url = str(data.get("source_url", "")).strip()
    if not title or len(title) > 200:
        raise ValueError("title is required and must be at most 200 characters.")
    if not (url.startswith("http://") or url.startswith("https://")):
        raise ValueError("source_url must be an absolute HTTP(S) URL.")
    kind = data.get("opportunity_type")
    if kind not in {"internship", "hackathon"}:
        raise ValueError("opportunity_type must be internship or hackathon.")
    eligibility = data.get("eligibility") or {}
    if not isinstance(eligibility, dict):
        raise ValueError("eligibility must be an object.")
    normalized = {
        **data,
        "title": title,
        "source_url": url,
        "opportunity_type": kind,
        "required_skill_ids": sorted(set(data.get("required_skill_ids", []))),
        "preferred_skill_ids": sorted(set(data.get("preferred_skill_ids", []))),
        "eligibility": eligibility,
    }
    if not str(normalized.get("content_hash") or "").strip():
        hash_input = {key: value for key, value in normalized.items() if key not in {"content_hash", "last_checked_at"}}
        normalized["content_hash"] = hashlib.sha256(
            json.dumps(hash_input, sort_keys=True, separators=(",", ":"), default=str).encode("utf-8")
        ).hexdigest()
    return normalized

