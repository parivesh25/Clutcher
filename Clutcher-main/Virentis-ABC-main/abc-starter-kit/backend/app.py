"""ABC starter kit: Flask API.

Run:   python app.py        (serves http://127.0.0.1:5000)
Check: open http://127.0.0.1:5000/api/health
"""
import hashlib
import os
import re
import uuid
from collections import Counter

from dotenv import load_dotenv
from flask import Blueprint, Flask, current_app, g, jsonify, request
from flask_cors import CORS

import ai
import audit
import auth
import db
import engine
import scraper
import skills_vocab
import sources
from knowledge_graph import SkillGraph
from knowledge_graph.routes import create_knowledge_graph_blueprint
from domain_schema import validate_opportunity, validate_student_profile
from matching import rank_opportunities
from utils import RateLimiter, TTLCache

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(BACKEND_DIR, ".env")

ALLOWED_STATUS = {"open", "in_progress", "done"}
FIELD_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,29}$")

limiter = RateLimiter(max_calls=10, per_seconds=60)  # per user, AI routes only
cache = TTLCache(ttl_seconds=600)

bp = Blueprint("api", __name__, url_prefix="/api")


# ---------- helpers ----------
def valid_uuid(value):
    try:
        uuid.UUID(str(value))
        return True
    except ValueError:
        return False


def clean_record(data, partial=False):
    """Check and trim what the browser sent. Only these fields are ever saved."""
    out = {}
    max_text = int(os.getenv("MAX_TEXT_CHARS", "8000"))
    if "title" in data or not partial:
        title = str(data.get("title", "")).strip()
        if not title or len(title) > 200:
            return None, "Title is required (200 characters max)."
        out["title"] = title
    if "body" in data:
        body = str(data.get("body") or "")
        if len(body) > max_text:
            return None, f"Text is too long ({max_text} characters max)."
        out["body"] = body
    if "category" in data:
        category = str(data.get("category") or "general").strip()[:50] or "general"
        out["category"] = category
    if "status" in data:
        if data["status"] not in ALLOWED_STATUS:
            return None, "Status must be open, in_progress or done."
        out["status"] = data["status"]
    if partial and not out:
        return None, "Nothing to update."
    return out, None


def ai_gate():
    """Rate-limit AI calls per user so a demo never burns the whole quota."""
    if not limiter.allow(g.user["id"]):
        return jsonify(error="Too many AI requests. Wait a minute and try again."), 429
    return None


def get_owned_record(record_id):
    """Return (record, error_response). Owners and admins only; others just see 'not found'."""
    if not valid_uuid(record_id):
        return None, (jsonify(error="Not found"), 404)
    rec = db.get_record(record_id)
    if not rec or (rec["owner"] != g.user["id"] and g.role != "admin"):
        return None, (jsonify(error="Not found"), 404)
    return rec, None


# ---------- routes ----------
@bp.get("/health")
def health():
    cfg = current_app.config
    ai_configured = bool(
        (cfg.get("OPENROUTER_API_KEY") and cfg["OPENROUTER_API_KEY"] != "your-openrouter-key")
        or (cfg.get("GEMINI_API_KEY") and cfg["GEMINI_API_KEY"] != "your-gemini-key")
    )
    return jsonify(
        status="ok",
        supabase_configured=bool(cfg["SUPABASE_URL"] and cfg["SUPABASE_SERVICE_KEY"] and cfg["SUPABASE_ANON_KEY"]),
        gemini_configured=ai_configured,
        openrouter_configured=ai_configured,
        firecrawl_configured=bool(cfg.get("FIRECRAWL_API_KEY") and cfg["FIRECRAWL_API_KEY"] != "your-firecrawl-key"),
        require_2fa=cfg["REQUIRE_2FA"],
    )


@bp.get("/me")
@auth.login_required
def me():
    return jsonify(id=g.user["id"], email=g.user["email"], role=g.role, aal=g.user["aal"])


