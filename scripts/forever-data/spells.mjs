// Class abilities for the skill tooltips in the class guides, from the WoW
// Forever client (wago.tools DB2 exports), written to
// data/forever/spells.json by update.mjs.
//
//  - SkillLineAbility: which spells belong to a class (its three spec skill
//    lines, e.g. Arms / Fury / Protection), SupercedesSpell links the ranks.
//  - SpellName / Spell: name, rank ("Rank 3"), description.
//  - SpellLevels: the level a rank can be learned at (BaseLevel).
//  - SpellPower: cost (mana / rage / energy, or % of base mana).
//  - SpellMisc -> SpellCastTimes / SpellRange, SpellCooldowns: icon, cast
//    time, range, cooldown.
//  - SpellEffect / SpellDuration / SpellAuraOptions: values for the
//    description variables ($s1, $d, $o1 …; see describe()).
//
// Racial abilities (the skill lines "Racial - <race>" / "<race> Racial") go to races.<race>.
//
// One entry per ability name and class: the first rank's text and cost, and
// the level of every rank. Never fails the import: a missing table or an
// unexpected layout gives a log line and the previous file stays.

const I = v => { const n = Math.trunc(Number(v)); return Number.isFinite(n) ? n : 0; };
const F = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const S = v => (v == null ? '' : String(v));
const num = v => { v = Math.abs(v); return Number.isInteger(v) ? v : Math.round(v * 100) / 100; };

/** Spec skill lines per class (classic ids). */
export const CLASS_SKILL_LINES = {
  warrior: [26, 256, 257], paladin: [594, 267, 184], hunter: [50, 163, 51],
  rogue: [253, 38, 39], priest: [613, 56, 78], shaman: [375, 373, 374],
  mage: [237, 8, 6], warlock: [355, 354, 593], druid: [574, 134, 573]
};

/** Racial skill line names → race keys (the site's ids). */
export const RACE_KEYS = {
  human: 'human', dwarf: 'dwarf', dwarven: 'dwarf', nightelf: 'nightelf', gnome: 'gnome', orc: 'orc', undead: 'undead', forsaken: 'undead',
  tauren: 'tauren', troll: 'troll', skyborne: 'skyborne'
};

/** "6 sec", "1.5 min" — how the client shows durations ("6 Sek.", "1,5 Min." in German). @param {number} ms @param {'en'|'de'} [lang] */
export const fmtDuration = (ms, lang = 'en') => {
  const s = Math.abs(ms) / 1000;
  const [sec, min] = lang === 'de' ? ['Sek.', 'Min.'] : ['sec', 'min'];
  return s >= 60 && s % 60 === 0 ? `${s / 60} ${min}` : s >= 120 ? `${num(s / 60)} ${min}` : `${num(s)} ${sec}`;
};
/** German texts: decimal commas ("1,5") in what we filled in. @param {string} text */
export const germanNumbers = text => text.replace(/(\d)\.(\d)/g, '$1,$2');

/**
 * Description text with its variables filled in, the way the client does
 * for the common ones: $s1 / $m1 (effect value, "16 to 25" with die
 * sides), $o1 (value over the whole duration), $t1 (tick interval), $d
 * (duration), $h (proc chance), $n (charges), $u (stacks), $x1 (targets),
 * $a1 (radius), $i (max targets); "$12345s1" reads another spell; ${…}
 * expressions are computed (spell power scaling as "x% of spell power"). $/1000;s1 divides, $l /
 * $g pick singular / plural words. Anything else becomes "?".
 * @param {string} text
 * @param {number} spellId
 * @param {(id: number) => { effects: Map<number, any>, durationMs?: number, aura?: any, maxTargets?: number } | undefined} get
 * @param {'en'|'de'} [lang] the text's language (German: "bis", "Sek.", "der Zaubermacht", decimal commas)
 */
