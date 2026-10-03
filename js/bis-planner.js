// BiS-Planer: plan a WoW Forever character's gear per slot — class, spec,
// race and a level slider, an item picker per slot (from the generated
// data/forever/items.json), where each item comes from, a "Farm-Liste" with
// a checkbox per slot, and a stat summary from data/forever/class-stats.json.
// Builds are kept in this browser for now (localStorage); saving to the
// profile, recommended admin builds and the public build browser follow.
//
// Classic (non-module) script — shares the global scope with the other
// js/*.js files; load order is set in index.html. Code that runs at load
// time may only use files loaded before this one.

const BIS_DRAFT_KEY = 'rude-bis-draft-v1';
const BIS_MAX_LEVEL = 60;
const BIS_DEFAULT_LEVEL = 30; // the beta's current level cap
const BIS_PICKER_LIMIT = 150;

// Site class id -> ChrClasses id (data/forever/class-stats.json, AllowableClass bits).
const BIS_CHR_CLASS_ID = { warrior: 1, paladin: 2, hunter: 3, rogue: 4, priest: 5, shaman: 7, mage: 8, warlock: 9, druid: 11 };

/** @type {{ key: string, label: string, inv: number[] }[]} */
const BIS_SLOTS = [
  { key: 'head', label: 'Kopf', inv: [1] },
  { key: 'neck', label: 'Hals', inv: [2] },
  { key: 'shoulder', label: 'Schultern', inv: [3] },
  { key: 'back', label: 'Rücken', inv: [16] },
  { key: 'chest', label: 'Brust', inv: [5, 20] },
  { key: 'wrist', label: 'Handgelenke', inv: [9] },
  { key: 'hands', label: 'Hände', inv: [10] },
  { key: 'waist', label: 'Taille', inv: [6] },
  { key: 'legs', label: 'Beine', inv: [7] },
  { key: 'feet', label: 'Füße', inv: [8] },
  { key: 'finger1', label: 'Finger 1', inv: [11] },
  { key: 'finger2', label: 'Finger 2', inv: [11] },
  { key: 'trinket1', label: 'Schmuck 1', inv: [12] },
  { key: 'trinket2', label: 'Schmuck 2', inv: [12] },
  { key: 'mainhand', label: 'Waffenhand', inv: [13, 17, 21] },
  { key: 'offhand', label: 'Schildhand', inv: [13, 14, 22, 23] },
  { key: 'ranged', label: 'Distanz / Relikt', inv: [15, 25, 26, 28] }
];

// Classic proficiencies: subclass -> level from which the class can use it.
// Armor subclasses: 0 misc, 1 cloth, 2 leather, 3 mail, 4 plate, 6 shield,
// 7 libram, 8 idol, 9 totem. Weapon subclasses: 0 1H axe, 1 2H axe, 2 bow,
// 3 gun, 4 1H mace, 5 2H mace, 6 polearm, 7 1H sword, 8 2H sword, 10 staff,
// 13 fist, 15 dagger, 16 thrown, 18 crossbow, 19 wand.
const BIS_ARMOR_PROF = {
  warrior: { 0: 1, 1: 1, 2: 1, 3: 1, 4: 40, 6: 1 },
  paladin: { 0: 1, 1: 1, 2: 1, 3: 1, 4: 40, 6: 1, 7: 1 },
  hunter: { 0: 1, 1: 1, 2: 1, 3: 40 },
  rogue: { 0: 1, 1: 1, 2: 1 },
  priest: { 0: 1, 1: 1 },
  shaman: { 0: 1, 1: 1, 2: 1, 3: 40, 6: 1, 9: 1 },
  mage: { 0: 1, 1: 1 },
  warlock: { 0: 1, 1: 1 },
  druid: { 0: 1, 1: 1, 2: 1, 8: 1 }
};
const BIS_WEAPON_PROF = {
  warrior: [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 13, 15, 16, 18],
  paladin: [0, 1, 4, 5, 6, 7, 8],
  hunter: [0, 1, 2, 3, 6, 7, 8, 10, 13, 15, 16, 18],
  rogue: [2, 3, 4, 7, 13, 15, 16, 18],
  priest: [4, 10, 15, 19],
  shaman: [0, 1, 4, 5, 10, 13, 15],
  mage: [7, 10, 15, 19],
  warlock: [7, 10, 15, 19],
  druid: [4, 5, 10, 13, 15]
};
// Level from which a class can dual wield (one-handers in the off hand).
const BIS_DUAL_WIELD = { warrior: 20, rogue: 10, hunter: 20 };

