/* Menu Mingguan — web prototype.
   Data comes from data.js (window.APP_DATA), built by tools/build_data.py.
   State is kept in localStorage so the plan and shopping list survive reloads. */
(function () {
  'use strict';

  // ---------- Data ----------
  const D = window.APP_DATA;
  const ING = {};
  D.ingredients.forEach((i) => { ING[i.id] = i; });
  const R = D.recipes;
  const MAINS = D.menus.mains;
  const SIDES = D.menus.sides;
  const KIDS = D.menus.kids;
  const MAIN = {}; MAINS.forEach((m) => { MAIN[m.id] = m; });
  const SIDE = {}; SIDES.forEach((s) => { SIDE[s.id] = s; });
  const KID = {}; KIDS.forEach((k) => { KID[k.id] = k; });
  const editOf = (id) => (id && typeof S !== 'undefined' && S.menuEdits && S.menuEdits[id]) || null;
  const nameOf = (id) => (editOf(id) && editOf(id).name) || (MAIN[id] || SIDE[id] || KID[id] || R[id] || ideaById(id) || { name: id }).name;
  // Menus the user made (catalog additions and "Untuk nanti" ideas) live in S.ideas and sync with it.
  function ideaById(id) {
    if (!id || typeof S === 'undefined') return null;
    return (S.ideas || []).find((x) => x.id === id) || null;
  }
  /** ★ "Untuk nanti": user menus flagged `later`. */
  const isIdea = (id) => { const x = ideaById(id); return !!(x && x.later !== false); };

  // ---------- Catalog: every menu with its effective name / type / audience ----------
  // type: main | side · audience: adult | kid. Built-in menus can be edited (S.menuEdits) or hidden from random picks.
  function menuInfo(id) {
    let base = null;
    if (MAIN[id]) base = { id, name: MAIN[id].name, type: 'main', audience: 'adult', source: MAIN[id].source, builtin: true };
    else if (SIDE[id]) base = { id, name: SIDE[id].name, type: 'side', audience: 'adult', source: 'user', builtin: true };
    else if (KID[id]) base = { id, name: KID[id].name, type: 'main', audience: 'kid', source: 'kid', builtin: true };
    else {
      const x = ideaById(id);
      if (!x) return null;
      return { id, name: x.name, type: x.type === 'side' ? 'side' : 'main', audience: x.audience === 'kid' ? 'kid' : 'adult', source: 'mine', builtin: false, later: x.later !== false, hidden: !!x.hidden, hasRecipe: (x.ingredients || []).length > 0 || (x.steps || []).length > 0 };
    }
    const e = editOf(id) || {};
    return Object.assign(base, {
      name: e.name || base.name, type: e.type || base.type, audience: e.audience || base.audience,
      hidden: !!e.hidden, edited: !!(e.name || e.ingredients || e.steps || e.type || e.audience), later: false, hasRecipe: true
    });
  }
  function allMenus() {
    const ids = MAINS.map((m) => m.id).concat(SIDES.map((s) => s.id), KIDS.map((k) => k.id), (typeof S !== 'undefined' && S.ideas || []).map((x) => x.id));
    return ids.map(menuInfo).filter(Boolean);
  }
  // Pools used when menus are picked at random (hidden and ★-later menus excluded; ★ ones join via "Sertakan menu untuk nanti").
  const adultMains = () => allMenus().filter((m) => m.type === 'main' && m.audience === 'adult' && !m.hidden && !m.later);
  const adultSides = () => allMenus().filter((m) => m.type === 'side' && m.audience === 'adult' && !m.hidden && !m.later);
  const kidPool = () => allMenus().filter((m) => m.audience === 'kid' && !m.hidden);
  const menuExists = (id) => !!menuInfo(id);
  const laterCount = () => (typeof S !== 'undefined' && S.ideas || []).filter((x) => x.later !== false).length;

  const DAY_NAMES = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
  const DAY_SHORT = ['SEN', 'SEL', 'RAB', 'KAM', 'JUM', 'SAB', 'MIN'];
  const DAY_LABEL = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const CATS = [
    { id: 'protein', label: 'Protein' },
    { id: 'sayur', label: 'Sayur' },
    { id: 'bumbu', label: 'Bumbu' },
    { id: 'misc', label: 'Misc' }
  ];

  // ---------- Persistent state ----------
  const KEY = 'menuMingguan.v1';
  function defaults() {
    return {
      // Menus per week, keyed by the Monday: { 'YYYY-MM-DD': { weekStart, days: [{mainId|null, sideId|null, kidId, done}] } }
      // mainId null = empty day. kidId: null = same as adults, '' = no kids menu, id = own kids menu.
      plans: {},
      shoppingByWeek: {},      // { 'YYYY-MM-DD': { shoppingKey: true } } bought / already in stock
      menuEdits: {},           // built-in menu id -> {name?, type?, audience?, ingredients?, steps?, hidden?}
      favorites: D.menus.favorites.filter((id) => MAIN[id]).map((id) => id + '|' + MAIN[id].defaultSideId),
      kidOverrides: {},        // mainId -> bool (user's own "ramah anak" marks)
      preferFav: true,
      ideas: [],               // "Untuk nanti": [{id, name, type: main|side, kidFriendly, source, url, ingredients[], steps[], createdAt}]
      includeIdeas: true,      // put up to 2 ★ ideas into a new week
      updatedAt: 0            // ms timestamp of the last local change (for sync)
    };
  }
  /** Older versions kept one `plan` + `shopping`; move them into the per-week maps. */
  function migrate(s) {
    // User menus: older ideas were all "untuk nanti"; quick names from "Pilih sendiri" become plain catalog menus.
    s.ideas = (s.ideas || []).map((x) => Object.assign({ later: true, audience: 'adult' }, x));
    (s.customMenus || []).forEach((c) => {
      if (s.ideas.some((x) => x.id === c.id)) return;
      s.ideas.push({ id: c.id, name: c.name, type: c.kind === 'side' ? 'side' : 'main', audience: c.kind === 'kid' ? 'kid' : 'adult', later: false, source: 'custom', ingredients: [], steps: [], createdAt: Date.now() });
    });
    delete s.customMenus;
    s.menuEdits = s.menuEdits || {};
    s.plans = s.plans || {};
    s.shoppingByWeek = s.shoppingByWeek || {};
    if (s.plan && s.plan.weekStart) {
      if (!s.plans[s.plan.weekStart]) s.plans[s.plan.weekStart] = s.plan;
      if (s.shopping && !s.shoppingByWeek[s.plan.weekStart]) s.shoppingByWeek[s.plan.weekStart] = s.shopping;
    }
    delete s.plan;
    delete s.shopping;
    return s;
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return migrate(Object.assign(defaults(), JSON.parse(raw)));
    } catch (e) { /* storage unavailable: start fresh */ }
    return defaults();
  }
  function save(opts) {
    const fromRemote = !!(opts && opts.remote);
    if (!fromRemote) S.updatedAt = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ }
    if (!fromRemote) schedulePush();
  }
  const S = load();

  // ---------- Family sync (see sync.js) ----------
  const SYNC_KEY = 'menuMingguan.syncCode';
  const sync = { code: null, status: 'off', error: null, available: null, reason: null };
  try { sync.code = localStorage.getItem(SYNC_KEY); } catch (e) { /* ignore */ }
  function setSyncCode(code) {
    sync.code = code;
    try { if (code) localStorage.setItem(SYNC_KEY, code); else localStorage.removeItem(SYNC_KEY); } catch (e) { /* ignore */ }
  }
  const syncReady = () => !!(window.MenuSync && window.MenuSync.available && sync.code);
  let pushTimer = null;
  function schedulePush() {
    if (!syncReady()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      pushTimer = null;
      window.MenuSync.push(sync.code, S).catch((err) => { sync.status = 'error'; sync.error = String(err.message || err); renderIfSync(); });
    }, 500);
  }
  function replaceState(next) {
    Object.keys(S).forEach((k) => { delete S[k]; });
    Object.assign(S, defaults(), next);
    migrate(S);
  }
  function applyRemote(state) {
    if (pushTimer || (state.updatedAt || 0) < (S.updatedAt || 0)) {
      schedulePush(); // this device has newer changes (e.g. made offline): send them
      return;
    }
    replaceState(state);
    save({ remote: true });
    render();
  }
  function renderIfSync() { if (ui.view && ui.view.type === 'sync') render(); }
  function startSync() {
    if (!syncReady()) return;
    window.MenuSync.listen(sync.code, {
      onRemote: applyRemote,
      onStatus: (status, err) => { sync.status = status; sync.error = err ? String(err.message || err) : null; renderIfSync(); }
    });
  }
  function newFamilyCode() {
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = new Uint8Array(20);
    crypto.getRandomValues(bytes);
    let s = '';
    bytes.forEach((b, i) => { if (i && i % 5 === 0) s += '-'; s += A[b % A.length]; });
    return s;
  }
  const normCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/(.{5})(?=.)/g, '$1-');
  window.addEventListener('menusync-ready', () => {
    sync.available = !!window.MenuSync.available;
    sync.reason = window.MenuSync.reason || null;
    if (sync.available && sync.code) { sync.status = 'connecting'; startSync(); }
    render();
  });

  // ---------- Transient UI state ----------
  const ui = {
    tab: 'home',          // home | shop | fav
    view: null,           // null | {type:'detail', day} | {type:'fav', key} | {type:'reorder', order, moved}
    sheet: null,          // null | {step, days, have}
    detailTab: 'main',
    shopHide: false,
    favQuery: '',
    expanded: {},         // "scope:ingredientId" -> accordion open in a shopping list
    week: thisMonday(),   // week shown on Home (and used by detail / reorder / Belanja)
    picker: null,         // {kind: main|side|kid, day, query} — "Pilih sendiri" in step 1
    toast: null
  };

  // ---------- Helpers ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const r = Math.floor(Math.random() * (i + 1));
      [a[i], a[r]] = [a[r], a[i]];
    }
    return a;
  }
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const isKidOk = (mainId) => {
    if (!mainId) return false;
    if (mainId in S.kidOverrides) return S.kidOverrides[mainId];
    const info = menuInfo(mainId);
    if (info && info.audience === 'kid') return true;
    if (MAIN[mainId]) return !!MAIN[mainId].kidFriendly;
    const idea = ideaById(mainId);
    return !!(idea && idea.kidFriendly);
  };
  const mainSource = (id) => (MAIN[id] ? MAIN[id].source : isIdea(id) ? 'idea' : 'user');
  const favKey = (mainId, sideId) => mainId + '|' + sideId;
  const isFav = (mainId, sideId) => S.favorites.includes(favKey(mainId, sideId));
  const favMainIds = () => S.favorites.map((k) => k.split('|')[0]).filter(menuExists);

  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function parseIso(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  /** Monday of the current week, as YYYY-MM-DD. */
  function thisMonday() {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    t.setDate(t.getDate() - ((t.getDay() + 6) % 7));
    return iso(t);
  }
  function addWeeks(weekIso, n) { const d = parseIso(weekIso); d.setDate(d.getDate() + 7 * n); return iso(d); }
  function weekOffset(weekIso) { return Math.round((parseIso(weekIso) - parseIso(thisMonday())) / (7 * 86400000)); }
  function weekLabel(weekIso) {
    const n = weekOffset(weekIso);
    return n === 0 ? 'Minggu Ini' : n === 1 ? 'Minggu Depan' : n === -1 ? 'Minggu Lalu' : n > 1 ? n + ' Minggu Lagi' : n * -1 + ' Minggu Lalu';
  }
  /** Weeks shown on Home: last week (if planned), this week, next week, every planned future week, plus one more to prepare. */
  function weekPages() {
    const cur = thisMonday();
    const set = new Set([cur, addWeeks(cur, 1)]);
    if (S.plans[addWeeks(cur, -1)]) set.add(addWeeks(cur, -1));
    Object.keys(S.plans).forEach((w) => { if (w > cur) set.add(w); });
    const last = [...set].sort().pop();
    if (S.plans[last] && weekOffset(last) < 4) set.add(addWeeks(last, 1));
    return [...set].sort();
  }
  const planOf = (week) => S.plans[week] || null;
  const shopOf = (week) => S.shoppingByWeek[week] || (S.shoppingByWeek[week] = {});
  /** The week the Belanja tab shows: the one on Home if it has a menu, else the nearest planned week. */
  function shopWeek() {
    if (planOf(ui.week)) return ui.week;
    const weeks = Object.keys(S.plans).sort();
    return weeks.find((w) => w >= thisMonday()) || weeks.pop() || null;
  }
  function weekDates(startIso) {
    const s = parseIso(startIso);
    return DAY_NAMES.map((_, i) => { const d = new Date(s); d.setDate(s.getDate() + i); return d; });
  }
  function rangeLabel(startIso) {
    const ds = weekDates(startIso);
    const a = ds[0], b = ds[6];
    return a.getMonth() === b.getMonth()
      ? `${a.getDate()}–${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`
      : `${a.getDate()} ${MONTHS[a.getMonth()]} – ${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
  }
  function todayIndex(startIso) {
    const t = iso(new Date());
    return weekDates(startIso).findIndex((d) => iso(d) === t);
  }

  const FRACTIONS = { 0.25: '¼', 0.5: '½', 0.75: '¾' };
  function fmtQty(q, unit) {
    if (q == null) return 'secukupnya';
    if (unit === 'g' && q >= 1000) return fmtNum(Math.round(q / 100) / 10) + ' kg';
    if (unit === 'ml' && q >= 1000) return fmtNum(Math.round(q / 100) / 10) + ' liter';
    if (unit === 'g' || unit === 'ml') return Math.round(q) + ' ' + unit;
    return fmtNum(q) + ' ' + unit;
  }
  function fmtNum(n) {
    const whole = Math.floor(n);
    const frac = Math.round((n - whole) * 100) / 100;
    if (FRACTIONS[frac]) return (whole ? whole + ' ' : '') + FRACTIONS[frac];
    return String(Math.round(n * 10) / 10).replace('.', ',');
  }

  // ---------- Icons (inline stroke SVG) ----------
  const P = {
    cal: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    bag: '<path d="M5 8h14l-1.2 12H6.2z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    shuffle: '<path d="M16 3h5v5"/><path d="M4 20L21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    left: '<path d="M15 5l-7 7 7 7"/>',
    right: '<path d="M9 5l7 7-7 7"/>',
    up: '<path d="M6 15l6-6 6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    sort: '<path d="M7 4v16M7 4L4 7M7 4l3 3"/><path d="M17 20V4M17 20l-3-3M17 20l3-3"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/>',
    kid: '<circle cx="12" cy="12" r="8.5"/><path d="M9 14.5a3.5 3.5 0 0 0 6 0"/><path d="M9.5 10h.01M14.5 10h.01"/>',
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
    book: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
    reset: '<path d="M4 11a8 8 0 1 1 2.3 5.7"/><path d="M4 4v7h7"/>',
    cloud: '<path d="M7 18.5a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 11a3.75 3.75 0 0 1-.5 7.5z"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
    share: '<path d="M12 15V4M8 8l4-4 4 4"/><path d="M5 12v6.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V12"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7"/><path d="M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16l-5-5-8.5 8.5"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>',
    pencil: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'
  };
  const icon = (name, size = 20, extra = '') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${P[name]}</svg>`;
  const grip = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
  const smallHeart = `<svg width="14" height="14" viewBox="0 0 24 24" fill="var(--heart)" stroke="var(--heart)" stroke-width="2" stroke-linejoin="round" role="img" aria-label="Favorit" style="flex-shrink:0">${P.heart}</svg>`;
  const STAR_PATH = '<path d="M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.85L12 16.9l-5.25 2.75 1-5.85L3.5 9.7l5.9-.9z"/>';
  const star = (size = 14) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="var(--star)" stroke="var(--star)" stroke-width="1.5" stroke-linejoin="round" role="img" aria-label="Menu untuk nanti" style="flex-shrink:0">${STAR_PATH}</svg>`;
  const starIf = (id, size) => (isIdea(id) ? star(size) : '');

  // ---------- Menu generation ----------
  function uniqueSide(preferred, used) {
    if (preferred && !used.includes(preferred) && menuExists(preferred)) return preferred;
    const all = adultSides().map((s) => s.id);
    const free = all.filter((id) => !used.includes(id));
    return free.length ? pick(free) : (preferred || pick(all));
  }
  function freshKid(used) {
    const all = kidPool().map((k) => k.id);
    const free = all.filter((id) => !used.includes(id));
    return pick(free.length ? free : all);
  }
  function generateDays() {
    // Up to 2 "untuk nanti" ideas join the week (main ideas as mains, side ideas as sides).
    const later = (S.ideas || []).filter((x) => x.later !== false && x.audience !== 'kid' && !x.hidden);
    const ideas = S.includeIdeas ? shuffle(later).slice(0, 2) : [];
    const ideaMains = ideas.filter((x) => x.type !== 'side').map((x) => x.id);
    const ideaSides = ideas.filter((x) => x.type === 'side').map((x) => x.id);
    const mains = adultMains();
    const picks = [];
    const add = (id) => { if (!picks.includes(id)) picks.push(id); };
    ideaMains.forEach(add);
    if (S.preferFav) shuffle(favMainIds().filter((id) => mains.some((m) => m.id === id))).slice(0, 3).forEach((id) => { if (picks.length < 7) add(id); });
    shuffle(mains.filter((m) => m.source !== 'online').map((m) => m.id)).forEach((id) => { if (picks.length < 6) add(id); });
    shuffle(mains.map((m) => m.id)).forEach((id) => { if (picks.length < 7) add(id); });
    const usedSides = [];
    const kidMenus = shuffle(kidPool().map((k) => k.id));
    const days = shuffle(picks).map((id, i) => {
      const preferred = MAIN[id] ? MAIN[id].defaultSideId : null;
      const sideId = uniqueSide(preferred, usedSides);
      usedSides.push(sideId);
      return { mainId: id, sideId, kidMenuId: kidMenus[i % kidMenus.length] };
    });
    shuffle(days.map((_, i) => i)).slice(0, ideaSides.length).forEach((dayIndex, k) => { days[dayIndex].sideId = ideaSides[k]; });
    return days;
  }
  function rerollDay(days, i) {
    const used = days.map((d) => d.mainId);
    const fromUser = Math.random() < 0.75;
    const mains = adultMains();
    let pool = mains.filter((m) => !used.includes(m.id) && (fromUser ? m.source !== 'online' : m.source === 'online'));
    if (!pool.length) pool = mains.filter((m) => !used.includes(m.id));
    const m = pick(pool);
    if (!m) return;
    const usedSides = days.filter((_, k) => k !== i).map((d) => d.sideId);
    days[i] = Object.assign({}, days[i], { mainId: m.id, sideId: uniqueSide(MAIN[m.id] ? MAIN[m.id].defaultSideId : null, usedSides) });
  }
  function rerollKid(days, i) {
    const used = days.filter((d, k) => k !== i && !isKidOk(d.mainId)).map((d) => d.kidMenuId);
    used.push(days[i].kidMenuId);
    days[i] = Object.assign({}, days[i], { kidMenuId: freshKid(used) });
  }
  function rerollSide(days, i) {
    // Swap only the side dish: never the current one, never one already used this week.
    const used = days.map((d) => d.sideId);
    const all = adultSides().map((s) => s.id);
    const pool = all.filter((id) => !used.includes(id));
    const fallback = all.filter((id) => id !== days[i].sideId);
    const next = pick(pool.length ? pool : fallback);
    if (next) days[i] = Object.assign({}, days[i], { sideId: next });
  }
  /** Kids menu of a draft day: none (emptied), pick (chosen by hand), same (eats the adult menu) or auto (random kids menu). */
  function kidState(d) {
    if (d.kidMode === 'none') return { kind: 'none' };
    if (d.kidMode === 'pick' && d.kidPickId) return { kind: 'pick', id: d.kidPickId };
    if (d.mainId && isKidOk(d.mainId)) return { kind: 'same' };
    return { kind: 'auto', id: d.kidMenuId };
  }
  const kidIdFor = (d) => { const k = kidState(d); return k.kind === 'none' ? '' : k.kind === 'same' ? null : k.id; };

  // ---------- Recipes (catalog or idea) as uniform rows ----------
  // row.key is the shopping-list id: a vocabulary id when known, otherwise "x:<name>".
  function ideaStyleRows(list) {
    return (list || []).map((i) => {
      const v = i.vocabId && ING[i.vocabId];
      return {
        key: v ? v.id : 'x:' + i.name.toLowerCase(),
        name: v ? v.name : i.name,
        label: i.name,
        category: v ? v.category : (i.category || 'misc'),
        qty: v && typeof i.qty === 'number' ? i.qty : null,
        unit: v ? v.unit : null,
        qtyText: i.qtyText || 'secukupnya',
        note: i.note,
        pantry: v ? !!v.pantry : false
      };
    });
  }
  function recipeRows(rid) {
    const r = R[rid];
    const e = editOf(rid);
    if (r && e && (e.ingredients || e.steps)) {
      // A built-in recipe the user changed: their ingredients / steps replace the original.
      const base = recipeRows.original(rid);
      return Object.assign({}, base, {
        name: nameOf(rid), edited: true,
        steps: e.steps || base.steps,
        rows: e.ingredients ? ideaStyleRows(e.ingredients) : base.rows
      });
    }
    if (r) {
      const base = recipeRows.original(rid);
      return e && e.name ? Object.assign({}, base, { name: e.name }) : base;
    }
    const x = ideaById(rid);
    if (!x) return null;
    return { name: x.name, type: x.type, servings: null, timeMinutes: null, steps: x.steps || [], idea: x, rows: ideaStyleRows(x.ingredients) };
  }
  /** The bundled recipe, ignoring the user's edits. */
  recipeRows.original = function (rid) {
    const r = R[rid];
    if (!r) return null;
    return {
      name: r.name, type: r.type, servings: r.servings, timeMinutes: r.timeMinutes, steps: r.steps,
      rows: r.ingredients.filter((i) => ING[i.id]).map((i) => {
        const q = typeof i.qty === 'number' ? i.qty : null;
        return { key: i.id, name: ING[i.id].name, label: ING[i.id].name, category: ING[i.id].category, qty: q, unit: ING[i.id].unit, qtyText: fmtQty(q, ING[i.id].unit), note: i.note, pantry: !!ING[i.id].pantry };
      })
    };
  };

  // ---------- Shopping list ----------
  function buildShopping(days) {
    const map = {};
    days.forEach((d, i) => {
      const parts = [[d.mainId, DAY_LABEL[i]], [d.sideId, DAY_LABEL[i]], [d.kidId, 'Anak ' + DAY_LABEL[i]]];
      parts.forEach(([rid, label], p) => {
        const r = rid && recipeRows(rid);
        if (!r) return;
        r.rows.forEach((row) => {
          const e = map[row.key] || (map[row.key] = { id: row.key, name: row.name, category: row.category, unit: row.unit, pantry: row.pantry, qty: 0, hasQty: false, extra: [], uses: [], details: [] });
          if (row.qty != null && row.unit) { e.qty += row.qty; e.hasQty = true; if (!e.unit) e.unit = row.unit; }
          else if (row.qtyText && row.qtyText !== 'secukupnya') e.extra.push(row.qtyText);
          if (!e.uses.includes(label)) e.uses.push(label);
          e.details.push({ day: DAY_NAMES[i], dish: r.name, role: p === 0 ? 'Utama' : p === 1 ? 'Pendamping' : 'Anak', qty: row.qtyText, idea: !!r.idea });
        });
      });
    });
    return CATS.map((c) => {
      const items = Object.values(map)
        .filter((e) => e.category === c.id)
        .map((e) => {
          const parts = (e.hasQty ? [fmtQty(e.qty, e.unit)] : []).concat(e.extra);
          return {
            id: e.id,
            name: e.name,
            pantry: e.pantry,
            qty: parts.join(' + ') || 'secukupnya',
            use: e.uses.length >= 6 ? 'hampir semua menu' : e.uses.join(', '),
            details: e.details
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'id'));
      return Object.assign({}, c, { items });
    });
  }
  const planDaysForShopping = (days) => days.map((d) => ({ mainId: d.mainId, sideId: d.sideId, kidId: d.kidId }));

  // ---------- Rendering ----------
  const app = document.getElementById('app');

  function render() {
    const scrolls = {};
    app.querySelectorAll('[data-scroll]').forEach((el) => { scrolls[el.dataset.scroll] = el.scrollTop; });
    let html;
    if (ui.view && ui.view.type === 'detail') html = viewDetail();
    else if (ui.view && ui.view.type === 'fav') html = viewFavDetail();
    else if (ui.view && ui.view.type === 'reorder') html = viewReorder();
    else if (ui.view && ui.view.type === 'sync') html = viewSync();
    else if (ui.view && (ui.view.type === 'idea' || ui.view.type === 'menu')) html = viewMenu();
    else html = (ui.tab === 'home' ? viewHome() : ui.tab === 'shop' ? viewShop() : viewFav()) + tabbar();
    if (ui.sheet) html += viewSheet();
    if (ui.ideaSheet) html += viewIdeaSheet();
    if (ui.picker) html += viewPicker();
    if (ui.toast) html += `<div class="toast" role="status">${esc(ui.toast.text)}${ui.toast.undo ? ' · <button class="text-btn small" style="color:#fff;text-decoration:underline" data-act="undo">Urungkan</button>' : ''}</div>`;
    const focused = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.keepFocus;
    const caret = focused ? document.activeElement.selectionStart : null;
    app.innerHTML = html;
    app.querySelectorAll('[data-scroll]').forEach((el) => { if (scrolls[el.dataset.scroll] != null) el.scrollTop = scrolls[el.dataset.scroll]; });
    if (focused) {
      const el = app.querySelector(`[data-keep-focus="${focused}"]`);
      if (el) { el.focus(); try { el.setSelectionRange(caret, caret); } catch (e) { /* not a text field */ } }
    }
    bindWeekPager();
  }

  // Horizontal week pager: keep the page in view across re-renders, follow swipes.
  function bindWeekPager() {
    const pager = app.querySelector('[data-hscroll="weeks"]');
    if (!pager) return;
    const pages = pager.dataset.pages.split(',');
    const idx = Math.max(0, pages.indexOf(ui.week));
    const jump = () => { pager.scrollLeft = idx * pager.clientWidth; };
    if (ui.scrollToWeek) {
      ui.scrollToWeek = false;
      pager.scrollTo({ left: idx * pager.clientWidth, behavior: 'smooth' });
    } else {
      jump();
    }
    let t = null;
    pager.addEventListener('scroll', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const i = Math.round(pager.scrollLeft / pager.clientWidth);
        if (pages[i] && pages[i] !== ui.week) { ui.week = pages[i]; render(); }
      }, 140);
    }, { passive: true });
  }

  function toast(text, undo) {
    ui.toast = { text, undo };
    render();
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { ui.toast = null; render(); }, undo ? 5000 : 2500);
  }

  function tabbar() {
    const left = shopWeek() ? countLeft(shopWeek()) : 0;
    const tab = (id, ic, label, extra = '') =>
      `<button type="button" data-act="tab" data-tab="${id}" ${ui.tab === id ? 'aria-current="page"' : ''}>${ic}${label}${extra}</button>`;
    return `<nav class="tabbar" aria-label="Navigasi utama">
      ${tab('home', icon('cal', 24), 'Minggu Ini')}
      ${tab('shop', icon('bag', 24), 'Belanja', left ? `<span class="count" aria-label="${left} belum dibeli">${left}</span>` : '')}
      ${tab('fav', icon('book', 24), 'Katalog')}
    </nav>`;
  }

  function countLeft(week) {
    const p = planOf(week);
    if (!p) return 0;
    const have = shopOf(week);
    let left = 0;
    buildShopping(planDaysForShopping(p.days)).forEach((c) => c.items.forEach((it) => { if (!have[it.id]) left++; }));
    return left;
  }
  const kidLine = (d) => (d.kidId === '' ? 'tidak ada' : d.kidId ? esc(nameOf(d.kidId)) : d.mainId ? 'sama' : '—');

  // Home: one page per week, swipe horizontally ------------------------------
  function viewHome() {
    const pages = weekPages();
    if (!pages.includes(ui.week)) ui.week = thisMonday();
    const idx = pages.indexOf(ui.week);
    return `<section class="screen">
      <div class="weeks" data-hscroll="weeks" data-pages="${pages.join(',')}" aria-roledescription="carousel" aria-label="Menu per minggu">
        ${pages.map((w, i) => `<section class="week-page" data-week="${w}" aria-label="${weekLabel(w)}" ${i === idx ? '' : 'aria-hidden="true"'}>${weekPage(w, pages, i)}</section>`).join('')}
      </div>
    </section>`;
  }

  function weekHeader(w, pages, i, actions) {
    const dots = pages.map((p, k) => `<span class="${k === i ? 'on' : ''}"></span>`).join('');
    return `<header class="page-head week-head">
        <div class="week-top">
          <div class="week-nav">
            <button type="button" class="icon-btn" data-act="week-go" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Minggu sebelumnya">${icon('left', 18, 'stroke-width="2.4"')}</button>
            <p class="eyebrow">${rangeLabel(w)}</p>
            <button type="button" class="icon-btn" data-act="week-go" data-dir="1" ${i === pages.length - 1 ? 'disabled' : ''} aria-label="Minggu berikutnya">${icon('right', 18, 'stroke-width="2.4"')}</button>
          </div>
          <div class="week-actions">${actions}</div>
        </div>
        <h1>${weekLabel(w)}</h1>
        <div class="dots" aria-hidden="true">${dots}</div>
      </header>`;
  }

  function weekPage(w, pages, i) {
    const p = planOf(w);
    if (!p) return weekEmpty(w, pages, i);
    const dates = weekDates(w);
    const ti = todayIndex(w);
    const cooking = p.days.filter((d) => d.mainId);
    const done = cooking.filter((d) => d.done).length;
    const cats = buildShopping(planDaysForShopping(p.days));
    const have = shopOf(w);
    let total = 0, bought = 0;
    cats.forEach((c) => c.items.forEach((it) => { total++; if (have[it.id]) bought++; }));
    const rows = p.days.map((d, k) => {
      const dayCol = `<span class="day-col ${k === ti ? 'today' : ''}"><span class="dn">${DAY_SHORT[k]}</span><span class="dd">${dates[k].getDate()}</span></span><span class="vline" aria-hidden="true"></span>`;
      if (!d.mainId) {
        return `<li class="card menu-card empty-row ${k === ti ? 'is-today' : ''}" style="padding:10px 12px;gap:12px">${dayCol}
          <span class="names"><span class="main" style="color:var(--muted)"><span>Hari kosong</span></span><span class="side">Tidak masak${d.kidId ? '' : ''}</span>${d.kidId ? `<span class="kidline">Anak: ${kidLine(d)}</span>` : ''}</span></li>`;
      }
      const fav = isFav(d.mainId, d.sideId);
      return `<li class="card menu-card ${k === ti ? 'is-today' : ''} ${d.done ? 'done' : ''}" style="padding:6px 6px 6px 12px;gap:10px">
        <button type="button" class="row-link" data-act="open-day" data-i="${k}" data-week="${w}">
          ${dayCol}
          <span class="names">
            ${k === ti ? '<span class="today-tag">Hari ini</span>' : ''}
            <span class="main"><span>${esc(nameOf(d.mainId))}</span>${starIf(d.mainId)}</span>
            ${d.sideId ? `<span class="side">+ ${esc(nameOf(d.sideId))} ${starIf(d.sideId, 12)}</span>` : ''}
            <span class="kidline">Anak: ${kidLine(d)}</span>
          </span>
        </button>
        <button type="button" class="heart-btn" data-act="fav-day" data-i="${k}" data-week="${w}" aria-pressed="${fav}" aria-label="${fav ? 'Hapus dari favorit' : 'Tambah ke favorit'}: ${esc(nameOf(d.mainId))}">${icon('heart')}</button>
        <button type="button" class="check-btn" data-act="done-day" data-i="${k}" data-week="${w}" aria-pressed="${!!d.done}" aria-label="${d.done ? 'Batalkan tanda sudah dimasak' : 'Tandai sudah dimasak'}: ${DAY_NAMES[k]}"><span class="ring">${d.done ? icon('check', 16, 'stroke-width="3"') : ''}</span></button>
      </li>`;
    }).join('');
    const actions = `${cloudButton()}
          <button type="button" class="icon-btn round" data-act="new-plan" data-week="${w}" aria-label="Buat ulang menu ${weekLabel(w).toLowerCase()}">${icon('spark')}</button>
          <button type="button" class="pill-btn" data-act="reorder" data-week="${w}">${icon('sort', 18)}Atur</button>`;
    return `${weekHeader(w, pages, i, actions)}
      <div class="stats">
        <div class="card stat">
          <span class="label">Sudah dimasak</span>
          <span class="value">${done}<small> / ${cooking.length}</small></span>
          <div class="bar" role="progressbar" aria-label="Progres memasak" aria-valuemin="0" aria-valuemax="${cooking.length}" aria-valuenow="${done}"><span style="width:${cooking.length ? Math.round(done / cooking.length * 100) : 0}%"></span></div>
        </div>
        <button type="button" class="card stat" data-act="shop-week" data-week="${w}">
          <span class="label">Daftar belanja ${icon('right', 14)}</span>
          <span class="value">${total - bought}<small> lagi</small></span>
          <span class="bar" aria-hidden="true"><span style="width:${total ? Math.round(bought / total * 100) : 0}%"></span></span>
        </button>
      </div>
      <ul class="scroll list" data-scroll="home-${w}" style="padding:14px 16px 16px">${rows}</ul>`;
  }

  function weekEmpty(w, pages, i) {
    const n = weekOffset(w);
    const favs = S.favorites.slice(0, 2).map((k) => {
      const [m, s] = k.split('|');
      return `<button type="button" class="card" data-act="open-fav" data-key="${esc(k)}" style="padding:14px;display:flex;flex-direction:column;gap:6px;text-align:left">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--heart)" stroke="var(--heart)" stroke-width="2" aria-hidden="true">${P.heart}</svg>
        <span style="font-size:14px;font-weight:700">${esc(nameOf(m))}</span>
        <span style="font-size:12px;color:var(--muted)">+ ${esc(nameOf(s))}</span>
      </button>`;
    }).join('');
    return `${weekHeader(w, pages, i, cloudButton())}
      <div class="scroll" data-scroll="empty-${w}">
        <section class="card empty">
          <div class="ico">${icon('cal', 26)}</div>
          <div style="display:flex;flex-direction:column;gap:8px">
            <h2>Belum ada menu untuk ${weekLabel(w).toLowerCase()}</h2>
            <p>${n > 0 ? 'Siapkan dari sekarang: 7 set menu rumahan, menu anak, dan daftar belanjanya.' : 'Buat 7 set menu rumahan — satu lauk utama dan satu pendamping per hari, plus menu anak — lengkap dengan daftar belanjanya.'}</p>
          </div>
          <ol class="steps-mini">
            <li><span>1</span>Pilih 7 set menu yang cocok</li>
            <li><span>2</span>Cek daftar belanja per kategori</li>
            <li><span>3</span>Konfirmasi, lalu mulai masak</li>
          </ol>
          <button type="button" class="btn primary block" data-act="new-plan" data-week="${w}">${icon('spark')}${n > 0 ? 'Siapkan Menu ' + weekLabel(w) : 'Buat Menu 7 Hari'}</button>
        </section>
        ${favs ? `<section style="margin:28px 20px 20px;display:flex;flex-direction:column;gap:12px">
          <div style="display:flex;align-items:baseline;justify-content:space-between"><h2 style="font-size:17px">Dari favoritmu</h2><button type="button" class="text-btn small accent" data-act="tab" data-tab="fav">Lihat semua</button></div>
          <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">${favs}</div>
        </section>` : ''}
        <p class="hint" style="justify-content:center;margin:0 20px 20px">Geser ke kiri atau kanan untuk melihat minggu lain.</p>
      </div>`;
  }

  // Shopping tab ------------------------------------------------------
  function viewShop() {
    const w = shopWeek();
    if (!w) {
      return `<section class="screen"><header class="page-head"><div><p class="eyebrow">Belum ada menu</p><h1>Belanja</h1></div></header>
        <div class="card empty"><div class="ico">${icon('bag', 26)}</div><h2>Daftar belanja masih kosong</h2>
        <p>Daftar belanja dibuat otomatis dari 7 menu yang kamu pilih, dan tetap tersimpan di sini per minggu.</p>
        <button type="button" class="btn primary block" data-act="new-plan" data-week="${ui.week}">${icon('spark')}Buat Menu 7 Hari</button></div></section>`;
    }
    const plan = planOf(w);
    const have = shopOf(w);
    const cats = buildShopping(planDaysForShopping(plan.days));
    let total = 0, bought = 0;
    cats.forEach((c) => c.items.forEach((it) => { total++; if (have[it.id]) bought++; }));
    const planned = Object.keys(S.plans).filter((x) => x >= addWeeks(thisMonday(), -1)).sort();
    const weekChips = planned.length > 1
      ? `<div class="chips" role="tablist" aria-label="Pilih minggu" style="padding:12px 20px 0">${planned.map((x) =>
          `<button type="button" role="tab" class="chip week-chip" aria-selected="${x === w}" data-act="shop-week" data-week="${x}" data-stay="1">${weekLabel(x)} <span>${countLeft(x)}</span></button>`).join('')}</div>`
      : '';
    return `<section class="screen">
      <header class="page-head"><div><p class="eyebrow">${weekLabel(w)} · ${rangeLabel(w)}</p><h1>Belanja</h1></div></header>
      ${weekChips}
      <div class="card" style="margin:14px 20px 0;padding:14px 16px;display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
          <b style="font-size:14px">${bought} dari ${total} sudah dibeli</b>
          <button type="button" class="text-btn small accent" style="margin:-12px -8px" data-act="shop-hide" aria-pressed="${ui.shopHide}">${ui.shopHide ? 'Tampilkan semua' : 'Sembunyikan yang dibeli'}</button>
        </div>
        <div class="bar" role="progressbar" aria-label="Progres belanja" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${bought}"><span style="width:${total ? Math.round(bought / total * 100) : 0}%"></span></div>
      </div>
      ${shoppingBody(cats, have, 'shop', ui.shopHide, 'toggle-shop')}
    </section>`;
  }

  function shoppingBody(cats, checkedMap, scrollKey, hideChecked, act) {
    const chips = cats.map((c) => {
      const left = c.items.filter((it) => !checkedMap[it.id]).length;
      return `<button type="button" class="chip" data-act="jump" data-target="${scrollKey}-${c.id}">${c.label} <span>${left}</span></button>`;
    }).join('');
    const sections = cats.map((c) => {
      const rows = c.items.filter((it) => !(hideChecked && checkedMap[it.id]));
      const left = c.items.filter((it) => !checkedMap[it.id]).length;
      const list = rows.length
        ? `<div class="card check-list"><div>${rows.map((it) => {
            const on = !!checkedMap[it.id];
            const key = scrollKey + ':' + it.id;
            const open = !!ui.expanded[key];
            const details = open ? `<ul class="usage" id="use-${esc(key)}">${it.details.map((u) =>
              `<li><span class="u-day">${u.day}</span><span class="u-dish">${esc(u.dish)}<small class="${u.role === 'Anak' ? 'kid' : ''}">${u.role}</small></span><span class="u-qty">${esc(u.qty)}</span></li>`).join('')}</ul>` : '';
            return `<div class="check-item ${on ? 'checked' : ''} ${open ? 'open' : ''}">
              <div class="ci-row">
                <label class="ci-box"><input type="checkbox" data-act="${act}" data-id="${it.id}" ${on ? 'checked' : ''}><span class="sr-only">${act === 'toggle-have' ? 'Sudah ada' : 'Sudah dibeli'}: ${esc(it.name)}</span></label>
                <button type="button" class="ci-toggle" data-act="expand" data-key="${esc(key)}" aria-expanded="${open}" aria-controls="use-${esc(key)}">
                  <span class="nm"><b>${esc(it.name)}${it.pantry ? '<span class="pantry-tag">stok dapur</span>' : ''}</b><small>untuk ${esc(it.use)}</small></span>
                  <span class="qty">${esc(it.qty)}</span>
                  <span class="chev" aria-hidden="true">${icon('down', 16, 'stroke-width="2.4"')}</span>
                </button>
              </div>${details}
            </div>`;
          }).join('')}</div></div>`
        : `<p class="empty-cat">Semua ${c.label.toLowerCase()} sudah ${act === 'toggle-have' ? 'ada' : 'dibeli'}</p>`;
      return `<section class="cat" id="${scrollKey}-${c.id}">
        <div class="cat-head"><h3>${c.label}</h3><span>${left} lagi</span></div>${list}
      </section>`;
    }).join('');
    return `<div style="padding:12px 16px 6px"><div class="chips">${chips}</div></div>
      <div class="scroll" data-scroll="${scrollKey}" style="padding:4px 16px 20px;display:flex;flex-direction:column;gap:18px">${sections}</div>`;
  }

  // Favorites tab ------------------------------------------------------
  // Katalog tab: every menu, plus Favorit and ★ Untuk nanti -------------------------------
  const TYPE_LABEL = (m) => (m.type === 'side' ? 'Pendamping' : 'Menu utama');
  const AUD_LABEL = (m) => (m.audience === 'kid' ? 'Anak' : 'Dewasa');

  function catalogShell(seg, body, count) {
    const later = laterCount();
    return `<section class="screen" style="position:relative">
      <header class="page-head"><div><p class="eyebrow">${count}</p><h1>Katalog</h1></div></header>
      <div class="segmented" role="tablist" aria-label="Bagian katalog" style="grid-template-columns:repeat(3,minmax(0,1fr));margin:16px 20px 0">
        <button type="button" role="tab" aria-selected="${seg === 'all'}" data-act="fav-seg" data-seg="all">Semua</button>
        <button type="button" role="tab" aria-selected="${seg === 'fav'}" data-act="fav-seg" data-seg="fav">Favorit <small>${S.favorites.length}</small></button>
        <button type="button" role="tab" aria-selected="${seg === 'later'}" data-act="fav-seg" data-seg="later">${star(13)} Nanti <small>${later}</small></button>
      </div>
      ${body}
      <button type="button" class="fab" data-act="menu-new" data-later="${seg === 'later'}" aria-label="${seg === 'later' ? 'Tambah ide menu untuk nanti' : 'Tambah menu ke katalog'}">${icon('plus', 26, 'stroke-width="2.4"')}</button>
    </section>`;
  }

  function viewFav() {
    const seg = ui.favSeg || 'all';
    if (seg === 'later') return viewLater();
    if (seg === 'all') return viewCatalogAll();
    const q = ui.favQuery.trim().toLowerCase();
    const items = S.favorites.filter((k) => {
      if (!q) return true;
      const [m, s] = k.split('|');
      return (nameOf(m) + ' ' + nameOf(s)).toLowerCase().includes(q);
    });
    const list = items.map((k) => {
      const [m, s] = k.split('|');
      const r = R[m];
      return `<li class="card fav-card">
        <button type="button" class="row-link" data-act="open-fav" data-key="${esc(k)}">
          <span style="font-size:15px;font-weight:700">${esc(nameOf(m))}</span>
          <span style="font-size:13px;color:var(--muted)">+ ${esc(nameOf(s))}</span>
          ${r ? `<span class="t">${icon('clock', 14)}${r.timeMinutes} mnt</span>` : ''}
        </button>
        <button type="button" class="icon-btn" style="border-radius:22px;background:var(--heart-soft);color:var(--heart)" data-act="unfav" data-key="${esc(k)}" aria-label="Hapus dari favorit: ${esc(nameOf(m))}">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" aria-hidden="true">${P.heart}</svg>
        </button>
      </li>`;
    }).join('');
    return catalogShell('fav', `
      <div style="padding:14px 20px 0">
        <label for="cari" class="sr-only">Cari favorit</label>
        <div class="search">${icon('search', 18)}<input id="cari" type="search" placeholder="Cari favorit: rawon, soto…" value="${esc(ui.favQuery)}" data-act="fav-search" autocomplete="off"></div>
      </div>
      <ul class="scroll list" data-scroll="fav" style="padding:16px 16px 96px">
        ${list || `<li class="empty-cat">${q ? 'Tidak ada favorit yang cocok.' : 'Belum ada favorit. Ketuk ♥ pada menu untuk menyimpannya di sini.'}</li>`}
      </ul>`, `${S.favorites.length} set menu favorit`);
  }

  function menuBadges(m) {
    return [
      m.source === 'online' ? '<span class="badge-online">Online</span>' : '',
      !m.builtin ? '<span class="badge-online mine">Milikmu</span>' : '',
      m.edited ? '<span class="badge-online">Diubah</span>' : '',
      m.hidden ? '<span class="badge-online">Tidak diacak</span>' : ''
    ].join('');
  }

  function viewCatalogAll() {
    const filter = ui.catFilter || 'all';
    const q = (ui.catQuery || '').trim().toLowerCase();
    const menus = allMenus();
    const byFilter = (m) => filter === 'all' || (filter === 'kid' ? m.audience === 'kid' : m.audience === 'adult' && m.type === filter);
    const rows = menus.filter(byFilter).filter((m) => !q || m.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'id'));
    const count = (f) => menus.filter((m) => f === 'all' || (f === 'kid' ? m.audience === 'kid' : m.audience === 'adult' && m.type === f)).length;
    const chip = (f, label) => `<button type="button" role="tab" class="chip week-chip" aria-selected="${filter === f}" data-act="cat-filter" data-filter="${f}">${label} <span>${count(f)}</span></button>`;
    const list = rows.map((m) => `<li class="card fav-card">
        <button type="button" class="row-link" data-act="open-menu" data-id="${esc(m.id)}">
          <span class="cat-name">${m.later ? star(14) : ''}<span>${esc(m.name)}</span>${favMainIds().includes(m.id) ? smallHeart : ''}${menuBadges(m)}</span>
          <span class="t">${TYPE_LABEL(m)} · <span style="${m.audience === 'kid' ? 'color:var(--kid);font-weight:700' : ''}">${AUD_LABEL(m)}</span>${m.audience === 'adult' && isKidOk(m.id) ? ' · ramah anak' : ''}${m.hasRecipe ? '' : ' · belum ada resep'}</span>
        </button>
      </li>`).join('');
    return catalogShell('all', `
      <div style="padding:14px 20px 0;display:flex;flex-direction:column;gap:10px">
        <label for="cat-q" class="sr-only">Cari menu</label>
        <div class="search">${icon('search', 18)}<input id="cat-q" type="search" placeholder="Cari menu di katalog…" value="${esc(ui.catQuery || '')}" data-act="cat-search" data-keep-focus="cat" autocomplete="off"></div>
        <div class="chips" role="tablist" aria-label="Saring menu">${chip('all', 'Semua')}${chip('main', 'Utama')}${chip('side', 'Pendamping')}${chip('kid', 'Anak')}</div>
      </div>
      <ul class="scroll list" data-scroll="catalog" style="padding:14px 16px 96px">
        ${list || `<li class="empty-cat">Tidak ada menu yang cocok${q ? ` dengan “${esc(ui.catQuery.trim())}”` : ''}.</li>`}
      </ul>`, `${menus.length} menu · lihat, tambah, dan ubah resep`);
  }

  function viewLater() {
    const ideas = (S.ideas || []).filter((x) => x.later !== false);
    const SRC = { image: 'Dari screenshot', web: 'Dari website', manual: 'Ditulis manual', custom: 'Nama saja' };
    const list = ideas.map((x) => `<li class="card fav-card">
        <button type="button" class="row-link" data-act="open-menu" data-id="${esc(x.id)}">
          <span style="font-size:15px;font-weight:700;display:flex;align-items:center;gap:6px">${star(15)}${esc(x.name)}</span>
          <span class="t">${x.type === 'side' ? 'Pendamping' : 'Menu utama'} · ${x.audience === 'kid' ? '<span style="color:var(--kid)">Anak</span>' : 'Dewasa'}${SRC[x.source] ? ' · ' + SRC[x.source] : ''}${x.audience !== 'kid' && x.kidFriendly ? ' · <span style="color:var(--kid)">ramah anak</span>' : ''}</span>
          <span class="t">${(x.ingredients || []).length} bahan · ${(x.steps || []).length} langkah</span>
        </button>
      </li>`).join('');
    return catalogShell('later', `
      <ul class="scroll list" data-scroll="later" style="padding:16px 16px 96px">
        ${ideas.length ? `<li class="hint" style="padding:0 4px 4px">${star(14)}<span>Menu ★ ikut dipilih saat kamu membuat menu mingguan baru (bisa dimatikan di langkah 1).</span></li>` + list
          : `<li class="card empty" style="margin:0"><div class="ico" style="background:var(--star-soft);color:var(--star)">${star(26)}</div>
              <h2>Simpan ide menu untuk nanti</h2>
              <p>Ketuk tombol + untuk menambah resep dari screenshot, dari website seperti cookpad, atau tulis sendiri.</p></li>`}
      </ul>`, `${ideas.length} ide menu untuk dicoba`);
  }

  // Menu detail (any catalog menu) -----------------------------------------
  function viewMenu() {
    const id = ui.view.id;
    const m = menuInfo(id);
    if (!m) { ui.view = null; return viewFav() + tabbar(); }
    const x = ideaById(id);
    const foot = !m.builtin
      ? `<button type="button" class="btn secondary block" style="color:var(--heart)" data-act="idea-delete" data-id="${esc(id)}">Hapus menu</button>`
      : m.edited ? `<button type="button" class="btn secondary block" data-act="menu-reset" data-id="${esc(id)}">${icon('reset', 18)}Kembalikan resep asli</button>` : '';
    return `<section class="screen">
      <header class="nav-head">
        <button type="button" class="text-btn accent" data-act="back">${icon('left', 22)}Katalog</button>
        <button type="button" class="text-btn accent" data-act="menu-edit" data-id="${esc(id)}">${icon('pencil', 18)}Ubah</button>
      </header>
      <div class="scroll" data-scroll="menu-${esc(id)}" style="padding:8px 20px 24px;display:flex;flex-direction:column;gap:16px">
        <div class="detail-title">
          <p class="kicker">${m.later ? `<span style="color:var(--star-ink)">${star(14)} Untuk nanti</span> · ` : ''}${TYPE_LABEL(m)} · <span style="${m.audience === 'kid' ? 'color:var(--kid)' : ''}">${AUD_LABEL(m)}</span></p>
          <h1>${esc(m.name)}</h1>
          <p style="display:flex;gap:6px;flex-wrap:wrap">${menuBadges(m)}${m.audience === 'adult' && isKidOk(id) ? '<span class="badge-online" style="color:var(--kid);border-color:var(--kid-line)">Ramah anak</span>' : ''}</p>
        </div>
        <div class="card" style="padding:4px 0">
          <button type="button" class="switch-row plain" role="switch" aria-checked="${!m.hidden}" data-act="menu-hidden" data-id="${esc(id)}">
            ${icon('shuffle', 18, 'style="flex-shrink:0;color:var(--accent)"')}<span class="txt"><b>Ikut diacak</b><small>${m.hidden ? 'Tidak dipilih saat acak, tapi tetap bisa dipilih sendiri' : 'Bisa terpilih saat membuat menu mingguan'}</small></span><span class="switch" aria-hidden="true"></span>
          </button>
          ${!m.builtin ? `<button type="button" class="switch-row plain" role="switch" aria-checked="${m.later}" data-act="menu-later" data-id="${esc(id)}">
            ${star(18)}<span class="txt"><b>Untuk nanti</b><small>Prioritas saat membuat menu baru (maks. 2 per minggu)</small></span><span class="switch" aria-hidden="true"></span>
          </button>` : ''}
        </div>
        ${recipeBlock(id)}
      </div>
      ${foot ? `<div class="sheet-foot">${foot}</div>` : ''}
    </section>`;
  }

  // Add-idea sheet ---------------------------------------------------------
  function viewIdeaSheet() {
    const sh = ui.ideaSheet;
    const titles = { choose: sh.later ? 'Tambah menu untuk nanti' : 'Tambah menu', image: 'Dari screenshot', web: 'Dari website', edit: sh.editingId ? 'Ubah menu' : 'Periksa & simpan' };
    let body = '';
    let foot = '';
    if (sh.step === 'choose') {
      const opt = (act, ic, t, d) => `<button type="button" class="card option" data-act="${act}"><span class="ico">${ic}</span><span class="txt"><b>${t}</b><small>${d}</small></span>${icon('right', 18)}</button>`;
      body = `<div class="sheet-body">
        <p class="hint" style="font-size:14px">Pilih cara menambahkan resep. Hasilnya bisa kamu periksa dan rapikan sebelum disimpan.</p>
        ${opt('idea-pick-image', icon('image', 22), 'Dari screenshot', 'Pilih gambar resep, teksnya dibaca otomatis')}
        ${opt('idea-web', icon('link', 22), 'Dari website', 'Tempel link dan teks resep, misalnya dari cookpad')}
        ${opt('idea-manual', icon('pencil', 22), 'Isi manual', 'Tulis judul, bahan, dan cara memasak')}
      </div>`;
    } else if (sh.step === 'image') {
      const pct = Math.round((sh.progress || 0) * 100);
      body = `<div class="sheet-body">
        ${sh.preview ? `<img src="${sh.preview}" alt="Screenshot yang dipilih" class="ocr-preview">` : ''}
        ${sh.error
          ? `<p class="note kid">${esc(sh.error)}</p><button type="button" class="btn secondary block" data-act="idea-pick-image">Pilih gambar lain</button>`
          : `<p style="font-size:14px;font-weight:700">${sh.progressLabel || 'Membaca teks dari gambar…'} ${pct ? pct + '%' : ''}</p>
             <div class="bar" role="progressbar" aria-label="Membaca gambar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>
             <p class="hint" style="padding:0">Pertama kali butuh internet untuk mengunduh pembaca teks (sekitar 10 MB). Proses berjalan di HP, gambar tidak diunggah ke mana pun.</p>`}
      </div>`;
    } else if (sh.step === 'web') {
      body = `<div class="sheet-body">
        <p class="hint" style="font-size:14px;padding:0">Buka resepnya di Safari, pilih semua teks (judul, bahan, langkah), salin, lalu tempel di bawah. Aplikasi tidak bisa mengambil halaman website secara langsung.</p>
        <label class="label" for="idea-url">Link resep (opsional)</label>
        <input id="idea-url" class="field" type="url" inputmode="url" placeholder="https://cookpad.com/id/resep/…" value="${esc(sh.url || '')}">
        <label class="label" for="idea-paste">Teks resep</label>
        <textarea id="idea-paste" class="field" rows="10" placeholder="Tempel teks resep di sini">${esc(sh.paste || '')}</textarea>
      </div>`;
      foot = `<button type="button" class="btn secondary" data-act="idea-back">Kembali</button><button type="button" class="btn primary grow" data-act="idea-parse-web">Baca teks ${icon('right', 18)}</button>`;
    } else {
      const d = sh.draft;
      body = `<div class="sheet-body">
        ${sh.note ? `<p class="note">${icon('info', 18, 'style="flex-shrink:0;color:var(--accent)"')}<span>${esc(sh.note)}</span></p>` : ''}
        <label class="label" for="idea-title">Judul masakan</label>
        <input id="idea-title" class="field" type="text" placeholder="Misalnya: Ayam Bumbu Rujak" value="${esc(d.name)}">
        <span class="label">Menu untuk</span>
        <div class="segmented" role="radiogroup" aria-label="Peruntukan menu" style="grid-template-columns:repeat(2,minmax(0,1fr))">
          <button type="button" role="radio" aria-checked="${d.audience !== 'kid'}" aria-selected="${d.audience !== 'kid'}" data-act="idea-aud" data-aud="adult">Dewasa</button>
          <button type="button" role="radio" class="kid" aria-checked="${d.audience === 'kid'}" aria-selected="${d.audience === 'kid'}" data-act="idea-aud" data-aud="kid">${icon('kid', 16, 'style="vertical-align:-3px"')} Anak</button>
        </div>
        ${d.audience === 'kid'
          ? '<p class="hint" style="padding:0;font-size:12px">Menu anak dipakai sebagai menu khusus anak saat membuat menu mingguan.</p>'
          : `<span class="label">Jenis</span>
        <div class="segmented" role="radiogroup" aria-label="Jenis menu" style="grid-template-columns:repeat(2,minmax(0,1fr))">
          <button type="button" role="radio" aria-checked="${d.type !== 'side'}" aria-selected="${d.type !== 'side'}" data-act="idea-type" data-type="main">Menu utama</button>
          <button type="button" role="radio" aria-checked="${d.type === 'side'}" aria-selected="${d.type === 'side'}" data-act="idea-type" data-type="side">Pendamping</button>
        </div>
        <button type="button" class="switch-row" role="switch" aria-checked="${!!d.kidFriendly}" data-act="idea-kid">
          ${icon('kid', 18, 'style="flex-shrink:0;color:var(--kid)"')}<span class="txt"><b>Ramah anak</b><small>Anak ikut makan menu ini</small></span><span class="switch" aria-hidden="true"></span>
        </button>`}
        ${sh.builtinId ? '' : `<button type="button" class="switch-row" role="switch" aria-checked="${!!d.later}" data-act="idea-later">
          ${star(18)}<span class="txt"><b>Simpan juga ke Untuk nanti</b><small>Diutamakan saat membuat menu mingguan baru</small></span><span class="switch" aria-hidden="true"></span>
        </button>`}
        ${sh.builtinId ? '<p class="note" style="font-size:12px">' + icon('info', 16, 'style="flex-shrink:0;color:var(--accent)"') + '<span>Ini menu bawaan. Perubahanmu disimpan sebagai versi milikmu dan bisa dikembalikan ke resep asli kapan saja.</span></p>' : ''}
        <label class="label" for="idea-ings">Bahan-bahan <small>(satu bahan per baris, contoh: 500 gr ayam)</small></label>
        <textarea id="idea-ings" class="field" rows="8" placeholder="500 gr ayam&#10;5 butir bawang merah&#10;2 sdm kecap manis">${esc(d.ingredientsText)}</textarea>
        <label class="label" for="idea-steps">Cara memasak <small>(satu langkah per baris)</small></label>
        <textarea id="idea-steps" class="field" rows="7" placeholder="Haluskan bumbu.&#10;Tumis hingga harum.">${esc(d.stepsText)}</textarea>
        ${sh.builtinId ? '' : `<label class="label" for="idea-src">Link resep (opsional)</label>
        <input id="idea-src" class="field" type="url" inputmode="url" placeholder="https://…" value="${esc(d.url || '')}">`}
      </div>`;
      foot = `<button type="button" class="btn secondary" data-act="${sh.editingId ? 'idea-close' : 'idea-back'}">${sh.editingId ? 'Batal' : 'Kembali'}</button><button type="button" class="btn primary grow" data-act="idea-save">${d.later ? star(16) + ' Simpan ke Untuk nanti' : icon('check', 18, 'stroke-width="2.6"') + 'Simpan menu'}</button>`;
    }
    const anim = sh.fresh ? ' anim' : '';
    sh.fresh = false;
    return `<div class="sheet-wrap${anim}"><section class="sheet" role="dialog" aria-modal="true" aria-labelledby="idea-sheet-title">
      <div class="grabber" aria-hidden="true"></div>
      <div class="sheet-head">
        <button type="button" class="icon-btn" data-act="idea-close" aria-label="Tutup">${icon('x', 22, 'stroke-width="2.2"')}</button>
        <h1 id="idea-sheet-title">${titles[sh.step]}</h1>
        <span class="step"></span>
      </div>
      ${body}${foot ? `<div class="sheet-foot">${foot}</div>` : ''}
    </section></div>`;
  }

  // Detail (day of plan) ------------------------------------------------
  function recipeBlock(rid) {
    const r = recipeRows(rid);
    if (!r) return `<p class="empty-cat">Resep untuk ${esc(nameOf(rid))} belum tersedia.</p>`;
    const groups = CATS.map((c) => {
      const items = r.rows.filter((row) => row.category === c.id);
      if (!items.length) return '';
      return `<div class="card ing-group">
        <p style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)">${c.id === 'misc' ? 'Lainnya' : c.label}</p>
        <ul style="display:flex;flex-direction:column;gap:6px">${items.map((row) =>
          `<li><b>${esc(row.label)}${row.note ? ` <em>· ${esc(row.note)}</em>` : ''}</b><span>${esc(row.qtyText)}</span></li>`).join('')}</ul>
      </div>`;
    }).join('');
    const sub = r.idea && !isIdea(rid)
      ? 'Menu pilihanmu sendiri — belum ada resepnya'
      : r.idea
        ? `Menu untuk nanti${r.idea.url ? ` · <a href="${esc(r.idea.url)}" target="_blank" rel="noopener">resep asli</a>` : ''}`
        : `Untuk ${r.servings} porsi${r.type === 'kid' ? ' anak' : ''}`;
    return `<section style="display:flex;flex-direction:column;gap:10px"><h2 class="h2">Bahan · ${esc(r.name)}</h2>
        <p style="font-size:13px;color:var(--muted)">${sub}</p>${groups || '<p class="empty-cat">Belum ada bahan.</p>'}</section>
      <section style="display:flex;flex-direction:column;gap:12px"><h2 class="h2">Langkah memasak</h2>
        ${r.steps.length ? `<ol class="steps">${r.steps.map((s, i) => `<li><span class="n">${i + 1}</span><p>${esc(s)}</p></li>`).join('')}</ol>` : '<p class="empty-cat">Belum ada langkah.</p>'}</section>`;
  }

  function tabsFor(set) {
    const tabs = [['main', 'Utama'], ['side', 'Pendamping']];
    if (set.kidId) tabs.push(['kid', 'Anak']);
    if (!tabs.some((t) => t[0] === ui.detailTab)) ui.detailTab = 'main';
    return `<div class="segmented" role="tablist" aria-label="Bagian set menu" style="grid-template-columns:repeat(${tabs.length},minmax(0,1fr))">
      ${tabs.map(([id, label]) => `<button type="button" role="tab" class="${id === 'kid' ? 'kid' : ''}" aria-selected="${ui.detailTab === id}" data-act="detail-tab" data-tab="${id}">${label}</button>`).join('')}
    </div>`;
  }

  function viewDetail() {
    const i = ui.view.day;
    const w = ui.view.week;
    const plan = planOf(w);
    if (!plan || !plan.days[i] || !plan.days[i].mainId) { ui.view = null; return viewHome() + tabbar(); }
    const d = plan.days[i];
    const date = weekDates(w)[i];
    const ti = todayIndex(w);
    const fav = isFav(d.mainId, d.sideId);
    const rid = ui.detailTab === 'side' ? d.sideId : ui.detailTab === 'kid' ? d.kidId : d.mainId;
    const totalTime = (R[d.mainId] ? R[d.mainId].timeMinutes : 0);
    return `<section class="screen">
      <header class="nav-head">
        <button type="button" class="text-btn accent" data-act="back">${icon('left', 22)}${weekLabel(w)}</button>
        <button type="button" class="icon-btn" style="border-radius:22px;background:${fav ? 'var(--heart-soft)' : '#fff'};color:var(--heart)" data-act="fav-day" data-i="${i}" aria-pressed="${fav}" aria-label="${fav ? 'Hapus dari favorit' : 'Tambah ke favorit'}">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="${fav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" aria-hidden="true">${P.heart}</svg>
        </button>
      </header>
      <div class="scroll" data-scroll="detail-${i}-${ui.detailTab}" style="padding:8px 20px 24px;display:flex;flex-direction:column;gap:18px">
        <div class="detail-title">
          <p class="kicker">${DAY_NAMES[i]}, ${date.getDate()} ${MONTHS[date.getMonth()]}${i === ti ? ' · Hari ini' : ''}</p>
          <h1>${esc(nameOf(d.mainId))} ${starIf(d.mainId, 22)}</h1>
          <p class="sub">+ ${esc(nameOf(d.sideId))} ${starIf(d.sideId, 14)}</p>
          <p class="kidsub">Anak: ${d.kidId ? esc(nameOf(d.kidId)) : 'sama'}</p>
        </div>
        <div class="meta">
          ${totalTime ? `<span>${icon('clock', 16)}${totalTime} mnt</span>` : ''}
          <span>${icon('people', 16)}4 porsi</span>
        </div>
        ${tabsFor(d)}
        ${ui.detailTab === 'kid' ? `<p class="note kid">${esc(nameOf(d.mainId))} kurang cocok untuk anak, jadi anak dibuatkan 1 menu utama sendiri.</p>` : ''}
        ${recipeBlock(rid)}
      </div>
      <div class="sheet-foot">
        <button type="button" class="btn block ${d.done ? 'done' : 'primary'}" data-act="done-day" data-i="${i}" aria-pressed="${!!d.done}">${icon('check', 18, 'stroke-width="2.6"')}${d.done ? 'Sudah dimasak' : 'Tandai sudah dimasak'}</button>
      </div>
    </section>`;
  }

  function viewFavDetail() {
    const [m, s] = ui.view.key.split('|');
    const set = { mainId: m, sideId: s, kidId: null };
    const rid = ui.detailTab === 'side' ? s : m;
    const fav = S.favorites.includes(ui.view.key);
    return `<section class="screen">
      <header class="nav-head">
        <button type="button" class="text-btn accent" data-act="back">${icon('left', 22)}Kembali</button>
        <span></span>
      </header>
      <div class="scroll" data-scroll="favd-${ui.detailTab}" style="padding:8px 20px 24px;display:flex;flex-direction:column;gap:18px">
        <div class="detail-title">
          <p class="kicker">Set menu favorit</p>
          <h1>${esc(nameOf(m))}</h1>
          <p class="sub">+ ${esc(nameOf(s))}</p>
        </div>
        ${tabsFor(set)}
        ${recipeBlock(rid)}
      </div>
      <div class="sheet-foot">
        <button type="button" class="btn block ${fav ? 'secondary' : 'primary'}" data-act="toggle-fav-key" data-key="${esc(ui.view.key)}">${fav ? 'Hapus dari favorit' : 'Simpan ke favorit'}</button>
      </div>
    </section>`;
  }

  // Reorder -----------------------------------------------------------
  function viewReorder() {
    const order = ui.view.order;
    const plan = planOf(ui.view.week);
    const dates = weekDates(ui.view.week);
    const rows = order.map((d, pos) => `<li class="reorder-row" data-pos="${pos}">
        <span class="day-col"><span class="dn">${DAY_SHORT[pos]}</span><span class="dd">${dates[pos].getDate()}</span></span>
        <span class="card reorder-card ${ui.view.moved === d ? 'moved' : ''}" data-card="${pos}">
          <span class="grip" data-grip="${pos}" aria-hidden="true">${grip}</span>
          <span class="names">${d.mainId
            ? `<span class="main"><span>${esc(nameOf(d.mainId))}</span></span>${d.sideId ? `<span class="side">+ ${esc(nameOf(d.sideId))}</span>` : ''}`
            : '<span class="main" style="color:var(--muted)"><span>Hari kosong</span></span>'}</span>
          <button type="button" class="arrow-btn" data-act="move" data-pos="${pos}" data-dir="-1" ${pos === 0 ? 'disabled' : ''} aria-label="Pindah ${esc(nameOf(d.mainId))} ke ${pos ? DAY_NAMES[pos - 1] : ''}">${icon('up', 20, 'stroke-width="2.2"')}</button>
          <button type="button" class="arrow-btn" data-act="move" data-pos="${pos}" data-dir="1" ${pos === 6 ? 'disabled' : ''} aria-label="Pindah ${esc(nameOf(d.mainId))} ke ${pos < 6 ? DAY_NAMES[pos + 1] : ''}">${icon('down', 20, 'stroke-width="2.2"')}</button>
        </span>
      </li>`).join('');
    const changed = order.some((d, i) => d !== plan.days[i]);
    return `<section class="screen">
      <header class="nav-head">
        <button type="button" class="text-btn" data-act="back">Batal</button>
        <h1>Atur Urutan</h1>
        <button type="button" class="text-btn accent strong" data-act="save-order">Selesai</button>
      </header>
      <p class="note" style="margin:8px 20px 0;font-size:13px">${icon('info', 18, 'style="flex-shrink:0;color:var(--accent)"')}<span>Tahan pegangan lalu geser, atau ketuk panah. Hari tetap di tempatnya — yang berpindah hanya menunya.</span></p>
      <ul class="scroll" data-scroll="reorder" id="reorder-list" style="padding:16px 16px 0;display:flex;flex-direction:column;gap:8px">${rows}</ul>
      <div style="padding:12px 20px calc(20px + var(--safe-bottom));display:flex;justify-content:center">
        <button type="button" class="text-btn small" style="color:var(--muted)" data-act="reset-order" ${changed ? '' : 'disabled'}>${icon('reset', 18)}Kembalikan ke urutan awal</button>
      </div>
    </section>`;
  }

  // Family sync ---------------------------------------------------------
  const SYNC_LABEL = {
    off: 'Belum tersambung',
    connecting: 'Menghubungkan…',
    synced: 'Tersinkron',
    saving: 'Menyimpan perubahan…',
    offline: 'Offline — perubahan dikirim saat online',
    missing: 'Kode tidak ditemukan',
    error: 'Gagal sinkron'
  };

  function cloudButton() {
    const on = !!sync.code;
    return `<button type="button" class="icon-btn round cloud-btn ${on ? 'on' : ''}" data-act="open-sync" aria-label="Sinkron keluarga${on ? ': ' + SYNC_LABEL[sync.status] : ''}">${icon('cloud')}${on ? '<span class="dot" aria-hidden="true"></span>' : ''}</button>`;
  }

  function viewSync() {
    let body;
    if (sync.available === null) {
      body = '<p class="hint">Menyiapkan sinkron…</p>';
    } else if (!sync.available) {
      body = `<div class="note">${icon('info', 18, 'style="flex-shrink:0;color:var(--accent)"')}<span>${sync.reason === 'not-configured'
        ? '<strong>Sinkron belum diaktifkan</strong>Proyek Firebase belum dihubungkan ke aplikasi ini.'
        : '<strong>Sinkron tidak bisa dimuat</strong>Periksa koneksi internet, lalu buka ulang aplikasi.'}</span></div>`;
    } else if (sync.code) {
      const st = sync.status;
      body = `<section class="card sync-card">
          <p class="sync-status ${st}"><span class="dot" aria-hidden="true"></span>${SYNC_LABEL[st] || st}${st === 'error' && sync.error ? ` <small>(${esc(sync.error)})</small>` : ''}</p>
          <div><p class="label">Kode keluarga</p><p class="code" aria-label="Kode keluarga ${esc(sync.code.split('').join(' '))}">${esc(sync.code)}</p></div>
          <div class="sync-actions">
            <button type="button" class="btn secondary grow" data-act="sync-copy">${icon('copy', 18)}Salin kode</button>
            <button type="button" class="btn primary grow" data-act="sync-share">${icon('share', 18)}Bagikan link</button>
          </div>
        </section>
        <p class="hint">${icon('info', 18, 'style="flex-shrink:0"')}<span>Di device lain, buka aplikasi ini → ikon awan → <b>Sambungkan</b> dengan kode di atas, atau buka link yang dibagikan. Semua device akan melihat menu, daftar belanja, dan favorit yang sama. Bagikan kode hanya ke keluarga.</span></p>
        <button type="button" class="text-btn small" style="color:var(--heart);align-self:center" data-act="sync-leave">Putuskan sinkron di device ini</button>`;
    } else {
      body = `<p class="hint" style="font-size:14px">Sambungkan beberapa device (kamu dan keluarga) supaya menu minggu ini, centang belanja, dan favorit selalu sama di semua HP.</p>
        <section class="card sync-card">
          <h2 class="h2">Mulai dari device ini</h2>
          <p class="hint" style="padding:0">Data di device ini menjadi data keluarga, lalu kamu mendapat kode untuk device lain.</p>
          <button type="button" class="btn primary block" data-act="sync-create">${icon('cloud', 18)}Buat kode keluarga</button>
        </section>
        <section class="card sync-card">
          <h2 class="h2">Sudah punya kode?</h2>
          <label for="sync-code" class="label">Kode keluarga</label>
          <input id="sync-code" class="code-input" type="text" inputmode="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXXX-XXXXX-XXXXX-XXXXX" value="${esc(ui.joinPrefill || '')}">
          <button type="button" class="btn secondary block" data-act="sync-join">Sambungkan</button>
          <p class="hint" style="padding:0">Data di device ini akan diganti dengan data keluarga.</p>
        </section>`;
    }
    return `<section class="screen">
      <header class="nav-head">
        <button type="button" class="text-btn accent" data-act="back">${icon('left', 22)}Kembali</button>
        <h1>Sinkron Keluarga</h1>
        <span style="width:72px"></span>
      </header>
      <div class="scroll" data-scroll="sync" style="padding:12px 20px 24px;display:flex;flex-direction:column;gap:14px">${body}</div>
    </section>`;
  }

  // Generate sheet ------------------------------------------------------
  function viewSheet() {
    const sh = ui.sheet;
    const titles = ['Buat Menu 7 Hari', 'Daftar Belanja', 'Konfirmasi'];
    const head = `<div class="grabber" aria-hidden="true"></div>
      <div class="sheet-head">
        <button type="button" class="icon-btn" data-act="${sh.step === 1 ? 'close-sheet' : 'sheet-back'}" aria-label="${sh.step === 1 ? 'Tutup' : 'Kembali'}">${icon(sh.step === 1 ? 'x' : 'left', 22, 'stroke-width="2.2"')}</button>
        <h1 id="sheet-title">${titles[sh.step - 1]}</h1>
        <span class="step">${sh.step}/3</span>
      </div>
      <div class="progress3" aria-hidden="true">${[1, 2, 3].map((n) => `<span class="${n <= sh.step ? 'on' : ''}"></span>`).join('')}</div>`;
    let body = '';
    let foot = '';
    if (sh.step === 1) { body = sheetStep1(); foot = `<button type="button" class="btn primary grow" data-act="sheet-next">Cocok, lanjut ke belanja ${icon('right', 18)}</button>`; }
    if (sh.step === 2) { body = sheetStep2(); foot = `<button type="button" class="btn secondary" data-act="sheet-back">Kembali</button><button type="button" class="btn primary grow" data-act="sheet-next">Lanjut ke konfirmasi ${icon('right', 18)}</button>`; }
    if (sh.step === 3) { body = sheetStep3(); foot = `<button type="button" class="btn secondary" data-act="sheet-back">Kembali</button><button type="button" class="btn primary grow" data-act="confirm">${icon('check', 18, 'stroke-width="2.5"')}Konfirmasi Menu</button>`; }
    // Animate only on the first render after opening, not on every tap inside the sheet.
    const anim = sh.fresh ? ' anim' : '';
    sh.fresh = false;
    return `<div class="sheet-wrap${anim}"><section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      ${head}${body}<div class="sheet-foot">${foot}</div></section></div>`;
  }

  function draftDates() { return weekDates(ui.sheet.weekStart); }

  function sheetStep1() {
    const days = ui.sheet.days;
    const dates = draftDates();
    const favCount = days.filter((d) => favMainIds().includes(d.mainId)).length;
    const mineCount = days.filter((d) => d.mainId && mainSource(d.mainId) !== 'online').length;
    const cookDays = days.filter((d) => d.mainId).length;
    const kidStates = days.map(kidState);
    const kidSame = kidStates.filter((k) => k.kind === 'same').length;
    const kidOwn = kidStates.filter((k) => k.kind === 'auto' || k.kind === 'pick').length;
    const ideaCount = days.filter((d) => isIdea(d.mainId) || isIdea(d.sideId)).length;
    const dayCol = (i) => `<span class="day-col"><span class="dn">${DAY_SHORT[i]}</span><span class="dd">${dates[i].getDate()}</span></span><span class="vline" aria-hidden="true"></span>`;
    const swipeBg = (label) => `<div class="swipe-bg" aria-hidden="true">${icon('trash', 18)}${label}</div>`;

    const adult = days.map((d, i) => {
      if (!d.mainId) {
        return `<li class="swipe-wrap"><div class="card menu-card stack empty-day">
          <div class="row">${dayCol(i)}
            <span class="names"><span class="tag">Hari kosong</span><span class="main" style="color:var(--muted)"><span>Tidak masak hari ini</span></span></span>
          </div>
          <div class="chip-row">
            <button type="button" class="side-btn" data-act="reroll" data-i="${i}"><span>${icon('shuffle', 14)}Acak menu</span></button>
            <button type="button" class="side-btn" data-act="pick" data-kind="main" data-i="${i}"><span>${icon('search', 14)}Pilih sendiri</span></button>
          </div>
        </div></li>`;
      }
      const m = { id: d.mainId, name: nameOf(d.mainId), source: mainSource(d.mainId) };
      const kid = isKidOk(d.mainId);
      return `<li class="swipe-wrap">${swipeBg('Kosongkan hari')}
        <div class="card menu-card stack swipe" data-swipe="adult" data-i="${i}">
        <div class="row">
          ${dayCol(i)}
          <span class="names">
            <button type="button" class="pick-link main" data-act="pick" data-kind="main" data-i="${i}" aria-label="Menu utama ${DAY_NAMES[i]}: ${esc(m.name)}. Ketuk untuk memilih sendiri">
              <span>${esc(m.name)}</span>${starIf(m.id)}${favMainIds().includes(m.id) ? smallHeart : ''}${m.source === 'online' ? '<span class="badge-online">Online</span>' : ''}<span class="caret" aria-hidden="true">${icon('down', 14, 'stroke-width="2.6"')}</span>
            </button>
            <button type="button" class="pick-link side" data-act="pick" data-kind="side" data-i="${i}" aria-label="Pendamping: ${esc(nameOf(d.sideId))}. Ketuk untuk memilih sendiri">
              + ${esc(nameOf(d.sideId))} ${starIf(d.sideId, 12)}<span class="caret" aria-hidden="true">${icon('down', 12, 'stroke-width="2.6"')}</span>
            </button>
          </span>
          <button type="button" class="icon-btn soft" data-act="reroll" data-i="${i}" aria-label="Acak ulang menu ${DAY_NAMES[i]}">${icon('refresh')}</button>
        </div>
        <div class="chip-row">
          <button type="button" class="kid-toggle" data-act="kid-toggle" data-id="${m.id}" aria-pressed="${kid}" aria-label="${kid ? 'Ramah anak, ketuk untuk batalkan' : 'Tandai ramah anak'}: ${esc(m.name)}">
            <span>${icon('kid', 16)}${kid ? 'Ramah anak ✓' : 'Ramah anak?'}</span>
          </button>
          <button type="button" class="side-btn" data-act="reroll-side" data-i="${i}" aria-label="Ganti pendamping untuk ${esc(m.name)}, sekarang ${esc(nameOf(d.sideId))}">
            <span>${icon('refresh', 14)}Ganti pendamping</span>
          </button>
          <button type="button" class="sr-only-focusable" data-act="empty-day" data-i="${i}">Kosongkan ${DAY_NAMES[i]}</button>
        </div>
      </div></li>`;
    }).join('');

    const kids = days.map((d, i) => {
      const k = kidStates[i];
      if (k.kind === 'none') {
        return `<li class="swipe-wrap"><div class="card menu-card stack empty-day">
          <div class="row">${dayCol(i)}
            <span class="names"><span class="tag">Tanpa menu anak</span><span class="main" style="color:var(--muted)"><span>Anak tidak dimasakkan</span></span></span>
          </div>
          <div class="chip-row">
            <button type="button" class="side-btn kid" data-act="reroll-kid" data-i="${i}"><span>${icon('shuffle', 14)}Acak menu anak</span></button>
            <button type="button" class="side-btn kid" data-act="pick" data-kind="kid" data-i="${i}"><span>${icon('search', 14)}Pilih sendiri</span></button>
          </div>
        </div></li>`;
      }
      const name = k.kind === 'same' ? nameOf(d.mainId) : nameOf(k.id);
      const tag = { same: 'Ikut menu dewasa', auto: 'Khusus anak', pick: 'Pilihan sendiri' }[k.kind];
      return `<li class="swipe-wrap">${swipeBg('Tanpa menu anak')}
        <div class="card menu-card swipe ${k.kind === 'same' ? '' : 'kid-auto'}" data-swipe="kid" data-i="${i}" style="min-height:66px">
        ${dayCol(i)}
        <span class="names">
          <span class="tag ${k.kind === 'same' ? '' : 'kid'}">${tag}</span>
          <button type="button" class="pick-link main" data-act="pick" data-kind="kid" data-i="${i}" aria-label="Menu anak ${DAY_NAMES[i]}: ${esc(name)}. Ketuk untuk memilih sendiri">
            <span>${esc(name)}</span><span class="caret" aria-hidden="true">${icon('down', 14, 'stroke-width="2.6"')}</span>
          </button>
        </span>
        ${k.kind === 'same' ? '' : `<button type="button" class="icon-btn kid" data-act="reroll-kid" data-i="${i}" aria-label="Acak ulang menu anak ${DAY_NAMES[i]}">${icon('refresh')}</button>`}
        <button type="button" class="sr-only-focusable" data-act="empty-kid" data-i="${i}">Tanpa menu anak ${DAY_NAMES[i]}</button>
      </div></li>`;
    }).join('');
    return `<div class="sheet-body" data-scroll="step1">
      <div class="intro"><p class="kicker">Langkah 1 · ${weekLabel(ui.sheet.weekStart)}</p><p>Acak ulang yang belum cocok, ketuk nama menu untuk memilih sendiri, atau <b>geser kartu ke kiri</b> untuk mengosongkan hari itu.</p></div>
      <div class="note">${icon('book', 18, 'style="flex-shrink:0;color:var(--accent)"')}<span><strong>Dari katalog menumu</strong>${adultMains().filter((m) => m.source !== 'online').length} menu utama + ${adultSides().length} pendamping milikmu, ditambah ${adultMains().filter((m) => m.source === 'online').length} resep online. Minggu ini ${mineCount} dari 7 menu dari koleksimu.</span></div>
      <button type="button" class="switch-row" role="switch" aria-checked="${S.preferFav}" data-act="prefer-fav">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--heart)" stroke="var(--heart)" stroke-width="2" aria-hidden="true" style="flex-shrink:0">${P.heart}</svg>
        <span class="txt"><b>Utamakan menu favorit</b><small>${favCount} dari 7 menu ini favoritmu</small></span>
        <span class="switch" aria-hidden="true"></span>
      </button>
      ${laterCount() ? `<button type="button" class="switch-row" role="switch" aria-checked="${S.includeIdeas}" data-act="include-ideas">
        ${star(18)}
        <span class="txt"><b>Sertakan menu untuk nanti</b><small>${S.includeIdeas ? `${ideaCount} menu ★ minggu ini · sampai 2 per minggu` : `${laterCount()} ide tersimpan, tidak diikutkan`}</small></span>
        <span class="switch" aria-hidden="true"></span>
      </button>` : ''}
      <div class="section-head"><h2>Menu Dewasa</h2><button type="button" class="text-btn small accent" style="margin:-12px -8px" data-act="shuffle-all">${icon('shuffle', 16)}Acak semua</button></div>
      <ul class="list">${adult}</ul>
      <div class="intro" style="margin-top:10px">
        <div class="section-head" style="padding:0"><h2 class="kid">${icon('kid')}Menu Anak</h2></div>
        <p style="font-size:13px">${kidSame} hari ikut menu dewasa · ${kidOwn} hari menu khusus anak${7 - kidSame - kidOwn ? ` · ${7 - kidSame - kidOwn} hari tanpa menu anak` : ''}.</p>
      </div>
      <ul class="list">${kids}</ul>
    </div>`;
  }

  function draftForShopping() {
    return ui.sheet.days.map((d) => ({ mainId: d.mainId, sideId: d.sideId, kidId: kidIdFor(d) }));
  }

  function sheetStep2() {
    const cats = buildShopping(draftForShopping());
    const total = cats.reduce((n, c) => n + c.items.length, 0);
    const have = Object.keys(ui.sheet.have).filter((k) => ui.sheet.have[k]).length;
    return `<div class="sheet-body" style="padding-bottom:0;gap:8px;flex:0 0 auto">
        <div class="intro"><p class="kicker">Langkah 2 · Belanja</p><p>${total} bahan untuk menu dewasa &amp; anak · centang yang sudah ada di dapur (${have} sudah ada).</p></div>
        <p class="note" style="background:#fff;border:1px solid var(--line);font-weight:600">${icon('bag', 16, 'style="flex-shrink:0;color:var(--accent)"')}<span>Setelah konfirmasi, daftar ini tersimpan di tab Belanja.</span></p>
      </div>
      ${shoppingBody(cats, ui.sheet.have, 'step2', false, 'toggle-have')}`;
  }

  function sheetStep3() {
    const days = ui.sheet.days;
    const dates = draftDates();
    const cats = buildShopping(draftForShopping());
    let need = 0;
    cats.forEach((c) => c.items.forEach((it) => { if (!ui.sheet.have[it.id]) need++; }));
    const kidAuto = days.filter((d) => { const k = kidState(d).kind; return k === 'auto' || k === 'pick'; }).length;
    const cookDays = days.filter((d) => d.mainId).length;
    return `<div class="sheet-body" data-scroll="step3">
      <div class="intro"><p class="kicker">Langkah 3 · Konfirmasi</p><h2>Siap untuk ${weekLabel(ui.sheet.weekStart).toLowerCase()}?</h2></div>
      <div class="summary">
        <div class="range">${icon('cal', 18)}${DAY_NAMES[0]}, ${dates[0].getDate()} ${MONTHS[dates[0].getMonth()]} – ${DAY_NAMES[6]}, ${dates[6].getDate()} ${MONTHS[dates[6].getMonth()]} ${dates[6].getFullYear()}</div>
        <div class="nums">
          <div><b>${cookDays}</b><span>set menu dewasa</span></div>
          <div><b>${kidAuto}</b><span>menu khusus anak</span></div>
          <div><b>${need}</b><span>bahan perlu dibeli</span></div>
        </div>
      </div>
      <ul class="card plain-list">${days.map((d, i) => `<li>
        <span class="d">${DAY_LABEL[i]} ${dates[i].getDate()}</span>
        <span class="names">${d.mainId
          ? `<span class="main" style="font-size:14px"><span>${esc(nameOf(d.mainId))}</span>${starIf(d.mainId)}</span>
        <span class="side" style="font-size:12px">+ ${esc(nameOf(d.sideId))} ${starIf(d.sideId, 12)}</span>`
          : '<span class="main" style="font-size:14px;color:var(--muted)"><span>Hari kosong</span></span>'}
        <span class="kidline">Anak: ${(() => { const k = kidState(d); return k.kind === 'none' ? 'tidak ada' : k.kind === 'same' ? 'ikut menu dewasa' : esc(nameOf(k.id)); })()}</span></span>
      </li>`).join('')}</ul>
      <p class="hint">${icon('info', 18, 'style="flex-shrink:0"')}<span>Urutan hari masih bisa diatur ulang dari Beranda, dan daftar belanja tetap tersimpan di tab Belanja selama seminggu.</span></p>
    </div>`;
  }

  // "Pilih sendiri" picker (step 1) -------------------------------------------
  function viewPicker() {
    const pk = ui.picker;
    const d = ui.sheet.days[pk.day];
    const q = pk.query.trim().toLowerCase();
    const match = (name) => !q || name.toLowerCase().includes(q);
    const current = pk.kind === 'main' ? d.mainId : pk.kind === 'side' ? d.sideId : kidIdFor(d);
    // Everything in the catalog can be picked by hand, including menus hidden from random picks.
    const menus = allMenus();
    const row = (m) => [m.id, m.name, m.later];
    let groups;
    if (pk.kind === 'main') {
      const adult = menus.filter((m) => m.type === 'main' && m.audience === 'adult');
      groups = [
        ['★ Untuk nanti', adult.filter((m) => m.later).map(row)],
        ['Koleksi menumu', adult.filter((m) => m.builtin && m.source === 'user').map(row)],
        ['Menu buatanmu', adult.filter((m) => !m.builtin && !m.later).map(row)],
        ['Resep online', adult.filter((m) => m.source === 'online').map(row)]
      ];
    } else if (pk.kind === 'side') {
      const sides = menus.filter((m) => m.type === 'side' && m.audience === 'adult');
      groups = [
        ['★ Untuk nanti', sides.filter((m) => m.later).map(row)],
        ['Pendamping koleksimu', sides.filter((m) => m.builtin).map(row)],
        ['Menu buatanmu', sides.filter((m) => !m.builtin && !m.later).map(row)]
      ];
    } else {
      groups = [
        ['Menu anak', menus.filter((m) => m.audience === 'kid').map(row)],
        ['Menu dewasa yang ramah anak', menus.filter((m) => m.audience === 'adult' && m.type === 'main' && isKidOk(m.id)).map(row)]
      ];
    }
    const exact = groups.some(([, items]) => items.some(([, n]) => n.toLowerCase() === q));
    const list = groups.map(([title, items]) => {
      const rows = items.filter(([, n]) => match(n));
      if (!rows.length) return '';
      return `<section class="pick-group"><h3>${title}</h3><ul class="card">${rows.map(([id, n, isStar]) =>
        `<li><button type="button" class="pick-row" data-act="pick-choose" data-id="${esc(id)}" aria-current="${id === current}">
          <span>${esc(n)}</span>${isStar ? star(14) : ''}${id === current ? `<span class="tick">${icon('check', 18, 'stroke-width="2.6"')}</span>` : ''}
        </button></li>`).join('')}</ul></section>`;
    }).join('');
    const label = { main: 'menu utama', side: 'pendamping', kid: 'menu anak' }[pk.kind];
    return `<div class="sheet-wrap picker-wrap${pk.fresh ? ' anim' : ''}"><section class="sheet" role="dialog" aria-modal="true" aria-labelledby="picker-title">
      <div class="grabber" aria-hidden="true"></div>
      <div class="sheet-head">
        <button type="button" class="icon-btn" data-act="picker-close" aria-label="Tutup">${icon('x', 22, 'stroke-width="2.2"')}</button>
        <h1 id="picker-title">Pilih ${label} · ${DAY_NAMES[pk.day]}</h1>
        <span class="step"></span>
      </div>
      <div style="padding:10px 16px 6px">
        <label for="picker-q" class="sr-only">Cari ${label}</label>
        <div class="search">${icon('search', 18)}<input id="picker-q" type="search" autocomplete="off" placeholder="Cari atau ketik nama ${label}…" value="${esc(pk.query)}" data-act="picker-search" data-keep-focus="picker"></div>
      </div>
      <div class="sheet-body" data-scroll="picker" style="padding-top:6px">
        ${q && !exact ? `<button type="button" class="card option" data-act="pick-custom"><span class="ico">${icon('plus', 22)}</span><span class="txt"><b>Pakai “${esc(pk.query.trim())}”</b><small>Tambahkan sebagai ${label} baru (tanpa resep)</small></span></button>` : ''}
        ${list || (q ? '' : '<p class="empty-cat">Belum ada pilihan.</p>')}
      </div>
    </section></div>`;
  }
  function choosePicked(id) {
    const pk = ui.picker;
    const days = ui.sheet.days;
    const d = Object.assign({}, days[pk.day]);
    if (pk.kind === 'main') {
      d.mainId = id;
      if (!d.sideId) {
        const used = days.filter((_, k) => k !== pk.day).map((x) => x.sideId);
        d.sideId = uniqueSide(MAIN[id] ? MAIN[id].defaultSideId : null, used);
      }
    } else if (pk.kind === 'side') {
      d.sideId = id;
    } else {
      d.kidMode = 'pick';
      d.kidPickId = id;
    }
    days[pk.day] = d;
    ui.picker = null;
    render();
  }
  function emptyDay(i, kind) {
    const days = ui.sheet.days;
    const prev = days[i];
    days[i] = kind === 'kid'
      ? Object.assign({}, prev, { kidMode: 'none' })
      : Object.assign({}, prev, { mainId: null, sideId: null });
    ui.undoFn = () => { ui.sheet.days[i] = prev; };
    toast(kind === 'kid' ? `Menu anak ${DAY_NAMES[i]} dikosongkan` : `${DAY_NAMES[i]} dikosongkan`, true);
  }

  // ---------- Actions ----------
  function openSheet(week) {
    ui.sheet = { step: 1, weekStart: week, days: generateDays(), have: {}, fresh: true };
    render();
  }
  const anyPlanUses = (id) => Object.values(S.plans).some((p) => p.days.some((d) => d.mainId === id || d.sideId === id || d.kidId === id));
  function goWeek(dir) {
    const pages = weekPages();
    const i = Math.max(0, Math.min(pages.length - 1, pages.indexOf(ui.week) + dir));
    ui.week = pages[i];
    ui.scrollToWeek = true;
    render();
  }

  const actions = {
    'tab': (el) => { ui.tab = el.dataset.tab; ui.view = null; render(); },
    'open-sync': () => { ui.view = { type: 'sync' }; render(); },
    // ----- Untuk nanti -----
    'fav-seg': (el) => { ui.favSeg = el.dataset.seg; render(); },
    'include-ideas': () => { S.includeIdeas = !S.includeIdeas; save(); ui.sheet.days = generateDays(); render(); },
    'idea-new': () => { ui.ideaSheet = { step: 'choose', fresh: true, later: true }; render(); },
    'menu-new': (el) => { ui.ideaSheet = { step: 'choose', fresh: true, later: el.dataset.later === 'true' }; render(); },
    'cat-filter': (el) => { ui.catFilter = el.dataset.filter; render(); },
    'open-menu': (el) => { ui.view = { type: 'menu', id: el.dataset.id }; render(); },
    'idea-aud': (el) => { captureIdeaForm(); ui.ideaSheet.draft.audience = el.dataset.aud; if (el.dataset.aud === 'kid') ui.ideaSheet.draft.type = 'main'; render(); },
    'idea-later': () => { captureIdeaForm(); ui.ideaSheet.draft.later = !ui.ideaSheet.draft.later; render(); },
    'menu-edit': (el) => {
      const id = el.dataset.id;
      const m = menuInfo(id);
      if (!m) return;
      if (m.builtin) {
        const r = recipeRows(id);
        const ingredientsText = rowsToText(r.rows);
        const stepsText = r.steps.join('\n');
        ui.ideaSheet = {
          step: 'edit', fresh: true, editingId: id, builtinId: id, note: null,
          original: { name: m.name, ingredientsText, stepsText },
          draft: { name: m.name, type: m.type, audience: m.audience, kidFriendly: isKidOk(id), later: false, url: '', source: 'builtin', ingredientsText, stepsText }
        };
      } else {
        const x = ideaById(id);
        ui.ideaSheet = {
          step: 'edit', fresh: true, editingId: id, note: null,
          draft: {
            name: x.name, type: x.type || 'main', audience: x.audience || 'adult', kidFriendly: !!x.kidFriendly, later: x.later !== false,
            url: x.url || '', source: x.source,
            ingredientsText: (x.ingredients || []).map((i) => i.text || [i.qtyText, i.name].filter(Boolean).join(' ') + (i.note ? ', ' + i.note : '')).join('\n'),
            stepsText: (x.steps || []).join('\n')
          }
        };
      }
      render();
    },
    'menu-reset': (el) => {
      const id = el.dataset.id;
      if (!window.confirm('Kembalikan ke resep asli? Perubahan nama, jenis, bahan, dan langkah akan dihapus.')) return;
      const hidden = editOf(id) && editOf(id).hidden;
      if (hidden) S.menuEdits[id] = { hidden: true }; else delete S.menuEdits[id];
      save();
      toast('Resep asli dikembalikan');
    },
    'menu-hidden': (el) => {
      const id = el.dataset.id;
      const x = ideaById(id);
      if (x) x.hidden = !x.hidden;
      else S.menuEdits[id] = Object.assign({}, S.menuEdits[id], { hidden: !(editOf(id) && editOf(id).hidden) });
      save(); render();
    },
    'menu-later': (el) => { const x = ideaById(el.dataset.id); if (x) { x.later = x.later === false; save(); render(); } },
    'idea-close': () => { ui.ideaSheet = null; render(); },
    'idea-back': () => { captureIdeaForm(); ui.ideaSheet.step = 'choose'; ui.ideaSheet.error = null; render(); },
    'idea-manual': () => { Object.assign(ui.ideaSheet, { step: 'edit', draft: emptyIdeaDraft('manual'), note: null }); render(); },
    'idea-web': () => { ui.ideaSheet.step = 'web'; render(); },
    'idea-parse-web': () => {
      const sh = ui.ideaSheet;
      sh.url = (document.getElementById('idea-url') || {}).value || '';
      sh.paste = (document.getElementById('idea-paste') || {}).value || '';
      if (!sh.paste.trim()) { toast('Tempel teks resepnya dulu'); return; }
      draftFromText(sh.paste, 'web', sh.url.trim());
      render();
    },
    'idea-pick-image': () => {
      // Created on the fly so the photo picker opens straight from this tap (iOS needs a user gesture).
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = () => { if (input.files && input.files[0]) readImage(input.files[0]); };
      input.click();
    },
    'idea-type': (el) => { captureIdeaForm(); ui.ideaSheet.draft.type = el.dataset.type; render(); },
    'idea-kid': () => { captureIdeaForm(); ui.ideaSheet.draft.kidFriendly = !ui.ideaSheet.draft.kidFriendly; render(); },
    'idea-save': () => {
      captureIdeaForm();
      const sh = ui.ideaSheet;
      const d = sh.draft;
      if (!d.name.trim()) { toast('Isi judul masakan dulu'); return; }
      const lines = (t) => String(t || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const ingredients = lines(d.ingredientsText).map((l) => {
        const p = window.IdeaKit.parseIngredientLine(l, D.ingredients);
        return { text: p.text, name: p.name, qty: p.qty, qtyText: p.qtyText, note: p.note, category: p.category, vocabId: p.vocabId };
      });
      const type = d.audience === 'kid' ? 'main' : (d.type === 'side' ? 'side' : 'main');
      const audience = d.audience === 'kid' ? 'kid' : 'adult';
      if (sh.builtinId) {
        // Built-in menu: store only what changed, on top of the bundled recipe.
        const id = sh.builtinId;
        const orig = { name: (MAIN[id] || SIDE[id] || KID[id]).name, type: MAIN[id] || KID[id] ? 'main' : 'side', audience: KID[id] ? 'kid' : 'adult' };
        const prev = editOf(id) || {};
        const next = { hidden: prev.hidden || undefined };
        if (d.name.trim() !== orig.name) next.name = d.name.trim();
        if (type !== orig.type) next.type = type;
        if (audience !== orig.audience) next.audience = audience;
        if (d.ingredientsText.trim() !== sh.original.ingredientsText.trim()) next.ingredients = ingredients;
        else if (prev.ingredients) next.ingredients = prev.ingredients;
        if (d.stepsText.trim() !== sh.original.stepsText.trim()) next.steps = lines(d.stepsText);
        else if (prev.steps) next.steps = prev.steps;
        Object.keys(next).forEach((k) => next[k] === undefined && delete next[k]);
        if (Object.keys(next).length) S.menuEdits[id] = next; else delete S.menuEdits[id];
        if (audience === 'adult' && !!d.kidFriendly !== isKidOk(id)) S.kidOverrides[id] = !!d.kidFriendly;
        save();
        ui.ideaSheet = null;
        toast('Perubahan disimpan');
        return;
      }
      const idea = {
        name: d.name.trim(), type, audience, kidFriendly: audience === 'adult' && !!d.kidFriendly, later: !!d.later,
        source: d.source || 'manual', url: (d.url || '').trim(), ingredients, steps: lines(d.stepsText)
      };
      S.ideas = S.ideas || [];
      let newId = null;
      if (sh.editingId) {
        const i = S.ideas.findIndex((x) => x.id === sh.editingId);
        if (i >= 0) S.ideas[i] = Object.assign({}, S.ideas[i], idea);
      } else {
        newId = 'menu-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        S.ideas.unshift(Object.assign({ id: newId, createdAt: Date.now() }, idea));
        ui.tab = 'fav'; ui.favSeg = idea.later ? 'later' : 'all'; ui.view = { type: 'menu', id: newId };
      }
      save();
      ui.ideaSheet = null;
      toast(sh.editingId ? 'Perubahan disimpan' : idea.later ? 'Disimpan ke Untuk nanti ★' : 'Menu ditambahkan ke katalog');
    },
    'open-idea': (el) => { ui.view = { type: 'menu', id: el.dataset.id }; render(); },
    'idea-edit': (el) => {
      const x = ideaById(el.dataset.id);
      if (!x) return;
      ui.ideaSheet = {
        step: 'edit', fresh: true, editingId: x.id, note: null,
        draft: {
          name: x.name, type: x.type, kidFriendly: !!x.kidFriendly, url: x.url || '', source: x.source,
          ingredientsText: (x.ingredients || []).map((i) => i.text || [i.qtyText, i.name].filter(Boolean).join(' ') + (i.note ? ', ' + i.note : '')).join('\n'),
          stepsText: (x.steps || []).join('\n')
        }
      };
      render();
    },
    'idea-delete': (el) => {
      const id = el.dataset.id;
      if (anyPlanUses(id)) {
        toast('Menu ini masih dipakai di menu mingguan, hapus setelah minggunya selesai');
        return;
      }
      if (!window.confirm(`Hapus “${nameOf(id)}” dari katalog?`)) return;
      S.ideas = (S.ideas || []).filter((x) => x.id !== id);
      S.favorites = S.favorites.filter((k) => !k.split('|').includes(id));
      save();
      ui.view = null;
      toast('Menu dihapus');
    },
    'sync-create': () => {
      const code = newFamilyCode();
      S.updatedAt = Date.now();
      window.MenuSync.push(code, S).then(() => {
        setSyncCode(code);
        sync.status = 'connecting';
        startSync();
        toast('Kode keluarga dibuat');
      }).catch((err) => toast('Gagal membuat kode: ' + (err.code || err.message || err)));
    },
    'sync-join': () => {
      const input = document.getElementById('sync-code');
      const code = normCode(input && input.value);
      if (code.replace(/-/g, '').length < 20) { toast('Kode harus 20 huruf/angka'); return; }
      window.MenuSync.fetch(code).then((remote) => {
        if (!remote) { toast('Kode tidak ditemukan'); return; }
        if (Object.keys(S.plans).length && !window.confirm('Menu dan daftar belanja di device ini akan diganti dengan data keluarga. Lanjutkan?')) return;
        setSyncCode(code);
        replaceState(remote);
        save({ remote: true });
        ui.joinPrefill = '';
        sync.status = 'connecting';
        startSync();
        ui.view = null; ui.tab = 'home';
        toast('Tersambung ke data keluarga');
      }).catch((err) => toast('Gagal menyambung: ' + (err.code || err.message || err)));
    },
    'sync-copy': () => {
      const done = () => toast('Kode disalin');
      if (navigator.clipboard) navigator.clipboard.writeText(sync.code).then(done, () => toast(sync.code));
      else toast(sync.code);
    },
    'sync-share': () => {
      const url = location.origin + location.pathname + '#join=' + sync.code;
      const text = 'Sambungkan Menu Mingguan keluarga kita: ' + url;
      if (navigator.share) navigator.share({ title: 'Menu Mingguan', text, url }).catch(() => {});
      else if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => toast('Link disalin'));
      else toast(url);
    },
    'sync-leave': () => {
      if (!window.confirm('Putuskan sinkron di device ini? Data tetap tersimpan di device ini dan di device keluarga lainnya.')) return;
      if (window.MenuSync && window.MenuSync.stop) window.MenuSync.stop();
      setSyncCode(null);
      sync.status = 'off';
      render();
    },
    'new-plan': (el) => {
      const week = el.dataset.week || ui.week;
      if (planOf(week) && !window.confirm(`Buat ulang menu ${weekLabel(week).toLowerCase()}? Menu dan daftar belanjanya akan diganti.`)) return;
      openSheet(week);
    },
    'week-go': (el) => goWeek(+el.dataset.dir),
    'shop-week': (el) => { ui.week = el.dataset.week; ui.tab = 'shop'; ui.view = null; render(); },
    'close-sheet': () => { ui.sheet = null; render(); },
    'sheet-back': () => { ui.sheet.step = Math.max(1, ui.sheet.step - 1); render(); },
    'sheet-next': () => {
      ui.sheet.step = Math.min(3, ui.sheet.step + 1);
      if (ui.sheet.step === 2) {
        // Pantry staples (salt, sugar, oil…) start out as "already in the kitchen".
        buildShopping(draftForShopping()).forEach((c) => c.items.forEach((it) => {
          if (it.pantry && !(it.id in ui.sheet.have)) ui.sheet.have[it.id] = true;
        }));
      }
      render();
    },
    'reroll': (el) => { rerollDay(ui.sheet.days, +el.dataset.i); render(); },
    'reroll-kid': (el) => {
      const i = +el.dataset.i;
      ui.sheet.days[i] = Object.assign({}, ui.sheet.days[i], { kidMode: 'auto', kidPickId: null });
      if (kidState(ui.sheet.days[i]).kind === 'same') {
        // Adult menu is kid-friendly: "acak" still gives the kids their own random menu.
        ui.sheet.days[i].kidMode = 'pick';
        ui.sheet.days[i].kidPickId = freshKid(ui.sheet.days.map((x) => kidIdFor(x)).filter(Boolean));
      } else {
        rerollKid(ui.sheet.days, i);
      }
      render();
    },
    'pick': (el) => { ui.picker = { kind: el.dataset.kind, day: +el.dataset.i, query: '', fresh: true }; render(); ui.picker.fresh = false; },
    'picker-close': () => { ui.picker = null; render(); },
    'pick-choose': (el) => choosePicked(el.dataset.id),
    'pick-custom': () => {
      const name = ui.picker.query.trim();
      if (!name) return;
      // A typed name becomes a plain catalog menu (no recipe yet) that can be completed later in Katalog.
      const kind = ui.picker.kind;
      const type = kind === 'side' ? 'side' : 'main';
      const audience = kind === 'kid' ? 'kid' : 'adult';
      S.ideas = S.ideas || [];
      let c = S.ideas.find((x) => x.name.toLowerCase() === name.toLowerCase() && (x.type || 'main') === type && (x.audience || 'adult') === audience);
      if (!c) {
        c = { id: 'menu-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: name.charAt(0).toUpperCase() + name.slice(1), type, audience, later: false, source: 'custom', ingredients: [], steps: [], createdAt: Date.now() };
        S.ideas.push(c);
        save();
      }
      choosePicked(c.id);
    },
    'empty-day': (el) => emptyDay(+el.dataset.i, 'adult'),
    'empty-kid': (el) => emptyDay(+el.dataset.i, 'kid'),
    'reroll-side': (el) => { rerollSide(ui.sheet.days, +el.dataset.i); render(); },
    'expand': (el) => { const k = el.dataset.key; ui.expanded[k] = !ui.expanded[k]; render(); },
    'shuffle-all': () => { ui.sheet.days = generateDays(); render(); },
    'prefer-fav': () => { S.preferFav = !S.preferFav; save(); render(); },
    'kid-toggle': (el) => {
      const id = el.dataset.id;
      S.kidOverrides[id] = !isKidOk(id);
      // keep kids menus unique across the days that now need their own menu
      const days = ui.sheet.days;
      const used = [];
      days.forEach((d, i) => {
        if (isKidOk(d.mainId)) return;
        if (used.includes(d.kidMenuId)) days[i] = Object.assign({}, d, { kidMenuId: freshKid(used) });
        used.push(days[i].kidMenuId);
      });
      save(); render();
    },
    'confirm': () => {
      const sh = ui.sheet;
      const shopping = {};
      buildShopping(draftForShopping()).forEach((c) => c.items.forEach((it) => {
        if (sh.have[it.id]) shopping[it.id] = true;
      }));
      S.plans[sh.weekStart] = { weekStart: sh.weekStart, days: sh.days.map((d) => ({ mainId: d.mainId, sideId: d.mainId ? d.sideId : null, kidId: kidIdFor(d), done: false })) };
      S.shoppingByWeek[sh.weekStart] = shopping;
      save();
      ui.sheet = null; ui.tab = 'home'; ui.view = null; ui.week = sh.weekStart; ui.scrollToWeek = true;
      toast(`Menu ${weekLabel(sh.weekStart).toLowerCase()} tersimpan`);
    },
    'open-day': (el) => { ui.view = { type: 'detail', day: +el.dataset.i, week: el.dataset.week || ui.week }; ui.week = ui.view.week; ui.detailTab = 'main'; render(); },
    'open-fav': (el) => { ui.view = { type: 'fav', key: el.dataset.key }; ui.detailTab = 'main'; render(); },
    'back': () => { ui.view = null; render(); },
    'detail-tab': (el) => { ui.detailTab = el.dataset.tab; render(); },
    'done-day': (el) => { const d = planOf(el.dataset.week || ui.week).days[+el.dataset.i]; d.done = !d.done; save(); render(); },
    'fav-day': (el) => {
      const d = planOf(el.dataset.week || ui.week).days[+el.dataset.i];
      const k = favKey(d.mainId, d.sideId);
      const had = S.favorites.includes(k);
      S.favorites = had ? S.favorites.filter((x) => x !== k) : [k].concat(S.favorites);
      save();
      toast(had ? 'Dihapus dari favorit' : 'Disimpan ke favorit');
    },
    'toggle-fav-key': (el) => {
      const k = el.dataset.key;
      const had = S.favorites.includes(k);
      S.favorites = had ? S.favorites.filter((x) => x !== k) : [k].concat(S.favorites);
      save(); render();
    },
    'unfav': (el) => {
      const k = el.dataset.key;
      const idx = S.favorites.indexOf(k);
      S.favorites = S.favorites.filter((x) => x !== k);
      ui.lastRemoved = { k, idx };
      save();
      toast('Dihapus dari favorit', true);
    },
    'undo': () => {
      if (ui.undoFn) { const fn = ui.undoFn; ui.undoFn = null; ui.toast = null; fn(); render(); return; }
      if (ui.lastRemoved && !S.favorites.includes(ui.lastRemoved.k)) {
        S.favorites.splice(ui.lastRemoved.idx, 0, ui.lastRemoved.k);
        save();
      }
      ui.lastRemoved = null; ui.toast = null; render();
    },
    'shop-hide': () => { ui.shopHide = !ui.shopHide; render(); },
    'jump': (el) => { const t = document.getElementById(el.dataset.target); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
    'reorder': (el) => { const w = el.dataset.week || ui.week; ui.view = { type: 'reorder', week: w, order: planOf(w).days.slice(), moved: null }; render(); },
    'move': (el) => { moveItem(+el.dataset.pos, +el.dataset.pos + +el.dataset.dir); },
    'reset-order': () => { ui.view.order = planOf(ui.view.week).days.slice(); ui.view.moved = null; render(); },
    'save-order': () => { planOf(ui.view.week).days = ui.view.order.slice(); save(); ui.view = null; toast('Urutan menu diperbarui'); }
  };

  // ----- Untuk nanti helpers -----
  function emptyIdeaDraft(source) {
    const later = !!(ui.ideaSheet && ui.ideaSheet.later);
    return { name: '', type: 'main', audience: 'adult', kidFriendly: false, later, url: '', source, ingredientsText: '', stepsText: '' };
  }
  /** Recipe rows → editable text lines ("500 g ayam, potong dadu"). */
  const rowsToText = (rows) => rows.map((r) => (r.qtyText && r.qtyText !== 'secukupnya' ? r.qtyText + ' ' : '') + r.label + (r.qtyText === 'secukupnya' ? ' secukupnya' : '') + (r.note ? ', ' + r.note : '')).join('\n');
  function draftFromText(text, source, url) {
    const p = window.IdeaKit.parseRecipeText(text);
    const sh = ui.ideaSheet;
    sh.draft = Object.assign(emptyIdeaDraft(source), {
      name: p.title, url: url || '', ingredientsText: p.ingredients.join('\n'), stepsText: p.steps.join('\n')
    });
    sh.note = p.ingredients.length || p.steps.length
      ? `Terbaca ${p.ingredients.length} bahan dan ${p.steps.length} langkah. Periksa dan rapikan bila perlu.`
      : 'Bahan dan langkah tidak terbaca otomatis. Teksnya ada di kolom bahan; pindahkan dan rapikan secara manual.';
    if (!p.ingredients.length && !p.steps.length) sh.draft.ingredientsText = text.trim();
    sh.step = 'edit';
  }
  /** Keep what the user typed before a re-render (type/kid toggles, back). */
  function captureIdeaForm() {
    const sh = ui.ideaSheet;
    if (!sh || sh.step !== 'edit' || !sh.draft) return;
    const v = (id) => { const el = document.getElementById(id); return el ? el.value : null; };
    const d = sh.draft;
    if (v('idea-title') != null) d.name = v('idea-title');
    if (v('idea-ings') != null) d.ingredientsText = v('idea-ings');
    if (v('idea-steps') != null) d.stepsText = v('idea-steps');
    if (v('idea-src') != null) d.url = v('idea-src');
  }
  function readImage(file) {
    const sh = ui.ideaSheet;
    if (!sh) return;
    Object.assign(sh, { step: 'image', progress: 0, error: null, progressLabel: 'Menyiapkan pembaca teks…', preview: URL.createObjectURL(file) });
    render();
    window.IdeaKit.ocr(file, (p) => {
      if (ui.ideaSheet !== sh) return;
      sh.progress = p; sh.progressLabel = 'Membaca teks dari gambar…';
      render();
    }).then((text) => {
      if (ui.ideaSheet !== sh) return;
      if (!text || !text.trim()) { sh.error = 'Tidak ada teks yang terbaca dari gambar ini. Coba screenshot yang lebih jelas.'; render(); return; }
      draftFromText(text, 'image', '');
      sh.draft.source = 'image';
      render();
    }).catch((err) => {
      if (ui.ideaSheet !== sh) return;
      sh.error = 'Gagal membaca gambar' + (navigator.onLine ? '' : ' (butuh internet saat pertama kali)') + ': ' + (err && err.message ? err.message : err);
      render();
    });
  }

  function moveItem(from, to) {
    const order = ui.view.order;
    if (to < 0 || to >= order.length || from === to) return;
    const [item] = order.splice(from, 1);
    order.splice(to, 0, item);
    ui.view.moved = item;
    render();
  }

  app.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.tagName === 'INPUT') return;
    const fn = actions[el.dataset.act];
    if (fn) fn(el, e);
  });
  app.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.act === 'toggle-shop') { shopOf(shopWeek())[el.dataset.id] = el.checked; save(); render(); }
    if (el.dataset.act === 'toggle-have') { ui.sheet.have[el.dataset.id] = el.checked; render(); }
  });
  app.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.act === 'fav-search') {
      ui.favQuery = el.value;
      const pos = el.selectionStart;
      render();
      const again = document.getElementById('cari');
      if (again) { again.focus(); again.setSelectionRange(pos, pos); }
    }
    if (el.dataset.act === 'picker-search' && ui.picker) { ui.picker.query = el.value; render(); }
    if (el.dataset.act === 'cat-search') { ui.catQuery = el.value; render(); }
  });

  // Swipe a step-1 card to the left to empty that day (adult menu or kids menu).
  let swipe = null;
  let suppressClick = false;
  const SWIPE_AT = 90;
  app.addEventListener('pointerdown', (e) => {
    const card = e.target.closest('[data-swipe]');
    if (!card || (e.pointerType === 'mouse' && e.button !== 0)) return;
    swipe = { card, wrap: card.parentElement, x0: e.clientX, y0: e.clientY, dx: 0, active: false, id: e.pointerId };
  });
  app.addEventListener('pointermove', (e) => {
    if (!swipe || e.pointerId !== swipe.id) return;
    const dx = e.clientX - swipe.x0;
    const dy = e.clientY - swipe.y0;
    if (!swipe.active) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        swipe.active = true;
        try { swipe.card.setPointerCapture(swipe.id); } catch (err) { /* ignore */ }
        swipe.card.classList.add('swiping');
      } else if (Math.abs(dy) > 12) { swipe = null; return; } else return;
    }
    swipe.dx = Math.min(0, dx);
    swipe.card.style.transform = `translateX(${swipe.dx}px)`;
    swipe.wrap.classList.toggle('armed', swipe.dx < -SWIPE_AT);
  });
  function endSwipe() {
    if (!swipe) return;
    const s = swipe;
    swipe = null;
    if (!s.active) return;
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 50);
    s.card.classList.remove('swiping');
    if (s.dx < -SWIPE_AT) {
      s.card.style.transform = 'translateX(-110%)';
      setTimeout(() => emptyDay(+s.card.dataset.i, s.card.dataset.swipe), 160);
    } else {
      s.card.style.transform = '';
      s.wrap.classList.remove('armed');
    }
  }
  app.addEventListener('pointerup', endSwipe);
  app.addEventListener('pointercancel', endSwipe);
  // A swipe must not also count as a tap on the menu name / buttons underneath.
  app.addEventListener('click', (e) => { if (suppressClick) { e.stopPropagation(); e.preventDefault(); suppressClick = false; } }, true);

  // Drag to reorder (pointer events on the grip handle)
  let drag = null;
  app.addEventListener('pointerdown', (e) => {
    const g = e.target.closest('[data-grip]');
    if (!g || !ui.view || ui.view.type !== 'reorder') return;
    const pos = +g.dataset.grip;
    const card = app.querySelector(`[data-card="${pos}"]`);
    const row = card.closest('.reorder-row');
    drag = { pos, card, startY: e.clientY, step: row.getBoundingClientRect().height + 8, target: pos };
    card.classList.add('dragging');
    g.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  app.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dy = e.clientY - drag.startY;
    drag.card.style.transform = `translateY(${dy}px) rotate(-1deg)`;
    drag.target = Math.max(0, Math.min(6, drag.pos + Math.round(dy / drag.step)));
    app.querySelectorAll('.reorder-card').forEach((c) => {
      const p = +c.dataset.card;
      if (p === drag.pos) return;
      let shift = 0;
      if (drag.target > drag.pos && p > drag.pos && p <= drag.target) shift = -drag.step;
      if (drag.target < drag.pos && p < drag.pos && p >= drag.target) shift = drag.step;
      c.style.transition = 'transform .15s';
      c.style.transform = shift ? `translateY(${shift}px)` : '';
    });
  });
  function endDrag() {
    if (!drag) return;
    const { pos, target } = drag;
    drag = null;
    if (pos !== target) moveItem(pos, target); else render();
  }
  app.addEventListener('pointerup', endDrag);
  app.addEventListener('pointercancel', endDrag);

  // A shared link "…#join=CODE" opens the sync screen with the code filled in.
  const join = location.hash.match(/^#join=([A-Za-z0-9-]+)/);
  if (join) {
    ui.joinPrefill = normCode(join[1]);
    if (!sync.code) ui.view = { type: 'sync' };
    history.replaceState(null, '', location.pathname + location.search);
  }

  render();
})();
