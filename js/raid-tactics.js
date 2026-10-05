// Raid window, step "Taktik": boss-by-boss raid plan instead of external
// sheets — who does what (Soulstone, Innervate, curses, blessings, heal
// and tank targets …), raid groups, a positioning board per boss, notes
// and an MRT note to paste in game.
//
// Firebase (README § 6f):
//  - raidPlans/<eventId> = {
//      groups: { "<uid>|<charKey>": 1..8 },
//      bosses: { <bossKey>: {
//        a: { "<abilityId>~<uid>|<charKey>": { t: target, n?: note } },
//        note: text,
//        kicks: { <kickId>: { spell: boss cast, order: ["<uid>|<charKey>", …] } },
//        map: { bg: imageUrl, tok: { <tokenId>: { x: 0..100, y: 0..100 } } } } } }
//    Board tokens: boss, g1..gN (raid groups), m1..m8 (raid markers),
//    p_<raidBossKey(uid|charKey)> (single players).
//    bossKey 'all' = the whole raid (groups, blessings, buffs).
//  - Read: officers / admins, and the players in the event's published
//    line-up (raidEvents/<id>/rosterUids, kept by js/raid-comp.js). Write:
//    officers / admins.
//
// Bosses: RAID_BOSSES per instance (announced Forever bosses; mechanics
// aren't known yet). Abilities: RAID_TACTIC_ABILITIES — only what exists
// in our Forever spell / talent data (e.g. no Curse of Shadow / Curse of
// Doom in Forever), talent abilities only for the spec that has them.

/** Bosses per instance, in raid order (as announced for WoW Forever). */
const RAID_BOSSES = {
  "Onyxia's Lair": ['Onyxia'],
  'Barrow Deeps': ['Deepscar Matriarch', 'Elder Tangleclaw', 'Khalith the Dreadspinner', 'Well of Sorrow', 'Amethrax', "Del'lynar Songwood", 'Ravus and Darlissa', 'Sonya Darkhallow'],
  'Hyjal Summit': ['Bandalar', 'Time-Lost Battalion', 'Old Gloomlurker', 'Kathris the Haunted', 'Elder Minderel', 'Council of Thorns', 'The Wild King', 'Ancient of Decay', 'Sylvesteris Dusksong', 'Gharalis the Abyssal', 'Anara Chillwind', 'Tracker Stillwind', 'Nythus the Dreambound']
};

/**
 * Assignable abilities. target: 'player' (a raid member), 'group' (raid
 * group), 'choice' (one of options), 'toggle' (does it / doesn't),
 * 'text' (free: Boss, Add, Seite …). Either `cls` (+ `spell` that must
 * exist in the data, `specs` for talent abilities) or `role`.
 * @type {{ id: string, label: string, cls?: string, role?: string, spell?: string, specs?: string[], target: 'player' | 'group' | 'choice' | 'toggle' | 'text', options?: string[], icon?: string, all?: boolean }[]}
 */
