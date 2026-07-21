# malem — real accounts on Cloudflare (Pages Functions + D1)

Version 7 uses the same API contract in local development and production:
- **D1** (SQLite) stores users, hashed sessions, and synchronized state — see
  [`../schema.sql`](../schema.sql).
- **Pages Functions** serve the API at `/api/*` — see [`../functions/api/[[route]].js`](../functions/api/%5B%5Broute%5D%5D.js).
- Passwords are hashed with **PBKDF2-SHA256** (per-user salt).
- Session cookies are random, **HttpOnly**, **Secure**, and SameSite; only a
  SHA-256 token hash is stored in D1.
- `GET/PUT /api/state` synchronizes profile, trips, active trip, group, and
  journal. Requests are authenticated, shape-validated, and capped at 2 MiB.
- `GET /api/community` returns only journal entries explicitly marked public.
  D1 stores a small public projection beside the private state, so community
  reads never scan full trip bundles; responses are edge-cached for five minutes
  and invalidated on publication or account deletion.

## One-time setup

```bash
# 0. Authenticate wrangler (once)
wrangler login

# 1. Create the database, then paste the printed database_id into wrangler.toml
wrangler d1 create malem-db

# 2. Create the tables (locally + remotely)
wrangler d1 execute malem-db --local  --file=./schema.sql
wrangler d1 execute malem-db --remote --file=./schema.sql

# 3. Run everything locally (static site + matching local account API)
node server.mjs
#    -> http://localhost:8000
#
# Or validate the D1 Pages runtime itself:
npx wrangler pages dev . --d1 DB=malem-db

# 4. Ship it
wrangler pages deploy
```

Do not use `python3 -m http.server`: it has no identity, state, or upstream API
routes. `server.mjs` persists development accounts in
`.malem-data/accounts.json` by default; that ignored file must never be
committed. Set `MALEM_DATA_FILE` to isolate automated or manual test data.

## API contract

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/signup` | Create an account and session |
| `POST` | `/api/login` | Verify credentials and create a session |
| `POST` | `/api/logout` | Invalidate the current server session |
| `DELETE` | `/api/account` | Delete the user, sessions, and synchronized state |
| `GET` | `/api/me` | Restore the signed-in user during app boot |
| `GET` | `/api/state` | Hydrate synchronized customer state |
| `PUT` | `/api/state` | Replace validated Version 1 customer state |
| `GET` | `/api/community` | Read explicitly published journal entries |
| `GET` | `/api/health` | Confirm that identity storage is configured |

The frontend checks `/api/me` before routing, retains the current public user in
memory, hydrates state after signup/login/reload, and debounces state writes.
Device-only settings and provider secrets are outside this payload.
