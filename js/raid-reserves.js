// Raids page: soft-reserves per raid event.
//
// Firebase (own listener, started together with the raid listeners):
//  - raidReserves/<eventId>/<uid> = { items: { <itemId>: true }, name,
//    charName, classId, updatedAt } — every member writes their own;
//    Officers / Admins may clear a whole event's reserves.
// The event decides the limit (`srMax`, 0 = no soft-reserve) and can lock
// the reserves (`srLocked`); the rules enforce both (README § 6f). Item
// names and icons come from data/forever/items.json (bisLoadData). Our raid
// loot data is incomplete (QuestieDB lacks many boss drops), so the search
// covers every rare+ item and lists known drops of the event's instance
// first.

const RAID_SR_MAX = 3;
const RAID_SR_RESULTS = 12;
/** eventId -> uid -> reserve. @type {Record<string, Record<string, RaidReserve>>} */
let raidReserves = {};
/** Search text per event, kept across re-renders. @type {Record<string, string>} */
const raidSrQuery = {};

function raidReserveSync(){
  db.ref(`${DB_PATH}/raidReserves`).on('value', snap => {
    /** @type {Record<string, Record<string, RaidReserve>>} */
    const out = {};
    for (const [eventId, byUid] of Object.entries(snap.val() || {})) {
      out[eventId] = {};
      for (const [u, raw] of Object.entries(byUid || {})) { const r = raidNormalizeReserve(raw); if (r) out[eventId][u] = r; }
    }
    raidReserves = out;
    if (currentPage === 'raids') renderRaidsPage();
  }, () => { raidLoadError = 'Keine Leserechte für Soft-Reserves — Firebase-Regeln aktualisiert?'; if (currentPage === 'raids') renderRaidsPage(); });
}

/** @param {any} raw @returns {RaidReserve | null} */
function raidNormalizeReserve(raw){
  if (!raw || typeof raw !== 'object' || !raw.items || typeof raw.items !== 'object') return null;
  const items = Object.keys(raw.items).filter(k => /^\d+$/.test(k) && raw.items[k]).map(Number);
  if (!items.length) return null;
  return {
    items,
    name: String(raw.name || '').slice(0, 60),
    charName: String(raw.charName || '').slice(0, 40),
    classId: CLASS_MAP[raw.classId] ? raw.classId : '',
    updatedAt: Number(raw.updatedAt) || 0
  };
}

/** Does the item drop in this instance (as far as our data knows)? @param {ForeverItem} item @param {string} instance */
function raidSrDropsIn(item, instance){
  return Boolean(instance && item.src && (item.src.drops || []).some(d => d.z === instance));
}

/** Search results for an event's reserve box. @param {string} id */
function raidSrResultsHtml(id){
  const q = (raidSrQuery[id] || '').trim().toLowerCase();
  if (q.length < 2 || !bisData) return '';
  const e = raidEvents[id];
  const mine = new Set(((raidReserves[id] || {})[discordIdentity.id] || { items: [] }).items.map(raidSrItemName));
  // Forever has many items twice (Classic id and a new one, same stats):
  // one result per name — the one dropping here, else one with a known
  // source, else the Classic id.
  /** @type {Map<string, { it: ForeverItem, here: boolean }>} */
  const byName = new Map();
  for (const it of bisData.items.items) {
    if (it.q < 3 || mine.has(it.n) || !it.n.toLowerCase().includes(q)) continue;
    const cand = { it, here: raidSrDropsIn(it, e.instance) };
    const prev = byName.get(it.n);
    const rank = c => Number(c.here) * 2 + Number(Boolean(c.it.src));
    if (!prev || rank(cand) > rank(prev) || (rank(cand) === rank(prev) && it.id < prev.it.id)) byName.set(it.n, cand);
  }
  const hits = [...byName.values()]
    .sort((a, z) => Number(z.here) - Number(a.here) || z.it.q - a.it.q || (z.it.il || 0) - (a.it.il || 0) || a.it.n.localeCompare(z.it.n))
    .slice(0, RAID_SR_RESULTS);
  if (!hits.length) return '<div class="raid-sr-result-empty">Nichts gefunden.</div>';
  return hits.map(({ it, here }) => `<button type="button" class="raid-sr-result" data-raid-sr-add="${it.id}" data-raid-id="${escapeHtml(id)}">
    ${bisIconHtml(it, 22)}<span style="color:${bisQualityColor(it)}">${escapeHtml(it.n)}</span>
    <span class="bis-item-meta">${here ? escapeHtml(e.instance) : escapeHtml(bisTypeLabel(it))}</span>
  </button>`).join('');
}

/** @param {number} itemId */
function raidSrItemName(itemId){
  const it = bisData && bisData.byId.get(itemId);
  return it ? it.n : `Item #${itemId}`;
}