const BIS_QUALITY_KEYS = ['POOR', 'COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'];
// Item stat ids -> German label (stat ids from the client; 31/32 are the
// unified hit/crit ratings Forever uses for melee, ranged and spells).
const BIS_STAT_LABELS = {
  0: 'Mana', 1: 'Gesundheit', 3: 'Beweglichkeit', 4: 'Stärke', 5: 'Intelligenz', 6: 'Willenskraft', 7: 'Ausdauer',
  12: 'Verteidigungswertung', 13: 'Ausweichwertung', 14: 'Parierwertung', 15: 'Blockwertung',
  31: 'Trefferwertung', 32: 'Kritische Trefferwertung', 36: 'Tempowertung', 37: 'Waffenkundewertung',
  38: 'Angriffskraft', 39: 'Distanzangriffskraft', 41: 'Heilung', 42: 'Zauberschaden', 43: 'Mana alle 5 Sek.',
  45: 'Zaubermacht', 46: 'Gesundheit alle 5 Sek.', 47: 'Zauberdurchschlag', 48: 'Blockwert', 50: 'Rüstung',
  51: 'Feuerwiderstand', 52: 'Frostwiderstand', 53: 'Heiligwiderstand', 54: 'Schattenwiderstand',
  55: 'Naturwiderstand', 56: 'Arkanwiderstand'
};

/** @type {Promise<{ items: ForeverItemsFile, stats: ForeverClassStats }> | null} */
let bisDataPromise = null;
/** @type {{ items: ForeverItemsFile, stats: ForeverClassStats, byId: Map<number, ForeverItem> } | null} */
let bisData = null;
/** @type {BisBuild | null} */
let bisDraft = null;
let bisPickerSlot = '';

function bisLoadData(){
  if (!bisDataPromise){
    bisDataPromise = Promise.all([
      fetch('data/forever/items.json').then(r => { if (!r.ok) throw new Error('items ' + r.status); return r.json(); }),
      fetch('data/forever/class-stats.json').then(r => { if (!r.ok) throw new Error('class-stats ' + r.status); return r.json(); })
    ]).then(([items, stats]) => {
      bisData = { items, stats, byId: new Map(items.items.map(i => [i.id, i])) };
      return { items, stats };
    });
    bisDataPromise.catch(() => { bisDataPromise = null; });
  }
  return bisDataPromise;
}

/** @returns {BisBuild} */
function bisDefaultDraft(){
  return { classId: 'warrior', specId: FOREVER_SPECS.warrior[0].id, raceId: '1', level: BIS_DEFAULT_LEVEL, slots: {} };
}
/** @returns {BisBuild} */
function bisLoadDraft(){
  try{
    const raw = JSON.parse(localStorage.getItem(BIS_DRAFT_KEY) || 'null');
    if (raw && CLASS_MAP[raw.classId]){
      const d = bisDefaultDraft();
      d.classId = raw.classId;
      d.specId = foreverSpecsForClass(raw.classId).some(s => s.id === raw.specId) ? raw.specId : foreverSpecsForClass(raw.classId)[0].id;
      d.raceId = typeof raw.raceId === 'string' ? raw.raceId : '1';
      d.level = Math.min(BIS_MAX_LEVEL, Math.max(1, Number(raw.level) || BIS_DEFAULT_LEVEL));
      if (raw.slots && typeof raw.slots === 'object'){
        for (const s of BIS_SLOTS){
          const v = raw.slots[s.key];
          if (v && Number(v.itemId) > 0) d.slots[s.key] = { itemId: Number(v.itemId), done: !!v.done };
        }
      }
      return d;
    }
  }catch(e){}
  return bisDefaultDraft();
}
function bisSaveDraft(){
  try{ localStorage.setItem(BIS_DRAFT_KEY, JSON.stringify(bisDraft)); }catch(e){}
}

