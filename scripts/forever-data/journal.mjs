// Boss guides, official part: Blizzard's Dungeon Journal (Encounter
// Journal) from the WoW Forever client (wago.tools DB2 exports), written to
// data/forever/journal.json by update.mjs and shown on the Boss-Guides page
// (js/boss-guides.js).
//
//  - JournalInstance: dungeons / raids (name, description, map).
//  - JournalEncounter: bosses per instance (OrderIndex = raid order).
//  - JournalEncounterSection: the boss's overview / abilities tree
//    (ParentSectionID, OrderIndex), with spell (SpellID -> name, icon),
//    icon flags (tank / healer / damage alerts, deadly, interruptible,
//    magic / curse / poison / disease …) and difficulty mask.
//
// The Forever client (1.60) and Classic Era have no Journal tables yet
// (wago.tools: HTTP 400, checked 2026-10-05), so the boss list comes from
// DungeonEncounter (official encounter names and order per instance map,
// used by the client for boss kills) and the journal parts are added
// whenever the client starts shipping them. Never fails the import:
// missing tables give a log line. Only instances we care about are kept
// (classic dungeons / raids, what Forever adds, KEEP_INSTANCES), so the
// file stays small even if the client ships the whole retail journal.

const I = v => { const n = Math.trunc(Number(v)); return Number.isFinite(n) ? n : 0; };
const S = v => (v == null ? '' : String(v));

/** Forever's own instances (announced), on top of the item data's instance list. */
const KEEP_INSTANCES = ['Barrow Deeps', 'Hyjal Summit', 'Ruins of Lordaeron', "Onyxia's Lair"];

/**
 * Journal text to plain text with light markup kept as tokens the page
 * renders: "$bullet;" -> "• ", "|cff…text|r" -> text, spell links
 * "|Hspell:123|h[Name]|h" -> "Name", "$s1" / "$12345s1"-style variables -> "?"
 * (they'd need spell effect values), "$n" newlines kept.
 */
export function journalText(text) {
  return S(text)
    .replace(/\$bullet;?/gi, '• ')
    .replace(/\|H[^|]*\|h\[?([^\]|]*)\]?\|h/g, '$1')
    .replace(/\|c[0-9a-f]{8}/gi, '').replace(/\|r/g, '')
    .replace(/\$\[[^\]]*\]/g, '')
    .replace(/\$\{[^}]*\}/g, '?')
    .replace(/\$@?\d*[a-z]+\d*/gi, '?')
    .replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').trim();
}

/** Instance kinds by Map.InstanceType. */
const MAP_KIND = { 1: 'd', 2: 'r' };

/** Classic dungeon / raid map ids (the Era client also carries Season of Discovery maps, world bosses and tests — left out). */
const CLASSIC_MAPS = new Set([33, 34, 36, 43, 47, 48, 70, 90, 109, 129, 189, 209, 229, 230, 249, 289, 309, 329, 349, 389, 409, 429, 469, 509, 531, 533]);

/**
 * Bosses per instance from the Forever client's DungeonEncounter: classic
 * instances (CLASSIC_MAPS) and everything Forever adds (encounters the
 * Classic Era client doesn't have): `new: 1` on new instances, `upd: 1`
 * on classic ones that got new encounters (reworked in Forever).
 * @param {{ build: string, eraBuild: string, table: Function, maps: Map<number, any> }} ctx
 */
async function encounterInstances({ build, eraBuild, table, maps, icons }) {
  let rows = [];
  try { rows = await table('DungeonEncounter', build); } catch (e) { console.log(`  encounters: DungeonEncounter ${build} not available (${e.message.slice(0, 120)})`); return []; }
  const eraIds = new Set();
  try { for (const r of await table('DungeonEncounter', eraBuild)) eraIds.add(I(r.ID)); } catch (e) { /* then nothing counts as new */ }
  console.log(`  encounters: DungeonEncounter ${build}: ${rows.length} rows (${rows.filter(r => !eraIds.has(I(r.ID))).length} not in Classic Era ${eraBuild})`);
  /** mapId -> encounters */
  const byMap = new Map();
  for (const r of rows) {
    const m = I(r.MapID);
    if (!byMap.has(m)) byMap.set(m, []);
    byMap.get(m).push(r);
  }
  const out = [];
  for (const [mapId, list] of byMap) {
    const map = maps.get(mapId) || {};
    const name = S(map.MapName_lang);
    const isNew = eraIds.size > 0 && list.some(r => !eraIds.has(I(r.ID)));
    const kind = MAP_KIND[I(map.InstanceType)] || '';
    if (!name || !kind || /\btest/i.test(name) || list.some(r => /^test/i.test(S(r.Name_lang)))) continue;
    const classic = CLASSIC_MAPS.has(mapId);
    if (!classic && !isNew) continue;
    // One entry per encounter name (difficulties repeat it), in raid order.
    const seen = new Map();
    for (const r of list.sort((a, z) => I(a.OrderIndex) - I(z.OrderIndex) || I(a.ID) - I(z.ID))) {
      const n = S(r.Name_lang);
      const ic = icons.get(I(r.SpellIconFileID));
      if (n && !seen.has(n)) seen.set(n, { id: I(r.ID), n, ...(ic ? { i: ic } : {}) });
    }
    out.push({ map: mapId, n: name, kind, ...(isNew ? (classic ? { upd: 1 } : { new: 1 }) : {}), bosses: [...seen.values()] });
  }
  console.log(`  encounters: kept ${out.length} instances: ${out.map(x => `${x.n}${x.new ? '*' : x.upd ? '+' : ''} (${x.bosses.length})`).join(' | ')}`);
  return out;
}

