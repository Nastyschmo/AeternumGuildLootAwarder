// Boss-Guides page: per dungeon / raid every boss with what to expect and
// how we do it.
//
//  - Official part (data/forever/journal.json, scripts/forever-data/
//    journal.mjs): the boss list and order from the client's
//    DungeonEncounter table; Blizzard's Dungeon Journal (description,
//    abilities with icons and flags) once the Forever client ships it —
//    it doesn't yet (2026-10-05). Forever raids whose bosses aren't in
//    the client yet use the announced names (RAID_BOSSES, js/raid-tactics.js).
//  - Our part (Firebase bossGuides/<instanceKey>/<bossKey>, State
//    bossGuides, written by officers / admins, README § 6f): tactics
//    (rich text), hints per role, mechanics (BOSS_MECHANICS — journal flags
//    add theirs automatically) and class notes. Mechanics suggest the
//    classes that negate or ease them and the abilities the raid window's
//    Taktik step shows first for that boss.
// Keys: raidBossKey(name) for instance and boss (the same boss keys as
// raidPlans in js/raid-tactics.js).

/**
 * Mechanics a boss can have: what helps against them.
 * abilities: RAID_TACTIC_ABILITIES ids for the Taktik step; classes: classId -> what it brings.
 * @type {{ id: string, label: string, icon: string, abilities: string[], classes: Record<string, string> }[]}
 */
const BOSS_MECHANICS = [
  { id: 'fear', label: 'Furcht', icon: 'spell_shadow_possession', abilities: ['fearward', 'tremor'], classes: { priest: 'Fear Ward auf die Tanks', shaman: 'Tremor Totem' } },
  { id: 'magic', label: 'Magie-Debuffs', icon: 'spell_holy_dispelmagic', abilities: ['dispel', 'cleanse'], classes: { priest: 'Dispel Magic', paladin: 'Cleanse' } },
  { id: 'curse', label: 'Flüche', icon: 'spell_holy_removecurse', abilities: ['decurse_mage', 'decurse_druid'], classes: { mage: 'Remove Lesser Curse', druid: 'Remove Curse' } },
  { id: 'poison', label: 'Gift', icon: 'spell_nature_nullifypoison', abilities: ['poison_druid', 'cleansing_totem', 'cleanse'], classes: { druid: 'Abolish Poison', shaman: 'Poison Cleansing Totem', paladin: 'Cleanse' } },
  { id: 'disease', label: 'Krankheit', icon: 'spell_nature_nullifydisease', abilities: ['disease_priest', 'cleansing_totem', 'cleanse'], classes: { priest: 'Abolish Disease', shaman: 'Disease Cleansing Totem', paladin: 'Cleanse' } },
  { id: 'interrupt', label: 'Unterbrechbare Zauber', icon: 'ability_kick', abilities: [], classes: { rogue: 'Kick', warrior: 'Pummel / Shield Bash', mage: 'Counterspell', shaman: 'Earth Shock' } },
  { id: 'enrage', label: 'Raserei', icon: 'spell_nature_drowsy', abilities: ['tranq'], classes: { hunter: 'Tranquilizing Shot' } },
  { id: 'fire', label: 'Feuerschaden', icon: 'spell_fire_firearmor', abilities: ['aura', 'resist_totem'], classes: { paladin: 'Fire Resistance Aura', shaman: 'Fire Resistance Totem' } },
  { id: 'frost', label: 'Frostschaden', icon: 'spell_frost_frostward', abilities: ['aura', 'resist_totem'], classes: { paladin: 'Frost Resistance Aura', shaman: 'Frost Resistance Totem' } },
  { id: 'shadow', label: 'Schattenschaden', icon: 'spell_shadow_antishadow', abilities: ['shadowprot', 'aura'], classes: { priest: 'Shadow Protection', paladin: 'Shadow Resistance Aura' } },
  { id: 'nature', label: 'Naturschaden', icon: 'spell_nature_natureresistancetotem', abilities: ['resist_totem'], classes: { shaman: 'Nature Resistance Totem' } },
  { id: 'adds', label: 'Adds kontrollieren', icon: 'spell_nature_polymorph', abilities: ['poly', 'banish', 'shackle', 'hibernate', 'trap', 'sap'], classes: { mage: 'Polymorph', warlock: 'Banish (Dämonen, Elementare)', priest: 'Shackle Undead (Untote)', druid: 'Hibernate (Wildtiere, Drachkin)', hunter: 'Freezing Trap', rogue: 'Sap (vor dem Kampf)' } },
  { id: 'mc', label: 'Gedankenkontrolle', icon: 'spell_shadow_shadowworddominate', abilities: ['poly'], classes: { mage: 'Polymorph auf übernommene Spieler' } },
  { id: 'wipe', label: 'Wipe-Gefahr', icon: 'spell_shadow_soulgem', abilities: ['soulstone', 'rebirth', 'di'], classes: { warlock: 'Soulstone', druid: 'Rebirth', paladin: 'Divine Intervention' } }
];
/** Journal section icon flags (bit -> mechanic id / label), as in Blizzard's Encounter Journal. */
const BOSS_JOURNAL_FLAGS = [['tank', 'Tank'], ['damage', 'Schaden'], ['healer', 'Heiler'], ['heroic', 'Heroisch'], ['deadly', 'Tödlich'], ['important', 'Wichtig'],
  ['interrupt', 'Unterbrechbar'], ['magic', 'Magie'], ['curse', 'Fluch'], ['poison', 'Gift'], ['disease', 'Krankheit'], ['enrage', 'Raserei']];