// ---------------------------------------------------------------- rules
function bisRacesForClass(classId){
  const stats = bisData.stats, cid = BIS_CHR_CLASS_ID[classId];
  return Object.keys(stats.raceOffsets).filter(rid => !stats.combos || !stats.combos[rid] || stats.combos[rid].includes(cid));
}

/** @param {ForeverItem} item @param {BisBuild} b */
function bisCanUse(item, b){
  if (item.ac && !(item.ac & (1 << (BIS_CHR_CLASS_ID[b.classId] - 1)))) return false;
  if (item.c === 4){
    const from = BIS_ARMOR_PROF[b.classId][item.sc];
    return from !== undefined && b.level >= from;
  }
  if (item.c === 2) return BIS_WEAPON_PROF[b.classId].includes(item.sc);
  return false;
}

/** @param {string} slotKey @param {BisBuild} b */
function bisSlotInvTypes(slotKey, b){
  const slot = BIS_SLOTS.find(s => s.key === slotKey);
  if (!slot) return [];
  if (slotKey !== 'offhand') return slot.inv;
  const dw = BIS_DUAL_WIELD[b.classId];
  return slot.inv.filter(t => t !== 13 || (dw !== undefined && b.level >= dw));
}

/** @param {BisBuild} b */
function bisOffhandBlocked(b){
  const main = b.slots.mainhand && bisData.byId.get(b.slots.mainhand.itemId);
  return !!(main && main.it === 17);
}

// ---------------------------------------------------------------- stats
/** Rating needed for 1% at a level: exact at 60, TBC curve below. */
function bisRatingPerPercent(kind, level){
  const at60 = bisData.stats.ratingPerPercentAt60[kind] || 0;
  if (kind === 'defense') return at60;
  return at60 * Math.max(level - 8, 2) / 52;
}

/** @param {BisBuild} b */
function bisComputeStats(b){
  const cls = bisData.stats.classes[String(BIS_CHR_CLASS_ID[b.classId])];
  const base = cls.levels[b.level - 1];
  const race = bisData.stats.raceOffsets[b.raceId] || { str: 0, agi: 0, sta: 0, int: 0, spi: 0 };
  /** @type {Record<number, number>} */
  const gear = {};
  let armor = 0;
  for (const s of BIS_SLOTS){
    if (s.key === 'offhand' && bisOffhandBlocked(b)) continue;
    const sel = b.slots[s.key];
    const item = sel && bisData.byId.get(sel.itemId);
    if (!item) continue;
    armor += item.ar || 0;
    for (const [stat, val] of item.s || []) gear[stat] = (gear[stat] || 0) + val;
  }
  const attr = k => base[k] + race[k];
  const str = attr('str') + (gear[4] || 0), agi = attr('agi') + (gear[3] || 0), sta = attr('sta') + (gear[7] || 0);
  const int = attr('int') + (gear[5] || 0), spi = attr('spi') + (gear[6] || 0);
  const hp = base.hp + Math.min(sta, 20) + Math.max(sta - 20, 0) * 10 + (gear[1] || 0);
  const mana = base.mana > 0 ? base.mana + Math.min(int, 20) + Math.max(int - 20, 0) * 15 + (gear[0] || 0) : 0;
  armor += agi * 2 + (gear[50] || 0);
  // Classic attack power formulas (base + per-point).
  const L = b.level, c = b.classId;
  let ap;
  if (c === 'warrior' || c === 'paladin' || c === 'shaman') ap = L * 3 - 20 + str * 2;
  else if (c === 'rogue' || c === 'hunter') ap = L * 2 - 20 + str + agi;
  else if (c === 'druid') ap = str * 2 - 20;
  else ap = str - 10;
  ap += gear[38] || 0;
  const estimated = L < 60;
  const hitPct = (gear[31] || 0) / bisRatingPerPercent('hit', L);
  const critRatingPct = (gear[32] || 0) / bisRatingPerPercent('crit', L);
  const meleeCrit = agi * (base.critPerAgi || 0) + critRatingPct;
  const spellCrit = int * (base.critPerInt || 0) + critRatingPct;
  return { base, race, gear, str, agi, sta, int, spi, hp, mana, armor, ap: Math.max(ap, 0), hitPct, meleeCrit, spellCrit, estimated };
}