@bp.get("/records")
@auth.login_required
def list_records():
    owner = None if g.role == "admin" else g.user["id"]
    return jsonify(db.list_records(owner))


@bp.post("/records")
@auth.login_required
def create_record():
    data, err = clean_record(request.get_json(silent=True) or {})
    if err:
        return jsonify(error=err), 400
    data["owner"] = g.user["id"]
    rec = db.insert_record(data)
    audit.append(g.user["id"], "record.create", "record", rec["id"], {"title": rec["title"]})
    return jsonify(rec), 201


@bp.put("/records/<record_id>")
@auth.login_required
def update_record(record_id):
    rec, resp = get_owned_record(record_id)
    if resp:
        return resp
    data, err = clean_record(request.get_json(silent=True) or {}, partial=True)
    if err:
        return jsonify(error=err), 400
    updated = db.update_record(record_id, data)
    payload = {"fields": ",".join(sorted(data))}
    if "status" in data:
        payload["status"] = data["status"]
    audit.append(g.user["id"], "record.update", "record", record_id, payload)
    return jsonify(updated)


@bp.delete("/records/<record_id>")
@auth.login_required
def delete_record(record_id):
    rec, resp = get_owned_record(record_id)
    if resp:
        return resp
    db.delete_record(record_id)
    audit.append(g.user["id"], "record.delete", "record", record_id, {"title": rec["title"]})
    return jsonify(ok=True)


@bp.post("/records/<record_id>/summarize")
@auth.login_required
def summarize_record(record_id):
    rec, resp = get_owned_record(record_id)
    if resp:
        return resp
    text = f"{rec['title']}\n\n{rec.get('body') or ''}".strip()
    blocked = ai_gate()
    if blocked:
        return blocked
    key = "sum:" + hashlib.sha256(text.encode()).hexdigest()
    summary = cache.get(key)
    if summary is None:
        try:
            summary = ai.summarize(text)
        except Exception as e:  # noqa: BLE001 - never leak details (or keys) to the browser
            current_app.logger.error("Gemini error: %s", e)
            return jsonify(error="The AI service is unavailable right now. Try again shortly."), 502
        cache.set(key, summary)
    updated = db.update_record(record_id, {"ai_summary": summary})
    audit.append(g.user["id"], "record.summarize", "record", record_id, {"model": "gemini"})
    return jsonify(updated)


@bp.post("/ai/summarize")
@auth.login_required
def ai_summarize():
    text = str((request.get_json(silent=True) or {}).get("text", "")).strip()
    max_text = int(os.getenv("MAX_TEXT_CHARS", "8000"))
    if not text or len(text) > max_text:
        return jsonify(error=f"Send some text (up to {max_text} characters)."), 400
    blocked = ai_gate()
    if blocked:
        return blocked
    key = "sum:" + hashlib.sha256(text.encode()).hexdigest()
    summary = cache.get(key)
    if summary is None:
        try:
            summary = ai.summarize(text)
        except Exception as e:  # noqa: BLE001
            current_app.logger.error("Gemini error: %s", e)
            return jsonify(error="The AI service is unavailable right now. Try again shortly."), 502
        cache.set(key, summary)
    return jsonify(text=summary)


@bp.post("/ai/extract")
@auth.login_required
def ai_extract():
    body = request.get_json(silent=True) or {}
    text = str(body.get("text", "")).strip()
    fields = body.get("fields")
    max_text = int(os.getenv("MAX_TEXT_CHARS", "8000"))
    if not text or len(text) > max_text:
        return jsonify(error=f"Send some text (up to {max_text} characters)."), 400
    if not isinstance(fields, list) or not (1 <= len(fields) <= 10) or not all(
        isinstance(f, str) and FIELD_NAME.match(f) for f in fields
    ):
        return jsonify(error="fields must be 1 to 10 simple names such as name, date, amount."), 400
    blocked = ai_gate()
    if blocked:
        return blocked
    try:
        data = ai.extract(text, fields)
    except Exception as e:  # noqa: BLE001
        current_app.logger.error("Gemini error: %s", e)
        return jsonify(error="Could not extract data. Try again or shorten the text."), 502
    return jsonify(data=data)


