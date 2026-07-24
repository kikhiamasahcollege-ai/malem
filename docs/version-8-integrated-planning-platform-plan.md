# Malem Version 8 — integrated planning platform execution plan

**Status:** proposed
**Prepared:** 24 July 2026
**Scope:** blank and event plans, wardrobe and visual packing, inspiration
boards, travel operations and booking storage, shared finances, availability
polls, calendar sync, uploads, notifications, and the product/technical
foundation required to make them one cohesive system.

## 1. Release outcome

Version 8 should turn Malem from an AI-assisted travel planner into a durable
shared planning home. Travel remains the flagship experience, but the product
must also support parties and completely manual group plans without forcing an
AI workflow.

A successful release lets a person:

1. create a **Trip**, **Event**, or **Blank plan**;
2. plan manually from an empty workspace, with AI absent unless deliberately
   enabled;
3. invite planners, participants, and read-only viewers with permissions that
   work consistently across every module;
4. vote on dates without exposing private calendar details;
5. keep a private reusable wardrobe, assemble outfits, add photos, and choose
   clothing visually while packing;
6. use detailed personal packing lists, shared group items, and reusable
   templates;
7. save outfit and general aesthetic inspiration in one plan-aware workspace;
8. see itinerary, flights, stays, reservations, tickets, vouchers, check-in
   deadlines, and reminders in one operational timeline;
9. estimate costs, record actual expenses, split them correctly, and settle
   through a supported payment handoff; and
10. use the same product successfully when a provider, AI model, calendar
    connection, or network request is unavailable.

The release is complete only when these capabilities share one information
architecture, permission model, mutation model, visual language, and source of
truth. A set of disconnected pages does not satisfy the goal.

## 2. Current baseline

The existing product already has valuable foundations that V8 must preserve:

- a deployed dependency-free web client on Cloudflare Pages;
- real accounts, HttpOnly sessions, D1 persistence, and a local server with a
  matching API contract;
- trip-scoped documents, stable entity IDs, revisions, idempotent mutations,
  conflict responses, recent-history undo, and offline mutation replay;
- owner, collaborator, and read-only viewer roles enforced by the server;
- secure invitations, trip membership, vibe voting, and itinerary voting;
- manually editable itineraries, packing lists, and Discover sessions;
- evidence-backed places, directions, booking links, price freshness, and
  graceful degraded discovery;
- outfit planning based on itinerary moments and user-controlled Style DNA;
- What to Expect, Discover Now, Local Guide, journals, profile, and settings;
  and
- an explicit production-asset allowlist and security headers.

The current baseline builds successfully and all 40 automated tests pass as of
this plan.

### 2.1 Constraints the implementation must address

- `app.js` is approximately 309 KB uncompressed and owns most state, rendering,
  networking, and event behavior. V8 cannot responsibly add every new feature
  to the same file.
- `functions/api/[[route]].js` contains the production API routing and much of
  its persistence behavior. New domains need shared services rather than
  another large block of route-specific SQL.
- `UserStateV1` still stores profile and legacy collections while collaborative
  trips use the newer trip-scoped API. V8 must finish separating account data
  from plan data without losing legacy state.
- Trip Document V2 requires an itinerary and packing structure. Event and blank
  plans need an optional module model.
- Current packing content is part of a shared trip document. Personal wardrobe
  and personal packing data must be private by default.
- Images, tickets, vouchers, receipts, and other files cannot be stored safely
  or economically inside D1 JSON.
- Existing read-only viewers cannot vote. Events and date polls need a
  participant role that can act on personal decisions without editing the plan.

## 3. Product architecture decisions

These decisions are the guardrails for every V8 workstream.

### 3.1 “Plan” becomes the product-level object

The customer-facing product uses **Plans**. A plan has one of three types:

- `trip`
- `event`
- `blank`

The existing physical D1 tables named `trips`, `trip_documents`,
`trip_members`, and `trip_mutations` remain in place during V8. Renaming
production tables and foreign keys provides little customer value and adds
migration risk. Add plan fields to those tables and expose a canonical
`/api/plans` contract. Keep `/api/trips` as a compatibility adapter until the
old client and migration tests are retired.

### 3.2 Plans are composed from modules

Every plan has an explicit module configuration. Modules are enabled by plan
type defaults and can be added or hidden later.

| Module | Trip default | Event default | Blank default |
| --- | ---: | ---: | ---: |
| Overview | Yes | Yes | Yes |
| Schedule | Yes | Yes | Optional |
| Explore | Yes | No | No |
| Bookings | Yes | Optional | Optional |
| Inspiration | Yes | Yes | Optional |
| Packing | Yes | Optional | Optional |
| Tasks | Yes | Yes | Optional |
| Money | Yes | Yes | Optional |
| People | Yes | Yes | Yes |
| Journal | Yes | Optional | Optional |

The blank-plan creation flow starts with only Overview and People, then lets the
owner choose modules. It must never populate sample AI content.

### 3.3 AI is a mode, not the application shell

Each plan stores:

- `off` — no AI surfaces or automatic generation;
- `assist` — manual-first with explicit “Help me” actions; or
- `guided` — the current trip-generation experience.

