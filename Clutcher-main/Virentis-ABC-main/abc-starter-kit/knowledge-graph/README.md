# PS-61 Skill Knowledge Graph

This directory is a self-contained knowledge-graph module. It does not modify or import the current Flask backend, React frontend or Supabase schema, so it can be developed and reviewed independently.

## What it provides

- A versioned JSON graph of canonical skills, aliases and weighted relationships.
- Alias resolution: `Nodejs`, `Node.js` and `Node JS` resolve to `nodejs`.
- Weighted related-skill ranking with explainable shortest paths.
- An interactive local preview where nodes can be moved and knowledge can be edited.
- Browser-local persistence and JSON export.
- Small Flask and TypeScript adapters that are not wired into the app yet.
- Standard-library tests and local server; no new package installation.

The initial graph deliberately makes `Flask API` the closest skill to `Python`, and `Node.js` the closest skill to `JavaScript`.

## User growth workflow

1. The user selects current skills as tags and/or supplies extracted resume text.
2. Canonical aliases are resolved. Tag selections and resume matches become **base** skills.
3. The response includes directly connected **suggested** skills as the next growth frontier.
4. When the user completes one, its state becomes **learned**.
5. Rebuilding the graph reveals that learned skill's neighbors, so the visible graph expands with progress.

The visual states remain part of one connected graph:

- **Base:** blue node with a steady outer ring.
- **Learned:** green node with a glow and `NEW` label.
- **Suggested:** hollow, dashed node.

Hovering a node highlights its neighborhood and pauses the orbit. The whole map has an optional 2D orbit, while labels remain readable. Dragged positions are saved separately from canonical knowledge.

## Run it locally

From `abc-starter-kit/knowledge-graph`:

```powershell
python server.py
```

If port 8765 is already in use, choose another one with `python server.py --port 8766`.

Open:

```text
http://127.0.0.1:8765/demo/
```

Local endpoints:

```text
GET  http://127.0.0.1:8765/api/knowledge-graph
GET  http://127.0.0.1:8765/api/knowledge-graph/related?skill=Node.js&limit=6
POST http://127.0.0.1:8765/api/knowledge-graph/profile
```

Example profile request:

```json
{
  "current_skills": ["Python", "JavaScript"],
  "learned_skills": ["Flask API"],
  "resume_text": "Built PostgreSQL APIs and React interfaces.",
  "expansion_depth": 1
}
```

The editor saves profile progress and moved positions to browser `localStorage`. **Export graph** downloads the current personal graph. Resetting removes the local profile without changing `data/skill-graph.json`.

## Test it

```powershell
cd abc-starter-kit\knowledge-graph
python -m unittest discover -s tests -v
```

No virtual environment or third-party dependency is needed for this module.

## Contract

The canonical catalogue contract is [graph.schema.json](graph.schema.json), while [profile-graph.schema.json](profile-graph.schema.json) describes the growing user graph. The stable catalogue structure is:

```json
{
  "schema_version": "1.0",
  "graph_id": "ps61-skill-knowledge-graph",
  "title": "PS-61 Skill Knowledge Graph",
  "nodes": [],
  "edges": []
}
```

Node IDs match the canonical skill IDs used by PS-61. Positions are normalized from `0` to `1`, so a frontend can render the graph at any size. Edge weights range from above `0` through `1`; stronger relationships produce shorter graph distances.

## Backend integration later

The provided [Flask adapter](adapters/flask_routes.py) is intentionally unregistered. Integration needs only:

```python
from graph import SkillGraph
from adapters.flask_routes import create_knowledge_graph_blueprint

skill_graph = SkillGraph.load("knowledge-graph/data/skill-graph.json")
app.register_blueprint(create_knowledge_graph_blueprint(skill_graph))
```

In the real project, adjust the import path by either packaging this folder or adding its directory to the backend module path. Keep graph validation at startup so invalid knowledge never reaches users.

Recommended production routes:

- `GET /api/knowledge-graph`
- `GET /api/knowledge-graph/related?skill=<alias>&limit=6`
- `POST /api/knowledge-graph/profile`

The profile route is deterministic and does not persist the resume. During integration, PDF/DOCX parsing should happen in a dedicated upload service and only extracted text should enter this graph builder. Persist canonical skill IDs, node states and user positions; do not duplicate the whole catalogue per user.

## Frontend integration later

[frontend.ts](adapters/frontend.ts) provides the catalogue, personal graph contracts and fetch functions without importing current frontend code. Copy it into `frontend/src/lib/knowledgeGraph.ts`, then build a React component around:

- `nodes` for skill labels and normalized positions;
- `edges` for lines and relationship strength;
- `/related` for a server-authoritative closest-skills list.
- `state` for base, learned and suggested styling.
- `origins` for profile-tag, resume and learning explanations.

The local demo is plain JavaScript and SVG. It is a behavior reference, not code the React application must copy.

## Editing canonical knowledge

For reviewed changes:

1. Edit `data/skill-graph.json`, or edit in the preview and export JSON.
2. Replace the canonical file with the reviewed export.
3. Run the tests.
4. Commit only files under `knowledge-graph/`.

Use evidence and team review before treating inferred or scraped relationships as canonical. Scrapers should propose graph changes; they should not silently overwrite this file.

## Merge-conflict strategy

This feature lives on `feature/knowledge-graph` from `origin/main`. Every implementation file is new and contained inside `abc-starter-kit/knowledge-graph/`. It does not touch:

- `backend/app.py`
- `backend/db.py`
- `frontend/src/pages/Dashboard.tsx`
- `frontend/src/components/MatchGraph.tsx`
- `supabase/schema.sql`

That makes the feature branch safe to merge independently. The later integration should be a separate, small PR so any backend or frontend conflict is isolated to the adapter wiring.

