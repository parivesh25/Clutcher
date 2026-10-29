"""Dependency-free skill knowledge graph for PS-61.

The graph is deliberately independent of Flask, React and Supabase. Those layers
can consume its stable JSON contract without importing application code.
"""
from __future__ import annotations

import heapq
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

DEFAULT_GRAPH_PATH = Path(__file__).with_name("data") / "skill-graph.json"
ID_PATTERN = re.compile(r"^[a-z][a-z0-9_]*$")


class GraphValidationError(ValueError):
    pass


def alias_key(value: str) -> str:
    """Normalize Node.js, node js and NodeJS to the same lookup key."""
    return re.sub(r"[^a-z0-9]", "", value.casefold())


@dataclass(frozen=True)
class RelatedSkill:
    id: str
    label: str
    distance: float
    path: tuple[str, ...]

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "distance": round(self.distance, 4),
            "path": list(self.path),
        }


class SkillGraph:
    def __init__(self, payload: dict[str, Any]):
        self.payload = validate_graph(payload)
        self.nodes = {node["id"]: node for node in self.payload["nodes"]}
        self.edges = self.payload["edges"]
        self._aliases: dict[str, str] = {}
        self._adjacency: dict[str, list[tuple[str, float, str]]] = {
            node_id: [] for node_id in self.nodes
        }
        for node in self.nodes.values():
            for name in [node["id"], node["label"], *node["aliases"]]:
                key = alias_key(name)
                existing = self._aliases.get(key)
                if existing and existing != node["id"]:
                    raise GraphValidationError(
                        f"Alias {name!r} is shared by {existing!r} and {node['id']!r}."
                    )
                self._aliases[key] = node["id"]
        for edge in self.edges:
            cost = 1.0 / edge["weight"]
            self._adjacency[edge["source"]].append(
                (edge["target"], cost, edge["relationship"])
            )
            self._adjacency[edge["target"]].append(
                (edge["source"], cost, edge["relationship"])
            )

    @classmethod
    def load(cls, path: str | Path = DEFAULT_GRAPH_PATH) -> "SkillGraph":
        with Path(path).open(encoding="utf-8") as handle:
            return cls(json.load(handle))

    def resolve(self, value: str) -> dict[str, Any] | None:
        node_id = self._aliases.get(alias_key(value))
        return self.nodes.get(node_id) if node_id else None

    def require_id(self, value: str) -> str:
        node = self.resolve(value)
        if node is None:
            raise KeyError(f"Unknown skill: {value}")
        return node["id"]

    def neighbors(self, value: str) -> list[dict[str, Any]]:
        node_id = self.require_id(value)
        result = []
        for neighbor_id, cost, relationship in self._adjacency[node_id]:
            result.append(
                {
                    "skill": self.nodes[neighbor_id],
                    "relationship": relationship,
                    "weight": round(1.0 / cost, 4),
                }
            )
        return sorted(result, key=lambda item: (-item["weight"], item["skill"]["label"]))

    def related(self, value: str, limit: int = 6) -> list[RelatedSkill]:
        """Return closest skills using weighted shortest paths.

        Stronger relationships have lower traversal cost. The source skill is
        excluded, and ties are stable by canonical skill id.
        """
        source = self.require_id(value)
        distances = {source: 0.0}
        paths: dict[str, tuple[str, ...]] = {source: (source,)}
        queue: list[tuple[float, str]] = [(0.0, source)]
        while queue:
            distance, current = heapq.heappop(queue)
            if distance != distances[current]:
                continue
            for neighbor, cost, _relationship in self._adjacency[current]:
                candidate = distance + cost
                candidate_path = (*paths[current], neighbor)
                if candidate < distances.get(neighbor, float("inf")):
                    distances[neighbor] = candidate
                    paths[neighbor] = candidate_path
                    heapq.heappush(queue, (candidate, neighbor))
        ranked = sorted(
            (distance, node_id)
            for node_id, distance in distances.items()
            if node_id != source
        )
        return [
            RelatedSkill(
                id=node_id,
                label=self.nodes[node_id]["label"],
                distance=distance,
                path=paths[node_id],
            )
            for distance, node_id in ranked[: max(0, min(limit, 50))]
        ]

    def shortest_path(self, source: str, target: str) -> list[dict[str, Any]]:
        target_id = self.require_id(target)
        for related in self.related(source, limit=len(self.nodes)):
            if related.id == target_id:
                return [self.nodes[node_id] for node_id in related.path]
        return []

    def api_payload(self) -> dict[str, Any]:
        """Return a copy safe to serialize from an API route."""
        return json.loads(json.dumps(self.payload))