Blank plans default to `off`, event plans default to `off`, and trips default to
`guided` only when the creator chooses guided planning. Changing modes never
deletes manual content.

Generated content remains a reviewable proposal. Human edits are marked manual
and locked. AI receives only the bounded module context required for the
requested task. Finance rows, calendar event names, private wardrobe photos,
payment handles, ticket files, member emails, and other private data never
enter model prompts.

### 3.4 “Inspiration” replaces “Outfit inspiration”

The primary label is **Inspiration**. Its initial tabs are:

- **Outfits**
- **Vibe board**

“Visionary” is not used as the navigation label because it does not clearly
describe a saved-content workspace. A future Content Plan tab can be introduced
only after outfit and vibe-board behavior is complete.

### 3.5 Private account data and shared plan data stay separate

Account-owned data includes:

- wardrobe items and personal outfits;
- packing templates and “always pack” rules;
- private payment preferences;
- calendar connections;
- notification preferences; and
- the travel profile and Style DNA.

Plan-owned data includes:

- schedule and itinerary;
- bookings;
- shared inspiration pins;
- shared packing responsibilities;
- shared tasks;
- expense and settlement records;
- availability polls;
- membership and guests;
- journal entries; and
- plan files.

Personal packing selections belong to both an account and a plan. They are
visible only to their owner unless explicitly shared.

### 3.6 The release is incremental, not a rewrite

Keep Cloudflare Pages, Pages Functions, D1, the local Node server, and native
browser modules. Extract the existing client and server into modules while each
feature is changed. Do not pause V8 for a framework migration.

## 4. Cohesive information architecture

### 4.1 Global navigation

Signed-in global navigation becomes:

- **Plans**
- **Closet**
- **Templates**
- **Connections**
- **Profile**
- **Settings**

Plans is the default landing page. It shows upcoming, undated, completed, and
archived plans. Each card communicates plan type, date state, member count,
next action, and the most important unresolved item.

### 4.2 Plan navigation

Inside a plan:

- **Overview**
- **Schedule**
- **Explore** — trip-only home for Discover Now, Local Guide, and What to Expect
- **Bookings**
- **Inspiration**
- **Packing**
- **Tasks**
- **Money**
- **People**
- **Journal**

Only enabled modules appear. Module settings are available from the plan menu,
not mixed into customer content.

The mobile layout uses a compact plan switcher, a horizontally scrollable
module bar, and a persistent “Add” action whose menu changes by module. Desktop
retains Malem’s editorial rail and typography rather than introducing a
dashboard visual language unrelated to the existing site.

### 4.3 Overview is a decision surface

Overview is assembled from module data; it is not another editable document.
It shows:

- next scheduled item;
- next travel departure or event start;
- nearest check-in, check-out, ticket, payment, RSVP, or task deadline;
- booking completeness;
- packing progress;
- budget position;
- unresolved date poll;
- recent collaborator activity; and
- connection or sync failures requiring attention.

Every overview card links to its source module. The same fact is never edited in
two places.

## 5. Roles and capabilities

Replace label-based permission checks with server-owned capabilities.

| Capability | Owner | Planner | Participant | Viewer |
| --- | ---: | ---: | ---: | ---: |
| View enabled modules | Yes | Yes | Yes | Yes |
| Edit schedule/content | Yes | Yes | No | No |
| Manage modules and plan settings | Yes | No | No | No |
| Manage members and invitations | Yes | No | No | No |
| Vote, RSVP, and set own availability | Yes | Yes | Yes | No |
| Edit own packing list | Yes | Yes | Yes | No |
| Complete assigned tasks | Yes | Yes | Yes | No |
| Add an expense and edit own expense | Yes | Yes | Yes | No |
| Manage all expenses and settlements | Yes | Optional | No | No |
| View shared finances | Yes | Yes | Optional | Optional |
| Use AI on shared content | Yes | Yes | No | No |

Customer labels are:

- Owner
- Planner
- Participant
- Passenger princess (read only)

Existing `collaborator` memberships migrate to Planner. Existing `viewer`
memberships remain Passenger princess. The database can retain legacy role
values behind a capability mapper, but all new endpoints authorize capabilities
rather than comparing UI strings.

Event guests who only need to RSVP can use a scoped, expiring RSVP token without
becoming full plan members. A reusable public guest link requires owner approval
before the submission becomes trusted. Planning, calendar connections,
expenses, and personal packing require an account.

## 6. Feature specifications

### 6.1 Blank planning

#### Experience

The creation screen asks for:

- title;
- optional dates;
- optional timezone;
- who is involved; and
- modules to enable.

The resulting workspace is empty and immediately editable. It offers direct
actions such as Add task, Add date option, Add schedule item, Add note, and
Invite people. It does not show an AI chat prompt, generate placeholders, or
require a destination.

#### Required behavior

- Modules can be enabled, hidden, and reordered without destroying their data.
- A disabled module reports that it contains content before the owner hides it.
- Empty, loading, offline, read-only, and permission-denied states are designed
  for every module.
- A plan can be duplicated with choices for content, members, assignments, and
  dates.
- A blank plan can later become an event, but a trip conversion is offered only
  when a destination and dates can be mapped safely.

#### Acceptance gate

