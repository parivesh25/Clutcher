# Connecting the frontend to the Flask API

This is for whoever builds the PS-61 backend routes. The frontend is already written against the shared contract. Once these four routes answer, it works without any frontend changes.

## Routes the UI calls

All of them go through `src/lib/api.ts`, which adds `/api` and the `Authorization: Bearer <supabase access token>` header.

| Call | When | Body sent | Response the UI reads |
|---|---|---|---|
| `GET /api/skills` | page load | none | `{"items": Skill[]}` |
| `GET /api/student-profile` | page load | none | `{"profile": StudentProfile}`. Return the empty profile if none is saved, never a 404. |
| `PUT /api/student-profile` | "Save profile" | `StudentProfile` | `{"profile": StudentProfile}` (the saved version) |
| `POST /api/matches` | "Find matches", the type filter, the ineligible toggle | `{"profile", "opportunity_type", "include_ineligible"}` | `{"items": MatchResult[], "evaluated_at"}` |

`GET /api/opportunities` and `POST /api/admin/opportunities` aren't used by the student UI.

What the UI sends, exactly as it's built in `src/lib/matcher.ts`:

```json
{
  "profile": { "skill_ids": ["python"], "country_code": "IN", "study_level": null, "graduation_year": null },
  "opportunity_type": null,
  "include_ineligible": false
}
```

- `country_code` is uppercased, and it's either 2 letters or `null`.
- `study_level` is `school`, `undergraduate`, `postgraduate`, `other` or `null`.
- `graduation_year` is an integer or `null`.
- `opportunity_type` is `internship`, `hackathon` or `null` (null means all).

## What the backend owns

The UI shows `items` **in the order received** and never re-scores them, so the backend must:

- Leave out closed, unapproved and past-deadline listings.
- Rank eligible results first, then needs_verification, then ineligible (only when `include_ineligible=true`). Within each group, sort by `skill_fit` descending with null last, then by title, then by id.
- Put deadline and timezone caveats in `warnings`, and eligibility explanations in `eligibility_reasons`. The UI prints both word for word.
- Use canonical skill ids in `matched_skills` and the `missing_*` lists. Display names come from `/api/skills`, and an id the UI doesn't know is shown raw.

## Errors

Use the existing `{"error": "Readable message"}` shape with a 4xx or 5xx status. The UI shows the message as it is, for example under "Matching failed: …".

## Contract checks in the browser

`src/lib/contract.ts` checks every response before the UI reads it. If a field is missing or has the wrong type, the user sees one line naming it, for example:

> The backend sent an unexpected response from POST /api/matches (response.items[0].skill_fit should be a number).

In dev builds the full response is also logged to the browser console with a `[contract]` prefix. The sample files in `src/fixtures/` pass these checks, so making your JSON match `match-response.json` is the quickest way to get it right.

## Running against the real API

1. `cp .env.example .env` and fill in the Supabase URL and anon key. Keep `VITE_BACKEND_URL=http://localhost:5000` and `VITE_USE_FIXTURES=false`.
2. Start Flask on port 5000. `FRONTEND_ORIGINS` in `backend/.env` must include `http://localhost:5173`, which is already the default.
3. Run `npm run dev`, sign in, and work through these checks:
   - Skills load.
   - An unsaved profile comes back empty.
   - Matching shows cards.
   - Saving and reloading keeps the profile.
   - Stopping Flask shows "Cannot reach the backend".

CORS already allows `Authorization` and `Content-Type` on `/api/*` (see `create_app` in `backend/app.py`), and flask-cors allows `PUT` by default.
