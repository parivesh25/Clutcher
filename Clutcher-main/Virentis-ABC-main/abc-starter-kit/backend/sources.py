"""Live opportunity feed from free public sources, cached to disk.

Sources (no API keys, no paid quota):
  - Unstop public search API: jobs, internships, hackathons, competitions (with real registration counts)
  - Devpost public API: hackathons (with real registration counts)
  - Remotive public API: remote tech jobs

Everything is normalised into one shape (see `_item`) and saved to data/feed.json, so the app
keeps working from the last good snapshot if the network drops during a demo.
LinkedIn and Naukri are deliberately not scraped: they block bots and forbid it in their terms.
"""
import html
import json
import logging
import os
import re
import threading
import time
from datetime import datetime, timezone

import requests

import skills_vocab

log = logging.getLogger(__name__)

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
FEED_PATH = os.path.join(DATA_DIR, "feed.json")
STALE_AFTER_SECONDS = 6 * 3600
UA = {"User-Agent": "Mozilla/5.0 (SkillBridge student project; contact via GitHub)"}

_lock = threading.Lock()
_refreshing = threading.Event()
_feed = None  # {"updated_at": iso, "sources": {...}, "items": [...]}


# ---------- helpers ----------
def _text(raw, limit=700):
    s = re.sub(r"<(br|/p|/li|/h\d)[^>]*>", "\n", str(raw or ""), flags=re.I)
    s = html.unescape(re.sub(r"<[^>]+>", " ", s))
    s = re.sub(r"[ \t\r\f\v]+", " ", s)
    s = re.sub(r"\n\s*\n+", "\n", s).strip()
    return s[:limit].rsplit(" ", 1)[0] + "…" if len(s) > limit else s


def _date(raw):
    """Any ISO-ish timestamp -> 'YYYY-MM-DD' (or None)."""
    m = re.match(r"(\d{4}-\d{2}-\d{2})", str(raw or ""))
    return m.group(1) if m else None


def _money(amount, currency="INR"):
    if not amount:
        return None
    symbol = "₹" if currency in {"INR", "fa-rupee"} else "$"
    amount = float(amount)
    if symbol == "₹" and amount >= 100000:
        return f"₹{amount / 100000:.1f}".rstrip("0").rstrip(".") + " LPA"
    if amount >= 1000:
        return f"{symbol}{amount / 1000:.0f}K"
    return f"{symbol}{amount:.0f}"


def _listing_skills(raw_skills, fallback_text=""):
    """Map a listing's skill names onto the vocabulary; keep unknown ones as written."""
    out = []
    for raw in raw_skills or []:
        name = skills_vocab.canonical(raw)
        if name.lower() == str(raw).strip().lower() and name not in skills_vocab.SKILLS:
            spotted = skills_vocab.find_in_text(str(raw), limit=1)
            name = spotted[0] if spotted else name
        if name and name not in out:
            out.append(name)
    if not out and fallback_text:
        out = skills_vocab.find_in_text(fallback_text, limit=6)
    return out[:10]


def _item(**kw):
    base = {
        "id": "", "source": "", "type": "", "title": "", "organization": "", "logo": None,
        "url": "", "location": "", "mode": "", "deadline": None, "posted": None,
        "compensation": None, "skills": [], "requirements": [], "registrations": None,
        "views": None, "description": "", "tags": [],
    }
    base.update(kw)
    return base


# ---------- Unstop ----------
UNSTOP_URL = "https://unstop.com/api/public/opportunity/search-result"
UNSTOP_TYPES = {"jobs": "job", "internships": "internship", "hackathons": "hackathon", "competitions": "competition"}