/** data/forever/journal.json (null = not loaded yet / missing). @type {{ build: string, instances: any[] } | null} */
let bossJournal = null;
let bossJournalLoading = false;
function bossJournalLoad(){
  if (bossJournal || bossJournalLoading) return;
  bossJournalLoading = true;
  fetch('data/forever/journal.json').then(r => r.ok ? r.json() : null).catch(() => null).then(j => {
    bossJournal = j && Array.isArray(j.instances) ? j : { build: '', instances: [] };
    if (currentPage === 'bosses') renderBossGuidesPage();
    if (currentPage === 'raids') renderRaidsPage();
  });
}

/**
 * All instances with bosses: Forever raids (RAID_INSTANCES) first, then
 * other raids, then dungeons. Bosses from the client data, else announced.
 * @returns {{ key: string, name: string, kind: 'r' | 'd', size: number, isNew: boolean, reworked: boolean, source: 'client' | 'announced', bosses: { key: string, name: string, journal: any }[] }[]}
 */
function bossGuideInstances(){
  const fromClient = new Map(((bossJournal && bossJournal.instances) || []).map(x => [x.n, x]));
  const out = [];
  const seen = new Set();
  const add = (name, kind, size, isNew, reworked) => {
    if (seen.has(name)) return;
    const j = fromClient.get(name);
    const announced = RAID_BOSSES[name] || [];
    const list = j && j.bosses.length ? j.bosses.map(b => ({ name: b.n, journal: b })) : announced.map(n => ({ name: n, journal: null }));
    if (!list.length) return;
    seen.add(name);
    out.push({ key: raidBossKey(name), name, kind, size, isNew, reworked: Boolean(reworked), source: j && j.bosses.length ? 'client' : 'announced', bosses: list.map(b => ({ key: raidBossKey(b.name), ...b })) });
  };
  for (const [name, size] of Object.entries(RAID_INSTANCES)) add(name, 'r', size, true);
  const rest = [...fromClient.values()].sort((a, z) => (a.kind === 'r' ? 0 : 1) - (z.kind === 'r' ? 0 : 1) || a.n.localeCompare(z.n));
  for (const x of rest) add(x.n, x.kind === 'r' ? 'r' : 'd', 0, Boolean(x.new), Boolean(x.upd));
  return out;
}
/** Boss names of an instance for the Taktik step (client order, else announced). @param {string} instance */
function bossGuideBossNames(instance){
  const inst = bossGuideInstances().find(x => x.name === instance);
  return inst ? inst.bosses.map(b => b.name) : (RAID_BOSSES[instance] || []);
}
/** Our guide of a boss (or null). @param {string} instKey @param {string} bossKey */
const bossGuideOf = (instKey, bossKey) => ((state.bossGuides || {})[instKey] || {})[bossKey] || null;
/** Mechanics flagged in the journal sections (icon flags; "fear" from the text). @param {any} journal */
function bossJournalMechs(journal){
  const out = new Set();
  const walk = list => (list || []).forEach(sec => {
    for (let bit = 0; bit < BOSS_JOURNAL_FLAGS.length; bit++) if ((sec.f || 0) & (1 << bit)) out.add(BOSS_JOURNAL_FLAGS[bit][0]);
    if (/\bfear|furcht/i.test(`${sec.t} ${sec.b || ''}`)) out.add('fear');
    walk(sec.c);
  });
  walk(journal && journal.sec);
  return new Set([...out].filter(id => BOSS_MECHANICS.some(m => m.id === id)));
}
/** Mechanics of a boss: ours + the journal's. @param {string} instance @param {string} bossName */
function bossMechanics(instance, bossName){
  const inst = bossGuideInstances().find(x => x.name === instance);
  const boss = inst && inst.bosses.find(b => b.name === bossName);
  const g = bossGuideOf(raidBossKey(instance), raidBossKey(bossName));
  const ids = new Set([...Object.keys((g && g.mech) || {}), ...bossJournalMechs(boss && boss.journal)]);
  return BOSS_MECHANICS.filter(m => ids.has(m.id));
}
/** Taktik abilities to show first for a boss (from its mechanics). @param {string} instance @param {string} bossName */
const bossRecommendedAbilities = (instance, bossName) => new Set(bossMechanics(instance, bossName).flatMap(m => m.abilities));

