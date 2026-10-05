// Loot-Vergabe: the loot history (lootAwards), the decision aid and the
// "Loot" page. Items are handed out in a raid's Loot tab, in Loot-Runden
// with a voting pop-up for the Loot Council (js/loot-session.js).
//
// Firebase (own listener, members+ read, Officers / Admins write —
// README § 6f):
//  - lootAwards/<id> = { eventId, itemId, itemName, uid, charName, classId,
//    specId, kind: 'ms' | 'os' | 'other', note, by, at, boss?, ext?,
//    sessionId? } (boss / ext = RCLootCouncil row id from the import,
//    sessionId = the Loot-Runde it was decided in)
//
// The decision aid (lootCandidates) lists every character in the raid —
// the Aufstellung (js/raid-comp.js), else everybody signed up (Dabei /
// Vielleicht) — with what speaks for them:
//  - BiS: the item is on the BiS set the character has assigned for the
//    signed-up spec (Meine Charaktere → Character.bisSets) and not ticked
//    "Habe ich" (bisOwned). Only public sets are readable for officers;
//  - Soft-Reserve of this event;
//  - Anwesenheit: in the line-up (or, without one, signed up as "Dabei")
//    for the last 10 earlier raids;
//  - Loot: main-spec items received in the last 30 days;
//  - Main / Twink (the character's raid status).
// and a suggested order: BiS + SR first, then main before twink, less
// recent loot, more attendance. The Loot Council decides.

const LOOT_KIND_LABELS = { ms: 'Main-Spec', os: 'Off-Spec', other: 'Sonstiges' };
const LOOT_RECENT_MS = 30 * 24 * 3600 * 1000;
const LOOT_ATTENDANCE_EVENTS = 10;
const LOOT_RESULTS = 12;

/** @type {Record<string, LootAward>} */
let lootAwards = {};
let lootSyncUid = '';
let lootLoadError = '';
/** Loot page filter. */
let lootPageQuery = '';
let lootPageView = 'raids'; // 'raids' | 'players'

function lootSync(){
  const uid = (db && discordIdentity) ? discordIdentity.id : '';
  if (!uid || uid === lootSyncUid) return;
  lootSyncUid = uid;
  db.ref(`${DB_PATH}/lootAwards`).on('value', snap => {
    /** @type {Record<string, LootAward>} */
    const out = {};
    for (const [id, raw] of Object.entries(snap.val() || {})) { const a = lootNormalize(raw); if (a) out[id] = a; }
    lootAwards = out;
    lootLoadError = '';
    lootRerender();
  }, () => { lootLoadError = 'Keine Leserechte für den Loot — nur für Gildenmitglieder, oder Firebase-Regeln nicht aktualisiert.'; lootRerender(); });
}
function lootRerender(){
  if (currentPage === 'raids') renderRaidsPage();
  if (currentPage === 'loot') renderLootPage();
}

/** @param {any} raw @returns {LootAward | null} */
function lootNormalize(raw){
  if (!raw || typeof raw !== 'object' || !(Number(raw.itemId) > 0) || typeof raw.uid !== 'string') return null;
  return {
    eventId: String(raw.eventId || ''),
    itemId: Number(raw.itemId),
    itemName: String(raw.itemName || '').slice(0, 100),
    uid: raw.uid,
    charName: String(raw.charName || '').slice(0, 40),
    classId: CLASS_MAP[raw.classId] ? raw.classId : '',
    specId: String(raw.specId || ''),
    kind: LOOT_KIND_LABELS[raw.kind] ? raw.kind : 'other',
    note: String(raw.note || '').slice(0, 120),
    by: String(raw.by || ''),
    at: Number(raw.at) || 0,
    // From the RCLootCouncil import (js/loot-import.js).
    ...(raw.boss ? { boss: String(raw.boss).slice(0, 60) } : {}),
    ...(raw.ext ? { ext: String(raw.ext).slice(0, 60) } : {}),
    ...(raw.sessionId ? { sessionId: String(raw.sessionId).slice(0, 40) } : {})
  };
}