/** Officer buttons for the card's admin row. @param {string} id @param {RaidEvent} e @param {boolean} past */
function raidSrAdminHtml(id, e, past){
  if (!e.srMax || !bisData) return '';
  const any = Object.keys(raidReserves[id] || {}).length > 0;
  return `${any ? `<button type="button" class="btn btn-ghost btn-sm" data-raid-sr-copy="${escapeHtml(id)}">Reserves kopieren</button>` : ''}
    ${past ? '' : `<button type="button" class="btn btn-ghost btn-sm" data-raid-sr-lock="${escapeHtml(id)}">${e.srLocked ? 'Reserves entsperren' : 'Reserves sperren'}</button>`}`;
}

/** Soft-reserve block of an event card. @param {string} id @param {RaidEvent} e @param {boolean} past */
function raidSrSectionHtml(id, e, past){
  if (!e.srMax) return '';
  if (!bisData){
    bisLoadData().then(() => { if (currentPage === 'raids') renderRaidsPage(); }).catch(() => {});
    return '<div class="raid-sr"><p class="bis-hint">Soft-Reserve wird geladen …</p></div>';
  }
  const uid = discordIdentity.id;
  const all = raidReserves[id] || {};
  const signups = raidSignups[id] || {};
  const mine = all[uid] ? all[uid].items : [];
  const signedUp = signups[uid] && signups[uid].status !== 'no';
  const itemName = raidSrItemName;
  const itemHtml = itemId => {
    const it = bisData.byId.get(itemId);
    return `${bisIconHtml(it, 22)}<span style="color:${it ? bisQualityColor(it) : 'var(--text)'}">${escapeHtml(itemName(itemId))}</span>`;
  };

  // Own reserves and the search box.
  let own = '';
  if (!past && isMemberOrHigher()){
    const chips = mine.map(itemId => `<span class="raid-sr-mine">${itemHtml(itemId)}${e.srLocked ? '' : `<button type="button" data-raid-sr-remove="${itemId}" data-raid-id="${escapeHtml(id)}" aria-label="Entfernen">×</button>`}</span>`).join('');
    let add = '';
    if (e.srLocked) add = '<p class="bis-hint">Die Reserves sind gesperrt.</p>';
    else if (!signedUp) add = '<p class="bis-hint">Zum Reservieren melde Dich erst als „Dabei“ oder „Vielleicht“ an.</p>';
    else if (mine.length < e.srMax) add = `<div class="raid-sr-search">
        <input type="search" class="apply-text-input" data-raid-sr-search="${escapeHtml(id)}" placeholder="Item suchen (${mine.length + 1}. von ${e.srMax}) …" value="${escapeHtml(raidSrQuery[id] || '')}" autocomplete="off">
        <div class="raid-sr-results" data-raid-sr-results="${escapeHtml(id)}">${raidSrResultsHtml(id)}</div>
      </div>`;
    own = `<div class="raid-sr-own">${chips ? `<div class="raid-sr-mine-list">${chips}</div>` : ''}${add}</div>`;
  }

  // Everybody's reserves, grouped by item name (see the duplicate ids
  // above); contested items first.
  /** @type {Map<string, { itemId: number, players: { uid: string, label: string, classId: string, out: boolean }[] }>} */
  const byItem = new Map();
  for (const [u, r] of Object.entries(all)) {
    const s = signups[u];
    const label = (s && s.charName) || r.charName || (s && s.name) || r.name || 'Unbekannt';
    for (const itemId of r.items) {
      const n = itemName(itemId);
      if (!byItem.has(n)) byItem.set(n, { itemId, players: [] });
      byItem.get(n).players.push({ uid: u, label, classId: (s && s.classId) || r.classId, out: !s || s.status === 'no' });
    }
  }
  const rows = [...byItem].sort((a, z) => z[1].players.length - a[1].players.length || a[0].localeCompare(z[0]));
  const chip = p => {
    const cls = CLASS_MAP[p.classId];
    return `<span class="raid-chip${p.out ? ' raid-chip-out' : ''}" style="--class-color:${cls ? cls.color : 'var(--text-muted)'}"${p.out ? ' title="Nicht angemeldet"' : ''}>${escapeHtml(p.label)}</span>`;
  };
  const list = rows.length
    ? rows.map(([, { itemId, players }]) => `<div class="raid-sr-row">
        <span class="raid-sr-item">${itemHtml(itemId)}${players.length > 1 ? `<span class="raid-sr-count">${players.length}×</span>` : ''}</span>
        <span class="raid-sr-players">${players.sort((a, z) => a.label.localeCompare(z.label, 'de')).map(chip).join('')}</span>
      </div>`).join('')
    : '<p class="bis-hint">Noch nichts reserviert.</p>';
  const count = Object.keys(all).length;
  return `<div class="raid-sr">
    <div class="raid-col-head">Soft-Reserve <span>max. ${e.srMax} pro Spieler${e.srLocked ? ' · 🔒 gesperrt' : ''}</span></div>
    ${own}
    <details class="raid-sr-all"${rows.length && rows.length <= 8 ? ' open' : ''}>
      <summary>Alle Reserves (${count} Spieler, ${rows.length} ${rows.length === 1 ? 'Item' : 'Items'})</summary>
      ${list}
    </details>
  </div>`;
}