// ---------------------------------------------------------------- page state
const BOSS_VIEW_KEY = 'rude-boss-view-v1';
let bossSel = { inst: '', boss: '' };
try { const v = JSON.parse(sessionStorage.getItem(BOSS_VIEW_KEY) || 'null'); if (v && typeof v.inst === 'string') bossSel = { inst: v.inst, boss: String(v.boss || '') }; } catch (e){ /* ignore */ }
let bossEditing = false;
let bossStatusMsg = '';
/** Open a boss (also from the raid window). @param {string} instKey @param {string} bossKey */
function bossGuideOpen(instKey, bossKey){
  bossSel = { inst: instKey, boss: bossKey };
  bossEditing = false;
  try { sessionStorage.setItem(BOSS_VIEW_KEY, JSON.stringify(bossSel)); } catch (e){ /* ignore */ }
  if (currentPage === 'bosses') renderBossGuidesPage(); else showPage('bosses');
}

/** Class name in its color with the class icon. @param {string} classId */
function bossClassHtml(classId){
  const c = CLASS_MAP[classId];
  if (!c) return '';
  const icon = TALENT_DATA[c.label] ? gameIconHtml(TALENT_DATA[c.label].icon, 18, c.label) : '';
  return `<span class="boss-class" style="color:${c.color}">${icon}${escapeHtml(c.label)}</span>`;
}

/** Journal sections (abilities tree). */
function bossJournalHtml(list, depth){
  return `<ul class="boss-journal${depth ? ' sub' : ''}">${(list || []).map(sec => {
    const flags = BOSS_JOURNAL_FLAGS.filter((_, bit) => (sec.f || 0) & (1 << bit)).map(([, label]) => `<span class="boss-flag">${escapeHtml(label)}</span>`).join('');
    const head = `${sec.i ? gameIconHtml(sec.i, 20) : ''}<b>${escapeHtml(sec.t)}</b>${flags}`;
    const body = sec.b ? `<p>${escapeHtml(sec.b).replace(/\n/g, '<br>')}</p>` : '';
    return `<li><div class="boss-journal-head">${head}</div>${body}${sec.c ? bossJournalHtml(sec.c, depth + 1) : ''}</li>`;
  }).join('')}</ul>`;
}

