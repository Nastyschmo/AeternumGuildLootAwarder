// Enchantments for the BiS planner, from the Forever client (wago.tools
// DB2 exports), written to data/forever/enchants.json by update.mjs.
//
//  - SpellEffect Effect 53 (ENCHANT_ITEM): a spell that puts a
//    SpellItemEnchantment (EffectMiscValue_0) on an item. The enchant's
//    Name_lang is its effect ("Intellect +$k1"; $kN = EffectPointsMin_{N-1}).
//  - SpellEquippedItems: what it can go on — item class 2 (weapon, by
//    subclass bitmask) or 4 (armor, by inventory-type bitmask, else by
//    subclass bitmask, e.g. shields).
//  - Source: a profession spell (SkillLineAbility: Enchanting, Engineering
//    scopes …; skill and recipe item like in crafting.mjs), or an item
//    whose on-use effect casts it (ItemEffect TriggerType 0: armor kits,
//    librams, scopes, ZG/AQ items …) with that item's QuestieDB sources.

const ENCHANT_ITEM = 24 + 29; // SpellEffect.Effect 53
const APPLY_AURA = 6;
// SpellItemEnchantment effect types.
const ENCH_EQUIP_SPELL = 3, ENCH_RESISTANCE = 4, ENCH_STAT = 5;
// Resistance school (EffectArg of type 4 / bit of aura 22's mask) -> item stat id.
const RESIST_STAT = { 0: 50, 1: 53, 2: 51, 3: 55, 4: 52, 5: 54, 6: 56 };
// Aura 29 (MOD_STAT) misc value -> item stat id; -1 = all five.
const AURA_STAT = { 0: 4, 1: 3, 2: 7, 3: 5, 4: 6 };
// Item stat ids the planner knows (BIS_STAT_LABELS); others are dropped.
const KNOWN_STATS = new Set([0, 1, 3, 4, 5, 6, 7, 12, 13, 14, 15, 31, 32, 36, 37, 38, 39, 41, 42, 43, 45, 46, 47, 48, 50, 51, 52, 53, 54, 55, 56]);
const ON_USE = 0, LEARN_ON_USE = 6;
const TRAINER_GAP = 20;

const I = v => { const n = Math.trunc(Number(v)); return Number.isFinite(n) ? n : 0; };

/**
 * Flat stats an enchant gives, as [item stat id, value] like ForeverItem.s:
 * stat effects (type 5, arg = item stat id), armor / resistances (type 4)
 * and equip spells (type 3) whose auras are plain stat bonuses — primary
 * stats, attack power, spell damage (all schools), healing, mana per 5,
 * health, armor and resistances. Procs, crit/hit chance auras and weapon
 * damage are left out (the planner doesn't model them).
 */
function enchantStats(ench, auraEffectsOf) {
  const out = new Map();
  const add = (stat, v) => { if (stat && v) out.set(stat, (out.get(stat) || 0) + v); };
  for (let i = 0; i < 3; i++) {
    const type = I(ench[`Effect_${i}`]), arg = I(ench[`EffectArg_${i}`]), v = I(ench[`EffectPointsMin_${i}`]);
    if (type === ENCH_STAT) add(arg, v);
    else if (type === ENCH_RESISTANCE) add(RESIST_STAT[arg], v);
    else if (type === ENCH_EQUIP_SPELL) {
      for (const fx of auraEffectsOf.get(arg) || []) {
        const aura = I(fx.EffectAura), misc = I(fx.EffectMiscValue_0), pts = Math.round(Number(fx.EffectBasePointsF) || 0);
        if (aura === 29) { if (misc === -1) for (const st of Object.values(AURA_STAT)) add(st, pts); else add(AURA_STAT[misc], pts); }
        else if (aura === 99) add(38, pts);          // MOD_ATTACK_POWER
        else if (aura === 124) add(39, pts);         // MOD_RANGED_ATTACK_POWER
        else if (aura === 13 && (misc & 126) === 126) add(42, pts); // MOD_DAMAGE_DONE, all magic schools
        else if (aura === 135) add(41, pts);         // MOD_HEALING_DONE
        else if (aura === 85 && misc === 0) add(43, pts); // MOD_POWER_REGEN (mana per 5)
        else if (aura === 34) add(1, pts);           // MOD_INCREASE_HEALTH
        else if (aura === 30 && misc === 95) add(12, pts); // MOD_SKILL Defense
        else if (aura === 22) for (const [bit, st] of Object.entries(RESIST_STAT)) { if (misc & (1 << Number(bit))) add(st, pts); }
      }
    }
  }
  return [...out].filter(([st, v]) => v > 0 && KNOWN_STATS.has(st));
}

/**
 * @param {{ build: string, table: Function, sparse: Map<number, any>, eraSparse: Map<number, any>, sources: Map<number, any>, itemName: (id: number) => string | undefined, icons: Map<number, string>, professions: Record<string, string> }} io
 */