A user can create a blank group plan, invite a participant, vote on dates,
assign tasks, record expenses, and complete the plan without any AI request or
AI-specific empty state.

### 6.2 Party and event planning

#### Templates

The first templates are:

- birthday;
- dinner or gathering;
- graduation;
- bridal or baby shower;
- holiday event; and
- group outing.

Templates enable modules and seed editable categories, not fake plan content.

#### Event-specific behavior

- guest list with invited, viewed, RSVP yes/no/maybe, plus-one count, dietary
  notes, accessibility notes, and organizer notes;
- venue shortlist with source, address, price notes, capacity, and voting;
- shopping lists for food, drinks, decorations, supplies, and rentals;
- vendor records with contact, quote, deposit, balance, and deadline;
- task assignments and a day-of run of show;
- invitation status and reminder history;
- contribution and expense tracking; and
- post-event journal or shared memories.

Dietary and accessibility answers are visible only to owners/planners who need
them. They are never placed into public guest lists or AI prompts.

#### Acceptance gate

An owner can create an event from a template, collect RSVPs and availability,
select a venue, assign supplies and tasks, track vendor payments, and run the
event from the final schedule on mobile.

### 6.3 Closet and outfits

#### Wardrobe item

Each account-owned wardrobe item supports:

- name;
- one primary image and optional additional images;
- category and subcategory;
- color, material, pattern, season, warmth, and formality;
- activity and weather tags;
- modesty or coverage attributes;
- care notes;
- availability state;
- freeform notes; and
- created/updated timestamps.

All fields are manual and editable. Image analysis, if added later, is opt-in
and produces a suggestion the user must confirm.

#### Personal outfit

An outfit is a reusable grouping of wardrobe item IDs with a title, cover image,
tags, notes, and optional occasion. One garment can belong to many outfits.
Deleting an outfit never deletes its wardrobe items. Deleting a wardrobe item
shows affected outfits and packing selections before confirmation.

#### Privacy and files

Closet data is private. Collaborators see a wardrobe item only when the owner
explicitly shares it into a plan board or shared packing responsibility.
Uploaded images are private R2 objects. Strip location metadata, generate
bounded thumbnails, validate the decoded image type, and never accept SVG or
HTML as wardrobe media.

#### Acceptance gate

A user can add a photographed garment, reuse it in two outfits, add one outfit
to a trip, and remove it from the trip without duplicating or corrupting the
closet record.

### 6.4 Packing

Packing has two primary tabs:

- **Wardrobe**
- **Miscellaneous**

Each tab has list and visual views. Wardrobe visual view uses the customer’s
actual images where available, groups items by outfit or itinerary day, and
shows quantity and packed status without requiring the outfit generator.

#### Personal and shared packing

- Personal items are visible only to their owner.
- Shared items are visible to the group and may be assigned to a member.
- A participant can edit their own list and complete items assigned to them.
- Owners and planners can suggest an item to another traveler, but the traveler
  accepts it into their private list.

#### Detailed generation and manual rules

The deterministic packing engine expands its category coverage to include:

- underwear, socks, sleepwear, base layers, and explicit quantities;
- toiletries, menstrual care, skincare, oral care, and shaving;
- hair tools, hair products, heat protection, and voltage compatibility;
- prescriptions, medication timing, first aid, and emergency supplies;
- documents, insurance, backup copies, and emergency contacts;
- chargers, cables, power banks, batteries, and adapters;
- towels, swim gear, wet-item bags, and activity equipment;
- delayed-baggage personal-item essentials;
- family, baby, accessibility, medical, religious, and cultural needs;
- laundry, dirty-clothing, and repacking supplies; and
- departure and return-home tasks.

Quantities derive from duration, laundry cadence, weather, activity, and user
overrides. Every recommendation states why it exists. Unknown conditions remain
questions or neutral reminders rather than assumptions.

#### Reusable templates

Account-level templates support:

- named packing lists;
- “always add to every trip” items;
- conditional items based on trip attributes;
- personal default quantities; and
- import modes: merge, replace generated items, or add as a new section.

Template application is idempotent. Reapplying a template cannot silently
duplicate unchanged items.

#### Acceptance gate

For a seven-day trip, a user can apply a saved template, add closet outfits,
view their packed wardrobe as photos, track detailed miscellaneous quantities,
assign one shared item, work offline, and return without losing checked state.

### 6.5 Inspiration

#### Outfits tab

Preserve current itinerary-aware outfit discovery and feedback. Add:

- saved references that synchronize with the plan;
- links from an outfit board to itinerary days and wardrobe items;
- manual uploads and source links;
- collaborator reactions; and
- a clear distinction between a web reference and an owned closet item.

Device-local ranking signals remain device-local. Saved references and explicit
reactions become synchronized customer content.

#### Vibe board tab

Support image upload, safe remote-image saving, source URL, caption, tags,
section, color note, and links to a day, activity, venue, or destination.
Organizers can create sections such as Places, Food, Photos, Decor, Poses, or
Color palette. Reactions do not reorder the board automatically; sorting by
reactions is a user choice.

#### Acceptance gate

A group can save outfit and general-vibe references, attach them to schedule
items, react, reorder, and still distinguish inspiration from booked or owned
items.

