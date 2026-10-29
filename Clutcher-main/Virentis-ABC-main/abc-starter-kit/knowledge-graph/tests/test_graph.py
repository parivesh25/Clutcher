import copy
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from graph import DEFAULT_GRAPH_PATH, GraphValidationError, SkillGraph, alias_key, validate_graph
from profile_graph import build_profile_graph, extract_resume_skills


class SkillGraphTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.graph = SkillGraph.load()

    def test_default_graph_is_valid_and_round_trips(self):
        payload = self.graph.api_payload()
        self.assertEqual(payload["schema_version"], "1.0")
        self.assertGreaterEqual(len(payload["nodes"]), 20)
        self.assertGreaterEqual(len(payload["edges"]), 25)
        self.assertEqual(validate_graph(json.loads(DEFAULT_GRAPH_PATH.read_text(encoding="utf-8"))), payload)

    def test_aliases_ignore_case_spaces_and_punctuation(self):
        self.assertEqual(alias_key("Node.JS"), "nodejs")
        self.assertEqual(self.graph.resolve("node js")["id"], "nodejs")
        self.assertEqual(self.graph.resolve("FlaskAPI")["id"], "flask_api")
        self.assertEqual(self.graph.resolve("React.js")["id"], "react")

    def test_requested_pairs_are_each_others_closest_skills(self):
        self.assertEqual(self.graph.related("Python", 1)[0].id, "flask_api")
        self.assertEqual(self.graph.related("JavaScript", 1)[0].id, "nodejs")

    def test_related_results_include_explainable_paths(self):
        result = next(item for item in self.graph.related("python", 20) if item.id == "postgresql")
        self.assertEqual(result.path[0], "python")
        self.assertEqual(result.path[-1], "postgresql")
        self.assertGreaterEqual(len(result.path), 3)

    def test_shortest_path_accepts_aliases(self):
        path = self.graph.shortest_path("Node JS", "Postgres")
        self.assertEqual(path[0]["id"], "nodejs")
        self.assertEqual(path[-1]["id"], "postgresql")

    def test_neighbors_report_relationship_strength(self):
        neighbors = self.graph.neighbors("python")
        self.assertEqual(neighbors[0]["skill"]["id"], "flask_api")
        self.assertEqual(neighbors[0]["weight"], 1.0)

    def test_validation_rejects_unknown_edge_node(self):
        payload = self.graph.api_payload()
        payload["edges"][0]["source"] = "unknown"
        with self.assertRaises(GraphValidationError):
            validate_graph(payload)

    def test_validation_rejects_duplicate_node_and_invalid_position(self):
        payload = self.graph.api_payload()
        payload["nodes"].append(copy.deepcopy(payload["nodes"][0]))
        with self.assertRaises(GraphValidationError):
            validate_graph(payload)
        payload = self.graph.api_payload()
        payload["nodes"][0]["position"]["x"] = 4
        with self.assertRaises(GraphValidationError):
            validate_graph(payload)

    def test_api_payload_is_a_copy(self):
        payload = self.graph.api_payload()
        payload["nodes"][0]["label"] = "Changed"
        self.assertNotEqual(self.graph.nodes[payload["nodes"][0]["id"]]["label"], "Changed")

    def test_profile_tags_and_resume_create_base_graph(self):
        result = build_profile_graph(
            self.graph,
            current_skills=["Python"],
            resume_text="Built REST APIs using Node.js, Express and PostgreSQL.",
        )
        self.assertEqual(result["profile"]["current_skill_ids"], ["python"])
        self.assertEqual(result["profile"]["resume_skill_ids"], ["nodejs", "express", "postgresql", "rest_api"])
        self.assertEqual(result["summary"]["base_count"], 5)
        self.assertTrue(all(
            node["state"] == "base"
            for node in result["nodes"]
            if node["id"] in result["profile"]["base_skill_ids"]
        ))

    def test_learning_skill_expands_visible_graph(self):
        before = build_profile_graph(self.graph, current_skills=["python"])
        self.assertIn("flask_api", {node["id"] for node in before["nodes"]})
        self.assertNotIn("rest_api", {node["id"] for node in before["nodes"]})
        after = build_profile_graph(self.graph, current_skills=["python"], learned_skills=["flask_api"])
        states = {node["id"]: node["state"] for node in after["nodes"]}
        self.assertEqual(states["python"], "base")
        self.assertEqual(states["flask_api"], "learned")
        self.assertEqual(states["rest_api"], "suggested")
        self.assertGreater(len(after["nodes"]), len(before["nodes"]))

    def test_resume_extraction_is_boundary_aware(self):
        self.assertIn("react", extract_resume_skills("React.js and TypeScript", self.graph))
        self.assertNotIn("python", extract_resume_skills("The word typography is unrelated.", self.graph))

    def test_unknown_profile_skill_is_rejected(self):
        with self.assertRaises(ValueError):
            build_profile_graph(self.graph, current_skills=["magic_unknown_skill"])


if __name__ == "__main__":
    unittest.main()

