// BiS-Planer, step 4: an enchantment per slot, with its own tick.
//
// Data: data/forever/enchants.json (scripts/forever-data/enchants.mjs) —
// every enchant spell with its effect text, the items it fits (weapon
// subclass mask, armor inventory-type or subclass mask) and its source
// (profession + skill + recipe, or the on-use item and where it drops).
// The draft keeps the choice as slots[key].enchantId; a saved set as
// enchants: { slotKey: spellId }. "verzaubert" belongs to item + enchant
// (one tick counts in every set, like "Habe ich") and is stored next to
// the owned items: bisOwned/<uid>/e<itemId>_<enchantId> = true. Enchants
// are not added to the stat totals: most work through spell auras the
// planner doesn't model.

const BIS_ENCHANTED_KEY = 'rude-bis-enchanted-v1';
/** "itemId_enchantId" pairs ticked as enchanted. */
let bisEnchanted = bisLoadLocalEnchanted();

/** @returns {Set<string>} */
function bisLoadLocalEnchanted(){
  try {
    const v = JSON.parse(localStorage.getItem(BIS_ENCHANTED_KEY) || '[]');
    return new Set(Array.isArray(v) ? v.filter(x => typeof x === 'string' && /^\d+_\d+$/.test(x)) : []);
  } catch (e){ return new Set(); }
}
function bisSaveLocalEnchanted(){
  try { localStorage.setItem(BIS_ENCHANTED_KEY, JSON.stringify([...bisEnchanted])); } catch (e){ /* private mode */ }
}
/** @param {number} itemId @param {number} enchantId */
function bisIsEnchanted(itemId, enchantId){
  return bisEnchanted.has(itemId + '_' + enchantId);
}
/** @param {number} itemId @param {number} enchantId @param {boolean} on */
function bisSetEnchanted(itemId, enchantId, on){
  const key = itemId + '_' + enchantId;
  if (on) bisEnchanted.add(key); else bisEnchanted.delete(key);
  bisSaveLocalEnchanted();
  if (db && bisSyncUid){
    db.ref(`${DB_PATH}/bisOwned/${bisSyncUid}/e${key}`).set(on ? true : null)
      .catch(() => { bisSetStatus = 'Konnte „verzaubert“ nicht speichern.'; renderBisPlanner(); });
  }
}

/** @type {Map<number, ForeverEnchant> | null} */
let bisEnchantIndex = null;
/** @param {number} id @returns {ForeverEnchant | undefined} */
function bisEnchantById(id){
  if (!bisEnchantIndex) bisEnchantIndex = new Map(((bisData && bisData.enchants) || []).map(e => [e.id, e]));
  return bisEnchantIndex.get(id);
}
/** Enchants that fit this item. @param {ForeverItem} item @returns {ForeverEnchant[]} */
function bisEnchantsFor(item){
  if (!item || !bisData || !bisData.enchants) return [];
  return bisData.enchants.filter(e => e.ic === item.c && (e.inv ? ((e.inv >>> item.it) & 1) === 1 : e.sub ? ((e.sub >>> item.sc) & 1) === 1 : true));
}
/** Where an enchant comes from, one line. @param {ForeverEnchant} e */
function bisEnchantSourceLine(e){
  if (e.craft){
    const c = e.craft;
    let line = `${bisProfessionName(c.p)} ${c.e ? 'ca. ' : ''}${c.r}`;
    if (c.rec){
      const rs = c.rec.src ? bisSourceLines(/** @type {ForeverItem} */ ({ src: c.rec.src })) : [];
      line += ` · Rezept: ${c.rec.n}${rs.length ? ' — ' + rs.join('; ') : ''}`;
    } else line += ' · beim Lehrer';
    return line;
  }
  if (e.item){
    const rs = e.item.src ? bisSourceLines(/** @type {ForeverItem} */ ({ src: e.item.src })) : [];
    return `Item: ${e.item.n}${rs.length ? ' — ' + rs.join('; ') : ' — Quelle unbekannt'}`;
  }
  return '';
}
/** Option label: "Enchant Chest - Major Health (+100 Health)". @param {ForeverEnchant} e */
function bisEnchantLabel(e){
  return e.n.toLowerCase().includes(e.e.toLowerCase()) ? e.n : `${e.n} (${e.e})`;
}

