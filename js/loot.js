// Loot-Vergabe (Loot Council with a decision aid) and the "Loot" page.
//
// Firebase (own listener, members+ read, Officers / Admins write —
// README § 6f):
//  - lootAwards/<id> = { eventId, itemId, itemName, uid, charName, classId,
//    specId, kind: 'ms' | 'os' | 'other', note, by, at, boss?, ext? }
//    (boss / ext = RCLootCouncil row id, from js/loot-import.js)
//
// Officers award items on a raid event's card ("Loot vergeben"): pick the
// item, then the decision aid lists everybody signed up (Dabei /
// Vielleicht) with what speaks for them —
//  - BiS: the item is on the BiS set the character has assigned for the
//    signed-up spec (Meine Charaktere → Character.bisSets) and not ticked
//    "Habe ich" (bisOwned). Only public sets are readable for officers;
//  - Soft-Reserve of this event;
//  - Anwesenheit: "Dabei" sign-ups for the last 10 earlier raids;
//  - Loot: main-spec items received in the last 30 days;
//  - Main / Twink (the character's isMain).
// and a suggested order: BiS + SR first, then main before twink, less
// recent loot, more attendance. Officers decide; the order is only a hint.

const LOOT_KIND_LABELS = { ms: 'Main-Spec', os: 'Off-Spec', other: 'Sonstiges' };
const LOOT_RECENT_MS = 30 * 24 * 3600 * 1000;
const LOOT_ATTENDANCE_EVENTS = 10;
const LOOT_RESULTS = 12;