def _unstop_item(x, kind):
    job = x.get("jobDetail") or {}
    regn = x.get("regnRequirements") or {}
    org = x.get("organisation") or {}

    cities = [loc.get("city") for loc in x.get("locations") or [] if loc.get("city")]
    cities += [c for c in job.get("locations") or [] if c not in cities]
    addr = x.get("address_with_country_logo") or {}
    if not cities and addr.get("city"):
        cities = [addr["city"]]
    mode = {"wfh": "Remote", "in_office": "In office", "hybrid": "Hybrid", "on_field": "On field"}.get(
        job.get("type"), (x.get("region") or "").capitalize())
    location = ", ".join(cities[:3]) or ("Online" if (x.get("region") or "") == "online" else "India")

    compensation = None
    if job and job.get("show_salary") and not job.get("not_disclosed"):
        lo, hi = job.get("min_salary"), job.get("max_salary")
        per = {"monthly": "/month", "annually": "/year"}.get(job.get("pay_in"), "")
        if job.get("pay_in") == "annually":
            compensation = _money(hi or lo)
        elif lo and hi and lo != hi:
            compensation = f"{_money(lo)}–{_money(hi)}{per}"
        elif hi or lo:
            compensation = f"{_money(hi or lo)}{per}"
    elif job.get("paid_unpaid") == "unpaid":
        compensation = "Unpaid"
    prizes = x.get("prizes") or []
    prize_cash = sum(p.get("cash") or 0 for p in prizes)
    if prize_cash and not compensation:
        compensation = f"{_money(prize_cash)} in prizes"

    requirements = []
    eligible = [f["name"] for f in x.get("filters") or [] if f.get("type") == "eligible"]
    if eligible:
        requirements.append("Eligible: " + ", ".join(eligible[:5]))
    if job.get("min_experience"):
        requirements.append(f"Minimum experience: {job['min_experience']} year(s)")
    elif kind in {"job", "internship"}:
        requirements.append("Freshers can apply")
    lo_t, hi_t = regn.get("min_team_size"), regn.get("max_team_size")
    if hi_t and hi_t > 1:
        requirements.append(f"Team size: {lo_t}–{hi_t}")
    if job.get("timing"):
        requirements.append(job["timing"].replace("_", " ").capitalize())
    if any(p.get("pre_placement_opportunity") or p.get("pre_placement_internship") for p in prizes):
        requirements.append("Winners get a pre-placement offer/interview")

    raw_skills = [s.get("skill_name") or s.get("skill") for s in x.get("required_skills") or []]
    description = _text(x.get("details"))
    return _item(
        id=f"unstop-{x['id']}", source="Unstop", type=kind, title=_text(x.get("title"), 160),
        organization=org.get("name") or "", logo=x.get("logoUrl2") or org.get("logoUrl"),
        url=x.get("seo_url") or f"https://unstop.com/{x.get('public_url', '')}",
        location=location, mode=mode,
        deadline=_date(regn.get("end_regn_dt") or x.get("end_date")),
        posted=_date(x.get("approved_date") or x.get("updated_at")),
        compensation=compensation,
        skills=_listing_skills(raw_skills, description),
        requirements=requirements,
        registrations=x.get("registerCount"), views=x.get("viewsCount"),
        description=description,
        tags=[w["name"] for w in x.get("workfunction") or []][:4],
        org_url=f"https://unstop.com/{org['public_url']}" if org.get("public_url") else None,
    )


# Unstop's default ordering is mostly sales roles, so jobs and internships also get tech searches.
UNSTOP_TECH_TERMS = ["software", "developer", "data", "ai", "web", "python", "design"]


def _unstop_page(path, kind, page, per_page, term=None):
    params = {"opportunity": path, "page": page, "per_page": per_page, "oppstatus": "open"}
    if term:
        params["searchTerm"] = term
    res = requests.get(UNSTOP_URL, params=params, headers=UA, timeout=20)
    res.raise_for_status()
    rows = (res.json().get("data") or {}).get("data") or []
    items = []
    for row in rows:
        try:
            items.append(_unstop_item(row, kind))
        except Exception as exc:  # one odd listing must not sink the whole feed
            log.warning("Skipping Unstop listing %s: %s", row.get("id"), exc)
    return items, len(rows)


def fetch_unstop(pages=3, per_page=30):
    items = []
    for path, kind in UNSTOP_TYPES.items():
        for page in range(1, pages + 1):
            got, n = _unstop_page(path, kind, page, per_page)
            items += got
            if n < per_page:
                break
        if kind in {"job", "internship"}:
            for term in UNSTOP_TECH_TERMS:
                items += _unstop_page(path, kind, 1, per_page, term)[0]
    return items


# ---------- Devpost ----------
def fetch_devpost(pages=4):
    items = []
    for page in range(1, pages + 1):
        res = requests.get("https://devpost.com/api/hackathons",
                           params=[("status[]", "open"), ("status[]", "upcoming"), ("page", page)],
                           headers=UA, timeout=20)
        res.raise_for_status()
        rows = res.json().get("hackathons") or []
        for h in rows:
            themes = [t["name"] for t in h.get("themes") or []]
            prize = _text(h.get("prize_amount"), 40)
            prize = re.sub(r"([$€£₹])\s+", lambda m: m.group(1), prize)
            loc = (h.get("displayed_location") or {}).get("location") or "Online"
            dates = h.get("submission_period_dates") or ""
            end = None
            m = re.search(r"-\s*([A-Z][a-z]{2}) (\d{1,2}), (\d{4})$", dates)
            if m:
                try:
                    end = datetime.strptime(" ".join(m.groups()), "%b %d %Y").date().isoformat()
                except ValueError:
                    end = None
            items.append(_item(
                id=f"devpost-{h['id']}", source="Devpost", type="hackathon",
                title=h.get("title", ""), organization=h.get("organization_name") or "",
                logo=("https:" + h["thumbnail_url"]) if str(h.get("thumbnail_url", "")).startswith("//") else h.get("thumbnail_url"),
                url=h.get("url", ""), location=loc, mode="Online" if loc.lower() == "online" else "In person",
                deadline=end, compensation=(prize + " in prizes") if prize and prize != "0" else None,
                skills=skills_vocab.find_in_text(" ".join(themes) + " " + h.get("title", ""), limit=6),
                requirements=[r for r in [
                    "Open to everyone" if not h.get("invite_only") else "Invite only",
                    f"Submission period: {dates}" if dates else "",
                    h.get("time_left_to_submission") or "",
                ] if r],
                registrations=h.get("registrations_count"),
                description=f"{h.get('title', '')} — themes: {', '.join(themes) or 'open'}. Submission period {dates}.",
                tags=themes[:4],
            ))
        if len(rows) == 0:
            break
    return items


