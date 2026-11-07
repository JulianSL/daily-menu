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
  const nameOf = (id) => (MAIN[id] || SIDE[id] || KID[id] || R[id] || { name: id }).name;

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
      plan: null,              // { weekStart: 'YYYY-MM-DD', days: [{mainId, sideId, kidId|null, done}] }
      shopping: {},            // ingredientId -> true (already bought / in stock)
      favorites: D.menus.favorites.filter((id) => MAIN[id]).map((id) => id + '|' + MAIN[id].defaultSideId),
      kidOverrides: {},        // mainId -> bool (user's own "ramah anak" marks)
      preferFav: true,
      updatedAt: 0             // ms timestamp of the last local change (for sync)
    };
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return Object.assign(defaults(), JSON.parse(raw));
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
  const isKidOk = (mainId) => (mainId in S.kidOverrides ? S.kidOverrides[mainId] : !!(MAIN[mainId] && MAIN[mainId].kidFriendly));
  const favKey = (mainId, sideId) => mainId + '|' + sideId;
  const isFav = (mainId, sideId) => S.favorites.includes(favKey(mainId, sideId));
  const favMainIds = () => S.favorites.map((k) => k.split('|')[0]).filter((id) => MAIN[id]);

  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function parseIso(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  function upcomingMonday() {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const dow = (t.getDay() + 6) % 7; // 0 = Monday
    const add = dow === 0 ? 0 : 7 - dow;
    t.setDate(t.getDate() + add);
    return t;
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
    share: '<path d="M12 15V4M8 8l4-4 4 4"/><path d="M5 12v6.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V12"/>'
  };
  const icon = (name, size = 20, extra = '') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${P[name]}</svg>`;
  const grip = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
  const smallHeart = `<svg width="14" height="14" viewBox="0 0 24 24" fill="var(--heart)" stroke="var(--heart)" stroke-width="2" stroke-linejoin="round" role="img" aria-label="Favorit" style="flex-shrink:0">${P.heart}</svg>`;

  // ---------- Menu generation ----------
  function uniqueSide(preferred, used) {
    if (!used.includes(preferred)) return preferred;
    const free = SIDES.map((s) => s.id).filter((id) => !used.includes(id));
    return free.length ? pick(free) : preferred;
  }
  function freshKid(used) {
    const free = KIDS.map((k) => k.id).filter((id) => !used.includes(id));
    return pick(free.length ? free : KIDS.map((k) => k.id));
  }
  function generateDays() {
    const picks = [];
    const add = (id) => { if (!picks.includes(id)) picks.push(id); };
    if (S.preferFav) shuffle(favMainIds()).slice(0, 3).forEach(add);
    shuffle(MAINS.filter((m) => m.source === 'user').map((m) => m.id)).forEach((id) => { if (picks.length < 6) add(id); });
    shuffle(MAINS.map((m) => m.id)).forEach((id) => { if (picks.length < 7) add(id); });
    const usedSides = [];
    const kidMenus = shuffle(KIDS.map((k) => k.id));
    return shuffle(picks).map((id, i) => {
      const sideId = uniqueSide(MAIN[id].defaultSideId, usedSides);
      usedSides.push(sideId);
      return { mainId: id, sideId, kidMenuId: kidMenus[i % kidMenus.length] };
    });
  }
  function rerollDay(days, i) {
    const used = days.map((d) => d.mainId);
    const fromUser = Math.random() < 0.75;
    let pool = MAINS.filter((m) => !used.includes(m.id) && (fromUser ? m.source === 'user' : m.source === 'online'));
    if (!pool.length) pool = MAINS.filter((m) => !used.includes(m.id));
    const m = pick(pool);
    const usedSides = days.filter((_, k) => k !== i).map((d) => d.sideId);
    days[i] = Object.assign({}, days[i], { mainId: m.id, sideId: uniqueSide(m.defaultSideId, usedSides) });
  }
  function rerollKid(days, i) {
    const used = days.filter((d, k) => k !== i && !isKidOk(d.mainId)).map((d) => d.kidMenuId);
    used.push(days[i].kidMenuId);
    days[i] = Object.assign({}, days[i], { kidMenuId: freshKid(used) });
  }
  function rerollSide(days, i) {
    // Swap only the side dish: never the current one, never one already used this week.
    const used = days.map((d) => d.sideId);
    const pool = SIDES.map((s) => s.id).filter((id) => !used.includes(id));
    const fallback = SIDES.map((s) => s.id).filter((id) => id !== days[i].sideId);
    const next = pick(pool.length ? pool : fallback);
    if (next) days[i] = Object.assign({}, days[i], { sideId: next });
  }
  const kidIdFor = (d) => (isKidOk(d.mainId) ? null : d.kidMenuId);

  // ---------- Shopping list ----------
  function buildShopping(days) {
    const map = {};
    days.forEach((d, i) => {
      const parts = [[d.mainId, DAY_LABEL[i]], [d.sideId, DAY_LABEL[i]], [d.kidId, 'Anak ' + DAY_LABEL[i]]];
      parts.forEach(([rid, label], p) => {
        const r = rid && R[rid];
        if (!r) return;
        r.ingredients.forEach((ing) => {
          if (!ING[ing.id]) return;
          const e = map[ing.id] || (map[ing.id] = { id: ing.id, qty: 0, hasQty: false, uses: [], details: [] });
          if (typeof ing.qty === 'number') { e.qty += ing.qty; e.hasQty = true; }
          if (!e.uses.includes(label)) e.uses.push(label);
          e.details.push({
            day: DAY_NAMES[i],
            dish: r.name,
            role: p === 0 ? 'Utama' : p === 1 ? 'Pendamping' : 'Anak',
            qty: fmtQty(typeof ing.qty === 'number' ? ing.qty : null, ING[ing.id].unit)
          });
        });
      });
    });
    return CATS.map((c) => {
      const items = Object.values(map)
        .filter((e) => ING[e.id].category === c.id)
        .map((e) => ({
          id: e.id,
          name: ING[e.id].name,
          pantry: !!ING[e.id].pantry,
          qty: e.hasQty ? fmtQty(e.qty, ING[e.id].unit) : 'secukupnya',
          use: e.uses.length >= 6 ? 'hampir semua menu' : e.uses.join(', '),
          details: e.details
        }))
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
    else html = (ui.tab === 'home' ? viewHome() : ui.tab === 'shop' ? viewShop() : viewFav()) + tabbar();
    if (ui.sheet) html += viewSheet();
    if (ui.toast) html += `<div class="toast" role="status">${esc(ui.toast.text)}${ui.toast.undo ? ' · <button class="text-btn small" style="color:#fff;text-decoration:underline" data-act="undo">Urungkan</button>' : ''}</div>`;
    app.innerHTML = html;
    app.querySelectorAll('[data-scroll]').forEach((el) => { if (scrolls[el.dataset.scroll] != null) el.scrollTop = scrolls[el.dataset.scroll]; });
  }

  function toast(text, undo) {
    ui.toast = { text, undo };
    render();
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { ui.toast = null; render(); }, undo ? 5000 : 2500);
  }

  function tabbar() {
    const left = S.plan ? countLeft() : 0;
    const tab = (id, ic, label, extra = '') =>
      `<button type="button" data-act="tab" data-tab="${id}" ${ui.tab === id ? 'aria-current="page"' : ''}>${ic}${label}${extra}</button>`;
    return `<nav class="tabbar" aria-label="Navigasi utama">
      ${tab('home', icon('cal', 24), 'Minggu Ini')}
      ${tab('shop', icon('bag', 24), 'Belanja', left ? `<span class="count" aria-label="${left} belum dibeli">${left}</span>` : '')}
      ${tab('fav', icon('heart', 24), 'Favorit')}
    </nav>`;
  }

  function countLeft() {
    let left = 0;
    buildShopping(planDaysForShopping(S.plan.days)).forEach((c) => c.items.forEach((it) => { if (!S.shopping[it.id]) left++; }));
    return left;
  }

  // Home ------------------------------------------------------------
  function viewHome() {
    if (!S.plan) return viewHomeEmpty();
    const p = S.plan;
    const dates = weekDates(p.weekStart);
    const ti = todayIndex(p.weekStart);
    const done = p.days.filter((d) => d.done).length;
    const cats = buildShopping(planDaysForShopping(p.days));
    let total = 0, bought = 0;
    cats.forEach((c) => c.items.forEach((it) => { total++; if (S.shopping[it.id]) bought++; }));
    const rows = p.days.map((d, i) => {
      const fav = isFav(d.mainId, d.sideId);
      return `<li class="card menu-card ${i === ti ? 'is-today' : ''} ${d.done ? 'done' : ''}" style="padding:6px 6px 6px 12px;gap:10px">
        <button type="button" class="row-link" data-act="open-day" data-i="${i}">
          <span class="day-col ${i === ti ? 'today' : ''}"><span class="dn">${DAY_SHORT[i]}</span><span class="dd">${dates[i].getDate()}</span></span>
          <span class="vline" aria-hidden="true"></span>
          <span class="names">
            ${i === ti ? '<span class="today-tag">Hari ini</span>' : ''}
            <span class="main"><span>${esc(nameOf(d.mainId))}</span></span>
            <span class="side">+ ${esc(nameOf(d.sideId))}</span>
            <span class="kidline">Anak: ${d.kidId ? esc(nameOf(d.kidId)) : 'sama'}</span>
          </span>
        </button>
        <button type="button" class="heart-btn" data-act="fav-day" data-i="${i}" aria-pressed="${fav}" aria-label="${fav ? 'Hapus dari favorit' : 'Tambah ke favorit'}: ${esc(nameOf(d.mainId))}">${icon('heart')}</button>
        <button type="button" class="check-btn" data-act="done-day" data-i="${i}" aria-pressed="${!!d.done}" aria-label="${d.done ? 'Batalkan tanda sudah dimasak' : 'Tandai sudah dimasak'}: ${DAY_NAMES[i]}"><span class="ring">${d.done ? icon('check', 16, 'stroke-width="3"') : ''}</span></button>
      </li>`;
    }).join('');
    return `<section class="screen">
      <header class="page-head">
        <div><p class="eyebrow">${rangeLabel(p.weekStart)}</p><h1>Minggu Ini</h1></div>
        <div style="display:flex;gap:8px">
          ${cloudButton()}
          <button type="button" class="icon-btn round" data-act="new-plan" aria-label="Buat menu baru">${icon('spark')}</button>
          <button type="button" class="pill-btn" data-act="reorder">${icon('sort', 18)}Atur</button>
        </div>
      </header>
      <div class="stats">
        <div class="card stat">
          <span class="label">Sudah dimasak</span>
          <span class="value">${done}<small> / 7</small></span>
          <div class="bar" role="progressbar" aria-label="Progres memasak" aria-valuemin="0" aria-valuemax="7" aria-valuenow="${done}"><span style="width:${Math.round(done / 7 * 100)}%"></span></div>
        </div>
        <button type="button" class="card stat" data-act="tab" data-tab="shop">
          <span class="label">Daftar belanja ${icon('right', 14)}</span>
          <span class="value">${total - bought}<small> lagi</small></span>
          <span class="bar" aria-hidden="true"><span style="width:${total ? Math.round(bought / total * 100) : 0}%"></span></span>
        </button>
      </div>
      <ul class="scroll list" data-scroll="home" style="padding:14px 16px 16px">${rows}</ul>
    </section>`;
  }

  function viewHomeEmpty() {
    const favs = S.favorites.slice(0, 2).map((k) => {
      const [m, s] = k.split('|');
      return `<button type="button" class="card" data-act="open-fav" data-key="${esc(k)}" style="padding:14px;display:flex;flex-direction:column;gap:6px;text-align:left">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--heart)" stroke="var(--heart)" stroke-width="2" aria-hidden="true">${P.heart}</svg>
        <span style="font-size:14px;font-weight:700">${esc(nameOf(m))}</span>
        <span style="font-size:12px;color:var(--muted)">+ ${esc(nameOf(s))}</span>
      </button>`;
    }).join('');
    return `<section class="screen">
      <header class="page-head"><div><p class="eyebrow">Minggu depan · ${rangeLabel(iso(upcomingMonday()))}</p><h1>Menu Mingguan</h1></div>${cloudButton()}</header>
      <div class="scroll" data-scroll="empty">
        <section class="card empty">
          <div class="ico">${icon('cal', 26)}</div>
          <div style="display:flex;flex-direction:column;gap:8px">
            <h2>Belum ada menu untuk minggu ini</h2>
            <p>Buat 7 set menu rumahan — satu lauk utama dan satu pendamping per hari, plus menu anak — lengkap dengan daftar belanjanya.</p>
          </div>
          <ol class="steps-mini">
            <li><span>1</span>Pilih 7 set menu yang cocok</li>
            <li><span>2</span>Cek daftar belanja per kategori</li>
            <li><span>3</span>Konfirmasi, lalu mulai masak</li>
          </ol>
          <button type="button" class="btn primary block" data-act="new-plan">${icon('spark')}Buat Menu 7 Hari</button>
        </section>
        ${favs ? `<section style="margin:28px 20px 20px;display:flex;flex-direction:column;gap:12px">
          <div style="display:flex;align-items:baseline;justify-content:space-between"><h2 style="font-size:17px">Dari favoritmu</h2><button type="button" class="text-btn small accent" data-act="tab" data-tab="fav">Lihat semua</button></div>
          <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">${favs}</div>
        </section>` : ''}
      </div>
    </section>`;
  }

  // Shopping tab ------------------------------------------------------
  function viewShop() {
    if (!S.plan) {
      return `<section class="screen"><header class="page-head"><div><p class="eyebrow">Belum ada menu</p><h1>Belanja</h1></div></header>
        <div class="card empty"><div class="ico">${icon('bag', 26)}</div><h2>Daftar belanja masih kosong</h2>
        <p>Daftar belanja dibuat otomatis dari 7 menu yang kamu pilih, dan tetap tersimpan di sini selama seminggu.</p>
        <button type="button" class="btn primary block" data-act="new-plan">${icon('spark')}Buat Menu 7 Hari</button></div></section>`;
    }
    const cats = buildShopping(planDaysForShopping(S.plan.days));
    let total = 0, bought = 0;
    cats.forEach((c) => c.items.forEach((it) => { total++; if (S.shopping[it.id]) bought++; }));
    return `<section class="screen">
      <header class="page-head"><div><p class="eyebrow">Untuk menu ${rangeLabel(S.plan.weekStart)}</p><h1>Belanja</h1></div></header>
      <div class="card" style="margin:14px 20px 0;padding:14px 16px;display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
          <b style="font-size:14px">${bought} dari ${total} sudah dibeli</b>
          <button type="button" class="text-btn small accent" style="margin:-12px -8px" data-act="shop-hide" aria-pressed="${ui.shopHide}">${ui.shopHide ? 'Tampilkan semua' : 'Sembunyikan yang dibeli'}</button>
        </div>
        <div class="bar" role="progressbar" aria-label="Progres belanja" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${bought}"><span style="width:${total ? Math.round(bought / total * 100) : 0}%"></span></div>
      </div>
      ${shoppingBody(cats, S.shopping, 'shop', ui.shopHide, 'toggle-shop')}
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
  function viewFav() {
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
    return `<section class="screen">
      <header class="page-head"><div><p class="eyebrow">${S.favorites.length} set menu yang kamu suka</p><h1>Favorit</h1></div></header>
      <div style="padding:16px 20px 0;display:flex;flex-direction:column;gap:6px">
        <label for="cari" style="font-size:12px;font-weight:700;color:var(--muted)">Cari favorit</label>
        <div class="search">${icon('search', 18)}<input id="cari" type="search" placeholder="Rawon, soto, ayam…" value="${esc(ui.favQuery)}" data-act="fav-search" autocomplete="off"></div>
      </div>
      <ul class="scroll list" data-scroll="fav" style="padding:16px 16px 16px">
        ${list || `<li class="empty-cat">${q ? 'Tidak ada favorit yang cocok.' : 'Belum ada favorit. Ketuk ♥ pada menu untuk menyimpannya di sini.'}</li>`}
      </ul>
    </section>`;
  }

  // Detail (day of plan) ------------------------------------------------
  function recipeBlock(rid) {
    const r = R[rid];
    if (!r) return `<p class="empty-cat">Resep untuk ${esc(nameOf(rid))} belum tersedia.</p>`;
    const groups = CATS.map((c) => {
      const items = r.ingredients.filter((ing) => ING[ing.id] && ING[ing.id].category === c.id);
      if (!items.length) return '';
      return `<div class="card ing-group">
        <p style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)">${c.id === 'misc' ? 'Lainnya' : c.label}</p>
        <ul style="display:flex;flex-direction:column;gap:6px">${items.map((ing) =>
          `<li><b>${esc(ING[ing.id].name)}${ing.note ? ` <em>· ${esc(ing.note)}</em>` : ''}</b><span>${esc(fmtQty(ing.qty, ING[ing.id].unit))}</span></li>`).join('')}</ul>
      </div>`;
    }).join('');
    return `<section style="display:flex;flex-direction:column;gap:10px"><h2 class="h2">Bahan · ${esc(r.name)}</h2>
        <p style="font-size:13px;color:var(--muted)">Untuk ${r.servings} porsi${r.type === 'kid' ? ' anak' : ''}</p>${groups}</section>
      <section style="display:flex;flex-direction:column;gap:12px"><h2 class="h2">Langkah memasak</h2>
        <ol class="steps">${r.steps.map((s, i) => `<li><span class="n">${i + 1}</span><p>${esc(s)}</p></li>`).join('')}</ol></section>`;
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
    const d = S.plan.days[i];
    const date = weekDates(S.plan.weekStart)[i];
    const ti = todayIndex(S.plan.weekStart);
    const fav = isFav(d.mainId, d.sideId);
    const rid = ui.detailTab === 'side' ? d.sideId : ui.detailTab === 'kid' ? d.kidId : d.mainId;
    const totalTime = (R[d.mainId] ? R[d.mainId].timeMinutes : 0);
    return `<section class="screen">
      <header class="nav-head">
        <button type="button" class="text-btn accent" data-act="back">${icon('left', 22)}Minggu Ini</button>
        <button type="button" class="icon-btn" style="border-radius:22px;background:${fav ? 'var(--heart-soft)' : '#fff'};color:var(--heart)" data-act="fav-day" data-i="${i}" aria-pressed="${fav}" aria-label="${fav ? 'Hapus dari favorit' : 'Tambah ke favorit'}">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="${fav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" aria-hidden="true">${P.heart}</svg>
        </button>
      </header>
      <div class="scroll" data-scroll="detail-${i}-${ui.detailTab}" style="padding:8px 20px 24px;display:flex;flex-direction:column;gap:18px">
        <div class="detail-title">
          <p class="kicker">${DAY_NAMES[i]}, ${date.getDate()} ${MONTHS[date.getMonth()]}${i === ti ? ' · Hari ini' : ''}</p>
          <h1>${esc(nameOf(d.mainId))}</h1>
          <p class="sub">+ ${esc(nameOf(d.sideId))}</p>
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
    const dates = weekDates(S.plan.weekStart);
    const rows = order.map((d, pos) => `<li class="reorder-row" data-pos="${pos}">
        <span class="day-col"><span class="dn">${DAY_SHORT[pos]}</span><span class="dd">${dates[pos].getDate()}</span></span>
        <span class="card reorder-card ${ui.view.moved === d ? 'moved' : ''}" data-card="${pos}">
          <span class="grip" data-grip="${pos}" aria-hidden="true">${grip}</span>
          <span class="names"><span class="main"><span>${esc(nameOf(d.mainId))}</span></span><span class="side">+ ${esc(nameOf(d.sideId))}</span></span>
          <button type="button" class="arrow-btn" data-act="move" data-pos="${pos}" data-dir="-1" ${pos === 0 ? 'disabled' : ''} aria-label="Pindah ${esc(nameOf(d.mainId))} ke ${pos ? DAY_NAMES[pos - 1] : ''}">${icon('up', 20, 'stroke-width="2.2"')}</button>
          <button type="button" class="arrow-btn" data-act="move" data-pos="${pos}" data-dir="1" ${pos === 6 ? 'disabled' : ''} aria-label="Pindah ${esc(nameOf(d.mainId))} ke ${pos < 6 ? DAY_NAMES[pos + 1] : ''}">${icon('down', 20, 'stroke-width="2.2"')}</button>
        </span>
      </li>`).join('');
    const changed = order.some((d, i) => d !== S.plan.days[i]);
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
    const mineCount = days.filter((d) => MAIN[d.mainId].source === 'user').length;
    const kidSame = days.filter((d) => isKidOk(d.mainId)).length;
    const adult = days.map((d, i) => {
      const m = MAIN[d.mainId];
      const kid = isKidOk(d.mainId);
      return `<li class="card menu-card stack">
        <div class="row">
          <span class="day-col"><span class="dn">${DAY_SHORT[i]}</span><span class="dd">${dates[i].getDate()}</span></span>
          <span class="vline" aria-hidden="true"></span>
          <span class="names">
            <span class="main"><span>${esc(m.name)}</span>${favMainIds().includes(m.id) ? smallHeart : ''}${m.source === 'online' ? '<span class="badge-online">Online</span>' : ''}</span>
            <span class="side">+ ${esc(nameOf(d.sideId))}</span>
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
        </div>
      </li>`;
    }).join('');
    const kids = days.map((d, i) => {
      const same = isKidOk(d.mainId);
      return `<li class="card menu-card ${same ? '' : 'kid-auto'}" style="min-height:66px">
        <span class="day-col"><span class="dn">${DAY_SHORT[i]}</span><span class="dd">${dates[i].getDate()}</span></span>
        <span class="vline" aria-hidden="true"></span>
        <span class="names">
          <span class="tag ${same ? '' : 'kid'}">${same ? 'Ikut menu dewasa' : 'Khusus anak'}</span>
          <span class="main"><span>${esc(same ? nameOf(d.mainId) : nameOf(d.kidMenuId))}</span></span>
        </span>
        ${same ? '' : `<button type="button" class="icon-btn kid" data-act="reroll-kid" data-i="${i}" aria-label="Acak ulang menu anak ${DAY_NAMES[i]}">${icon('refresh')}</button>`}
      </li>`;
    }).join('');
    return `<div class="sheet-body" data-scroll="step1">
      <div class="intro"><p class="kicker">Langkah 1 · Pilih menu</p><p>Acak ulang yang belum cocok, lalu tandai menu yang aman untuk anak.</p></div>
      <div class="note">${icon('book', 18, 'style="flex-shrink:0;color:var(--accent)"')}<span><strong>Dari koleksi menumu</strong>${MAINS.filter((m) => m.source === 'user').length} menu utama + ${SIDES.length} pendamping milikmu, ditambah ${MAINS.filter((m) => m.source === 'online').length} resep online. Minggu ini ${mineCount} dari 7 menu dari koleksimu.</span></div>
      <button type="button" class="switch-row" role="switch" aria-checked="${S.preferFav}" data-act="prefer-fav">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--heart)" stroke="var(--heart)" stroke-width="2" aria-hidden="true" style="flex-shrink:0">${P.heart}</svg>
        <span class="txt"><b>Utamakan menu favorit</b><small>${favCount} dari 7 menu ini favoritmu</small></span>
        <span class="switch" aria-hidden="true"></span>
      </button>
      <div class="section-head"><h2>Menu Dewasa</h2><button type="button" class="text-btn small accent" style="margin:-12px -8px" data-act="shuffle-all">${icon('shuffle', 16)}Acak semua</button></div>
      <ul class="list">${adult}</ul>
      <div class="intro" style="margin-top:10px">
        <div class="section-head" style="padding:0"><h2 class="kid">${icon('kid')}Menu Anak</h2></div>
        <p style="font-size:13px">${kidSame} hari ikut menu dewasa yang ramah anak · ${7 - kidSame} hari dibuatkan 1 menu utama khusus anak.</p>
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
    const kidAuto = days.filter((d) => !isKidOk(d.mainId)).length;
    return `<div class="sheet-body" data-scroll="step3">
      <div class="intro"><p class="kicker">Langkah 3 · Konfirmasi</p><h2>Siap untuk minggu depan?</h2></div>
      <div class="summary">
        <div class="range">${icon('cal', 18)}${DAY_NAMES[0]}, ${dates[0].getDate()} ${MONTHS[dates[0].getMonth()]} – ${DAY_NAMES[6]}, ${dates[6].getDate()} ${MONTHS[dates[6].getMonth()]} ${dates[6].getFullYear()}</div>
        <div class="nums">
          <div><b>7</b><span>set menu dewasa</span></div>
          <div><b>${kidAuto}</b><span>menu khusus anak</span></div>
          <div><b>${need}</b><span>bahan perlu dibeli</span></div>
        </div>
      </div>
      <ul class="card plain-list">${days.map((d, i) => `<li>
        <span class="d">${DAY_LABEL[i]} ${dates[i].getDate()}</span>
        <span class="names"><span class="main" style="font-size:14px"><span>${esc(nameOf(d.mainId))}</span></span>
        <span class="side" style="font-size:12px">+ ${esc(nameOf(d.sideId))}</span>
        <span class="kidline">Anak: ${isKidOk(d.mainId) ? 'ikut menu dewasa' : esc(nameOf(d.kidMenuId))}</span></span>
      </li>`).join('')}</ul>
      <p class="hint">${icon('info', 18, 'style="flex-shrink:0"')}<span>Urutan hari masih bisa diatur ulang dari Beranda, dan daftar belanja tetap tersimpan di tab Belanja selama seminggu.</span></p>
    </div>`;
  }

  // ---------- Actions ----------
  function openSheet() {
    ui.sheet = { step: 1, weekStart: iso(upcomingMonday()), days: generateDays(), have: {}, fresh: true };
    render();
  }

  const actions = {
    'tab': (el) => { ui.tab = el.dataset.tab; ui.view = null; render(); },
    'open-sync': () => { ui.view = { type: 'sync' }; render(); },
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
        if (S.plan && !window.confirm('Menu dan daftar belanja di device ini akan diganti dengan data keluarga. Lanjutkan?')) return;
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
    'new-plan': () => {
      if (S.plan && !window.confirm('Buat menu baru? Menu dan daftar belanja minggu ini akan diganti.')) return;
      openSheet();
    },
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
    'reroll-kid': (el) => { rerollKid(ui.sheet.days, +el.dataset.i); render(); },
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
      S.plan = { weekStart: sh.weekStart, days: sh.days.map((d) => ({ mainId: d.mainId, sideId: d.sideId, kidId: kidIdFor(d), done: false })) };
      S.shopping = shopping;
      save();
      ui.sheet = null; ui.tab = 'home'; ui.view = null;
      toast('Menu minggu ini tersimpan');
    },
    'open-day': (el) => { ui.view = { type: 'detail', day: +el.dataset.i }; ui.detailTab = 'main'; render(); },
    'open-fav': (el) => { ui.view = { type: 'fav', key: el.dataset.key }; ui.detailTab = 'main'; render(); },
    'back': () => { ui.view = null; render(); },
    'detail-tab': (el) => { ui.detailTab = el.dataset.tab; render(); },
    'done-day': (el) => { const d = S.plan.days[+el.dataset.i]; d.done = !d.done; save(); render(); },
    'fav-day': (el) => {
      const d = S.plan.days[+el.dataset.i];
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
      if (ui.lastRemoved && !S.favorites.includes(ui.lastRemoved.k)) {
        S.favorites.splice(ui.lastRemoved.idx, 0, ui.lastRemoved.k);
        save();
      }
      ui.lastRemoved = null; ui.toast = null; render();
    },
    'shop-hide': () => { ui.shopHide = !ui.shopHide; render(); },
    'jump': (el) => { const t = document.getElementById(el.dataset.target); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
    'reorder': () => { ui.view = { type: 'reorder', order: S.plan.days.slice(), moved: null }; render(); },
    'move': (el) => { moveItem(+el.dataset.pos, +el.dataset.pos + +el.dataset.dir); },
    'reset-order': () => { ui.view.order = S.plan.days.slice(); ui.view.moved = null; render(); },
    'save-order': () => { S.plan.days = ui.view.order.slice(); save(); ui.view = null; toast('Urutan menu diperbarui'); }
  };

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
    if (el.dataset.act === 'toggle-shop') { S.shopping[el.dataset.id] = el.checked; save(); render(); }
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
  });

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
