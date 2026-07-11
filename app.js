/* malem prototype.
 * No frameworks on purpose. Modules below are named the way a later
 * React Native port would organize them: `store`, `engine`, `ui`.
 */

// ---------- store ----------
const store = (() => {
  const KEY = 'malem.profile.v1';
  const empty = () => ({
    version: 1,
    vibes: [],
    budget: 'mid',
    pace: 'balanced',
    dietary: {
      halal: false, kosher: false, vegan: false, vegetarian: false,
      glutenFree: false, allergies: [], other: '',
    },
    accessibility: {
      stepFree: false, lowVision: false, lowHearing: false,
      seatingBreaks: false, notes: '',
    },
    religiousCultural: '',
    modesty: 'no-preference',
    medical: { devices: '', medications: '', reminderCadence: 'none' },
    family:  { childrenAges: [], babyOnBoard: false, notes: '' },
    avoid: [],
  });

  const load = () => {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return empty();
      const parsed = JSON.parse(raw);
      return { ...empty(), ...parsed };
    } catch { return empty(); }
  };
  const save = (p) => localStorage.setItem(KEY, JSON.stringify(p));
  const clear = () => localStorage.removeItem(KEY);

  return { load, save, clear, empty };
})();

// ---------- engine ----------
// Vibe catalog kept as data — same JSON later feeds the app.
const VIBES = [
  { key: 'live-like-local',    title: 'Live like a local',   sub: 'Neighborhood mornings, home-style meals, real coffee.' },
  { key: 'iconic-first-visit', title: 'Iconic first visit',  sub: 'The must-sees, but timed to dodge the crowds.' },
  { key: 'relaxed-scenic',     title: 'Relaxed & scenic',    sub: 'Longer stops, gentle days, views over ticking boxes.' },
  { key: 'hidden-gems',        title: 'Hidden gems',         sub: 'Places locals actually love — quality over hype.' },
  { key: 'family-adventure',   title: 'Family adventure',    sub: 'Kid-paced, nap-aware, story-worthy.' },
  { key: 'halal-food-culture', title: 'Halal food & culture',sub: 'Verified halal stops and cultural depth.' },
  { key: 'luxury-without-rush',title: 'Luxury without rush', sub: 'Comfort-first pacing, unhurried excellence.' },
];

