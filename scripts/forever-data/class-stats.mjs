// Per-class, per-level base stats for WoW Forever (levels 1–60), written to
// data/forever/class-stats.json by update.mjs. Three sources:
//
//  - PlayerExpectedStat from the Forever client (wago.tools DB2 export):
//    base mana, crit % per agility, spell crit % per intellect. New in 1.60.x,
//    it replaced the old gametables and is the authoritative source for these.
//  - Base health and attributes (Str/Agi/Sta/Int/Spi) are server-side data the
//    client doesn't ship. They come from Wowhead's Forever gear-planner data
//    as snapshotted in github.com/ElliotWood/Forever (MIT), whose sim checked
//    them against level-1 and level-60 Forever character sheets. They are a
//    class row per level plus a race offset that is the same for every class,
//    pre-racial (e.g. the Human Spirit ×1.05 racial is applied on top).
//  - Combat rating conversions: Forever's level-60 values (from the same
//    project's client extraction). The client no longer ships the per-level
//    CombatRatings table, so below 60 the TBC curve is assumed: rating per 1%
//    scales with max(level - 8, 2) / 52. The page marks those as estimates.

const PLANNER_URL = 'https://raw.githubusercontent.com/ElliotWood/Forever/master/assets/db_inputs/wowhead_forever_gearplanner.txt';
const MAX_LEVEL = 60;
// ChrClasses ids of the nine playable classes.
const CLASS_IDS = [1, 2, 3, 4, 5, 7, 8, 9, 11];
// Wowhead planner stat keys -> our names.
const ATTR_KEYS = { 4: 'str', 3: 'agi', 7: 'sta', 5: 'int', 6: 'spi' };

// Rating needed for 1% (or 1 defense skill) at level 60.
const RATING_PER_PERCENT_AT_60 = { hit: 10, crit: 14, haste: 10, expertise: 10, dodge: 12, parry: 15, block: 5, defense: 1 };

function plannerObject(text, name) {
  const key = `wow.gearPlanner.classicplus.${name}",`;
  const i = text.indexOf(key);
  if (i < 0) throw new Error(`gear planner snapshot has no ${name}`);
  // The object is followed by `);` — parse with a small balanced-brace scan
  // rather than eval'ing third-party script text.
  let start = text.indexOf('{', i + key.length), depth = 0, inStr = false;
  for (let j = start; j < text.length; j++) {
    const c = text[j];
    if (inStr) { if (c === '\\') j++; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return JSON.parse(text.slice(start, j + 1));
  }
  throw new Error(`unterminated ${name} object`);
}

/**
 * @param {{ build: string, table: (name: string, build: string, need?: string[]) => Promise<Record<string, string>[]>, getText: (url: string) => Promise<string> }} io
 */
export async function buildClassStats({ build, table, getText }) {
  const expected = await table('PlayerExpectedStat', build, ['ClassID', 'Level', 'BaseMana', 'CritPerAgility', 'SpellCritPerIntellect']);
  const races = await table('ChrRaces', build, ['Name_lang']);
  const classes = await table('ChrClasses', build, ['Name_lang']);
  const planner = await getText(PLANNER_URL);
  const base = plannerObject(planner, 'baseStats');

  const pes = new Map();
  for (const r of expected) {
    if (Number(r.ContentSetID || 0) !== 0) continue;
    pes.set(`${Number(r.ClassID)}:${Number(r.Level)}`, r);
  }

  // Which race/class combinations exist (Forever adds new ones). Optional:
  // if the table or its columns ever change, the page falls back to
  // offering every race.
  /** @type {Record<string, number[]> | undefined} */
  let combos;
  try {
    const rows = await table('CharBaseInfo', build, ['RaceID', 'ClassID']);
    combos = {};
    for (const r of rows) (combos[r.RaceID] = combos[r.RaceID] || []).push(Number(r.ClassID));
    for (const k of Object.keys(combos)) combos[k].sort((a, b) => a - b);
  } catch (e) {
    console.log('CharBaseInfo skipped:', e.message);
  }

  const out = { classes: {}, raceOffsets: {}, combos, ratingPerPercentAt60: RATING_PER_PERCENT_AT_60 };
  for (const cid of CLASS_IDS) {
    const plannerClass = base.stats[String(cid)];
    if (!plannerClass) throw new Error(`no base stats for class ${cid}`);
    const levels = [];
    for (let lvl = 1; lvl <= MAX_LEVEL; lvl++) {
      const p = pes.get(`${cid}:${lvl}`);
      const row = { hp: plannerClass['1'][lvl], mana: p ? Math.round(Number(p.BaseMana)) : plannerClass['0'][lvl] };
      for (const [k, name] of Object.entries(ATTR_KEYS)) row[name] = plannerClass[k][lvl];
      // Stored as a fraction per point; keep percent per point.
      row.critPerAgi = p ? Math.round(Number(p.CritPerAgility) * 100 * 1e6) / 1e6 : null;
      row.critPerInt = p ? Math.round(Number(p.SpellCritPerIntellect) * 100 * 1e6) / 1e6 : null;
      levels.push(row);
    }
    const cls = classes.find(c => Number(c.ID) === cid);
    out.classes[cid] = { name: cls ? cls.Name_lang : String(cid), levels };
  }
  for (const [rid, offs] of Object.entries(base.raceOffsets)) {
    const race = races.find(r => r.ID === rid);
    if (!race) continue; // planner keeps ids for races the client doesn't have
    out.raceOffsets[rid] = { name: race.Name_lang };
    // ChrRaces.Alliance: 0 Alliance, 1 Horde (2 = neutral, e.g. unchosen Pandaren).
    if (race.Alliance === '0') out.raceOffsets[rid].faction = 'A';
    else if (race.Alliance === '1') out.raceOffsets[rid].faction = 'H';
    for (const [k, name] of Object.entries(ATTR_KEYS)) out.raceOffsets[rid][name] = offs[k] || 0;
  }

  // Sanity: values the sim projects confirmed in-game.
  const warrior60 = out.classes[1].levels[59], mage60 = out.classes[8].levels[59];
  const fail = [];
  if (warrior60.hp !== 1689) fail.push(`warrior L60 hp ${warrior60.hp} (expected 1689)`);
  if (mage60.int !== 125) fail.push(`mage L60 int ${mage60.int} (expected 125)`);
  if (!out.classes[3].levels[59].critPerAgi) fail.push('hunter L60 crit per agility missing (PlayerExpectedStat)');
  if (Object.keys(out.raceOffsets).length < 8) fail.push(`only ${Object.keys(out.raceOffsets).length} races`);
  if (out.raceOffsets[1]?.faction !== 'A' || out.raceOffsets[2]?.faction !== 'H') fail.push('race factions (ChrRaces.Alliance) missing');
  if (fail.length) throw new Error('class stats sanity check failed: ' + fail.join('; '));

  console.log(`Class stats: ${CLASS_IDS.length} classes × ${MAX_LEVEL} levels, ${Object.keys(out.raceOffsets).length} races;`,
    'hunter L60 crit/agi', out.classes[3].levels[59].critPerAgi, '| mage L60', JSON.stringify(mage60));
  return out;
}