/** @type {Record<string, LootAward>} */
let lootAwards = {};
let lootSyncUid = '';
let lootLoadError = '';
/** Event ids whose "Loot vergeben" panel is open. */
const lootPanelOpen = new Set();
/** Item search text / picked item per event. @type {Record<string, string>} */
const lootQuery = {};
/** @type {Record<string, number>} */
const lootPick = {};
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
    ...(raw.ext ? { ext: String(raw.ext).slice(0, 60) } : {})
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
  const list = Object.entries(raidSignups[eventId] || {}).filter(([, s]) => s.status !== 'no').map(([uid, s]) => {
    const prof = state.characterProfiles[uid];
    const char = prof && prof.characters.find(c => c.name.toLowerCase() === (s.charName || '').toLowerCase());
    const setId = char && char.bisSets && char.bisSets[s.specId];
    const set = setId ? bisAnySet(setId) : null;
    let bis = 'none';
    if (setId && !set) bis = 'private';
    else if (set){
      const inSet = Object.values(set.slots).some(sameItem);
      bis = !inSet ? 'no' : (bisNeedHas(uid, itemId) ? 'owned' : 'yes');
    }
    const sr = Boolean(reserves[uid] && reserves[uid].items.some(sameItem));
    const attended = earlier.filter(([id]) => raidSignups[id] && raidSignups[id][uid] && raidSignups[id][uid].status === 'yes').length;
    const loot = Object.values(lootAwards).filter(a => a.uid === uid && a.kind === 'ms' && now - a.at < LOOT_RECENT_MS).length;
    const hasItem = Object.values(lootAwards).some(a => a.uid === uid && sameItem(a.itemId));
    return {
      uid, s, char, setId, bis, sr, attended, ofEvents: earlier.length, loot, hasItem,
      isMain: char ? char.isMain : null,
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

/** Item search for the award panel: drops of the instance first. @param {string} eventId */
function lootSearchHtml(eventId){
  const q = (lootQuery[eventId] || '').trim().toLowerCase();
  if (q.length < 2 || !bisData) return '';
  const ev = raidEvents[eventId];
  const seen = new Map();
  for (const it of bisData.items.items) {
    if (it.q < 2 || !it.n.toLowerCase().includes(q)) continue;
    const here = Boolean(ev && ev.instance && it.src && (it.src.drops || []).some(d => d.z === ev.instance));
    const key = it.n + '|' + JSON.stringify(it.s || []);
    const prev = seen.get(key);
    if (!prev || (here && !prev.here) || (here === prev.here && Boolean(it.src) && !prev.it.src)) seen.set(key, { it, here });
  }
  const hits = [...seen.values()].sort((a, z) => Number(z.here) - Number(a.here) || z.it.q - a.it.q || (z.it.il || 0) - (a.it.il || 0) || a.it.n.localeCompare(z.it.n)).slice(0, LOOT_RESULTS);
  if (!hits.length) return '<div class="raid-sr-result-empty">Nichts gefunden.</div>';
  return hits.map(({ it, here }) => `<button type="button" class="raid-sr-result" data-loot-pick="${escapeHtml(eventId)}|${it.id}" data-item-id="${it.id}">
    ${bisIconHtml(it, 22)}<span style="color:${bisQualityColor(it)}">${escapeHtml(it.n)}</span>
    <span class="bis-item-meta">${escapeHtml([here ? ev.instance : bisTypeLabel(it), bisStatLine(it)].filter(Boolean).join(' · '))}</span>
  </button>`).join('');
}

/** Decision-aid table for the picked item. @param {string} eventId */
function lootCandidatesHtml(eventId){
  const itemId = lootPick[eventId];
  if (!itemId) return '';
  const rows = lootCandidates(eventId, itemId);
  const bisCell = {
    yes: '<span class="loot-tag loot-tag-good">BiS</span>',
    owned: '<span class="loot-tag" title="Steht auf der BiS-Liste, aber „Habe ich“ ist angehakt">hat es</span>',
    no: '<span class="bis-item-meta">—</span>',
    none: '<span class="bis-item-meta" title="Keine BiS-Liste für diesen Spec zugewiesen">keine Liste</span>',
    private: '<span class="bis-item-meta" title="Die zugewiesene BiS-Liste ist privat — für Officer nicht lesbar">privat</span>'
  };
  const table = rows.length ? `<table class="loot-table">
      <thead><tr><th>#</th><th>Charakter</th><th>BiS</th><th>SR</th><th title="„Dabei“ bei den letzten ${LOOT_ATTENDANCE_EVENTS} Raids">Anwesenheit</th><th title="Main-Spec-Items der letzten 30 Tage">Loot 30 T.</th><th></th></tr></thead>
      <tbody>${rows.map((r, i) => `<tr class="${r.tier ? 'loot-row-strong' : ''}">
        <td>${i + 1}</td>
        <td>${lootCharHtml({ charName: r.s.charName || r.s.name, classId: r.s.classId })}
          <span class="bis-item-meta">${escapeHtml(foreverSpecLabel(r.s.classId, r.s.specId))}${r.isMain === false ? ' · Twink' : ''}${r.s.status === 'maybe' ? ' · vielleicht' : ''}${r.hasItem ? ' · hat es schon bekommen' : ''}</span></td>
        <td>${bisCell[r.bis]}</td>
        <td>${r.sr ? '<span class="loot-tag loot-tag-good">SR</span>' : '<span class="bis-item-meta">—</span>'}</td>
        <td>${r.ofEvents ? `${r.attended}/${r.ofEvents}` : '<span class="bis-item-meta">—</span>'}</td>
        <td>${r.loot}</td>
        <td class="loot-actions">
          <button type="button" class="btn btn-teal btn-sm" data-loot-award="${escapeHtml(eventId)}|${r.uid}|ms">MS</button>
          <button type="button" class="btn btn-ghost btn-sm" data-loot-award="${escapeHtml(eventId)}|${r.uid}|os">OS</button>
        </td>
      </tr>`).join('')}</tbody>
    </table>` : '<p class="bis-hint">Noch niemand angemeldet.</p>';
  return `<div class="loot-picked">
      <div class="loot-picked-head">${lootItemHtml(itemId)}<button type="button" class="btn btn-ghost btn-sm" data-loot-unpick="${escapeHtml(eventId)}">Anderes Item</button></div>
      <input type="text" class="apply-text-input loot-note" data-loot-note="${escapeHtml(eventId)}" maxlength="120" placeholder="Notiz zur Vergabe (optional)">
      ${table}
      <p class="bis-hint">Reihenfolge = Vorschlag: BiS und Soft-Reserve zuerst, dann wer das Item noch nicht hat, Main vor Twink, weniger Loot in den letzten 30 Tagen, mehr Anwesenheit. Entscheiden tut der Loot Council.</p>
    </div>`;
}

/** Loot block of a raid card: awarded items (everyone) + award panel (officers). @param {string} id @param {RaidEvent} e */
function lootEventHtml(id, e){
  lootSync();
  const awards = Object.entries(lootAwards).filter(([, a]) => a.eventId === id).sort((a, z) => z[1].at - a[1].at);
  const officer = isOfficerOrAdmin();
  if (!awards.length && !officer) return '';
  const list = awards.length ? awards.map(([aid, a]) => `<div class="loot-award-row">
      ${lootItemHtml(a.itemId, a.itemName)} → ${lootCharHtml(a)} <span class="loot-tag">${LOOT_KIND_LABELS[a.kind]}</span>
      ${a.boss ? `<span class="bis-item-meta">${escapeHtml(a.boss)}</span>` : ''}${a.note ? `<span class="bis-item-meta">${escapeHtml(a.note)}</span>` : ''}
      ${officer ? `<button type="button" class="loot-del" data-loot-delete="${escapeHtml(aid)}" aria-label="Vergabe löschen" title="Vergabe löschen">×</button>` : ''}
    </div>`).join('') : '';
  let panel = '';
  if (officer && lootPanelOpen.has(id)){
    // BiS sets and everybody's "Habe ich" for the decision aid.
    bisSyncListeners();
    bisNeedSync();
    if (!bisData) bisLoadData().then(() => { if (currentPage === 'raids') renderRaidsPage(); }).catch(() => {});
    panel = `<div class="loot-panel">
      ${lootPick[id] ? lootCandidatesHtml(id) : `<input type="search" class="apply-text-input" data-loot-search="${escapeHtml(id)}" placeholder="Item suchen …" value="${escapeHtml(lootQuery[id] || '')}" autocomplete="off">
        <div class="raid-sr-results" data-loot-results="${escapeHtml(id)}">${lootSearchHtml(id)}</div>`}
    </div>`;
  }
  return `<div class="raid-sr loot-event">
    <div class="raid-col-head">Loot <span>${awards.length ? `${awards.length} vergeben` : ''}</span></div>
    ${lootLoadError ? `<p class="bis-hint raid-error">${escapeHtml(lootLoadError)}</p>` : ''}
    ${list}
    ${officer ? `<div class="raid-admin"><button type="button" class="btn btn-ghost btn-sm" data-loot-toggle="${escapeHtml(id)}">${lootPanelOpen.has(id) ? 'Loot-Vergabe schließen' : 'Loot vergeben'}</button></div>` : ''}
    ${panel}
  </div>`;
}

/** Write an award. @param {string} eventId @param {string} uid @param {string} kind @param {string} note */
async function lootAward(eventId, uid, kind, note){
  const s = (raidSignups[eventId] || {})[uid];
  const itemId = lootPick[eventId];
  const id = newPushId('lootAwards');
  if (!s || !itemId || !id) return;
  const item = bisData && bisData.byId.get(itemId);
  try {
    await db.ref(`${DB_PATH}/lootAwards/${id}`).set({
      eventId, itemId, itemName: item ? item.n : '', uid, charName: s.charName || s.name, classId: s.classId, specId: s.specId,
      kind, note: note.slice(0, 120), by: discordIdentity.id, at: Date.now()
    });
    delete lootPick[eventId];
    lootQuery[eventId] = '';
    raidStatusMsg = '';
  } catch (err){ raidStatusMsg = 'Vergabe konnte nicht gespeichert werden — Firebase-Regeln aktualisiert?'; }
  lootRerender();
}

/** @param {string} awardId */
async function lootDelete(awardId){
  const a = lootAwards[awardId];
  if (!a) return;
  const answer = await bisDialog('Vergabe löschen?', `${lootItemName(a)} an ${a.charName} wird aus der Historie entfernt.`,
    [{ id: 'delete', label: 'Löschen', primary: true }, { id: 'cancel', label: 'Abbrechen' }]);
  if (answer !== 'delete') return;
  try { await db.ref(`${DB_PATH}/lootAwards/${awardId}`).remove(); }
  catch (err){ raidStatusMsg = 'Löschen fehlgeschlagen.'; lootRerender(); }
}

/** Wire loot controls inside root (raid cards or the Loot page). @param {HTMLElement} root */
function lootWire(root){
  root.querySelectorAll('[data-loot-toggle]').forEach(btn => btn.addEventListener('click', () => {
    const id = btn.getAttribute('data-loot-toggle');
    if (lootPanelOpen.has(id)) lootPanelOpen.delete(id); else lootPanelOpen.add(id);
    renderRaidsPage();
  }));
  root.querySelectorAll('[data-loot-search]').forEach((/** @type {HTMLInputElement} */ input) => {
    const id = input.getAttribute('data-loot-search');
    input.addEventListener('input', () => {
      lootQuery[id] = input.value;
      const box = root.querySelector(`[data-loot-results="${CSS.escape(id)}"]`);
      if (box) box.innerHTML = lootSearchHtml(id);
    });
  });
  // Delegated (results are replaced while typing); root outlives re-renders.
  if (!root.dataset.lootWired) root.addEventListener('click', ev => {
    const btn = /** @type {HTMLElement} */ (ev.target).closest('[data-loot-pick]');
    if (!btn || !root.contains(btn)) return;
    const [eventId, itemId] = btn.getAttribute('data-loot-pick').split('|');
    lootPick[eventId] = Number(itemId);
    renderRaidsPage();
  });
  root.dataset.lootWired = '1';
  root.querySelectorAll('[data-loot-unpick]').forEach(btn => btn.addEventListener('click', () => {
    delete lootPick[btn.getAttribute('data-loot-unpick')];
    renderRaidsPage();
  }));
  root.querySelectorAll('[data-loot-award]').forEach(btn => btn.addEventListener('click', () => {
    const [eventId, uid, kind] = btn.getAttribute('data-loot-award').split('|');
    const note = /** @type {HTMLInputElement | null} */ (root.querySelector(`[data-loot-note="${CSS.escape(eventId)}"]`));
    lootAward(eventId, uid, kind, note ? note.value.trim() : '');
  }));
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
    ${lootImportHtml()}
    <div id="lootList">${lootPageListHtml()}</div>
    <p class="bis-hint">Vergeben wird im Raid-Termin (Raids → „Loot vergeben“) oder per Import aus RCLootCouncil — beides nur Officer.</p>`;
  lootWire(root);
  lootImportWire(root);
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
      ${list.map(([aid, a]) => `<div class="loot-award-row">
        ${lootItemHtml(a.itemId, a.itemName)} → ${lootCharHtml(a)} <span class="loot-tag">${LOOT_KIND_LABELS[a.kind]}</span>
        ${a.boss ? `<span class="bis-item-meta">${escapeHtml(a.boss)}</span>` : ''}${a.note ? `<span class="bis-item-meta">${escapeHtml(a.note)}</span>` : ''}
        ${officer ? `<button type="button" class="loot-del" data-loot-delete="${escapeHtml(aid)}" aria-label="Vergabe löschen" title="Vergabe löschen">×</button>` : ''}
      </div>`).join('')}
    </div>`;
  }).join('');
}