// Boss models: the client can't give them. Its Creature table only has
// ~180 rows (mounts, pets; no boss matches by name), CreatureDisplayInfo
// has the models but which NPC uses which is server-side, and there's no
// JournalEncounterCreature (checked 2026-10-05). The Boss-Guides take an
// image link per boss instead (bossGuides/…/img).

/**
 * @param {{ build: string, eraBuild: string, table: Function, icons: Map<number, string>, instanceNames: string[], maps: Map<number, any> }} ctx
 * @returns {Promise<{ instances: any[], note: string }>}
 */
export async function buildJournal({ build, eraBuild, table, icons, instanceNames, maps }) {
  const keepNames = new Set([...KEEP_INSTANCES, ...instanceNames].map(n => n.toLowerCase()));
  const encInst = await encounterInstances({ build, eraBuild, table, maps, icons });
  const load = async (name) => {
    try { return await table(name, build); } catch (e) {
      try { const rows = await table(name, eraBuild); console.log(`  journal: ${name} from Classic Era (${rows.length} rows)`); return rows; }
      catch (e2) { console.log(`  journal: ${name} not available (${e.message.slice(0, 120)})`); return null; }
    }
  };
  const inst = await load('JournalInstance');
  const enc = inst ? await load('JournalEncounter') : null;
  const sec = enc ? await load('JournalEncounterSection') : null;
  // No journal: the DungeonEncounter boss lists alone.
  if (!inst || !enc) return { instances: encInst, note: 'no journal tables, bosses from DungeonEncounter' };
  console.log(`  journal: JournalInstance ${inst.length}, JournalEncounter ${enc.length}, JournalEncounterSection ${sec ? sec.length : 0} rows`);
  console.log(`  journal columns: ${Object.keys(inst[0] || {}).join(',')} | ${Object.keys(enc[0] || {}).join(',')} | ${Object.keys((sec || [])[0] || {}).join(',')}`);

  const kept = inst.filter(r => encInst.some(x => x.map === I(r.MapID)) || keepNames.has(S(r.Name_lang).toLowerCase()));
  console.log(`  journal: ${inst.length} instances in the client, kept ${kept.length}: ${kept.map(r => r.Name_lang).join(', ')}`);
  console.log(`  journal: client instances (first 80): ${inst.slice(0, 80).map(r => r.Name_lang).join(' | ')}`);

  // Spell names / icons for ability sections (Forever first, Era for the rest).
  const spellIds = new Set((sec || []).map(r => I(r.SpellID)).filter(Boolean));
  const spellName = new Map(), spellIcon = new Map();
  for (const b of [eraBuild, build]) {
    try { for (const r of await table('SpellName', b)) if (spellIds.has(I(r.ID))) spellName.set(I(r.ID), S(r.Name_lang)); } catch (e) { /* optional */ }
    try { for (const r of await table('SpellMisc', b)) if (spellIds.has(I(r.SpellID)) && I(r.SpellIconFileDataID)) spellIcon.set(I(r.SpellID), I(r.SpellIconFileDataID)); } catch (e) { /* optional */ }
  }

  const sectionsOf = new Map();
  for (const r of sec || []) {
    const e = I(r.JournalEncounterID);
    if (!sectionsOf.has(e)) sectionsOf.set(e, []);
    sectionsOf.get(e).push(r);
  }
  /** Section tree of an encounter, depth-first in OrderIndex order. */
  const tree = (encId) => {
    const rows = sectionsOf.get(encId) || [];
    const kids = new Map();
    for (const r of rows) {
      const p = I(r.ParentSectionID);
      if (!kids.has(p)) kids.set(p, []);
      kids.get(p).push(r);
    }
    const walk = (parent, depth) => (kids.get(parent) || []).sort((a, z) => I(a.OrderIndex) - I(z.OrderIndex)).map(r => {
      const spell = I(r.SpellID);
      const iconId = I(r.IconFileDataID) || spellIcon.get(spell) || 0;
      /** @type {any} */
      const out = { t: journalText(r.Title_lang) || spellName.get(spell) || '' };
      const body = journalText(r.BodyText_lang);
      if (body) out.b = body;
      if (spell) out.s = spell;
      if (iconId && icons.get(iconId)) out.i = icons.get(iconId);
      if (I(r.IconFlags)) out.f = I(r.IconFlags);
      if (I(r.Type)) out.y = I(r.Type);
      if (I(r.DifficultyMask) > 0) out.d = I(r.DifficultyMask);
      const children = depth < 6 ? walk(I(r.ID), depth + 1) : [];
      if (children.length) out.c = children;
      return out;
    }).filter(x => x.t || x.b || x.c);
    return walk(0, 0);
  };

  const instances = kept.map(r => {
    const id = I(r.ID);
    const bosses = enc.filter(e => I(e.JournalInstanceID) === id).sort((a, z) => I(a.OrderIndex) - I(z.OrderIndex)).map(e => {
      /** @type {any} */
      const out = { id: I(e.ID), n: S(e.Name_lang) };
      const desc = journalText(e.Description_lang);
      if (desc) out.desc = desc;
      const sections = tree(I(e.ID));
      if (sections.length) out.sec = sections;
      return out;
    });
    const e = encInst.find(x => x.map === I(r.MapID)) || {};
    return { id, n: S(r.Name_lang), desc: journalText(r.Description_lang), map: I(r.MapID), kind: e.kind || '', ...(e.new ? { new: 1 } : {}), ...(e.upd ? { upd: 1 } : {}), bosses };
  }).filter(x => x.bosses.length);
  return { instances, note: '' };
}
