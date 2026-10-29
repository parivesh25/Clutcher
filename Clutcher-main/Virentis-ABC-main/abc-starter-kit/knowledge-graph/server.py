"""Local knowledge-graph preview and API using only Python stdlib."""
from __future__ import annotations

import argparse
import json
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from graph import GraphValidationError, SkillGraph
from profile_graph import build_profile_graph

ROOT = Path(__file__).resolve().parent
GRAPH = SkillGraph.load()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def _json(self, payload, status=HTTPStatus.OK):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):  # noqa: N802 - inherited API name
        parsed = urlparse(self.path)
        if parsed.path in {"/api/graph", "/api/knowledge-graph"}:
            return self._json(GRAPH.api_payload())
        if parsed.path in {"/api/related", "/api/knowledge-graph/related"}:
            query = parse_qs(parsed.query)
            skill = (query.get("skill") or [""])[0]
            try:
                limit = int((query.get("limit") or ["6"])[0])
                items = [item.as_dict() for item in GRAPH.related(skill, limit)]
            except (KeyError, ValueError):
                return self._json({"error": "Use a known skill and an integer limit."}, HTTPStatus.BAD_REQUEST)
            return self._json({"source": GRAPH.require_id(skill), "items": items})
        if parsed.path == "/":
            self.send_response(HTTPStatus.FOUND)
            self.send_header("Location", "/demo/")
            self.end_headers()
            return None
        return super().do_GET()

    def do_POST(self):  # noqa: N802 - inherited API name
        parsed = urlparse(self.path)
        if parsed.path not in {"/api/profile-graph", "/api/knowledge-graph/profile"}:
            return self._json({"error": "Not found."}, HTTPStatus.NOT_FOUND)
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 200_000:
                raise ValueError("Request body is missing or too large.")
            payload = json.loads(self.rfile.read(length))
            result = build_profile_graph(
                GRAPH,
                current_skills=payload.get("current_skills", []),
                learned_skills=payload.get("learned_skills", []),
                resume_text=payload.get("resume_text", ""),
                expansion_depth=payload.get("expansion_depth", 1),
            )
            return self._json(result)
        except (json.JSONDecodeError, TypeError, ValueError) as exc:
            return self._json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)


def main():
    parser = argparse.ArgumentParser(description="Run the local knowledge-graph demo and API.")
    parser.add_argument("--port", type=int, default=8765, help="Local port (default: 8765)")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")

    try:
        server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    except GraphValidationError as exc:
        raise SystemExit(f"Invalid graph: {exc}") from exc
    print(f"Knowledge graph: http://127.0.0.1:{args.port}/demo/")
    print(f"Graph API: http://127.0.0.1:{args.port}/api/knowledge-graph")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()