// ---------------------------------------------------------------- render helpers
/** @param {ForeverItem} item */
function bisQualityColor(item){
  return ITEM_QUALITY_COLORS[BIS_QUALITY_KEYS[item.q] || 'COMMON'];
}
/** @param {ForeverItem | undefined} item */
function bisIconHtml(item, size){
  const px = size || 36;
  if (!item) return `<span class="bis-icon bis-icon-empty" style="width:${px}px;height:${px}px"></span>`;
  const url = talentIconUrl(item.ic || 'inv_misc_questionmark', px > 40 ? 'large' : 'medium');
  return `<img class="bis-icon wow-icon-frame" style="width:${px}px;height:${px}px;border-color:${bisQualityColor(item)}" src="${escapeHtml(url)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`;
}
/**
 * Level from which an item is realistically usable: its required level, or
 * for quest rewards without one (common in Classic) the lowest quest level.
 * @param {ForeverItem} item
 */
function bisItemLevel(item){
  if (item.rl) return item.rl;
  const ql = (item.src && item.src.quests || []).map(q => q.l || 0).filter(Boolean);
  return ql.length ? Math.min(...ql) : 1;
}
/** "Stufe 42" / "Quest-Stufe 42" for the item meta line. @param {ForeverItem} item */
function bisLevelLabel(item){
  return item.rl ? `Stufe ${item.rl}` : `${bisItemLevel(item) > 1 ? 'Quest-' : ''}Stufe ${bisItemLevel(item)}`;
}
/** @param {ForeverItem} item */
function bisStatLine(item){
  const parts = [];
  if (item.dm) parts.push(`${item.dm.min}–${item.dm.max} Schaden (${item.dm.dps} DPS)`);
  if (item.ar) parts.push(`${item.ar} Rüstung`);
  for (const [stat, val] of item.s || []){
    const label = BIS_STAT_LABELS[stat];
    if (label) parts.push(`+${val} ${label}`);
  }
  return parts.join(' · ');
}
const BIS_FACTION_LABEL = { A: 'Allianz', H: 'Horde' };
/** Faction ('A' / 'H') of the planned character's race, or '' if unknown. */
function bisFaction(){
  const r = bisData && bisDraft && bisData.stats.raceOffsets[bisDraft.raceId];
  return (r && r.faction) || '';
}
/** True if the item can only be had by the other faction. @param {ForeverItem} item */
function bisWrongFaction(item){
  const f = bisFaction();
  return Boolean(f && item.fa && item.fa !== f);
}
/** Sources the planned character's faction can use (other faction's vendors / quests dropped). @param {ForeverItem} item */
function bisSources(item){
  const s = item.src;
  const f = bisFaction();
  if (!s || !f) return s;
  const ok = x => !x.f || x.f === f;
  /** @type {ForeverItemSource} */
  const out = Object.assign({}, s);
  if (s.vendors) out.vendors = s.vendors.filter(ok);
  if (s.quests) out.quests = s.quests.filter(ok);
  return out;
}
/** Short German description of where an item comes from. @param {ForeverItem} item */
function bisSourceLines(item){
  if (bisWrongFaction(item)) return [`Nur für ${BIS_FACTION_LABEL[item.fa]} erhältlich`];
  const s = bisSources(item);
  if (!s) return [];
  const npc = n => n.z ? `${n.n} (${n.z})` : n.n;
  const out = [];
  if (s.drops && s.drops.length) out.push('Drop: ' + s.drops.map(npc).join(', '));
  if (s.dropCount) out.push(`Weltdrop / Trash (${s.dropCount} Gegner)`);
  if (s.quests && s.quests.length) out.push('Quest: ' + s.quests.map(q => q.l ? `${q.n} (Stufe ${q.l})` : q.n).join(', '));
  if (s.vendors && s.vendors.length) out.push('Händler: ' + s.vendors.map(npc).join(', '));
  if (s.objects && s.objects.length) out.push('Objekt: ' + s.objects.join(', '));
  if (s.containers && s.containers.length) out.push('Enthalten in: ' + s.containers.join(', '));
  return out;
}
/** Grouping key for the farm list: the first zone we know, else the source kind. @param {ForeverItem} item */
function bisSourceGroup(item){
  if (bisWrongFaction(item)) return 'Andere Fraktion';
  const s = bisSources(item);
  if (!s) return 'Quelle unbekannt';
  const zoned = (s.drops || []).concat(s.vendors || []).find(n => n.z);
  if (zoned) return zoned.z;
  if (s.quests && s.quests.length) return 'Quests';
  if (s.drops && s.drops.length) return 'Drops (Zone unbekannt)';
  if (s.dropCount) return 'Weltdrops';
  if (s.vendors && s.vendors.length) return 'Händler';
  return 'Sonstiges';
}

