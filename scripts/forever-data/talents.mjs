// WoW Forever talent trees from the client (wago.tools DB2 exports),
// written to data/forever/talents.js by update.mjs.
//
// Forever doesn't use the Classic Talent/TalentTab tables (in the client
// those are unchanged Classic Era leftovers): its trees are retail-style
// Trait tables — one TraitTree per class, the three tabs laid side by
// side on one canvas. The reading below follows the approach of
// tools/forever_talents/export_beta.py in github.com/ElliotWood/Forever
// (wowsims, MIT licence):
//
//  - TraitNode (PosX/PosY on the canvas) -> TraitNodeXTraitNodeEntry ->
//    TraitNodeEntry (MaxRanks) -> TraitDefinition (SpellID, override
//    name / description / icon).
//  - TraitEdge: prerequisites (Type 0 is drawn only, not required).
//  - Per-rank numbers: TraitDefinitionEffectPoints -> CurvePoint, where
//    (Pos_0, Pos_1) = (rank, value); SpellEffect.EffectBasePointsF only as
//    a fallback.
//  - Tabs carry no names in these tables, so trees (and which TraitTree is
//    which class) are matched against the hand-made snapshot in
//    data/talentsforever.js by talent-name overlap. That snapshot also
//    supplies class/tree icons and descriptions the client text can't
//    resolve (see FOREVER_TALENT_TREES in data/talentsforever.js).

const TABLES = {
  TraitNode: ['TraitTreeID', 'PosX', 'PosY'],
  TraitNodeEntry: ['TraitDefinitionID', 'MaxRanks'],
  TraitNodeXTraitNodeEntry: ['TraitNodeID', 'TraitNodeEntryID'],
  TraitDefinition: ['SpellID', 'OverrideName_lang', 'OverrideDescription_lang'],
  TraitDefinitionEffectPoints: ['TraitDefinitionID', 'EffectIndex', 'CurveID'],
  TraitEdge: ['LeftTraitNodeID', 'RightTraitNodeID', 'Type'],
  CurvePoint: ['CurveID', 'Pos_0', 'Pos_1'],
  SpellName: ['Name_lang'],
  Spell: ['Description_lang'],
  SpellEffect: ['SpellID', 'EffectIndex', 'EffectBasePointsF'],
  SpellMisc: ['SpellID', 'SpellIconFileDataID', 'DurationIndex'],
  SpellDuration: ['Duration']
};
// Canvas layout of the class trees in 1.60.x (from the Forever sim's
// exporter): tab origins on PosX, 600 per column and per row. Checked
// against the snapshot positions below; a layout change fails the run.
const TAB_X0 = [1020, 5020, 9080];
const Y0 = 2130, STEP = 600;
const ROWS = 7, COLS = 4;

const I = v => { const n = Math.trunc(Number(v)); return Number.isFinite(n) ? n : 0; };
const F = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
// A few nodes carry a stray extra zero (39300, 102800).
const onGrid = (v, hi) => { while (v > hi) v = Math.floor(v / 10); return v; };
const num = v => { v = Math.abs(v); return Number.isInteger(v) ? v : Math.round(v * 100) / 100; };

/** "6 sec", "1.5 min" — how the client shows durations. @param {number} ms */
const fmtDuration = ms => {
  const s = Math.abs(ms) / 1000;
  return s >= 60 && s % 60 === 0 ? `${s / 60} min` : s >= 120 ? `${num(s / 60)} min` : `${num(s)} sec`;
};

/**
 * @param {{ build: string, table: Function, icons: Map<number, string>, snapshot: Record<string, any> }} io
 */
