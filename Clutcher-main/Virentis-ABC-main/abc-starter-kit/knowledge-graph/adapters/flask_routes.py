"""Copy or import this adapter when integrating the graph into Flask.

It does not register itself and therefore cannot affect the existing app.
"""
from flask import Blueprint, jsonify, request
from profile_graph import build_profile_graph


def create_knowledge_graph_blueprint(skill_graph):
    blueprint = Blueprint("knowledge_graph", __name__, url_prefix="/api/knowledge-graph")

    @blueprint.get("")
    def get_graph():
        return jsonify(skill_graph.api_payload())

    @blueprint.get("/related")
    def get_related():
        skill = request.args.get("skill", "")
        try:
            limit = int(request.args.get("limit", "6"))
            items = [item.as_dict() for item in skill_graph.related(skill, limit)]
            return jsonify(source=skill_graph.require_id(skill), items=items)
        except (KeyError, ValueError):
            return jsonify(error="Use a known skill and an integer limit."), 400

    @blueprint.post("/profile")
    def create_profile_graph():
        body = request.get_json(silent=True) or {}
        try:
            return jsonify(build_profile_graph(
                skill_graph,
                current_skills=body.get("current_skills", []),
                learned_skills=body.get("learned_skills", []),
                resume_text=body.get("resume_text", ""),
                expansion_depth=body.get("expansion_depth", 1),
            ))
        except ValueError as exc:
            return jsonify(error=str(exc)), 400

    return blueprint

