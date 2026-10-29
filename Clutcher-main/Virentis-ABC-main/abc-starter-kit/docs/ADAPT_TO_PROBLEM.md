# Turning the starter kit into your solution

Use this once the problem statement is announced. If the event bans pre-written code, use the prompts in section 4 to rebuild the pieces you need live instead.

## 1. First 45 minutes

1. Restate the problem in one sentence. Name the one user. Write the three-line core flow (user does X, AI does Y, user sees Z).
2. Decide the word for your "record": case, complaint, expense, shipment, patient file, lesson...
3. Decide which 2 or 3 extra fields that record needs (see section 2).
4. Decide the one AI feature (summarise, classify, extract, answer from text, choose a tool).
5. Only then start changing code. Keep the login, dashboard and audit log as they are unless the problem needs something different.

## 2. The three common changes

### Rename "records"
Change these four places together, or ask Antigravity to do it (prompt below):
- `supabase/schema.sql`: the table name (`records`) and its `index` line
- `backend/db.py`: the table name in the `rest("...", "records", ...)` calls
- `backend/app.py`: the `/records` routes and the `"record.create"` style audit action names
- `frontend/src/components/Records.tsx`: headings, labels and the `/records` paths

> **Prompt:** "In this project, rename the `records` concept to `complaints` everywhere: SQL schema, `backend/db.py`, `backend/app.py` routes and audit action names, and the React `Records` component and labels. Don't change behaviour. List every file you touched."

### Add a field (for example `severity`)
1. SQL: `alter table public.records add column severity text not null default 'low';`
2. `backend/app.py`, in `clean_record`: validate it and copy it into `out`.
3. `frontend/src/lib/types.ts`: add it to `RecordItem`.
4. `frontend/src/components/Records.tsx`: add an input and a table column.

### Change what the AI does
Edit only `backend/ai.py` (the prompt text) and, if needed, the route in `app.py`. Test the prompt in AI Studio first, then paste the wording in. Keep returning JSON when the app needs fields.

## 3. Theme starting points

These are suggestions to react to, not predictions of the problems.

| Theme | Rename records to | Useful extra fields | AI feature | Extra to consider |
|---|---|---|---|---|
| Healthcare | patient files / reports | patient_ref (fake IDs only), report_type | Extract fields from a report; flag missing info | Human confirm box before saving AI output; role-based views |
| Cybersecurity | incidents / alerts | severity, source | Classify message as safe, suspicious or scam, and explain why | Anomaly flagging on a CSV (Isolation Forest in Colab) |
| FinTech | transactions / expenses | amount, merchant | Extract from receipts; explain unusual spending | Fake data only; threshold alerts |
| EdTech | topics / quizzes | subject, difficulty | Quiz from notes; explain weak topics | Teacher view using the admin role |
| Sustainability | listings (surplus, waste) | quantity, expiry, location | Parse a free-text listing into fields | Map page; matching logic |
| Logistics | shipments / deliveries | origin, destination, eta | Re-plan on delay; write customer update | Maps API for route and distance |
| SaaS | tickets / invoices / customers | plan, amount | Summarise tickets; draft replies | Usage dashboard; plan limits |
| Agentic AI | tasks / requests | goal, steps | Agent picks tools and logs each step | Show the steps live in an activity panel |
| Management systems | requests / assets | priority, assignee | Categorise and prioritise intake | Status workflow and a table view per person |

Fields like `amount` should be whole numbers (for example paise or cents) if they go into audit payloads, because floats can change shape inside the database and break hash verification.

## 4. Antigravity prompts for pieces not in the kit (or to rebuild live)

Always put the stack first: *"Stack: React + TypeScript (Vite), Flask (Python), Supabase (Auth + Postgres + Storage), Google GenAI SDK. The backend holds all secrets. Make small changes and tell me how to run and test each one."*

**Login with 2FA**
> "Add Supabase Auth email/password sign-in and TOTP two-factor authentication using `supabase.auth.mfa`: an enrol page with a QR code, a verify page, and a route guard that redirects based on `getAuthenticatorAssuranceLevel`. On the Flask side, verify the bearer token by calling Supabase's `/auth/v1/user` endpoint and reject requests that are not `aal2` when `REQUIRE_2FA=true`."

**Dashboard**
> "Add a dashboard page with summary numbers, a bar chart by category and a line chart by day using Recharts, fed by a Flask `/api/stats` endpoint. Handle loading, empty and error states."

**Tamper-evident audit log**
> "Add an append-only `audit_log` table where each row stores `prev_hash` and `hash = SHA-256(prev_hash | actor | action | entity | entity_id | canonical_json(payload) | ts)`. Add a Flask `verify` endpoint that recomputes the chain and returns the first broken row, plus a unit test that edits a row and expects detection."

**File upload (Supabase Storage)**
> "Add file upload for PDFs and images up to 5 MB. Flask validates type and size, stores the file in a private Supabase Storage bucket with the service key, saves the path and a SHA-256 hash of the file on the record, and returns a short-lived signed URL for download."

**Read an image or PDF with Gemini**
> "Add a Flask endpoint that receives an image or PDF, sends it to Gemini with `google-genai` as inline data, and returns JSON with these fields: [list]. Validate the JSON and return null for missing fields. Rate-limit per user."

**A small agent with tools**
> "Add a Flask endpoint that uses Gemini function calling with three tools: `search_records(query)`, `get_weather(city)` and `distance_km(a, b)`. Run the tool-call loop (max 5 steps), and return the final answer plus a list of the steps taken so the UI can show them."

**Map page**
> "Add a page with a Google Map showing records that have latitude and longitude, with markers and a button that finds the nearest one to the user's location. Load the Maps key from `VITE_GOOGLE_MAPS_KEY` and restrict it by HTTP referrer."

**Deploy (only with spare time)**
> "Explain the simplest way to deploy the Vite frontend and the Flask backend for a demo, with environment variables set in the host's dashboard and CORS updated to the deployed frontend URL."

## 5. Before you demo

- Run `git status` and confirm no `.env` files or keys are in the commit.
- Put fake data in; delete anything real.
- Run Verify integrity once so the result is fresh.
- Record a 60-second screen capture of the full flow as a backup.
- Prepare one sentence for each of: how you know it works, what happens with bad input, how secrets are protected, and what the limits are.
