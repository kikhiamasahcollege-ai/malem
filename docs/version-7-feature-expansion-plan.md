# Malem Version 7 feature expansion plan

**Status:** implemented and deployed
**Prepared:** 21 July 2026  
**Scope:** custom production domain, manual plan editing, real-world Discover Now
options, itinerary directions and ticketing, and trip-scoped collaboration.

## 1. Release outcome

Version 7 should move Malem from a strong solo-planning prototype to a usable
shared trip workspace. A successful release lets a traveler:

1. visit Malem at a branded domain instead of a `pages.dev` address;
2. safely edit itinerary, packing, and Discover Now content without losing
   changes during refreshes or AI regeneration;
3. open a Discover Now card and choose among real nearby places, with evidence,
   reviews, source links, and Google Maps directions;
4. open directions for every named itinerary stop and see an official booking
   link and checked ticket price only where advance tickets are actually needed;
5. invite real account holders to a specific trip as an editor or viewer; and
6. include collaborator vibe votes and activity feedback in later generation or
   regeneration without silently overwriting human edits.

This is an expansion of the completed V7 stabilization release documented in
`docs/version-7-plan.md`. It is not a framework rewrite or a native-app launch.

## 2. Current-state audit

The existing release provides useful foundations, but the requested features
cannot be safely layered on top of the current storage shape without a backend
migration.

- Production runs at `https://malemtravel.com`; `localhost` is only the
  development runtime. The stable `malem.pages.dev` hostname redirects to the
  canonical custom domain, while preview deployments remain available.
- D1 currently stores one `state_json` document per account. Trips, group members,
  and journal entries belong to a user, not to an independently shareable trip.
  Whole-document saves are last-write-wins and would allow collaborators to
  overwrite one another.
- The itinerary renderer already displays source and review links. Its blocks do
  not yet have stable IDs, addresses, coordinates, directions, ticket-required
  status, official booking URLs, prices, or price-check timestamps.
- Packing controls can rebuild the rendered list, but rebuilt or manually changed
  content is not persisted as a durable editable document.
- Discover Now currently produces generic text steps such as “Local market walk.”
  Those plans are neither live-researched nor stored in the trip.
- The current Group screen adds names to the owner's private state. These are not
  authenticated members, invitations, or permissions. A vibe is a field on a
  manually added name rather than a vote by another account.
- Browser geolocation is currently disabled by the production
  `Permissions-Policy`; “nearby” therefore requires both a policy change and a
  privacy-conscious location flow.

## 3. Product and engineering rules

1. **Human edits outrank generated content.** AI refreshes produce a reviewable
   proposal. They never silently replace manually edited or locked items.
2. **Every named place is evidence-backed.** Unknown rating, price, accessibility,
   booking, or opening information stays unknown; it is never inferred.
3. **Permissions are enforced by the server.** Hiding edit buttons is not access
   control.
4. **A trip is the collaboration boundary.** Membership, invites, votes, journal
   entries, edits, and generated context are attached to one trip.
5. **External data is dated and degradable.** Saved plans remain usable when
   Google, OpenRouter, or Cloudflare limits are tight; stale facts are labelled.
6. **No unnecessary phone-number storage.** The first release shares a secure
   link through Copy, Web Share, or the device's SMS composer. Managed SMS
   delivery is a later opt-in integration.
7. **Keep the current stack.** Continue with Cloudflare Pages, Pages Functions,
   D1, and the dependency-light client. Extract modules from `app.js` gradually;
   do not pause delivery for a frontend-framework rewrite.

## 4. Target data model

### 4.1 D1 tables

Add migrations rather than editing production state in place:

- `trips`: one row per trip, with owner, destination, title, dates, status, and
  timestamps;
- `trip_documents`: the current validated trip document JSON, schema version,
  monotonically increasing revision, last editor, and updated time;
- `trip_members`: one row per account/trip with `owner`, `collaborator`, or
  `viewer` role; the UI label for `viewer` is **Passenger princess**;
