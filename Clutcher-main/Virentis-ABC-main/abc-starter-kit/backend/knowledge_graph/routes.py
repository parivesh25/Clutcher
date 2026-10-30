"""Flask routes for the knowledge graph, adapted from knowledge-graph/adapters/flask_routes.py.

Public:   GET  /api/knowledge-graph                 the canonical catalogue
          GET  /api/knowledge-graph/related         nearest skills by weighted path
          POST /api/knowledge-graph/profile         build a stateless growing graph
Sign-in:  GET  /api/knowledge-graph/progress        this user's saved skill states
          PUT  /api/knowledge-graph/progress        save base/learned skills and node positions
"""
from flask import Blueprint, g, jsonify, request

import auth
import db

from .profile_graph import build_profile_graph

MAX_SKILLS = 60


def _names(value, field):
    if value is None:
        return []
    if not isinstance(value, list) or not all(isinstance(v, str) for v in value) or len(value) > MAX_SKILLS:
        raise ValueError(f"{field} must be a list of at most {MAX_SKILLS} skill names.")
    return [v.strip()[:60] for v in value if v.strip()]


def _split_known(skill_graph, names):
    """Profiles hold skills outside the 20-skill catalogue (Java, Arduino...). Keep those out of the
    graph instead of rejecting the whole request, and report them so the UI can say so."""
    known, unknown = [], []
    for name in names:
        node = skill_graph.resolve(name)
        if node and node["id"] not in known:
            known.append(node["id"])
        elif not node and name not in unknown:
            unknown.append(name)
    return known, unknown


def create_knowledge_graph_blueprint(skill_graph):
    bp = Blueprint("knowledge_graph", __name__, url_prefix="/api/knowledge-graph")

    @bp.get("")
    def get_graph():
        return jsonify(skill_graph.api_payload())

    @bp.get("/related")
    def get_related():
        skill = request.args.get("skill", "")
        try:
            limit = int(request.args.get("limit", "6"))
            items = [item.as_dict() for item in skill_graph.related(skill, limit)]
            return jsonify(source=skill_graph.require_id(skill), items=items)
        except (KeyError, ValueError):
            return jsonify(error="Use a known skill and an integer limit."), 400

    @bp.post("/profile")
    def create_profile_graph():
        body = request.get_json(silent=True) or {}
        try:
            current, unknown = _split_known(skill_graph, _names(body.get("current_skills"), "current_skills"))
            learned, _ = _split_known(skill_graph, _names(body.get("learned_skills"), "learned_skills"))
            depth = body.get("expansion_depth", 1)
            graph = build_profile_graph(
                skill_graph,
                current_skills=current,
                learned_skills=learned,
                resume_text=body.get("resume_text", "") or "",
                expansion_depth=depth,
            )
        except ValueError as exc:
            return jsonify(error=str(exc)), 400
        graph["unmatched_skills"] = unknown
        return jsonify(graph)

    @bp.get("/progress")
    @auth.login_required
    def get_progress():
        rows = db.list_skill_progress(g.user["id"])
        return jsonify(
            base_skill_ids=[r["skill_id"] for r in rows if r["state"] == "base"],
            learned=[{"skill_id": r["skill_id"], "learned_at": r.get("learned_at")} for r in rows if r["state"] == "learned"],
            resume_skill_ids=[r["skill_id"] for r in rows if r.get("source") == "resume"],
            positions={r["skill_id"]: {"x": r["position_x"], "y": r["position_y"]}
                       for r in rows if r.get("position_x") is not None and r.get("position_y") is not None},
        )

    @bp.put("/progress")
    @auth.login_required
    def save_progress():
        body = request.get_json(silent=True) or {}
        try:
            base = [skill_graph.require_id(s) for s in _names(body.get("base_skill_ids"), "base_skill_ids")]
            learned = [skill_graph.require_id(s) for s in _names(body.get("learned_skill_ids"), "learned_skill_ids")]
            resume = {skill_graph.require_id(s) for s in _names(body.get("resume_skill_ids"), "resume_skill_ids")}
        except KeyError as exc:
            return jsonify(error=f"{exc.args[0]}. Only catalogue skills can be saved."), 400
        except ValueError as exc:
            return jsonify(error=str(exc)), 400
        positions = body.get("positions") or {}
        if not isinstance(positions, dict):
            return jsonify(error="positions must map skill IDs to {x, y}."), 400

        rows = []
        for skill_id in dict.fromkeys([*base, *learned]):
            pos = positions.get(skill_id) if isinstance(positions.get(skill_id), dict) else {}
            x, y = pos.get("x"), pos.get("y")
            valid = all(isinstance(v, (int, float)) and not isinstance(v, bool) and 0 <= v <= 1 for v in (x, y))
            rows.append({
                "user_id": g.user["id"],
                "skill_id": skill_id,
                "state": "base" if skill_id in base else "learned",
                "source": "resume" if skill_id in resume else "profile_tag" if skill_id in base else "learning",
                "position_x": x if valid else None,
                "position_y": y if valid else None,
            })
        db.replace_skill_progress(g.user["id"], rows)
        return get_progress()

    return bp