/** The enchant line inside a slot row. @param {string} slotKey @param {ForeverItem} item */
function bisEnchantRowHtml(slotKey, item){
  const options = bisEnchantsFor(item);
  if (!options.length) return '';
  const sel = bisDraft.slots[slotKey];
  const chosen = sel && sel.enchantId ? bisEnchantById(sel.enchantId) : null;
  const byProf = options.filter(e => e.craft), byItem = options.filter(e => e.item);
  const opt = e => `<option value="${e.id}" ${chosen && chosen.id === e.id ? 'selected' : ''}>${escapeHtml(bisEnchantLabel(e))}${e.craft ? ` · ${escapeHtml(bisProfessionName(e.craft.p))} ${e.craft.r}` : ''}</option>`;
  const done = Boolean(chosen && bisIsEnchanted(item.id, chosen.id));
  return `<div class="bis-ench${done ? ' bis-ench-done' : ''}">
    <span class="bis-ench-label">Verzauberung</span>
    <select data-bis-enchant="${slotKey}" aria-label="Verzauberung">
      <option value="">— keine —</option>
      ${byProf.length ? `<optgroup label="Berufe">${byProf.map(opt).join('')}</optgroup>` : ''}
      ${byItem.length ? `<optgroup label="Items">${byItem.map(opt).join('')}</optgroup>` : ''}
    </select>
    ${chosen ? `<label class="bis-done" title="Gilt für dieses Item mit dieser Verzauberung in all Deinen Sets"><input type="checkbox" data-bis-enchanted="${item.id}_${chosen.id}" ${done ? 'checked' : ''}> verzaubert</label>
      <span class="bis-ench-src">${escapeHtml(chosen.e)} · ${escapeHtml(bisEnchantSourceLine(chosen))}</span>` : ''}
  </div>`;
}

/** Open enchant tasks for the farm list. @returns {{ total: number, done: number, html: string }} */
function bisEnchantFarm(){
  let total = 0, done = 0;
  const rows = [];
  for (const s of BIS_SLOTS){
    const sel = bisDraft.slots[s.key];
    const item = sel && bisData.byId.get(sel.itemId);
    const e = sel && sel.enchantId ? bisEnchantById(sel.enchantId) : null;
    if (!item || !e || (s.key === 'offhand' && bisOffhandBlocked(bisDraft))) continue;
    total++;
    if (bisIsEnchanted(item.id, e.id)){ done++; continue; }
    rows.push(`<li><label><input type="checkbox" data-bis-enchanted="${item.id}_${e.id}"> <strong>${escapeHtml(s.label)}:</strong> ${escapeHtml(bisEnchantLabel(e))}</label><div class="bis-farm-src">${escapeHtml(bisEnchantSourceLine(e))}</div></li>`);
  }
  if (!total) return { total, done, html: '' };
  return {
    total, done,
    html: `<h4 class="bis-farm-group">Verzauberungen <span class="bis-item-meta">${done}/${total}</span></h4>${rows.length ? `<ul class="bis-farm-list">${rows.join('')}</ul>` : '<p class="bis-hint">Alle gewählten Verzauberungen erledigt.</p>'}`
  };
}

/** @param {HTMLElement} root */
function bisWireEnchants(root){
  root.querySelectorAll('[data-bis-enchant]').forEach((/** @type {HTMLSelectElement} */ sel) => sel.addEventListener('change', () => {
    const slot = bisDraft.slots[sel.getAttribute('data-bis-enchant')];
    if (!slot) return;
    if (sel.value) slot.enchantId = Number(sel.value); else delete slot.enchantId;
    bisSaveDraft();
    renderBisPlanner();
  }));
  root.querySelectorAll('[data-bis-enchanted]').forEach((/** @type {HTMLInputElement} */ cb) => cb.addEventListener('change', () => {
    const [itemId, enchantId] = cb.getAttribute('data-bis-enchanted').split('_').map(Number);
    bisSetEnchanted(itemId, enchantId, cb.checked);
    renderBisPlanner();
  }));
}

/** Drop a chosen enchant that no longer fits the slot's item (after picking another item). @param {string} slotKey */
function bisValidateEnchant(slotKey){
  const sel = bisDraft.slots[slotKey];
  if (!sel || !sel.enchantId) return;
  const item = bisData.byId.get(sel.itemId);
  if (!item || !bisEnchantsFor(item).some(e => e.id === sel.enchantId)) delete sel.enchantId;
}