export function describe(text, spellId, get, lang = 'en') {
  const de = lang === 'de';
  const TO = de ? 'bis' : 'to';
  const value = (id, kind, idx) => {
    const sp = get(id);
    if (!sp) return null;
    const e = sp.effects.get(idx - 1) || sp.effects.get(idx);
    switch (kind) {
      case 's': case 'm': {
        if (!e) return null;
        const base = F(e.EffectBasePointsF ?? e.EffectBasePoints);
        const die = I(e.EffectDieSides);
        return { v: base + (die > 0 && kind === 's' ? 1 : 0), max: die > 1 && kind === 's' ? base + die : undefined };
      }
      case 'o': {
        if (!e || !sp.durationMs || !I(e.EffectAuraPeriod)) return null;
        return { v: F(e.EffectBasePointsF ?? e.EffectBasePoints) * Math.floor(sp.durationMs / I(e.EffectAuraPeriod)) };
      }
      case 't': return e && I(e.EffectAuraPeriod) ? { v: I(e.EffectAuraPeriod) / 1000 } : null;
      case 'x': return e ? { v: I(e.EffectChainTargets) || 1 } : null;
      case 'a': return e && F(e.radius) ? { v: F(e.radius) } : null;
      case 'i': return sp.maxTargets ? { v: sp.maxTargets } : null;
      case 'd': return sp.durationMs ? { text: fmtDuration(sp.durationMs, lang) } : null;
      case 'h': return sp.aura && I(sp.aura.ProcChance) ? { v: I(sp.aura.ProcChance) } : null;
      case 'n': return sp.aura && I(sp.aura.ProcCharges) ? { v: I(sp.aura.ProcCharges) } : null;
      case 'u': return sp.aura && I(sp.aura.CumulativeAura) ? { v: I(sp.aura.CumulativeAura) } : null;
      default: return null;
    }
  };
  // ${…} expressions: variables filled in, then plain arithmetic. Forever scales most damage and
  // healing with spell power ($<power>, $<healpower>): that part becomes "398% of spell power".
  // Other $<…> factors (e.g. $<frostdamage>, a talent multiplier) count as 1.
  const expr = body => {
    let scale = '';
    const src = body
      .replace(/\$<(power|healpower)>/gi, (_, k) => { scale = k.toLowerCase(); return '100'; })
      .replace(/\$<\w+>/g, '1')
      .replace(/\$(?=[*/+-])/g, '') // stray "$" before an operator ("$m2$*…")
      .replace(/\$(\d+)?([smotxadhnui])(\d?)/gi, (all, other, kind, idx) => {
        const r = value(other ? Number(other) : spellId, kind.toLowerCase(), Number(idx || 1));
        return r && r.v != null ? `(${r.v})` : 'NaN';
      });
    if (!/^[\d.+\-*/() NaN]+$/.test(src)) return '?';
    let v;
    try { v = Function(`"use strict"; return (${src});`)(); } catch { return '?'; }
    if (typeof v !== 'number' || !Number.isFinite(v)) return '?';
    if (!scale) return String(num(v));
    if (de) return `${num(v)}% der ${scale === 'healpower' ? 'Heilkraft' : 'Zaubermacht'}`;
    return `${num(v)}% of ${scale === 'healpower' ? 'healing' : 'spell'} power`;
  };
  const out = S(text)
    .replace(/\$l([^:;]*):([^;]*);/gi, (_, one, many) => many) // singular / plural: take the plural
    .replace(/\$g([^:;]*):([^;]*);/gi, (_, male) => male)
    .replace(/\$@spellicon\d*/gi, '')
    // Talent / aura conditions "$?s17245[with][without]": the text without (a fresh character).
    .replace(/\$\?[!\w|&]+\[([^\]]*)\]\[([^\]]*)\]/g, (_, yes, no) => no)
    .replace(/\$\{([^}]*)\}/g, (_, body) => expr(body))
    .replace(/\$(?:([*/])(\d+);)?(\d+)?([smotxadhnui])(\d?)/gi, (all, op, by, other, kind, idx) => {
      const r = value(other ? Number(other) : spellId, kind.toLowerCase(), Number(idx || 1));
      if (!r) return '?';
      if (r.text) return r.text;
      const f = x => num(op === '/' ? x / Number(by) : op === '*' ? x * Number(by) : x);
      return r.max != null ? `${f(r.v)} ${TO} ${f(r.max)}` : String(f(r.v));
    })
    .replace(/\$\[[^\]]*\]/g, '')
    .replace(/\|c[0-9a-f]{8}/gi, '').replace(/\|r/g, '')
    // "18 to 18" (no die sides in Forever) -> "18"
    .replace(/(\d[\d.]*(?:% of (?:spell|healing) power|% der (?:Zaubermacht|Heilkraft))?) (?:to|bis) \1(?![\d.%])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  return de ? germanNumbers(out) : out;
}

