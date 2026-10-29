"""Database access. We talk to Supabase's REST API with the SERVICE key (backend only).
All data goes through Flask, so the browser never touches the tables directly."""
from datetime import datetime, timezone

import requests
from flask import current_app


class DBError(Exception):
    pass


def _headers(prefer="return=representation"):
    key = current_app.config["SUPABASE_SERVICE_KEY"]
    h = {"apikey": key, "Content-Type": "application/json", "Prefer": prefer}
    if key.startswith("eyJ"):  # legacy JWT-style keys are also sent as a bearer token
        h["Authorization"] = f"Bearer {key}"
    return h


def rest(method, table, params=None, body=None, prefer="return=representation"):
    url = f"{current_app.config['SUPABASE_URL']}/rest/v1/{table}"
    try:
        r = requests.request(method, url, headers=_headers(prefer), params=params, json=body, timeout=10)
    except requests.RequestException as e:
        raise DBError(f"Database unreachable: {e}")
    if r.status_code >= 400:
        raise DBError(f"Database error {r.status_code}: {r.text[:300]}")
    return r.json() if r.text else []


# ---- users ----
def get_role(user_id):
    rows = rest("GET", "profiles", {"id": f"eq.{user_id}", "select": "role"})
    return rows[0]["role"] if rows else "user"


# ---- records (rename to cases, complaints, expenses... for your problem) ----
def insert_record(data):
    return rest("POST", "records", body=data)[0]


def list_records(owner=None):
    params = {"select": "*", "order": "created_at.desc", "limit": "500"}
    if owner:
        params["owner"] = f"eq.{owner}"
    return rest("GET", "records", params)


def get_record(record_id):
    rows = rest("GET", "records", {"id": f"eq.{record_id}", "select": "*"})
    return rows[0] if rows else None


def update_record(record_id, fields):
    rows = rest("PATCH", "records", {"id": f"eq.{record_id}"}, fields)
    return rows[0] if rows else None


def delete_record(record_id):
    rest("DELETE", "records", {"id": f"eq.{record_id}"})


# ---- audit log ----
def last_audit_hash():
    rows = rest("GET", "audit_log", {"select": "hash", "order": "id.desc", "limit": "1"})
    return rows[0]["hash"] if rows else None


def insert_audit(row):
    rest("POST", "audit_log", body=row)


def list_audit(actor=None, limit=50):
    params = {"select": "id,actor,action,entity,entity_id,hash,ts", "order": "id.desc", "limit": str(limit)}
    if actor:
        params["actor"] = f"eq.{actor}"
    return rest("GET", "audit_log", params)


def list_audit_all():
    return rest("GET", "audit_log", {"select": "*", "order": "id.asc", "limit": "5000"})


# ---- PS-61 opportunities ----
def list_skills():
    return rest("GET", "skills", {"select": "id,name,aliases", "order": "name.asc", "limit": "500"})


def get_student_profile(user_id):
    rows = rest("GET", "student_profiles", {"user_id": f"eq.{user_id}", "select": "*"})
    return rows[0] if rows else None


def save_student_profile(user_id, profile):
    existing = get_student_profile(user_id)
    if existing:
        rows = rest("PATCH", "student_profiles", params={"user_id": f"eq.{user_id}"}, body=profile)
        return rows[0] if rows else {**existing, **profile}
    rows = rest("POST", "student_profiles", body={"user_id": user_id, **profile})
    return rows[0] if rows else get_student_profile(user_id)


def list_opportunities(kind=None):
    params = {"select": "*,opportunity_skills(skill_id,skill_type)", "review_status": "eq.approved", "order": "application_deadline_date.asc.nullslast", "limit": "500"}
    if kind:
        params["opportunity_type"] = f"eq.{kind}"
    rows = rest("GET", "opportunities", params)
    for row in rows:
        _with_opportunity_skills(row)
    return rows


def _with_opportunity_skills(row):
    relations = row.pop("opportunity_skills", [])
    row["required_skill_ids"] = sorted({x["skill_id"] for x in relations if x.get("skill_type") == "required"})
    row["preferred_skill_ids"] = sorted({x["skill_id"] for x in relations if x.get("skill_type") == "preferred"})
    row.setdefault("eligibility", {})
    return row


def get_opportunity(opportunity_id):
    rows = rest("GET", "opportunities", {
        "id": f"eq.{opportunity_id}", "review_status": "eq.approved",
        "select": "*,opportunity_skills(skill_id,skill_type)", "limit": "1",
    })
    return _with_opportunity_skills(rows[0]) if rows else None


def insert_opportunity(opportunity):
    relations = []
    payload = {k: v for k, v in opportunity.items() if k not in {"required_skill_ids", "preferred_skill_ids"}}
    result = rest("POST", "opportunities", body=payload)[0]
    for skill_id in opportunity.get("required_skill_ids", []):
        relations.append({"opportunity_id": result["id"], "skill_id": skill_id, "skill_type": "required"})
    for skill_id in opportunity.get("preferred_skill_ids", []):
        relations.append({"opportunity_id": result["id"], "skill_id": skill_id, "skill_type": "preferred"})
    if relations:
        rest("POST", "opportunity_skills", body=relations)
    return {**result, "required_skill_ids": opportunity.get("required_skill_ids", []), "preferred_skill_ids": opportunity.get("preferred_skill_ids", [])}


def find_opportunity_by_source(source_name, source_url):
    rows = rest("GET", "opportunities", {
        "source_name": f"eq.{source_name}",
        "source_url": f"eq.{source_url}",
        "select": "id,title",
        "limit": "1",
    })
    return rows[0] if rows else None




# ---- personal knowledge graph (only the user's own skill states, never a copy of the graph) ----
def list_skill_progress(user_id):
    return rest("GET", "skill_progress", {"user_id": f"eq.{user_id}", "select": "*", "order": "skill_id"})


def replace_skill_progress(user_id, rows):
    """Upsert this user's rows, keep the first learned_at for each skill, drop skills no longer listed."""
    existing = {r["skill_id"]: r for r in list_skill_progress(user_id)}
    now = datetime.now(timezone.utc).isoformat()
    for row in rows:
        old = existing.get(row["skill_id"]) or {}
        # Every row carries the same keys: bulk upserts require it.
        row["learned_at"] = (old.get("learned_at") or now) if row["state"] == "learned" else None
    keep = {r["skill_id"] for r in rows}
    gone = [skill_id for skill_id in existing if skill_id not in keep]
    if gone:
        rest("DELETE", "skill_progress", {"user_id": f"eq.{user_id}", "skill_id": f"in.({','.join(gone)})"})
    if rows:
        rest("POST", "skill_progress", {"on_conflict": "user_id,skill_id"}, rows,
             prefer="return=representation,resolution=merge-duplicates")
    return list_skill_progress(user_id)
