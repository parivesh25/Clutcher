"""Build a growing user skill graph from profile tags, resume text and learning."""
from __future__ import annotations

import copy
import re
from collections import deque
from typing import Any, Iterable

from graph import SkillGraph

MAX_RESUME_TEXT = 100_000


def _skill_pattern(value: str) -> re.Pattern[str]:
    escaped = re.escape(value.strip())
    escaped = re.sub(r"\\\s+", r"[\\s._-]*", escaped)
    # Two-letter aliases such as JS and TS must not be inferred from Node.js
    # or React.js. Require whitespace-like boundaries for those short forms.
    boundary = r"[a-z0-9._-]" if len(re.sub(r"[^a-z0-9]", "", value.casefold())) <= 2 else r"[a-z0-9]"
    return re.compile(rf"(?<!{boundary})" + escaped + rf"(?!{boundary})", re.IGNORECASE)


def extract_resume_skills(text: str, graph: SkillGraph) -> list[str]:
    """Return canonical skill IDs explicitly present in plain resume text."""
    if not isinstance(text, str):
        raise ValueError("resume_text must be a string.")
    if len(text) > MAX_RESUME_TEXT:
        raise ValueError(f"resume_text must be at most {MAX_RESUME_TEXT} characters.")
    found = []
    for node in graph.nodes.values():
        names = [node["label"], node["id"].replace("_", " "), *node["aliases"]]
        # Prefer meaningful terms and preserve canonical graph order.
        if any(len(name.strip()) >= 2 and _skill_pattern(name).search(text) for name in names):
            found.append(node["id"])
    return found


def _resolve_many(values: Iterable[str], graph: SkillGraph, field: str) -> list[str]:
    if not isinstance(values, list) or not all(isinstance(value, str) for value in values):
        raise ValueError(f"{field} must be a list of skill names or IDs.")
    resolved, unknown = [], []
    for value in values:
        node = graph.resolve(value)
        if node is None:
            unknown.append(value)
        elif node["id"] not in resolved:
            resolved.append(node["id"])
    if unknown:
        raise ValueError(f"Unknown skills in {field}: {', '.join(unknown)}.")
    return resolved


def build_profile_graph(
    graph: SkillGraph,
    current_skills: list[str] | None = None,
    learned_skills: list[str] | None = None,
    resume_text: str = "",
    expansion_depth: int = 1,
) -> dict[str, Any]:
    """Create the visible graph for one user.

    Current tag selections and resume matches form the base. Skills completed
    later are learned. Nearby canonical skills are suggestions; learning one
    brings its own neighborhood into the next response.
    """
    if isinstance(expansion_depth, bool) or not isinstance(expansion_depth, int) or not 0 <= expansion_depth <= 3:
        raise ValueError("expansion_depth must be an integer from 0 to 3.")
    tagged = _resolve_many(current_skills or [], graph, "current_skills")
    learned = _resolve_many(learned_skills or [], graph, "learned_skills")
    resume = extract_resume_skills(resume_text or "", graph)
    base = list(dict.fromkeys([*tagged, *resume]))
    learned = [skill_id for skill_id in learned if skill_id not in base]
    known = set(base) | set(learned)

    visible = set(known)
    distance = {node_id: 0 for node_id in known}
    queue = deque(known)
    while queue:
        current = queue.popleft()
        if distance[current] >= expansion_depth:
            continue
        for neighbor, _cost, _relationship in graph._adjacency[current]:
            if neighbor not in distance:
                distance[neighbor] = distance[current] + 1
                visible.add(neighbor)
                queue.append(neighbor)

    origins: dict[str, list[str]] = {node_id: [] for node_id in visible}
    for node_id in tagged:
        origins.setdefault(node_id, []).append("profile_tag")
    for node_id in resume:
        origins.setdefault(node_id, []).append("resume")
    for node_id in learned:
        origins.setdefault(node_id, []).append("learning")

    nodes = []
    for source_node in graph.payload["nodes"]:
        node_id = source_node["id"]
        if node_id not in visible:
            continue
        node = copy.deepcopy(source_node)
        node["state"] = "base" if node_id in base else "learned" if node_id in learned else "suggested"
        node["origins"] = origins.get(node_id, [])
        nodes.append(node)

    edges = []
    for source_edge in graph.edges:
        if source_edge["source"] not in visible or source_edge["target"] not in visible:
            continue
        edge = copy.deepcopy(source_edge)
        source_known = edge["source"] in known
        target_known = edge["target"] in known
        edge["state"] = "known" if source_known and target_known else "growth" if source_known or target_known else "context"
        edges.append(edge)

    suggestions = []
    for node in nodes:
        if node["state"] != "suggested":
            continue
        linked_weights = [
            edge["weight"]
            for edge in edges
            if (edge["source"] == node["id"] and edge["target"] in known)
            or (edge["target"] == node["id"] and edge["source"] in known)
        ]
        suggestions.append(
            {
                "id": node["id"],
                "label": node["label"],
                "readiness": round(max(linked_weights, default=0), 2),
            }
        )
    suggestions.sort(key=lambda item: (-item["readiness"], item["label"]))
    return {
        "schema_version": "1.0",
        "graph_id": graph.payload["graph_id"],
        "profile": {
            "current_skill_ids": tagged,
            "resume_skill_ids": resume,
            "base_skill_ids": base,
            "learned_skill_ids": learned,
        },
        "nodes": nodes,
        "edges": edges,
        "next_skills": suggestions,
        "summary": {
            "base_count": len(base),
            "learned_count": len(learned),
            "suggested_count": len(suggestions),
        },
    }