export async function buildTalents({ build, table, icons, snapshot }) {
  const t = {};
  for (const [name, cols] of Object.entries(TABLES)) t[name] = await table(name, build, cols);

  const spellName = new Map(t.SpellName.map(r => [r.ID, r.Name_lang]));
  const description = new Map(t.Spell.map(r => [r.ID, r.Description_lang]));
  const definition = new Map(t.TraitDefinition.map(r => [r.ID, r]));
  const entries = new Map(t.TraitNodeEntry.map(r => [r.ID, r]));
  const nodeEntries = new Map();
  for (const r of t.TraitNodeXTraitNodeEntry) {
    const e = entries.get(r.TraitNodeEntryID);
    if (!e) continue;
    if (!nodeEntries.has(r.TraitNodeID)) nodeEntries.set(r.TraitNodeID, []);
    nodeEntries.get(r.TraitNodeID).push(e);
  }
  const curveOf = new Map();
  for (const r of t.TraitDefinitionEffectPoints) {
    if (!curveOf.has(r.TraitDefinitionID)) curveOf.set(r.TraitDefinitionID, new Map());
    curveOf.get(r.TraitDefinitionID).set(I(r.EffectIndex), r.CurveID);
  }
  const points = new Map();
  for (const r of t.CurvePoint) {
    if (!points.has(r.CurveID)) points.set(r.CurveID, new Map());
    points.get(r.CurveID).set(Math.round(F(r.Pos_0)), F(r.Pos_1));
  }
  const base = new Map();
  for (const r of t.SpellEffect) {
    if (!base.has(r.SpellID)) base.set(r.SpellID, new Map());
    base.get(r.SpellID).set(I(r.EffectIndex), F(r.EffectBasePointsF));
  }
  const iconFid = new Map(), durationIdx = new Map();
  for (const r of t.SpellMisc){
    if (!iconFid.has(r.SpellID) && I(r.SpellIconFileDataID)) iconFid.set(r.SpellID, I(r.SpellIconFileDataID));
    if (!durationIdx.has(r.SpellID) && I(r.DurationIndex)) durationIdx.set(r.SpellID, r.DurationIndex);
  }
  const durationMs = new Map(t.SpellDuration.map(r => [r.ID, I(r.Duration)]));
  const spellDuration = spellId => durationMs.get(durationIdx.get(String(spellId)));
  const nodesByTree = new Map();
  for (const r of t.TraitNode) {
    if (!nodesByTree.has(r.TraitTreeID)) nodesByTree.set(r.TraitTreeID, []);
    nodesByTree.get(r.TraitTreeID).push(r);
  }
  const edges = t.TraitEdge.filter(r => r.Type !== '0');

  const nameOf = node => {
    const es = nodeEntries.get(node.ID);
    if (!es) return '';
    const d = definition.get(es[0].TraitDefinitionID);
    return d ? (d.OverrideName_lang || spellName.get(d.SpellID) || '') : '';
  };
  const value = (defId, spell, effect, rank) => {
    const curve = curveOf.get(defId) && curveOf.get(defId).get(effect);
    if (curve && points.has(curve) && points.get(curve).has(rank)) return points.get(curve).get(rank);
    return (base.get(spell) && base.get(spell).get(effect)) || 0;
  };
  /**
   * Per-rank tooltip lines. Resolves $s1/$m1 (with $/1000;s1 divisors),
   * ${...} arithmetic over those, $d / $<spellId>d durations; anything
   * else becomes "?" and marks the tooltip partial (the merge then keeps
   * the snapshot's wording if it has one).
   */
  const tooltip = (defId, spell, maxRank) => {
    const d = definition.get(defId);
    let raw = d.OverrideDescription_lang || description.get(spell) || '';
    raw = raw.replace(/\|[cC][0-9A-Fa-f]{8}|\|[rR]/g, '').replace(/\s+/g, ' ').trim();
    let partial = false;
    const desc = [];
    for (let rank = 1; rank <= maxRank; rank++){
      const val = (i) => value(defId, spell, I(i) - 1, rank);
      let txt = raw.replace(/\$\{([^}]*)\}(\.\d)?/g, (m, expr) => {
        const e = expr.replace(/\$([smSM])(\d)/g, (_, _l, i) => String(val(i)));
        if (!/^[\d.+\-*/() ]+$/.test(e)) return '\u0000';
        try { const v = Function(`"use strict"; return (${e});`)(); return Number.isFinite(v) ? String(num(v)) : '\u0000'; } catch (err){ return '\u0000'; }
      });
      txt = txt.replace(/\$\/(-?\d+);([smSM])(\d)/g, (_, div, _l, i) => String(num(val(i) / I(div))));
      txt = txt.replace(/\$([smSM])(\d)/g, (_, _l, i) => String(num(val(i))));
      txt = txt.replace(/\$(\d*)d(?![a-zA-Z])/g, (m, other) => {
        const ms = spellDuration(other || spell);
        return ms > 0 ? fmtDuration(ms) : '\u0000';
      });
      txt = txt.replace(/\$\d*[a-zA-Z]\d?/g, '\u0000');
      if (txt.includes('\u0000')) partial = true;
      desc.push(txt.replace(/\u0000/g, '?'));
    }
    return { desc, partial };
  };

  // Which TraitTree is which class: most talent names in common with the snapshot.
  const used = new Set();
  const classes = {};
  for (const [cls, snap] of Object.entries(snapshot)) {
    const snapNames = new Set(snap.trees.flatMap(tr => tr.talents.map(x => norm(x.name))));
    let best = null, bestScore = 0;
    for (const [treeId, nodes] of nodesByTree) {
      if (used.has(treeId) || nodes.length < 40) continue;
      const score = nodes.filter(n => snapNames.has(norm(nameOf(n)))).length;
      if (score > bestScore) { best = treeId; bestScore = score; }
    }
    if (!best) throw new Error(`talents: no TraitTree found for ${cls}`);
    used.add(best);

    let talents = [];
    for (const node of nodesByTree.get(best)) {
      const es = nodeEntries.get(node.ID);
      if (!es) continue;
      const entry = es[0];
      const def = definition.get(entry.TraitDefinitionID);
      if (!def) continue;
      const name = nameOf(node);
      if (!name) continue;
      const x = onGrid(I(node.PosX), 11000), y = onGrid(I(node.PosY), 6000);
      const tab = Math.max(0, ...TAB_X0.map((x0, i) => (x >= x0 - 100 ? i : 0)));
      const max = I(entry.MaxRanks) || 1;
      const { desc, partial } = tooltip(entry.TraitDefinitionID, def.SpellID, max);
      const fid = I(def.OverrideIcon) || iconFid.get(def.SpellID);
      const talent = {
        node: I(node.ID), tab, spell: def.SpellID, name,
        row: Math.round((y - Y0) / STEP) + 1, col: Math.round((x - TAB_X0[tab]) / STEP) + 1,
        max, icon: icons.get(fid) || '', desc
      };
      if (partial) talent.descPartial = true;
      talents.push(talent);
    }
    // Two nodes for one spell: the client kept a stale copy. Keep the newest node.
    const newest = new Map();
    for (const x of talents.sort((a, z) => a.node - z.node)) newest.set(x.spell, x);
    talents = [...newest.values()];
    const byNode = new Map(talents.map(x => [x.node, x]));
    for (const e of edges) {
      const left = byNode.get(I(e.LeftTraitNodeID)), right = byNode.get(I(e.RightTraitNodeID));
      // an upward edge is the reverse copy of a real one
      if (left && right && left.row <= right.row && left.tab === right.tab && !right.req) right.req = left.name;
    }

    const bad = talents.filter(x => x.row < 1 || x.row > ROWS || x.col < 1 || x.col > COLS);
    if (bad.length) throw new Error(`talents: ${cls} layout off the ${ROWS}x${COLS} grid (canvas changed?): ${bad.slice(0, 4).map(x => `${x.name} r${x.row} c${x.col}`).join(', ')}`);

    // Tab names from the snapshot tree they overlap most (snapshot order = display order).
    const trees = [0, 1, 2].map(tab => {
      const list = talents.filter(x => x.tab === tab);
      const keys = new Set(list.map(x => norm(x.name)));
      const snapIdx = snap.trees
        .map((tr, i) => ({ i, n: tr.talents.filter(x => keys.has(norm(x.name))).length }))
        .sort((a, z) => z.n - a.n)[0].i;
      return {
        snapIdx, name: snap.trees[snapIdx].name,
        talents: list.sort((a, z) => a.row - z.row || a.col - z.col).map(({ node, tab: _t, spell, ...rest }) => rest)
      };
    }).sort((a, z) => a.snapIdx - z.snapIdx).map(({ snapIdx, ...rest }) => rest);
    if (new Set(trees.map(tr => tr.name)).size !== 3) throw new Error(`talents: ${cls} tabs don't map onto three distinct snapshot trees: ${trees.map(tr => tr.name).join(', ')}`);

    classes[cls] = { trees };
    const total = trees.reduce((s, tr) => s + tr.talents.length, 0);
    const snapTotal = snap.trees.reduce((s, tr) => s + tr.talents.length, 0);
    console.log(`  talents ${cls}: TraitTree ${best}, ${trees.map(tr => `${tr.name} ${tr.talents.length}`).join(' / ')} (snapshot ${snapTotal}, ${bestScore} names shared, ${talents.filter(x => x.descPartial).length} partial tooltips)`);
    if (total < 40) throw new Error(`talents: ${cls} only ${total} talents`);
    if (bestScore < total * 0.5) throw new Error(`talents: ${cls} shares only ${bestScore}/${total} names with the snapshot — wrong tree?`);
  }
  return classes;
}