@bp.get("/stats")
@auth.login_required
def stats():
    owner = None if g.role == "admin" else g.user["id"]
    rows = db.list_records(owner)
    by_day = Counter((r.get("created_at") or "")[:10] for r in rows if r.get("created_at"))
    return jsonify(
        total=len(rows),
        by_status=dict(Counter(r.get("status", "open") for r in rows)),
        by_category=dict(Counter(r.get("category", "general") for r in rows)),
        by_day=[{"day": d, "count": c} for d, c in sorted(by_day.items())],
    )


@bp.get("/audit")
@auth.login_required
def list_audit():
    actor = None if g.role == "admin" else g.user["id"]
    return jsonify(db.list_audit(actor=actor, limit=50))


@bp.get("/audit/verify")
@auth.login_required
def verify_audit():
    return jsonify(audit.verify_chain(db.list_audit_all()))


# ---------- PS-61 opportunity matcher ----------
@bp.get("/skills")
@auth.login_required
def list_skills():
    return jsonify(items=db.list_skills())


@bp.get("/student-profile")
@auth.login_required
def student_profile():
    profile = db.get_student_profile(g.user["id"])
    if not profile:
        profile = {"skill_ids": [], "country_code": None, "study_level": None, "graduation_year": None}
    return jsonify(profile=profile)


@bp.put("/student-profile")
@auth.login_required
def update_student_profile():
    try:
        profile = validate_student_profile(request.get_json(silent=True) or {})
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    return jsonify(profile=db.save_student_profile(g.user["id"], profile))


@bp.get("/opportunities")
@auth.login_required
def opportunities():
    kind = request.args.get("opportunity_type")
    if kind and kind not in {"internship", "hackathon"}:
        return jsonify(error="opportunity_type must be internship or hackathon."), 400
    return jsonify(items=db.list_opportunities(kind))


@bp.post("/matches")
@auth.login_required
def matches():
    body = request.get_json(silent=True) or {}
    try:
        profile = validate_student_profile(body.get("profile") or {})
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    kind = body.get("opportunity_type")
    if kind is not None and kind not in {"internship", "hackathon"}:
        return jsonify(error="opportunity_type must be internship or hackathon."), 400
    if not isinstance(body.get("include_ineligible", False), bool):
        return jsonify(error="include_ineligible must be boolean."), 400
    items = rank_opportunities(profile, db.list_opportunities(kind), include_ineligible=body.get("include_ineligible", False))
    return jsonify(items=items, evaluated_at=__import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat())


@bp.post("/opportunities/<opportunity_id>/roadmap")
@auth.login_required
def opportunity_roadmap(opportunity_id):
    if not valid_uuid(opportunity_id):
        return jsonify(error="Opportunity not found."), 404
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify(error="Send a profile object."), 400
    try:
        profile = validate_student_profile(body.get("profile"))
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    opportunity = db.get_opportunity(opportunity_id)
    if not opportunity:
        return jsonify(error="Opportunity not found."), 404
    ranked = rank_opportunities(profile, [opportunity], include_ineligible=True)
    if not ranked:
        return jsonify(error="This opportunity is no longer open."), 409
    result = ranked[0]
    missing_ids = (result["missing_required_skills"] + result["missing_preferred_skills"])[:5]
    if not missing_ids:
        return jsonify(steps=[], plan_source="no_gaps")
    skill_names = {skill["id"]: skill["name"] for skill in db.list_skills()}
    names = [skill_names.get(skill_id, skill_id) for skill_id in missing_ids]
    cache_key = "roadmap:" + hashlib.sha256(
        (opportunity_id + ":" + str(opportunity.get("content_hash") or "") + ":" + ",".join(missing_ids)).encode("utf-8")
    ).hexdigest()
    plan = cache.get(cache_key)
    if plan is None:
        blocked = ai_gate()
        if blocked:
            return blocked
        try:
            actions = ai.learning_actions(opportunity["opportunity_type"], names)
            source = "gemini"
        except Exception as exc:  # noqa: BLE001 - keep model details out of the response
            current_app.logger.warning("Gemini roadmap unavailable: %s", exc)
            actions = ai.basic_learning_actions(opportunity["opportunity_type"], names)
            source = "basic"
        steps = [
            {"skill_id": skill_id, "skill_name": name, "action": action}
            for skill_id, name, action in zip(missing_ids, names, actions)
        ]
        plan = {"steps": steps, "plan_source": source}
        cache.set(cache_key, plan)
    return jsonify(plan)