- `trip_invites`: hashed invite token, target trip, offered role, inviter,
  expiration, use limit, revocation, and acceptance metadata;
- `trip_mutations`: idempotency key, base/result revision, actor, operation,
  bounded before/after data, and time for undo and audit history;
- `trip_vibe_votes`: one current vibe ballot per member and trip;
- `itinerary_item_votes`: one up/down/neutral vote plus an optional short note
  per member and itinerary item; and
- `place_cache`: provider/key, bounded normalized result, retrieval time,
  expiration, and stale-until time for cost control and degraded behavior.

Do not place invitation tokens in plaintext in D1. Store only a SHA-256 token
hash, as the session implementation already does.

### 4.2 Trip document V2

Every editable entity gets a stable ID. The important additions are:

```ts
type EditableMeta = {
  id: string;
  origin: 'generated' | 'manual';
  locked: boolean;
  updatedAt: string;
  updatedBy: string;
};

type PlaceOption = {
  id: string;
  providerPlaceId?: string;
  name: string;
  description: string;
  category: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  rating?: number;
  reviewCount?: number;
  reviewSummary?: string;
  sourceUrl: string;
  reviewsUrl?: string;
  officialUrl?: string;
  directionsUrl: string;
  checkedAt: string;
};

type BookingEvidence = {
  required: 'yes' | 'no' | 'unknown';
  officialBookingUrl?: string;
  price?: { amount: number; currency: string; qualifier?: 'from' | 'standard' };
  priceCheckedAt?: string;
  sourceUrl?: string;
};
```

Itinerary blocks extend `EditableMeta` and contain one selected `PlaceOption`
plus `BookingEvidence`. Packing list sections and items also extend
`EditableMeta` and add `checked`. Discover sessions store the input context,
three plan cards, editable steps, two to four `PlaceOption` alternatives per
place-based step, and the user's selected option.

## 5. API and concurrency design

Replace whole-account writes for shared trips with trip-scoped endpoints while
keeping `/api/state` temporarily for profile and migration compatibility.

```text
GET    /api/trips
POST   /api/trips
GET    /api/trips/:tripId
PATCH  /api/trips/:tripId/document
GET    /api/trips/:tripId/history
POST   /api/trips/:tripId/invites
GET    /api/trips/:tripId/members
PATCH  /api/trips/:tripId/members/:userId
DELETE /api/trips/:tripId/members/:userId
POST   /api/invites/:token/accept
POST   /api/trips/:tripId/vibes/vote
POST   /api/trips/:tripId/itinerary/:itemId/vote
POST   /api/trips/:tripId/discover
```

Document edits send a small operation list, a `baseRevision`, and a unique
`clientMutationId`. The server applies the operation in a D1 transaction,
increments the revision, records the audit event, and returns the new document.
Repeated mutation IDs are harmless. A stale revision returns `409` with the
latest document; the client replays non-overlapping edits or shows a clear
conflict review instead of overwriting another traveler.

Implement the same contract in `server.mjs` and Pages Functions so local and
production behavior remain equivalent.

## 6. Role and permission matrix

| Action | Owner | Collaborator | Passenger princess |
| --- | ---: | ---: | ---: |
| View all trip sections | Yes | Yes | Yes |
| Add, edit, remove, or reorder plan content | Yes | Yes | No |
| Vote on vibe and itinerary items | Yes | Yes | No |
| Generate or regenerate a plan | Yes | Yes | No |
| Add trip journal content | Yes | Yes | No |
| Create/revoke invites and change roles | Yes | No | No |
| Delete trip or transfer ownership | Yes | No | No |

The owner is created automatically and cannot accidentally remove or demote
themselves. Every mutation checks membership and role in D1 before reading or
writing private trip data.

## 7. Phased implementation

### V7.1 — Stable public domain and URL configuration

1. The owner purchased `malemtravel.com` through Cloudflare Registrar and
   completed the legal acceptance, registrant contact, and payment step.
2. Add the apex domain and `www` hostname to the Pages project, wait for managed
   TLS, enable DNSSEC and auto-renew, and choose one canonical hostname.