const engine = (() => {
  // Small deterministic itinerary generator.
  // Enough to demonstrate that the profile is respected end-to-end.

  const vibeThemes = {
    'live-like-local':    ['Neighborhood morning', 'Everyday markets', 'Evening as locals do'],
    'iconic-first-visit': ['The essential first day', 'The other icons', 'One deep dive'],
    'relaxed-scenic':     ['Slow morning', 'Views & long lunches', 'A gentle evening'],
    'hidden-gems':        ['Off the tourist path', 'Craft & small makers', 'Neighborhood after dark'],
    'family-adventure':   ['Kid-paced discovery', 'Playful outdoors', 'Family-friendly evening'],
    'halal-food-culture': ['Halal breakfast & mosque tour', 'Bazaar & cultural site', 'Halal dinner & tea'],
    'luxury-without-rush':['Unhurried morning', 'Curated afternoon', 'Refined evening'],
  };

  const blockPools = {
    'live-like-local': [
      { time: '09:00', title: 'Coffee at a corner café',      duration: '45 min', kind: 'meal' },
      { time: '10:00', title: 'Walk a local neighborhood',    duration: '90 min', kind: 'activity' },
      { time: '12:30', title: 'Home-style lunch',             duration: '75 min', kind: 'meal' },
      { time: '15:00', title: 'Independent shop crawl',       duration: '90 min', kind: 'shopping' },
      { time: '19:00', title: 'Dinner where locals eat',      duration: '2 hr',   kind: 'meal' },
    ],
    'iconic-first-visit': [
      { time: '08:30', title: 'The signature landmark (early)', duration: '2 hr', kind: 'sight' },
      { time: '11:30', title: 'Historic quarter walk',         duration: '90 min', kind: 'activity' },
      { time: '13:30', title: 'Well-known lunch spot',         duration: '75 min', kind: 'meal' },
      { time: '15:30', title: 'Second essential sight',        duration: '2 hr',   kind: 'sight' },
      { time: '19:30', title: 'Classic dinner',                duration: '2 hr',   kind: 'meal' },
    ],
    'relaxed-scenic': [
      { time: '10:00', title: 'Late breakfast with a view',    duration: '90 min', kind: 'meal' },
      { time: '12:00', title: 'Waterfront stroll',             duration: '90 min', kind: 'activity' },
      { time: '14:00', title: 'Long, unhurried lunch',         duration: '2 hr',   kind: 'meal' },
      { time: '17:00', title: 'Sunset viewpoint',              duration: '75 min', kind: 'sight' },
      { time: '20:00', title: 'Quiet dinner',                  duration: '90 min', kind: 'meal' },
    ],
    'hidden-gems': [
      { time: '09:30', title: 'Local baker most tourists miss', duration: '45 min', kind: 'meal' },
      { time: '10:30', title: 'Under-the-radar museum',         duration: '90 min', kind: 'sight' },
      { time: '13:00', title: 'Neighborhood lunch counter',     duration: '60 min', kind: 'meal' },
      { time: '15:30', title: 'Independent gallery / craft',    duration: '90 min', kind: 'activity' },
      { time: '19:30', title: 'Locals-only dinner spot',        duration: '2 hr',   kind: 'meal' },
    ],
    'family-adventure': [
      { time: '09:00', title: 'Easy breakfast, kids welcome',   duration: '60 min', kind: 'meal' },
      { time: '10:30', title: 'Interactive attraction',         duration: '2 hr',   kind: 'activity' },
      { time: '12:30', title: 'Family-friendly lunch',          duration: '75 min', kind: 'meal' },
      { time: '14:00', title: 'Nap / rest window',              duration: '90 min', kind: 'rest' },
      { time: '16:30', title: 'Park or outdoor play',           duration: '90 min', kind: 'activity' },
      { time: '18:30', title: 'Early dinner',                   duration: '75 min', kind: 'meal' },
    ],
    'halal-food-culture': [
      { time: '08:30', title: 'Halal breakfast at a bakery',    duration: '60 min', kind: 'meal' },
      { time: '10:00', title: 'Guided mosque & quarter tour',   duration: '2 hr',   kind: 'sight' },
      { time: '13:00', title: 'Verified halal lunch',           duration: '75 min', kind: 'meal' },
      { time: '15:00', title: 'Bazaar / cultural site',         duration: '2 hr',   kind: 'activity' },
      { time: '19:30', title: 'Halal dinner and tea',           duration: '2 hr',   kind: 'meal' },
    ],
    'luxury-without-rush': [
      { time: '10:00', title: 'Unhurried breakfast',            duration: '90 min', kind: 'meal' },
      { time: '12:00', title: 'Private curated visit',          duration: '2 hr',   kind: 'sight' },
      { time: '14:30', title: 'Tasting-menu lunch',             duration: '2 hr',   kind: 'meal' },
      { time: '17:30', title: 'Spa or lounge',                  duration: '90 min', kind: 'rest' },
      { time: '20:30', title: 'Refined dinner',                 duration: '2.5 hr', kind: 'meal' },
    ],
  };

  // Turn profile into a list of respected constraints and adjustments.
  const respectedFromProfile = (p) => {
    const out = [];
    if (p.dietary.halal)      out.push('halal-only food stops');
    if (p.dietary.kosher)     out.push('kosher-only food stops');
    if (p.dietary.vegan)      out.push('vegan-friendly stops');
    if (p.dietary.vegetarian) out.push('vegetarian-friendly stops');
    if (p.dietary.glutenFree) out.push('gluten-free options');
    if ((p.dietary.allergies || []).length) out.push(`avoiding: ${p.dietary.allergies.join(', ')}`);
    if (p.dietary.other)      out.push(`diet note: ${p.dietary.other}`);
    if (p.accessibility.stepFree)      out.push('step-free routes');
    if (p.accessibility.lowVision)     out.push('low-vision considerations');
    if (p.accessibility.lowHearing)    out.push('low-hearing considerations');
    if (p.accessibility.seatingBreaks) out.push('frequent seating breaks');
    if (p.accessibility.notes)         out.push('accessibility notes on file');
    if (p.religiousCultural)  out.push('religious/cultural notes respected');
    if (p.modesty !== 'no-preference') out.push(`${p.modesty} clothing suggestions`);
    if (p.medical.reminderCadence !== 'none') out.push(`medication reminders (${p.medical.reminderCadence})`);
    if (p.family.babyOnBoard)          out.push('baby-friendly stops');
    if ((p.family.childrenAges || []).length) out.push(`kids: ages ${p.family.childrenAges.join(', ')}`);
    if ((p.avoid || []).length)        out.push(`avoiding: ${p.avoid.join(', ')}`);
    out.push(`budget: ${p.budget}`);
    out.push(`pace: ${p.pace}`);
    return out;
  };

  // Apply profile adjustments to a single block.
  const applyProfile = (block, p) => {
    const respects = [];
    let title = block.title;

    if (block.kind === 'meal') {
      if (p.dietary.halal)      { title = title.replace(/dinner|lunch|breakfast/i, m => `Halal ${m.toLowerCase()}`); respects.push('halal'); }
      else if (p.dietary.kosher){ title = title.replace(/dinner|lunch|breakfast/i, m => `Kosher ${m.toLowerCase()}`); respects.push('kosher'); }
      else if (p.dietary.vegan) { respects.push('vegan-friendly'); }
      else if (p.dietary.vegetarian) { respects.push('vegetarian-friendly'); }
      if (p.dietary.glutenFree) respects.push('gluten-free');
      if ((p.dietary.allergies || []).length) respects.push('allergy-safe');
    }

    if (p.accessibility.stepFree)      respects.push('step-free');
    if (p.accessibility.seatingBreaks && (block.kind === 'sight' || block.kind === 'activity'))
      respects.push('seating breaks noted');

    if (p.family.babyOnBoard && block.kind === 'rest') respects.push('baby nap window');
    if ((p.family.childrenAges || []).some(a => a <= 5) && block.kind === 'meal')
      respects.push('kid menu');

    if (p.medical.reminderCadence !== 'none' && block.kind === 'rest')
      respects.push('medication reminder here');

    if (p.modesty === 'conservative' || p.modesty === 'modest') {
      if (/night|club|nightlife/i.test(block.title)) respects.push('modesty note: skip suggested');
    }

    return { ...block, title, respects: respects.length ? respects : undefined };
  };

  // Pace shrinks/expands the day.
  const paceFilter = (blocks, pace) => {
    if (pace === 'slow')   return blocks.filter((_, i) => i % 2 === 0).slice(0, 3);
    if (pace === 'packed') return blocks;
    return blocks.filter((_, i) => i !== 3); // balanced = drop one mid-block
  };

  const build = (req, profile) => {
    const primary   = req.primaryVibe;
    const secondary = req.secondaryVibe;
    const blend     = Math.max(0, Math.min(1, req.blendRatio ?? 0));

    const respected = respectedFromProfile(profile);

    const days = [];
    for (let d = 0; d < req.days; d++) {
      // Pick a theme; blend by day if secondary set.
      const useSecondary = secondary && (blend > 0) && (d % 2 === 1) && blend >= 0.5
                         || secondary && blend > 0.75;
      const vibeForDay = useSecondary ? secondary : primary;
      const themes = vibeThemes[vibeForDay] || [`Day ${d + 1}`];
      const theme = themes[d % themes.length];

      let pool = blockPools[vibeForDay] || [];
      // Light blend: on odd days when secondary chosen, sprinkle one from primary.
      if (useSecondary) {
        const primPool = blockPools[primary] || [];
        pool = [...pool];
        if (primPool.length) pool.splice(2, 0, primPool[2 % primPool.length]);
      }

      const shaped = paceFilter(pool, profile.pace).map(b => applyProfile(b, profile));

      const isoDate = req.arrivalDate
        ? new Date(new Date(req.arrivalDate).getTime() + d * 86400000).toISOString().slice(0, 10)
        : undefined;

      days.push({ date: isoDate, theme, blocks: shaped });
    }

    return { request: req, respectedFromProfile: respected, days };
  };

  return { build };
})();

