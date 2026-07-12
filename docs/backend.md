# malem — real accounts on Cloudflare (Pages Functions + D1)

This moves auth off browser `localStorage` and onto a real backend:
- **D1** (SQLite) stores users + sessions — see [`../schema.sql`](../schema.sql).
- **Pages Functions** serve the API at `/api/*` — see [`../functions/api/[[route]].js`](../functions/api/%5B%5Broute%5D%5D.js).
- Passwords are hashed with **PBKDF2-SHA256** (per-user salt).
- Sessions are random tokens in an **httpOnly, Secure** cookie — the browser never holds a password hash again.

## One-time setup

```bash
# 0. Authenticate wrangler (once)
wrangler login

# 1. Create the database, then paste the printed database_id into wrangler.toml
wrangler d1 create malem-db

# 2. Create the tables (locally + remotely)
wrangler d1 execute malem-db --local  --file=./schema.sql
wrangler d1 execute malem-db --remote --file=./schema.sql

# 3. Run everything locally (static site + /api together, one origin)
wrangler pages dev
#    -> open the printed http://localhost:8788

# 4. Ship it
wrangler pages deploy
```

Local dev note: use `wrangler pages dev` (serves the API too), **not** `python3 -m http.server` — the latter serves only the static files and `/api/*` will 404.

## Frontend swap (do this once the API is deployed)

Replace the `localStorage`-backed `auth` module in `app.js` with these fetch calls. The UI already
routes through `auth.*`, so the main ripple is that **`current()` becomes async** — add `await` at its
few call sites in the `ui` module.

```js
// ---------- auth (backend-backed) ----------
const auth = (() => {
  const api = (path, body) => fetch('/api/' + path, {
    method: 'POST', credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
  }).then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Request failed.'); return d; });

  const signup  = (name, email, password) => api('signup', { name, email, password });
  const signin  = (email, password)       => api('login',  { email, password });
  const signout = ()                       => api('logout');
  const current = ()                       => fetch('/api/me', { credentials: 'include' }).then(r => r.ok ? r.json() : null);
  return { signup, signin, signout, current };
})();
```

The `useDemo()` seeding still works client-side, or can be reworked to seed via the API later.
