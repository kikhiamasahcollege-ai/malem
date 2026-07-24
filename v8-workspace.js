const MalemV8 = (() => {
  const rootSelector = '#v8-workspace';
  const modules = [
    'overview', 'schedule', 'explore', 'bookings', 'inspiration',
    'packing', 'tasks', 'money', 'people', 'journal',
  ];
  const moduleLabels = {
    overview: 'Overview',
    schedule: 'Schedule',
    explore: 'Explore',
    bookings: 'Bookings',
    inspiration: 'Inspiration',
    packing: 'Packing',
    tasks: 'Tasks',
    money: 'Money',
    people: 'People',
    journal: 'Journal',
  };
  const studioConfig = {
    trip: {
      label: 'Trip studio',
      nav: [
        ['overview', 'Overview'],
        ['schedule', 'Itinerary'],
        ['explore', 'Explore'],
        ['bookings', 'Bookings & tickets'],
        ['inspiration', 'Visionary'],
        ['packing', 'Packing & closet'],
        ['people', 'Travelers & dates'],
        ['tasks', 'Tasks'],
        ['money', 'Money'],
        ['journal', 'Journal'],
      ],
    },
    event: {
      label: 'Event studio',
      nav: [
        ['overview', 'Overview'],
        ['schedule', 'Run of show'],
        ['people', 'Guests & dates'],
        ['tasks', 'Tasks'],
        ['bookings', 'Vendors & tickets'],
        ['inspiration', 'Visionary'],
        ['money', 'Money'],
        ['explore', 'Ideas & venue'],
        ['packing', 'Packing & closet'],
        ['journal', 'Notes'],
      ],
    },
    blank: {
      label: 'General planning studio',
      nav: [
        ['overview', 'Workspace'],
        ['people', 'People & availability'],
        ['tasks', 'Tasks'],
        ['schedule', 'Timeline'],
        ['money', 'Money'],
        ['journal', 'Notes'],
        ['explore', 'Ideas'],
        ['bookings', 'Bookings'],
        ['inspiration', 'Visionary'],
        ['packing', 'Packing & closet'],
      ],
    },
  };
  const state = {
    loaded: false,
    loading: false,
    plans: [],
    activePlanId: localStorage.getItem('malem.v8.activePlan') || '',
    view: 'overview',
    globalView: 'home',
    inspirationTab: 'outfits',
    packingArea: 'checklist',
    packingTab: 'wardrobe',
    aiOpen: false,
    aiSending: false,
    aiMessages: {},
    aiIntakeType: '',
    aiIntakeMessages: [],
    aiIntakeSending: false,
    status: '',
    shareUrl: '',
    me: null,
  };

  const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
  const id = (prefix) => `${prefix}-${crypto.randomUUID()}`;
  const nowIso = () => new Date().toISOString();
  const safeExternalUrl = (value) => {
    try {
      const url = new URL(String(value || ''));
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch { return ''; }
  };
  const safeImageUrl = (value) => {
    const source = String(value || '');
    return source.startsWith('data:image/') ? source : safeExternalUrl(source);
  };
  const active = () => state.plans.find((entry) => entry.plan.id === state.activePlanId) || state.plans[0] || null;
  const workspace = () => active()?.plan?.workspace || emptyWorkspace();
  const money = (value, currency = active()?.plan?.currency || 'USD') =>
    new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(value) || 0);
  const dateText = (value, options = {}) => {
    if (!value) return 'Not set';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString([], options);
  };
  const request = async (path, options = {}) => {
    const response = await fetch(`/api/${path}`, {
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', ...(options.headers || {}) },
      ...options,
      ...(options.body && typeof options.body !== 'string' ? { body: JSON.stringify(options.body) } : {}),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body.error || 'Malem could not save that change.');
      error.status = response.status;
      error.body = body;
      throw error;
    }
    return body;
  };

  const emptyWorkspace = () => ({
    tasks: [], people: [], datePolls: [], wardrobe: [], outfits: [],
    packingSections: [], packingItems: [], packingTemplates: [], bookings: [],
    ticketWallet: [], budgets: [], expenses: [], settlements: [], connections: [],
    calendarEvents: [], reminders: [], activity: [],
  });

  const defaultPacking = (plan) => {
    const start = new Date(plan.startAt || plan.arrivalDate || Date.now());
    const end = new Date(plan.endAt || start);
    const tripDays = plan.type === 'trip'
      ? Math.min(30, Math.max(1, Math.round((end - start) / 86_400_000) + 1 || Number(plan.days) || 4))
      : 1;
    const item = (name, section, category, quantity = 1, why = '') => ({
      id: id('pack'), name, section, category, quantity, packed: false, assignee: '',
      wardrobeItemId: '', why, createdAt: nowIso(),
    });
    return {
      packingSections: [
        { id: 'wardrobe', title: 'Wardrobe', kind: 'wardrobe' },
        { id: 'misc', title: 'Miscellaneous', kind: 'misc' },
      ],
      packingItems: [
        item('Everyday tops', 'wardrobe', 'clothing', Math.min(tripDays, 7), 'Layerable options for planned days'),
        item('Bottoms', 'wardrobe', 'clothing', Math.max(1, Math.ceil(tripDays / 3))),
        item('Underwear', 'wardrobe', 'clothing', tripDays + 1, 'One per day plus an emergency spare'),
        item('Pairs of socks', 'wardrobe', 'clothing', tripDays + 1),
        item('Sleepwear', 'wardrobe', 'clothing', Math.max(1, Math.ceil(tripDays / 4))),
        item('Comfortable walking shoes', 'wardrobe', 'shoes'),
        item('Weather layer or outerwear', 'wardrobe', 'clothing'),
        item('Event-specific outfit', 'wardrobe', 'clothing', 1, 'Review bookings and dress codes'),
        item('Government ID / passport', 'misc', 'documents'),
        item('Travel insurance and emergency contacts', 'misc', 'emergency'),
        item('Wallet, cards, and small emergency cash', 'misc', 'money'),
        item('Prescription medication', 'misc', 'health', 1, 'Pack enough for the trip plus a delay buffer'),
        item('First-aid basics', 'misc', 'health'),
        item('Toothbrush, toothpaste, and floss', 'misc', 'toiletries'),
        item('Deodorant and daily skincare', 'misc', 'toiletries'),
        item('Shampoo, conditioner, and body wash', 'misc', 'toiletries'),
        item('Personal care supplies', 'misc', 'toiletries'),
        item('Hair tools and heat-safe adapter', 'misc', 'toiletries'),
        item('Towel or quick-dry towel', 'misc', 'toiletries'),
        item('Phone charger and power bank', 'misc', 'electronics'),
        item('Plug adapter', 'misc', 'electronics'),
        item('Reusable water bottle', 'misc', 'daily'),
        item('Copies of tickets and confirmations', 'misc', 'documents'),
        item('Emergency change of clothes in carry-on', 'misc', 'emergency'),
      ],
    };
  };

  const withDefaults = (plan) => {
    const current = { ...emptyWorkspace(), ...(plan.workspace || {}) };
    if (plan.type === 'trip' && !current.packingSections.length && !current.packingItems.length) {
      Object.assign(current, defaultPacking(plan));
    }
    if (!current.people.some((person) => person.role === 'owner')) {
      current.people = [{
        id: id('person'),
        name: state.me?.name || 'Plan owner',
        email: state.me?.email || '',
        role: 'owner',
        rsvp: 'yes',
      }, ...current.people];
    }
    return current;
  };

  const load = async () => {
    if (state.loading) return;
    state.loading = true;
    try {
      const [me, result] = await Promise.all([request('me'), request('plans')]);
      state.me = me;
      state.plans = result.plans || [];
      if (!state.plans.some((entry) => entry.plan.id === state.activePlanId)) {
        state.activePlanId = state.plans[0]?.plan.id || '';
      }
      if (state.activePlanId) localStorage.setItem('malem.v8.activePlan', state.activePlanId);
      state.loaded = true;
      state.status = '';
      const entry = active();
      if (entry) {
        const needsPackingSeed = entry.plan.type === 'trip'
          && (!entry.plan.workspace?.packingSections?.length || !entry.plan.workspace?.packingItems?.length);
        const needsSeed = needsPackingSeed
          || !entry.plan.workspace?.people?.some((person) => person.role === 'owner');
        const seeded = withDefaults(entry.plan);
        if (needsSeed) {
          await saveWorkspace(seeded, 'Built a detailed starter packing list');
        }
      }
    } catch (error) {
      state.status = error.message;
    } finally {
      state.loading = false;
    }
  };

  const refreshActive = async () => {
    const entry = active();
    if (!entry) return;
    const fresh = await request(`plans/${encodeURIComponent(entry.plan.id)}`);
    const index = state.plans.findIndex((candidate) => candidate.plan.id === entry.plan.id);
    state.plans[index] = fresh;
  };

  const saveWorkspace = async (nextWorkspace, activitySummary = '') => {
    const entry = active();
    if (!entry) return;
    const next = {
      ...emptyWorkspace(),
      ...nextWorkspace,
      activity: activitySummary
        ? [{
          id: id('activity'),
          summary: activitySummary,
          actor: state.me?.name || 'You',
          createdAt: nowIso(),
        }, ...(nextWorkspace.activity || [])].slice(0, 2_000)
        : nextWorkspace.activity || [],
    };
    state.status = 'Saving…';
    renderStatus();
    try {
      const result = await request(`plans/${encodeURIComponent(entry.plan.id)}/document`, {
        method: 'PATCH',
        body: {
          baseRevision: entry.revision,
          clientMutationId: id('workspace'),
          operations: [{ type: 'workspace.replace', workspace: next }],
        },
      });
      const index = state.plans.findIndex((candidate) => candidate.plan.id === entry.plan.id);
      state.plans[index] = result;
      state.status = 'Saved';
      render();
    } catch (error) {
      if (error.status === 409) {
        await refreshActive();
        state.status = 'This plan changed elsewhere. The latest version is open.';
        render();
        return;
      }
      state.status = error.message;
      renderStatus();
      throw error;
    }
  };

  const updateCollection = async (name, transform, summary) => {
    const entry = active();
    if (!entry) return;
    const items = transform([...(workspace()[name] || [])]);
    state.status = 'Saving…';
    renderStatus();
    try {
      const result = await request(`plans/${encodeURIComponent(entry.plan.id)}/document`, {
        method: 'PATCH',
        body: {
          baseRevision: entry.revision,
          clientMutationId: id('collection'),
          operations: [
            { type: 'workspace.collection.replace', collection: name, items },
            ...(summary ? [{
              type: 'workspace.activity.add',
              activity: {
                id: id('activity'),
                summary,
                actor: state.me?.name || 'You',
                createdAt: nowIso(),
              },
            }] : []),
          ],
        },
      });
      state.plans[state.plans.findIndex((candidate) => candidate.plan.id === entry.plan.id)] = result;
      state.status = 'Saved';
      render();
    } catch (error) {
      if (error.status === 409) {
        await refreshActive();
        state.status = 'This plan changed elsewhere. The latest version is open.';
        render();
        return;
      }
      state.status = error.message;
      renderStatus();
      throw error;
    }
  };

  const globalKey = (name) => `malem.v8.${name}.${state.me?.email || 'guest'}`;
  const readGlobal = (name) => {
    let local = [];
    try { local = JSON.parse(localStorage.getItem(globalKey(name)) || '[]'); } catch {}
    return local;
  };
  const saveGlobal = (name, value) => localStorage.setItem(globalKey(name), JSON.stringify(value));

  const renderStatus = () => {
    const node = document.querySelector('#v8-status');
    if (node) node.textContent = state.status;
  };
  const resetScroll = () => requestAnimationFrame(() =>
    window.scrollTo({ top: 0, behavior: 'instant' }));

  const planStudio = (plan) => studioConfig[plan?.type] || studioConfig.trip;
  const enabledModules = (plan) => planStudio(plan).nav
    .filter(([name]) => plan.modules?.[name]?.enabled !== false);
  const activeModuleLabel = (plan, module) =>
    planStudio(plan).nav.find(([name]) => name === module)?.[1] || moduleLabels[module] || module;

  const aiPrompts = (plan) => {
    const view = activeModuleLabel(plan, state.view).toLowerCase();
    if (plan.type === 'event') return [
      `Find the gaps in my ${view}`,
      'Help me prioritize the next three decisions',
      'Turn this plan into a realistic checklist',
    ];
    return [
      `Find the gaps in my ${view}`,
      'Help me plan the next best step',
      'Check this plan for anything easy to forget',
    ];
  };

  const aiDock = (plan) => {
    if (!plan || plan.aiMode === 'off') return '';
    const messages = state.aiMessages[plan.id] || [];
    const enabled = plan.aiMode !== 'off';
    return `
      <button type="button" class="v8-ai-launch" data-action="toggle-ai" aria-expanded="${state.aiOpen}">
        <span class="v8-ai-dot" aria-hidden="true"></span>
        Ask Malem
        <span aria-hidden="true">${state.aiOpen ? '×' : '↗'}</span>
      </button>
      <aside class="v8-ai-dock" aria-label="Ask Malem" ${state.aiOpen ? '' : 'hidden'}>
        <div class="v8-ai-head">
          <div><span class="v8-card-label">Inside this ${escapeHtml(planStudio(plan).label.toLowerCase())}</span><h2>Ask Malem</h2></div>
          <button type="button" class="v8-button v8-button-small" data-action="toggle-ai">Close</button>
        </div>
        ${enabled ? `
          <p class="v8-muted">Malem can see this plan’s structure and the section you are working in. It will not change anything unless you choose to.</p>
          <div class="v8-ai-prompts">${aiPrompts(plan).map((prompt) => `<button type="button" data-ai-prompt="${escapeHtml(prompt)}">${escapeHtml(prompt)}</button>`).join('')}</div>
          <div class="v8-ai-thread" aria-live="polite">
            ${messages.map((message) => `<div class="v8-ai-message" data-role="${escapeHtml(message.role)}"><span>${message.role === 'assistant' ? 'Malem' : 'You'}</span><p>${escapeHtml(message.content)}</p></div>`).join('')
              || '<p class="v8-empty-note">Ask a question here without leaving your plan.</p>'}
          </div>
          <label class="v8-ai-compose">
            <span class="sr-only">Ask Malem about this plan</span>
            <textarea id="v8-ai-input" placeholder="Ask about this plan or the section you’re in…"></textarea>
            <button type="button" class="v8-button v8-button-primary" data-action="ask-ai"${state.aiSending ? ' disabled' : ''}>${state.aiSending ? 'Thinking…' : 'Ask'}</button>
          </label>
        ` : `
          <div class="v8-ai-off">
            <p>This plan is manual right now. Turn on “AI only when asked” to use Malem here without giving up control of the plan.</p>
            <button type="button" class="v8-button v8-button-primary" data-action="enable-ai">Turn on Ask Malem</button>
          </div>
        `}
      </aside>`;
  };

  const shell = (body) => {
    const entry = active();
    const plan = entry?.plan;
    const planOptions = state.plans.map((item) =>
      `<option value="${escapeHtml(item.plan.id)}"${item.plan.id === plan?.id ? ' selected' : ''}>${escapeHtml(item.plan.title)}</option>`).join('');
    const nav = plan ? enabledModules(plan).map(([name, label]) =>
      `<button type="button" class="v8-nav-button" data-view="${name}" aria-current="${!state.globalView && state.view === name ? 'page' : 'false'}">${escapeHtml(label)}</button>`).join('') : '';
    return `
      <div class="v8-shell">
        <aside class="v8-rail">
          <button type="button" class="v8-brand" data-global-view="home"><span aria-hidden="true">•</span> malem</button>
          <nav class="v8-global-nav">
            <button type="button" class="v8-nav-button" data-global-view="home" aria-current="${state.globalView === 'home' ? 'page' : 'false'}">Home</button>
            <button type="button" class="v8-nav-button" data-global-view="plans" aria-current="${state.globalView === 'plans' ? 'page' : 'false'}">All plans</button>
            <button type="button" class="v8-nav-button v8-nav-new" data-action="new-plan"><span aria-hidden="true">＋</span> New plan</button>
          </nav>
          ${plan && !state.globalView ? `
            <div class="v8-plan-context">
              <span class="v8-rail-label">${escapeHtml(planStudio(plan).label)}</span>
              <select class="v8-plan-select" id="v8-plan-select" aria-label="Active plan">
                ${planOptions}
              </select>
              <span class="v8-plan-meta">${escapeHtml(plan.type === 'blank' ? 'general' : plan.type)} · ${escapeHtml(entry.role)} · ${escapeHtml(plan.aiMode === 'off' ? 'without AI' : 'with AI')}</span>
            </div>
            <nav class="v8-module-nav" aria-label="${escapeHtml(planStudio(plan).label)}">${nav}</nav>
          ` : ''}
          <div class="v8-rail-spacer"></div>
          <nav class="v8-account-nav" aria-label="Account">
            <button type="button" class="v8-nav-button" data-global-view="profile" aria-current="${state.globalView === 'profile' ? 'page' : 'false'}">
              <span>${escapeHtml(state.me?.name || 'Profile')}</span>
              <small>Profile & connections</small>
            </button>
            <button type="button" class="v8-nav-button v8-signout" data-action="sign-out">Sign out</button>
          </nav>
        </aside>
        <div class="v8-main">
          <div class="v8-content">${body}<div class="v8-status" id="v8-status">${escapeHtml(state.status)}</div></div>
          ${aiDock(!state.globalView ? plan : null)}
        </div>
      </div>`;
  };

  const heading = (kicker, title, description, actions = '') => `
    <header class="v8-heading">
      <div><span class="v8-kicker">${escapeHtml(kicker)}</span><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div>
      ${actions ? `<div class="v8-actions">${actions}</div>` : ''}
    </header>`;

  const emptyNote = (text) => `<p class="v8-empty-note">${escapeHtml(text)}</p>`;
  const progress = (done, total) =>
    `<div class="v8-progress" aria-label="${done} of ${total} complete"><span style="width:${total ? Math.round(done / total * 100) : 0}%"></span></div>`;

  const overview = () => {
    const entry = active();
    const plan = entry.plan;
    const ws = workspace();
    const scheduleItems = (plan.schedule?.days || []).flatMap((day) =>
      (day.blocks || []).map((block) => ({ ...block, date: day.date, theme: day.theme })));
    const packed = ws.packingItems.filter((item) => item.packed).length;
    const totalBudget = ws.budgets.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const spent = ws.expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const nextBooking = ws.bookings.slice().sort((a, b) =>
      String(a.startAt || '').localeCompare(String(b.startAt || '')))[0];
    const nextReminder = ws.reminders.filter((item) => !item.done).slice().sort((a, b) =>
      String(a.dueAt || '').localeCompare(String(b.dueAt || '')))[0];
    const openTasks = ws.tasks.filter((item) => item.status !== 'done');
    const nextPoll = ws.datePolls.find((item) => item.status !== 'closed');
    const eventGuestCount = plan.event?.guestCount || ws.people.filter((person) => person.role !== 'owner').length;
    const sideCards = plan.type === 'event'
      ? `
        <article class="v8-card v8-card-wide"><span class="v8-card-label">Guests</span><div class="v8-stat">${eventGuestCount}</div><p class="v8-muted">${ws.people.filter((person) => person.role !== 'owner' && person.rsvp === 'yes').length} confirmed in the guest list.</p></article>
        <article class="v8-card v8-card-wide"><span class="v8-card-label">Vendors & bookings</span><h3>${escapeHtml(nextBooking?.title || 'Nothing confirmed yet')}</h3><p class="v8-muted">${nextBooking ? `${nextBooking.type} · ${dateText(nextBooking.startAt)}` : 'Venue, vendors, reservations, and tickets stay together.'}</p></article>
        <article class="v8-card v8-card-wide"><span class="v8-card-label">Money</span><div class="v8-stat">${money(spent)}</div><p class="v8-muted">${totalBudget ? `${money(totalBudget - spent)} remaining of ${money(totalBudget)}` : 'Add an event budget to see what remains.'}</p></article>
        <article class="v8-card v8-card-wide"><span class="v8-card-label">Next decision</span><h3>${escapeHtml(openTasks[0]?.title || nextReminder?.title || 'The plan is clear for now')}</h3><p class="v8-muted">${openTasks[0]?.dueAt ? `Due ${dateText(openTasks[0].dueAt)}` : nextReminder ? dateText(nextReminder.dueAt) : 'New tasks and reminders will surface here.'}</p></article>`
      : plan.type === 'blank'
        ? `
          <article class="v8-card v8-card-wide"><span class="v8-card-label">People</span><div class="v8-stat">${ws.people.length}</div><p class="v8-muted">Everyone, roles, and availability stay in this workspace.</p></article>
          <article class="v8-card v8-card-wide"><span class="v8-card-label">Open tasks</span><div class="v8-stat">${openTasks.length}</div><p class="v8-muted">${escapeHtml(openTasks[0]?.title || 'No next task assigned yet.')}</p></article>
          <article class="v8-card v8-card-wide"><span class="v8-card-label">Date poll</span><h3>${escapeHtml(nextPoll?.title || 'No date poll yet')}</h3><p class="v8-muted">${nextPoll ? `${nextPoll.options?.length || 0} options open for voting.` : 'Invite people and find the date that works.'}</p></article>
          <article class="v8-card v8-card-wide"><span class="v8-card-label">Latest note</span><h3>${escapeHtml(ws.activity[0]?.summary || 'A clean shared space')}</h3><p class="v8-muted">${escapeHtml(ws.activity[0]?.notes || 'Add, organize, and shape this plan however you need.')}</p></article>`
        : `
          <article class="v8-card v8-card-wide"><span class="v8-card-label">Bookings</span><h3>${escapeHtml(nextBooking?.title || 'Nothing booked yet')}</h3><p class="v8-muted">${nextBooking ? `${nextBooking.type} · ${dateText(nextBooking.startAt)}` : 'Flights, stays, reservations, and tickets live together.'}</p></article>
          <article class="v8-card v8-card-wide"><div class="v8-card-head"><span class="v8-card-label">Packing & closet</span><strong>${packed}/${ws.packingItems.length}</strong></div>${progress(packed, ws.packingItems.length)}<p class="v8-muted">Wardrobe, exact closet pieces, and miscellaneous items stay together.</p></article>
          <article class="v8-card v8-card-wide"><span class="v8-card-label">Money</span><div class="v8-stat">${money(spent)}</div><p class="v8-muted">${totalBudget ? `${money(totalBudget - spent)} remaining of ${money(totalBudget)}` : 'Add a budget to see what remains.'}</p></article>
          <article class="v8-card v8-card-wide"><span class="v8-card-label">Reminder</span><h3>${escapeHtml(nextReminder?.title || 'No upcoming reminder')}</h3><p class="v8-muted">${nextReminder ? dateText(nextReminder.dueAt) : 'Check-in, check-out, payment, and ticket reminders appear here.'}</p></article>`;
    return `${heading(
      plan.type === 'event' ? 'Event dossier' : plan.type === 'blank' ? 'General plan' : 'Travel dossier',
      plan.title,
      plan.destination ? `${plan.destination} · ${dateText(plan.startAt, { dateStyle: 'medium' })}` : 'A flexible space with every planning tool ready when you need it.',
      '<button type="button" class="v8-button" data-action="edit-plan">Plan settings</button>',
    )}
      <div class="v8-dossier">
        <section class="v8-timeline">
          <div class="v8-card-head"><div><span class="v8-card-label">Timeline</span><h2>What happens next</h2></div><button type="button" class="v8-button v8-button-small" data-view="schedule">Open schedule</button></div>
          <ul class="v8-list">
            ${scheduleItems.slice(0, 8).map((item) => `<li class="v8-list-item"><div class="v8-item-main"><strong>${escapeHtml(item.title)}</strong><span class="v8-pill">${escapeHtml(item.time || item.date || 'Any time')}</span></div><p>${escapeHtml(item.theme || item.notes || '')}</p></li>`).join('')
              || emptyNote('No schedule items yet. Add an intentional first moment.')}
          </ul>
        </section>
        <aside class="v8-side-dossier">${sideCards}</aside>
      </div>`;
  };

  const schedule = () => {
    const plan = active().plan;
    const days = plan.schedule?.days || [];
    const title = plan.type === 'trip' ? 'Itinerary' : plan.type === 'event' ? 'Run of show' : 'Timeline';
    const description = plan.type === 'trip'
      ? 'A day-by-day plan for travel, stays, activities, reservations, and the breathing room between them.'
      : plan.type === 'event'
        ? 'Build the event sequence from setup and guest arrival through the final handoff and cleanup.'
        : 'Put shared commitments and milestones in an order everyone can understand.';
    return `${heading('Plan the sequence', title, description,
      '<button type="button" class="v8-button v8-button-primary" data-action="add-schedule">Add schedule item</button>')}
      <div class="v8-grid">
        ${days.map((day, dayIndex) => `<article class="v8-card v8-card-wide">
          <div class="v8-card-head"><div><span class="v8-card-label">${escapeHtml(day.date || `Day ${dayIndex + 1}`)}</span><h2>${escapeHtml(day.theme || `Day ${dayIndex + 1}`)}</h2></div></div>
          <ul class="v8-list">${(day.blocks || []).map((block) => `<li class="v8-list-item">
            <div class="v8-item-main"><div><strong>${escapeHtml(block.title)}</strong><p>${escapeHtml(block.notes || block.duration || '')}</p></div><span class="v8-pill">${escapeHtml(block.time || 'Any time')}</span></div>
            <div class="v8-actions"><button class="v8-button v8-button-small" data-action="edit-schedule" data-day-id="${escapeHtml(day.id)}" data-item-id="${escapeHtml(block.id)}">Edit</button><button class="v8-button v8-button-small v8-button-danger" data-action="remove-schedule" data-day-id="${escapeHtml(day.id)}" data-item-id="${escapeHtml(block.id)}">Remove</button></div>
          </li>`).join('') || emptyNote('This day is open.')}</ul>
        </article>`).join('') || `<article class="v8-card v8-card-wide">${emptyNote('No days exist yet. Add the first schedule item and Malem will create a day.')}</article>`}
      </div>`;
  };

  const explore = () => `${heading('Research with context', 'Explore', 'Keep real options, source links, local expectations, and decisions beside the plan.',
    '<button type="button" class="v8-button v8-button-primary" data-action="add-explore">Save a place or idea</button>')}
    <div class="v8-grid">
      ${(workspace().calendarEvents || []).filter((item) => item.kind === 'explore').map((item) => `<article class="v8-card v8-card-third">
        <span class="v8-card-label">${escapeHtml(item.category || 'Saved idea')}</span><h2>${escapeHtml(item.title)}</h2><p class="v8-muted">${escapeHtml(item.notes || '')}</p>
        <div class="v8-actions">${safeExternalUrl(item.url) ? `<a class="v8-button v8-button-small" href="${escapeHtml(safeExternalUrl(item.url))}" target="_blank" rel="noopener">Open source</a>` : ''}<button class="v8-button v8-button-small v8-button-danger" data-action="remove-explore" data-id="${escapeHtml(item.id)}">Remove</button></div>
      </article>`).join('') || `<article class="v8-card v8-card-wide">${emptyNote('Save restaurants, venues, neighborhoods, post ideas, or anything worth comparing.')}</article>`}
    </div>`;

  const bookings = () => {
    const ws = workspace();
    const ordered = ws.bookings.slice().sort((a, b) => String(a.startAt).localeCompare(String(b.startAt)));
    return `${heading('Everything confirmed', 'Bookings & ticket wallet', 'Flight details, hotel information, check-in reminders, vouchers, and tickets stay in one operational record.',
      '<button type="button" class="v8-button v8-button-primary" data-action="add-booking">Add booking</button><button type="button" class="v8-button" data-action="add-ticket">Add ticket or voucher</button>')}
      <div class="v8-grid">
        ${ordered.map((item) => `<article class="v8-card">
          <div class="v8-card-head"><span class="v8-pill">${escapeHtml(item.type || 'booking')}</span><span class="v8-card-label">${escapeHtml(item.status || 'confirmed')}</span></div>
          <h2>${escapeHtml(item.title)}</h2><p class="v8-muted">${escapeHtml(item.provider || '')}${item.confirmation ? ` · Confirmation ${escapeHtml(item.confirmation)}` : ''}</p>
          <ul class="v8-list"><li class="v8-list-item"><strong>${dateText(item.startAt)}</strong><p>${escapeHtml(item.location || '')}</p></li>${item.endAt ? `<li class="v8-list-item"><strong>Ends ${dateText(item.endAt)}</strong></li>` : ''}</ul>
          <div class="v8-actions">${safeExternalUrl(item.url) ? `<a class="v8-button v8-button-small" href="${escapeHtml(safeExternalUrl(item.url))}" target="_blank" rel="noopener">Manage booking</a>` : ''}<button class="v8-button v8-button-small" data-action="edit-booking" data-id="${escapeHtml(item.id)}">Edit</button><button class="v8-button v8-button-small v8-button-danger" data-action="remove-booking" data-id="${escapeHtml(item.id)}">Remove</button></div>
        </article>`).join('') || `<article class="v8-card v8-card-wide">${emptyNote('Not booked yet? Add a flight, stay, venue, restaurant, or transport option and mark its status as “considering.”')}</article>`}
        <article class="v8-card v8-card-wide"><div class="v8-card-head"><div><span class="v8-card-label">Wallet</span><h2>Tickets & vouchers</h2></div></div>
          <ul class="v8-list">${ws.ticketWallet.map((item) => `<li class="v8-list-item"><div class="v8-item-main"><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.reference || item.notes || '')}</p></div><div class="v8-actions">${item.dataUrl ? `<a class="v8-button v8-button-small" href="${item.dataUrl}" download="${escapeHtml(item.fileName || 'ticket')}">Open file</a>` : ''}<button class="v8-button v8-button-small v8-button-danger" data-action="remove-ticket" data-id="${escapeHtml(item.id)}">Remove</button></div></div></li>`).join('') || emptyNote('Upload tickets, vouchers, PDFs, or images for quick access.')}</ul>
        </article>
      </div>`;
  };

  const visualCard = (item, type) => `<article class="v8-visual-card">
    ${safeImageUrl(item.image) ? `<img src="${escapeHtml(safeImageUrl(item.image))}" alt="${escapeHtml(item.name || item.title)}" />` : `<div class="v8-image-fallback">${escapeHtml(item.name || item.title || 'Visual reference')}</div>`}
    <div class="v8-visual-card-body"><strong>${escapeHtml(item.name || item.title)}</strong><p class="v8-muted">${escapeHtml(item.category || item.caption || '')}</p>
      <div class="v8-actions"><button class="v8-button v8-button-small v8-button-danger" data-action="remove-${type}" data-id="${escapeHtml(item.id)}">Remove</button></div>
    </div>
  </article>`;

  const inspiration = () => {
    const items = workspace().outfits.filter((item) => item.kind === state.inspirationTab);
    return `${heading('Visual planning', 'Visionary', 'Build wearable outfits and a broader vibe board for aesthetics, Instagram planning, expectations, and visual references.',
      '<button type="button" class="v8-button v8-button-primary" data-action="add-inspiration">Add inspiration</button>')}
      <div class="v8-tabs" role="tablist"><button class="v8-tab" role="tab" aria-selected="${state.inspirationTab === 'outfits'}" data-inspiration-tab="outfits">Outfits</button><button class="v8-tab" role="tab" aria-selected="${state.inspirationTab === 'vibe'}" data-inspiration-tab="vibe">Vibe board</button></div>
      <div class="v8-board-grid">${items.map((item) => visualCard(item, 'inspiration')).join('') || emptyNote(state.inspirationTab === 'outfits' ? 'Add complete looks or build outfits from your closet.' : 'Add locations, poses, colors, post concepts, or any visual cue.')}</div>`;
  };

  const packing = () => {
    const ws = workspace();
    const items = ws.packingItems.filter((item) => item.section === state.packingTab);
    const packed = items.filter((item) => item.packed).length;
    const closet = readGlobal('closet');
    const templates = readGlobal('templates');
    const areaActions = state.packingArea === 'checklist'
      ? '<button type="button" class="v8-button v8-button-primary" data-action="add-packing">Add item</button><button type="button" class="v8-button" data-action="save-template">Save this list</button>'
      : state.packingArea === 'closet'
        ? '<button type="button" class="v8-button v8-button-primary" data-action="add-closet">Add clothing</button><button type="button" class="v8-button" data-action="add-outfit">Build outfit</button>'
        : '<button type="button" class="v8-button v8-button-primary" data-action="save-template">Save current checklist</button>';
    const sectionTabs = `<div class="v8-tabs v8-section-tabs" role="tablist" aria-label="Packing and closet">
      <button class="v8-tab" role="tab" aria-selected="${state.packingArea === 'checklist'}" data-packing-area="checklist">Packing checklist</button>
      <button class="v8-tab" role="tab" aria-selected="${state.packingArea === 'closet'}" data-packing-area="closet">My closet</button>
      <button class="v8-tab" role="tab" aria-selected="${state.packingArea === 'templates'}" data-packing-area="templates">Saved lists</button>
    </div>`;
    if (state.packingArea === 'closet') {
      return `${heading('Pack from what you own', 'Packing & closet', 'Your clothes live inside packing, so you can build outfits and visually confirm the exact pieces coming with you.', areaActions)}
        ${sectionTabs}
        <div class="v8-wardrobe-grid">${closet.map((item) => visualCard(item, 'closet')).join('') || emptyNote('Add clothing with a photo, category, color, season, and fit notes.')}</div>`;
    }
    if (state.packingArea === 'templates') {
      return `${heading('Your repeatable essentials', 'Packing & closet', 'Save the detailed list you trust, then add it to future trips in one step.', areaActions)}
        ${sectionTabs}
        <div class="v8-grid">${templates.map((item) => `<article class="v8-card"><span class="v8-card-label">${item.items.length} items</span><h2>${escapeHtml(item.name)}</h2><p class="v8-muted">${escapeHtml(item.description || '')}</p><div class="v8-actions"><button class="v8-button v8-button-small" data-action="apply-template" data-id="${escapeHtml(item.id)}">Add to this plan</button><button class="v8-button v8-button-small v8-button-danger" data-action="remove-template" data-id="${escapeHtml(item.id)}">Remove</button></div></article>`).join('') || `<article class="v8-card v8-card-wide">${emptyNote('Save the current packing checklist to reuse it on another plan.')}</article>`}</div>`;
    }
    return `${heading('Pack from home', 'Packing & closet', 'A detailed, quantity-aware checklist split into wardrobe and every miscellaneous detail. Your closet and reusable lists stay one tap away.', areaActions)}
      ${sectionTabs}
      <div class="v8-tabs v8-subtabs" role="tablist" aria-label="Packing checklist sections"><button class="v8-tab" role="tab" aria-selected="${state.packingTab === 'wardrobe'}" data-packing-tab="wardrobe">Wardrobe</button><button class="v8-tab" role="tab" aria-selected="${state.packingTab === 'misc'}" data-packing-tab="misc">Miscellaneous</button></div>
      <article class="v8-card v8-card-wide"><div class="v8-card-head"><span class="v8-card-label">${packed} of ${items.length} packed</span><strong>${items.length ? Math.round(packed / items.length * 100) : 0}%</strong></div>${progress(packed, items.length)}</article>
      <div class="v8-grid">
        <article class="v8-card ${state.packingTab === 'wardrobe' ? '' : 'v8-card-wide'}">
          <ul class="v8-list">${items.map((item) => {
            const wardrobe = closet.find((piece) => piece.id === item.wardrobeItemId);
            return `<li class="v8-list-item"><div class="v8-person"><label class="v8-checkbox"><input type="checkbox" data-action="toggle-packed" data-id="${escapeHtml(item.id)}"${item.packed ? ' checked' : ''}/><span><strong>${escapeHtml(item.name)}</strong> · qty ${Number(item.quantity) || 1}</span></label><button class="v8-button v8-button-small v8-button-danger" data-action="remove-packing" data-id="${escapeHtml(item.id)}">Remove</button></div><p>${escapeHtml(item.why || item.category || '')}${wardrobe ? ` · From closet: ${escapeHtml(wardrobe.name)}` : ''}</p></li>`;
          }).join('') || emptyNote('This section is empty.')}</ul>
        </article>
        ${state.packingTab === 'wardrobe' ? `<aside class="v8-card"><span class="v8-card-label">Packed wardrobe</span><h2>See the actual pieces</h2><div class="v8-wardrobe-grid">${items.map((item) => closet.find((piece) => piece.id === item.wardrobeItemId)).filter(Boolean).map((piece) => visualCard(piece, 'closet')).join('') || emptyNote('Link checklist items to pieces in My closet to see everything you packed in one visual tab.')}</div></aside>` : ''}
      </div>`;
  };

  const tasks = () => {
    const items = workspace().tasks;
    return `${heading('Shared accountability', 'Tasks', 'Assign owners, due dates, dependencies, and clear completion state.',
      '<button type="button" class="v8-button v8-button-primary" data-action="add-task">Add task</button>')}
      <div class="v8-grid"><article class="v8-card v8-card-wide"><ul class="v8-list">
        ${items.map((item) => `<li class="v8-list-item"><div class="v8-person"><label class="v8-checkbox"><input type="checkbox" data-action="toggle-task" data-id="${escapeHtml(item.id)}"${item.status === 'done' ? ' checked' : ''}/><span><strong>${escapeHtml(item.title)}</strong></span></label><span class="v8-pill">${escapeHtml(item.assignee || 'Unassigned')}</span></div><p>${escapeHtml(item.notes || '')}${item.dueAt ? ` · Due ${dateText(item.dueAt)}` : ''}</p><div class="v8-actions"><button class="v8-button v8-button-small" data-action="edit-task" data-id="${escapeHtml(item.id)}">Edit</button><button class="v8-button v8-button-small v8-button-danger" data-action="remove-task" data-id="${escapeHtml(item.id)}">Remove</button></div></li>`).join('') || emptyNote('No tasks yet. Start with the next decision somebody owns.')}
      </ul></article></div>`;
  };

  const splitForExpense = (expense, people) => {
    const split = expense.splits || [];
    if (split.length) return split;
    const each = people.length ? Number(expense.amount || 0) / people.length : Number(expense.amount || 0);
    return people.map((person) => ({ personId: person.id, amount: each }));
  };

  const moneyView = () => {
    const ws = workspace();
    const budget = ws.budgets.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const spent = ws.expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const balances = Object.fromEntries(ws.people.map((person) => [person.id, 0]));
    ws.expenses.forEach((expense) => {
      balances[expense.paidBy] = (balances[expense.paidBy] || 0) + Number(expense.amount || 0);
      splitForExpense(expense, ws.people).forEach((part) => {
        balances[part.personId] = (balances[part.personId] || 0) - Number(part.amount || 0);
      });
    });
    return `${heading('One shared ledger', 'Money', 'Estimate costs, track actual spending, split expenses fairly, and settle through the payment app each person prefers.',
      '<button type="button" class="v8-button v8-button-primary" data-action="add-expense">Add expense</button><button type="button" class="v8-button" data-action="add-budget">Add budget</button>')}
      <div class="v8-grid">
        <article class="v8-card v8-card-third"><span class="v8-card-label">Budget</span><div class="v8-stat">${money(budget)}</div></article>
        <article class="v8-card v8-card-third"><span class="v8-card-label">Spent</span><div class="v8-stat">${money(spent)}</div></article>
        <article class="v8-card v8-card-third"><span class="v8-card-label">Remaining</span><div class="v8-stat">${money(budget - spent)}</div></article>
        <article class="v8-card"><div class="v8-card-head"><span class="v8-card-label">Expenses</span></div><ul class="v8-list">${ws.expenses.map((item) => `<li class="v8-list-item"><div class="v8-item-main"><strong>${escapeHtml(item.title)}</strong><strong>${money(item.amount)}</strong></div><p>Paid by ${escapeHtml(ws.people.find((person) => person.id === item.paidBy)?.name || 'Unknown')} · ${escapeHtml(item.category || 'general')}</p><button class="v8-button v8-button-small v8-button-danger" data-action="remove-expense" data-id="${escapeHtml(item.id)}">Remove</button></li>`).join('') || emptyNote('No expenses recorded.')}</ul></article>
        <article class="v8-card"><div class="v8-card-head"><span class="v8-card-label">Balances</span></div><ul class="v8-list">${ws.people.map((person) => {
          const balance = balances[person.id] || 0;
          const app = person.paymentApp || 'venmo';
          const paymentUrl = app === 'cashapp' && person.paymentHandle
            ? `https://cash.app/$${encodeURIComponent(person.paymentHandle.replace(/^\$/, ''))}/${Math.abs(balance).toFixed(2)}`
            : app === 'venmo' && person.paymentHandle
              ? `https://venmo.com/${encodeURIComponent(person.paymentHandle.replace(/^@/, ''))}?txn=pay&amount=${Math.abs(balance).toFixed(2)}&note=${encodeURIComponent(active().plan.title)}`
              : '';
          const settled = ws.settlements.some((item) => item.personId === person.id && item.status === 'confirmed' && Number(item.amount) === Math.abs(balance));
          return `<li class="v8-list-item"><div class="v8-item-main"><strong>${escapeHtml(person.name)}</strong><strong>${settled ? 'settled' : `${balance >= 0 ? 'gets ' : 'owes '}${money(Math.abs(balance))}`}</strong></div><div class="v8-actions">${paymentUrl && !settled ? `<a class="v8-button v8-button-small" href="${paymentUrl}" target="_blank" rel="noopener">Open ${escapeHtml(app)}</a>` : ''}<button class="v8-button v8-button-small" data-action="copy-settlement" data-name="${escapeHtml(person.name)}" data-amount="${Math.abs(balance).toFixed(2)}">Copy payment note</button>${!settled && Math.abs(balance) > .004 ? `<button class="v8-button v8-button-small" data-action="confirm-settlement" data-person-id="${escapeHtml(person.id)}" data-amount="${Math.abs(balance).toFixed(2)}">Mark settled</button>` : ''}</div></li>`;
        }).join('') || emptyNote('Add people to calculate balances.')}</ul></article>
      </div>`;
  };

  const people = () => {
    const ws = workspace();
    return `${heading('People and availability', 'People', 'Plan roles, guests, RSVP details, dietary and accessibility notes, plus date voting in one place.',
      '<button type="button" class="v8-button v8-button-primary" data-action="add-person">Add person</button><button type="button" class="v8-button" data-action="create-share-link">Invite collaborator</button><button type="button" class="v8-button" data-action="add-poll">Create date poll</button>')}
      <div class="v8-grid">
        ${state.shareUrl ? `<article class="v8-card v8-card-wide"><span class="v8-card-label">Secure invitation link</span><p class="v8-muted">${escapeHtml(state.shareUrl)}</p><button class="v8-button v8-button-small" data-action="copy-share-link">Copy link</button></article>` : ''}
        <article class="v8-card"><span class="v8-card-label">Travelers & guests</span><ul class="v8-list">${ws.people.map((person) => `<li class="v8-list-item"><div class="v8-person"><div><strong>${escapeHtml(person.name)}</strong><p>${escapeHtml(person.email || '')}</p></div><span class="v8-pill">${escapeHtml(person.rsvp || person.role || 'invited')}</span></div><p>${escapeHtml([person.dietary, person.accessibility].filter(Boolean).join(' · '))}</p><div class="v8-actions"><button class="v8-button v8-button-small" data-action="edit-person" data-id="${escapeHtml(person.id)}">Edit</button>${person.role !== 'owner' ? `<button class="v8-button v8-button-small v8-button-danger" data-action="remove-person" data-id="${escapeHtml(person.id)}">Remove</button>` : ''}</div></li>`).join('')}</ul></article>
        <article class="v8-card"><span class="v8-card-label">Date polls</span>${ws.datePolls.map((poll) => `<section class="v8-list-item"><div class="v8-card-head"><h3>${escapeHtml(poll.title)}</h3><span class="v8-pill">${escapeHtml(poll.status || 'open')}</span></div><div class="v8-vote-grid">${(poll.options || []).map((option) => {
          const votes = option.votes || {};
          const mine = votes[state.me?.email] || '';
          return `<div class="v8-vote-option"><strong>${dateText(option.startsAt, { dateStyle: 'medium', timeStyle: 'short' })}</strong><p class="v8-muted">${Object.values(votes).filter((vote) => ['preferred', 'available'].includes(vote)).length} available</p><select data-action="vote-date" data-poll-id="${escapeHtml(poll.id)}" data-option-id="${escapeHtml(option.id)}"><option value="">Your availability</option>${['preferred', 'available', 'maybe', 'unavailable'].map((value) => `<option value="${value}"${mine === value ? ' selected' : ''}>${value}</option>`).join('')}</select></div>`;
        }).join('')}</div></section>`).join('') || emptyNote('Create a poll so invited friends can vote on the best date.')}</article>
      </div>`;
  };

  const journal = () => `${heading('Shared memory', 'Journal', 'Keep decisions, post ideas, lessons, and after-plan notes attached to the plan.',
    '<button type="button" class="v8-button v8-button-primary" data-action="add-journal-v8">Add note</button>')}
    <div class="v8-grid"><article class="v8-card v8-card-wide"><ul class="v8-list">${workspace().activity.map((item) => `<li class="v8-list-item"><div class="v8-item-main"><strong>${escapeHtml(item.summary)}</strong><span class="v8-pill">${dateText(item.createdAt, { dateStyle: 'medium' })}</span></div><p>${escapeHtml(item.notes || `By ${item.actor || 'a planner'}`)}</p></li>`).join('') || emptyNote('Plan activity and journal notes will appear here.')}</ul></article></div>`;

  const planCard = (entry, compact = false) => {
    const plan = entry.plan;
    const when = plan.startAt ? dateText(plan.startAt, { dateStyle: 'medium' }) : 'Date open';
    return `<article class="v8-plan-card${compact ? ' v8-plan-card-compact' : ''}">
      <div class="v8-plan-card-top"><span class="v8-pill">${escapeHtml(plan.type)}</span><span class="v8-card-label">${escapeHtml(when)}</span></div>
      <div><h3>${escapeHtml(plan.title)}</h3><p>${escapeHtml(plan.destination || (plan.type === 'blank' ? 'Flexible general plan' : 'Details still open'))}</p></div>
      <div class="v8-plan-card-foot"><span>${escapeHtml(planStudio(plan).label)}</span><div class="v8-actions"><button type="button" class="v8-button v8-button-small" data-action="open-plan" data-id="${escapeHtml(plan.id)}">Open plan</button>${compact ? '' : `<button type="button" class="v8-button v8-button-small v8-button-danger" data-action="delete-plan" data-id="${escapeHtml(plan.id)}">Delete</button>`}</div></div>
    </article>`;
  };

  const homeGlobal = () => `
    <section class="v8-home">
      <header class="v8-home-hero">
        <span class="v8-kicker">Malem planning home</span>
        <h1>What are you planning today?</h1>
        <p>Start with the kind of plan you need. Malem will open the right workspace, with the right tools, in the right order.</p>
      </header>
      <div class="v8-start-grid">
        <article class="v8-start-card" data-type="trip">
          <div class="v8-start-number">01</div>
          <span class="v8-card-label">Travel</span>
          <h2>Plan a trip</h2>
          <p>Build the itinerary, bookings, inspiration, packing and closet, shared costs, and traveler details together.</p>
          <ul><li>Trip-specific itinerary</li><li>Choose AI or build it yourself</li><li>Packing linked to your closet</li></ul>
          <button type="button" class="v8-button v8-button-primary" data-action="start-plan" data-plan-type="trip">Plan a trip</button>
        </article>
        <article class="v8-start-card" data-type="event">
          <div class="v8-start-number">02</div>
          <span class="v8-card-label">Gatherings</span>
          <h2>Plan an event</h2>
          <p>Organize a party, dinner, shower, celebration, or gathering around guests and a clear run of show.</p>
          <ul><li>Guest list and date voting</li><li>Vendors, tickets, and budget</li><li>Contextual planning help</li></ul>
          <button type="button" class="v8-button v8-button-primary" data-action="start-plan" data-plan-type="event">Plan an event</button>
        </article>
        <article class="v8-start-card" data-type="blank">
          <div class="v8-start-number">03</div>
          <span class="v8-card-label">Anything else</span>
          <h2>Plan anything</h2>
          <p>Organize any shared idea, decision, project, or gathering with a flexible set of connected planning tools.</p>
          <ul><li>People and availability</li><li>Tasks, timeline, and notes</li><li>Choose AI or build it yourself</li></ul>
          <button type="button" class="v8-button v8-button-primary" data-action="start-plan" data-plan-type="blank">Plan anything</button>
        </article>
      </div>
      <section class="v8-continue">
        <div class="v8-section-head"><div><span class="v8-card-label">Everything in one place</span><h2>Continue planning</h2></div><button type="button" class="v8-button" data-global-view="plans">View all plans</button></div>
        <div class="v8-plan-grid">${state.plans.slice(0, 3).map((entry) => planCard(entry, true)).join('') || emptyNote('Your trips, events, and group plans will appear here.')}</div>
      </section>
    </section>`;

  const aiIntakeGlobal = () => {
    const copy = planningTypeCopy(state.aiIntakeType || 'trip');
    return `
      <section class="v8-intake">
        <button type="button" class="v8-intake-back" data-global-view="home">← Back to planning types</button>
        <header class="v8-intake-head">
          <span class="v8-kicker">${escapeHtml(copy.title)} · with AI</span>
          <h1>${escapeHtml(copy.aiTitle)}</h1>
          <p>Start naturally. Malem will build the first version, and then every detail remains editable in your studio.</p>
        </header>
        <div class="v8-intake-chat" aria-live="polite">
          ${state.aiIntakeMessages.map((message) => `<div class="v8-intake-message" data-role="${escapeHtml(message.role)}"><span>${message.role === 'assistant' ? 'Malem' : 'You'}</span><p>${escapeHtml(message.content)}</p></div>`).join('')}
        </div>
        <label class="v8-intake-compose">
          <span class="sr-only">Tell Malem what you are planning</span>
          <textarea id="v8-ai-intake-input" placeholder="${escapeHtml(copy.placeholder)}"${state.aiIntakeSending ? ' disabled' : ''}></textarea>
          <button type="button" class="v8-button v8-button-primary" data-action="submit-ai-intake"${state.aiIntakeSending ? ' disabled' : ''}>${state.aiIntakeSending ? 'Building your plan…' : 'Build my plan'}</button>
        </label>
        <p class="v8-intake-note">Nothing is booked or purchased automatically. Malem creates an editable plan from what you share.</p>
      </section>`;
  };

  const profileGlobal = () => {
    const connections = readGlobal('connections');
    const google = connections.find((item) => item.provider === 'google-calendar');
    return `${heading('Your account', 'Profile', 'Personal planning preferences and outside connections belong together here—not in the planning navigation.',
      '<button type="button" class="v8-button v8-button-primary" data-action="open-profile-details">Edit personal profile</button><button type="button" class="v8-button" data-action="open-settings">App settings</button>')}
      <div class="v8-profile-grid">
        <article class="v8-card">
          <span class="v8-card-label">Account</span>
          <h2>${escapeHtml(state.me?.name || 'Your profile')}</h2>
          <p class="v8-muted">${escapeHtml(state.me?.email || '')}</p>
          <p class="v8-profile-note">Dietary, accessibility, travel style, wardrobe preferences, and privacy settings shape the plans you choose to personalize.</p>
        </article>
        <article class="v8-card v8-profile-connections">
          <div class="v8-card-head"><div><span class="v8-card-label">Connections</span><h2>Calendar & payments</h2></div></div>
          <div class="v8-connection-row">
            <div><strong>Google Calendar</strong><p>${google ? `Configured for ${escapeHtml(google.email)}.` : 'Not configured yet. You can still export any plan as an .ics file.'}</p></div>
            <div class="v8-actions"><button class="v8-button v8-button-small v8-button-primary" data-action="connect-calendar">${google ? 'Update' : 'Connect'}</button><button class="v8-button v8-button-small" data-action="export-calendar"${active() ? '' : ' disabled'}>Export active plan</button><a class="v8-button v8-button-small" href="https://calendar.google.com/calendar/u/0/r" target="_blank" rel="noopener">Open calendar</a></div>
          </div>
          <div class="v8-connection-row">
            <div><strong>Venmo, Zelle & Cash App</strong><p>Payment preferences stay with each person. Malem calculates balances but never stores banking credentials.</p></div>
            <button class="v8-button v8-button-small" data-action="open-money"${active() ? '' : ' disabled'}>Open active plan’s money</button>
          </div>
        </article>
      </div>`;
  };

  const plansGlobal = () => `${heading('All planning, one place', 'Plans', 'Trips, events, and flexible general plans all use the same connected planning system.',
    '<button type="button" class="v8-button v8-button-primary" data-action="new-plan">Create a plan</button>')}
    <div class="v8-plan-grid">${state.plans.map((entry) => planCard(entry)).join('') || `<article class="v8-card v8-card-wide">${emptyNote('Create a trip, event, or flexible plan to begin.')}</article>`}</div>`;

  const closetGlobal = () => {
    const closet = readGlobal('closet');
    return `${heading('Your visual wardrobe', 'Closet', 'Photograph and classify clothes once, build outfits, then reference the exact pieces while packing any plan.',
      '<button type="button" class="v8-button v8-button-primary" data-action="add-closet">Add clothing</button><button type="button" class="v8-button" data-action="add-outfit">Build outfit</button>')}
      <div class="v8-wardrobe-grid">${closet.map((item) => visualCard(item, 'closet')).join('') || emptyNote('Add your first clothing item with a photo, category, color, season, and notes.')}</div>`;
  };

  const templatesGlobal = () => {
    const templates = readGlobal('templates');
    return `${heading('Reusable defaults', 'Packing templates', 'Save the exact personal list you trust and apply it automatically to new trips or manually to the current plan.',
      '<button type="button" class="v8-button v8-button-primary" data-action="save-template">Save current list</button>')}
      <div class="v8-grid">${templates.map((item) => `<article class="v8-card"><span class="v8-card-label">${item.items.length} items</span><h2>${escapeHtml(item.name)}</h2><p class="v8-muted">${escapeHtml(item.description || '')}</p><div class="v8-actions"><button class="v8-button v8-button-small" data-action="apply-template" data-id="${escapeHtml(item.id)}">Apply to current plan</button><button class="v8-button v8-button-small v8-button-danger" data-action="remove-template" data-id="${escapeHtml(item.id)}">Remove</button></div></article>`).join('') || `<article class="v8-card v8-card-wide">${emptyNote('Save a current packing list to reuse it anywhere.')}</article>`}</div>`;
  };

  const connectionsGlobal = () => {
    const connections = readGlobal('connections');
    const google = connections.find((item) => item.provider === 'google-calendar');
    return `${heading('External handoffs', 'Connections', 'Keep calendars and payment apps close to the plan without exposing credentials in the browser.')}
      <div class="v8-grid">
        <article class="v8-card"><span class="v8-card-label">Calendar</span><h2>Google Calendar</h2><p class="v8-muted">${google ? `Configured for ${escapeHtml(google.email)}. Export the combined plan calendar or open Google Calendar.` : 'Add your calendar identity, then export the complete plan as an .ics calendar.'}</p><div class="v8-actions"><button class="v8-button v8-button-small v8-button-primary" data-action="connect-calendar">${google ? 'Update connection' : 'Connect calendar'}</button><button class="v8-button v8-button-small" data-action="export-calendar">Export combined .ics</button><a class="v8-button v8-button-small" href="https://calendar.google.com/calendar/u/0/r" target="_blank" rel="noopener">Open Google Calendar</a></div></article>
        <article class="v8-card"><span class="v8-card-label">Payments</span><h2>Venmo, Zelle & Cash App</h2><p class="v8-muted">Each person chooses a payment app and handle in People. Malem calculates balances, opens supported payment links, and provides a copy-ready Zelle or bank note.</p><button class="v8-button v8-button-small" data-view="money">Open money</button></article>
        <article class="v8-card v8-card-wide"><span class="v8-card-label">Privacy boundary</span><p class="v8-muted">Malem stores planning references, not banking credentials. Payment completion is confirmed back in the shared ledger by a participant.</p></article>
      </div>`;
  };

  const renderBody = () => {
    if (state.globalView === 'home') return homeGlobal();
    if (state.globalView === 'ai-intake') return aiIntakeGlobal();
    if (state.globalView === 'plans') return plansGlobal();
    if (state.globalView === 'profile') return profileGlobal();
    if (!active()) return homeGlobal();
    return ({
      overview, schedule, explore, bookings, inspiration, packing,
      tasks, money: moneyView, people, journal,
    }[state.view] || overview)();
  };

  const render = async () => {
    document.querySelector('#screen-app')?.classList.toggle(
      'v8-active',
      (location.hash || '').startsWith('#/plans'),
    );
    const root = document.querySelector(rootSelector);
    if (!root) return;
    if (!state.loaded && !state.loading) {
      root.innerHTML = '<div class="v8-loading">Opening your planning studio…</div>';
      await load();
    }
    if (!state.loaded) {
      root.innerHTML = `<div class="v8-loading">${escapeHtml(state.status || 'Opening your planning studio…')}</div>`;
      return;
    }
    root.innerHTML = shell(renderBody());
  };

  const field = (name, label, value = '', type = 'text', extra = '') =>
    `<label class="v8-field"><span>${escapeHtml(label)}</span><input type="${type}" name="${name}" value="${escapeHtml(value)}" ${extra}/></label>`;
  const selectField = (name, label, value, options) =>
    `<label class="v8-field"><span>${escapeHtml(label)}</span><select name="${name}">${options.map((option) => {
      const candidate = typeof option === 'string' ? { value: option, label: option } : option;
      return `<option value="${escapeHtml(candidate.value)}"${candidate.value === value ? ' selected' : ''}>${escapeHtml(candidate.label)}</option>`;
    }).join('')}</select></label>`;
  const textareaField = (name, label, value = '') =>
    `<label class="v8-field v8-field-wide"><span>${escapeHtml(label)}</span><textarea name="${name}">${escapeHtml(value)}</textarea></label>`;

  const modal = (title, kicker, formHtml, onSubmit, submitLabel = 'Save') => {
    document.querySelector('#v8-modal')?.remove();
    const dialog = document.createElement('dialog');
    dialog.id = 'v8-modal';
    dialog.className = 'v8-modal';
    dialog.innerHTML = `<div class="v8-modal-inner"><header class="v8-modal-head"><div><span class="v8-kicker">${escapeHtml(kicker)}</span><h2>${escapeHtml(title)}</h2></div><button type="button" class="v8-button v8-button-small" data-modal-close>Close</button></header><form class="v8-form"><div class="v8-form-grid">${formHtml}</div><div class="v8-actions"><button class="v8-button v8-button-primary" type="submit">${escapeHtml(submitLabel)}</button><span class="v8-status" data-modal-status></span></div></form></div>`;
    document.body.append(dialog);
    dialog.querySelector('[data-modal-close]').onclick = () => dialog.close();
    dialog.addEventListener('close', () => dialog.remove());
    dialog.querySelector('form').onsubmit = async (event) => {
      event.preventDefault();
      const status = dialog.querySelector('[data-modal-status]');
      status.textContent = 'Saving…';
      try {
        await onSubmit(Object.fromEntries(new FormData(event.currentTarget)));
        dialog.close();
      } catch (error) {
        status.textContent = error.message;
      }
    };
    dialog.showModal();
    return dialog;
  };

  const compressImage = (file) => new Promise((resolve, reject) => {
    if (!file) { resolve(''); return; }
    if (!file.type.startsWith('image/')) { reject(new Error('Choose an image file.')); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The image could not be read.'));
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, 720 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', .78));
      };
      image.onerror = () => reject(new Error('The image could not be decoded.'));
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  const planningTypeCopy = (requestedType = 'trip') => {
    const type = ['trip', 'event', 'blank'].includes(requestedType) ? requestedType : 'trip';
    return {
      trip: {
        type,
        noun: 'trip',
        title: 'Plan a trip',
        untitled: 'Untitled trip',
        aiTitle: 'Where are you going?',
        aiPrompt: 'Tell me the location first. Add dates, who is traveling, budget, pace, or anything important if you know it.',
        placeholder: 'Lisbon in September for five days with two friends…',
      },
      event: {
        type,
        noun: 'event',
        title: 'Plan an event',
        untitled: 'Untitled event',
        aiTitle: 'What event are you planning?',
        aiPrompt: 'Tell me the event and location first. Add the date, guest count, budget, or vibe if you know them.',
        placeholder: 'A rooftop birthday dinner in Chicago for 20 people…',
      },
      blank: {
        type,
        noun: 'plan',
        title: 'Plan anything',
        untitled: 'Untitled plan',
        aiTitle: 'What are you organizing?',
        aiPrompt: 'Tell me the goal first. Add the people involved, timing, location, or anything already decided.',
        placeholder: 'A friendsgiving plan for our group in November…',
      },
    }[type];
  };

  const allModulesEnabled = () => Object.fromEntries(modules.map((name, order) => [
    name,
    { enabled: true, order },
  ]));

  const ownerRecord = () => ({
    id: id('person'),
    name: state.me?.name || 'Plan owner',
    email: state.me?.email || '',
    role: 'owner',
    rsvp: 'yes',
  });

  const openCreatedPlan = (result, status = 'Plan created') => {
    state.plans.unshift(result);
    state.activePlanId = result.plan.id;
    state.globalView = '';
    state.view = 'overview';
    state.aiIntakeType = '';
    state.aiIntakeMessages = [];
    localStorage.setItem('malem.v8.activePlan', state.activePlanId);
    state.status = status;
    render();
    resetScroll();
  };

  const buildPlanDraft = (type, draft = {}, aiMode = 'off') => {
    const copy = planningTypeCopy(type);
    const base = {
      id: id('plan'),
      type,
      title: draft.title || copy.untitled,
      destination: draft.destination || '',
      startAt: draft.startAt || '',
      endAt: draft.endAt || '',
      aiMode,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      currency: String(draft.currency || 'USD').toUpperCase(),
      modules: allModulesEnabled(),
      schedule: {
        days: (Array.isArray(draft.scheduleDays) ? draft.scheduleDays : []).slice(0, 21).map((day, index) => ({
          id: id('day'),
          date: day.date || '',
          theme: day.theme || `Day ${index + 1}`,
          blocks: (Array.isArray(day.blocks) ? day.blocks : []).slice(0, 24).map((block) => ({
            id: id('schedule'),
            time: block.time || '',
            title: block.title || 'Plan item',
            duration: block.duration || '',
            kind: block.kind || 'activity',
            notes: block.notes || '',
          })),
        })),
      },
      event: {
        subtype: draft.eventSubtype || '',
        venueName: draft.destination || '',
        guestCount: Number(draft.guestCount) || 0,
      },
    };
    const ws = type === 'trip'
      ? { ...emptyWorkspace(), ...defaultPacking(base) }
      : emptyWorkspace();
    ws.people = [ownerRecord()];
    ws.tasks = (Array.isArray(draft.tasks) ? draft.tasks : []).slice(0, 40).map((task) => ({
      id: id('task'),
      title: task.title || 'Next step',
      status: 'open',
      assignee: '',
      dueAt: task.dueAt || '',
      notes: task.notes || '',
    }));
    ws.bookings = (Array.isArray(draft.bookings) ? draft.bookings : []).slice(0, 20).map((booking) => ({
      id: id('booking'),
      type: booking.type || 'activity',
      status: 'considering',
      title: booking.title || 'Booking to consider',
      provider: '',
      confirmation: '',
      startAt: booking.startAt || '',
      endAt: booking.endAt || '',
      location: booking.location || '',
      url: '',
      notes: booking.notes || '',
    }));
    if (Number(draft.budget) > 0) {
      ws.budgets = [{ id: id('budget'), name: 'Estimated total', amount: Number(draft.budget) }];
    }
    if (aiMode !== 'off') {
      ws.activity = [{
        id: id('activity'),
        summary: 'Malem created the first draft',
        notes: 'Review every section and edit anything you want.',
        actor: 'Malem',
        createdAt: nowIso(),
      }];
    }
    base.workspace = ws;
    return base;
  };

  const createWithoutAi = async (type) => {
    const base = buildPlanDraft(type, {}, 'off');
    const result = await request('plans', { method: 'POST', body: { plan: base } });
    openCreatedPlan(result, 'Your studio is ready');
  };

  const openAiIntake = (type) => {
    const copy = planningTypeCopy(type);
    state.aiIntakeType = type;
    state.aiIntakeMessages = [{ role: 'assistant', content: copy.aiPrompt }];
    state.globalView = 'ai-intake';
    state.aiIntakeSending = false;
    render();
    resetScroll();
  };

  const choosePlanningMode = (type) => {
    const copy = planningTypeCopy(type);
    document.querySelector('#v8-modal')?.remove();
    const dialog = document.createElement('dialog');
    dialog.id = 'v8-modal';
    dialog.className = 'v8-modal v8-choice-modal';
    dialog.innerHTML = `
      <div class="v8-modal-inner">
        <header class="v8-modal-head">
          <div><span class="v8-kicker">${escapeHtml(copy.title)}</span><h2>How do you want to start?</h2></div>
          <button type="button" class="v8-button v8-button-small" data-modal-close>Close</button>
        </header>
        <div class="v8-mode-grid">
          <button type="button" class="v8-mode-choice" data-mode="ai">
            <span class="v8-card-label">With AI</span>
            <strong>Tell Malem what you want</strong>
            <p>Start in a focused chat. Malem will turn your answer into a complete first draft, then open it in the studio.</p>
            <span class="v8-mode-cta">Continue with AI →</span>
          </button>
          <button type="button" class="v8-mode-choice" data-mode="without">
            <span class="v8-card-label">Without AI</span>
            <strong>Build it yourself</strong>
            <p>Skip setup and go straight into an empty studio with every planning tool ready to use.</p>
            <span class="v8-mode-cta">Open the studio →</span>
          </button>
        </div>
        <p class="v8-status" data-modal-status></p>
      </div>`;
    document.body.append(dialog);
    dialog.querySelector('[data-modal-close]').onclick = () => dialog.close();
    dialog.addEventListener('close', () => dialog.remove());
    dialog.querySelector('[data-mode="ai"]').onclick = () => {
      dialog.close();
      openAiIntake(type);
    };
    dialog.querySelector('[data-mode="without"]').onclick = async (event) => {
      const status = dialog.querySelector('[data-modal-status]');
      event.currentTarget.disabled = true;
      status.textContent = 'Opening your studio…';
      try {
        await createWithoutAi(type);
        dialog.close();
      } catch (error) {
        event.currentTarget.disabled = false;
        status.textContent = error.message;
      }
    };
    dialog.showModal();
  };

  const editPlan = () => {
    const entry = active();
    modal('Plan settings', 'Structure and planning mode', `
      ${field('title', 'Title', entry.plan.title, 'text', 'required')}
      ${field('destination', 'Destination or venue', entry.plan.destination)}
      ${field('startAt', 'Starts', String(entry.plan.startAt || '').slice(0, 16), 'datetime-local')}
      ${field('endAt', 'Ends', String(entry.plan.endAt || '').slice(0, 16), 'datetime-local')}
      ${selectField('aiMode', 'Planning mode', entry.plan.aiMode, [{ value: 'off', label: 'Without AI' }, { value: 'assist', label: 'AI only when asked' }, { value: 'guided', label: 'AI-guided' }])}
      ${field('timezone', 'Timezone', entry.plan.timezone)}
      ${field('currency', 'Currency', entry.plan.currency)}
      <div class="v8-field v8-field-wide"><span>Modules</span><div class="v8-actions">${modules.filter((name) => !['overview', 'people'].includes(name)).map((name) => `<label class="v8-checkbox"><input type="checkbox" name="module_${name}"${entry.plan.modules[name]?.enabled !== false ? ' checked' : ''}/><span>${moduleLabels[name]}</span></label>`).join('')}</div></div>
    `, async (values) => {
      const operations = [{
        type: 'plan.update',
        patch: {
          title: values.title,
          destination: values.destination,
          startAt: values.startAt,
          endAt: values.endAt,
          aiMode: values.aiMode,
          timezone: values.timezone,
          currency: values.currency,
        },
      }, ...modules.filter((name) => !['overview', 'people'].includes(name)).map((name, order) => ({
        type: 'plan.module.update',
        module: name,
        enabled: values[`module_${name}`] === 'on',
        order,
      }))];
      const result = await request(`plans/${encodeURIComponent(entry.plan.id)}/document`, {
        method: 'PATCH',
        body: { baseRevision: entry.revision, clientMutationId: id('settings'), operations },
      });
      state.plans[state.plans.findIndex((item) => item.plan.id === entry.plan.id)] = result;
      render();
    });
  };

  const scheduleModal = (dayId = '', itemId = '') => {
    const plan = active().plan;
    const day = (plan.schedule?.days || []).find((candidate) => candidate.id === dayId);
    const item = day?.blocks?.find((candidate) => candidate.id === itemId);
    modal(item ? 'Edit schedule item' : 'Add schedule item', 'Schedule', `
      ${field('date', 'Date', day?.date || String(plan.startAt || '').slice(0, 10), 'date', 'required')}
      ${field('time', 'Time', item?.time || '', 'time')}
      ${field('title', 'Title', item?.title || '', 'text', 'required')}
      ${field('duration', 'Duration', item?.duration || '')}
      ${selectField('kind', 'Type', item?.kind || 'activity', ['activity', 'flight', 'stay', 'event', 'meal', 'transport', 'reminder'])}
      ${textareaField('notes', 'Notes', item?.notes || '')}
    `, async (values) => {
      const entry = active();
      let targetDay = day;
      const operations = [];
      if (!targetDay) {
        targetDay = { id: id('day'), date: values.date, theme: values.date, blocks: [] };
        operations.push({ type: 'schedule.day.add', day: targetDay });
      }
      operations.push(item
        ? { type: 'schedule.block.update', dayId: targetDay.id, blockId: item.id, patch: values }
        : { type: 'schedule.block.add', dayId: targetDay.id, block: values });
      const result = await request(`plans/${encodeURIComponent(entry.plan.id)}/document`, {
        method: 'PATCH',
        body: { baseRevision: entry.revision, clientMutationId: id('schedule'), operations },
      });
      state.plans[state.plans.findIndex((candidate) => candidate.plan.id === entry.plan.id)] = result;
      render();
    });
  };

  const simpleEntityModal = (config) => {
    const current = config.current || {};
    modal(config.title, config.kicker || moduleLabels[state.view] || 'Planning', config.fields(current), async (values) => {
      const entity = { ...current, ...values, id: current.id || id(config.prefix), updatedAt: nowIso() };
      if (config.prepare) await config.prepare(entity, values);
      await updateCollection(config.collection, (items) =>
        current.id ? items.map((item) => item.id === current.id ? entity : item) : [...items, entity],
      config.summary || `${current.id ? 'Updated' : 'Added'} ${entity.title || entity.name}`);
      if (config.after) await config.after(entity, values);
    }, config.submitLabel || 'Save');
  };

  const exportCalendar = () => {
    const entry = active();
    if (!entry) return;
    const events = [
      ...(entry.plan.schedule?.days || []).flatMap((day) => (day.blocks || []).map((block) => ({
        title: block.title,
        startAt: `${day.date || String(entry.plan.startAt).slice(0, 10)}T${block.time || '09:00'}`,
        endAt: '',
        notes: block.notes,
      }))),
      ...workspace().bookings,
      ...workspace().reminders.map((item) => ({ title: item.title, startAt: item.dueAt, notes: item.notes })),
    ].filter((item) => item.startAt);
    const stamp = (value) => new Date(value).toISOString().replaceAll('-', '').replaceAll(':', '').replace('.000', '');
    const clean = (value) => String(value || '').replaceAll('\\', '\\\\').replaceAll('\n', '\\n').replaceAll(',', '\\,').replaceAll(';', '\\;');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Malem//Planning Studio//EN'];
    events.forEach((item) => {
      const start = new Date(item.startAt);
      if (Number.isNaN(start.getTime())) return;
      const end = item.endAt && !Number.isNaN(new Date(item.endAt).getTime())
        ? new Date(item.endAt) : new Date(start.getTime() + 60 * 60 * 1000);
      lines.push('BEGIN:VEVENT', `UID:${item.id || id('event')}@malem`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`, `SUMMARY:${clean(item.title)}`, `DESCRIPTION:${clean(item.notes)}`, 'END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    const url = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${entry.plan.title.replace(/[^\w-]+/g, '-').toLowerCase() || 'malem-plan'}.ics`;
    link.click();
    URL.revokeObjectURL(url);
    state.status = `Exported ${events.length} calendar items`;
    renderStatus();
  };

  const submitAiIntake = async (prompt) => {
    const text = String(prompt || '').trim();
    if (!text || state.aiIntakeSending) return;
    const type = state.aiIntakeType || 'trip';
    const copy = planningTypeCopy(type);
    state.aiIntakeMessages = [...state.aiIntakeMessages, { role: 'user', content: text }];
    state.aiIntakeSending = true;
    render();
    try {
      const response = await fetch('/api/openrouter/chat/completions', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'openai/gpt-5.6-terra',
          temperature: 0.25,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: `You are Malem, creating the first editable draft of a ${copy.noun}. Return only one JSON object. Use only facts the user supplied; leave unknown dates, prices, providers, and confirmations empty. Make the plan thoughtful and specific without pretending anything is booked. Shape:
{"title":"","destination":"","startAt":"","endAt":"","currency":"USD","eventSubtype":"","guestCount":0,"budget":0,"scheduleDays":[{"date":"","theme":"","blocks":[{"time":"","title":"","duration":"","kind":"activity","notes":""}]}],"tasks":[{"title":"","dueAt":"","notes":""}],"bookings":[{"type":"activity","title":"","startAt":"","endAt":"","location":"","notes":""}]}
For trips, make a practical day-by-day itinerary and include preparation tasks. For events, make a run of show, guest/vendor tasks, and only bookings that should be considered. For general plans, create a useful timeline and next actions. Keep arrays compact but complete enough to feel immediately useful.`,
            },
            { role: 'user', content: text },
          ],
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error?.message || 'Malem could not build the plan right now.');
      const raw = String(body?.choices?.[0]?.message?.content || '').trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '');
      const draft = JSON.parse(raw);
      const plan = buildPlanDraft(type, draft, 'guided');
      const result = await request('plans', { method: 'POST', body: { plan } });
      openCreatedPlan(result, 'Malem created your first draft');
    } catch (error) {
      state.aiIntakeMessages = [...state.aiIntakeMessages, {
        role: 'assistant',
        content: `${error.message} You can try again, or go back and open the studio without AI.`,
      }];
      state.aiIntakeSending = false;
      render();
    }
  };

  const askPlanAi = async (prompt) => {
    const entry = active();
    if (!entry) return;
    const plan = entry.plan;
    const ws = workspace();
    const text = String(prompt || '').trim();
    if (!text || state.aiSending) return;
    const messages = state.aiMessages[plan.id] || [];
    state.aiMessages[plan.id] = [...messages, { role: 'user', content: text }];
    state.aiSending = true;
    render();
    try {
      const safeContext = {
        type: plan.type,
        title: plan.title,
        destination: plan.destination,
        starts: plan.startAt,
        ends: plan.endAt,
        currentSection: activeModuleLabel(plan, state.view),
        scheduleItems: (plan.schedule?.days || []).flatMap((day) => day.blocks || []).map((item) => item.title).slice(0, 24),
        bookings: ws.bookings.map((item) => ({ type: item.type, title: item.title, status: item.status, startAt: item.startAt })).slice(0, 16),
        openTasks: ws.tasks.filter((item) => item.status !== 'done').map((item) => ({ title: item.title, dueAt: item.dueAt })).slice(0, 20),
        budget: ws.budgets.reduce((sum, item) => sum + Number(item.amount || 0), 0),
        spent: ws.expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0),
        peopleCount: ws.people.length,
        packingProgress: plan.type === 'trip'
          ? `${ws.packingItems.filter((item) => item.packed).length}/${ws.packingItems.length}`
          : undefined,
      };
      const response = await fetch('/api/openrouter/chat/completions', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'openai/gpt-5.6-terra',
          temperature: 0.35,
          messages: [
            {
              role: 'system',
              content: 'You are Malem, a practical planning collaborator embedded inside a plan. Give a concise, specific answer grounded only in the provided plan context. Flag missing information honestly. Never claim you changed the plan; suggest clear next steps the user can choose.',
            },
            { role: 'user', content: `Plan context:\n${JSON.stringify(safeContext)}\n\nQuestion:\n${text}` },
          ],
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error?.message || 'Ask Malem is unavailable right now.');
      const answer = String(body?.choices?.[0]?.message?.content || '').trim();
      if (!answer) throw new Error('Malem did not return an answer.');
      state.aiMessages[plan.id] = [...state.aiMessages[plan.id], { role: 'assistant', content: answer }];
    } catch (error) {
      state.aiMessages[plan.id] = [...state.aiMessages[plan.id], {
        role: 'assistant',
        content: `${error.message} Your plan is still saved, and you can keep working manually.`,
      }];
    } finally {
      state.aiSending = false;
      render();
    }
  };

  const onClick = async (event) => {
    const button = event.target.closest('[data-action], [data-view], [data-global-view], [data-inspiration-tab], [data-packing-area], [data-packing-tab], [data-ai-prompt]');
    if (!button) return;
    if (button.dataset.view) {
      state.view = button.dataset.view;
      state.globalView = '';
      render();
      resetScroll();
      return;
    }
    if (button.dataset.globalView) {
      state.globalView = button.dataset.globalView;
      state.aiOpen = false;
      render();
      resetScroll();
      return;
    }
    if (button.dataset.inspirationTab) {
      state.inspirationTab = button.dataset.inspirationTab;
      render();
      return;
    }
    if (button.dataset.packingTab) {
      state.packingTab = button.dataset.packingTab;
      render();
      return;
    }
    if (button.dataset.packingArea) {
      state.packingArea = button.dataset.packingArea;
      render();
      return;
    }
    if (button.dataset.aiPrompt) {
      await askPlanAi(button.dataset.aiPrompt);
      return;
    }
    const action = button.dataset.action;
    const ws = workspace();
    if (action === 'new-plan') {
      state.globalView = 'home';
      state.aiOpen = false;
      render();
      resetScroll();
    }
    if (action === 'start-plan') choosePlanningMode(button.dataset.planType);
    if (action === 'submit-ai-intake') {
      const input = document.querySelector('#v8-ai-intake-input');
      await submitAiIntake(input?.value);
    }
    if (action === 'edit-plan') editPlan();
    if (action === 'open-profile-details') document.querySelector('#btn-profile')?.click();
    if (action === 'open-settings') document.querySelector('#btn-settings')?.click();
    if (action === 'sign-out') document.querySelector('#btn-signout')?.click();
    if (action === 'open-money' && active()) {
      state.globalView = '';
      state.view = 'money';
      render();
      resetScroll();
    }
    if (action === 'toggle-ai') {
      state.aiOpen = !state.aiOpen;
      render();
    }
    if (action === 'ask-ai') {
      const input = document.querySelector('#v8-ai-input');
      await askPlanAi(input?.value);
    }
    if (action === 'enable-ai') {
      const entry = active();
      const result = await request(`plans/${encodeURIComponent(entry.plan.id)}/document`, {
        method: 'PATCH',
        body: {
          baseRevision: entry.revision,
          clientMutationId: id('enable-ai'),
          operations: [{ type: 'plan.update', patch: { aiMode: 'assist' } }],
        },
      });
      state.plans[state.plans.findIndex((item) => item.plan.id === entry.plan.id)] = result;
      render();
    }
    if (action === 'open-plan') {
      state.activePlanId = button.dataset.id;
      state.globalView = '';
      state.view = 'overview';
      state.aiOpen = false;
      localStorage.setItem('malem.v8.activePlan', state.activePlanId);
      render();
      resetScroll();
    }
    if (action === 'delete-plan') {
      const target = state.plans.find((item) => item.plan.id === button.dataset.id);
      if (target && confirm(`Delete “${target.plan.title}” and its shared planning data?`)) {
        await request(`plans/${encodeURIComponent(target.plan.id)}`, { method: 'DELETE' });
        state.plans = state.plans.filter((item) => item.plan.id !== target.plan.id);
        state.activePlanId = state.plans[0]?.plan.id || '';
        render();
      }
    }
    if (action === 'add-schedule') scheduleModal();
    if (action === 'edit-schedule') scheduleModal(button.dataset.dayId, button.dataset.itemId);
    if (action === 'remove-schedule') {
      const entry = active();
      const result = await request(`plans/${encodeURIComponent(entry.plan.id)}/document`, {
        method: 'PATCH',
        body: {
          baseRevision: entry.revision,
          clientMutationId: id('schedule-remove'),
          operations: [{ type: 'schedule.block.remove', dayId: button.dataset.dayId, blockId: button.dataset.itemId }],
        },
      });
      state.plans[state.plans.findIndex((item) => item.plan.id === entry.plan.id)] = result;
      render();
    }
    if (action === 'add-explore') simpleEntityModal({
      title: 'Save an option', prefix: 'explore', collection: 'calendarEvents',
      fields: (item) => `${field('title', 'Name', item.title, 'text', 'required')}${field('category', 'Category', item.category || 'place')}${field('url', 'Source URL', item.url, 'url')}${textareaField('notes', 'Why it belongs', item.notes)}`,
      prepare: (entity) => { entity.kind = 'explore'; },
    });
    if (action === 'remove-explore') await updateCollection('calendarEvents', (items) => items.filter((item) => item.id !== button.dataset.id), 'Removed a saved option');
    if (action === 'add-booking' || action === 'edit-booking') {
      const current = ws.bookings.find((item) => item.id === button.dataset.id);
      simpleEntityModal({
        title: current ? 'Edit booking' : 'Add booking', prefix: 'booking', collection: 'bookings', current,
        fields: (item) => `${selectField('type', 'Type', item.type || 'flight', ['flight', 'stay', 'venue', 'restaurant', 'transport', 'activity'])}${selectField('status', 'Status', item.status || 'confirmed', ['considering', 'held', 'confirmed', 'cancelled'])}${field('title', 'Booking title', item.title, 'text', 'required')}${field('provider', 'Provider', item.provider)}${field('confirmation', 'Confirmation', item.confirmation)}${field('startAt', 'Starts / check-in', String(item.startAt || '').slice(0, 16), 'datetime-local')}${field('endAt', 'Ends / check-out', String(item.endAt || '').slice(0, 16), 'datetime-local')}${field('location', 'Location', item.location)}${field('url', 'Manage or book URL', item.url, 'url')}${textareaField('notes', 'Details', item.notes)}`,
        after: async (entity) => {
          const reminders = workspace().reminders.filter((item) => item.bookingId !== entity.id);
          if (entity.startAt) {
            const starts = new Date(entity.startAt);
            const dueAt = entity.type === 'flight' && !Number.isNaN(starts.getTime())
              ? new Date(starts.getTime() - 24 * 60 * 60 * 1_000).toISOString()
              : entity.startAt;
            reminders.push({
              id: id('reminder'),
              bookingId: entity.id,
              title: entity.type === 'flight' ? `Check in for ${entity.title}` : `Check details for ${entity.title}`,
              dueAt,
              done: false,
            });
          }
          if (entity.endAt && ['stay', 'venue'].includes(entity.type)) {
            reminders.push({
              id: id('reminder'),
              bookingId: entity.id,
              title: `Check out: ${entity.title}`,
              dueAt: entity.endAt,
              done: false,
            });
          }
          await updateCollection('reminders', () => reminders, `Updated reminders for ${entity.title}`);
        },
      });
    }
    if (action === 'remove-booking') await updateCollection('bookings', (items) => items.filter((item) => item.id !== button.dataset.id), 'Removed a booking');
    if (action === 'add-ticket') {
      const dialog = modal('Add ticket or voucher', 'Ticket wallet', `${field('title', 'Title', '', 'text', 'required')}${field('reference', 'Reference or confirmation')}${field('file', 'Image or PDF', '', 'file', 'accept="image/*,application/pdf"')}${textareaField('notes', 'Notes')}`, async (values) => {
        const file = dialog.querySelector('input[type="file"]').files[0];
        let dataUrl = '';
        if (file) {
          if (file.type.startsWith('image/')) dataUrl = await compressImage(file);
          else if (file.size <= 750_000) dataUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(file);
          });
          else throw new Error('Keep PDF attachments under 750 KB.');
        }
        await updateCollection('ticketWallet', (items) => [...items, { id: id('ticket'), ...values, file: undefined, fileName: file?.name || '', dataUrl, createdAt: nowIso() }], 'Added a ticket to the wallet');
      });
    }
    if (action === 'remove-ticket') await updateCollection('ticketWallet', (items) => items.filter((item) => item.id !== button.dataset.id), 'Removed a ticket from the wallet');
    if (action === 'add-inspiration') {
      const dialog = modal('Add visual inspiration', 'Visionary', `${selectField('kind', 'Board', state.inspirationTab, [{ value: 'outfits', label: 'Outfits' }, { value: 'vibe', label: 'Vibe board' }])}${field('title', 'Title', '', 'text', 'required')}${field('imageUrl', 'Image URL', '', 'url')}${field('imageFile', 'Upload image', '', 'file', 'accept="image/*"')}${textareaField('caption', 'Caption, post idea, or notes')}`, async (values) => {
        const file = dialog.querySelector('input[type="file"]').files[0];
        const image = file ? await compressImage(file) : values.imageUrl;
        await updateCollection('outfits', (items) => [...items, { id: id('inspo'), kind: values.kind, title: values.title, caption: values.caption, image, createdAt: nowIso() }], 'Added visual inspiration');
      });
    }
    if (action === 'remove-inspiration') await updateCollection('outfits', (items) => items.filter((item) => item.id !== button.dataset.id), 'Removed visual inspiration');
    if (action === 'add-packing') {
      const closet = readGlobal('closet');
      simpleEntityModal({
        title: 'Add packing item', prefix: 'pack', collection: 'packingItems',
        fields: (item) => `${selectField('section', 'Section', state.packingTab, [{ value: 'wardrobe', label: 'Wardrobe' }, { value: 'misc', label: 'Miscellaneous' }])}${field('name', 'Item', item.name, 'text', 'required')}${field('quantity', 'Quantity', item.quantity || 1, 'number', 'min="1" max="99"')}${field('category', 'Category', item.category)}${selectField('wardrobeItemId', 'Closet piece', '', [{ value: '', label: 'No linked closet piece' }, ...closet.map((piece) => ({ value: piece.id, label: piece.name }))])}${textareaField('why', 'Why or reminder', item.why)}`,
        prepare: (entity) => { entity.packed = false; entity.quantity = Number(entity.quantity) || 1; },
      });
    }
    if (action === 'toggle-packed') await updateCollection('packingItems', (items) => items.map((item) => item.id === button.dataset.id ? { ...item, packed: button.checked } : item), `${button.checked ? 'Packed' : 'Unpacked'} an item`);
    if (action === 'remove-packing') await updateCollection('packingItems', (items) => items.filter((item) => item.id !== button.dataset.id), 'Removed a packing item');
    if (action === 'save-template') {
      modal('Save packing template', 'Reusable list', `${field('name', 'Template name', `${active()?.plan?.title || 'Personal'} essentials`, 'text', 'required')}${textareaField('description', 'When to use it')}${selectField('autoApply', 'New plans', 'no', [{ value: 'no', label: 'Apply manually' }, { value: 'yes', label: 'Automatically add to every new plan' }])}`, async (values) => {
        const templates = readGlobal('templates');
        const template = { id: id('template'), name: values.name, description: values.description, autoApply: values.autoApply === 'yes', items: workspace().packingItems.map((item) => ({ ...item, id: undefined, packed: false })) };
        templates.push(template);
        saveGlobal('templates', templates);
        state.status = 'Packing template saved';
        render();
      });
    }
    if (action === 'apply-template') {
      const template = readGlobal('templates').find((item) => item.id === button.dataset.id);
      if (template) await updateCollection('packingItems', (items) => [...items, ...template.items.map((item) => ({ ...item, id: id('pack'), packed: false }))], `Applied ${template.name}`);
    }
    if (action === 'remove-template') {
      saveGlobal('templates', readGlobal('templates').filter((item) => item.id !== button.dataset.id));
      render();
    }
    if (action === 'add-closet') {
      const dialog = modal('Add clothing', 'Your closet', `${field('name', 'Article of clothing', '', 'text', 'required')}${selectField('category', 'Category', 'top', ['top', 'bottom', 'dress', 'outerwear', 'shoes', 'accessory', 'activewear', 'swimwear', 'formal', 'other'])}${field('color', 'Color')}${field('season', 'Season')}${field('imageFile', 'Photo', '', 'file', 'accept="image/*"')}${textareaField('notes', 'Fit, fabric, or styling notes')}`, async (values) => {
        const file = dialog.querySelector('input[type="file"]').files[0];
        const image = file ? await compressImage(file) : '';
        const closet = readGlobal('closet');
        const piece = { id: id('closet'), ...values, imageFile: undefined, image, createdAt: nowIso() };
        closet.push(piece);
        saveGlobal('closet', closet);
        state.status = `${piece.name} added to your private closet`;
        render();
      });
    }
    if (action === 'remove-closet') {
      saveGlobal('closet', readGlobal('closet').filter((item) => item.id !== button.dataset.id));
      render();
    }
    if (action === 'add-outfit') {
      const closet = readGlobal('closet');
      modal('Build an outfit', 'Closet', `${field('name', 'Outfit name', '', 'text', 'required')}<div class="v8-field v8-field-wide"><span>Pieces</span><div class="v8-actions">${closet.map((piece) => `<label class="v8-checkbox"><input type="checkbox" name="piece_${piece.id}"/><span>${escapeHtml(piece.name)}</span></label>`).join('') || 'Add clothes first.'}</div></div>${textareaField('notes', 'Occasion or styling notes')}`, async (values) => {
        const selected = closet.filter((piece) => values[`piece_${piece.id}`] === 'on');
        if (!selected.length) throw new Error('Choose at least one closet piece.');
        const outfits = readGlobal('outfits');
        const outfit = { id: id('outfit'), name: values.name, notes: values.notes, pieceIds: selected.map((piece) => piece.id), image: selected.find((piece) => piece.image)?.image || '' };
        outfits.push(outfit);
        saveGlobal('outfits', outfits);
        if (active()) {
          await updateCollection('outfits', (items) => [...items, {
            ...outfit,
            id: id('inspo'),
            kind: 'outfits',
            title: outfit.name,
            caption: outfit.notes,
          }], 'Built an outfit from the closet');
        } else {
          state.status = 'Outfit saved';
          render();
        }
      });
    }
    if (action === 'add-task' || action === 'edit-task') {
      const current = ws.tasks.find((item) => item.id === button.dataset.id);
      simpleEntityModal({
        title: current ? 'Edit task' : 'Add task', prefix: 'task', collection: 'tasks', current,
        fields: (item) => `${field('title', 'Task', item.title, 'text', 'required')}${selectField('assignee', 'Assignee', item.assignee || '', [{ value: '', label: 'Unassigned' }, ...ws.people.map((person) => ({ value: person.name, label: person.name }))])}${field('dueAt', 'Due', String(item.dueAt || '').slice(0, 16), 'datetime-local')}${selectField('status', 'Status', item.status || 'open', ['open', 'in_progress', 'done', 'cancelled'])}${textareaField('notes', 'Notes', item.notes)}`,
      });
    }
    if (action === 'toggle-task') await updateCollection('tasks', (items) => items.map((item) => item.id === button.dataset.id ? { ...item, status: button.checked ? 'done' : 'open' } : item), 'Updated task status');
    if (action === 'remove-task') await updateCollection('tasks', (items) => items.filter((item) => item.id !== button.dataset.id), 'Removed a task');
    if (action === 'add-budget') simpleEntityModal({
      title: 'Add budget', prefix: 'budget', collection: 'budgets',
      fields: (item) => `${field('name', 'Category', item.name || 'Total plan')}${field('amount', 'Amount', item.amount || '', 'number', 'required min="0" step="0.01"')}`,
      prepare: (entity) => { entity.amount = Number(entity.amount) || 0; },
    });
    if (action === 'add-expense') simpleEntityModal({
      title: 'Add expense', prefix: 'expense', collection: 'expenses',
      fields: (item) => `${field('title', 'Expense', item.title, 'text', 'required')}${field('amount', 'Amount', item.amount, 'number', 'required min="0" step="0.01"')}${field('category', 'Category', item.category || 'general')}${selectField('paidBy', 'Paid by', item.paidBy || ws.people[0]?.id || '', ws.people.map((person) => ({ value: person.id, label: person.name })))}${selectField('splitMethod', 'Split', 'equal', [{ value: 'equal', label: 'Equally across everyone' }, { value: 'payer', label: 'Payer only' }])}${textareaField('notes', 'Notes', item.notes)}`,
      prepare: (entity) => {
        entity.amount = Number(entity.amount) || 0;
        entity.splits = entity.splitMethod === 'payer'
          ? [{ personId: entity.paidBy, amount: entity.amount }]
          : ws.people.map((person) => ({ personId: person.id, amount: entity.amount / Math.max(1, ws.people.length) }));
      },
    });
    if (action === 'remove-expense') await updateCollection('expenses', (items) => items.filter((item) => item.id !== button.dataset.id), 'Removed an expense');
    if (action === 'copy-settlement') {
      await navigator.clipboard.writeText(`${button.dataset.name} — ${money(button.dataset.amount)} for ${active().plan.title}`);
      state.status = 'Payment note copied';
      renderStatus();
    }
    if (action === 'confirm-settlement') {
      await updateCollection('settlements', (items) => [...items, {
        id: id('settlement'),
        personId: button.dataset.personId,
        amount: Number(button.dataset.amount),
        status: 'confirmed',
        confirmedBy: state.me?.email || '',
        confirmedAt: nowIso(),
      }], 'Confirmed a settlement');
    }
    if (action === 'add-person' || action === 'edit-person') {
      const current = ws.people.find((item) => item.id === button.dataset.id);
      simpleEntityModal({
        title: current ? 'Edit person' : 'Add person', prefix: 'person', collection: 'people', current,
        fields: (item) => `${field('name', 'Name', item.name, 'text', 'required')}${field('email', 'Email', item.email, 'email')}${selectField('role', 'Role', item.role || 'participant', ['planner', 'participant', 'viewer', 'guest'])}${selectField('rsvp', 'RSVP', item.rsvp || 'invited', ['invited', 'yes', 'no', 'maybe'])}${field('dietary', 'Dietary notes', item.dietary)}${field('accessibility', 'Accessibility notes', item.accessibility)}${selectField('paymentApp', 'Payment app', item.paymentApp || 'venmo', ['venmo', 'zelle', 'cashapp', 'other'])}${field('paymentHandle', 'Payment handle or email', item.paymentHandle)}`,
      });
    }
    if (action === 'create-share-link') modal('Invite a collaborator', 'Secure plan access', `${selectField('role', 'Access', 'planner', [{ value: 'planner', label: 'Planner — can edit' }, { value: 'participant', label: 'Participant — vote and contribute' }, { value: 'viewer', label: 'Viewer — read only' }])}${field('expiresInDays', 'Expires in days', 7, 'number', 'min="1" max="30"')}${field('maxUses', 'Maximum uses', 1, 'number', 'min="1" max="50"')}`, async (values) => {
      const result = await request(`plans/${encodeURIComponent(active().plan.id)}/invites`, {
        method: 'POST',
        body: { role: values.role, expiresInDays: Number(values.expiresInDays), maxUses: Number(values.maxUses) },
      });
      state.shareUrl = result.url;
      await navigator.clipboard.writeText(result.url).catch(() => {});
      state.status = 'Secure invitation link created and copied';
      render();
    }, 'Create invite');
    if (action === 'copy-share-link' && state.shareUrl) {
      await navigator.clipboard.writeText(state.shareUrl);
      state.status = 'Invitation link copied';
      renderStatus();
    }
    if (action === 'remove-person') await updateCollection('people', (items) => items.filter((item) => item.id !== button.dataset.id), 'Removed a person');
    if (action === 'add-poll') modal('Create date poll', 'Availability', `${field('title', 'Poll title', 'Which date works?', 'text', 'required')}${field('option1', 'Option 1', '', 'datetime-local', 'required')}${field('option2', 'Option 2', '', 'datetime-local', 'required')}${field('option3', 'Option 3', '', 'datetime-local')}`, async (values) => {
      const options = [values.option1, values.option2, values.option3].filter(Boolean).map((startsAt) => ({ id: id('date'), startsAt, votes: {} }));
      await updateCollection('datePolls', (items) => [...items, { id: id('poll'), title: values.title, status: 'open', options, createdAt: nowIso() }], 'Created a date poll');
    });
    if (action === 'add-journal-v8') modal('Add a journal note', 'Shared memory', `${field('summary', 'Title', '', 'text', 'required')}${textareaField('notes', 'Note')}`, async (values) => {
      await saveWorkspace({ ...ws, activity: [{ id: id('note'), summary: values.summary, notes: values.notes, actor: state.me?.name || 'You', createdAt: nowIso() }, ...ws.activity] });
    });
    if (action === 'connect-calendar') {
      const current = readGlobal('connections').find((item) => item.provider === 'google-calendar');
      modal('Connect Google Calendar', 'Calendar identity', `${field('email', 'Google account email', current?.email || state.me?.email || '', 'email', 'required')}${selectField('syncDirection', 'Sync preference', current?.syncDirection || 'two-way', [{ value: 'two-way', label: 'Two-way when OAuth is configured' }, { value: 'export', label: 'Export from Malem only' }])}`, async (values) => {
        const connections = readGlobal('connections').filter((item) => item.provider !== 'google-calendar');
        connections.push({ provider: 'google-calendar', ...values, connectedAt: nowIso() });
        saveGlobal('connections', connections);
        render();
      });
    }
    if (action === 'export-calendar') exportCalendar();
  };

  const onChange = async (event) => {
    if (event.target.id === 'v8-plan-select') {
      state.activePlanId = event.target.value;
      state.globalView = '';
      state.view = 'overview';
      localStorage.setItem('malem.v8.activePlan', state.activePlanId);
      render();
      resetScroll();
      return;
    }
    if (event.target.dataset.action === 'vote-date') {
      const ws = workspace();
      const next = ws.datePolls.map((poll) => poll.id !== event.target.dataset.pollId ? poll : {
        ...poll,
        options: poll.options.map((option) => option.id !== event.target.dataset.optionId ? option : {
          ...option,
          votes: { ...(option.votes || {}), [state.me.email]: event.target.value },
        }),
      });
      await updateCollection('datePolls', () => next, 'Voted on a date');
    }
  };

  document.addEventListener('click', (event) => {
    if (event.target.closest(rootSelector)) onClick(event).catch((error) => {
      state.status = error.message;
      renderStatus();
    });
  });
  document.addEventListener('change', (event) => {
    if (event.target.closest(rootSelector)) onChange(event).catch((error) => {
      state.status = error.message;
      renderStatus();
    });
  });
  window.addEventListener('hashchange', () => {
    document.querySelector('#screen-app')?.classList.toggle(
      'v8-active',
      (location.hash || '').startsWith('#/plans'),
    );
  });

  return { render };
})();

window.MalemV8 = MalemV8;
