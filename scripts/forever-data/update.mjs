// Builds data/forever/items.json + data/forever/meta.json from live sources:
//  - wago.tools DB2 CSV exports of the newest WoW Forever client build
//    (product wow_classic_beta, version 1.60.x) for item names, slots,
//    stats, armor, damage, sets and icons;
//  - QuestieDB (github.com/Questie/QuestieDB, data/Forever) for where an
//    item comes from: NPC drops, quest rewards, vendors, objects, containers;
//  - the wowdev community listfile for icon file names.
// Runs in GitHub Actions (.github/workflows/forever-data.yml). Writes the
// files only when their content changed, so an unchanged build produces no
// diff and no pull request.
//
// The stat / armor / damage math (Forever's ItemSparse stores stat budget
// percentages instead of final values) follows the well-known TrinityCore
// formulas, as also used by github.com/alcaras/forever-ref.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseCsv } from './csv.mjs';
import { parseLuaRecords } from './lua-records.mjs';
import { buildClassStats } from './class-stats.mjs';

const OUT_DIR = new URL('../../data/forever/', import.meta.url);
const WAGO = 'https://wago.tools';
const PRODUCT = 'wow_classic_beta';
const QUESTIE = 'https://raw.githubusercontent.com/Questie/QuestieDB/master/data/Forever';
const LISTFILE = 'https://github.com/wowdev/wow-listfile/releases/latest/download/community-listfile.csv';
const UA = { 'User-Agent': 'rude-guild-page data importer (github.com/Nastyschmo/AeternumGuildLootAwarder)' };

// Equippable inventory types worth planning gear for (no bags, ammo,
// quivers, shirts, tabards).
const GEAR_INV_TYPES = new Set([1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 20, 21, 22, 23, 25, 26, 28]);
const MIN_QUALITY = 2; // uncommon and better

// RandPropPoints column per inventory type (stat budget slot class).
const SLOT_INDEX = { 1: 0, 4: 0, 5: 0, 7: 0, 17: 0, 20: 0, 3: 1, 6: 1, 8: 1, 10: 1, 12: 1, 2: 2, 9: 2, 11: 2, 14: 2, 16: 2, 23: 2, 13: 3, 21: 3, 22: 3, 15: 4, 25: 4, 26: 4 };
const TWO_HAND_SUB = new Set([1, 5, 6, 8, 10, 20]);
const RANGED_SUB = new Set([2, 3, 18]);
const DMG_TABLES = ['ItemDamageOneHand', 'ItemDamageTwoHand', 'ItemDamageOneHandCaster', 'ItemDamageTwoHandCaster',
  'ItemDamageRanged', 'ItemDamageThrown', 'ItemDamageWand', 'ItemArmorShield'];

// More than this many dropping NPCs = a world/trash drop; we then store
// only the count instead of every NPC.
const MAX_LISTED_DROPPERS = 6;

const I = v => { const n = Math.trunc(Number(v)); return Number.isFinite(n) ? n : 0; };
const F = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

async function getText(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: UA });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (attempt >= 3) throw new Error(`${url}: ${e.message}`);
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
}