@bp.post("/admin/opportunities")
@auth.admin_required
def create_opportunity():
    try:
        opportunity = validate_opportunity(request.get_json(silent=True) or {})
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    return jsonify(opportunity=db.insert_opportunity(opportunity)), 201


@bp.post("/scrape")
@auth.login_required
def scrape_opportunity():
    body = request.get_json(silent=True) or {}
    url = str(body.get("url", "")).strip()
    if not (url.startswith("http://") or url.startswith("https://")):
        return jsonify(error="Valid HTTP(S) URL is required."), 400

    api_key = current_app.config.get("FIRECRAWL_API_KEY")
    if not api_key or api_key == "your-firecrawl-key":
        return jsonify(error="Firecrawl is not configured. Please add FIRECRAWL_API_KEY in backend/.env."), 503

    try:
        f_scraper = scraper.FirecrawlScraper(api_key=api_key)
        result = scraper.scrape_and_ingest(url, scraper=f_scraper, db_module=db)
        return jsonify(result), 200
    except scraper.ScraperError as exc:
        return jsonify(error=str(exc)), 400
    except Exception as exc:
        current_app.logger.error("Scraping error: %s", exc)
        return jsonify(error=f"Failed to scrape opportunity: {exc}"), 500


# ---------- live feed + analysis engine (public, so guests can browse) ----------
refresh_limiter = RateLimiter(max_calls=2, per_seconds=60)
SORTS = {
    "popular": lambda i: -(i.get("registrations") or 0),
    "deadline": lambda i: i.get("deadline") or "9999-12-31",
    "newest": lambda i: "".join(chr(255 - ord(c)) for c in (i.get("posted") or "0000")),
}


def _skills_from_body(body):
    raw = body.get("skills", [])
    if isinstance(raw, str):
        return skills_vocab.parse_skill_text(raw)
    if not isinstance(raw, list):
        return []
    return skills_vocab.canonical_list(str(s)[:60] for s in raw[:60])


def _feed_item_or_404(body):
    item = sources.find(str(body.get("opportunity_id", "")))
    if not item:
        return None, (jsonify(error="That opportunity is no longer listed. Refresh the feed."), 404)
    return item, None


@bp.get("/feed")
def feed():
    data = sources.get_feed()
    items = data.get("items", [])
    kind = request.args.get("type", "").strip()
    query = request.args.get("q", "").strip().lower()
    if kind:
        items = [i for i in items if i["type"] == kind]
    if query:
        items = [i for i in items if query in f"{i['title']} {i['organization']} {' '.join(i['skills'])} {i['location']}".lower()]
    items = sorted(items, key=SORTS.get(request.args.get("sort", "popular"), SORTS["popular"]))
    counts = Counter(i["type"] for i in data.get("items", []))
    return jsonify(updated_at=data.get("updated_at"), sources=data.get("sources", {}),
                   counts=counts, total=len(items), items=items)


@bp.post("/feed/refresh")
def refresh_feed():
    if not refresh_limiter.allow(request.remote_addr or "anon"):
        return jsonify(error="The feed was just refreshed. Try again in a minute."), 429
    data = sources.refresh()
    return jsonify(updated_at=data.get("updated_at"), sources=data.get("sources", {}),
                   total=len(data.get("items", [])))


