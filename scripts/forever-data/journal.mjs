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
// Whether the Forever client carries journal data for its own raids isn't
// known yet, so this never fails the import: missing tables or columns
// give an empty journal and a log line. Only instances we care about are
// kept (KEEP_INSTANCES + the dungeons / raids the item data knows), so the
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

/**
 * @param {{ build: string, eraBuild: string, table: Function, icons: Map<number, string>, instanceNames: string[] }} ctx
 * @returns {Promise<{ instances: any[], note: string }>}
 */
export async function buildJournal({ build, eraBuild, table, icons, instanceNames }) {
  const load = async (name) => {
    try { return await table(name, build); } catch (e) {
      try { const rows = await table(name, eraBuild); console.log(`  journal: ${name} from Classic Era (${rows.length} rows)`); return rows; }
      catch (e2) { console.log(`  journal: ${name} not available (${e.message.slice(0, 120)})`); return null; }
    }
  };
  const inst = await load('JournalInstance');
  const enc = await load('JournalEncounter');
  const sec = await load('JournalEncounterSection');
  if (!inst || !enc) return { instances: [], note: 'no journal tables' };
  console.log(`  journal: JournalInstance ${inst.length}, JournalEncounter ${enc.length}, JournalEncounterSection ${sec ? sec.length : 0} rows`);
  console.log(`  journal columns: ${Object.keys(inst[0] || {}).join(',')} | ${Object.keys(enc[0] || {}).join(',')} | ${Object.keys((sec || [])[0] || {}).join(',')}`);

  const keep = new Set([...KEEP_INSTANCES, ...instanceNames].map(n => n.toLowerCase()));
  const kept = inst.filter(r => keep.has(S(r.Name_lang).toLowerCase()));
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
    return { id, n: S(r.Name_lang), desc: journalText(r.Description_lang), map: I(r.MapID), bosses };
  }).filter(x => x.bosses.length);
  return { instances, note: '' };
}