### 6.6 Schedule, travel operations, and bookings

Schedule becomes the common timeline for trips, events, and blank plans.
Schedule item kinds expand to:

- activity;
- meal;
- transit;
- flight;
- train;
- stay;
- reservation;
- event;
- task milestone;
- free time; and
- note.

The existing itinerary day and place structures migrate without losing stable
IDs, directions, votes, or manual locks.

#### Booking record

A booking is a normalized plan record with:

- type;
- status: idea, shortlisted, needs-booking, booked, confirmed, completed, or
  cancelled;
- provider and official URL;
- confirmation number stored as private data;
- travelers or guests covered;
- start/end timestamps and timezone;
- location;
- cost and currency;
- cancellation deadline and policy note;
- check-in/check-out action and deadline;
- linked schedule item;
- linked files;
- source and checked date for externally researched facts; and
- owner/assignee.

#### Travel-specific details

- Flights: airline, flight number, airports, terminals, seats, baggage, booking
  reference, and check-in URL.
- Stays: address, contact, check-in/out, access instructions, guest count,
  deposit, fees, parking, breakfast, and policy.
- Ground transport: operator, station or pickup point, vehicle, confirmation,
  parking, and return deadline.
- Activities: official ticket source, reservation time, party size, price,
  cancellation, and arrival guidance.

Live flight status is not inferred from model knowledge. It requires an
approved flight-data provider and a separate feature flag. Until then, Malem
stores the traveler’s confirmed itinerary and links to the carrier.

#### Ticket and voucher wallet

Files are attached to booking records and also available in one Bookings view.
QR codes and PDFs are private, excluded from public caching, and served only
after membership authorization. Users can deliberately mark selected tickets
“available offline on this device”; logout clears that device cache.

#### Booking options

Unbooked items may show sourced options and official links. Malem does not claim
to complete a booking unless a supported provider returns a confirmed booking
record. Affiliate or marketplace links require explicit labeling and business
approval.

#### Acceptance gate

A traveler can open one screen and see flights, stay, check-in/out, unbooked
items, confirmed reservations, tickets, deadlines, and the next required
action. Every booking fact has one source of truth and appears contextually in
the schedule without duplicated editing.

### 6.7 Money

#### Money model

Store currency values as integer minor units plus ISO 4217 currency. Never use
binary floating-point values for persisted amounts.

Each expense has:

- plan;
- description and category;
- estimated, committed, or actual state;
- amount and original currency;
- optional normalized reporting amount, exchange rate, rate source, and date;
- payer;
- included members or guests;
- split method: equal, percentage, shares, or exact amounts;
- receipt asset;
- due date;
- visibility;
- creator and row revision; and
- settlement state.

Split validation must prove that allocated minor units equal the expense total.
Remainders from equal splits use a stable documented rule.

#### Experience

Money shows:

- estimated budget;
- booked/committed cost;
- paid actual cost;
- remaining forecast;
- category position;
- “you owe” and “you are owed”; and
- unsettled balances.

Personal expenses can remain private. Shared finance visibility is a separate
capability and is not automatically granted to every viewer.

#### Payment handoff

V8 tracks obligations and settlement evidence; it is not a bank.

The first release supports:

- copyable amount, memo, and recipient instructions;
- an official app or web handoff only where the provider documents one;
- manual “I paid” followed by recipient confirmation; and
- optional user-selected payment preference.

Do not advertise Venmo, Zelle, Cash App, or another service as “connected” until
an official integration supports Malem’s peer-settlement use case. Merchant
checkout APIs are not treated as a generic friend-to-friend expense API. Malem
never stores bank credentials.

#### Acceptance gate

Equal, percentage, share, and exact splits reconcile to the cent; multi-currency
expenses retain their original amount and rate date; permissions hide private
expenses; and a settlement cannot become final without an auditable confirmation.

### 6.8 Date polls and calendar

#### Availability poll

Owners/planners create date or time-range options with a timezone and voting
deadline. Members mark:

- preferred;
- available;
- maybe; or
- unavailable.

Malem ranks options transparently using hard conflicts first, then available
count, preference count, and organizer tie-break. It never silently chooses a
date. Locking an option updates the plan date only after confirmation and
preserves the poll history.

#### Google Calendar connection

Calendar connection is opt-in OAuth; it cannot happen automatically without
consent.

Use incremental permissions:

1. request the narrow free/busy scope for availability assistance;
2. request an event-write scope only when the user chooses calendar export;
3. show exactly which calendars will be checked or written; and
4. allow disconnect and token revocation from Connections.

Only busy intervals enter a poll calculation. Event titles, attendees, notes,
and locations are not stored for free/busy voting.

#### Calendar sync

- Each exported Malem item has one `external_event_link` row.
- Provider event IDs are never duplicated on retry.
- Updates use row versions and idempotency keys.
- A deleted provider event becomes a visible sync conflict; it does not
  automatically delete the Malem source item.
- The user chooses which modules sync: full schedule, bookings only, assigned
  tasks, or selected items.
- Timezone and daylight-saving transitions have explicit automated tests.

Google is the first provider. The adapter contract must permit Outlook and Apple
calendar export later without provider fields leaking into plan records.

#### Acceptance gate

