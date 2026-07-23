# malem

A travel companion that understands who you are, gives you several ways to
experience a destination, prepares you for the trip, and adapts your plans in
real time.

**Status:** Version 7 deployed at [malemtravel.com](https://malemtravel.com).

## What's here

- `index.html` / `styles.css` / `app.js` — dependency-free client with account,
  trip chat, itinerary, full-outfit inspiration, packing, cultural preparation,
  Discover Now, local guidance, group voting, public journal, profile, and
  settings flows.
- `server.mjs` — matching local auth/state, OpenRouter, fashion-search, and
  image-proxy API.
- `functions/api/` — Cloudflare Pages Functions for the same deployed APIs.
- `schema.sql` — D1 accounts, hashed sessions, and synchronized user state.
- `docs/version-7-plan.md` — release blockers, workstreams, and acceptance
  criteria used for the final stabilization pass.
- `docs/vision.md` — the full 7-feature product vision.
- `docs/data-model.md` — the framework-agnostic data shapes shared between
  the website today and the mobile app later.

## Run it

Run the included local server. Accounts and trips require it; OpenRouter is
optional because the deterministic planner keeps the site useful when live
research is unavailable:

```
cp .env.example .env
# Optionally put an OpenRouter key in .env for current web research.
node server.mjs
# then visit http://localhost:8000
```

Do not open `index.html` directly with a `file://` URL. Identity, state, and
live-data routes are intentionally server-side. Direct file launches redirect
to `http://localhost:8000`.

Passwords are PBKDF2-hashed with a per-user salt. Random session tokens are
hashed at rest and sent only in HttpOnly, SameSite cookies. Profile, trips,
active trip, group, and journal state sync to the authenticated account while a
local cache keeps rendering fast. Device-specific theme, model settings, image
ranking signals, and optional provider keys are not synchronized.

`server.mjs` also exposes same-origin OpenRouter chat, fashion search, and safe
image-proxy routes. It adds the Bearer key and app attribution server-side, so
the browser cannot retrieve the OpenRouter key. The live itinerary pipeline uses
isolated calls for place discovery, review verification, vibe selection, and
presentation, with an automatic schema-repair pass when needed. If it is
unconfigured or fails, Malem explicitly labels and saves a deterministic
offline-ready plan instead of leaving the site unusable.

The deployed outfit-image pipeline is budget-bounded: at most two uncached
full-look searches are attempted per look, twelve per browser render, and three
upstream fetches per server search. Search results persist in the browser and at
Cloudflare's edge. Images load directly first and use the allowlisted Cloudflare
proxy only when a remote host blocks the browser. When limits or upstream
providers are unavailable, the UI uses cached results or a source-search link
instead of repeatedly retrying.

There is no build step or package dependency. Copy `.env.example` into your
preferred secret manager or export its variables before starting the server.

The production Cloudflare Pages project has the `malem-db` D1 database bound as
`DB` in `wrangler.toml`; the database identifier is deployment metadata, not a
credential. `PUBLIC_BASE_URL` is set to `https://malemtravel.com`; the stable
`pages.dev` hostname and `www` alias redirect to that canonical origin. For a
new account or disaster-recovery copy:

```
npx wrangler d1 create malem-db
# Bind the returned database as DB in Pages settings, then:
npx wrangler d1 execute malem-db --remote --file=./schema.sql
npx wrangler pages secret put OPENROUTER_API_KEY
```

The D1 binding must remain named `DB`. If a replacement database is created,
update its non-secret identifier in `wrangler.toml`. The OpenRouter secret is optional. See
`docs/backend.md` for the complete local and deployed setup.

## Verify it

```
node --check app.js
node --check server.mjs
node --test tests/*.test.mjs
```

## Design principles

- **Every preference is a control the user sets.** Never inferred from
  ethnicity, religion, or demographic.
- **Data shape is the contract.** Web, server, D1, and future mobile clients
  share the Version 1 user-state object in `docs/data-model.md`.
- **Useful under pressure.** Upstream failures must preserve saved trips and
  produce an honest, clearly labelled degraded experience.