/** Item name (from the data, else the stored one). @param {LootAward} a */
function lootItemName(a){
  const it = bisData && bisData.byId.get(a.itemId);
  return it ? it.n : (a.itemName || `Item #${a.itemId}`);
}
/** Item chip with tooltip. @param {number} itemId @param {string} [fallback] */
function lootItemHtml(itemId, fallback){
  const it = bisData && bisData.byId.get(itemId);
  return `<span class="loot-item" data-item-id="${itemId}">${it ? bisIconHtml(it, 20) : ''}<span style="color:${it ? bisQualityColor(it) : 'var(--text)'}">${escapeHtml(it ? it.n : (fallback || `Item #${itemId}`))}</span></span>`;
}
/** Character name in class color. @param {{ charName: string, classId: string }} a */
function lootCharHtml(a){
  const cls = CLASS_MAP[a.classId];
  return `<span class="loot-char" style="color:${cls ? cls.color : 'var(--text)'}">${escapeHtml(a.charName || 'Unbekannt')}</span>`;
}

// ---------------------------------------------------------------- decision aid
/**
 * Everybody signed up for the event, with the decision-aid facts, in the
 * suggested order.
 * @param {string} eventId @param {number} itemId
 */
function lootCandidates(eventId, itemId){
  const ev = raidEvents[eventId];
  const item = bisData && bisData.byId.get(itemId);
  const sameItem = id => id === itemId || Boolean(item && bisData.byId.get(id) && bisData.byId.get(id).n === item.n);
  const now = Date.now();
  const earlier = Object.entries(raidEvents).filter(([id, e]) => id !== eventId && ev && e.start < ev.start)
    .sort((a, z) => z[1].start - a[1].start).slice(0, LOOT_ATTENDANCE_EVENTS);
  const reserves = (raidReserves[eventId] || {});
  // With a line-up (Aufstellung) only its characters are in the raid;
  // without one everybody signed up (each signed-up character).
  const inRaid = (id, e) => {
    const all = raidSignupList(id).filter(x => x.status !== 'no');
    return e && Object.keys(e.roster).length ? all.filter(x => e.roster[x.key]) : all;
  };
  const wasThere = (id, uid) => inRaid(id, raidEvents[id]).some(x => x.uid === uid && (raidEvents[id] && Object.keys(raidEvents[id].roster).length ? true : x.status === 'yes'));
  const list = inRaid(eventId, ev).map(s => {
    const uid = s.uid;
    const char = raidSignupChar(uid, s.charKey, s.charName);
    const setId = char && char.bisSets && char.bisSets[s.specId];
    const set = setId ? bisAnySet(setId) : null;
    let bis = 'none';
    if (setId && !set) bis = 'private';
    else if (set){
      const inSet = Object.values(set.slots).some(sameItem);
      bis = !inSet ? 'no' : (bisNeedHas(uid, itemId) ? 'owned' : 'yes');
    }
    const sr = Boolean(reserves[uid] && reserves[uid].items.some(sameItem));
    const attended = earlier.filter(([id]) => wasThere(id, uid)).length;
    const loot = Object.values(lootAwards).filter(a => a.uid === uid && a.kind === 'ms' && now - a.at < LOOT_RECENT_MS).length;
    const hasItem = Object.values(lootAwards).some(a => a.uid === uid && sameItem(a.itemId));
    return {
      uid, key: s.key, s, char, setId, bis, sr, attended, ofEvents: earlier.length, loot, hasItem,
      isMain: char ? characterIsRaider(char) : null,
      tier: Number(bis === 'yes') + Number(sr)
    };
  });
  list.sort((a, z) => z.tier - a.tier
    || Number(a.hasItem) - Number(z.hasItem)
    || Number(a.s.status === 'maybe') - Number(z.s.status === 'maybe')
    || Number(z.isMain === true) - Number(a.isMain === true)
    || a.loot - z.loot
    || z.attended - a.attended
    || (a.s.charName || '').localeCompare(z.s.charName || '', 'de'));
  return list;
}

/**
 * Item search results (rare+, drops of the instance first, one result
 * per name and stats). Each result is a button with
 * data-<attr>="<ctx>|<itemId>". @param {string} ctx @param {string} instance
 * @param {string} query @param {string} attr
 */
