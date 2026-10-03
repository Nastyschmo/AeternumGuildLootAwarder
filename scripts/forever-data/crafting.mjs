// Crafted gear for data/forever/items.json, from the Forever client
// (wago.tools DB2 exports):
//
//  - SpellEffect: a "create item" effect (Effect 24) links a craft spell to
//    the item it makes.
//  - SkillLineAbility: which profession (SkillLine) the spell belongs to.
//  - ItemEffect / ItemXItemEffect: a recipe item ("Plans: …", "Pattern: …")
//    teaches the spell with an on-learn effect (TriggerType 6). The recipe's
//    ItemSparse row holds the exact skill needed (RequiredSkillRank); where
//    it comes from is looked up in the QuestieDB sources like any item.
//  - Spells learned at a trainer have no recipe item, and the trainer's
//    skill requirement is server-side. Then MinSkillLineRank is used when
//    set, else the rank where the recipe turns yellow minus 20 — the most
//    common gap for recipe items — flagged as an estimate (`e`).

const CREATE_ITEM = 24;
const LEARN_ON_USE = 6;
const TRAINER_GAP = 20;

const I = v => { const n = Math.trunc(Number(v)); return Number.isFinite(n) ? n : 0; };

/**
 * @param {{ build: string, table: Function, gearIds: Set<number>, sparse: Map<number, any>, eraSparse: Map<number, any>, sources: Map<number, any> }} io
 * @returns {Promise<{ craftOf: Map<number, any>, professions: Record<string, string> }>}
 */
export async function buildCrafting({ build, table, gearIds, sparse, eraSparse, sources }) {
  const effects = await table('SpellEffect', build, ['Effect', 'EffectItemType', 'SpellID']);
  const abilities = await table('SkillLineAbility', build, ['SkillLine', 'Spell', 'MinSkillLineRank', 'TrivialSkillLineRankLow']);
  const skillLines = await table('SkillLine', build, ['DisplayName_lang']);
  const itemEffects = await table('ItemEffect', build, ['TriggerType', 'SpellID']);
  const itemXEffects = await table('ItemXItemEffect', build, ['ItemEffectID', 'ItemID']);

  const abilityOf = new Map(abilities.map(a => [I(a.Spell), a]));
  // Professions only (SkillLine category 11 primary, 9 secondary) — class
  // skill lines like Arcane or Demonology also own item-creating spells.
  const PROFESSION_CATEGORIES = new Set([9, 11]);
  const skillName = new Map(skillLines
    .filter(s => !('CategoryID' in s) || PROFESSION_CATEGORIES.has(I(s.CategoryID)))
    .map(s => [I(s.ID), s.DisplayName_lang]));

  // craft spell -> recipe item ids
  const effectById = new Map(itemEffects.map(e => [I(e.ID), e]));
  const recipesOf = new Map();
  for (const x of itemXEffects) {
    const e = effectById.get(I(x.ItemEffectID));
    if (!e || I(e.TriggerType) !== LEARN_ON_USE) continue;
    const spell = I(e.SpellID);
    if (!recipesOf.has(spell)) recipesOf.set(spell, []);
    recipesOf.get(spell).push(I(x.ItemID));
  }

  const craftOf = new Map();
  const professions = {};
  for (const fx of effects) {
    if (I(fx.Effect) !== CREATE_ITEM) continue;
    const itemId = I(fx.EffectItemType), spell = I(fx.SpellID);
    if (!gearIds.has(itemId)) continue;
    const ability = abilityOf.get(spell);
    if (!ability) continue; // not a profession spell (NPC / quest spells)
    const p = I(ability.SkillLine);
    if (!skillName.get(p)) continue;

    // Prefer a recipe item we have a row for, and among those one with known sources.
    const recipes = (recipesOf.get(spell) || [])
      .map(id => ({ id, row: sparse.get(id) || eraSparse.get(id) }))
      .filter(r => r.row && r.row.Display_lang)
      .sort((a, b) => Number(Boolean(sources.get(b.id))) - Number(Boolean(sources.get(a.id))) || a.id - b.id);
    const craft = { p };
    const recipe = recipes[0];
    if (recipe && I(recipe.row.RequiredSkillRank) > 0) {
      craft.r = I(recipe.row.RequiredSkillRank);
      craft.rec = { id: recipe.id, n: recipe.row.Display_lang };
      const b = I(recipe.row.Bonding); if (b) craft.rec.b = b;
      const src = sources.get(recipe.id); if (src) craft.rec.src = src;
    } else if (I(ability.MinSkillLineRank) > 1) {
      craft.r = I(ability.MinSkillLineRank);
    } else {
      craft.r = Math.max(1, I(ability.TrivialSkillLineRankLow) - TRAINER_GAP);
      craft.e = 1;
    }
    // Several spells can make the same item: keep the easiest one.
    const prev = craftOf.get(itemId);
    if (!prev || craft.r < prev.r) craftOf.set(itemId, craft);
    professions[p] = skillName.get(p);
  }
  return { craftOf, professions };
}
