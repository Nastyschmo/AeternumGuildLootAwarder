// Levelguide data: data/forever/quests.json for the page "Levelguide"
// (js/level-guide.js), built by update.mjs from QuestieDB's Forever data
// (github.com/Questie/QuestieDB, data/Forever):
//
//  - quests the Horde can do (requiredRaces empty or with a Horde race,
//    quest giver not hostile to the Horde): name, required / quest level,
//    zone (QuestieDB zoneOrSort), who starts it (NPC / object / item) and
//    who takes it back, prerequisites (preQuestSingle = one of them,
//    preQuestGroup = all of them) and the follow-up, class / race limits,
//    reward items (from the item data, gear only), what to do (Blizzard's
//    objective text) and the targets: NPCs to kill, objects to use, items
//    to collect with their droppers, places to explore;
//  - the NPCs / objects involved with name, zone and first coordinates;
//  - zones with kind (dungeon 'd', raid 'r', else world 'z'), level range
//    (10th–90th percentile of the quest levels), quest count and, for the
//    starting zones, the races that start there;
//  - reward items: name, quality, icon.
// The page builds quest chains (all steps from the first quest) and quest
// hubs from this. New Forever content shows up once QuestieDB has it.

const I = v => { const n = Math.trunc(Number(v)); return Number.isFinite(n) ? n : 0; };
/** Horde races (orc 2, undead 16, tauren 32, troll 128) and Alliance races (human 1, dwarf 4, night elf 8, gnome 64). */
const HORDE_RACES = 178n, ALLIANCE_RACES = 77n;
/** Class bitmask -> class id. */
/** Horde race bits -> race id (the page's names). */
const RACE_BITS = { 2: 'orc', 16: 'undead', 32: 'tauren', 128: 'troll' };
/** Starting zones (and their newbie areas) -> the races that start there. */
const START_ZONES = {
  'valley of trials': ['orc', 'troll'], durotar: ['orc', 'troll'],
  'red cloud mesa': ['tauren'], 'camp narache': ['tauren'], mulgore: ['tauren'],
  deathknell: ['undead'], 'tirisfal glades': ['undead']
};
/** Item objectives list this many droppers (those in the quest's zone first). */
const MAX_DROPPERS = 3;
const CLASS_BITS = { 1: 'warrior', 2: 'paladin', 4: 'hunter', 8: 'rogue', 16: 'priest', 64: 'shaman', 128: 'mage', 256: 'warlock', 1024: 'druid' };
const round1 = v => Math.round(Number(v) * 10) / 10;

/** First spawn of an NPC / object, preferring its main zone: [zoneId, x, y]. */
function firstSpawn(spawns, mainZone) {
  if (!spawns || typeof spawns !== 'object') return [mainZone || 0, 0, 0];
  const zones = Object.keys(spawns).map(Number);
  const z = zones.includes(mainZone) ? mainZone : zones[0];
  const pt = ((spawns[z] || [])[0]) || [];
  // Inside instances QuestieDB has no map coordinates (-1, -1).
  const x = Number(pt[0]) > 0 ? round1(pt[0]) : 0, y = Number(pt[1]) > 0 ? round1(pt[1]) : 0;
  return [z || mainZone || 0, x, y];
}

/**
 * @param {{ qQuests: Map<number, any[]>, qNpcs: Map<number, any[]>, qObjects: Map<number, any[]>,
 *   zoneInfo: (id: number) => { name: string, kind: string } | null,
 *   rewardItems: { id: number, n: string, q: number, ic?: string, quests: number[] }[],
 *   itemName: (id: number) => string,
 *   itemDrops: (id: number) => { npcs: number[], objs: number[] } }} ctx
 */