# ---------- Remotive ----------
def fetch_remotive():
    items = []
    for category, limit in (("software-dev", 50), ("data", 20), ("devops", 10)):
        res = requests.get("https://remotive.com/api/remote-jobs",
                           params={"category": category, "limit": limit}, headers=UA, timeout=20)
        res.raise_for_status()
        for j in res.json().get("jobs") or []:
            description = _text(j.get("description"))
            title = j.get("title", "")
            kind = "internship" if re.search(r"\bintern(ship)?\b", title, re.I) else "job"
            items.append(_item(
                id=f"remotive-{j['id']}", source="Remotive", type=kind, title=title,
                organization=j.get("company_name") or "", logo=j.get("company_logo_url") or j.get("company_logo"),
                url=j.get("url", ""), location=j.get("candidate_required_location") or "Worldwide", mode="Remote",
                posted=_date(j.get("publication_date")), compensation=j.get("salary") or None,
                skills=_listing_skills(j.get("tags"), title + " " + description),
                requirements=[r for r in [
                    f"Location: {j.get('candidate_required_location') or 'Worldwide'}",
                    (j.get("job_type") or "").replace("_", " ").capitalize(),
                ] if r],
                description=description, tags=[j.get("category") or ""],
            ))
    return items


SOURCES = {"Unstop": fetch_unstop, "Devpost": fetch_devpost, "Remotive": fetch_remotive}


# ---------- cache ----------
def _still_open(item, today):
    return not item["deadline"] or item["deadline"] >= today


def refresh():
    """Fetch every source; keep the old items for any source that fails this time."""
    if _refreshing.is_set():
        return get_feed()
    _refreshing.set()
    try:
        old = load()
        old_by_source = {}
        for it in old.get("items", []):
            old_by_source.setdefault(it["source"], []).append(it)

        items, status = [], {}
        for name, fetch in SOURCES.items():
            try:
                got = fetch()
                items += got
                status[name] = {"ok": True, "count": len(got)}
            except Exception as exc:
                log.warning("Source %s failed: %s", name, exc)
                kept = old_by_source.get(name, [])
                items += kept
                status[name] = {"ok": False, "count": len(kept), "error": str(exc)[:200]}

        today = datetime.now(timezone.utc).date().isoformat()
        seen, unique = set(), []
        for it in items:
            if it["id"] not in seen and it["title"] and it["url"] and _still_open(it, today):
                seen.add(it["id"])
                unique.append(it)

        feed = {"updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "sources": status, "items": unique}
        if unique:
            _save(feed)
        return get_feed()
    finally:
        _refreshing.clear()


def _save(feed):
    global _feed
    os.makedirs(DATA_DIR, exist_ok=True)
    tmp = FEED_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(feed, f, ensure_ascii=False)
    os.replace(tmp, FEED_PATH)
    with _lock:
        _feed = feed


def load():
    global _feed
    with _lock:
        if _feed is not None:
            return _feed
    try:
        with open(FEED_PATH, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        data = {"updated_at": None, "sources": {}, "items": []}
    with _lock:
        _feed = data
    return data


def get_feed():
    return load()


def is_stale():
    updated = load().get("updated_at")
    if not updated:
        return True
    try:
        age = time.time() - datetime.fromisoformat(updated).timestamp()
    except ValueError:
        return True
    return age > STALE_AFTER_SECONDS


def refresh_in_background():
    if not _refreshing.is_set():
        threading.Thread(target=refresh, daemon=True).start()


def find(item_id):
    return next((it for it in load().get("items", []) if it["id"] == item_id), None)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    feed = refresh()
    print(json.dumps(feed["sources"], indent=2))
    print(f"{len(feed['items'])} open opportunities saved to {FEED_PATH}")