/**
 * @param {{ build: string, table: Function, icons: Map<number, string> }} io
 * @returns {Promise<{ classes: Record<string, any[]>, races: Record<string, any[]>, de: { spells: Record<string, string>, racials: Record<string, string> } } | null>} null when the tables aren't there
 */
export async function buildSpells({ build, table, icons }) {
  const need = {
    SkillLineAbility: ['SkillLine', 'Spell', 'SupercedesSpell'],
    SpellName: ['Name_lang'],
    Spell: ['NameSubtext_lang', 'Description_lang'],
    SpellLevels: ['SpellID', 'BaseLevel'],
    SpellPower: ['SpellID', 'ManaCost', 'PowerCostPct', 'PowerType'],
    SpellMisc: ['SpellID', 'SpellIconFileDataID', 'CastingTimeIndex', 'RangeIndex', 'DurationIndex'],
    SpellCastTimes: ['Base'],
    SpellRange: ['RangeMax_0'],
    SpellCooldowns: ['SpellID', 'RecoveryTime', 'CategoryRecoveryTime'],
    SpellEffect: ['SpellID', 'EffectIndex', 'EffectBasePointsF', 'EffectAuraPeriod', 'EffectChainTargets'],
    SpellDuration: ['Duration']
  };
  const t = {};
  try {
    for (const [name, cols] of Object.entries(need)) t[name] = await table(name, build, cols);
  } catch (e) {
    console.log(`  spells: skipped (${e.message.slice(0, 160)})`);
    return null;
  }
  let auraRows = [];
  try { auraRows = await table('SpellAuraOptions', build, ['SpellID', 'ProcChance', 'ProcCharges', 'CumulativeAura']); }
  catch (e) { console.log(`  spells: SpellAuraOptions skipped (${e.message.slice(0, 120)})`); }
  // Optional: radius ($a1) and max targets ($i).
  const optional = async (name, cols, locale) => {
    try { return await table(name, build, cols, locale); } catch (e) { console.log(`  spells: ${name}${locale ? ` (${locale})` : ''} skipped (${e.message.slice(0, 120)})`); return []; }
  };
  // Optional: the German descriptions (texts-de.json, "Spieltexte: DE" on the site).
  const spellDe = new Map((await optional('Spell', ['Description_lang'], 'deDE')).map(r => [I(r.ID), S(r.Description_lang)]));
  // Optional: racial abilities — the skill lines named "Racial - Human" / "Dwarven Racial".
  const skillLines = await optional('SkillLine', ['DisplayName_lang']);
  const lineRace = new Map();
  const unknownRacial = [];
  for (const r of skillLines) {
    // "Racial - Human" or "Dwarven Racial".
    const label = S(r.DisplayName_lang).trim();
    const m = /^racial\s*[-–:]\s*(.+)$/i.exec(label) || /^(.+?)\s+racial$/i.exec(label);
    if (!m) continue;
    const key = RACE_KEYS[m[1].toLowerCase().replace(/[^a-z]/g, '')];
    if (key) lineRace.set(I(r.ID), key); else unknownRacial.push(m[1]);
  }
  if (unknownRacial.length) console.log(`  spells: racial lines without a race key: ${unknownRacial.join(', ')}`);
  {
    // Diagnostics while the racials are incomplete: every race-like skill line name.
    const hint = skillLines.filter(r => /human|dwarf|elf|gnome|orc|undead|forsaken|tauren|troll|skyborne|racial/i.test(S(r.DisplayName_lang)))
      .map(r => `${r.ID}:${S(r.DisplayName_lang)}${lineRace.has(I(r.ID)) ? '*' : ''}`).slice(0, 40);
    console.log(`  spells: race-like skill lines (* = used): ${hint.join(' | ')}`);
  }
  const radius = new Map((await optional('SpellRadius', ['Radius'])).map(r => [I(r.ID), F(r.Radius)]));
  const maxTargets = new Map((await optional('SpellTargetRestrictions', ['SpellID', 'MaxTargets'])).map(r => [I(r.SpellID), I(r.MaxTargets)]));

  const first = (rows, key = 'SpellID') => { const m = new Map(); for (const r of rows) { const k = I(r[key]); if (!m.has(k)) m.set(k, r); } return m; };
  const name = new Map(t.SpellName.map(r => [I(r.ID), S(r.Name_lang)]));
  const spell = new Map(t.Spell.map(r => [I(r.ID), r]));
  const level = first(t.SpellLevels);
  const power = first(t.SpellPower);
  const misc = first(t.SpellMisc);
  const cast = new Map(t.SpellCastTimes.map(r => [I(r.ID), I(r.Base)]));
  const range = new Map(t.SpellRange.map(r => [I(r.ID), F(r.RangeMax_0)]));
  const cooldown = first(t.SpellCooldowns);
  const duration = new Map(t.SpellDuration.map(r => [I(r.ID), I(r.Duration)]));
  const aura = first(auraRows);
  const effects = new Map();
  for (const r of t.SpellEffect) {
    const id = I(r.SpellID);
    if (!effects.has(id)) effects.set(id, new Map());
    effects.get(id).set(I(r.EffectIndex), { ...r, radius: radius.get(I(r.EffectRadiusIndex_0)) || radius.get(I(r.EffectRadiusIndex_1)) });
  }
  const get = id => {
    if (!name.has(id)) return undefined;
    const m = misc.get(id);
    const ms = m ? duration.get(I(m.DurationIndex)) : undefined;
    return { effects: effects.get(id) || new Map(), durationMs: ms && ms > 0 ? ms : undefined, aura: aura.get(id), maxTargets: maxTargets.get(id) || undefined };
  };

  const lineClass = new Map();
  for (const [cls, lines] of Object.entries(CLASS_SKILL_LINES)) for (const l of lines) lineClass.set(l, cls);

  /** German descriptions by English name; only clean ones (no "?"), else the site keeps the English text. */
  /** @type {Record<string, string>} */
  const spellsDe = {};
  /** @type {Record<string, string>} */
  const racialsDe = {};
  const deText = id => S(spellDe.get(id)).replace(/\$@spelldesc(\d+)/gi, (_, other) => S(spellDe.get(Number(other))));
  const germanDesc = (into, n, id, en) => {
    const raw = deText(id);
    if (!raw.trim() || raw === en || n in into) return;
    const d = describe(raw, id, get, 'de');
    if (!d.includes('?')) into[n] = d;
  };
  /** @type {Record<string, Map<string, any>>} */
  const byClass = {};
  /** @type {Record<string, Map<string, any>>} */
  const byRace = {};
  /** @type {Record<string, number>} */
  const racialRows = {};
  for (const r of t.SkillLineAbility) {
    const race = lineRace.get(I(r.SkillLine));
    if (!race) continue;
    const id = I(r.Spell);
    const n = name.get(id);
    const sp = spell.get(id);
    const m = misc.get(id);
    const ic = m ? icons.get(I(m.SpellIconFileDataID)) : undefined;
    racialRows[race] = (racialRows[race] || 0) + 1;
    if (!n || !sp || !ic || !S(sp.Description_lang).trim()) continue;
    const list = (byRace[race] ||= new Map());
    if (!list.has(n)) {
      const cd = cooldown.get(id);
      const cdMs = cd ? Math.max(I(cd.RecoveryTime), I(cd.CategoryRecoveryTime)) : 0;
      list.set(n, { n, ic, d: describe(S(sp.Description_lang), id, get), ...(cdMs > 1500 ? { cd: cdMs / 1000 } : {}) });
      germanDesc(racialsDe, n, id, S(sp.Description_lang));
    }
  }
  const races = Object.fromEntries(Object.entries(byRace).map(([k, v]) => [k, [...v.values()]]));
  console.log(`  spells: racial rows per race before filtering: ${JSON.stringify(racialRows)}`);
  console.log(`  spells: racials for ${Object.keys(races).length} races (${Object.entries(races).map(([k, v]) => `${k} ${v.length}`).join(', ')})`);

  for (const r of t.SkillLineAbility) {
    const cls = lineClass.get(I(r.SkillLine));
    const id = I(r.Spell);
    const n = name.get(id);
    const sp = spell.get(id);
    if (!cls || !n || !sp || !S(sp.Description_lang).trim()) continue;
    const m = misc.get(id);
    const ic = m ? icons.get(I(m.SpellIconFileDataID)) : undefined;
    if (!ic) continue; // hidden helper spells have no icon
    // 0 = no level in the client (spells the game doesn't teach, e.g. from later expansions).
    const lv = I(level.get(id)?.BaseLevel);
    const p = power.get(id);
    const pt = p ? I(p.PowerType) : 0;
    // Rage and runic power are stored in tenths.
    const cost = p ? (F(p.PowerCostPct) ? `${num(F(p.PowerCostPct))}%` : I(p.ManaCost) ? num(I(p.ManaCost) / (pt === 1 || pt === 6 ? 10 : 1)) : 0) : 0;
    const rank = { id, lv, cost, sub: S(sp.NameSubtext_lang) };
    const list = (byClass[cls] ||= new Map());
    let e = list.get(n);
    if (!e) {
      e = { n, ic, pt, ranks: [] };
      list.set(n, e);
    }
    if (!e.ranks.some(x => x.id === id)) e.ranks.push(rank);
  }

  const out = {};
  let total = 0;
  for (const [cls, list] of Object.entries(byClass)) {
    out[cls] = [...list.values()].map(e => {
      e.ranks.sort((a, b) => (a.lv || 999) - (b.lv || 999) || a.id - b.id);
      const r1 = e.ranks[0];
      const m = misc.get(r1.id);
      const cd = cooldown.get(r1.id);
      const rec = {
        n: e.n, ic: e.ic, lv: r1.lv,
        d: describe(S(spell.get(r1.id)?.Description_lang).replace(/\$@spelldesc(\d+)/gi, (_, id) => S(spell.get(Number(id))?.Description_lang)), r1.id, get)
      };
      germanDesc(spellsDe, e.n, r1.id, S(spell.get(r1.id)?.Description_lang));
      if (r1.cost) { rec.c = r1.cost; rec.pt = e.pt; }
      const castMs = m ? cast.get(I(m.CastingTimeIndex)) : 0;
      if (castMs && castMs > 0) rec.ct = castMs / 1000;
      const rng = m ? range.get(I(m.RangeIndex)) : 0;
      if (rng && rng > 5) rec.r = num(rng);
      const cdMs = cd ? Math.max(I(cd.RecoveryTime), I(cd.CategoryRecoveryTime)) : 0;
      if (cdMs > 1500) rec.cd = cdMs / 1000;
      // Levels of the ranks (only when there are several).
      const levels = [...new Set(e.ranks.map(x => x.lv).filter(Boolean))];
      if (levels.length > 1) rec.rk = levels;
      return rec;
    }).sort((a, b) => a.lv - b.lv || a.n.localeCompare(b.n));
    total += out[cls].length;
  }
  console.log(`  spells: ${total} abilities for ${Object.keys(out).length} classes`);
  // Raw texts that still have unresolved variables, to extend describe() from the log.
  const open = Object.values(out).flat().filter(x => x.d.includes('?'));
  console.log(`  spells: ${open.length} texts with unresolved variables`);
  for (const x of open.slice(0, 12)) {
    const raw = [...byClass[Object.keys(out).find(c => out[c].includes(x))].values()].find(e => e.n === x.n);
    const id = raw?.ranks[0].id;
    console.log(`    ${x.n} (${id}): ${S(spell.get(id)?.Description_lang).slice(0, 220)} | effects ${JSON.stringify([...(effects.get(id)?.values() || [])].map(r => [r.EffectIndex, r.EffectBasePointsF, r.EffectAuraPeriod]))}`);
  }
  if (total < 100) { console.log('  spells: too few abilities, keeping the previous file'); return null; }
  console.log(`  spells: German descriptions for ${Object.keys(spellsDe).length} abilities, ${Object.keys(racialsDe).length} racials`);
  return { classes: out, races, de: { spells: spellsDe, racials: racialsDe } };
}