Three members in different timezones can vote manually; one can add private
free/busy data without exposing event details; the owner can lock a date; and
selected plan items sync once to Google Calendar without duplicates.

### 6.9 Tasks, reminders, and files

Tasks are shared primitives used by all plan types. A task has assignees, due
time, status, module/source link, notes, visibility, and row revision.

Reminders are derived from tasks, bookings, packing rules, RSVP deadlines, and
plan dates. V8 launches with:

- in-app due/overdue state;
- calendar reminders for exported items; and
- a notification outbox ready for later email or push delivery.

Do not promise email, SMS, or push until a delivery provider, consent flow,
unsubscribe behavior, retry policy, and abuse limits are implemented.

Plan uploads use a private Cloudflare R2 bucket. D1 stores metadata and access
rules, not file bodies. Uploads use short-lived single-object authorization,
strict MIME and size limits, content sniffing, non-guessable object keys, and
server authorization on reads. Presigned URLs are treated as temporary bearer
tokens.

## 7. Data and persistence design

### 7.1 Plan Document V3

Plan Document V3 owns collaborative ordered content that needs generation,
manual locking, diff review, undo, and offline replay:

```ts
type PlanDocumentV3 = {
  documentVersion: 3;
  id: string;
  type: 'trip' | 'event' | 'blank';
  title: string;
  destination?: string;
  startAt?: string;
  endAt?: string;
  timezone: string;
  currency: string;
  aiMode: 'off' | 'assist' | 'guided';
  modules: Record<PlanModuleKey, {
    enabled: boolean;
    order: number;
  }>;
  schedule: {
    days: ScheduleDay[];
  };
  explore?: {
    discoverSessions: DiscoverSession[];
    whatToExpect: WhatToExpectDocument;
    localGuide: LocalGuideDocument;
  };
  inspiration: {
    boards: InspirationBoard[];
  };
  collaboration: {
    sharedConstraints: string[];
  };
  journal: JournalEntry[];
};
```

Packing moves out of the shared document because personal visibility, templates,
closet references, quantities, and per-person progress require row-level access.
Bookings, tasks, polls, expenses, guests, connections, and files are also
normalized.

### 7.2 Additive D1 migrations

Use separate reversible migrations. Update `schema.sql` as the rollup only after
each migration is tested.

#### Migration 0003 — plan foundation

Add to `trips`:

- `plan_type`
- `timezone`
- `currency`
- `ai_mode`
- `module_config_json`
- `completed_at`

Rebuild or supplement membership authorization to support Participant and
capabilities. Add:

- `plan_activity`
- `plan_tasks`
- `plan_task_assignees`
- `plan_guests`
- `plan_rsvp_invites`
- `plan_date_polls`
- `plan_date_options`
- `plan_date_votes`

#### Migration 0004 — assets, wardrobe, and packing

Add:

- `assets`
- `wardrobe_items`
- `wardrobe_item_assets`
- `outfits`
- `outfit_items`
- `packing_templates`
- `packing_template_items`
- `plan_packing_sections`
- `plan_packing_items`

Every personal packing row has `owner_user_id`; shared rows have explicit
visibility and optional assignee.

#### Migration 0005 — bookings and money

Add:

- `plan_bookings`
- `booking_assets`
- `plan_expenses`
- `expense_splits`
- `plan_settlements`
- `settlement_confirmations`

#### Migration 0006 — connections and sync

Add:

- `user_connections`
- `calendar_preferences`
- `external_event_links`
- `notification_rules`
- `notification_outbox`

OAuth refresh tokens are encrypted with a rotated server-owned key before D1
storage. Access tokens remain short-lived. Connection rows store scopes,
provider account identifier, expiry, revocation state, and last error, never
calendar event content.

### 7.3 Revisions, concurrency, and offline behavior

- Ordered generated documents continue using the global plan-document revision.
- Normalized entities use a row `revision`, `updated_at`, and unique
  `client_mutation_id`.
- Votes and RSVP choices use actor/entity uniqueness and upsert semantics.
- Expense plus split rows commit in one D1 batch transaction.
- All successful writes append a bounded privacy-safe activity record.
- The browser has one offline queue format for both document and entity
  mutations.
- Conflict responses return the current entity and enough information for a
  human review; the client never silently overwrites.

Move scalable local cache and offline queues from `localStorage` to IndexedDB.
Keep a one-time migration for existing trips and active-plan selection. Do not
put image blobs, PDFs, receipts, or OAuth data in localStorage.

### 7.4 V2 to V3 migration

Migration is lazy, idempotent, and backed up:

1. preserve the original V2 JSON;
2. map itinerary days/blocks to V3 schedule while retaining IDs, place data,
   booking evidence, votes, manual origin, and lock state;
3. map Discover, What to Expect, Local Guide, and journal into their V3 modules;
4. map current outfit boards into Inspiration → Outfits while keeping device
   ranking caches local;
5. convert existing packing sections/items into owner-private normalized
   packing rows;
6. set all existing records to plan type `trip`;
7. create default module configuration; and
8. mark migration complete only after the V3 document and normalized packing
   rows validate.

During the rollout window, V3 is authoritative. V2 reads are allowed only for
unmigrated plans. Never dual-write V2 and V3 after migration.