// ---------------------------------------------------------------- render
function renderBisPlanner(){
  const root = document.getElementById('bisPlannerRoot');
  if (!root) return;
  if (!bisData){
    root.innerHTML = '<p class="bis-loading">Lade WoW-Forever-Daten…</p>';
    bisLoadData().then(renderBisPlanner, err => {
      root.innerHTML = `<p class="bis-loading">Die Item-Daten konnten nicht geladen werden (${escapeHtml(String(err && err.message || err))}). Bitte Seite neu laden.</p>`;
    });
    return;
  }
  if (!bisDraft) bisDraft = bisLoadDraft();
  const b = bisDraft;
  const races = bisRacesForClass(b.classId);
  if (!races.includes(b.raceId)) b.raceId = races[0];
  const cls = CLASS_MAP[b.classId];
  const st = bisComputeStats(b);
  const est = st.estimated ? '<span class="bis-est" title="Unter Stufe 60 ist die Umrechnung Wertung → % nicht aus dem Client bekannt; geschätzt nach der TBC-Kurve.">ca.</span> ' : '';
  const fmt1 = v => (Math.round(v * 100) / 100).toLocaleString('de-DE');

  const slotRows = BIS_SLOTS.map(s => {
    const blocked = s.key === 'offhand' && bisOffhandBlocked(b);
    const sel = b.slots[s.key];
    const item = sel && bisData.byId.get(sel.itemId);
    const src = item ? bisSourceLines(item) : [];
    return `<div class="bis-slot${blocked ? ' bis-slot-blocked' : ''}${sel && sel.done ? ' bis-slot-done' : ''}">
      <button type="button" class="bis-slot-main" data-bis-pick="${s.key}" ${blocked ? 'disabled' : ''}>
        ${bisIconHtml(item, 36)}
        <span class="bis-slot-text">
          <span class="bis-slot-label">${escapeHtml(s.label)}</span>
          ${item ? `<span class="bis-item-name" style="color:${bisQualityColor(item)}">${escapeHtml(item.n)}</span>
                    <span class="bis-item-meta">${bisLevelLabel(item)} · iLvl ${item.il}${item.b === 1 ? ' · BoP' : item.b === 2 ? ' · BoE' : ''}</span>
                    <span class="bis-item-stats">${escapeHtml(bisStatLine(item))}</span>
                    ${src.length ? `<span class="bis-item-src${bisWrongFaction(item) ? ' bis-item-src-wrong' : ''}">${escapeHtml(src[0])}</span>` : '<span class="bis-item-src bis-item-src-none">Quelle unbekannt</span>'}`
                 : `<span class="bis-slot-empty">${blocked ? 'Zweihandwaffe ausgerüstet' : 'Item wählen…'}</span>`}
        </span>
      </button>
      ${item ? `<label class="bis-done"><input type="checkbox" data-bis-done="${s.key}" ${sel.done ? 'checked' : ''}> Habe ich</label>
                <button type="button" class="btn btn-ghost btn-sm" data-bis-clear="${s.key}" title="Slot leeren">✕</button>` : ''}
    </div>`;
  }).join('');

  // Farm list: open (not done) slots grouped by where to get the item.
  /** @type {Record<string, string[]>} */
  const groups = {};
  let total = 0, done = 0;
  for (const s of BIS_SLOTS){
    const sel = b.slots[s.key];
    const item = sel && bisData.byId.get(sel.itemId);
    if (!item || (s.key === 'offhand' && bisOffhandBlocked(b))) continue;
    total++;
    if (sel.done){ done++; continue; }
    const g = bisSourceGroup(item);
    const lines = bisSourceLines(item);
    (groups[g] = groups[g] || []).push(`<li><label><input type="checkbox" data-bis-done="${s.key}"> <strong>${escapeHtml(s.label)}:</strong> <span style="color:${bisQualityColor(item)}">${escapeHtml(item.n)}</span></label>${lines.length ? `<div class="bis-farm-src">${lines.map(escapeHtml).join('<br>')}</div>` : ''}</li>`);
  }
  const groupNames = Object.keys(groups).sort((a, z) => Number(a === 'Quelle unbekannt') - Number(z === 'Quelle unbekannt') || a.localeCompare(z, 'de'));
  const farmHtml = total === 0
    ? '<p class="bis-hint">Noch keine Items gewählt. Klick links auf einen Slot.</p>'
    : `<p class="bis-progress"><strong>${done}/${total}</strong> Slots erledigt</p>
       <div class="bis-progress-bar"><span style="width:${Math.round(done / total * 100)}%"></span></div>
       ${groupNames.length ? groupNames.map(g => `<h4 class="bis-farm-group">${escapeHtml(g)}</h4><ul class="bis-farm-list">${groups[g].join('')}</ul>`).join('') : '<p class="bis-hint">Alles erledigt — Glückwunsch! 🎉</p>'}`;

  const gearExtras = [[45, 'Zaubermacht'], [42, 'Zauberschaden'], [41, 'Heilung'], [43, 'Mana alle 5 Sek.'], [36, 'Tempowertung'], [37, 'Waffenkundewertung'],
    [12, 'Verteidigungswertung'], [13, 'Ausweichwertung'], [14, 'Parierwertung'], [15, 'Blockwertung'], [48, 'Blockwert'], [39, 'Distanzangriffskraft'],
    [51, 'Feuerwiderstand'], [52, 'Frostwiderstand'], [55, 'Naturwiderstand'], [54, 'Schattenwiderstand'], [56, 'Arkanwiderstand']]
    .filter(([id]) => st.gear[id]).map(([id, label]) => `<div class="bis-stat"><span>${label}</span><strong>${st.gear[id]}</strong></div>`).join('');

  root.innerHTML = `
    <div class="bis-controls tac-card">
      <div class="bis-control">
        <label>Klasse</label>
        <div class="bis-class-row">${CLASSES.map(c => `<button type="button" class="talent-class-btn${c.id === b.classId ? ' active' : ''}" style="--class-color:${c.color}" data-bis-class="${c.id}" title="${escapeHtml(c.label)}"><img src="${escapeHtml(foreverClassIconUrl(c.id))}" alt=""></button>`).join('')}</div>
      </div>
      <div class="bis-control">
        <label for="bisSpecSelect">Spezialisierung</label>
        <select id="bisSpecSelect">${foreverSpecsForClass(b.classId).map(s => `<option value="${s.id}" ${s.id === b.specId ? 'selected' : ''}>${escapeHtml(s.label)}</option>`).join('')}</select>
      </div>
      <div class="bis-control">
        <label for="bisRaceSelect">Rasse</label>
        <select id="bisRaceSelect">${races.map(r => `<option value="${r}" ${r === b.raceId ? 'selected' : ''}>${escapeHtml(bisData.stats.raceOffsets[r].name)}${bisData.stats.raceOffsets[r].faction ? ' (' + BIS_FACTION_LABEL[bisData.stats.raceOffsets[r].faction] + ')' : ''}</option>`).join('')}</select>
      </div>
      <div class="bis-control bis-control-level">
        <label for="bisLevelInput">Stufe <strong id="bisLevelValue">${b.level}</strong></label>
        <input type="range" id="bisLevelInput" min="1" max="${BIS_MAX_LEVEL}" value="${b.level}">
      </div>
      <div class="bis-control bis-control-actions">
        <button type="button" class="btn btn-ghost btn-sm" id="bisResetBtn">Alle Slots leeren</button>
      </div>
    </div>
    <div class="bis-layout">
      <div class="tac-card bis-slots">
        <h3 class="bis-card-title" style="color:${cls.color}">${escapeHtml(cls.label)} · ${escapeHtml(foreverSpecLabel(b.classId, b.specId))}</h3>
        ${slotRows}
      </div>
      <div class="bis-side">
        <div class="tac-card bis-stats">
          <h3 class="bis-card-title">Werte auf Stufe ${b.level}</h3>
          <div class="bis-stat-grid">
            <div class="bis-stat"><span>Gesundheit</span><strong>${st.hp}</strong></div>
            ${st.mana ? `<div class="bis-stat"><span>Mana</span><strong>${st.mana}</strong></div>` : ''}
            <div class="bis-stat"><span>Stärke</span><strong>${st.str}</strong></div>
            <div class="bis-stat"><span>Beweglichkeit</span><strong>${st.agi}</strong></div>
            <div class="bis-stat"><span>Ausdauer</span><strong>${st.sta}</strong></div>
            <div class="bis-stat"><span>Intelligenz</span><strong>${st.int}</strong></div>
            <div class="bis-stat"><span>Willenskraft</span><strong>${st.spi}</strong></div>
            <div class="bis-stat"><span>Rüstung</span><strong>${st.armor}</strong></div>
            <div class="bis-stat"><span>Angriffskraft</span><strong>${st.ap}</strong></div>
            <div class="bis-stat"><span>Treffer</span><strong>${est}${fmt1(st.hitPct)} %</strong></div>
            <div class="bis-stat"><span>Krit (Nahkampf)</span><strong>${est}${fmt1(st.meleeCrit)} %</strong></div>
            ${st.base.critPerInt ? `<div class="bis-stat"><span>Krit (Zauber)</span><strong>${est}${fmt1(st.spellCrit)} %</strong></div>` : ''}
            ${gearExtras}
          </div>
          <p class="bis-hint">Grundwerte von Klasse, Rasse und Stufe plus Ausrüstung. Ohne Talente, Buffs, Verzauberungen und Rassen-Multiplikatoren; Krit ohne klassenspezifischen Grund-Krit.${st.estimated ? ' „ca.“: Unter Stufe 60 ist die Umrechnung Wertung → % geschätzt.' : ''}</p>
        </div>
        <div class="tac-card bis-farm">
          <h3 class="bis-card-title">Farm-Liste</h3>
          ${farmHtml}
        </div>
      </div>
    </div>
    <p class="bis-hint bis-footnote">Daten: WoW Forever Build ${escapeHtml(bisData.items.build)} (täglich automatisch aktualisiert). Deine Auswahl wird vorerst nur in diesem Browser gespeichert.</p>`;
  bisWirePlanner(root);
}

