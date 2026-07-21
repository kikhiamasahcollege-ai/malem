# malem — product vision

A travel companion that understands who you are, gives you several ways to
experience a destination, prepares you for the trip, and adapts your plans in
real time.

Guiding rule: every preference is an **editable control**, never an assumption
inferred from ethnicity, religion, or demographic.

---

## 1. Personal travel profile

An account gradually learns:

- Preferred travel vibes — relaxed, adventurous, romantic, luxury, local,
  family-friendly, spiritual, nightlife, nature, food-focused, and more
- Budget and preferred pace
- Dietary requirements (halal, kosher, vegan, allergies)
- Accessibility needs
- Religious and cultural considerations
- Modesty preferences for clothing and activities
- Medical equipment and medication reminders
- Children's ages, baby requirements, and family constraints
- Places, environments, or activities to avoid

Every field is user-controlled. Nothing is inferred from demographics.

## 2. "Choose your vibe" itineraries

Instead of one generic itinerary, present alternatives such as:

- Live Like a Local
- Iconic First Visit
- Relaxed and Scenic
- Hidden Gems
- Family Adventure
- Halal Food and Culture
- Luxury Without the Rush

The traveler picks one, combines two, or nudges a vibe slider. Weather,
operating hours, travel time, crowds, budget, and personal restrictions
determine the final schedule.

## 3. Intelligent packing and purchase planner

The packing list accounts for forecast, activities, dress codes, duration,
laundry, luggage limits, medication, mobility equipment, baby/child/parent
needs, religious clothing, chargers/adapters/documents, and local rules.

Recommendations are divided into:

- Pack from home
- Buy before leaving
- Better to purchase or rent there
- Carry in your personal bag
- Do not pack / legally restricted
- Complete before departure

Reminders escalate: two weeks before → three days before → night before →
immediately before departure.

## 4. "Discover Now"

Open the app and it considers current location, available time, weather and
daylight, opening hours, travel time and transportation, current energy level,
budget, dietary/accessibility requirements, party composition, and previously
visited places, then responds with instantly usable mini-itineraries.

Example:

> You have three hours, light rain starts at 6:00, and you're 12 minutes from
> a covered local market. Here are three plans: relaxed, food-focused, or
> cultural.

## 5. Local discovery

Balance famous attractions, neighborhood favorites, small businesses,
independent restaurants and shops, community markets, hidden places, seasonal
events, and locally created guides.

"Hidden gem" is judged by local sentiment, repeat visitors, quality relative to
review volume, and verified-resident recommendations — not just popularity.
Avoid directing excessive traffic to environmentally or culturally sensitive
locations.

## 6. "What to Expect"

Each destination or route includes practical preparation:

- Cultural etiquette and common behaviors
- Appropriate clothing
- Tipping and payment customs
- Prayer facilities and religious considerations
- Road conditions and driving behavior
- Public-transit expectations
- Tourist traps and common scams
- Safety considerations
- Accessibility realities
- Language phrases
- Business hours and local pacing
- Photography restrictions
- What may feel different from home

Every item is dated, sourced, and labeled by confidence. Cultural guidance
explains variation instead of presenting stereotypes as universal rules.

## 7. Collaboration and lived experience

Collaborators vote on vibes and activities, add restrictions, and receive
personalized packing lists while sharing one itinerary. Afterward, travelers
can publish:

- What they actually did
- What they would change
- Accessibility and dietary accuracy
- Whether a place matched expectations
- Advice for families or particular traveler needs
- Photos and outfit inspiration
- Public or private trip journals

---

## Delivery status

**Version 7 web app:** Profile, free-form trip creation, live or degraded
itinerary, full-outfit inspiration, packing, What to Expect, Discover Now,
local discovery, group voting, journals, real server accounts, synchronized
state, and public opt-in community entries are implemented. Cloudflare Pages
Functions and D1 provide the deployed backend.

**Future mobile app:** Port to React Native / Expo. The web UI is written
without framework lock-in specifically to make this port straightforward. The
data model in `docs/data-model.md` is the contract shared between platforms.