function renderBossGuidesPage(){
  const root = document.getElementById('bossGuidesRoot');
  if (!root) return;
  if (!discordIdentity || !isMemberOrHigher()){
    root.innerHTML = `<div class="tac-card"><p class="bis-hint">Die Boss-Guides sehen Gildenmitglieder.${discordIdentity ? '' : ' Melde Dich oben rechts mit Discord an.'}</p></div>`;
    return;
  }
  bossJournalLoad();
  const all = bossGuideInstances();
  const inst = all.find(x => x.key === bossSel.inst) || all[0];
  if (!inst){ root.innerHTML = '<div class="tac-card"><p class="bis-hint">Lade …</p></div>'; return; }
  const boss = inst.bosses.find(b => b.key === bossSel.boss) || inst.bosses[0];
  const guides = (state.bossGuides || {})[inst.key] || {};
  const chip = x => `<button type="button" class="tac-boss${x.key === inst.key ? ' active' : ''}" data-boss-inst="${escapeHtml(x.key)}">${escapeHtml(x.name)}${x.size ? ` <small>${x.size}er</small>` : ''}${x.reworked ? ' <small title="In Forever überarbeitet (neue Bosse in den Spieldaten)">überarbeitet</small>' : ''}</button>`;
  /** @type {[string, typeof all][]} */
  const groups = [['Forever-Raids', all.filter(x => x.isNew && x.kind === 'r')], ['Neu in Forever', all.filter(x => x.isNew && x.kind === 'd')],
    ['Classic-Raids', all.filter(x => !x.isNew && x.kind === 'r')], ['Classic-Dungeons', all.filter(x => !x.isNew && x.kind === 'd')]];
  root.innerHTML = `
    ${bossStatusMsg ? `<p class="bis-hint">${escapeHtml(bossStatusMsg)}</p>` : ''}
    <div class="tac-card boss-picker">${groups.filter(([, l]) => l.length).map(([label, list]) => `<div class="boss-picker-row"><span class="tac-park-title">${label}</span><div class="tac-bosses">${list.map(chip).join('')}</div></div>`).join('')}</div>
    <div class="boss-layout">
      <nav class="tac-card boss-list" aria-label="Bosse">
        <div class="raid-col-head">${escapeHtml(inst.name)} <span>${inst.bosses.length} Bosse</span></div>
        <ol>${inst.bosses.map((b, i) => {
          const g = guides[b.key];
          return `<li><button type="button" class="boss-list-item${b.key === boss.key ? ' active' : ''}" data-boss-pick="${escapeHtml(b.key)}"><span class="tac-kick-num">${i + 1}</span><span>${escapeHtml(b.name)}</span>${g && (g.text || Object.keys(g.mech).length) ? '<small class="boss-has-guide" title="Guide vorhanden">✓</small>' : ''}</button></li>`;
        }).join('')}</ol>
        ${inst.reworked ? '<p class="bis-item-meta boss-source">In WoW Forever überarbeitet — die Spieldaten haben neue Bosse gegenüber Classic.</p>' : ''}
        <p class="bis-item-meta boss-source">${inst.source === 'client' ? `Bossliste aus den Spieldaten (Build ${escapeHtml(bossJournal ? bossJournal.build : '')})` : 'Bossliste wie angekündigt — noch nicht in den Spieldaten'}</p>
      </nav>
      <div class="boss-detail">${bossDetailHtml(inst, boss, inst.bosses.indexOf(boss))}</div>
    </div>`;
  bossWire(root, inst, boss);
}

