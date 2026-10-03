// Dungeon/raid loot from the client's Encounter Journal (wago.tools DB2):
// JournalInstance (name, map) -> JournalEncounter (boss) ->
// JournalEncounterItem (loot). QuestieDB doesn't know Forever's new
// instances (e.g. Ruins of Lordaeron) yet and lacks some Classic raid loot,
// so this fills drops for items QuestieDB has none for.
//
// Optional: if the Forever build has no journal tables, nothing is added.

const I = v => { const n = Math.trunc(Number(v)); return Number.isFinite(n) ? n : 0; };
const INSTANCE_KIND = { 1: 'd', 2: 'r', 3: 'b' };

/**
 * @param {{ build: string, table: Function, maps: Map<number, any> }} io
 * @returns {Promise<{ dropsOf: Map<number, { n: string, z: string }[]>, kinds: Record<string, string> }>}
 */
export async function buildJournalLoot({ build, table, maps }) {
  const dropsOf = new Map();
  const kinds = {};
  let instances, encounters, loot;
  try {
    instances = await table('JournalInstance', build, ['Name_lang', 'MapID']);
    encounters = await table('JournalEncounter', build, ['Name_lang', 'JournalInstanceID']);
    loot = await table('JournalEncounterItem', build, ['JournalEncounterID', 'ItemID']);
  } catch (e) {
    console.log(`  journal: skipped (${e.message})`);
    return { dropsOf, kinds };
  }
  const instById = new Map(instances.map(r => [I(r.ID), r]));
  const encById = new Map(encounters.map(r => [I(r.ID), r]));
  for (const row of loot) {
    const enc = encById.get(I(row.JournalEncounterID));
    const inst = enc && instById.get(I(enc.JournalInstanceID));
    if (!enc || !inst || !inst.Name_lang) continue;
    const z = inst.Name_lang;
    kinds[z] = kinds[z] || INSTANCE_KIND[I((maps.get(I(inst.MapID)) || {}).InstanceType)] || 'd';
    const id = I(row.ItemID);
    if (!dropsOf.has(id)) dropsOf.set(id, []);
    const list = dropsOf.get(id);
    if (!list.some(d => d.n === enc.Name_lang && d.z === z)) list.push({ n: enc.Name_lang, z });
  }
  console.log(`  journal: ${instances.length} instances, ${encounters.length} encounters, ${loot.length} loot rows, ${dropsOf.size} items;`,
    Object.entries(kinds).map(([z, k]) => z + ':' + k).join(', '));
  return { dropsOf, kinds };
}
