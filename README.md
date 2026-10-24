# Group Attendance

A no-sign-in group attendance tracker: a group admin shares a code, members pick a name and
answer "Going" / "Can't" for weekly sessions. Static frontend (Vite + React + TypeScript)
hosted on GitHub Pages, backed by Supabase (Postgres + RPC, no custom server).

## Stack

- Vite + React + TypeScript, hash routing (`#/...`), plain CSS (no UI kit)
- Supabase (Postgres, RLS, RPC functions) via `@supabase/supabase-js`
- Vitest + Testing Library for tests
- GitHub Actions: build/test/deploy to GitHub Pages, plus a twice-weekly keep-alive ping

## Local setup

```bash
npm install
cp .env.example .env   # fill in VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_DB_URL
npm run dev             # start the dev server
npm test                # run tests once (watch mode by default; use `npm test -- --run` for CI-style single run)
npm run build            # production build to dist/
npm run preview          # preview the production build locally
```

`.env` is never committed (see `.gitignore`). `SUPABASE_DB_URL` is only used locally by the
`db:*` scripts below and is never referenced by frontend code.

## Database scripts

These apply the SQL migration and test suite directly against the Supabase Postgres database
using `psql`, with environment variables loaded from `.env` via `dotenv-cli`:

```bash
npm run db:migrate   # applies supabase/migrations/0001_init.sql
npm run db:test       # runs supabase/tests/test.sql (expected to run inside a rollback transaction)
```

Requires `psql` on your `PATH` and a valid `SUPABASE_DB_URL` in `.env`. The direct
`db.<ref>.supabase.co` host is IPv6-only; on an IPv4-only network use the **Session pooler**
connection string (Dashboard → Connect), user `postgres.<ref>`, port 5432.

The migration is idempotent (safe to re-run). It can also be pasted into the Supabase SQL
editor. `db:test` runs inside a transaction that ends in `ROLLBACK`, so it leaves no rows.

## Environment variables / secrets

| Variable | Used by | Where it lives |
|---|---|---|
| `VITE_SUPABASE_URL` | frontend (build + runtime) | `.env` locally, repo secret `VITE_SUPABASE_URL` in CI |
| `VITE_SUPABASE_ANON_KEY` | frontend (build + runtime) | `.env` locally, repo secret `VITE_SUPABASE_ANON_KEY` in CI |
| `SUPABASE_DB_URL` | `db:migrate` / `db:test` only | `.env` locally only — never in CI, never in frontend code |

The anon key is public by design; data access is protected by Postgres RLS policies and
RPC-only mutations.

## GitHub Pages setup

1. In the repo **Settings → Pages**, set the source to **GitHub Actions**.
2. Add the two frontend secrets above under **Settings → Secrets and variables → Actions**.
3. Push to `main` (or run the `Deploy to GitHub Pages` workflow manually) to build and deploy.
   Vite's `base` is set to `/group-attendance-web/` to match the Pages project path.
4. The `Keep Supabase project alive` workflow runs twice a week (Mon and Thu, and on demand)
   to call a trivial `ping` RPC, since free Supabase projects pause after ~7 days of inactivity.
   Note: GitHub disables scheduled workflows in a repository with no activity for 60 days.
   If that happens, re-enable it from the **Actions** tab (or push any commit).