@bp.get("/trending")
def trending():
    kind = request.args.get("type", "").strip() or None
    limit = min(max(int(request.args.get("limit", 10) or 10), 1), 30)
    return jsonify(items=engine.trending(sources.get_feed().get("items", []), kind=kind, limit=limit))


@bp.post("/recommendations")
def recommendations():
    body = request.get_json(silent=True) or {}
    skills = _skills_from_body(body)
    if not skills:
        return jsonify(error="Add at least one skill to your profile to get recommendations."), 400
    types = [t for t in body.get("types", []) if t in {"job", "internship", "hackathon", "competition"}]
    limit = min(max(int(body.get("limit", 15) or 15), 1), 30)
    recs = engine.recommend(sources.get_feed().get("items", []), skills, types=types, limit=limit)
    return jsonify(skills=skills, items=recs)


@bp.post("/analysis")
def analysis():
    body = request.get_json(silent=True) or {}
    item, err = _feed_item_or_404(body)
    if err:
        return err
    return jsonify(engine.analyze(item, _skills_from_body(body)))


@bp.post("/interview-prep")
def interview_prep():
    body = request.get_json(silent=True) or {}
    item, err = _feed_item_or_404(body)
    if err:
        return err
    return jsonify(engine.interview_prep(item, _skills_from_body(body)))


# ---------- app factory ----------
def create_app(test_config=None):
    # Resolve the environment file from this module, not the terminal's current
    # directory. This keeps local startup consistent for every teammate.
    load_dotenv(ENV_PATH)
    app = Flask(__name__)
    app.config.update(
        SUPABASE_URL=os.getenv("SUPABASE_URL", "").rstrip("/"),
        SUPABASE_ANON_KEY=os.getenv("SUPABASE_ANON_KEY", ""),
        SUPABASE_SERVICE_KEY=os.getenv("SUPABASE_SERVICE_KEY", ""),
        GEMINI_API_KEY=os.getenv("GEMINI_API_KEY", ""),
        GEMINI_MODEL=os.getenv("GEMINI_MODEL", "gemini-3.8-flash"),
        OPENROUTER_API_KEY=os.getenv("OPENROUTER_API_KEY", ""),
        OPENROUTER_MODEL=os.getenv("OPENROUTER_MODEL", "google/gemini-2.0-flash-exp:free"),
        FIRECRAWL_API_KEY=os.getenv("FIRECRAWL_API_KEY", ""),
        REQUIRE_2FA=os.getenv("REQUIRE_2FA", "false").lower() == "true",
        FRONTEND_ORIGINS=[o.strip() for o in os.getenv(
            "FRONTEND_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()],
        MAX_CONTENT_LENGTH=1_000_000,  # reject request bodies over 1 MB
    )
    if test_config:
        app.config.update(test_config)

    CORS(app, resources={r"/api/*": {"origins": app.config["FRONTEND_ORIGINS"]}},
         allow_headers=["Authorization", "Content-Type"])
    app.register_blueprint(bp)
    app.register_blueprint(create_knowledge_graph_blueprint(SkillGraph.load()))

    # Serve the saved snapshot straight away; top it up from the live sites in the background.
    if not app.config.get("TESTING") and sources.is_stale():
        sources.refresh_in_background()

    @app.after_request
    def security_headers(resp):
        resp.headers["X-Content-Type-Options"] = "nosniff"
        resp.headers["Cache-Control"] = "no-store"
        return resp

    @app.errorhandler(db.DBError)
    def db_error(e):
        app.logger.error("%s", e)
        return jsonify(error="Database problem. Check the backend terminal for details."), 502

    @app.errorhandler(404)
    def not_found(_):
        return jsonify(error="Not found"), 404

    @app.errorhandler(405)
    def bad_method(_):
        return jsonify(error="Method not allowed"), 405

    @app.errorhandler(413)
    def too_big(_):
        return jsonify(error="Request too large"), 413

    return app


if __name__ == "__main__":
    # debug=True is for local development only. Never run it on a public server.
    create_app().run(host="127.0.0.1", port=int(os.getenv("PORT", "5000")), debug=True)

