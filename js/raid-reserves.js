// Raids page: soft-reserves per raid event.
//
// Firebase (own listener, started together with the raid listeners):
//  - raidReserves/<eventId>/<uid> = { items: { s1: itemId, s2: …, s3: … },
//    name, charName, classId, updatedAt } — every member writes their own;
//    Officers / Admins may clear a whole event's reserves. Fixed slots
//    (s1..s3) because the rules can't count children: a slot sN may only
//    be filled while srMax >= N.
// The event decides the limit (`srMax`, 0 = no soft-reserve) and can lock
// the reserves (`srLocked`); the rules enforce both (README § 6f). Item
// names and icons come from data/forever/items.json (bisLoadData). Our raid
// loot data is incomplete (QuestieDB lacks many boss drops), so the search
// covers every rare+ item and lists known drops of the event's instance
// first.
// Hard-Reserves (raidEvents/<id>/hr = { itemId: true }, officers): items the
// guild keeps — they can't be soft-reserved and go through the Loot
// Council's vote (js/loot-session.js). Typical for SR runs with externals.

const RAID_SR_MAX = 3;
const RAID_SR_RESULTS = 12;
// Item stat ids (BIS_STAT_LABELS) that say who an item is for. Per spec:
// `core` stats (at least one needed) and `extra` stats that are fine on top
// (int on hunter mail, str on paladin healing plate …). An item fits when
// all its typed stats are core or extra and one is core; items with only
// neutral stats (stamina, spirit, hit, crit, resistances …) fit everyone —
// except melee weapons for casters / healers.
const RAID_SR_PHYS = [3, 4, 37, 38];                   // agi, str, expertise, AP
const RAID_SR_TANK = [12, 13, 14, 15, 48];             // defense, dodge, parry, block, block value
const RAID_SR_HEAL = [5, 41, 43, 45];                  // int, healing, mp5, spell power
const RAID_SR_SPELL = [5, 42, 43, 45, 47];             // int, spell damage, mp5, spell power, penetration
const RAID_SR_TYPED = [...new Set([...RAID_SR_PHYS, ...RAID_SR_TANK, ...RAID_SR_HEAL, ...RAID_SR_SPELL, 39])];
/** @param {number[]} core @param {number[]} [extra] */
const raidSrSpec = (core, extra) => ({ core, extra: extra || [] });
const RAID_SR_MELEE = raidSrSpec(RAID_SR_PHYS);
const RAID_SR_HUNTER = raidSrSpec([3, 38, 39], [4, 5, 43]);
const RAID_SR_HEALER = raidSrSpec(RAID_SR_HEAL);
const RAID_SR_CASTER = raidSrSpec(RAID_SR_SPELL);
/** classId -> specId -> wanted stats. @type {Record<string, Record<string, { core: number[], extra: number[] }>>} */
const RAID_SR_SPEC_STATS = {
  warrior: { arms: RAID_SR_MELEE, fury: RAID_SR_MELEE, protection: raidSrSpec([...RAID_SR_PHYS, ...RAID_SR_TANK]) },
  // Classic paladin healing plate (Lawbringer, Judgement) carries strength.
  paladin: { holy: raidSrSpec(RAID_SR_HEAL, [4]), protection: raidSrSpec([...RAID_SR_PHYS, ...RAID_SR_TANK], [5, 42, 45]), retribution: raidSrSpec(RAID_SR_PHYS, [5]) },
  hunter: { beast_mastery: RAID_SR_HUNTER, marksmanship: RAID_SR_HUNTER, survival: RAID_SR_HUNTER },
  rogue: { assassination: RAID_SR_MELEE, combat: RAID_SR_MELEE, subtlety: RAID_SR_MELEE },
  priest: { discipline: RAID_SR_HEALER, holy: RAID_SR_HEALER, shadow: RAID_SR_CASTER },
  shaman: { elemental: RAID_SR_CASTER, enhancement: raidSrSpec(RAID_SR_PHYS, [5]), restoration: RAID_SR_HEALER },
  mage: { arcane: RAID_SR_CASTER, fire: RAID_SR_CASTER, frost: RAID_SR_CASTER },
  warlock: { affliction: RAID_SR_CASTER, demonology: RAID_SR_CASTER, destruction: RAID_SR_CASTER },
  druid: { balance: RAID_SR_CASTER, feral: RAID_SR_MELEE, feral_tank: raidSrSpec([...RAID_SR_PHYS, 12, 13]), restoration: RAID_SR_HEALER }
};
/** The armor type a class wears at 60 (1 cloth, 2 leather, 3 mail, 4 plate). */
const RAID_SR_ARMOR = { warrior: 4, paladin: 4, hunter: 3, shaman: 3, rogue: 2, druid: 2, priest: 1, mage: 1, warlock: 1 };
/** Events where the search shows every item ("Alle Items zeigen"). @type {Record<string, boolean>} */
const raidSrShowAll = {};
/** eventId -> uid -> reserve. @type {Record<string, Record<string, RaidReserve>>} */
let raidReserves = {};
/** Search text per event, kept across re-renders. @type {Record<string, string>} */
const raidSrQuery = {};
/** Hard-Reserve search text per event (officers). @type {Record<string, string>} */
const raidHrQuery = {};
/** Names of the event's Hard-Reserve items (Forever has items under several ids). @param {RaidEvent} e */
function raidHrNames(e){
  return new Set(Object.keys(e.hr || {}).map(id => raidSrItemName(Number(id))));
}

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
  /** @type {Record<string, number>} */
  const slots = {};
  for (const [k, v] of Object.entries(raw.items)) if (/^s[1-3]$/.test(k) && Number(v) > 0) slots[k] = Math.trunc(Number(v));
  const items = Object.keys(slots).sort().map(k => slots[k]);
  if (!items.length) return null;
  return {
    items, slots,
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

/**
 * Does the item suit this class and spec? Gear: usable at 60, the class's
 * own armor type (cloaks excepted) and only stats the spec wants. Non-gear
 * (tier tokens, recipes, quest items) always fits.
 * @param {ForeverItem} item @param {string} classId @param {string} specId
 */
function raidSrFits(item, classId, specId){
  if (item.c !== 2 && item.c !== 4) return true;
  if (!bisCanUse(item, /** @type {any} */ ({ classId, level: 60 }))) return false;
  if (item.c === 4 && item.sc >= 1 && item.sc <= 4 && item.it !== 16 && item.sc !== RAID_SR_ARMOR[classId]) return false;
  const want = (RAID_SR_SPEC_STATS[classId] || {})[specId];
  if (!want) return true;
  const typed = (item.s || []).map(([stat]) => stat).filter(st => RAID_SR_TYPED.includes(st));
  if (typed.length) return typed.every(st => want.core.includes(st) || want.extra.includes(st)) && typed.some(st => want.core.includes(st));
  // No typed stats: fine, except a melee weapon for a caster / healer.
  const caster = !want.core.some(st => RAID_SR_PHYS.includes(st));
  return !(caster && item.c === 2 && item.sc !== 19);
}

/** Search results for an event's reserve box. @param {string} id */
function raidSrResultsHtml(id){
  const q = (raidSrQuery[id] || '').trim().toLowerCase();
  if (q.length < 2 || !bisData) return '';
  const e = raidEvents[id];
  const mine = new Set(((raidReserves[id] || {})[discordIdentity.id] || { items: [] }).items.map(raidSrItemName));
  // Hard-Reserves can't be soft-reserved.
  for (const n of raidHrNames(e)) mine.add(n);
  const me = raidUserSignup(id, discordIdentity.id);
  const filter = me && !raidSrShowAll[id] ? (/** @param {ForeverItem} it */ it => raidSrFits(it, me.classId, me.specId)) : () => true;
  // Forever has many items twice or more (Classic id and new ids); same
  // name and stats = one result — the one dropping here, else one with a
  // known source, else the Classic id. Versions with other stats stay
  // separate (the stat line tells them apart).
  /** @type {Map<string, { it: ForeverItem, here: boolean }>} */
  const byName = new Map();
  for (const it of bisData.items.items) {
    if (it.q < 3 || mine.has(it.n) || !it.n.toLowerCase().includes(q) || !filter(it)) continue;
    const cand = { it, here: raidSrDropsIn(it, e.instance) };
    const key = it.n + '|' + JSON.stringify(it.s || []);
    const prev = byName.get(key);
    const rank = c => Number(c.here) * 2 + Number(Boolean(c.it.src));
    if (!prev || rank(cand) > rank(prev) || (rank(cand) === rank(prev) && it.id < prev.it.id)) byName.set(key, cand);
  }
  const hits = [...byName.values()]
    .sort((a, z) => Number(z.here) - Number(a.here) || z.it.q - a.it.q || (z.it.il || 0) - (a.it.il || 0) || a.it.n.localeCompare(z.it.n))
    .slice(0, RAID_SR_RESULTS);
  if (!hits.length) return '<div class="raid-sr-result-empty">Nichts gefunden.</div>';
  return hits.map(({ it, here }) => `<button type="button" class="raid-sr-result" data-raid-sr-add="${it.id}" data-item-id="${it.id}" data-raid-id="${escapeHtml(id)}">
    ${bisIconHtml(it, 22)}<span style="color:${bisQualityColor(it)}">${escapeHtml(it.n)}</span>
    <span class="bis-item-meta">${escapeHtml([here ? e.instance : bisTypeLabel(it), bisStatLine(it)].filter(Boolean).join(' · '))}</span>
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

/** Item name with icon and quality color (bisData loaded). @param {number} itemId */
function raidSrItemHtml(itemId){
  const it = bisData.byId.get(itemId);
  return `<span class="raid-sr-item-label" data-item-id="${itemId}">${bisIconHtml(it, 22)}<span style="color:${it ? bisQualityColor(it) : 'var(--text)'}">${escapeHtml(raidSrItemName(itemId))}</span></span>`;
}

/** Hard-Reserves: the list, and for officers (edit) the remove buttons and the item search. @param {string} id @param {RaidEvent} e @param {boolean} past @param {boolean} edit */
function raidHrBlockHtml(id, e, past, edit){
  if (!bisData) return '';
  const hrIds = Object.keys(e.hr || {}).map(Number);
  const canEdit = edit && isOfficerOrAdmin() && !past;
  if (!hrIds.length && !canEdit) return '';
  return `<div class="raid-hr">
      <div class="raid-col-head">Hard-Reserve <span>nicht reservierbar · bleibt in der Gilde, vergibt der Loot Council</span></div>
      ${hrIds.length ? `<div class="raid-sr-mine-list">${hrIds.map(itemId => `<span class="raid-sr-mine">${raidSrItemHtml(itemId)}${canEdit ? `<button type="button" data-raid-hr-remove="${escapeHtml(id)}|${itemId}" aria-label="Entfernen">×</button>` : ''}</span>`).join('')}</div>` : '<p class="bis-hint">Keine Hard-Reserves.</p>'}
      ${canEdit ? `<div class="raid-sr-search">
        <input type="search" class="apply-text-input" data-raid-hr-search="${escapeHtml(id)}" placeholder="Hard-Reserve hinzufügen (Item suchen) …" value="${escapeHtml(raidHrQuery[id] || '')}" autocomplete="off">
        <div class="raid-sr-results" data-raid-hr-results="${escapeHtml(id)}">${lootSearchHtml(id, e.instance, raidHrQuery[id], 'raid-hr-add')}</div>
      </div>` : ''}
    </div>`;
}

/**
 * Soft-reserve block of an event: own reserves + search, Hard-Reserves,
 * everybody's reserves. opts.hrEdit = false: Hard-Reserves read-only here
 * (officers edit them in the Raidleitung panel); opts.bare: no own heading
 * (the panel around it has one); opts.noHr: leave the Hard-Reserves out.
 * @param {string} id @param {RaidEvent} e @param {boolean} past @param {{ hrEdit?: boolean, bare?: boolean, noHr?: boolean }} [opts]
 */
function raidSrSectionHtml(id, e, past, opts){
  const o = opts || {};
  if (!e.srMax) return '';
  if (!bisData){
    bisLoadData().then(() => { if (currentPage === 'raids') renderRaidsPage(); }).catch(() => {});
    return '<div class="raid-sr"><p class="bis-hint">Soft-Reserve wird geladen …</p></div>';
  }
  const uid = discordIdentity.id;
  const all = raidReserves[id] || {};
  /** Best sign-up per member (several characters can be signed up). @type {Record<string, RaidSignup>} */
  const signups = Object.fromEntries(Object.keys(raidSignups[id] || {}).map(u => [u, raidUserSignup(id, u)]));
  const mine = all[uid] ? all[uid].items : [];
  const signedUp = signups[uid] && signups[uid].status !== 'no';
  const itemName = raidSrItemName;
  const itemHtml = raidSrItemHtml;

  // Own reserves and the search box.
  let own = '';
  // Members, and guests whose raid application was accepted (js/raid-externals.js).
  const guestOk = ((raidApps[id] || {})[uid] || {}).status === 'accepted';
  if (!past && (isMemberOrHigher() || guestOk)){
    const chips = mine.map(itemId => `<span class="raid-sr-mine">${itemHtml(itemId)}${e.srLocked ? '' : `<button type="button" data-raid-sr-remove="${itemId}" data-raid-id="${escapeHtml(id)}" aria-label="Entfernen">×</button>`}</span>`).join('');
    let add = '';
    if (e.srLocked) add = '<p class="bis-hint">Die Reserves sind gesperrt.</p>';
    else if (!signedUp) add = '<p class="bis-hint">Zum Reservieren melde Dich erst als „Dabei“ oder „Vielleicht“ an.</p>';
    else if (mine.length < e.srMax) add = `<div class="raid-sr-search">
        <input type="search" class="apply-text-input" data-raid-sr-search="${escapeHtml(id)}" placeholder="Item suchen (${mine.length + 1}. von ${e.srMax}) …" value="${escapeHtml(raidSrQuery[id] || '')}" autocomplete="off">
        <label class="raid-sr-filter"><input type="checkbox" data-raid-sr-all="${escapeHtml(id)}" ${raidSrShowAll[id] ? '' : 'checked'}> Nur Items für ${escapeHtml(CLASS_MAP[signups[uid].classId].label)} · ${escapeHtml(foreverSpecLabel(signups[uid].classId, signups[uid].specId))} (Rüstungstyp, Waffen, Werte)</label>
        <div class="raid-sr-results" data-raid-sr-results="${escapeHtml(id)}">${raidSrResultsHtml(id)}</div>
      </div>`;
    own = `<div class="raid-sr-own">${chips ? `<div class="raid-sr-mine-list">${chips}</div>` : ''}${add}</div>`;
  }

  // Hard-Reserves: stay in the guild, the Loot Council decides.
  const hrNames = raidHrNames(e);
  const hr = o.noHr ? '' : raidHrBlockHtml(id, e, past, o.hrEdit !== false);

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
        <span class="raid-sr-item">${itemHtml(itemId)}${players.length > 1 ? `<span class="raid-sr-count">${players.length}×</span>` : ''}${hrNames.has(itemName(itemId)) ? '<span class="loot-tag loot-tag-hr" title="Inzwischen Hard-Reserve — zählt nicht als Soft-Reserve">HR</span>' : ''}</span>
        <span class="raid-sr-players">${players.sort((a, z) => a.label.localeCompare(z.label, 'de')).map(chip).join('')}</span>
      </div>`).join('')
    : '<p class="bis-hint">Noch nichts reserviert.</p>';
  const count = Object.keys(all).length;
  return `<div class="raid-sr">
    ${o.bare ? '' : `<div class="raid-col-head">Soft-Reserve <span>max. ${e.srMax} pro Spieler${e.srLocked ? ' · 🔒 gesperrt' : ''}</span></div>`}
    ${own}
    ${hr}
    <details class="raid-sr-all"${rows.length && rows.length <= 3 ? ' open' : ''}>
      <summary>Alle Reserves (${count} Spieler, ${rows.length} ${rows.length === 1 ? 'Item' : 'Items'})</summary>
      ${list}
    </details>
  </div>`;
}

/** Plain-text list for the loot master: "Item: Name, Name". @param {string} id */
function raidSrText(id){
  const e = raidEvents[id];
  const all = raidReserves[id] || {};
  const signups = Object.fromEntries(Object.keys(raidSignups[id] || {}).map(u => [u, raidUserSignup(id, u)]));
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

/** Write the own reserve of an event (no slots = remove). @param {string} id @param {Record<string, number>} slots */
async function raidSrSave(id, slots){
  const uid = discordIdentity.id;
  const ref = db.ref(`${DB_PATH}/raidReserves/${id}/${uid}`);
  try {
    if (!Object.keys(slots).length) await ref.remove();
    else {
      const s = raidUserSignup(id, uid);
      await ref.set({
        items: slots,
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
  /** @param {string} id @returns {Record<string, number>} */
  const slotsOf = id => ({ ...(((raidReserves[id] || {})[uid] || { slots: {} }).slots) });
  root.querySelectorAll('[data-raid-sr-search]').forEach((/** @type {HTMLInputElement} */ input) => {
    const id = input.getAttribute('data-raid-sr-search');
    // Only the result list re-renders while typing, so the field keeps its focus.
    input.addEventListener('input', () => {
      raidSrQuery[id] = input.value;
      const box = root.querySelector(`[data-raid-sr-results="${CSS.escape(id)}"]`);
      if (box) box.innerHTML = raidSrResultsHtml(id);
    });
  });
  root.querySelectorAll('[data-raid-sr-all]').forEach((/** @type {HTMLInputElement} */ box) => box.addEventListener('change', () => {
    const id = box.getAttribute('data-raid-sr-all');
    raidSrShowAll[id] = !box.checked;
    const list = root.querySelector(`[data-raid-sr-results="${CSS.escape(id)}"]`);
    if (list) list.innerHTML = raidSrResultsHtml(id);
  }));
  root.querySelectorAll('[data-raid-hr-search]').forEach((/** @type {HTMLInputElement} */ input) => {
    const id = input.getAttribute('data-raid-hr-search');
    input.addEventListener('input', () => {
      raidHrQuery[id] = input.value;
      const box = root.querySelector(`[data-raid-hr-results="${CSS.escape(id)}"]`);
      const e = raidEvents[id];
      if (box) box.innerHTML = lootSearchHtml(id, e ? e.instance : '', input.value, 'raid-hr-add');
    });
  });
  const setHr = (id, itemId, on) => db.ref(`${DB_PATH}/raidEvents/${id}/hr/${itemId}`).set(on ? true : null)
    .catch(() => { raidStatusMsg = 'Hard-Reserve konnte nicht gespeichert werden.'; renderRaidsPage(); });
  root.querySelectorAll('[data-raid-hr-remove]').forEach(btn => btn.addEventListener('click', () => {
    const [id, itemId] = btn.getAttribute('data-raid-hr-remove').split('|');
    setHr(id, itemId, false);
  }));
  // Delegated (result buttons are replaced while typing); root outlives
  // re-renders, so wire it once.
  if (!root.dataset.raidSrWired) root.addEventListener('click', ev => {
    const hrBtn = /** @type {HTMLElement} */ (ev.target).closest('[data-raid-hr-add]');
    if (hrBtn && root.contains(hrBtn)){
      const [id, itemId] = hrBtn.getAttribute('data-raid-hr-add').split('|');
      raidHrQuery[id] = '';
      setHr(id, itemId, true);
      return;
    }
    const btn = /** @type {HTMLElement} */ (ev.target).closest('[data-raid-sr-add]');
    if (!btn || !root.contains(btn)) return;
    const id = btn.getAttribute('data-raid-id');
    const e = raidEvents[id];
    if (!e) return;
    // First free slot within the limit; filled slots keep their place.
    const slots = slotsOf(id);
    const free = [1, 2, 3].slice(0, e.srMax).map(n => 's' + n).find(k => !slots[k]);
    if (!free) return;
    slots[free] = Number(btn.getAttribute('data-raid-sr-add'));
    raidSrQuery[id] = '';
    raidSrSave(id, slots);
  });
  root.dataset.raidSrWired = '1';
  root.querySelectorAll('[data-raid-sr-remove]').forEach(btn => btn.addEventListener('click', () => {
    const id = btn.getAttribute('data-raid-id');
    const itemId = Number(btn.getAttribute('data-raid-sr-remove'));
    const slots = slotsOf(id);
    for (const k of Object.keys(slots)) if (slots[k] === itemId) delete slots[k];
    raidSrSave(id, slots);
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
