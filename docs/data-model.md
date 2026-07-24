# Data model

Framework-agnostic shape of user data. Same object serves the website today
and the mobile app later — only the persistence layer changes (localStorage →
server API).

## `TravelProfile`

```ts
type TravelProfile = {
  version: number;              // schema version, bump on breaking change
  vibes: VibeKey[];             // multi-select, user-controlled
  budget: 'shoestring' | 'mid' | 'comfort' | 'luxury';
  pace:   'slow'       | 'balanced' | 'packed';
  wardrobePresentation: 'women' | 'men' | 'unisex';
  styleAgeBand: 'teen' | 'adult' | 'mature';
  styleDNA: {
    version: 1;
    completed: boolean;
    source: 'manual' | 'calibration' | 'pinterest-assisted';
    archetypes: Array<'minimal' | 'classic' | 'romantic' | 'vintage' | 'streetwear' | 'sporty' | 'bohemian' | 'avant-garde'>;
    silhouettes: Array<'relaxed' | 'tailored' | 'fitted' | 'oversized' | 'fluid' | 'structured'>;
    palettes: Array<'neutral' | 'earthy' | 'monochrome' | 'pastel' | 'jewel-tone' | 'bright'>;
    footwear: Array<'sneakers' | 'loafers' | 'flats' | 'boots' | 'sandals' | 'heels'>;
    materials: string[];
    patterns: string[];
    avoid: string[];
    closetStaples: string[];
    intensity: number;          // 0 understated → 100 statement
    practicality: number;       // 0 editorial → 100 highly practical
    experimentation: number;    // 0 most like me → 100 style stretch
    updatedAt: string | null;
  };
  dietary: {
    halal: boolean;
    kosher: boolean;
    vegan: boolean;
    vegetarian: boolean;
    glutenFree: boolean;
    allergies: string[];        // free text
    other: string;              // free text
  };
  accessibility: {
    stepFree: boolean;
    lowVision: boolean;
    lowHearing: boolean;
    seatingBreaks: boolean;
    notes: string;
  };
  religiousCultural: string;    // free text, user-authored only
  modesty: 'no-preference' | 'modest' | 'conservative';
  medical: {
    devices: string;
    medications: string;
    reminderCadence: 'none' | 'daily' | 'twice-daily';
  };
  family: {
    childrenAges: number[];
    babyOnBoard: boolean;
    notes: string;
  };
  avoid: string[];              // free-text tags: places, environments, activities
};

type VibeKey =
  | 'relaxed' | 'adventurous' | 'romantic' | 'luxury' | 'local'
  | 'family-friendly' | 'spiritual' | 'nightlife' | 'nature' | 'food-focused';
```

## `ItineraryRequest`

```ts
type ItineraryRequest = {
  destination: string;
  days: number;
  primaryVibe: TripVibe;
  secondaryVibe?: TripVibe;     // optional blend
  blendRatio?: number;          // 0..1 weight on secondary
  arrivalDate?: string;         // ISO
  travelers: number;
};

type TripVibe =
  | 'live-like-local' | 'iconic-first-visit' | 'relaxed-scenic'
  | 'hidden-gems' | 'family-adventure' | 'halal-food-culture'
  | 'luxury-without-rush';
```

## `Itinerary`

```ts
type Itinerary = {
  request: ItineraryRequest;
  respectedFromProfile: string[];  // human-readable list shown at top
  days: ItineraryDay[];
};

type ItineraryDay = {
  date?: string;
  theme: string;
  blocks: ItineraryBlock[];
};

type ItineraryBlock = {
  time: string;                 // e.g., "09:30"
  title: string;
  duration: string;             // e.g., "90 min"
  kind: 'meal' | 'sight' | 'activity' | 'rest' | 'transit' | 'shopping';
  notes?: string;
  respects?: string[];          // which profile fields this block honored
};
```

## Outfit personalization

The client derives an `OutfitMoment` from each day's named blocks instead of
reducing the whole day to one generic setting:

```ts
type OutfitMoment = {
  dayTheme: string;
  moments: Array<{
    id: string;
    period: 'morning' | 'afternoon' | 'evening' | 'day';
    label: string;
    requirements: string[];
  }>;
  requirements: string[];
  walkingLevel: 'light' | 'medium' | 'high';
  transitions: string[];
  weather: string;
};
```

Raw public-image candidates and Love/Save/More-like-this/reason-coded feedback remain
device-local. The confirmed `styleDNA` is a user-authored profile control and
therefore synchronizes with the rest of the travel profile.

## Version 7 synchronized state

The authenticated `GET/PUT /api/state` payload is:

```ts
type UserStateV1 = {
  version: 1;
  profile: TravelProfile | null;
  trips: Trip[];               // capped at 100
  activeTrip: string | null;
  group: GroupMember[];        // capped at 50
  journal: JournalEntry[];     // capped at 500
};
```

The browser keeps the same objects in `localStorage` as a fast cache, but the
server account is authoritative after login. Theme, model choices, optional
provider keys, usage traces, and local outfit-ranking signals remain
device-specific and are never included in `UserStateV1`.
