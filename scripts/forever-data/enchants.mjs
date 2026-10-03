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
const ON_USE = 0, LEARN_ON_USE = 6;
const TRAINER_GAP = 20;

const I = v => { const n = Math.trunc(Number(v)); return Number.isFinite(n) ? n : 0; };

/**
 * @param {{ build: string, table: Function, sparse: Map<number, any>, eraSparse: Map<number, any>, sources: Map<number, any>, itemName: (id: number) => string | undefined, icons: Map<number, string>, professions: Record<string, string> }} io
 */
export async function buildEnchants({ build, table, sparse, eraSparse, sources, itemName, icons }) {
  const effects = await table('SpellEffect', build, ['Effect', 'EffectMiscValue_0', 'SpellID']);
  const enchants = await table('SpellItemEnchantment', build, ['Name_lang', 'EffectPointsMin_0']);
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