export function buildQuests({ qQuests, qNpcs, qObjects, zoneInfo, rewardItems, itemName, itemDrops }) {
  const side = r => {
    if (!r) return 'B';
    const b = BigInt(Math.trunc(Number(r)));
    if (!(b & HORDE_RACES)) return '';
    return (b & ALLIANCE_RACES) ? 'B' : 'H';
  };
  const npcHostileToHorde = id => { const n = qNpcs.get(id); return Boolean(n && n[12] && !String(n[12]).includes('H')); };
  const rewardsOf = new Map();
  for (const it of rewardItems) for (const q of it.quests) { if (!rewardsOf.has(q)) rewardsOf.set(q, []); rewardsOf.get(q).push(it.id); }

  const quests = {}, npcs = {}, objs = {}, items = {}, zones = {};
  const useNpc = id => {
    if (npcs[id] || !qNpcs.has(id)) return;
    const n = qNpcs.get(id);
    npcs[id] = [String(n[0] || ''), ...firstSpawn(n[6], I(n[8]))];
    if (n[13]) npcs[id].push(String(n[13]));
  };
  const useObj = id => {
    if (objs[id] || !qObjects.has(id)) return;
    const o = qObjects.get(id);
    objs[id] = [String(o[0] || ''), ...firstSpawn(o[3], I(o[4]))];
  };
  const npcZone = id => I((qNpcs.get(id) || [])[8]);
  /** Targets: ['n', npc] kill, ['o', object] use, ['i', item, name, droppers, more, objects] collect, ['t', text, zone, x, y] explore. */
  const objectives = (q, zone) => {
    const out = [];
    const [creatures, objects, items] = Array.isArray(q[9]) ? q[9] : [];
    for (const c of creatures || []) { const id = I((c || [])[0]); if (id && qNpcs.has(id)) { out.push(['n', id]); useNpc(id); } }
    for (const o of objects || []) { const id = I((o || [])[0]); if (id && qObjects.has(id)) { out.push(['o', id]); useObj(id); } }
    for (const it of items || []) {
      const id = I((it || [])[0]);
      if (!id) continue;
      const src = itemDrops(id);
      const droppers = src.npcs.filter(n => qNpcs.has(n)).sort((a, b) => Number(npcZone(b) === zone) - Number(npcZone(a) === zone));
      const objs = src.objs.filter(o => qObjects.has(o)).slice(0, 2);
      droppers.slice(0, MAX_DROPPERS).forEach(useNpc);
      objs.forEach(useObj);
      out.push(['i', id, itemName(id) || '', droppers.slice(0, MAX_DROPPERS), Math.max(0, droppers.length - MAX_DROPPERS), objs]);
    }
    const trig = q[8];
    if (Array.isArray(trig) && typeof trig[0] === 'string' && trig[0].trim()) {
      const spots = trig[1] && typeof trig[1] === 'object' ? trig[1] : {};
      const z = Object.keys(spots).map(Number)[0] || 0;
      const pt = ((spots[z] || [])[0]) || [];
      out.push(['t', trig[0].trim(), z, Number(pt[0]) > 0 ? round1(pt[0]) : 0, Number(pt[1]) > 0 ? round1(pt[1]) : 0]);
    }
    return out;
  };
  const zoneLevels = new Map();
  for (const [id, q] of qQuests) {
    const sd = side(q[5]);
    if (!sd) continue;
    const start = q[1] || [];
    const startNpc = (start[0] || [])[0], startObj = (start[1] || [])[0], startItem = (start[2] || [])[0];
    if (startNpc && !(start[0] || []).some(n => !npcHostileToHorde(n))) continue;
    /** @type {any} */
    const out = { n: String(q[0] || ''), r: I(q[3]), l: I(q[4]), z: I(q[16]) };
    if (sd === 'H') out.h = 1;
    if (startNpc) { const n = (start[0] || []).find(x => !npcHostileToHorde(x)); out.s = ['n', n]; useNpc(n); }
    else if (startObj) { out.s = ['o', startObj]; useObj(startObj); }
    else if (startItem) { out.s = ['i', startItem, itemName(startItem) || '']; }
    const end = ((q[2] || [])[0] || [])[0] || 0;
    const endObj = ((q[2] || [])[1] || [])[0] || 0;
    if (end) { out.e = ['n', end]; useNpc(end); } else if (endObj) { out.e = ['o', endObj]; useObj(endObj); }
    const preAll = (q[11] || []).map(I).filter(Boolean), preOne = (q[12] || []).map(I).filter(Boolean);
    if (preAll.length) out.pa = preAll;
    if (preOne.length) out.po = preOne;
    if (I(q[21])) out.nx = I(q[21]);
    // Race limit within the Horde (e.g. undead only), not "all Horde races".
    const races = Number(BigInt(Math.trunc(Number(q[5] || 0))) & HORDE_RACES);
    if (races && races !== Number(HORDE_RACES)) out.ra = Object.entries(RACE_BITS).filter(([bit]) => races & Number(bit)).map(([, r]) => r);
    const text = (Array.isArray(q[7]) ? q[7] : [q[7]]).filter(t => typeof t === 'string' && t.trim()).join(' ').trim();
    if (text) out.o = text;
    const ob = objectives(q, out.z);
    if (ob.length) out.ob = ob;
    const cls = I(q[6]);
    if (cls) { const list = Object.entries(CLASS_BITS).filter(([bit]) => cls & Number(bit)).map(([, c]) => c); if (list.length && list.length < 9) out.c = list; }
    const rw = rewardsOf.get(id);
    if (rw) out.rw = rw;
    quests[id] = out;
    if (out.z > 0) { if (!zoneLevels.has(out.z)) zoneLevels.set(out.z, []); zoneLevels.get(out.z).push(out.l || out.r); }
  }
  // Pre-quests the Horde can't take aren't steps of its chains.
  for (const q of Object.values(quests)) {
    if (q.pa) { q.pa = q.pa.filter(p => quests[p]); if (!q.pa.length) delete q.pa; }
    if (q.po) { q.po = q.po.filter(p => quests[p]); if (!q.po.length) delete q.po; }
    if (q.nx && !quests[q.nx]) delete q.nx;
  }
  for (const it of rewardItems) if (it.quests.some(q => quests[q])) items[it.id] = it.ic ? [it.n, it.q, it.ic] : [it.n, it.q];
  for (const [z, lv] of zoneLevels) {
    const info = zoneInfo(z);
    if (!info || !info.name) continue;
    lv.sort((a, b) => a - b);
    const pick = f => lv[Math.min(lv.length - 1, Math.floor(lv.length * f))] || 0;
    zones[z] = { n: info.name, k: info.kind === 'd' || info.kind === 'r' || info.kind === 'b' ? info.kind : 'z', lv: [pick(0.1), pick(0.9)], c: lv.length };
  }
  for (const z of Object.values(zones)) { const st = START_ZONES[z.n.toLowerCase()]; if (st) z.st = st; }
  // NPC / object zones that aren't quest zones still need a name.
  const exploreZones = Object.values(quests).flatMap(q => (q.ob || []).filter(o => o[0] === 't').map(o => [0, o[2]]));
  for (const ref of [...Object.values(npcs), ...Object.values(objs), ...exploreZones]) {
    const z = ref[1];
    if (z && !zones[z]) { const info = zoneInfo(z); if (info && info.name) zones[z] = { n: info.name, k: info.kind === 'd' || info.kind === 'r' || info.kind === 'b' ? info.kind : 'z', lv: [0, 0], c: 0 }; }
  }
  // The same instance can come under several ids: the client's area id the
  // quests use (Uldaman 1517, Zul'Farrak 978 …) often lacks the instance
  // type the enum id (1337, 1176 …) has — same name, same kind.
  const kindByName = new Map();
  for (const z of Object.values(zones)) if (z.k !== 'z') kindByName.set(z.n.toLowerCase(), z.k);
  for (const z of Object.values(zones)) if (z.k === 'z' && kindByName.has(z.n.toLowerCase())) z.k = kindByName.get(z.n.toLowerCase());
  return { quests, npcs, objs, items, zones };
}