## 8. API design

Canonical endpoints:

```text
GET    /api/plans
POST   /api/plans
GET    /api/plans/:planId
PATCH  /api/plans/:planId
DELETE /api/plans/:planId
PATCH  /api/plans/:planId/document
GET    /api/plans/:planId/history
POST   /api/plans/:planId/undo

GET    /api/plans/:planId/members
POST   /api/plans/:planId/invites
PATCH  /api/plans/:planId/members/:memberId
DELETE /api/plans/:planId/members/:memberId

GET    /api/plans/:planId/tasks
POST   /api/plans/:planId/tasks
PATCH  /api/plans/:planId/tasks/:taskId

GET    /api/plans/:planId/polls
POST   /api/plans/:planId/polls
PUT    /api/plans/:planId/polls/:pollId/vote
POST   /api/plans/:planId/polls/:pollId/lock

GET    /api/plans/:planId/packing
POST   /api/plans/:planId/packing/items
PATCH  /api/plans/:planId/packing/items/:itemId
POST   /api/plans/:planId/packing/templates/:templateId/apply

GET    /api/plans/:planId/bookings
POST   /api/plans/:planId/bookings
PATCH  /api/plans/:planId/bookings/:bookingId

GET    /api/plans/:planId/expenses
POST   /api/plans/:planId/expenses
PATCH  /api/plans/:planId/expenses/:expenseId
POST   /api/plans/:planId/settlements
POST   /api/plans/:planId/settlements/:settlementId/confirm

POST   /api/assets/uploads
POST   /api/assets/:assetId/complete
GET    /api/assets/:assetId
DELETE /api/assets/:assetId

GET    /api/me/wardrobe
POST   /api/me/wardrobe
PATCH  /api/me/wardrobe/:itemId
GET    /api/me/outfits
POST   /api/me/outfits
GET    /api/me/packing-templates
POST   /api/me/packing-templates

GET    /api/me/connections
POST   /api/me/connections/google-calendar/start
GET    /api/oauth/google-calendar/callback
DELETE /api/me/connections/:connectionId
POST   /api/plans/:planId/calendar/sync
```

All list endpoints use bounded pagination. Every mutation validates content
length, role/capability, plan membership, row revision, idempotency key, and
rate limits server-side.

Keep `/api/trips` working through a thin adapter that invokes the same plan
services. No business rule may exist only in the compatibility route.

## 9. Code organization

### 9.1 Client

Turn `app.js` into a small entrypoint and extract native ES modules:

```text
client/
  core/
    api.mjs
    router.mjs
    session.mjs
    offline-store.mjs
    mutations.mjs
    dialogs.mjs
  features/
    plans.mjs
    overview.mjs
    schedule.mjs
    explore.mjs
    bookings.mjs
    inspiration.mjs
    closet.mjs
    packing.mjs
    tasks.mjs
    money.mjs
    people.mjs
    calendar.mjs
```

Feature modules own rendering and events for one domain. Core modules cannot
import feature modules. Features use shared accessible field, dialog, status,
empty-state, and card patterns rather than recreating controls.

Use dynamic imports for plan modules not shown on the current route. The V8
performance gate is that initial compressed JavaScript does not exceed the
current baseline and opening a plan remains interactive on a mid-range mobile
device under a throttled network.

### 9.2 Shared contracts and services

Create:

```text
lib/plan-contract.mjs
lib/packing-contract.mjs
lib/finance-contract.mjs
lib/calendar-contract.mjs
lib/permissions.mjs
lib/services/
  plan-service.mjs
  asset-service.mjs
  packing-service.mjs
  booking-service.mjs
  finance-service.mjs
  calendar-service.mjs
```

`trip-contract.mjs` remains a compatibility export during migration.
Cloudflare D1 and the local JSON service implement the same repository
interfaces. Contract tests run against both adapters so local development
cannot pass while production behavior differs.

### 9.3 Build and deployment

- Extend the explicit public allowlist to the new client and browser-safe shared
  modules.
- Keep server services, migrations, tests, and OAuth secrets out of `dist/`.
- Add a private R2 binding for uploads.
- Add a scheduled Worker or durable workflow only when real notification
  delivery is enabled.
- Put provider calls behind server adapters and feature flags.

## 10. External integration rules

### Google Calendar

- Use OAuth 2.0 with the narrowest scope for the requested action.
- Free/busy and event writing are separate consent moments.
- Complete Google verification requirements before public rollout.
- Store provider sync tokens and event IDs, not copied calendar contents.
- Implement disconnect, revocation, expiry refresh, and degraded-state UX.

### Files

- Use private R2 objects with bounded upload authorization.
- Treat signed URLs as bearer credentials and keep their lifetime short.
- Serve risky file types as downloads; do not accept executable HTML or SVG.
- Remove assets only after reference checks and a recoverable grace period.

### Payment services

- Build a provider-neutral settlement handoff.
- Enable a branded provider only after official documentation, legal review,
  and a tested sandbox prove the intended peer-payment flow is supported.
- Never scrape payment apps, automate a consumer login, or infer payment
  completion from opening a link.

### Travel providers

- Keep flight status, reservation imports, and booking transactions behind
  separate adapters and flags.