/** @param {HTMLElement} root */
function bisWirePlanner(root){
  const b = bisDraft;
  const changed = () => { bisSaveDraft(); renderBisPlanner(); };
  root.querySelectorAll('[data-bis-class]').forEach(btn => btn.addEventListener('click', () => {
    const c = btn.getAttribute('data-bis-class');
    if (c === b.classId) return;
    b.classId = c;
    b.specId = foreverSpecsForClass(c)[0].id;
    b.slots = {};
    changed();
  }));
  const spec = /** @type {HTMLSelectElement} */ (root.querySelector('#bisSpecSelect'));
  spec.addEventListener('change', () => { b.specId = spec.value; changed(); });
  const race = /** @type {HTMLSelectElement} */ (root.querySelector('#bisRaceSelect'));
  race.addEventListener('change', () => { b.raceId = race.value; changed(); });
  const lvl = /** @type {HTMLInputElement} */ (root.querySelector('#bisLevelInput'));
  lvl.addEventListener('input', () => { root.querySelector('#bisLevelValue').textContent = lvl.value; });
  lvl.addEventListener('change', () => { b.level = Number(lvl.value); changed(); });
  root.querySelector('#bisResetBtn').addEventListener('click', () => {
    if (!Object.keys(b.slots).length || confirm('Alle Slots leeren?')){ b.slots = {}; changed(); }
  });
  root.querySelectorAll('[data-bis-pick]').forEach(btn => btn.addEventListener('click', () => openBisPicker(btn.getAttribute('data-bis-pick'))));
  root.querySelectorAll('[data-bis-clear]').forEach(btn => btn.addEventListener('click', () => { delete b.slots[btn.getAttribute('data-bis-clear')]; changed(); }));
  root.querySelectorAll('[data-bis-done]').forEach((/** @type {HTMLInputElement} */ cb) => cb.addEventListener('change', () => {
    const sel = b.slots[cb.getAttribute('data-bis-done')];
    if (sel){ sel.done = cb.checked; changed(); }
  }));
}