def validate_graph(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise GraphValidationError("Graph must be a JSON object.")
    if payload.get("schema_version") != "1.0":
        raise GraphValidationError("schema_version must be 1.0.")
    if not isinstance(payload.get("graph_id"), str) or not payload["graph_id"]:
        raise GraphValidationError("graph_id is required.")
    if not isinstance(payload.get("title"), str) or not payload["title"]:
        raise GraphValidationError("title is required.")
    nodes, edges = payload.get("nodes"), payload.get("edges")
    if not isinstance(nodes, list) or not isinstance(edges, list):
        raise GraphValidationError("nodes and edges must be lists.")
    node_ids: set[str] = set()
    for index, node in enumerate(nodes):
        if not isinstance(node, dict):
            raise GraphValidationError(f"nodes[{index}] must be an object.")
        node_id = node.get("id")
        if not isinstance(node_id, str) or not ID_PATTERN.fullmatch(node_id):
            raise GraphValidationError(f"nodes[{index}].id is invalid.")
        if node_id in node_ids:
            raise GraphValidationError(f"Duplicate node id: {node_id}.")
        node_ids.add(node_id)
        for field in ("label", "category", "description"):
            if not isinstance(node.get(field), str) or (field != "description" and not node[field]):
                raise GraphValidationError(f"{node_id}.{field} is invalid.")
        if not isinstance(node.get("aliases"), list) or not all(
            isinstance(alias, str) and alias.strip() for alias in node["aliases"]
        ):
            raise GraphValidationError(f"{node_id}.aliases must contain strings.")
        position = node.get("position")
        if not isinstance(position, dict) or set(position) != {"x", "y"}:
            raise GraphValidationError(f"{node_id}.position must contain x and y.")
        if any(
            isinstance(position[axis], bool)
            or not isinstance(position[axis], (int, float))
            or not 0 <= position[axis] <= 1
            for axis in ("x", "y")
        ):
            raise GraphValidationError(f"{node_id}.position must be normalized.")
    seen_edges: set[tuple[str, str, str]] = set()
    for index, edge in enumerate(edges):
        if not isinstance(edge, dict):
            raise GraphValidationError(f"edges[{index}] must be an object.")
        source, target = edge.get("source"), edge.get("target")
        if source not in node_ids or target not in node_ids:
            raise GraphValidationError(f"edges[{index}] references an unknown node.")
        if source == target:
            raise GraphValidationError(f"edges[{index}] cannot be a self-link.")
        relationship = edge.get("relationship")
        if not isinstance(relationship, str) or not ID_PATTERN.fullmatch(relationship):
            raise GraphValidationError(f"edges[{index}].relationship is invalid.")
        weight = edge.get("weight")
        if isinstance(weight, bool) or not isinstance(weight, (int, float)) or not 0 < weight <= 1:
            raise GraphValidationError(f"edges[{index}].weight must be above 0 and at most 1.")
        edge_key = (*sorted((source, target)), relationship)
        if edge_key in seen_edges:
            raise GraphValidationError(f"Duplicate edge: {edge_key}.")
        seen_edges.add(edge_key)
    # Return a deep copy so callers cannot mutate the object that was validated.
    return json.loads(json.dumps(payload))

