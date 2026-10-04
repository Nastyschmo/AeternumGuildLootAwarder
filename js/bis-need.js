// BiS-Planer: "Gildenbedarf" — who in the guild still needs which item,
// per dungeon / raid and boss. Built from every public BiS set (bisPublic,
// loaded by bisSyncListeners() in js/bis-sets.js; own public sets
// included) and everybody's "Habe ich" ticks (bisOwned/<uid>, readable by
// members — README § 6f). A player needs an item when one of their public
// sets has it and they haven't ticked it. Bosses come from the item's
// drop sources (data/forever/items.json), instances from its `instances`
// map; world drops, crafted and vendor items aren't listed here.

const BIS_NEED_UNKNOWN_ZONE = 'Instanz unbekannt';
let bisNeedKind = 'r';      // 'r' raids, 'd' dungeons, '' both
let bisNeedQuery = '';
let bisNeedShowDone = false;
/** uid -> Set of owned item ids, from bisOwned (members only). @type {Record<string, Set<number>> | null} */
let bisNeedOwned = null;
let bisNeedOwnedUid = '';
let bisNeedOwnedDenied = false;

/** Listen to everybody's owned items (members+; rules deny the rest). */
function bisNeedSync(){
  const uid = (db && discordIdentity) ? discordIdentity.id : '';
  if (!uid || uid === bisNeedOwnedUid || !isMemberOrHigher()) return;
  bisNeedOwnedUid = uid;
  db.ref(`${DB_PATH}/bisOwned`).on('value', snap => {
    const raw = snap.val() || {};
    /** @type {Record<string, Set<number>>} */
    const out = {};
    for (const [u, items] of Object.entries(raw)) {
      out[u] = new Set(Object.keys(items || {}).filter(k => /^\d+$/.test(k) && items[k]).map(Number));
    }
    bisNeedOwned = out;
    bisNeedOwnedDenied = false;
    if (currentPage === 'bis' && bisView === 'need') renderBisPlanner();
  }, () => {
    bisNeedOwnedDenied = true;
    if (currentPage === 'bis' && bisView === 'need') renderBisPlanner();
  });
}

/** Does this player own the item? Own ticks from the planner, others' from bisOwned. @param {string} uid @param {number} itemId */
function bisNeedHas(uid, itemId){
  if (uid === bisSyncUid) return bisIsOwned(itemId);
  return Boolean(bisNeedOwned && bisNeedOwned[uid] && bisNeedOwned[uid].has(itemId));
}

/**
 * instance -> boss -> itemId -> players, from all public sets.
 * @returns {Map<string, { kind: string, bosses: Map<string, Map<number, { uid: string, name: string, classId: string, sets: string[], has: boolean }[]>> }>}
 */
function bisNeedIndex(){
  const all = { ...bisOtherSets };
  for (const [id, s] of Object.entries(bisMySets)) if (s.public) all[id] = s;
  const kinds = (bisData.items.instances) || {};
  /** uid -> itemId -> entry (one entry per player and item, listing every set) */
  const perPlayer = new Map();
  for (const s of Object.values(all)) {
    for (const sl of BIS_SLOTS) {
      const id = s.slots[sl.key];
      if (!id) continue;
      if (!perPlayer.has(s.ownerId)) perPlayer.set(s.ownerId, new Map());
      const items = perPlayer.get(s.ownerId);
      if (!items.has(id)) items.set(id, { uid: s.ownerId, name: bisOwnerLabel(s), classId: s.classId, sets: [], has: bisNeedHas(s.ownerId, id) });
      const e = items.get(id);
      if (!e.sets.includes(s.name)) e.sets.push(s.name);
    }
  }
  const out = new Map();
  for (const items of perPlayer.values()) {
    for (const [id, e] of items) {
      const item = bisData.byId.get(id);
      const drops = (item && item.src && item.src.drops) || [];
      for (const d of drops) {
        // A named dropper without a zone (QuestieDB lacks some, e.g.
        // Darkmaster Gandling) is still almost always an instance boss.
        const zone = d.z || BIS_NEED_UNKNOWN_ZONE;
        const kind = d.z ? kinds[d.z] : '?';
        if (kind !== 'r' && kind !== 'd' && kind !== '?') continue;
        if (!out.has(zone)) out.set(zone, { kind, bosses: new Map() });
        const bosses = out.get(zone).bosses;
        if (!bosses.has(d.n)) bosses.set(d.n, new Map());
        const its = bosses.get(d.n);
        if (!its.has(id)) its.set(id, []);
        its.get(id).push(e);
      }
    }
  }
  return out;
}

