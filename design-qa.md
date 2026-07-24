# Malem Planning Entry Choice — Design QA

Source visual truth: `/Users/masahkikhia/malem/GitHub/malem/audit-ia-before/02-original-home.png`

Implementation screenshot: `/Users/masahkikhia/malem/GitHub/malem/design-qa-ai-choice/06-planning-home-final.png`

Combined comparison: `/Users/masahkikhia/malem/GitHub/malem/design-qa-ai-choice/07-source-and-home-comparison.jpg`

Additional implementation evidence:

- Desktop trip mode choice: `/Users/masahkikhia/malem/GitHub/malem/design-qa-ai-choice/01-trip-mode-choice.png`
- Desktop AI intake: `/Users/masahkikhia/malem/GitHub/malem/design-qa-ai-choice/03-trip-ai-intake-final.png`
- Mobile mode choice: `/Users/masahkikhia/malem/GitHub/malem/design-qa-ai-choice/04-mode-choice-mobile.png`
- Mobile AI intake: `/Users/masahkikhia/malem/GitHub/malem/design-qa-ai-choice/05-ai-intake-mobile.png`
- Desktop no-AI studio: `/Users/masahkikhia/malem/GitHub/malem/design-qa-ai-choice/08-no-ai-studio-final.png`

## Comparison setup

- State: authenticated planning home with existing plans available.
- Source pixels: 1280 × 720 JPEG.
- Implementation pixels: 1280 × 720 JPEG.
- CSS viewport: 1280 × 720.
- Device scale factor: 1.
- Density normalization: none; both screenshots are 72-dpi and equal size.
- Full-view evidence: source and implementation were composed side by side and reviewed at native size.
- Responsive evidence: the mode choice and AI intake were separately reviewed at 390 × 844.

## Findings and iteration history

### Initial audit findings

- P1: “Blank” and “manual workspace” framed a planning method as a separate product, making the entry choice harder to understand.
- P1: The no-AI route required setup instead of immediately opening the tools the user selected.
- P1: AI felt like a separate destination rather than an optional way to create the first version of the same plan.
- P2: The initial AI intake exposed a visually hidden label, collapsing the intended composer layout.

### Fixes applied

- Replaced the third option with **Plan anything**, which describes the use case instead of the implementation mode.
- Made Trip, Event, and Plan anything use the same two-choice decision: **With AI** or **Without AI**.
- Made **Without AI** create and open an empty, fully enabled type-specific studio immediately.
- Made **With AI** open a focused, type-specific chat. The prompt can be as short as a destination; the generated draft opens in the same editable studio.
- Removed AI controls from plans created without AI.
- Preserved one plan library and one sidebar, so both creation methods produce the same plan object and navigation model.
- Scoped the screen-reader-only utility to the workspace and restored the intended full-width AI composer.

### Post-fix evidence

- The planning home retains the source's narrow rail, serif hierarchy, near-black/ivory/camel palette, hairline dividers, and restrained controls.
- The entry decision now describes two clear ways to begin without creating a second workspace concept.
- The no-AI path lands directly in a General planning studio with ten available modules and no Ask Malem control.
- The AI path uses a focused prompt and a single “Build my plan” action.
- Mobile body width and document scroll width both equal 390px in the choice and intake states.
- Browser warning/error log was empty.

## Primary interactions tested

- Open Plan a trip and confirm the With AI / Without AI choice.
- Open With AI and confirm the trip-specific “Where are you going?” chat.
- Open Plan anything and choose Without AI.
- Confirm the direct route creates an untitled plan and immediately opens the complete studio.
- Confirm no AI control is present in a plan created without AI.
- Confirm Workspace, People & availability, Tasks, Timeline, Money, Notes, Ideas, Bookings, Visionary, and Packing & closet are available.
- Generate a live AI plan from only “Tokyo, Japan”; confirm the editable trip, itinerary draft, starter booking, and 24-item packing list are created and survive reload.
- Create a no-AI event, task, three-option date poll, $1,000 budget, $125.50 expense, booking, ticket, wardrobe item with photo, linked packing item, auto-applied packing template, and uploaded Visionary pin.
- Reload and confirm the task, poll, booking, budget arithmetic, wardrobe/packing link, reusable list, uploaded visual, and no-AI state persist.
- Trigger the combined calendar export and confirm three calendar items are generated.
- Create, edit, and remove a run-of-show item; confirm an empty day remains intentional after item removal.
- Add, edit, and remove a guest with RSVP, dietary, accessibility, and payment-app details.
- Cast and persist an availability vote; create and copy a secure Participant invitation.
- Complete a task, add a shared journal note, and add/remove a venue idea.
- Rename and date a plan, opt into contextual AI, receive a live plan-aware response, then restore no-AI mode.
- Disable and restore a plan module; switch between active plans and preserve the selected plan.
- Create a sacrificial general plan and verify native confirmation plus durable deletion.
- Verify the choice and AI intake at 390 × 844 with no horizontal overflow.
- Verify the planning home and no-AI studio at 1280 × 720.
- Confirm browser console diagnostics are empty.
- Run the complete automated suite after the final implementation build.

## Severity review

- P0: none.
- P1: none.
- P2: none remaining.
- P3: the studio rail scrolls on short desktop viewports so module labels remain legible.

Final result: passed