3. Redirect the other custom hostname and the production `malem.pages.dev` URL
   to the canonical domain. Keep preview deployment URLs available to the team.
4. Introduce `PUBLIC_BASE_URL`; use it for invite URLs, OpenRouter attribution,
   canonical metadata, CSP allowlists, and future mobile universal links.
5. Test auth cookies, signup/login/logout, deep routes, Pages Functions, D1,
   social preview metadata, and rollback from the custom domain.

**Gate:** the canonical HTTPS domain serves the same healthy app, all auth and
API traffic is first-party, and no customer-facing flow points to localhost.

### V7.2 — Trip-scoped backend and migration

1. Add the new D1 tables and validation functions.
2. Introduce a schema-versioned Trip Document V2 with stable IDs.
3. On first post-release account load, promote each existing `state_json` trip
   into `trips` and `trip_documents`; create the owner membership; preserve the
   original JSON as a temporary migration backup.
4. During one release window, dual-read old and new data but write shared trip
   changes only through the new API. Record migration state so retries are
   idempotent.
5. Move group and journal data into the relevant trip. If legacy data cannot be
   matched unambiguously, attach it to the current active trip and show a
   one-time confirmation.

**Gate:** every existing account sees the same trips after migration; two test
clients can edit different items without lost updates; rollback is documented.

### V7.3 — Manual editors and safe regeneration

Build one reusable accessible editor pattern and apply it consistently.

- **Itinerary:** add activity, edit all fields, remove, duplicate, move within a
  day, move to another day, reorder with keyboard-accessible controls, and undo.
- **Packing:** add/edit/remove/reorder items and sections, move an item between
  sections, check items off, and persist custom packing controls and results.
- **Discover Now:** edit card title/reason, add/edit/remove/reorder steps, replace
  a selected place option, and add a custom place or note.

Use optimistic UI with visible `Saving…`, `Saved`, `Offline`, and `Conflict`
states. Destructive actions get undo; unsaved edits survive accidental modal
closure. Generated items are editable by default, but the first human edit marks
the item `origin: manual` and `locked: true`.

Regeneration opens a diff: keep, add, replace, and remove. Locked/manual items
are carried forward unless the user explicitly unlocks them. Accepting the diff
is one revision so collaborators do not see a half-applied plan.

**Gate:** owner and collaborator edits persist across reload and a second
browser; viewers cannot call write APIs; regeneration preserves locked items.

### V7.4 — Real place-enrichment service and Discover Now

Use a provider adapter behind a server-only `/api/trips/:tripId/discover`
endpoint. The recommended first provider is Google Places API (New) for stable
place IDs, nearby/text search, addresses, rating totals, current opening data,
and Google Maps links. Request only explicit field masks to limit cost. Use the
existing web-research pipeline only to verify a short description, official
source, or booking evidence that Places does not provide.

1. Ask for browser location only after the user selects **Use my location**.
   Change `Permissions-Policy` to allow geolocation for self. Do not persist raw
   precise coordinates by default; hold them for the Discover session and round
   cache keys to a coarse area.
2. Always offer manual starting location/neighborhood input. This is the fallback
   when permission is denied, unavailable, or the user is planning remotely.
3. Convert each generic step into an intent such as `market`, `cafe`, `museum`,
   or `viewpoint`; search within a time-appropriate radius and rank by distance,
   open status, profile constraints, quality evidence, itinerary fit, and
   geographic coherence.
4. Return two to four real options for every place-based step. A plan card uses
   an accessible disclosure/accordion: collapsed shows the route summary;
   expanded shows option name, short description, rating and count when
   available, address, checked time, source/reviews links, and Directions.
5. Let the traveler select one option per step and save the result to the trip.
   Add **Add to main itinerary** as a transactional follow-up action.
6. Cache normalized provider responses, cap results and upstream calls, dedupe
   concurrent requests, and return a saved/stale result with a visible label
   when quota or upstream fetches fail.

