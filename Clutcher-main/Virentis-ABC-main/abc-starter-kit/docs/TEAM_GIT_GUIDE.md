# Working together on GitHub

Goal: everyone builds in parallel and nothing breaks `main`.

## One-time setup (one person, 10 minutes)

1. On GitHub, create a **private** repository (for example `abc-buildathon`).
2. In a terminal inside the starter-kit folder:
   ```bash
   git init
   git add .
   git status                      # check: NO .env files in the list
   git commit -m "Add starter kit"
   git branch -M main
   git remote add origin https://github.com/YOUR-USER/abc-buildathon.git
   git push -u origin main
   ```
3. Repo -> Settings -> Collaborators -> add every teammate.
4. Everyone else:
   ```bash
   git clone https://github.com/YOUR-USER/abc-buildathon.git
   ```
5. Each person creates their own `backend/.env` and `frontend/.env` from the `.env.example` files. **These are never shared through GitHub.** Share keys privately (or have each person make their own Gemini key).

## The daily loop (use branches)

```bash
git switch main
git pull                              # get everyone's latest work
git switch -c feature/ana-login-page  # your own branch; name = feature/<you>-<thing>

# ...work, and the moment something works:
git add .
git commit -m "Login page shows errors"
git push -u origin feature/ana-login-page
```
Then on GitHub click **Compare and pull request**, ask a teammate to glance at it for two minutes, and **Merge**. Everyone then runs `git switch main && git pull`.

Rules of thumb:
- **`main` always runs.** If you break it, fix it first.
- **Small, frequent commits**, every time something works. A commit is a save point you can return to.
- **Pull before you start** and again before you push.
- **Don't edit the same file at once.** Agree owners (below).

## Suggested file ownership

| Person | Owns |
|---|---|
| UI designer | `frontend/src/styles.css`, `frontend/src/pages/`, design exports from Stitch |
| AI and logic | `backend/ai.py` and prompts |
| Builder and integrator | `backend/app.py`, `backend/db.py`, `supabase/schema.sql`, `frontend/src/lib/` |
| Pitch lead | `docs/`, demo script, slides |

If you must touch someone else's file, tell them first.

## If you get a merge conflict

Git marks the clash inside the file:
```
<<<<<<< HEAD
your version
=======
their version
>>>>>>> main
```
Open the file in VS Code, click **Accept Current**, **Accept Incoming**, or **Accept Both** on each clash (or edit by hand), delete the marker lines, run the app, then `git add .` and `git commit`. Ask a teammate if unsure; do not delete other people's work.

## Simpler mode if branches slow you down
With 2 to 3 people on separate files, commit straight to `main`: `git pull --rebase`, then `git push`, every time. Branches are safer; this is faster. Pick one and stick to it.

## Secrets: what to do if one leaks
- Never commit `.env`. Check `git status` before every commit.
- GitHub may block a push that contains a recognisable key. Don't bypass it.
- If a key was pushed: **create a new key and disable the old one immediately.** Deleting the file or the commit is not enough, because the old value stays in history.

## Handy commands
| Command | Meaning |
|---|---|
| `git status` | What changed? |
| `git log --oneline -10` | Last 10 saves |
| `git diff` | Exactly what I changed |
| `git restore <file>` | Throw away my edits to a file (cannot be undone) |
| `git stash` / `git stash pop` | Park my edits, then bring them back |
