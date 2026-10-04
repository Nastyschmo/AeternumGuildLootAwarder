// BiS-Planer: talents in the stat totals ("Werte").
//
// Only talents with a fixed, always-on effect on the shown stats count:
// % to a stat, health, mana or armor from items, crit / hit / dodge /
// parry / block chance, and "X% of your Intellect / Spirit as attack power /
// spell damage / armor". Talents that depend on a form, weapon type, spell
// school, single ability or a proc are left out. The value is read from
// the talent's text at the set's rank (the n-th "%" number), so it follows
// Forever's tuning without a second table of numbers.

/**
 * 'Class|Talent' -> effects: [kind, index of the "%" number in the text].
 * @type {Record<string, [string, number][]>}
 */
const BIS_TALENT_STATS = {
  'Warrior|Deflection': [['parry', 0]],
  'Warrior|Cruelty': [['meleeCrit', 0]],
  'Warrior|Precision': [['hit', 0]],
  'Warrior|Shield Specialization': [['block', 0]],
  'Warrior|Toughness': [['armorItems', 0]],
  'Paladin|Divine Strength': [['str', 0]],
  'Paladin|Divine Intellect': [['int', 0]],
  'Paladin|Holy Power': [['spellCrit', 1]],
  'Paladin|Toughness': [['armorItems', 0]],
  'Paladin|Precision': [['hit', 0]],
  'Paladin|Sacred Duty': [['sta', 0]],
  'Paladin|Deflection': [['parry', 0]],
  'Paladin|Conviction': [['meleeCrit', 0]],
  'Paladin|Champion of the Light': [['dmgFromInt', 0]],
  'Hunter|Lethal Attacks': [['meleeCrit', 0]],
  'Hunter|Careful Aim': [['apFromInt', 0]],
  'Hunter|Deflection': [['parry', 0]],
  'Hunter|Survivalist': [['hp', 0]],
  'Hunter|Surefooted': [['hit', 0]],
  'Hunter|Lightning Reflexes': [['agi', 0]],
  'Rogue|Malice': [['meleeCrit', 0]],
  'Rogue|Lightning Reflexes': [['dodge', 0]],
  'Rogue|Deflection': [['parry', 0]],
  'Rogue|Precision': [['hit', 0]],
  'Priest|Mental Strength': [['int', 0]],
  'Priest|Spiritual Guidance': [['healFromSpi', 0], ['dmgFromSpi', 1]],
  'Shaman|Thundering Strikes': [['meleeCrit', 0], ['spellCrit', 0]],
  'Shaman|Ancestral Knowledge': [['int', 0]],
  'Shaman|Mental Dexterity': [['apFromInt', 0]],
  'Shaman|Anticipation': [['dodge', 0]],
  'Shaman|Toughness': [['sta', 0]],
  'Shaman|Mental Quickness': [['dmgFromInt', 0], ['healFromInt', 0]],
  'Shaman|Tidal Focus': [['hit', 1]],
  'Shaman|Improved Reincarnation': [['hp', 0]],
  'Mage|Arcane Resilience': [['armorFromInt', 0]],
  'Mage|Arcane Mind': [['int', 0]],
  'Mage|Arcane Instability': [['spellCrit', 1]],
  'Warlock|Suppression': [['hit', 0]],
  'Warlock|Demonic Embrace': [['sta', 0]],
  'Warlock|Fel Vitality': [['mana', 1]],
  'Druid|Nature\'s Majesty': [['meleeCrit', 0], ['spellCrit', 0]],
  'Druid|Nature\'s Reach': [['hit', 1]],
  'Druid|Heart of the Wild': [['int', 0]],
  'Druid|Feral Swiftness': [['dodge', 1]],
  'Druid|Natural Reaction': [['dodge', 0]],
  'Druid|Living Spirit': [['spi', 0]]
};
/** German label per kind, for the list under the stats ("+5 % Krit"). */
const BIS_TALENT_KIND_LABELS = {
  str: '% Stärke', agi: '% Beweglichkeit', sta: '% Ausdauer', int: '% Intelligenz', spi: '% Willenskraft',
  hp: '% Gesundheit', mana: '% Mana', armorItems: '% Rüstung (Items)',
  meleeCrit: '% Krit (Nahkampf)', spellCrit: '% Krit (Zauber)', hit: '% Treffer',
  dodge: '% Ausweichen', parry: '% Parieren', block: '% Blocken',
  apFromInt: '% der Int als Angriffskraft', dmgFromInt: '% der Int als Zauberschaden', healFromInt: '% der Int als Heilung',
  dmgFromSpi: '% der Willenskraft als Zauberschaden', healFromSpi: '% der Willenskraft als Heilung',
  armorFromInt: '% der Int als Rüstung'
};

/**
 * Summed talent effects of a build (percent values), plus the talents that
 * counted for the list under the stats.
 * @param {BisBuild} b
 * @returns {{ pct: Record<string, number>, applied: { name: string, rank: number, text: string }[] }}
 */
function bisTalentEffects(b){
  /** @type {Record<string, number>} */
  const pct = {};
  const applied = [];
  const cls = bisTalentClass(b.classId);
  const data = typeof TALENT_DATA !== 'undefined' && TALENT_DATA[cls];
  if (!data || !b.talents) return { pct, applied };
  b.talents.forEach((tree, i) => {
    for (const [name, rank] of Object.entries(tree || {})) {
      const effects = BIS_TALENT_STATS[`${cls}|${name}`];
      const t = effects && data.trees[i] && data.trees[i].talents.find(x => x.name === name);
      const desc = t && t.desc && t.desc[rank - 1];
      if (!desc) continue;
      const nums = [...desc.matchAll(/(\d+(?:\.\d+)?)%/g)].map(m => Number(m[1]));
      const parts = [];
      for (const [kind, idx] of effects) {
        const v = nums[idx];
        if (!v) continue;
        pct[kind] = (pct[kind] || 0) + v;
        parts.push(`+${v.toLocaleString('de-DE')} ${BIS_TALENT_KIND_LABELS[kind]}`);
      }
      if (parts.length) applied.push({ name, rank, text: parts.join(', ') });
    }
  });
  return { pct, applied };
}