// ---------- ui ----------
const ui = (() => {
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const showTab = (name) => {
    $$('.tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
    $$('.panel').forEach(p => { p.hidden = p.dataset.panel !== name; });
    // Reset scroll into view for the newly active panel.
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const initTabs = () => {
    $$('.tab').forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));
    $$('[data-goto]').forEach(b => b.addEventListener('click', () => showTab(b.dataset.goto)));
  };

  // ----- Profile -----
  const parseList = (s) => (s || '').split(',').map(x => x.trim()).filter(Boolean);
  const parseIntList = (s) => parseList(s).map(n => Number(n)).filter(n => Number.isFinite(n) && n >= 0);

  const readProfile = () => {
    const f = $('#profile-form');
    const p = store.empty();
    p.vibes = $$('[data-chips="vibes"] input:checked').map(i => i.value);
    p.budget = f.budget.value;
    p.pace   = f.pace.value;

    p.dietary.halal      = $('[data-diet="halal"]').checked;
    p.dietary.kosher     = $('[data-diet="kosher"]').checked;
    p.dietary.vegan      = $('[data-diet="vegan"]').checked;
    p.dietary.vegetarian = $('[data-diet="vegetarian"]').checked;
    p.dietary.glutenFree = $('[data-diet="glutenFree"]').checked;
    p.dietary.allergies  = parseList(f.allergies.value);
    p.dietary.other      = f.dietOther.value.trim();

    p.accessibility.stepFree      = $('[data-access="stepFree"]').checked;
    p.accessibility.lowVision     = $('[data-access="lowVision"]').checked;
    p.accessibility.lowHearing    = $('[data-access="lowHearing"]').checked;
    p.accessibility.seatingBreaks = $('[data-access="seatingBreaks"]').checked;
    p.accessibility.notes         = f.accessNotes.value.trim();

    p.religiousCultural = f.religiousCultural.value.trim();
    p.modesty = ($('input[name="modesty"]:checked') || {}).value || 'no-preference';

    p.medical.devices         = f.medDevices.value.trim();
    p.medical.medications     = f.medMedications.value.trim();
    p.medical.reminderCadence = f.medCadence.value;

    p.family.childrenAges = parseIntList(f.childrenAges.value);
    p.family.babyOnBoard  = f.babyOnBoard.checked;
    p.family.notes        = f.familyNotes.value.trim();

    p.avoid = parseList(f.avoid.value);
    return p;
  };

  const writeProfile = (p) => {
    const f = $('#profile-form');
    $$('[data-chips="vibes"] input').forEach(i => { i.checked = p.vibes.includes(i.value); });
    f.budget.value = p.budget;
    f.pace.value   = p.pace;

    $('[data-diet="halal"]').checked      = !!p.dietary.halal;
    $('[data-diet="kosher"]').checked     = !!p.dietary.kosher;
    $('[data-diet="vegan"]').checked      = !!p.dietary.vegan;
    $('[data-diet="vegetarian"]').checked = !!p.dietary.vegetarian;
    $('[data-diet="glutenFree"]').checked = !!p.dietary.glutenFree;
    f.allergies.value = (p.dietary.allergies || []).join(', ');
    f.dietOther.value = p.dietary.other || '';

    $('[data-access="stepFree"]').checked      = !!p.accessibility.stepFree;
    $('[data-access="lowVision"]').checked     = !!p.accessibility.lowVision;
    $('[data-access="lowHearing"]').checked    = !!p.accessibility.lowHearing;
    $('[data-access="seatingBreaks"]').checked = !!p.accessibility.seatingBreaks;
    f.accessNotes.value = p.accessibility.notes || '';

    f.religiousCultural.value = p.religiousCultural || '';
    const mod = $(`input[name="modesty"][value="${p.modesty}"]`);
    if (mod) mod.checked = true;

    f.medDevices.value     = p.medical.devices || '';
    f.medMedications.value = p.medical.medications || '';
    f.medCadence.value     = p.medical.reminderCadence || 'none';

    f.childrenAges.value = (p.family.childrenAges || []).join(', ');
    f.babyOnBoard.checked = !!p.family.babyOnBoard;
    f.familyNotes.value = p.family.notes || '';

    f.avoid.value = (p.avoid || []).join(', ');
  };

  const initProfile = () => {
    writeProfile(store.load());

    $('#save-profile').addEventListener('click', () => {
      const p = readProfile();
      store.save(p);
      flash('#save-note', 'Saved. Your profile will apply on the vibes tab.');
    });
    $('#reset-profile').addEventListener('click', () => {
      if (!confirm('Clear your saved profile? This only affects this browser.')) return;
      store.clear();
      writeProfile(store.empty());
      flash('#save-note', 'Profile cleared.');
    });
  };

  const flash = (sel, msg) => {
    const el = $(sel);
    el.textContent = msg;
    clearTimeout(el._t);
    el._t = setTimeout(() => (el.textContent = ''), 4000);
  };

  // ----- Vibes -----
  const renderVibeGrid = (root, name) => {
    root.innerHTML = '';
    // Add a "none" tile only for the secondary grid.
    if (name === 'secondary') {
      const none = document.createElement('label');
      none.className = 'vibe-tile';
      none.dataset.value = '';
      none.dataset.selected = 'true';
      none.innerHTML = `<input type="radio" name="${name}" value="" checked />
                       <span class="title">No blend</span>
                       <span class="sub">Use only the primary vibe.</span>`;
      root.appendChild(none);
    }
    VIBES.forEach(v => {
      const label = document.createElement('label');
      label.className = 'vibe-tile';
      label.dataset.value = v.key;
      label.innerHTML = `
        <input type="radio" name="${name}" value="${v.key}" />
        <span class="title">${v.title}</span>
        <span class="sub">${v.sub}</span>`;
      root.appendChild(label);
    });
    root.addEventListener('change', () => {
      const val = (root.querySelector('input:checked') || {}).value || '';
      $$('.vibe-tile', root).forEach(t => {
        t.dataset.selected = String(t.dataset.value === val);
      });
      if (name === 'secondary') {
        $('#blend-slider-wrap').hidden = !val;
      }
    });
  };

  const initVibes = () => {
    renderVibeGrid($('[data-vibe-grid="primary"]'),   'primary');
    renderVibeGrid($('[data-vibe-grid="secondary"]'), 'secondary');
    // Preselect first primary so the "Build" button always has something.
    const first = $('[data-vibe-grid="primary"] input');
    if (first) { first.checked = true; first.dispatchEvent(new Event('change', { bubbles: true })); }

    const blend = $('input[name="blendRatio"]');
    blend.addEventListener('input', () => {
      const b = Number(blend.value);
      $('#blend-output').textContent = `${100 - b} / ${b}`;
    });

    $('#build-itinerary').addEventListener('click', () => {
      const f = $('#vibe-form');
      const primary = ($('input[name="primary"]:checked') || {}).value;
      const secondary = ($('input[name="secondary"]:checked') || {}).value || undefined;
      if (!f.destination.value.trim()) { flash('#build-note', 'Give it a destination.'); return; }
      if (!primary) { flash('#build-note', 'Pick a primary vibe.'); return; }

      const req = {
        destination: f.destination.value.trim(),
        days: Math.max(1, Math.min(21, Number(f.days.value) || 3)),
        travelers: Math.max(1, Number(f.travelers.value) || 1),
        arrivalDate: f.arrivalDate.value || undefined,
        primaryVibe: primary,
        secondaryVibe: secondary,
        blendRatio: secondary ? (Number(blend.value) / 100) : 0,
      };
      const itin = engine.build(req, store.load());
      renderItinerary(itin);
      flash('#build-note', 'Itinerary built.');
      $('#itinerary-output').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const renderItinerary = (itin) => {
    const root = $('#itinerary-output');
    root.hidden = false;
    const primary   = VIBES.find(v => v.key === itin.request.primaryVibe);
    const secondary = VIBES.find(v => v.key === itin.request.secondaryVibe);
    root.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'itin-header';
    header.innerHTML = `
      <h3>${escapeHtml(itin.request.destination)} — ${itin.request.days} day${itin.request.days > 1 ? 's' : ''}</h3>
      <p>
        <strong>${primary.title}</strong>${
          secondary ? ` blended with <strong>${secondary.title}</strong> (${Math.round((itin.request.blendRatio || 0) * 100)}% secondary)` : ''
        }, for ${itin.request.travelers} traveler${itin.request.travelers > 1 ? 's' : ''}.
      </p>
      <p class="hint">Your profile shaped this plan:</p>
      <ul class="itin-respect">
        ${itin.respectedFromProfile.map(r => `<li>${escapeHtml(r)}</li>`).join('')}
      </ul>`;
    root.appendChild(header);

    itin.days.forEach((day, i) => {
      const el = document.createElement('article');
      el.className = 'itin-day';
      el.innerHTML = `
        <header>
          <h4>Day ${i + 1}${day.date ? ` — ${day.date}` : ''}</h4>
          <span class="theme">${escapeHtml(day.theme)}</span>
        </header>
        ${day.blocks.map(b => `
          <div class="itin-block">
            <div class="when">${escapeHtml(b.time)}<br><small>${escapeHtml(b.duration)}</small></div>
            <div class="what">
              <strong>${escapeHtml(b.title)}</strong>
              <small>${escapeHtml(b.kind)}</small>
              ${b.respects ? `<div class="respects">${b.respects.map(r => `<span>${escapeHtml(r)}</span>`).join('')}</div>` : ''}
            </div>
          </div>`).join('')}
      `;
      root.appendChild(el);
    });
  };

  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));

  return { initTabs, initProfile, initVibes };
})();

// ---------- boot ----------
document.addEventListener('DOMContentLoaded', () => {
  ui.initTabs();
  ui.initProfile();
  ui.initVibes();
});