Google Maps direction links use the universal
`https://www.google.com/maps/dir/?api=1&...` format with place IDs where
available. Maps URLs themselves do not require an API key and open the app or
browser appropriate to the device.

**Gate:** Nashville, Milan, and one smaller destination each return three
coherent plans; every place exists, directions open the intended place, all
displayed evidence has a source and date, and a denied-location test still works.

### V7.5 — Main-itinerary directions, booking, and ticket prices

Run the same place-enrichment layer during initial generation, regeneration,
and manual place selection.

- Every named physical stop gets a stable provider place ID where possible,
  address, source link, and **Directions** action.
- Show **Book official tickets** only when verified evidence says a ticket or
  reservation is needed or strongly recommended. Prefer the venue/operator's
  official URL; label any approved marketplace fallback.
- Show the price only when the same source supplies a current amount. Store the
  original currency, `from`/`standard` qualifier, source, and checked date.
  Prices beyond the freshness window become “Check current price” rather than
  silently remaining exact.
- Never display a purchase CTA for public streets, neighborhoods, open markets,
  or free spaces unless a specific paid experience was selected.

**Gate:** all itinerary direction links resolve correctly; booking buttons are
absent for non-ticketed stops; sampled prices match their official source and
show currency and check date.

### V7.6 — Secure invitation and collaboration flow

1. Add **Share trip** to Group & Journal. The owner selects Collaborator or
   Passenger princess, an expiry (default seven days), and creates an invite.
2. Show Copy link, Web Share, QR code, and **Send via text**. The first web
   release opens the device's SMS composer with the secure HTTPS invite URL;
   Malem does not store the recipient number or send paid SMS itself.
3. Opening `/invite/<token>` shows trip name, inviter, offered role, expiry, and
   a sign-in/create-account path. Acceptance is a POST, consumes or records the
   invite, creates membership, and redirects to the trip.
4. Add member management, role changes, invite revocation, leave trip, and owner
   removal. Show current collaborators, pending invites, and last activity.
5. Later native apps can claim the same HTTPS path through universal/app links;
   until then, invitees use the responsive web app. Do not promise an app
   download before a mobile application exists.

**Gate:** an incognito account can accept both roles; revoked, expired, reused,
or malformed links fail safely; a viewer cannot mutate data even with a direct
API request.

### V7.7 — Collaboration intelligence and voting

1. Each owner/collaborator chooses a primary and optional secondary trip vibe.
   Store the ballot by membership, not by display name, and show the tally.
2. Add thumbs-up/down/neutral voting to itinerary blocks with optional concise
   notes. Show totals without exposing private profile information.
3. Build a bounded `CollaborationContext` for generation:
   - aggregate vibe result and disagreement;
   - accepted group constraints explicitly shared with the trip;
   - positively and negatively voted item categories/IDs;
   - locked manual items that must remain; and
   - the revision on which the context was calculated.
4. Send this context only during trip generation/regeneration. The LLM produces
   a change proposal tied to the same revision. If the trip changes before
   acceptance, rebuild the proposal.
5. Explain why a proposed change reflects group input, and let a human reject
   any suggestion. Do not send phone numbers, emails, or member names to the LLM.

**Gate:** vote changes survive reload, are isolated by trip, visibly affect a
regeneration proposal, and never overwrite a locked manual item.

### V7.8 — Hardening, observability, and release

- Add server-side rate limits for invite creation/acceptance, Places requests,
  regeneration, and mutations; add per-user and per-trip caps.
- Keep provider secrets only in Cloudflare secrets and restrict Google keys to
  the required APIs and server egress where supported.
- Add structured, privacy-safe events for invite lifecycle, conflicts, provider
  failure, stale-cache use, booking-link validation, and migration outcomes.
- Add an activity history and one-step undo for recent plan mutations.
- Run accessibility checks for disclosure controls, editor dialogs, keyboard
  reordering, focus return, live save state, and read-only role presentation.
- Test desktop, tablet, and mobile; weak/offline network; expired sessions;
  upstream 429/5xx; stale place data; two-user conflicts; and deep invite links.