function lootSearchHtml(ctx, instance, query, attr){
  const q = (query || '').trim().toLowerCase();
  if (q.length < 2 || !bisData) return '';
  const seen = new Map();
  for (const it of bisData.items.items) {
    if (it.q < 2 || !it.n.toLowerCase().includes(q)) continue;
    const here = Boolean(instance && it.src && (it.src.drops || []).some(d => d.z === instance));
    const key = it.n + '|' + JSON.stringify(it.s || []);
    const prev = seen.get(key);
    if (!prev || (here && !prev.here) || (here === prev.here && Boolean(it.src) && !prev.it.src)) seen.set(key, { it, here });
  }
  const hits = [...seen.values()].sort((a, z) => Number(z.here) - Number(a.here) || z.it.q - a.it.q || (z.it.il || 0) - (a.it.il || 0) || a.it.n.localeCompare(z.it.n)).slice(0, LOOT_RESULTS);
  if (!hits.length) return '<div class="raid-sr-result-empty">Nichts gefunden.</div>';
  return hits.map(({ it, here }) => `<button type="button" class="raid-sr-result" data-${attr}="${escapeHtml(ctx)}|${it.id}" data-item-id="${it.id}">
    ${bisIconHtml(it, 22)}<span style="color:${bisQualityColor(it)}">${escapeHtml(it.n)}</span>
    <span class="bis-item-meta">${escapeHtml([here ? instance : bisTypeLabel(it), bisStatLine(it)].filter(Boolean).join(' · '))}</span>
  </button>`).join('');
}

/** One line of the loot history. @param {string} aid @param {LootAward} a @param {boolean} officer */
function lootAwardRowHtml(aid, a, officer){
  return `<div class="loot-award-row">
    ${lootItemHtml(a.itemId, a.itemName)} → ${lootCharHtml(a)} <span class="loot-tag">${LOOT_KIND_LABELS[a.kind]}</span>
    ${a.boss ? `<span class="bis-item-meta">${escapeHtml(a.boss)}</span>` : ''}${a.note ? `<span class="bis-item-meta">${escapeHtml(a.note)}</span>` : ''}
    ${officer ? `<button type="button" class="loot-del" data-loot-delete="${escapeHtml(aid)}" aria-label="Vergabe löschen" title="Vergabe löschen">×</button>` : ''}
  </div>`;
}

/** @param {string} awardId */
async function lootDelete(awardId){
  const a = lootAwards[awardId];
  if (!a) return;
  const answer = await bisDialog('Vergabe löschen?', `${lootItemName(a)} an ${a.charName} wird aus der Historie entfernt.`,
    [{ id: 'delete', label: 'Löschen', primary: true }, { id: 'cancel', label: 'Abbrechen' }]);
  if (answer !== 'delete') return;
  /** @type {Record<string, any>} */
  const updates = { [`lootAwards/${awardId}`]: null };
  // An award from a Loot-Runde: its item is open again.
  const ref = lootSessionItemOfAward(a.eventId, awardId);
  if (ref) Object.assign(updates, { [`${ref}/awardId`]: null, [`${ref}/done`]: null });
  try { await db.ref(DB_PATH).update(updates); }
  catch (err){ raidStatusMsg = 'Löschen fehlgeschlagen.'; lootRerender(); }
}

/** Wire the history's delete buttons inside root. @param {HTMLElement} root */
function lootWire(root){
  root.querySelectorAll('[data-loot-delete]').forEach(btn => btn.addEventListener('click', () => lootDelete(btn.getAttribute('data-loot-delete'))));
}

