# CONTRIBUTING.md — AgriConnect (SIH26033)

Thanks for contributing! This guide keeps collaboration safe and predictable.

## Branching model

- `main` — always-deployable checkpoint branch. Protected by convention: **no direct force pushes, ever**.
- `feature/<name>` — new functionality (e.g. `feature/order-items-ui`)
- `bugfix/<name>` — defect fixes (e.g. `bugfix/forecast-fallback`)

## Recommended workflow

```bash
# start from the latest main
git checkout main
git pull origin main

# create your branch
git checkout -b feature/<name>

# ...make changes...

# verify before committing (see Testing section)
cd frontend && npm run build
cd ../backend && node -e "require('./server.js')" &   # or run dev server briefly

git add <specific-files>          # review with `git status` / `git diff` first
git commit -m "feat: description"
git push -u origin feature/<name>
```

Then open a **Pull Request** on GitHub and request review.

Commit message prefixes:

- `feat:` new functionality
- `fix:` bug fix
- `docs:` documentation only
- `chore:` tooling/config/cleanup
- `data:` importer/provider changes (no data files in Git!)

## Non-negotiable rules

1. **NEVER commit `.env`.** Secrets (API keys, JWT secrets, DB passwords) live only in your local `.env`, which is git-ignored. Placeholders go in `.env.example`.
2. **NEVER run destructive database commands** against any shared/production database (`DROP DATABASE`, `TRUNCATE`, `db:reset`). The local `npm run db:reset` script drops the *local* dev database only — think twice.
3. **NEVER commit generated data**: CSV dumps, logs, `node_modules`, build outputs, DB dumps. Data lives in PostgreSQL; how to obtain it lives in docs.
4. **NEVER force-push `main`**, and never rewrite published history.
5. **Never present DEMO/seed data as government data.** Provenance columns (`source`, `data_period`) exist for this reason — preserve them.

## Code style

- Backend: CommonJS, plain Express handlers, raw SQL via `pg` (`backend/db.js` query helper).
- Frontend: functional React components + hooks, Tailwind utility classes.
- Keep providers (`backend/providers/*`) thin: fetch → normalize → return. Normalization must map AGMARKNET's nested `markets[].dates[].data[]` shape correctly.

## Adding tests

There is no suite yet — adding one is a great first PR. Suggested minimal stack:
`vitest` (frontend) and `node:test` or `jest` + `supertest` (backend), plus a CI job that runs them on every PR.

## Reporting issues

Open a GitHub Issue with: what you did, what you expected, what happened, and relevant log output (**redact any tokens/keys first**).