- Ship behind `trip_documents_v2`, `manual_editing`, `real_discover`, and
  `collaboration` flags. Migrate internal accounts first, then a small cohort,
  then all users. Keep a fast flag-based rollback that preserves V2 data.

**Gate:** all automated contract, permission, migration, mutation, place-data,
and degraded-mode tests pass; browser scenarios pass for all three roles; no
known data-loss or privilege-escalation path remains.

## 8. Suggested delivery order and estimate

For one focused engineer, this is approximately a **7–9 week** release, not a
single patch. Work can overlap after the trip API is stable.

| Week | Primary outcome |
| --- | --- |
| 1 | Domain decision/setup, migrations, Trip Document V2 contract |
| 2 | Trip-scoped API, legacy migration, permissions foundation |
| 3 | Itinerary and packing editors, revision/conflict handling |
| 4 | Discover editor and place-provider adapter |
| 5 | Real Discover options, geolocation/manual-location UX, caching |
| 6 | Main itinerary directions, booking evidence, price freshness |
| 7 | Invites, member roles, read-only experience |
| 8 | Vibe/activity voting and LLM regeneration proposal flow |
| 9 | Security, accessibility, load/degraded tests, staged rollout |

Do not begin invitation UI before V7.2 is complete. Do not enable LLM use of
votes before revision-safe regeneration is complete.

## 9. Test plan

The release suite must cover:

- D1 migration idempotency, legacy-state preservation, and rollback;
- every role against every read/write route, including crafted direct requests;
- add/edit/remove/reorder/undo for all three editable areas;
- optimistic concurrency, duplicate mutation IDs, stale revisions, and two-user
  simultaneous edits;
- invite creation, acceptance, expiry, revocation, role change, member removal,
  open redirect protection, rate limiting, and token leakage checks;
- Places response validation, field caps, dedupe, cache hit/stale/miss, incorrect
  place IDs, missing ratings, provider quota errors, and source freshness;
- Maps URL encoding for names, addresses, coordinates, and place IDs;
- booking-required logic, official-source preference, currencies, qualifiers,
  stale prices, and missing prices;
- regeneration diff behavior, locked item preservation, vote-context isolation,
  and no personal identifiers in model requests;
- keyboard and screen-reader use, mobile layouts, denied geolocation, offline
  cached viewing, slow saves, and session expiry; and
- production custom-domain auth, CSP/Permissions-Policy, redirects, TLS, D1,
  Pages Functions, health endpoint, and `pages.dev` canonicalization.

## 10. Release acceptance criteria

V7 is complete only when:

1. customers use the selected custom HTTPS domain, while localhost remains a
   documented development-only tool;
2. manual edits in itinerary, packing, and Discover Now persist and survive
   regeneration;
3. every Discover place option is real, expandable, sourced, dated, and linked
   to correct directions, with graceful stale/cached behavior;
4. every named itinerary place has directions, and ticket price/booking appears
   only with current verified evidence;
5. invitees join the intended trip with the intended role, and the server blocks
   all unauthorized mutations;
6. collaborator vibe and itinerary votes affect a reviewable generation proposal
   without leaking private identity data; and
7. existing user trips migrate with no data loss and the release can be rolled
   back without discarding V2 edits.

## 11. Decisions required before implementation

Only four product/account decisions block execution:

1. the exact domain name and registration term/payment approval;
2. approval to enable a billed Google Maps Platform project and a monthly Places
   API spending ceiling;
3. whether invitation links are single-use or reusable for a small group
   (single-use is the recommended default); and
4. whether Passenger princess is strictly read-only, as specified here, or may
   also vote without editing.

Everything else in this plan can proceed with the recommended defaults.

## Official implementation references

- Cloudflare Registrar: https://developers.cloudflare.com/registrar/get-started/register-domain/
- Cloudflare Pages custom domains: https://developers.cloudflare.com/pages/configuration/custom-domains/
- Google Places API (New): https://developers.google.com/maps/documentation/places/web-service/op-overview
- Google Maps URLs: https://developers.google.com/maps/documentation/urls/get-started