- Show source and check time for volatile facts.
- Keep manual entry fully functional when a provider is not selected.

## 11. Delivery sequence

The whole program should remain behind module-specific flags until each gate
passes. For one focused engineer, this is approximately 18–24 weeks. A small
team with one product/frontend engineer, one backend/integrations engineer, and
one quality/design partner can target 10–14 weeks after decisions and provider
accounts are ready.

### Phase 0 — contracts, IA, and visual target

- Finalize Plan V3, module names, role labels, responsive navigation, and empty
  states.
- Produce and approve visual targets for desktop and mobile before UI build.
- Add plan/feature flags and record the existing performance baseline.

**Gate:** every existing V7 destination has an explicit place in the new IA,
and no new module duplicates an existing edit surface.

### Phase 1 — plan foundation and modular client

- Add migration 0003.
- Add `/api/plans` and the compatibility adapter.
- Implement capabilities and Participant.
- Extract client core, plan shell, Overview, People, and shared editors.
- Migrate Trip Document V2 to Plan Document V3.

**Gate:** existing trips migrate with no visible loss; invitation, voting,
manual editing, regeneration, offline replay, and all V7 tests still pass.

### Phase 2 — blank plans, tasks, polls, and events

- Implement blank-plan creation and module settings.
- Add tasks, availability polls, participant actions, and event guest records.
- Add event templates, RSVP, venue shortlist, supplies, and run of show.

**Gate:** a complete no-AI blank-plan scenario and a complete event-planning
scenario pass on desktop and mobile.

### Phase 3 — assets, Closet, and personal outfits

- Bind private R2 and implement upload authorization/metadata.
- Add migration 0004.
- Build Closet and personal outfit CRUD, privacy, image processing, and deletion
  reference checks.
- Introduce IndexedDB cache and offline asset metadata.

**Gate:** upload abuse tests, privacy tests, image validation, two-outfit reuse,
offline metadata, and account deletion cleanup all pass.

### Phase 4 — packing

- Migrate existing packing to personal normalized rows.
- Build Wardrobe/Miscellaneous tabs, photo grid, quantities, personal/shared
  scope, assignments, templates, and always-pack rules.
- Expand deterministic category coverage and generation controls.

**Gate:** template idempotency, personal visibility, assignment permissions,
quantity logic, offline check state, and migration preservation all pass.

### Phase 5 — Inspiration

- Move current outfit experience under Inspiration.
- Add synchronized saved references and itinerary/closet links.
- Add vibe boards, uploads, sections, reactions, and ordering.

**Gate:** current outfit personalization tests pass; saved boards sync; private
closet items are never exposed without an explicit share.

### Phase 6 — schedule, bookings, and wallet

- Generalize itinerary to schedule while preserving travel presentation.
- Add migration 0005 booking tables.
- Build booking statuses, travel detail editors, file links, deadlines, and the
  Bookings command center.
- Add deliberate offline ticket access.

**Gate:** itinerary IDs/votes survive migration; booking data has one edit
surface; tickets remain authorized online and available offline only when
requested.

### Phase 7 — Money

- Implement integer-money contracts, expense splits, budgets, receipts,
  balances, and settlement confirmation.
- Add privacy/capability controls and provider-neutral payment handoff.

**Gate:** property-based split tests cover rounding and currencies; permission
tests cover every role; totals reconcile across edits, deletion, and offline
replay.

### Phase 8 — Google Calendar and reminders

- Add migration 0006.
- Implement OAuth, free/busy date assistance, selected event export, sync links,
  token encryption, disconnect, and sync conflict UX.
- Enable in-app and calendar reminders.

**Gate:** Google sandbox scenarios, narrow-scope consent, timezone/DST,
duplicate prevention, token rotation, revocation, provider failure, and privacy
tests all pass.

### Phase 9 — hardening and staged release

- Complete accessibility, browser, mobile, performance, security, migration,
  provider, and degraded-mode testing.
- Run internal migration, invited beta, small production cohort, then full
  rollout.
- Monitor errors, conflicts, failed uploads, sync failures, and migration
  outcomes.

**Gate:** no known data-loss, privilege-escalation, duplicate-charge,
private-file exposure, or silent-sync failure remains.

## 12. Test strategy

### Contract and unit tests

- Plan V3 normalization and V2 migration idempotency;
- module enable/disable preservation;
- every capability against every mutation;
- packing quantities, template merge, closet references, and visibility;
- integer-money arithmetic, split invariants, rates, and settlements;
- poll ranking and locking;
- booking status and date normalization;
- calendar timezone and recurrence mapping;
- asset type, size, ownership, and reference rules; and
- AI context redaction.

### API and persistence tests

- Local and Cloudflare adapter parity;
- D1 migration forward/rollback rehearsal;
- idempotent retries and stale row/document revisions;
- atomic expense/split, booking/file, and poll-lock writes;
- invitation, RSVP token, and Participant permissions;
- private packing and finance row filtering;
- encrypted connection token lifecycle;
- R2 authorization and orphan cleanup; and
- account/plan deletion cascades.

### Browser end-to-end tests

Add a CI-only browser test dependency; production remains framework-free.
Cover:

