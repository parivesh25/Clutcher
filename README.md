# Clutcher

Clutcher is a student-focused opportunity discovery platform for internships, jobs, hackathons, and competitions. It combines listings from multiple sources, ranks them against a student's skills, explains skill gaps, tracks deadlines, and builds a growing personal skill graph.

## Key features

- Supabase email/password authentication and user profiles
- Normalized opportunity feed from Unstop, Devpost, and Remotive
- Personalized recommendations with explainable skill-fit scores
- Gemini API integration for AI-assisted summaries and learning guidance
- Eligibility checks for education, location, graduation year, degree, and CGPA
- Skill-gap analysis with transferable skills and practical learning steps
- Interactive Skill Graph with base, learned, and suggested skills
- Opportunity tracker for saved, applied, and interviewing states
- Deadline, popularity, interview-preparation, and source-link views
- Resilient local feed snapshot when a source is unavailable

## User workflow

1. A student signs up and creates a profile with education, goals, and skills.
2. Flask normalizes listings from the available opportunity sources.
3. The recommendation engine compares the profile with every listing.
4. Discover shows ranked opportunities, eligibility, deadlines, and missing skills.
5. The student opens the source website to apply and tracks progress in Clutcher.
6. As skills are added or learned, the Skill Graph expands and suggests related skills.

## System architecture

```text
React + Vite frontend
   ├── Supabase Auth ────────────── sign-up, sign-in, sessions
   ├── Supabase with RLS ────────── user Skill Graph progress
   └── Flask REST API
         ├── Recommendation and skill-gap engine
         ├── Gemini API ──────── AI summaries and learning guidance
         ├── Eligibility and deadline rules
         ├── Knowledge-graph builder
         ├── Supabase PostgreSQL ── profiles, skills, opportunities
         └── Feed pipeline ──────── Unstop, Devpost, Remotive
                                      ↓
                               backend/data/feed.json
```

| Layer | Technology | Responsibility |
| --- | --- | --- |
| Frontend | React, TypeScript, Vite, Tailwind CSS | Authentication UI, Discover, Tracker, Profile, Skill Graph |
| Backend | Python, Flask | APIs, normalization, ranking, eligibility, analysis |
| Database | Supabase PostgreSQL | Profiles, opportunity catalogue, skills, graph progress |
| Authentication | Supabase Auth | Sessions and protected user data |
| Feed ingestion | Python `requests` | Public source endpoints and normalized JSON cache |

## Recommendation and skill-gap logic

The core recommendation engine is deterministic and does not require an LLM API.

- Skills are normalized through a shared vocabulary and aliases.
- Exact skill matches receive full credit; related transferable skills receive half credit.
- Recommendations combine approximately **60% skill fit**, **25% popularity**, and **15% deadline urgency**.
- Missing skills are converted into preparation steps, estimated learning time, project ideas, and resources.
- Results are labeled as ready, focused preparation, stretch, or urgent so the ranking remains explainable.

The project uses the **Gemini API** for selected AI-generated summaries and learning-roadmap guidance. The core ranking and eligibility calculations remain deterministic, and local fallbacks keep matching functional when Gemini is unavailable or rate-limited. OpenRouter can be configured as an alternative generation provider.

## Opportunity feed

The active Discover feed is cached in `backend/data/feed.json`. Flask refreshes a stale snapshot in the background at startup and also exposes a rate-limited **Live Sync** action. If one source fails, its last successful listings remain available.

The current implementation uses public JSON endpoints rather than browser automation. A production scheduler is still needed for continuous refreshes independent of app restarts or manual Live Sync.

## Run locally

```powershell
cd "Clutcher-main\Virentis-ABC-main\abc-starter-kit"
```

Create `backend/.env` and `frontend/.env` from their `.env.example` files. Keep the Supabase secret/service-role key in the backend only.

```powershell
# Backend
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe app.py

# Frontend — run in a second terminal from abc-starter-kit
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. The Flask health endpoint is `http://127.0.0.1:5000/api/health`.

## Verification

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -q

cd ..\frontend
npm run build
```

The backend test suite runs without live credentials. Complete one real sign-up, profile save, recommendation, Skill Graph update, refresh, and second sign-in when verifying a configured environment.

## Repository location

The application is under `Clutcher-main/Virentis-ABC-main/abc-starter-kit/`. More detailed setup and troubleshooting notes remain in the starter-kit README inside that directory.
