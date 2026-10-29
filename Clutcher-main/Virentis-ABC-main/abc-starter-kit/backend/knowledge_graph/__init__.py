"""Personal skill knowledge graph (integrated from abc-starter-kit/knowledge-graph).

The canonical catalogue in data/skill-graph.json is server-controlled; users only ever
store their own skill IDs, learned timestamps and node positions (see routes.py).
"""
from .graph import GraphValidationError, SkillGraph, alias_key
from .profile_graph import build_profile_graph, extract_resume_skills

__all__ = ["GraphValidationError", "SkillGraph", "alias_key", "build_profile_graph", "extract_resume_skills"]