- new account → profile → guided trip;
- existing V7 account → migrated V8 trip;
- blank plan completed with AI off;
- event → invite → poll → RSVP → tasks → event day;
- closet → outfit → packing → visual packed view;
- flight/stay/ticket entry → reminder → offline ticket;
- expense → four split methods → settlement;
- Google connection → free/busy → lock date → event export;
- two simultaneous planners and one participant;
- viewer direct-write attempts;
- offline create/edit/reconnect conflicts; and
- logout/account deletion clearing private caches.

### UX and accessibility

- keyboard navigation and focus restoration for every dialog/menu;
- screen-reader names, errors, save status, tabs, progress, and reordering;
- color contrast, reduced motion, zoom to 200%, and touch targets;
- narrow mobile, tablet, desktop, and long translated-like strings;
- slow loading, empty, partial, stale, offline, conflict, and provider-denied
  states; and
- visual comparison against approved Malem targets rather than generic
  dashboard conventions.

### Security and privacy

- authorization on every file and normalized row;
- object-key guessing and expired signed URL tests;
- content-type spoofing and malicious file tests;
- OAuth state/PKCE, callback, token replay, revocation, and encryption tests;
- confirmation-number and payment-handle redaction in logs;
- no private data in analytics or model requests;
- rate limits for uploads, invitations, polls, AI, provider sync, and mutations;
  and
- CSP, Permissions-Policy, cookie, redirect, and custom-domain regression tests.

## 13. Observability and product quality

Record privacy-safe events for:

- plan creation type and AI mode;
- module enablement;
- migration success/failure;
- conflict and offline-replay outcome;
- invite/RSVP lifecycle;
- upload validation and orphan cleanup;
- booking completeness;
- packing template application;
- expense reconciliation failure;
- calendar consent, sync, and revocation state; and
- provider degradation.

Do not record wardrobe photos, filenames, plan titles, destinations, event
names, confirmation numbers, payment handles, expense descriptions, calendar
event content, or invite tokens.

Operational dashboards should answer:

- Are migrations losing or hiding content?
- Are permission denials expected or indicating a broken UI?
- Are duplicate/offline mutations resolving safely?
- Which provider is failing and does the manual fallback still work?
- Are users reaching a complete plan, booking set, packing list, or settled
  balance?

## 14. Release and rollback

- Use flags for `plan_v3`, `blank_plans`, `events`, `closet`, `packing_v2`,
  `inspiration_v2`, `bookings_v2`, `money`, and `google_calendar`.
- Apply additive migrations before enabling readers.
- Migrate internal accounts first and compare pre/post projections.
- Preserve V2 backups during the rollback window.
- Roll back by disabling modules and V3 writes, not deleting V3 data.
- Never downgrade a migrated plan by overwriting it with an older cached V2
  document.
- Expand cohorts only after error, conflict, privacy, and performance thresholds
  remain healthy.

## 15. Definition of done

V8 is complete only when:

1. every existing V7 feature has a deliberate home and continues to work;
2. Trip, Event, and Blank plans share one plan shell without forcing irrelevant
   modules;
3. a no-AI user can complete all manual planning flows;
4. roles and private/shared visibility are enforced by the server;
5. wardrobe photos, tickets, vouchers, and receipts are privately stored and
   safely accessible;
6. packing is detailed, reusable, visual, personal by default, and
   collaboration-aware;
7. schedule and bookings are one connected source of truth;
8. expense arithmetic reconciles exactly and payment completion is never
   inferred;
9. calendar access is consented, minimal, private, revocable, and duplicate-safe;
10. local and production implementations pass the same contracts;
11. migration, offline, conflict, degraded-provider, and rollback scenarios are
    proven;
12. all controls are functional—there are no placeholder CTAs or dead modules;
13. desktop and mobile accessibility gates pass; and
14. performance is no worse than the V7 baseline on the same test device and
    network profile.

## 16. Decisions required before implementation

Only these decisions should block execution:

1. approval of the Plan/Event/Blank product model and the **Inspiration** label;
2. whether Participant is the correct label for members who can vote and manage
   only their own contributions;
3. R2 storage budget, upload limits, and retention policy;
4. whether public event RSVPs may be submitted without an account;
5. which flight-status provider, if any, is approved;
6. whether finance is visible to all planners by default or only owners and
   explicitly granted finance managers;
7. Google Cloud project, OAuth consent, and verification ownership; and
8. whether the first reminder release remains in-app/calendar-only or includes
   an approved email provider.

All other behavior should proceed with the defaults in this plan.

## 17. Official implementation references

- Google Calendar API scopes:
  https://developers.google.com/workspace/calendar/api/auth
- Google Calendar free/busy:
  https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query
- Google Calendar event creation:
  https://developers.google.com/workspace/calendar/api/guides/create-events
- Cloudflare R2 presigned URLs:
  https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- Cloudflare R2 uploads:
  https://developers.cloudflare.com/r2/objects/upload-objects/
- Cloudflare D1 batch transactions:
  https://developers.cloudflare.com/d1/worker-api/d1-database/
- Cloudflare Workflows:
  https://developers.cloudflare.com/workflows/
- Cloudflare Queues retries and batching:
  https://developers.cloudflare.com/queues/configuration/batching-retries/