async function table(name, build, need = []) {
  const text = await getText(`${WAGO}/db2/${name}/csv?build=${encodeURIComponent(build)}`);
  if (text.startsWith('{')) throw new Error(`${name} not available for ${build}: ${text.slice(0, 120)}`);
  const [header, ...rows] = parseCsv(text);
  const missing = need.filter(c => !header.includes(c));
  if (missing.length) throw new Error(`${name} (${build}) lacks columns ${missing.join(', ')} — layout changed, update scripts/forever-data/update.mjs`);
  return rows.filter(r => r.length === header.length).map(r => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}
const byId = (rows, key = 'ID') => new Map(rows.map(r => [I(r[key]), r]));

// ---------------------------------------------------------------- build
async function newestBuild(builds, product, prefix) {
  const list = (builds[product] || []).filter(b => b.version.startsWith(prefix))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  if (!list.length) throw new Error(`no ${prefix}x build found under ${product}`);
  return list[0].version;
}

// ---------------------------------------------------------------- item math
function itemMath(t) {
  const rpp = byId(t.RandPropPoints);
  const dmg = Object.fromEntries(DMG_TABLES.map(n => [n, byId(t[n], 'ItemLevel')]));
  const armorTotal = byId(t.ItemArmorTotal, 'ItemLevel');
  const armorQual = byId(t.ItemArmorQuality);
  const armorLoc = byId(t.ArmorLocation);
  const sample = t.RandPropPoints[0] || {};
  const cols = 'EpicF_0' in sample ? { 4: 'EpicF', 3: 'SuperiorF', 2: 'GoodF' } : { 4: 'Epic', 3: 'Superior', 2: 'Good' };

  function points(ilvl, quality, inv) {
    const slot = SLOT_INDEX[inv];
    const row = rpp.get(ilvl);
    if (slot === undefined || !row) return 0;
    return F(row[`${cols[quality >= 4 ? 4 : quality === 3 ? 3 : 2]}_${slot}`]);
  }

  return {
    stats(sp, quality, inv) {
      const pts = points(I(sp.ItemLevel), quality, inv);
      const out = [];
      for (let i = 0; i < 10; i++) {
        const stat = I(sp[`StatModifier_bonusStat_${i}`]);
        if (stat < 0) continue;
        const direct = I(sp[`StatModifier_bonusAmount_${i}`]); // Classic Era layout, if it ever appears
        const val = direct || Math.floor(pts * I(sp[`StatPercentEditor_${i}`]) / 10000 + 0.5);
        if (val) out.push([stat, val]);
      }
      return out;
    },
    armor(cls, sub, inv, ilvl, quality, sp) {
      if (sp && 'Resistances_0' in sp) return I(sp.Resistances_0); // Classic Era layout: stored on the item
      if (cls !== 4 || quality > 6) return 0;
      const q = Math.min(quality, 6);
      if (sub === 6) { const row = dmg.ItemArmorShield.get(ilvl); return row ? Math.floor(F(row[`Quality_${q}`]) + 0.5) : 0; }
      if (sub < 1 || sub > 4) return 0;
      const total = armorTotal.get(ilvl), aq = armorQual.get(ilvl), loc = armorLoc.get(inv === 20 ? 5 : inv);
      if (!total || !aq || !loc) return 0;
      const [tcol, lcol] = { 1: ['Cloth', 'Clothmodifier'], 2: ['Leather', 'Leathermodifier'], 3: ['Mail', 'Chainmodifier'], 4: ['Plate', 'Platemodifier'] }[sub];
      return Math.floor(F(aq[`Qualitymod_${q}`]) * F(total[tcol]) * F(loc[lcol]) + 0.5);
    },
    damage(cls, sub, sp, quality) {
      if (cls !== 2) return null;
      if ('MinDamage_0' in sp) { // Classic Era layout: stored on the item
        const min = I(sp.MinDamage_0), max = I(sp.MaxDamage_0), delay = I(sp.ItemDelay);
        if (!(min || max) || delay <= 0) return null;
        const speed = delay / 1000;
        return { min, max, speed, dps: Math.round((min + max) / 2 / speed * 10) / 10 };
      }
      const ilvl = I(sp.ItemLevel), q = quality === 7 ? 3 : Math.min(quality, 6);
      const caster = (I(sp.Flags_1) & 0x200) !== 0;
      let name;
      if (TWO_HAND_SUB.has(sub) || RANGED_SUB.has(sub)) name = caster ? 'ItemDamageTwoHandCaster' : 'ItemDamageTwoHand';
      else if (sub === 16) name = 'ItemDamageThrown';
      else if (sub === 19) name = 'ItemDamageWand';
      else name = caster ? 'ItemDamageOneHandCaster' : 'ItemDamageOneHand';
      const row = dmg[name].get(ilvl), delay = I(sp.ItemDelay);
      if (!row || delay <= 0) return null;
      const avg = F(row[`Quality_${q}`]) * delay / 1000, varc = F(sp.DmgVariance);
      const min = Math.floor((1 - varc / 2) * avg), max = Math.floor((1 + varc / 2) * avg + 0.5);
      const speed = delay / 1000;
      return { min, max, speed, dps: Math.round((min + max) / 2 / speed * 10) / 10 };
    }
  };
}

// ---------------------------------------------------------------- sources
function buildSources(qItems, qNpcs, qQuests, qObjects, zoneName, itemName) {
  const npcLabel = id => {
    const n = qNpcs.get(id);
    if (!n) return null;
    const zone = zoneName(n[8]);
    return zone ? { n: n[0], z: zone } : { n: n[0] };
  };
  const out = new Map();
  for (const [id, r] of qItems) {
    const src = {};
    const drops = (r[1] || []).filter(Boolean);
    if (drops.length > MAX_LISTED_DROPPERS) src.dropCount = drops.length;
    else if (drops.length) src.drops = drops.map(npcLabel).filter(Boolean);
    const objects = (r[2] || []).map(o => qObjects.get(o)).filter(Boolean).map(o => o[0]);
    if (objects.length) src.objects = [...new Set(objects)].slice(0, MAX_LISTED_DROPPERS);
    const containers = (r[3] || []).map(itemName).filter(Boolean);
    if (containers.length) src.containers = containers.slice(0, MAX_LISTED_DROPPERS);
    const quests = (r[5] || []).map(q => qQuests.get(q) && { n: qQuests.get(q)[0], id: q, l: qQuests.get(q)[4] || undefined }).filter(Boolean);
    if (quests.length) src.quests = quests;
    const vendors = (r[13] || []).map(npcLabel).filter(Boolean);
    if (vendors.length) src.vendors = vendors.slice(0, MAX_LISTED_DROPPERS);
    if (Object.keys(src).length) out.set(id, src);
  }
  return out;
}

// ---------------------------------------------------------------- main
const builds = JSON.parse(await getText(`${WAGO}/api/builds`));
const build = await newestBuild(builds, PRODUCT, '1.60.');
// wago.tools' Forever ItemSparse export only holds part of the items (the
// rest are unchanged Classic items). Those are filled in from the newest
// Classic Era build, whose ItemSparse stores final stat/armor/damage values.
const eraBuild = await newestBuild(builds, 'wow_classic_era', '1.15.');
console.log('Forever build:', build, '| Classic Era fallback:', eraBuild);

const NEED = {
  ItemSparse: ['Display_lang', 'ItemLevel', 'OverallQualityID', 'RequiredLevel', 'StatModifier_bonusStat_0', 'StatPercentEditor_0', 'ItemDelay', 'DmgVariance', 'ItemSet', 'AllowableClass', 'Bonding'],
  Item: ['ClassID', 'SubclassID', 'InventoryType', 'IconFileDataID'],
  RandPropPoints: [], ItemArmorTotal: ['Cloth', 'Leather', 'Mail', 'Plate'], ItemArmorQuality: ['Qualitymod_4'],
  ArmorLocation: ['Clothmodifier'], ItemSet: ['Name_lang', 'ItemID_0'], AreaTable: ['AreaName_lang']
};
const t = {};
for (const name of [...Object.keys(NEED), ...DMG_TABLES]) {
  t[name] = await table(name, build, NEED[name] || ['ItemLevel']);
  console.log(`  ${name}: ${t[name].length} rows`);
}

const [qItemsTxt, qNpcsTxt, qQuestsTxt, qObjectsTxt, listfileTxt] = await Promise.all([
  getText(`${QUESTIE}/foreverItemDB.lua`), getText(`${QUESTIE}/foreverNpcDB.lua`),
  getText(`${QUESTIE}/foreverQuestDB.lua`), getText(`${QUESTIE}/foreverObjectDB.lua`), getText(LISTFILE)
]);
const qItems = parseLuaRecords(qItemsTxt), qNpcs = parseLuaRecords(qNpcsTxt);
const qQuests = parseLuaRecords(qQuestsTxt), qObjects = parseLuaRecords(qObjectsTxt);
console.log(`  QuestieDB: ${qItems.size} items, ${qNpcs.size} npcs, ${qQuests.size} quests, ${qObjects.size} objects`);

const icons = new Map();
for (const line of listfileTxt.split('\n')) {
  const m = /^(\d+);interface\/icons\/([^/]+)\.blp\s*$/i.exec(line);
  if (m) icons.set(Number(m[1]), m[2].toLowerCase());
}
console.log(`  listfile: ${icons.size} icon names`);

const eraSparseRows = await table('ItemSparse', eraBuild, ['Display_lang', 'ItemLevel', 'OverallQualityID', 'StatModifier_bonusAmount_0']);
console.log(`  ItemSparse (Era ${eraBuild}): ${eraSparseRows.length} rows`);
const eraSparse = byId(eraSparseRows);

const area = byId(t.AreaTable);
const zoneName = id => (id && area.get(id) ? area.get(id).AreaName_lang : '');
const sparse = byId(t.ItemSparse);
const itemName = id => ((sparse.get(id) || eraSparse.get(id) || {}).Display_lang || (qItems.get(id) || [])[0]);
const sources = buildSources(qItems, qNpcs, qQuests, qObjects, zoneName, itemName);

const setOf = new Map();
for (const s of t.ItemSet) for (let i = 0; i < 17; i++) { const id = I(s[`ItemID_${i}`]); if (id) setOf.set(id, I(s.ID)); }
const sets = {};

const math = itemMath(t);
const items = [];
for (const it of t.Item) {
  const id = I(it.ID), sp = sparse.get(id) || eraSparse.get(id);
  if (!sp) continue;
  const cls = I(it.ClassID), sub = I(it.SubclassID), inv = I(it.InventoryType), q = I(sp.OverallQualityID);
  if ((cls !== 2 && cls !== 4) || !GEAR_INV_TYPES.has(inv) || q < MIN_QUALITY || q > 5) continue;
  const name = sp.Display_lang;
  if (!name || /\b(test|deprecated|unused|monster -)\b/i.test(name)) continue;
  const rec = { id, n: name, q, il: I(sp.ItemLevel), c: cls, sc: sub, it: inv };
  const rl = I(sp.RequiredLevel); if (rl) rec.rl = rl;
  const ac = I(sp.AllowableClass); if (ac > 0) rec.ac = ac;
  const b = I(sp.Bonding); if (b) rec.b = b;
  const icon = icons.get(I(it.IconFileDataID)); if (icon) rec.ic = icon;
  const st = math.stats(sp, q, inv); if (st.length) rec.s = st;
  const ar = math.armor(cls, sub, inv, rec.il, q, sp); if (ar) rec.ar = ar;
  const dm = math.damage(cls, sub, sp, q); if (dm) rec.dm = dm;
  const set = I(sp.ItemSet) || setOf.get(id);
  if (set) { rec.set = set; const row = t.ItemSet.find(s => I(s.ID) === set); if (row) sets[set] = row.Name_lang; }
  const src = sources.get(id); if (src) rec.src = src;
  items.push(rec);
}
items.sort((a, b) => a.id - b.id);

// ---------------------------------------------------------------- sanity
const withStats = items.filter(r => r.s).length, withSrc = items.filter(r => r.src).length, withIcon = items.filter(r => r.ic).length;
console.log(`Items: ${items.length} (stats ${withStats}, sources ${withSrc}, icons ${withIcon}, sets ${Object.keys(sets).length})`);
for (const id of [12640, 15063, 13340, 16707, 19019]) console.log('  sample', JSON.stringify(items.find(r => r.id === id)));
const fail = [];
if (items.length < 3000) fail.push(`only ${items.length} items`);
if (withStats < items.length * 0.5) fail.push(`only ${withStats} items with stats`);
if (withIcon < items.length * 0.8) fail.push(`only ${withIcon} items with icons`);
if (withSrc < items.length * 0.2) fail.push(`only ${withSrc} items with sources`);
if (fail.length) { console.error('Sanity check failed: ' + fail.join('; ')); process.exit(1); }

// ---------------------------------------------------------------- class stats
const classStats = await buildClassStats({ build, table, getText });

// ---------------------------------------------------------------- write
await mkdir(OUT_DIR, { recursive: true });
async function writeIfChanged(name, json) {
  const url = new URL(name, OUT_DIR);
  let previous = '';
  try { previous = await readFile(url, 'utf8'); } catch (e) { /* first run */ }
  if (previous === json) return false;
  await writeFile(url, json);
  console.log(`Wrote data/forever/${name} (${Math.round(json.length / 1024)} KB).`);
  return true;
}
const itemsChanged = await writeIfChanged('items.json', JSON.stringify({ build, eraBuild, sets, items }) + '\n');
const statsChanged = await writeIfChanged('class-stats.json', JSON.stringify({ build, ...classStats }) + '\n');
if (itemsChanged || statsChanged) {
  await writeFile(new URL('meta.json', OUT_DIR), JSON.stringify({
    build, eraBuild, generatedAt: new Date().toISOString(), counts: { items: items.length, withStats, withSources: withSrc, withIcons: withIcon },
    sources: ['wago.tools (WoW Forever client DB2)', 'Questie/QuestieDB data/Forever', 'wowdev/wow-listfile',
      'ElliotWood/Forever (base health/attributes per level, Wowhead Forever gear planner snapshot)']
  }, null, 2) + '\n');
} else {
  console.log('No changes.');
}
