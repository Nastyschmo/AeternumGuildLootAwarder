// Where to get the materials of crafted gear, for the BiS planner's
// Materialliste (items.json `materials`, keyed by item id).
//
// Starts from the reagents of every crafted gear item and follows crafted
// reagents down (Arcanite Bar -> Thorium Bar + Arcane Crystal -> Thorium
// Ore), so every material in the tree gets an entry:
//  - the item's QuestieDB sources (vendors, drops, quests, containers);
//  - `craft`: the profession craft that makes it (smelting, transmutes,
//    bolts of cloth …) with its own materials;
//  - `oz`: zones of the gathering nodes it comes from (herbs, ore veins,
//    chests), most spawns first — QuestieDB object spawns;
//  - `dz`: for world drops with many droppers, the zones most of those
//    mobs live in;
//  - `sk`: 1 when the name says it is skinned (leather, hides, scales,
//    chitin; not cured / enchanted leather) — QuestieDB has no skinning
//    tables. Rugged Leather can also be crafted, but is mostly skinned;
//  - `de`: 1 for enchanting materials (essences, shards, dusts), which come
//    from disenchanting.

const MAX_DEPTH = 4;
/** Enchanting materials — they come from disenchanting gear. */
const DISENCHANT = /\b((Magic|Astral|Mystic|Nether|Eternal) Essence|(Glimmering|Glowing|Radiant|Brilliant) Shard|(Strange|Soul|Vision|Dream|Illusion) Dust|Nexus Crystal)\b/;
const TOP_ZONES = 4;

const I = v => { const n = Math.trunc(Number(v)); return Number.isFinite(n) ? n : 0; };

/** Zone names ranked by weight, top N. */
function topZones(weights, zoneName) {
  return [...weights].sort((a, b) => b[1] - a[1])
    .map(([z]) => zoneName(z)).filter(Boolean)
    .filter((z, i, all) => all.indexOf(z) === i)
    .slice(0, TOP_ZONES);
}

/**
 * @param {{ reagentIds: Iterable<number>, craftFor: (id: number) => any, sources: Map<number, any>,
 *   qItems: Map<number, any[]>, qNpcs: Map<number, any[]>, qObjects: Map<number, any[]>,
 *   npcZone: (id: number) => number, zoneName: (id: number) => string | undefined,
 *   itemName: (id: number) => string | undefined }} io
 */
export function buildMaterials({ reagentIds, craftFor, sources, qItems, qNpcs, qObjects, npcZone, zoneName, itemName }) {
  const out = {};
  const names = {};
  let queue = [...new Set(reagentIds)].map(id => [id, 0]);
  const seen = new Set();
  while (queue.length) {
    const next = [];
    for (const [id, depth] of queue) {
      if (seen.has(id)) continue;
      seen.add(id);
      const name = itemName(id);
      if (!name) continue;
      names[id] = name;
      const src = { ...(sources.get(id) || {}) };
      const craft = craftFor(id);
      if (craft) {
        src.craft = craft;
        if (depth < MAX_DEPTH) for (const [m] of craft.m || []) next.push([m, depth + 1]);
      }
      const q = qItems.get(id) || [];
      // Gathering nodes: zones by number of spawn points.
      const objZones = new Map();
      for (const o of q[2] || []) {
        const spawns = (qObjects.get(o) || [])[3];
        if (!spawns || typeof spawns !== 'object') continue;
        for (const [z, pts] of Object.entries(spawns)) objZones.set(I(z), (objZones.get(I(z)) || 0) + (Array.isArray(pts) ? pts.length : 1));
      }
      const oz = topZones(objZones, zoneName);
      if (oz.length) src.oz = oz;
      // Many droppers (cloth, essences, gems): where most of them live.
      if (src.dropCount) {
        const npcZones = new Map();
        for (const n of q[1] || []) {
          if (!qNpcs.has(n)) continue;
          const z = npcZone(n);
          if (z) npcZones.set(z, (npcZones.get(z) || 0) + 1);
        }
        const dz = topZones(npcZones, zoneName);
        if (dz.length) src.dz = dz;
      }
      if (/(leather|hide|scales?|chitin|carapace)\b/i.test(name) && !/^(Cured|Enchanted|Refined)\b/.test(name)) src.sk = 1;
      if (DISENCHANT.test(name)) src.de = 1;
      out[id] = src;
    }
    queue = next;
  }
  return { materials: out, names };
}