/** One boss: official info, mechanics, classes, our tactics. */
function bossDetailHtml(inst, boss, index){
  const g = bossGuideOf(inst.key, boss.key);
  const officer = isOfficerOrAdmin();
  const mechs = bossMechanics(inst.name, boss.name);
  const journalMechs = bossJournalMechs(boss.journal);
  if (bossEditing && officer) return bossEditHtml(inst, boss, g, journalMechs);
  // Classes: from the mechanics, plus our notes.
  /** @type {Map<string, string[]>} */
  const classes = new Map();
  for (const m of mechs) for (const [c, what] of Object.entries(m.classes)) { if (!classes.has(c)) classes.set(c, []); classes.get(c).push(`${what} (${m.label})`); }
  for (const [c, note] of Object.entries((g && g.classes) || {})) if (note) { if (!classes.has(c)) classes.set(c, []); classes.get(c).unshift(note); }
  const roles = g ? [['tank', 'Tanks'], ['healer', 'Heiler'], ['damage', 'Damage']].filter(([r]) => g.roles[r]) : [];
  const j = boss.journal;
  return `<div class="tac-card">
    <div class="boss-detail-head">
      <div><span class="bis-item-meta">${escapeHtml(inst.name)} · Boss ${index + 1} von ${inst.bosses.length}</span><h2 class="boss-title">${escapeHtml(boss.name)}</h2></div>
      ${officer ? '<button type="button" class="btn btn-ghost btn-sm" data-boss-edit>Bearbeiten</button>' : ''}
    </div>
    ${g && g.img ? `<a class="boss-img" href="${escapeHtml(g.img)}" target="_blank" rel="noopener"><img src="${escapeHtml(g.img)}" alt="${escapeHtml(boss.name)}" loading="lazy" onerror="this.parentNode.remove()"></a>` : ''}
    ${mechs.length ? `<div class="boss-mechs">${mechs.map(m => `<span class="boss-mech" title="${journalMechs.has(m.id) ? 'aus dem Dungeon Journal' : 'von den Offizieren'}">${gameIconHtml(m.icon, 18)}${escapeHtml(m.label)}</span>`).join('')}</div>` : ''}
    <div class="tac-section">
      <div class="raid-col-head">${gameIconHtml('patch', 16)} Offizielle Infos <span>Blizzard Dungeon Journal</span></div>
      ${j && (j.desc || j.sec) ? `${j.desc ? `<p class="boss-desc">${escapeHtml(j.desc)}</p>` : ''}${j.sec ? bossJournalHtml(j.sec, 0) : ''}`
        : '<p class="bis-hint">Blizzard liefert für WoW Forever noch keine Dungeon-Journal-Daten (Beschreibung, Fähigkeiten). Sie erscheinen hier automatisch, sobald der Client sie enthält.</p>'}
    </div>
    <div class="tac-section">
      <div class="raid-col-head">${gameIconHtml('raid', 16)} Unsere Taktik ${g && g.updatedAt ? `<span>zuletzt ${escapeHtml(new Date(g.updatedAt).toLocaleDateString('de-DE'))}${g.updatedBy ? ` von ${escapeHtml(g.updatedBy)}` : ''}</span>` : ''}</div>
      ${g && g.text ? `<div class="boss-text">${g.text}</div>` : `<p class="bis-hint">${officer ? 'Noch keine Taktik — „Bearbeiten“ oben rechts.' : 'Die Offiziere haben noch keine Taktik eingetragen.'}</p>`}
      ${roles.length ? `<div class="boss-roles">${roles.map(([r, label]) => `<div class="boss-role"><div class="boss-role-head">${roleIconHtml(r, 18)} ${label}</div><p>${escapeHtml(g.roles[r]).replace(/\n/g, '<br>')}</p></div>`).join('')}</div>` : ''}
    </div>
    <div class="tac-section">
      <div class="raid-col-head">${gameIconHtml('character', 16)} Hilfreiche Klassen <span>negieren oder erleichtern Mechaniken</span></div>
      ${classes.size ? `<div class="boss-classes">${[...classes].map(([c, list]) => `<div class="boss-class-row">${bossClassHtml(c)}<span>${list.map(escapeHtml).join(' · ')}</span></div>`).join('')}</div>`
        : '<p class="bis-hint">Noch keine Mechaniken eingetragen.</p>'}
    </div>
  </div>`;
}