export async function buildEnchants({ build, table, sparse, eraSparse, sources, itemName, icons }) {
  const effects = await table('SpellEffect', build, ['Effect', 'EffectAura', 'EffectBasePointsF', 'EffectMiscValue_0', 'SpellID']);
  const enchants = await table('SpellItemEnchantment', build, ['Name_lang', 'Effect_0', 'EffectPointsMin_0', 'EffectArg_0']);
  const equipped = await table('SpellEquippedItems', build, ['SpellID', 'EquippedItemClass', 'EquippedItemInvTypes', 'EquippedItemSubclass']);
  const names = await table('SpellName', build, ['Name_lang']);
  const abilities = await table('SkillLineAbility', build, ['SkillLine', 'Spell', 'MinSkillLineRank', 'TrivialSkillLineRankLow']);
  const skillLines = await table('SkillLine', build, ['DisplayName_lang']);
  const itemEffects = await table('ItemEffect', build, ['TriggerType', 'SpellID']);
  const itemXEffects = await table('ItemXItemEffect', build, ['ItemEffectID', 'ItemID']);
  const items = await table('Item', build, ['IconFileDataID']);

  const enchantById = new Map(enchants.map(r => [I(r.ID), r]));
  const equippedOf = new Map(equipped.map(r => [I(r.SpellID), r]));
  const spellName = new Map(names.map(r => [I(r.ID), r.Name_lang]));
  const abilityOf = new Map(abilities.map(a => [I(a.Spell), a]));
  const professions = new Map(skillLines.map(s => [I(s.ID), s.DisplayName_lang]));
  const itemIcon = new Map(items.map(r => [I(r.ID), icons.get(I(r.IconFileDataID))]));
  const effectById = new Map(itemEffects.map(e => [I(e.ID), e]));
  /** spell -> item ids, per trigger type */
  const itemsBySpell = { [ON_USE]: new Map(), [LEARN_ON_USE]: new Map() };
  for (const x of itemXEffects) {
    const e = effectById.get(I(x.ItemEffectID));
    if (!e || !(I(e.TriggerType) in itemsBySpell)) continue;
    const m = itemsBySpell[I(e.TriggerType)], spell = I(e.SpellID);
    if (!m.has(spell)) m.set(spell, []);
    m.get(spell).push(I(x.ItemID));
  }
  const rowOf = id => sparse.get(id) || eraSparse.get(id);
  const auraEffectsOf = new Map();
  for (const fx of effects) {
    if (I(fx.Effect) !== APPLY_AURA) continue;
    const spell = I(fx.SpellID);
    if (!auraEffectsOf.has(spell)) auraEffectsOf.set(spell, []);
    auraEffectsOf.get(spell).push(fx);
  }
  const statsOf = ench => enchantStats(ench, auraEffectsOf);

  const out = [];
  const seen = new Set();
  for (const fx of effects) {
    if (I(fx.Effect) !== ENCHANT_ITEM) continue;
    const spell = I(fx.SpellID), ench = enchantById.get(I(fx.EffectMiscValue_0));
    const eq = equippedOf.get(spell);
    if (!ench || !eq || seen.has(spell)) continue;
    const title = spellName.get(spell) || '';
    if (/^(QA|Test|Deprecated)\b|\bTEST\b/i.test(title)) continue;
    // "Intellect +$k1" -> "Intellect +5"
    const effect = String(ench.Name_lang || '').replace(/\$k(\d)/g, (m, n) => String(Math.abs(I(ench[`EffectPointsMin_${I(n) - 1}`]))));
    if (!effect || /\$/.test(effect)) continue;

    const rec = { id: spell, e: effect, ic: I(eq.EquippedItemClass) };
    const st = statsOf(ench); if (st.length) rec.st = st;
    const inv = I(eq.EquippedItemInvTypes), sub = I(eq.EquippedItemSubclass);
    if (inv) rec.inv = inv;
    if (sub) rec.sub = sub;
    if (rec.ic !== 2 && rec.ic !== 4) continue;

    const ability = abilityOf.get(spell);
    const useItems = (itemsBySpell[ON_USE].get(spell) || []).filter(id => rowOf(id));
    if (ability && professions.get(I(ability.SkillLine))) {
      rec.n = title;
      const craft = { p: I(ability.SkillLine) };
      const recipe = (itemsBySpell[LEARN_ON_USE].get(spell) || []).map(id => ({ id, row: rowOf(id) })).find(r => r.row && I(r.row.RequiredSkillRank) > 0);
      if (recipe) {
        craft.r = I(recipe.row.RequiredSkillRank);
        craft.rec = { id: recipe.id, n: recipe.row.Display_lang };
        const src = sources.get(recipe.id); if (src) craft.rec.src = src;
      } else if (I(ability.MinSkillLineRank) > 1) craft.r = I(ability.MinSkillLineRank);
      else { craft.r = Math.max(1, I(ability.TrivialSkillLineRankLow) - TRAINER_GAP); craft.e = 1; }
      rec.craft = craft;
    } else if (useItems.length) {
      const id = useItems[0];
      rec.n = rowOf(id).Display_lang || itemName(id) || title;
      rec.item = { id, n: rec.n };
      const icon = itemIcon.get(id); if (icon) rec.icon = icon;
      const src = sources.get(id); if (src) rec.item.src = src;
    } else continue; // NPC / quest-only spells nobody can cast
    seen.add(spell);
    out.push(rec);
  }
  out.sort((a, z) => a.n.localeCompare(z.n));
  const byProf = out.filter(e => e.craft).length;
  console.log(`  enchants: ${out.length} (${byProf} from professions, ${out.length - byProf} from items)`);
  return out;
}