// ---------------------------------------------------------------- item picker
function openBisPicker(slotKey){
  bisPickerSlot = slotKey;
  const slot = BIS_SLOTS.find(s => s.key === slotKey);
  els.bisPickerTitle.textContent = slot ? slot.label + ' wählen' : 'Item wählen';
  els.bisPickerSearch.value = '';
  els.bisPickerModal.classList.remove('hidden');
  renderBisPickerList();
  els.bisPickerSearch.focus();
}
function closeBisPicker(){
  els.bisPickerModal.classList.add('hidden');
  bisPickerSlot = '';
}

function renderBisPickerList(){
  if (!bisData || !bisDraft || !bisPickerSlot) return;
  const b = bisDraft;
  const inv = bisSlotInvTypes(bisPickerSlot, b);
  const q = els.bisPickerSearch.value.trim().toLowerCase();
  const onlySourced = els.bisPickerSourcedOnly.checked;
  const showHigher = els.bisPickerHigherLevel.checked;
  const minQuality = Number(els.bisPickerQuality.value) || 2;
  const faction = bisFaction();
  const matches = bisData.items.items.filter(i => inv.includes(i.it)
    && i.q >= minQuality
    && (showHigher || bisItemLevel(i) <= b.level)
    && (!onlySourced || i.src)
    && (!faction || !i.fa || i.fa === faction)
    && bisCanUse(i, b)
    && (!q || i.n.toLowerCase().includes(q)))
    .sort((a, z) => z.il - a.il || z.q - a.q || a.n.localeCompare(z.n));
  const current = b.slots[bisPickerSlot] && b.slots[bisPickerSlot].itemId;
  els.bisPickerCount.textContent = matches.length > BIS_PICKER_LIMIT
    ? `${matches.length} Treffer — die ersten ${BIS_PICKER_LIMIT} werden gezeigt, Suche eingrenzen.`
    : `${matches.length} Treffer`;
  els.bisPickerList.innerHTML = matches.slice(0, BIS_PICKER_LIMIT).map(i => {
    const src = bisSourceLines(i);
    return `<button type="button" class="bis-pick-item${i.id === current ? ' active' : ''}" data-bis-item="${i.id}">
      ${bisIconHtml(i, 36)}
      <span class="bis-slot-text">
        <span class="bis-item-name" style="color:${bisQualityColor(i)}">${escapeHtml(i.n)}</span>
        <span class="bis-item-meta">${bisLevelLabel(i)} · iLvl ${i.il}${i.b === 1 ? ' · BoP' : i.b === 2 ? ' · BoE' : ''}${i.set && bisData.items.sets[i.set] ? ' · Set: ' + escapeHtml(bisData.items.sets[i.set]) : ''}</span>
        <span class="bis-item-stats">${escapeHtml(bisStatLine(i))}</span>
        <span class="bis-item-src${src.length ? '' : ' bis-item-src-none'}">${escapeHtml(src.length ? src.join(' · ') : 'Quelle unbekannt')}</span>
      </span>
    </button>`;
  }).join('') || '<p class="bis-hint">Keine passenden Items. Filter lockern?</p>';
  els.bisPickerList.querySelectorAll('[data-bis-item]').forEach(btn => btn.addEventListener('click', () => {
    b.slots[bisPickerSlot] = { itemId: Number(btn.getAttribute('data-bis-item')), done: false };
    if (bisPickerSlot === 'mainhand'){
      const item = bisData.byId.get(b.slots.mainhand.itemId);
      if (item && item.it === 17) delete b.slots.offhand;
    }
    bisSaveDraft();
    closeBisPicker();
    renderBisPlanner();
  }));
}

els.bisPickerSearch.addEventListener('input', renderBisPickerList);
els.bisPickerSourcedOnly.addEventListener('change', renderBisPickerList);
els.bisPickerHigherLevel.addEventListener('change', renderBisPickerList);
els.bisPickerQuality.addEventListener('change', renderBisPickerList);
els.bisPickerCloseBtn.addEventListener('click', closeBisPicker);
els.bisPickerModal.addEventListener('click', (e) => { if (e.target === els.bisPickerModal) closeBisPicker(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && bisPickerSlot) closeBisPicker(); });