// ---------------------------------------------------------------- Loot page
function renderLootPage(){
  const root = document.getElementById('lootRoot');
  if (!root) return;
  if (!discordIdentity){
    root.innerHTML = '<div class="tac-card"><p class="bis-hint">Die Loot-Historie sehen alle Gildenmitglieder. Melde Dich oben rechts an.</p></div>';
    return;
  }
  lootSync();
  raidSync();
  if (!bisData) bisLoadData().then(() => { if (currentPage === 'loot') renderLootPage(); }).catch(() => {});
  const focused = document.activeElement && document.activeElement.id === 'lootSearch';
  const tab = (id, label) => `<button type="button" class="bis-tab${lootPageView === id ? ' active' : ''}" data-loot-view="${id}">${label}</button>`;
  root.innerHTML = `
    ${lootLoadError ? `<p class="bis-hint raid-error">${escapeHtml(lootLoadError)}</p>` : ''}
    <div class="bis-tabs">${tab('raids', 'Nach Raid')}${tab('players', 'Pro Spieler')}</div>
    <div class="bis-controls tac-card">
      <div class="bis-control bis-setbar-name">
        <label for="lootSearch">Suche</label>
        <input type="search" id="lootSearch" class="apply-text-input" placeholder="Spieler oder Item …" value="${escapeHtml(lootPageQuery)}" autocomplete="off">
      </div>
    </div>
    <div id="lootList">${lootPageListHtml()}</div>
    <p class="bis-hint">Vergeben wird im Raid selbst: Raids → Raid öffnen → „Loot“ → Loot-Runde starten (Import aus RCLootCouncil, Abstimmung des Loot Councils).</p>`;
  lootWire(root);
  root.querySelectorAll('[data-loot-view]').forEach(btn => btn.addEventListener('click', () => { lootPageView = btn.getAttribute('data-loot-view'); renderLootPage(); }));
  const search = /** @type {HTMLInputElement} */ (root.querySelector('#lootSearch'));
  search.addEventListener('input', () => {
    lootPageQuery = search.value;
    const list = root.querySelector('#lootList');
    if (list){ list.innerHTML = lootPageListHtml(); lootWire(/** @type {HTMLElement} */ (list)); }
  });
  if (focused){ search.focus(); search.setSelectionRange(search.value.length, search.value.length); }
}

function lootPageListHtml(){
  const q = lootPageQuery.trim().toLowerCase();
  const all = Object.entries(lootAwards)
    .filter(([, a]) => !q || a.charName.toLowerCase().includes(q) || lootItemName(a).toLowerCase().includes(q))
    .sort((a, z) => z[1].at - a[1].at);
  if (!all.length) return `<div class="tac-card"><p class="bis-hint">${q ? 'Nichts gefunden.' : 'Noch kein Loot vergeben.'}</p></div>`;
  const officer = isOfficerOrAdmin();
  const date = ms => new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  if (lootPageView === 'players'){
    /** @type {Map<string, { name: string, classId: string, ms: number, os: number, other: number, items: [string, LootAward][] }>} */
    const by = new Map();
    for (const [id, a] of all) {
      const key = a.uid + '|' + a.charName.toLowerCase();
      if (!by.has(key)) by.set(key, { name: a.charName, classId: a.classId, ms: 0, os: 0, other: 0, items: [] });
      const p = by.get(key);
      p[a.kind] += 1;
      p.items.push([id, a]);
    }
    const rows = [...by.values()].sort((a, z) => z.ms - a.ms || a.name.localeCompare(z.name, 'de'));
    return `<div class="tac-card"><table class="loot-table">
      <thead><tr><th>Charakter</th><th>Main-Spec</th><th>Off-Spec</th><th>Sonstiges</th><th>Zuletzt</th></tr></thead>
      <tbody>${rows.map(p => `<tr>
        <td>${lootCharHtml({ charName: p.name, classId: p.classId })}</td><td>${p.ms}</td><td>${p.os}</td><td>${p.other}</td>
        <td>${lootItemHtml(p.items[0][1].itemId, p.items[0][1].itemName)} <span class="bis-item-meta">${date(p.items[0][1].at)}</span></td>
      </tr>`).join('')}</tbody></table></div>`;
  }
  /** @type {Map<string, [string, LootAward][]>} */
  const byEvent = new Map();
  for (const entry of all) {
    const k = entry[1].eventId || '';
    if (!byEvent.has(k)) byEvent.set(k, []);
    byEvent.get(k).push(entry);
  }
  return [...byEvent].map(([eventId, list]) => {
    const e = raidEvents[eventId];
    return `<div class="tac-card loot-raid">
      <h3 class="bis-card-title">${e ? `${escapeHtml(e.title)} <span class="bis-item-meta">${escapeHtml(raidDateLabel(e.start))}</span>` : `Ohne Raid-Termin <span class="bis-item-meta">${date(list[0][1].at)}</span>`}</h3>
      ${list.map(([aid, a]) => lootAwardRowHtml(aid, a, officer)).join('')}
    </div>`;
  }).join('');
}