const RAID_TACTIC_ABILITIES = [
  { id: 'tank', role: 'tank', label: 'Tank-Ziel', target: 'text', icon: 'tank' },
  { id: 'heal', role: 'healer', label: 'Heilt', target: 'player', icon: 'healer' },
  { id: 'soulstone', cls: 'warlock', spell: 'Create Soulstone', label: 'Seelenstein', target: 'player', all: true },
  { id: 'curse', cls: 'warlock', label: 'Fluch', target: 'choice', options: ['Curse of Recklessness', 'Curse of the Elements', 'Curse of Tongues', 'Curse of Weakness'] },
  { id: 'banish', cls: 'warlock', spell: 'Banish', label: 'Verbannen', target: 'text' },
  { id: 'innervate', cls: 'druid', spell: 'Innervate', label: 'Anregen', target: 'player' },
  { id: 'rebirth', cls: 'druid', spell: 'Rebirth', label: 'Wiedergeburt', target: 'player' },
  { id: 'decurse_druid', cls: 'druid', spell: 'Remove Curse', label: 'Flüche entfernen', target: 'group' },
  { id: 'faerie', cls: 'druid', spell: 'Faerie Fire', label: 'Feenfeuer', target: 'toggle' },
  { id: 'pi', cls: 'priest', spell: 'Power Infusion', specs: ['discipline'], label: 'Seele der Macht', target: 'player' },
  { id: 'fearward', cls: 'priest', spell: 'Fear Ward', label: 'Furchtzauberschutz', target: 'player' },
  { id: 'dispel', cls: 'priest', spell: 'Dispel Magic', label: 'Magie bannen', target: 'group' },
  { id: 'shackle', cls: 'priest', spell: 'Shackle Undead', label: 'Untote fesseln', target: 'text' },
  { id: 'blessing', cls: 'paladin', label: 'Segen', target: 'choice', options: ['Blessing of Kings', 'Blessing of Might', 'Blessing of Wisdom', 'Blessing of Salvation', 'Blessing of Light'], all: true },
  { id: 'aura', cls: 'paladin', label: 'Aura', target: 'choice', options: ['Devotion Aura', 'Concentration Aura', 'Retribution Aura', 'Fire Resistance Aura', 'Frost Resistance Aura', 'Shadow Resistance Aura'] },
  { id: 'cleanse', cls: 'paladin', spell: 'Cleanse', label: 'Läutern', target: 'group' },
  { id: 'di', cls: 'paladin', spell: 'Divine Intervention', label: 'Göttliches Eingreifen', target: 'player' },
  { id: 'totems', cls: 'shaman', spell: 'Strength of Earth Totem', label: 'Totems (Gruppe)', target: 'group' },
  { id: 'tremor', cls: 'shaman', spell: 'Tremor Totem', label: 'Totem des Erdstoßes', target: 'toggle' },
  { id: 'purge', cls: 'shaman', spell: 'Purge', label: 'Reinigung (Purge)', target: 'toggle' },
  { id: 'decurse_mage', cls: 'mage', spell: 'Remove Lesser Curse', label: 'Fluch aufheben', target: 'group' },
  { id: 'poly', cls: 'mage', spell: 'Polymorph', label: 'Verwandlung', target: 'text' },
  { id: 'expose', cls: 'rogue', spell: 'Expose Armor', label: 'Rüstung schwächen', target: 'toggle' },
  { id: 'sunder', cls: 'warrior', spell: 'Sunder Armor', label: 'Rüstung zerreißen', target: 'toggle' },
  { id: 'demo', cls: 'warrior', spell: 'Demoralizing Shout', label: 'Demoralisierender Ruf', target: 'toggle' },
  { id: 'tclap', cls: 'warrior', spell: 'Thunder Clap', label: 'Donnerknall', target: 'toggle' },
  { id: 'tranq', cls: 'hunter', spell: 'Tranquilizing Shot', label: 'Einlullender Schuss', target: 'toggle' },
  { id: 'mark', cls: 'hunter', spell: "Hunter's Mark", label: 'Mal des Jägers', target: 'toggle' }
];
/** Interrupts per class for the Kick-Reihenfolge (only those in our data count; talents only for the spec). */
const RAID_INTERRUPTS = [
  { cls: 'rogue', spell: 'Kick' }, { cls: 'warrior', spell: 'Pummel' }, { cls: 'warrior', spell: 'Shield Bash', specs: ['protection'] },
  { cls: 'mage', spell: 'Counterspell' }, { cls: 'shaman', spell: 'Earth Shock' }, { cls: 'priest', spell: 'Silence', specs: ['shadow'] },
  { cls: 'druid', spell: 'Feral Charge', specs: ['feral', 'feral_tank'] }, { cls: 'warlock', spell: 'Spell Lock' }
];
/** Raid target markers for the board, {rt1}..{rt8} in game (colors: --mk-1..8 in css/main.css). */
const RAID_MARKERS = ['Stern', 'Kreis', 'Raute', 'Dreieck', 'Mond', 'Quadrat', 'Kreuz', 'Totenkopf'];
/** Map image links: https, no quotes / brackets (used in a CSS url()). */
const RAID_MAP_URL = /^https:\/\/[^\s'"()\\<>]+$/;

/** eventId -> plan. @type {Record<string, any>} */
let raidPlans = {};
/** Events with a plan listener (kept: only the open raid and the next few on Home). */
const raidPlanSyncIds = new Set();
let raidPlanError = '';
/** Selected boss per event. @type {Record<string, string>} */
const raidTacticBoss = {};

function raidPlanSync(eventId){
  if (!db || raidPlanSyncIds.has(eventId)) return;
  raidPlanSyncIds.add(eventId);
  db.ref(`${DB_PATH}/raidPlans/${eventId}`).on('value', snap => {
    raidPlans[eventId] = snap.val() || {};
    raidPlanError = '';
    if (currentPage === 'raids') renderRaidsPage();
    if (currentPage === 'home') renderHomeDashboard();
  }, () => { raidPlanSyncIds.delete(eventId); raidPlanError = 'Keine Leserechte für die Taktik — Firebase-Regeln aktualisiert?'; if (currentPage === 'raids') renderRaidsPage(); });
}

/** Firebase-safe key for a boss. @param {string} name */
const raidBossKey = name => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'boss';
/** Bosses of an event ("Ganzer Raid" first). @param {RaidEvent} e */
function raidTacticBosses(e){
  return [['all', 'Ganzer Raid'], ...(RAID_BOSSES[e.instance] || []).map(n => [raidBossKey(n), n])];
}
/** Does the Forever data have this spell / talent for the class? @param {string} classId @param {string} spell */
function raidClassHasSpell(classId, spell){
  const label = CLASS_MAP[classId] && CLASS_MAP[classId].label;
  if (!label) return false;
  const book = SPELLBOOK_DATA[label];
  if (book && (book.tabs || []).some(t => (t.spells || []).some(s => s[0] === spell))) return true;
  const tal = TALENT_DATA[label];
  return Boolean(tal && tal.trees.some(t => t.talents.some(x => x.name === spell)));
}
/** Spell icon from the spellbook data ('' = none). @param {string} classId @param {string} spell */
function raidSpellIcon(classId, spell){
  const label = CLASS_MAP[classId] && CLASS_MAP[classId].label;
  const book = label && SPELLBOOK_DATA[label];
  if (book && book.icons && book.icons[spell]) return book.icons[spell];
  const tal = label && TALENT_DATA[label];
  const t = tal && tal.trees.flatMap(x => x.talents).find(x => x.name === spell);
  return t ? t.icon : '';
}
/** Options of a choice ability that exist in the data. @param {typeof RAID_TACTIC_ABILITIES[number]} ab */
const raidAbilityOptions = ab => (ab.options || []).filter(o => raidClassHasSpell(ab.cls, o));
/** Can this line-up character do the ability? @param {typeof RAID_TACTIC_ABILITIES[number]} ab @param {any} s */
function raidCanDo(ab, s){
  if (ab.role) return s.role === ab.role;
  if (s.classId !== ab.cls) return false;
  if (ab.specs && !ab.specs.includes(s.specId)) return false;
  if (ab.spell) return raidClassHasSpell(ab.cls, ab.spell);
  return raidAbilityOptions(ab).length > 0;
}
/** Icon of an ability (HTML). @param {typeof RAID_TACTIC_ABILITIES[number]} ab */
function raidAbilityIconHtml(ab){
  if (ab.icon) return gameIconHtml(ab.icon, 20);
  const icon = raidSpellIcon(ab.cls, ab.spell || (ab.options || [])[0] || '');
  return icon ? gameIconHtml(icon, 20, ab.spell || ab.label) : '';
}
/** The line-up the plan works on (published or draft). @param {string} id @param {RaidEvent} e */
function raidTacticRoster(id, e){
  return raidCompPicked(id, e).sort((a, z) => ['tank', 'healer', 'damage'].indexOf(a.role) - ['tank', 'healer', 'damage'].indexOf(z.role) || a.classId.localeCompare(z.classId) || (a.charName || '').localeCompare(z.charName || '', 'de'));
}
/** Name in class color. @param {any} s */
const raidCharName = s => `<span class="loot-char" style="color:${CLASS_MAP[s.classId] ? CLASS_MAP[s.classId].color : 'var(--text)'}">${escapeHtml(s.charName || s.name)}</span>`;
/** May the user see the Taktik step? @param {string} id @param {RaidEvent} e */
function raidTacticVisible(id, e){
  if (isOfficerOrAdmin()) return true;
  return Boolean(discordIdentity && e.rosterPublished && raidCompPicked(id, e).some(s => s.uid === discordIdentity.id));
}
/** Interrupt spell of a line-up character ('' = none). @param {any} s */
function raidInterruptOf(s){
  const it = RAID_INTERRUPTS.find(x => x.cls === s.classId && (!x.specs || x.specs.includes(s.specId)) && raidClassHasSpell(x.cls, x.spell));
  return it ? it.spell : '';
}
/** Kick entries of a boss, order as an array (Firebase may hand back an object). @param {any} boss */
function raidBossKicks(boss){
  return Object.entries((boss && boss.kicks) || {}).filter(([, k]) => k && typeof k === 'object')
    .map(([kid, k]) => ({ kid, spell: String(k.spell || ''), order: (Array.isArray(k.order) ? k.order : Object.values(k.order || {})).filter(x => typeof x === 'string') }));
}
/** Board token id of a player. @param {string} key "uid|charKey" */
const raidPlayerTok = key => `p_${raidBossKey(key)}`;
/** Rough spot on the board in words. @param {number} x @param {number} y */
const raidBoardWhere = (x, y) => `${y < 34 ? 'oben' : y > 66 ? 'unten' : 'mitte'}${x < 34 ? ' links' : x > 66 ? ' rechts' : ''}`;
/**
 * Own tasks over all bosses: assignments, kick order, own spot on the board.
 * @param {string} id @param {RaidEvent} e
 * @returns {{ chars: any[], group: number, rows: { boss: string, html: string }[] }}
 */
function raidTacticMyTasks(id, e){
  const roster = raidTacticRoster(id, e);
  const mine = roster.filter(s => discordIdentity && s.uid === discordIdentity.id);
  const plan = raidPlans[id] || {};
  const rows = [];
  if (!mine.length) return { chars: [], group: 0, rows };
  for (const [bk, name] of raidTacticBosses(e)) {
    const b = (plan.bosses || {})[bk];
    if (!b) continue;
    for (const [k, a] of Object.entries(b.a || {})) {
      const [abId, caster] = k.split('~');
      const ab = RAID_TACTIC_ABILITIES.find(x => x.id === abId);
      const t = ab && mine.some(x => x.key === caster) ? raidTargetText(ab, a, roster) : '';
      if (t) rows.push({ boss: name, html: `${raidAbilityIconHtml(ab)} ${escapeHtml(ab.label)}${ab.target === 'toggle' ? '' : ` → ${escapeHtml(t)}`}${a.n ? ` <span class="bis-item-meta">${escapeHtml(a.n)}</span>` : ''}` });
    }
    for (const k of raidBossKicks(b)) {
      const i = k.order.findIndex(key => mine.some(x => x.key === key));
      if (i >= 0) rows.push({ boss: name, html: `${gameIconHtml(raidSpellIcon(mine[0].classId, raidInterruptOf(mine[0])) || 'ability_kick', 20)} Kick <b>#${i + 1}</b> von ${k.order.length} bei ${escapeHtml(k.spell || 'Zauber')}` });
    }
    const tok = (b.map && b.map.tok) || {};
    for (const s of mine) {
      const p = tok[raidPlayerTok(s.key)];
      if (p) rows.push({ boss: name, html: `${gameIconHtml('explore', 20)} Position: ${escapeHtml(raidBoardWhere(p.x, p.y))}` });
    }
  }
  return { chars: mine, group: Number((plan.groups || {})[mine[0].key]) || 0, rows };
}

/** Number of raid groups. @param {RaidEvent} e @param {number} n line-up size */
const raidGroupCount = (e, n) => Math.max(1, Math.min(8, Math.ceil(Math.max(n, raidEventSize(e) || 5) / 5)));

/** Text of an assignment target. @param {typeof RAID_TACTIC_ABILITIES[number]} ab @param {any} a @param {any[]} roster */
function raidTargetText(ab, a, roster){
  if (!a || a.t == null || a.t === '') return '';
  if (ab.target === 'player'){ const s = roster.find(x => x.key === a.t); return s ? (s.charName || s.name) : ''; }
  if (ab.target === 'group') return `Gruppe ${a.t}`;
  if (ab.target === 'toggle') return a.t ? 'ja' : '';
  return String(a.t);
}

/** Sub line of the Taktik step tab. @param {string} id @param {RaidEvent} e */
function raidTacticStepLabel(id, e){
  raidPlanSync(id);
  const plan = raidPlans[id];
  if (!plan) return `${(RAID_BOSSES[e.instance] || []).length || 'keine'} Bosse`;
  const done = Object.entries(plan.bosses || {}).filter(([k, b]) => k !== 'all' && b && (b.note || Object.keys(b.a || {}).length)).length;
  return `${done}/${(RAID_BOSSES[e.instance] || []).length} Bosse geplant`;
}

// ---------------------------------------------------------------- rendering
/** The Taktik step of the raid window. @param {string} id @param {RaidEvent} e */
function raidTacticsHtml(id, e){
  raidPlanSync(id);
  const officer = isOfficerOrAdmin();
  const editable = officer && raidPhase(e) !== 'done';
  if (officer) raidRosterUidsSync(id, e);
  const roster = raidTacticRoster(id, e);
  if (!roster.length) return `<p class="bis-hint">Noch keine Aufstellung — die Taktik baut auf den gesetzten Charakteren auf (Schritt „Aufstellung“).</p>`;
  const plan = raidPlans[id] || {};
  const bosses = raidTacticBosses(e);
  const bossKey = bosses.some(([k]) => k === raidTacticBoss[id]) ? raidTacticBoss[id] : 'all';
  const boss = (plan.bosses || {})[bossKey] || {};
  const bossTabs = `<div class="tac-bosses">${bosses.map(([k, n]) => {
    const count = Object.values(((plan.bosses || {})[k] || {}).a || {}).filter(a => a && a.t !== '' && a.t != null && a.t !== false).length;
    return `<button type="button" class="tac-boss${k === bossKey ? ' active' : ''}" data-tac-boss="${escapeHtml(id)}|${k}">${k === 'all' ? gameIconHtml('raid', 16) : ''}${escapeHtml(n)}${count ? ` <small>${count}</small>` : ''}</button>`;
  }).join('')}</div>`;
  return `<div class="raid-tactics" data-tac-event="${escapeHtml(id)}">
    ${raidPlanError ? `<p class="bis-hint raid-error">${escapeHtml(raidPlanError)}</p>` : ''}
    ${raidTacticMineHtml(id, e)}
    ${bossTabs}
    ${!RAID_BOSSES[e.instance] ? '<p class="bis-hint">Für diese Instanz sind noch keine Bosse hinterlegt — nur „Ganzer Raid“.</p>' : ''}
    <div class="tac-section">
      <div class="raid-col-head">${gameIconHtml('patch', 16)} ${bossKey === 'all' ? 'Notiz für den ganzen Raid' : 'Taktik'}</div>
      ${editable ? `<textarea class="apply-text-input tac-note" data-tac-note="${escapeHtml(id)}|${bossKey}" rows="3" maxlength="2000" placeholder="Taktik, Phasen, worauf zu achten ist …">${escapeHtml(boss.note || '')}</textarea>`
        : boss.note ? `<p class="tac-note-text">${escapeHtml(boss.note)}</p>` : '<p class="bis-hint">Keine Notiz.</p>'}
    </div>
    ${bossKey === 'all' ? `${raidTacticSummaryHtml(roster)}${raidTacticGroupsHtml(id, e, roster, plan, editable)}` : ''}
    ${raidTacticBoardHtml(id, e, roster, plan, bossKey, boss, editable)}
    ${raidTacticKicksHtml(id, roster, bossKey, boss, editable)}
    ${raidTacticAssignHtml(id, roster, bossKey, boss, editable)}
    <div class="forever-actions">
      <button type="button" class="btn btn-ghost btn-sm" data-tac-mrt="${escapeHtml(id)}|${bossKey}">MRT-Notiz kopieren</button>
      ${editable && bossKey !== 'all' ? `<button type="button" class="btn btn-ghost btn-sm" data-tac-copyfrom="${escapeHtml(id)}|${bossKey}">Zuweisungen vom vorherigen Boss übernehmen</button>` : ''}
      ${editable ? raidTacticCopyEventHtml(id, e) : ''}
    </div>
  </div>`;
}

/** "Deine Aufgaben": own characters' tasks over all bosses. */
function raidTacticMineHtml(id, e){
  const { chars, group, rows } = raidTacticMyTasks(id, e);
  if (!chars.length) return '';
  return `<div class="tac-mine">
    <div class="raid-col-head">Deine Aufgaben <span>${chars.map(raidCharName).join(', ')}${group ? ` · Gruppe ${group}` : ''}</span></div>
    ${rows.length ? `<ul>${rows.map(r => `<li><b>${escapeHtml(r.boss)}:</b> ${r.html}</li>`).join('')}</ul>` : '<p class="bis-hint">Noch nichts zugewiesen.</p>'}
  </div>`;
}

/** What the line-up can do: ability -> who. */
function raidTacticSummaryHtml(roster){
  const rows = RAID_TACTIC_ABILITIES.filter(ab => !ab.role).map(ab => ({ ab, who: roster.filter(s => raidCanDo(ab, s)) })).filter(x => x.who.length);
  const role = r => roster.filter(s => s.role === r);
  return `<div class="tac-section">
    <div class="raid-col-head">${gameIconHtml('spells', 16)} Fähigkeiten im Raid <span>aus der Aufstellung, nach Forever-Spieldaten</span></div>
    <p class="tac-roles">${['tank', 'healer', 'damage'].map(r => `${roleIconHtml(r, 18)} <b>${role(r).length}</b> ${escapeHtml(RAID_ROLE_LABELS[r])}`).join(' · ')}</p>
    <div class="tac-summary">${rows.map(({ ab, who }) => `<div class="tac-sum-row">${raidAbilityIconHtml(ab)}<span class="tac-sum-label">${escapeHtml(ab.label)}${ab.specs ? ' <small>(Talent)</small>' : ''}</span><span class="tac-sum-who">${who.map(raidCharName).join(', ')}</span></div>`).join('')}</div>
  </div>`;
}

/** Raid groups (Ganzer Raid). */
function raidTacticGroupsHtml(id, e, roster, plan, editable){
  const n = raidGroupCount(e, roster.length);
  const groups = plan.groups || {};
  const cols = Array.from({ length: n }, (_, i) => i + 1).map(g => {
    const members = roster.filter(s => Number(groups[s.key]) === g);
    return `<div class="tac-group"><div class="tac-group-head">Gruppe ${g} <small>${members.length}/5</small></div>
      ${members.map(s => `<div class="tac-group-member">${roleIconHtml(s.role, 14)} ${raidCharName(s)}</div>`).join('') || '<span class="bis-item-meta">—</span>'}</div>`;
  }).join('');
  const unassigned = roster.filter(s => !groups[s.key]);
  return `<div class="tac-section">
    <div class="raid-col-head">${gameIconHtml('guild', 16)} Raidgruppen ${editable ? '<button type="button" class="btn btn-ghost btn-sm" data-tac-autogroups="' + escapeHtml(id) + '">Automatisch verteilen</button>' : ''}</div>
    <div class="tac-groups">${cols}</div>
    ${editable ? `<details class="tac-group-edit"${unassigned.length ? ' open' : ''}><summary>Gruppen zuweisen${unassigned.length ? ` (${unassigned.length} ohne Gruppe)` : ''}</summary>
      <div class="tac-group-grid">${roster.map(s => `<label>${roleIconHtml(s.role, 14)} ${raidCharName(s)}
        <select data-tac-group="${escapeHtml(id)}|${escapeHtml(s.key)}"><option value="">—</option>${Array.from({ length: n }, (_, i) => `<option value="${i + 1}" ${Number(groups[s.key]) === i + 1 ? 'selected' : ''}>Gruppe ${i + 1}</option>`).join('')}</select></label>`).join('')}</div>
    </details>` : ''}
  </div>`;
}

/** Assignment table of one boss. */
function raidTacticAssignHtml(id, roster, bossKey, boss, editable){
  const a = boss.a || {};
  const n = Math.max(1, Math.ceil(roster.length / 5));
  const blocks = RAID_TACTIC_ABILITIES.filter(ab => bossKey === 'all' ? ab.all : true).map(ab => {
    // Readers only see what is assigned.
    const casters = roster.filter(s => raidCanDo(ab, s) && (editable || raidTargetText(ab, a[`${ab.id}~${s.key}`], roster)));
    if (!casters.length) return '';
    const rows = casters.map(s => {
      const key = `${ab.id}~${s.key}`;
      const cur = a[key] || {};
      const data = `data-tac-assign="${escapeHtml(id)}|${bossKey}|${escapeHtml(key)}"`;
      let input;
      if (!editable) input = `<span class="tac-target">${escapeHtml(raidTargetText(ab, cur, roster) || '—')}</span>${cur.n ? ` <span class="bis-item-meta">${escapeHtml(cur.n)}</span>` : ''}`;
      else if (ab.target === 'player') input = `<select ${data}><option value="">—</option>${roster.filter(x => x.key !== s.key || ab.id === 'soulstone').map(x => `<option value="${escapeHtml(x.key)}" ${cur.t === x.key ? 'selected' : ''}>${escapeHtml(x.charName || x.name)} (${escapeHtml(RAID_ROLE_LABELS[x.role] || '')})</option>`).join('')}</select>`;
      else if (ab.target === 'group') input = `<select ${data}><option value="">—</option>${Array.from({ length: Math.max(n, 8) }, (_, i) => `<option value="${i + 1}" ${Number(cur.t) === i + 1 ? 'selected' : ''}>Gruppe ${i + 1}</option>`).join('')}</select>`;
      else if (ab.target === 'choice') input = `<select ${data}><option value="">—</option>${raidAbilityOptions(ab).map(o => `<option value="${escapeHtml(o)}" ${cur.t === o ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('')}</select>`;
      else if (ab.target === 'toggle') input = `<label class="tac-toggle"><input type="checkbox" ${data} ${cur.t ? 'checked' : ''}> übernimmt das</label>`;
      else input = `<input type="text" class="apply-text-input" ${data} maxlength="60" value="${escapeHtml(cur.t || '')}" placeholder="${ab.id === 'tank' ? 'Boss, Add, linke Seite …' : 'Ziel / Reihenfolge'}">`;
      const note = editable && ab.target !== 'toggle' && (cur.t || cur.n) ? `<input type="text" class="apply-text-input tac-assign-note" data-tac-assign-note="${escapeHtml(id)}|${bossKey}|${escapeHtml(key)}" maxlength="80" value="${escapeHtml(cur.n || '')}" placeholder="Notiz">` : '';
      return `<div class="tac-assign-row${discordIdentity && s.uid === discordIdentity.id ? ' mine' : ''}">${raidCharName(s)}${input}${note}</div>`;
    }).join('');
    return `<div class="tac-ability"><div class="tac-ability-head">${raidAbilityIconHtml(ab)} ${escapeHtml(ab.label)}</div>${rows}</div>`;
  }).join('');
  return `<div class="tac-section">
    <div class="raid-col-head">${gameIconHtml('talents', 16)} Zuweisungen <span>${bossKey === 'all' ? 'für den ganzen Raid (Seelensteine, Segen)' : 'für diesen Boss'}</span></div>
    <div class="tac-abilities">${blocks || `<p class="bis-hint">${editable ? 'Keine zuweisbaren Fähigkeiten in der Aufstellung.' : 'Noch nichts zugewiesen.'}</p>`}</div>
  </div>`;
}

/** Positioning board of one boss: boss, groups, single players and markers to drag. */
function raidTacticBoardHtml(id, e, roster, plan, bossKey, boss, editable){
  if (bossKey === 'all') return '';
  const n = raidGroupCount(e, roster.length);
  const tok = (boss.map && boss.map.tok) || {};
  const me = discordIdentity ? discordIdentity.id : '';
  /** @typedef {{ k: string, label: string, css: string, color?: string }} Tok */
  /** @type {[string, Tok[]][]} */
  const sets = [
    ['Boss & Gruppen', [{ k: 'boss', label: 'Boss', css: 'tac-tok-boss' }, ...Array.from({ length: n }, (_, i) => ({ k: `g${i + 1}`, label: `G${i + 1}`, css: 'tac-tok-group' }))]],
    ['Marker', RAID_MARKERS.map((name, i) => ({ k: `m${i + 1}`, label: name, css: `tac-tok-marker tac-mk${i + 1}` }))],
    ['Spieler', roster.map(s => ({ k: raidPlayerTok(s.key), label: s.charName || s.name, css: `tac-tok-player${s.uid === me ? ' tac-tok-mine' : ''}`, color: CLASS_MAP[s.classId] ? CLASS_MAP[s.classId].color : '' }))]
  ];
  const all = sets.flatMap(([, list]) => list);
  /** @param {Tok} t @param {any} pos */
  const tokHtml = (t, pos) => `<span class="tac-tok ${t.css}" data-tac-tok="${escapeHtml(t.k)}" title="${escapeHtml(t.label)}" style="${pos ? `left:${Number(pos.x)}%;top:${Number(pos.y)}%;` : ''}${t.color ? `border-color:${t.color};color:${t.color};` : ''}">${t.css.includes('marker') ? '' : escapeHtml(t.label)}</span>`;
  const bg = boss.map && RAID_MAP_URL.test(boss.map.bg || '') ? boss.map.bg : '';
  const parking = sets.map(([title, list]) => {
    const free = list.filter(t => !tok[t.k]);
    return free.length ? `<div class="tac-park-set"><span class="tac-park-title">${escapeHtml(title)}</span>${free.map(t => tokHtml(t, null)).join('')}</div>` : '';
  }).join('');
  return `<div class="tac-section">
    <div class="raid-col-head">${gameIconHtml('explore', 16)} Aufstellung am Boss <span>${editable ? 'Boss, Gruppen, Spieler und Marker auf das Feld ziehen, zurück nach unten = entfernen' : 'wer steht wo'}</span></div>
    <div class="tac-board${editable ? ' editable' : ''}" data-tac-board="${escapeHtml(id)}|${bossKey}" style="${bg ? `background-image:url('${escapeHtml(bg)}')` : ''}">
      ${bg ? '' : '<span class="tac-board-hint">Raum (ohne Karte)</span>'}
      ${all.filter(t => tok[t.k]).map(t => tokHtml(t, tok[t.k])).join('')}
    </div>
    ${editable ? `<div class="tac-parking" data-tac-parking="${escapeHtml(id)}|${bossKey}">${parking || '<span class="bis-item-meta">Alles ist auf dem Feld.</span>'}</div>
      <label class="tac-bg">Karte als Hintergrund (Bild-Link, optional — z. B. ein Screenshot oder Export von raidplan.io)<input type="url" class="apply-text-input" data-tac-bg="${escapeHtml(id)}|${bossKey}" value="${escapeHtml(bg || '')}" placeholder="https://…"></label>` : ''}
  </div>`;
}

/** Kick-Reihenfolge: per boss cast, who interrupts in which order. */
function raidTacticKicksHtml(id, roster, bossKey, boss, editable){
  if (bossKey === 'all') return '';
  const kicks = raidBossKicks(boss);
  if (!editable && !kicks.length) return '';
  const byKey = Object.fromEntries(roster.map(s => [s.key, s]));
  const kickers = roster.filter(s => raidInterruptOf(s));
  const attr = (k, ...rest) => escapeHtml([id, bossKey, k.kid, ...rest].join('|'));
  const icon = s => { const sp = raidInterruptOf(s); const ic = sp && raidSpellIcon(s.classId, sp); return ic ? gameIconHtml(ic, 16, sp) : ''; };
  const entry = k => {
    const order = k.order.filter(key => byKey[key]);
    const items = order.map((key, i) => {
      const s = byKey[key];
      return `<li class="${discordIdentity && s.uid === discordIdentity.id ? 'mine' : ''}"><span class="tac-kick-num">${i + 1}</span>${icon(s)} ${raidCharName(s)}${editable ? `<span class="tac-kick-btns">
        <button type="button" class="btn btn-ghost" data-tac-kick-move="${attr(k, i, -1)}" ${i === 0 ? 'disabled' : ''} title="nach oben">↑</button>
        <button type="button" class="btn btn-ghost" data-tac-kick-move="${attr(k, i, 1)}" ${i === order.length - 1 ? 'disabled' : ''} title="nach unten">↓</button>
        <button type="button" class="btn btn-ghost" data-tac-kick-move="${attr(k, i, 0)}" title="entfernen">✕</button></span>` : ''}</li>`;
    }).join('');
    const free = kickers.filter(s => !order.includes(s.key));
    return `<div class="tac-kick">
      ${editable ? `<div class="tac-kick-head"><input type="text" class="apply-text-input" data-tac-kick-spell="${attr(k)}" maxlength="60" value="${escapeHtml(k.spell)}" placeholder="Zauber des Bosses, z. B. Shadow Bolt Volley">
        <button type="button" class="btn btn-ghost btn-sm" data-tac-kick-del="${attr(k)}">Entfernen</button></div>`
        : `<div class="tac-kick-head"><b>${escapeHtml(k.spell || 'Zauber')}</b></div>`}
      ${items ? `<ol class="tac-kick-order">${items}</ol>` : '<p class="bis-hint">Noch niemand eingeteilt.</p>'}
      ${editable && free.length ? `<select data-tac-kick-add="${attr(k)}"><option value="">+ Kicker hinzufügen</option>${free.map(s => `<option value="${escapeHtml(s.key)}">${escapeHtml(s.charName || s.name)} (${escapeHtml(raidInterruptOf(s))})</option>`).join('')}</select>` : ''}
    </div>`;
  };
  return `<div class="tac-section">
    <div class="raid-col-head">${gameIconHtml('ability_kick', 16)} Kick-Reihenfolge <span>${editable ? `wer welchen Zauber in welcher Reihenfolge unterbricht — ${kickers.length} mit Unterbrechung in der Aufstellung` : 'wer wann unterbricht'}</span></div>
    ${kicks.length ? `<div class="tac-kicks">${kicks.map(entry).join('')}</div>` : ''}
    ${editable ? `<div><button type="button" class="btn btn-ghost btn-sm" data-tac-kick-new="${escapeHtml(id)}|${bossKey}">+ Kick-Reihenfolge</button></div>` : ''}
  </div>`;
}

/** Officers: copy the plan of an earlier raid of the same instance. @param {string} id @param {RaidEvent} e */
function raidTacticCopyEventHtml(id, e){
  const earlier = Object.entries(raidEvents).filter(([k, x]) => k !== id && x.instance === e.instance && x.start < e.start).sort((a, z) => z[1].start - a[1].start)[0];
  return earlier ? `<button type="button" class="btn btn-ghost btn-sm" data-tac-copyevent="${escapeHtml(id)}|${escapeHtml(earlier[0])}" title="Notizen, Karten und Gruppen von ${escapeHtml(earlier[1].title)} (${escapeHtml(raidDateLabel(earlier[1].start))}); Zuweisungen nur für dieselben Charaktere">Plan vom letzten ${escapeHtml(e.instance)}-Raid übernehmen</button>` : '';
}

/** MRT note text of a boss (class colors + raid marker codes). */
function raidTacticMrt(id, e, bossKey){
  const roster = raidTacticRoster(id, e);
  const plan = raidPlans[id] || {};
  const boss = (plan.bosses || {})[bossKey] || {};
  const name = (raidTacticBosses(e).find(([k]) => k === bossKey) || [, ''])[1];
  const col = s => `|cff${(CLASS_MAP[s.classId] ? CLASS_MAP[s.classId].color : '#ffffff').replace('#', '')}${s.charName || s.name}|r`;
  const lines = [`${name} — ${e.title}`];
  for (const ab of RAID_TACTIC_ABILITIES) {
    const parts = [];
    for (const s of roster) {
      const a = (boss.a || {})[`${ab.id}~${s.key}`];
      const t = raidTargetText(ab, a, roster);
      if (t) parts.push(ab.target === 'toggle' ? col(s) : `${col(s)} → ${t}${a.n ? ` (${a.n})` : ''}`);
    }
    if (parts.length) lines.push(`${ab.label}: ${parts.join(', ')}`);
  }
  if (bossKey === 'all'){
    const g = plan.groups || {};
    for (let i = 1; i <= raidGroupCount(e, roster.length); i++) {
      const m = roster.filter(s => Number(g[s.key]) === i);
      if (m.length) lines.push(`Gruppe ${i}: ${m.map(col).join(' ')}`);
    }
  }
  for (const k of raidBossKicks(boss)) {
    const order = k.order.map(key => roster.find(s => s.key === key)).filter(Boolean);
    if (order.length) lines.push(`Kicks ${k.spell || ''}: ${order.map((s, i) => `${i + 1} ${col(s)}`).join(', ')}`);
  }
  const tok = (boss.map && boss.map.tok) || {};
  const pos = Object.entries(tok).filter(([k]) => k !== 'boss').map(([k, p]) => {
    const s = roster.find(x => raidPlayerTok(x.key) === k);
    const label = /^g\d/.test(k) ? `Gruppe ${k.slice(1)}` : /^m\d/.test(k) ? `{rt${k.slice(1)}}` : s ? col(s) : '';
    return label ? `${label}: ${raidBoardWhere(p.x, p.y)}` : '';
  }).filter(Boolean);
  if (pos.length) lines.push(`Positionen: ${pos.join(', ')}`);
  if (boss.note) lines.push(boss.note);
  return lines.join('\n');
}

// ---------------------------------------------------------------- writes
/** Keep raidEvents/<id>/rosterUids (who may read the plan) in step with the line-up (officers). */
function raidRosterUidsSync(id, e){
  const want = Object.fromEntries([...new Set(raidCompPicked(id, e).map(s => s.uid))].map(u => [u, true]));
  const have = e.rosterUids || {};
  const same = Object.keys(want).length === Object.keys(have).length && Object.keys(want).every(u => have[u]);
  if (!same) db.ref(`${DB_PATH}/raidEvents/${id}/rosterUids`).set(Object.keys(want).length ? want : null).catch(() => {});
}

/** @param {HTMLElement} root */
function raidTacticsWire(root){
  const box = root.querySelector('[data-tac-event]');
  if (!box) return;
  const ref = path => db.ref(`${DB_PATH}/raidPlans/${path}`);
  const fail = () => { raidStatusMsg = 'Taktik konnte nicht gespeichert werden — Firebase-Regeln aktualisiert?'; renderRaidsPage(); };
  box.querySelectorAll('[data-tac-boss]').forEach(btn => btn.addEventListener('click', () => {
    const [id, k] = btn.getAttribute('data-tac-boss').split('|');
    raidTacticBoss[id] = k;
    renderRaidsPage();
  }));
  // Selects / checkboxes / text: one assignment each.
  box.querySelectorAll('[data-tac-assign]').forEach((/** @type {HTMLInputElement} */ el) => el.addEventListener('change', () => {
    const parts = el.getAttribute('data-tac-assign').split('|');
    const [id, bossKey] = parts, key = parts.slice(2).join('|');
    const value = el.type === 'checkbox' ? (el.checked || null) : (el.value.trim().slice(0, 60) || null);
    ref(`${id}/bosses/${bossKey}/a/${key}/t`).set(value).catch(fail);
  }));
  box.querySelectorAll('[data-tac-assign-note]').forEach((/** @type {HTMLInputElement} */ el) => el.addEventListener('change', () => {
    const parts = el.getAttribute('data-tac-assign-note').split('|');
    const [id, bossKey] = parts, key = parts.slice(2).join('|');
    ref(`${id}/bosses/${bossKey}/a/${key}/n`).set(el.value.trim().slice(0, 80) || null).catch(fail);
  }));
  box.querySelectorAll('[data-tac-note]').forEach((/** @type {HTMLTextAreaElement} */ el) => el.addEventListener('change', () => {
    const [id, bossKey] = el.getAttribute('data-tac-note').split('|');
    ref(`${id}/bosses/${bossKey}/note`).set(el.value.trim().slice(0, 2000) || null).catch(fail);
  }));
  box.querySelectorAll('[data-tac-bg]').forEach((/** @type {HTMLInputElement} */ el) => el.addEventListener('change', () => {
    const [id, bossKey] = el.getAttribute('data-tac-bg').split('|');
    const url = el.value.trim();
    ref(`${id}/bosses/${bossKey}/map/bg`).set(RAID_MAP_URL.test(url) ? url.slice(0, 500) : null).catch(fail);
  }));
  box.querySelectorAll('[data-tac-group]').forEach((/** @type {HTMLSelectElement} */ el) => el.addEventListener('change', () => {
    const parts = el.getAttribute('data-tac-group').split('|');
    ref(`${parts[0]}/groups/${parts.slice(1).join('|')}`).set(Number(el.value) || null).catch(fail);
  }));
  box.querySelectorAll('[data-tac-autogroups]').forEach(btn => btn.addEventListener('click', () => {
    const id = btn.getAttribute('data-tac-autogroups');
    const e = raidEvents[id];
    if (!e) return;
    const roster = raidTacticRoster(id, e);
    const n = raidGroupCount(e, roster.length);
    /** @type {Record<string, number>} */
    const groups = {};
    const fill = new Array(n + 1).fill(0);
    // Tanks and healers spread over the groups first, then the rest.
    for (const s of [...roster.filter(x => x.role === 'tank'), ...roster.filter(x => x.role === 'healer'), ...roster.filter(x => x.role === 'damage')]) {
      let g = 1;
      for (let i = 1; i <= n; i++) if (fill[i] < fill[g]) g = i;
      if (fill[g] >= 5) continue;
      groups[s.key] = g;
      fill[g]++;
    }
    ref(`${id}/groups`).set(groups).catch(fail);
  }));
  box.querySelectorAll('[data-tac-copyfrom]').forEach(btn => btn.addEventListener('click', () => {
    const [id, bossKey] = btn.getAttribute('data-tac-copyfrom').split('|');
    const e = raidEvents[id];
    const list = e ? raidTacticBosses(e).map(([k]) => k) : [];
    const prev = list[list.indexOf(bossKey) - 1];
    const src = prev && prev !== 'all' ? (((raidPlans[id] || {}).bosses || {})[prev] || {}).a : null;
    if (!src){ raidStatusMsg = 'Beim vorherigen Boss ist noch nichts zugewiesen.'; renderRaidsPage(); return; }
    if (Object.keys((((raidPlans[id] || {}).bosses || {})[bossKey] || {}).a || {}).length && !confirm('Die Zuweisungen dieses Bosses durch die vom vorherigen Boss ersetzen?')) return;
    ref(`${id}/bosses/${bossKey}/a`).set(src).catch(fail);
  }));
  box.querySelectorAll('[data-tac-copyevent]').forEach(btn => btn.addEventListener('click', () => {
    const [id, from] = btn.getAttribute('data-tac-copyevent').split('|');
    if (Object.keys(raidPlans[id] || {}).length && !confirm('Den ganzen Taktik-Plan dieses Raids durch den vom letzten Raid ersetzen?')) return;
    db.ref(`${DB_PATH}/raidPlans/${from}`).once('value').then(snap => {
      const src = snap.val();
      if (!src){ raidStatusMsg = 'Der letzte Raid hat noch keinen Plan.'; renderRaidsPage(); return; }
      return ref(id).set(src);
    }).catch(fail);
  }));
  box.querySelectorAll('[data-tac-mrt]').forEach(btn => btn.addEventListener('click', async () => {
    const [id, bossKey] = btn.getAttribute('data-tac-mrt').split('|');
    try { await navigator.clipboard.writeText(raidTacticMrt(id, raidEvents[id], bossKey)); btn.textContent = 'Kopiert ✓'; }
    catch (err){ btn.textContent = 'Kopieren nicht möglich'; }
  }));
  const kickPath = attr => { const [id, bossKey, kid] = attr.split('|'); return { id, bossKey, kid, path: `${id}/bosses/${bossKey}/kicks/${kid}` }; };
  const kickOrder = (id, bossKey, kid) => { const k = raidBossKicks((((raidPlans[id] || {}).bosses) || {})[bossKey]).find(x => x.kid === kid); return k ? k.order.slice() : []; };
  box.querySelectorAll('[data-tac-kick-new]').forEach(btn => btn.addEventListener('click', () => {
    const [id, bossKey] = btn.getAttribute('data-tac-kick-new').split('|');
    ref(`${id}/bosses/${bossKey}/kicks/k${Date.now().toString(36)}`).set({ spell: '', order: [] }).catch(fail);
  }));
  box.querySelectorAll('[data-tac-kick-spell]').forEach((/** @type {HTMLInputElement} */ el) => el.addEventListener('change', () => {
    const { path } = kickPath(el.getAttribute('data-tac-kick-spell'));
    ref(`${path}/spell`).set(el.value.trim().slice(0, 60)).catch(fail);
  }));
  box.querySelectorAll('[data-tac-kick-del]').forEach(btn => btn.addEventListener('click', () => {
    if (!confirm('Diese Kick-Reihenfolge entfernen?')) return;
    ref(kickPath(btn.getAttribute('data-tac-kick-del')).path).remove().catch(fail);
  }));
  box.querySelectorAll('[data-tac-kick-add]').forEach((/** @type {HTMLSelectElement} */ el) => el.addEventListener('change', () => {
    if (!el.value) return;
    const { id, bossKey, kid, path } = kickPath(el.getAttribute('data-tac-kick-add'));
    ref(`${path}/order`).set([...kickOrder(id, bossKey, kid), el.value]).catch(fail);
  }));
  box.querySelectorAll('[data-tac-kick-move]').forEach(btn => btn.addEventListener('click', () => {
    const parts = btn.getAttribute('data-tac-kick-move').split('|');
    const { id, bossKey, kid, path } = kickPath(parts.slice(0, 3).join('|'));
    const i = Number(parts[3]), dir = Number(parts[4]);
    const order = kickOrder(id, bossKey, kid);
    if (dir === 0) order.splice(i, 1);
    else if (order[i + dir] !== undefined) [order[i], order[i + dir]] = [order[i + dir], order[i]];
    ref(`${path}/order`).set(order.length ? order : null).catch(fail);
  }));
  raidTacticBoardWire(box, ref, fail);
}

/** Drag tokens on the board (pointer events, saved as % of the board). */
function raidTacticBoardWire(box, ref, fail){
  const board = /** @type {HTMLElement | null} */ (box.querySelector('.tac-board.editable'));
  if (!board) return;
  const [id, bossKey] = board.getAttribute('data-tac-board').split('|');
  box.querySelectorAll('.tac-tok').forEach((/** @type {HTMLElement} */ t) => {
    t.addEventListener('pointerdown', ev => {
      ev.preventDefault();
      t.setPointerCapture(ev.pointerId);
      t.classList.add('dragging');
      const move = (/** @type {PointerEvent} */ m) => { t.style.position = 'fixed'; t.style.left = `${m.clientX}px`; t.style.top = `${m.clientY}px`; };
      move(ev);
      const up = (/** @type {PointerEvent} */ u) => {
        t.removeEventListener('pointermove', move);
        t.removeEventListener('pointerup', up);
        const r = board.getBoundingClientRect();
        const inside = u.clientX >= r.left && u.clientX <= r.right && u.clientY >= r.top && u.clientY <= r.bottom;
        const path = `${id}/bosses/${bossKey}/map/tok/${t.getAttribute('data-tac-tok')}`;
        const val = inside ? { x: Math.round((u.clientX - r.left) / r.width * 1000) / 10, y: Math.round((u.clientY - r.top) / r.height * 1000) / 10 } : null;
        ref(path).set(val).catch(fail);
        renderRaidsPage();
      };
      t.addEventListener('pointermove', move);
      t.addEventListener('pointerup', up);
    });
  });
}
