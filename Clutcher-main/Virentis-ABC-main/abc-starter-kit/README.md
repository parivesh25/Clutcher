# ABC Starter Kit

A small, working base for a one-day AI build-a-thon: **login with 2FA, a dashboard, a database, an AI call, and a tamper-evident audit log**, all wired together. Stack: React + TypeScript (Vite), Flask, Supabase, Gemini.

> **Check the event rules first.** Some hackathons require you to start from scratch. If ABC does, do not use this as your starting code. Use it as practice, and rebuild the pieces live with the prompts in `docs/ADAPT_TO_PROBLEM.md`. When in doubt, ask an organiser.

## What you get

| Piece | Where | What it does |
|---|---|---|
| Sign up / sign in | `frontend/src/pages/Login.tsx` | Email and password through Supabase Auth |
| 2FA (authenticator app) | `frontend/src/pages/TwoFactor*.tsx` | Scan a QR code, then enter a 6-digit code at each sign-in |
| Dashboard | `frontend/src/pages/Dashboard.tsx` + `components/` | Summary numbers, two charts, a records table, activity log |
| API | `backend/app.py` | Records CRUD, stats, AI summarise and extract, audit log |
| Login check | `backend/auth.py` | Asks Supabase who a token belongs to; optional 2FA enforcement |
| AI | `backend/ai.py` | Gemini calls; the key stays on the server |
| Audit log | `backend/audit.py` | SHA-256 hash chain; `verify` detects edits |
| Database | `supabase/schema.sql` | Tables, roles, Row Level Security |
| Tests | `backend/tests/` | Offline API and matching tests (no keys needed) |

## PS-61 Discover

Discover uses the current student profile and the skill catalogue from `GET /api/skills`. Adding a skill changes the draft profile; **Analyze profile**, **Find matches**, and the type filters call `POST /api/matches`. Save the profile on the Profile page to keep changes across visits. Opportunity cards show the backend's fit score, eligibility, deadlines, and source link.

Each card's fit panel uses the backend's actual missing skills. **Generate learning roadmap** calls `POST /api/opportunities/<id>/roadmap`. Gemini generates practice suggestions when the configured project permits it; otherwise the response is labelled as a basic practice plan. No example listings from the UI design are inserted into the database. The catalogue needs approved opportunities before matches can appear.

Read `docs/ARCHITECTURE.md` to understand how the parts connect, and `docs/TEAM_GIT_GUIDE.md` before you share the repo.

## Setup (about 20 minutes the first time)

### 1. Supabase
1. Create a project at supabase.com.
2. **SQL Editor** -> New query -> paste all of `supabase/schema.sql` -> Run.
3. For speed in a hackathon, turn **email confirmation off** (Authentication settings, under the Email sign-in provider; menu names change, so look for "Confirm email"). Otherwise every sign-up needs an email click.
4. Check that **TOTP multi-factor auth** is enabled (Authentication settings, MFA section). It is normally on by default, but verify.
5. Project Settings -> API (or API Keys): copy the **URL**, the **anon / publishable key**, and the **service_role / secret key**.

### 2. Gemini
Create a key in Google AI Studio. The current default is `gemini-3.8-flash`; set `GEMINI_MODEL` in `backend/.env` if your project supports a different model. A key that can list models may still be denied generation access, so test one real request.

### 3. Backend
```bash
cd backend
python -m venv .venv
# Windows:  .venv\Scripts\activate        Mac/Linux:  source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # Windows: copy .env.example .env   then fill in the values
python app.py
```
Open http://127.0.0.1:5000/api/health. You should see `"supabase_configured": true` and `"gemini_configured": true`.

### 4. Frontend
```bash
cd frontend
npm install
cp .env.example .env        # Windows: copy .env.example .env   then fill in the values
npm run dev
```
Open http://localhost:5173.

### 5. Prove the chain works (do this first, on Friday)
1. Create an account and sign in.
2. Add a record. It appears in the table, the charts update, and the activity log shows `record.create`.
3. Click **Summarise with AI**. A summary appears under the record.
4. Click **Verify integrity**. You should see "Chain intact".

If all four work, every layer (React, Flask, Supabase, Gemini) is connected.

## Turn on 2FA

1. Set `REQUIRE_2FA=true` in `backend/.env` **and** `VITE_REQUIRE_2FA=true` in `frontend/.env`, then restart both.
2. Sign in. You are sent to the setup page. Scan the QR code with Google Authenticator, Authy or similar, and enter the code.
3. From then on, sign-in asks for a code, and the backend refuses any token that skipped it.

With both set to `false`, accounts that choose to enrol 2FA are still asked for a code at sign-in.

## Make yourself admin
Run this in the SQL Editor (use your email). Admins see everyone's records:
```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

## Demo trick: show tamper detection
1. Add two or three records so the log has entries.
2. In Supabase -> Table Editor -> `audit_log`, edit the `payload` of an early row.
3. Back in the app, click **Verify integrity**. It reports the entry where the chain broke.

(Do not enable the optional append-only trigger in `schema.sql` if you want this demo, because it would block your edit.)

## Run the tests
```bash
cd backend
pytest
```
They fake the database, login and AI, so they run with no internet and no keys.

## What is tested, and what is not

- **Offline tests:** backend route and matching tests run without keys; `npm run build` checks the frontend types and production bundle.
- **Live checks:** repeat sign-in, profile loading, matching, and a roadmap request in each configured environment. `/api/health` reports configuration, not external service reachability.
- **Catalogue:** matching cards and the roadmap button need at least one approved, open opportunity in Supabase.

## Known limits (say these honestly in your pitch)

- The audit log is **tamper-evident, not tamper-proof**: someone with database access can rewrite the whole chain. A real system would also anchor hashes somewhere separate.
- The system prompt in `ai.py` **reduces** prompt-injection risk. It does not eliminate it.
- Rate limiting and the AI cache live in memory, so they reset when Flask restarts and are per-process.
- Audit writes and record writes are separate calls, so a crash between them could leave a record without a log entry.
- Run locally for the demo. `debug=True` must never be used on a public server.
- Not included: file upload, maps, an AI agent endpoint, email, deployment. See `docs/ADAPT_TO_PROBLEM.md` for prompts that add them.

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| Browser console shows a CORS error | Frontend is not on port 5173, or `FRONTEND_ORIGINS` in `backend/.env` does not include its address |
| "Cannot reach the backend" | Flask is not running, or `VITE_BACKEND_URL` is wrong |
| Every request returns 401 | Backend `SUPABASE_URL` or `SUPABASE_ANON_KEY` wrong, or you are signed out |
| 403 "Two-factor verification required" | `REQUIRE_2FA` is on in the backend but you have not completed 2FA, or the frontend flag is off |
| 502 "Database problem" | Schema not run, or wrong service key. The real error is printed in the backend terminal |
| "Missing login token" on every call | Frontend `.env` was edited without restarting `npm run dev` |
| AI button gives 502 | Wrong `GEMINI_API_KEY` or `GEMINI_MODEL`, or quota reached. Check the backend terminal |
| Discover roadmap says "Basic practice plan" | Gemini generation was unavailable. Check the backend terminal and the Google AI Studio project/key access; the button still returns a local practice checklist |
| Sign-up says to check email | Email confirmation is still on in Supabase |
| 2FA setup says a factor already exists | Reload the setup page: it clears half-finished setups first |
