# malem

A travel companion that understands who you are, gives you several ways to
experience a destination, prepares you for the trip, and adapts your plans in
real time.

**Status:** Website prototype. Mobile app is next.

## What's here

- `index.html` / `styles.css` / `app.js` — dependency-free static site with
  two working features:
  - **Personal profile** — vibes, budget, pace, dietary, accessibility,
    religious & cultural, modesty, medical, family, and places to avoid.
    Nothing is inferred. Persisted to `localStorage`.
  - **Choose your vibe** — pick a primary vibe (or blend two) and generate
    an itinerary that respects everything on file in your profile.
- `docs/vision.md` — the full 7-feature product vision.
- `docs/data-model.md` — the framework-agnostic data shapes shared between
  the website today and the mobile app later.

## Run it

Open `index.html` in a browser. Or serve the folder:

```
python3 -m http.server 8000
# then visit http://localhost:8000
```

No build step, no dependencies.

## Design principles

- **Every preference is a control the user sets.** Never inferred from
  ethnicity, religion, or demographic.
- **Data shape is the contract.** The website and the future mobile app
  share the same objects (see `docs/data-model.md`) — only the persistence
  layer differs.
- **Website first, app next.** The JS is organized into `store`, `engine`,
  and `ui` modules so the profile logic and itinerary engine lift cleanly
  into a React Native / Expo project.

## Roadmap

See `docs/vision.md`. Current branch scope covers profile + vibe
itineraries. Discover Now, packing planner, What to Expect, local
discovery, group planning, and trip journals follow.