/** Officers: edit a boss's guide. */
function bossEditHtml(inst, boss, g, journalMechs){
  const mech = (g && g.mech) || {};
  return `<div class="tac-card boss-edit">
    <div class="boss-detail-head"><div><span class="bis-item-meta">${escapeHtml(inst.name)}</span><h2 class="boss-title">${escapeHtml(boss.name)} bearbeiten</h2></div></div>
    <div class="tac-section">
      <div class="raid-col-head">Mechaniken <span>schlagen Klassen und Fähigkeiten für die Raid-Taktik vor</span></div>
      <div class="boss-mech-pick">${BOSS_MECHANICS.map(m => `<label class="boss-mech${journalMechs.has(m.id) ? ' locked' : ''}">
        <input type="checkbox" data-boss-mech="${m.id}" ${mech[m.id] || journalMechs.has(m.id) ? 'checked' : ''} ${journalMechs.has(m.id) ? 'disabled title="aus dem Dungeon Journal"' : ''}>${gameIconHtml(m.icon, 18)}${escapeHtml(m.label)}</label>`).join('')}</div>
    </div>
    <label class="tac-bg">Bild des Bosses (Link, optional — z. B. Screenshot aus dem Spiel oder das Modellbild von Wowhead)<input type="url" class="apply-text-input" data-boss-img value="${escapeHtml(g ? g.img : '')}" placeholder="https://…"></label>
    <div class="tac-section">
      <div class="raid-col-head">Taktik</div>
      <div class="announce-toolbar" id="bossEditToolbar">${announceToolbarMarkup()}</div>
      <div class="announce-editor" id="bossEditText" contenteditable="true" data-placeholder="Ablauf, Phasen, Positionen, worauf jeder achten muss …">${g ? g.text : ''}</div>
    </div>
    <div class="tac-section boss-roles-edit">
      ${[['tank', 'Tanks'], ['healer', 'Heiler'], ['damage', 'Damage']].map(([r, label]) => `<label>${roleIconHtml(r, 16)} ${label}<textarea class="apply-text-input" data-boss-role="${r}" rows="2" maxlength="1000">${escapeHtml(g ? g.roles[r] : '')}</textarea></label>`).join('')}
    </div>
    <div class="tac-section">
      <div class="raid-col-head">Klassen-Hinweise <span>optional, zusätzlich zu den Mechaniken</span></div>
      <div class="boss-class-edit">${CLASSES.map(c => `<label>${bossClassHtml(c.id)}<input type="text" class="apply-text-input" data-boss-class="${c.id}" maxlength="200" value="${escapeHtml(g ? g.classes[c.id] || '' : '')}" placeholder="z. B. Fear Ward vor Phase 2"></label>`).join('')}</div>
    </div>
    <div class="forever-actions">
      <button type="button" class="btn btn-teal btn-sm" data-boss-save>Speichern</button>
      <button type="button" class="btn btn-ghost btn-sm" data-boss-cancel>Abbrechen</button>
    </div>
  </div>`;
}

/** @param {HTMLElement} root */
function bossWire(root, inst, boss){
  root.querySelectorAll('[data-boss-inst]').forEach(btn => btn.addEventListener('click', () => { bossStatusMsg = ''; bossGuideOpen(btn.getAttribute('data-boss-inst'), ''); }));
  root.querySelectorAll('[data-boss-pick]').forEach(btn => btn.addEventListener('click', () => { bossStatusMsg = ''; bossGuideOpen(inst.key, btn.getAttribute('data-boss-pick')); }));
  const on = (sel, fn) => { const el = root.querySelector(sel); if (el) el.addEventListener('click', fn); };
  on('[data-boss-edit]', () => { bossSel = { inst: inst.key, boss: boss.key }; bossEditing = true; renderBossGuidesPage(); });
  on('[data-boss-cancel]', () => { bossEditing = false; renderBossGuidesPage(); });
  wireAnnounceToolbar(document.getElementById('bossEditToolbar'), document.getElementById('bossEditText'));
  on('[data-boss-save]', async () => {
    const val = (/** @type {string} */ sel) => /** @type {HTMLInputElement} */ (root.querySelector(sel)).value.trim();
    /** @type {Record<string, true>} */
    const mech = {};
    root.querySelectorAll('[data-boss-mech]').forEach((/** @type {HTMLInputElement} */ el) => { if (el.checked && !el.disabled) mech[el.getAttribute('data-boss-mech')] = true; });
    /** @type {Record<string, string>} */
    const classes = {};
    root.querySelectorAll('[data-boss-class]').forEach((/** @type {HTMLInputElement} */ el) => { const v = el.value.trim().slice(0, 200); if (v) classes[el.getAttribute('data-boss-class')] = v; });
    const editor = document.getElementById('bossEditText');
    const guide = {
      text: sanitizeRichText(editor ? editor.innerHTML : '').slice(0, 20000),
      roles: { tank: val('[data-boss-role="tank"]').slice(0, 1000), healer: val('[data-boss-role="healer"]').slice(0, 1000), damage: val('[data-boss-role="damage"]').slice(0, 1000) },
      classes, mech,
      img: RAID_MAP_URL.test(val('[data-boss-img]')) ? val('[data-boss-img]').slice(0, 500) : '',
      updatedAt: Date.now(),
      updatedBy: (discordIdentity && discordIdentity.username) || ''
    };
    try {
      await db.ref(`${DB_PATH}/bossGuides/${inst.key}/${boss.key}`).set(guide);
      bossEditing = false;
      bossStatusMsg = '';
    } catch (e){ bossStatusMsg = 'Konnte den Guide nicht speichern — Firebase-Regeln aktualisiert?'; }
    renderBossGuidesPage();
  });
}
