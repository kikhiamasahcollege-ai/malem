# Malem Version 7 release plan

Version 7 is the customer-ready stabilization release. It closes the gap
between the current browser-only prototype and a deployable application whose
accounts, trips, preferences, groups, and journals survive reloads and work
across browsers.

## Release blockers found in the audit

1. **Accounts are browser-local.** The client signs users in from
   `localStorage`; the existing Cloudflare D1 endpoints are never called.
   Accounts therefore disappear when the origin, browser, or device changes.
2. **User data is browser-local.** Trips, profile preferences, group members,
   and journal entries are not attached to the server account.
3. **Local and deployed backends do not match.** The local server has no auth
   routes, while the Cloudflare routes do not support user state.
4. **Degraded planning is blocked.** The client contains a local trip parser and
   itinerary engine, but refuses to use them when the AI service is unavailable.
5. **Several destination panels can become empty.** Packing, expectations, and
   local recommendations need useful generic fallbacks for destinations outside
   the small built-in catalogue.
6. **The demo account can duplicate its seeded trip.** Repeated use is not
   idempotent.
7. **Release verification is incomplete.** The image pipeline has automated
   coverage, but identity, persistence, routing, forms, state sync, and degraded
   behavior do not.

## Workstreams

### V7.1 — Durable identity and user state

- Replace client-side password storage with `/api/signup`, `/api/login`,
  `/api/logout`, and `/api/me`.
- Keep the authenticated user in memory after an asynchronous boot check so
  existing synchronous rendering stays predictable.
- Add authenticated `/api/state` GET/PUT endpoints.
- Sync only customer content: profile, trips, active trip, group, and journal.
  Theme and model preferences remain device-local; secrets are never synced.
- Hydrate server state after signup, login, and reload; debounce writes and
  flush pending state during page exit.
- Give every auth and sync failure a clear, recoverable message.

### V7.2 — Matching secure backends

- Implement the same auth/state contract in the local Node server and the
  Cloudflare Pages Function.
- Validate email, name, password, JSON size, and state shape.
- Hash passwords with PBKDF2 and store only a hash and per-user salt.
- Store only a hash of session tokens in the database and use HttpOnly,
  SameSite cookies (`Secure` in production).
- Add session expiry and cleanup, safe error responses, no-store API caching,
  and request-method guards.
- Extend the D1 schema for user state and public community entries.

### V7.3 — Graceful degraded planning

- Let the deterministic local parser and itinerary builder create a trip when
  AI is unavailable or an upstream request fails.
- Preserve a visible notice that live research was unavailable.
- Supply useful generic packing, expectations, discovery, and local guidance
  for destinations not in the built-in catalogue.
- Keep previously saved trips fully usable offline or during upstream trouble.

### V7.4 — Feature correctness and accessibility

- Verify signup, login, logout, session reload, and cross-client persistence.
- Verify trip creation, switching, deletion, itinerary refresh, outfits,
  packing adjustments, expectations, discovery, and local filters.
- Verify profile save/reset, group add/remove/voting, journal save/publication,
  settings, theme, sidebar behavior, privacy/terms, and public community.
- Make demo seeding idempotent or remove it from the production path.
- Correct invalid nested labels and ensure form status/errors are announced.
- Confirm desktop and mobile layouts have no blocking overflow or inaccessible
  controls.

### V7.5 — Metered image pipeline

- Retain the completed edge/browser caching, request caps, in-flight deduping,
  bounded result sets, full-outfit searches, and graceful image placeholders.
- Re-run its automated suite as part of every release gate.

### V7.6 — Repeated automated and browser tests

- Add API contract tests for signup, duplicate signup, login failure/success,
  session reload, logout, unauthorized state, state round-trip, input limits,
  and persistence across server restart.
- Add static regression checks for the client/server contract and degraded
  planning path.
- Run all automated tests at least three consecutive times.
- Exercise every customer-visible feature in a real browser at desktop and
  mobile widths at least twice, checking console and network failures.

### V7.7 — Deployment gate

- Update setup documentation and environment examples.
- Make the D1 binding and schema application explicit; remove prototype
  statements that say frontend auth is unfinished.
- Run syntax checks, tests, browser smoke tests, and a final source/status audit.
- The release passes only when there are no known functional blockers, no
  plaintext browser passwords, no unhandled console errors, and the documented
  deployment configuration is complete apart from account-specific Cloudflare
  resource identifiers.

## Acceptance criteria

- A new account remains signed in after reload and can sign in from a separate
  browser client.
- Trips and all synced customer state appear in that second client.
- Signing out invalidates the server session.
- The app can create and navigate a useful trip while OpenRouter and image
  upstreams are unavailable.
- Every feature listed in V7.4 passes twice in browser testing.
- The complete automated suite passes three times consecutively.
- Production code, schema, and documentation agree on one API contract.

## Execution result

Completed on 19 July 2026:

- Server-backed signup, login, logout, reload restoration, state sync, public
  community projection, and account deletion are implemented in both runtimes.
- Arbitrary-destination parsing, degraded trip creation, packing rebuilds, local
  filters, journal visibility/removal, and responsive navigation were repaired
  and verified through the UI.
- Full-outfit retrieval remains bounded, cached, deduplicated, and degraded-safe.
- A no-AI workflow and a complete mocked live workflow each passed in browser;
  session and state hydration also passed from a second browser origin.
- Desktop and 390 × 844 mobile layouts passed with working navigation and no
  console errors.
- The 18-test release suite passed three consecutive runs.
- Static assets now apply a CSP and other browser security headers, exclude
  secrets/test data from Pages uploads, and document the required D1 `DB`
  binding without embedding an account-specific resource id.