/** Plain-text list for the loot master: "Item: Name, Name". @param {string} id */
function raidSrText(id){
  const e = raidEvents[id];
  const all = raidReserves[id] || {};
  const signups = raidSignups[id] || {};
  /** @type {Map<string, string[]>} */
  const byItem = new Map();
  for (const [u, r] of Object.entries(all)) {
    const label = (signups[u] && signups[u].charName) || r.charName || r.name;
    for (const itemId of r.items) {
      const n = raidSrItemName(itemId);
      if (!byItem.has(n)) byItem.set(n, []);
      byItem.get(n).push(label);
    }
  }
  const lines = [...byItem].sort((a, z) => a[0].localeCompare(z[0])).map(([n, names]) => `${n}: ${names.sort().join(', ')}`);
  return [`Soft-Reserves ${e ? `${e.title} · ${raidDateLabel(e.start)}` : ''}`, ...lines].join('\n');
}

/** Write the own reserve of an event (no items = remove). @param {string} id @param {number[]} items */
async function raidSrSave(id, items){
  const uid = discordIdentity.id;
  const ref = db.ref(`${DB_PATH}/raidReserves/${id}/${uid}`);
  try {
    if (!items.length) await ref.remove();
    else {
      const s = (raidSignups[id] || {})[uid];
      await ref.set({
        items: Object.fromEntries(items.map(i => [String(i), true])),
        name: raidMyName(), charName: (s && s.charName) || '', classId: (s && s.classId) || '', updatedAt: Date.now()
      });
    }
    raidStatusMsg = '';
  } catch (err){
    raidStatusMsg = 'Reserve konnte nicht gespeichert werden — gesperrt, Limit erreicht oder Firebase-Regeln nicht aktualisiert?';
    renderRaidsPage();
  }
}

/** @param {HTMLElement} root */
function raidSrWire(root){
  const uid = discordIdentity.id;
  const mineOf = id => ((raidReserves[id] || {})[uid] || { items: [] }).items;
  root.querySelectorAll('[data-raid-sr-search]').forEach((/** @type {HTMLInputElement} */ input) => {
    const id = input.getAttribute('data-raid-sr-search');
    // Only the result list re-renders while typing, so the field keeps its focus.
    input.addEventListener('input', () => {
      raidSrQuery[id] = input.value;
      const box = root.querySelector(`[data-raid-sr-results="${CSS.escape(id)}"]`);
      if (box) box.innerHTML = raidSrResultsHtml(id);
    });
  });
  // Delegated (result buttons are replaced while typing); root outlives
  // re-renders, so wire it once.
  if (!root.dataset.raidSrWired) root.addEventListener('click', ev => {
    const btn = /** @type {HTMLElement} */ (ev.target).closest('[data-raid-sr-add]');
    if (!btn || !root.contains(btn)) return;
    const id = btn.getAttribute('data-raid-id');
    const e = raidEvents[id];
    const mine = mineOf(id);
    if (!e || mine.length >= e.srMax) return;
    raidSrQuery[id] = '';
    raidSrSave(id, mine.concat(Number(btn.getAttribute('data-raid-sr-add'))));
  });
  root.dataset.raidSrWired = '1';
  root.querySelectorAll('[data-raid-sr-remove]').forEach(btn => btn.addEventListener('click', () => {
    const id = btn.getAttribute('data-raid-id');
    const itemId = Number(btn.getAttribute('data-raid-sr-remove'));
    raidSrSave(id, mineOf(id).filter(i => i !== itemId));
  }));
  root.querySelectorAll('[data-raid-sr-lock]').forEach(btn => btn.addEventListener('click', async () => {
    const id = btn.getAttribute('data-raid-sr-lock');
    const e = raidEvents[id];
    if (!e) return;
    try { await db.ref(`${DB_PATH}/raidEvents/${id}/srLocked`).set(!e.srLocked); }
    catch (err){ raidStatusMsg = 'Sperren fehlgeschlagen.'; renderRaidsPage(); }
  }));
  root.querySelectorAll('[data-raid-sr-copy]').forEach(btn => btn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(raidSrText(btn.getAttribute('data-raid-sr-copy'))); btn.textContent = 'Kopiert ✓'; }
    catch (err){ btn.textContent = 'Kopieren nicht möglich'; }
  }));
}