function bisNeedListHtml(){
  const q = bisNeedQuery.trim().toLowerCase();
  const index = bisNeedIndex();
  const open = list => list.filter(p => !p.has).length;
  const cards = [];
  for (const [zone, inst] of index) {
    if (bisNeedKind && inst.kind !== bisNeedKind) continue;
    const bosses = [];
    for (const [boss, items] of inst.bosses) {
      const rows = [];
      for (const [id, players] of items) {
        const item = bisData.byId.get(id);
        const shown = players.filter(p => bisNeedShowDone || !p.has)
          .filter(p => !q || p.name.toLowerCase().includes(q) || item.n.toLowerCase().includes(q) || boss.toLowerCase().includes(q) || zone.toLowerCase().includes(q))
          .sort((a, z) => Number(a.has) - Number(z.has) || a.name.localeCompare(z.name, 'de'));
        if (!shown.length) continue;
        rows.push({ item, shown, open: open(players) });
      }
      if (!rows.length) continue;
      rows.sort((a, z) => z.open - a.open || a.item.n.localeCompare(z.item.n));
      bosses.push({ boss, rows, open: rows.reduce((s, r) => s + r.open, 0) });
    }
    if (!bosses.length) continue;
    bosses.sort((a, z) => z.open - a.open || a.boss.localeCompare(z.boss));
    cards.push({ zone, kind: inst.kind, bosses, open: bosses.reduce((s, b) => s + b.open, 0) });
  }
  // Unknown zone last, otherwise most open needs first.
  cards.sort((a, z) => Number(a.kind === '?') - Number(z.kind === '?') || z.open - a.open || a.zone.localeCompare(z.zone));
  if (!cards.length) {
    return `<p class="bis-hint">${q || bisNeedKind ? 'Nichts gefunden für diese Filter.' : 'Noch keine öffentlichen Sets mit Dungeon- oder Raid-Items.'}</p>`;
  }
  const chip = p => {
    const cls = CLASS_MAP[p.classId];
    return `<span class="bis-need-player${p.has ? ' has' : ''}" style="--class-color:${cls ? cls.color : 'var(--text)'}" title="${escapeHtml(p.sets.join(', '))}${p.has ? ' — hat es schon' : ''}">${p.has ? '✓ ' : ''}${escapeHtml(p.name)}</span>`;
  };
  return cards.map(c => `<details class="bis-need-zone" open>
    <summary><span class="bis-need-zone-name">${escapeHtml(c.zone)}</span><span class="bis-item-meta">${c.kind === 'r' ? 'Raid · ' : c.kind === 'd' ? 'Dungeon · ' : ''}${c.open} offen</span></summary>
    ${c.bosses.map(b => `<div class="bis-need-boss">
      <div class="bis-need-boss-name">${escapeHtml(b.boss)} <span class="bis-item-meta">${b.open} offen</span></div>
      ${b.rows.map(r => `<div class="bis-need-item">
        <span class="bis-need-item-name" data-item-id="${r.item.id}">${bisIconHtml(r.item, 24)}<span style="color:${bisQualityColor(r.item)}">${escapeHtml(r.item.n)}</span></span>
        <span class="bis-need-players">${r.shown.map(chip).join('')}</span>
      </div>`).join('')}
    </div>`).join('')}
  </details>`).join('');
}

/** The "Gildenbedarf" tab. @param {HTMLElement} root */
function renderBisNeed(root){
  if (!discordIdentity){
    root.innerHTML = `${bisViewTabsHtml()}<div class="tac-card"><p class="bis-hint">Den Gildenbedarf sehen alle mit Discord eingeloggten Spieler. Melde Dich oben rechts an.</p></div>`;
    bisWireViewTabs(root);
    return;
  }
  bisNeedSync();
  const kindBtn = (k, label) => `<button type="button" class="talent-class-btn bis-need-kind${bisNeedKind === k ? ' active' : ''}" data-bis-need-kind="${k}">${label}</button>`;
  const ownedNote = !isMemberOrHigher() || bisNeedOwnedDenied
    ? '<p class="bis-hint">Ob jemand ein Item schon hat, sehen nur Mitglieder — hier zählt jedes Item in einem öffentlichen Set als offen.</p>'
    : '';
  root.innerHTML = `${bisViewTabsHtml()}
    <div class="bis-controls tac-card">
      <div class="bis-control">
        <label>Instanzen</label>
        <div class="bis-class-row">${kindBtn('r', 'Raids')}${kindBtn('d', 'Dungeons')}${kindBtn('', 'Alle')}</div>
      </div>
      <div class="bis-control bis-setbar-name">
        <label for="bisNeedSearch">Suche</label>
        <input type="search" id="bisNeedSearch" class="apply-text-input" placeholder="Spieler, Item, Boss oder Instanz …" value="${escapeHtml(bisNeedQuery)}" autocomplete="off">
      </div>
      <div class="bis-control">
        <label class="bis-mat-raw"><input type="checkbox" id="bisNeedDone" ${bisNeedShowDone ? 'checked' : ''}> Auch wer es schon hat</label>
      </div>
    </div>
    <p class="bis-hint">Aus allen öffentlichen BiS-Sets der Gilde: wer welches Item noch braucht, pro Instanz und Boss. Private Sets zählen nicht mit.</p>
    ${ownedNote}
    <div id="bisNeedList">${bisNeedListHtml()}</div>`;
  bisWireViewTabs(root);
  root.querySelectorAll('[data-bis-need-kind]').forEach(btn => btn.addEventListener('click', () => {
    bisNeedKind = btn.getAttribute('data-bis-need-kind');
    renderBisPlanner();
  }));
  const search = /** @type {HTMLInputElement} */ (root.querySelector('#bisNeedSearch'));
  // Only the list re-renders while typing, so the field keeps its focus.
  search.addEventListener('input', () => {
    bisNeedQuery = search.value;
    const list = root.querySelector('#bisNeedList');
    if (list) list.innerHTML = bisNeedListHtml();
  });
  const done = /** @type {HTMLInputElement} */ (root.querySelector('#bisNeedDone'));
  done.addEventListener('change', () => { bisNeedShowDone = done.checked; renderBisPlanner(); });
}
