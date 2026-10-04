// WoW-style item tooltip on hover, for every element with a
// data-item-id attribute (BiS planner, picker, set browser, Gildenbedarf,
// soft-reserves). Laid out like the German game client: name, binding,
// slot / type, damage, armor, white base stats, required level, green
// "Anlegen:" lines, set pieces; below that the item level and where it
// comes from. Data: data/forever/items.json (bisData, loaded by
// bisLoadData) — equip effects that aren't plain stats (procs, "Use:")
// aren't in the data, so they can't be shown.

const ITEM_TIP_SLOTS = {
  1: 'Kopf', 2: 'Hals', 3: 'Schulter', 4: 'Hemd', 5: 'Brust', 6: 'Taille', 7: 'Beine', 8: 'Füße',
  9: 'Handgelenke', 10: 'Hände', 11: 'Finger', 12: 'Schmuck', 13: 'Einhändig', 14: 'Schildhand',
  15: 'Distanz', 16: 'Rücken', 17: 'Zweihändig', 18: 'Tasche', 19: 'Wappenrock', 20: 'Brust',
  21: 'Waffenhand', 22: 'Schildhand', 23: 'In Schildhand geführt', 25: 'Wurfwaffe', 26: 'Distanz', 28: 'Relikt'
};
const ITEM_TIP_WEAPONS = {
  0: 'Axt', 1: 'Axt', 2: 'Bogen', 3: 'Schusswaffe', 4: 'Streitkolben', 5: 'Streitkolben', 6: 'Stangenwaffe',
  7: 'Schwert', 8: 'Schwert', 10: 'Stab', 13: 'Faustwaffe', 15: 'Dolch', 16: 'Wurfwaffe', 18: 'Armbrust',
  19: 'Zauberstab', 20: 'Angelrute'
};
const ITEM_TIP_BIND = { 1: 'Wird beim Aufheben gebunden', 2: 'Wird beim Anlegen gebunden', 3: 'Wird bei Benutzung gebunden', 4: 'Questgegenstand' };
/** White stats: "+18 Stärke", in the game's order. */
const ITEM_TIP_BASE = {
  0: 'Mana', 1: 'Gesundheit', 4: 'Stärke', 3: 'Beweglichkeit', 7: 'Ausdauer', 5: 'Intelligenz', 6: 'Willenskraft',
  51: 'Feuerwiderstand', 52: 'Frostwiderstand', 53: 'Heiligwiderstand', 54: 'Schattenwiderstand',
  55: 'Naturwiderstand', 56: 'Arkanwiderstand'
};
/** Green "Anlegen:" lines, {v} = value. */
const ITEM_TIP_EQUIP = {
  12: 'Erhöht Eure Verteidigungswertung um {v}.',
  13: 'Erhöht Eure Ausweichwertung um {v}.',
  14: 'Erhöht Eure Parierwertung um {v}.',
  15: 'Erhöht Eure Blockwertung um {v}.',
  31: 'Erhöht Eure Trefferwertung um {v}.',
  32: 'Erhöht Eure kritische Trefferwertung um {v}.',
  36: 'Erhöht Eure Tempowertung um {v}.',
  37: 'Erhöht Eure Waffenkundewertung um {v}.',
  38: '+{v} Angriffskraft.',
  39: '+{v} Distanzangriffskraft.',
  41: 'Erhöht durch Zauber und Effekte verursachte Heilung um bis zu {v}.',
  42: 'Erhöht durch Zauber und magische Effekte zugefügten Schaden um bis zu {v}.',
  43: 'Stellt alle 5 Sek. {v} Mana wieder her.',
  45: 'Erhöht durch Zauber und magische Effekte zugefügten Schaden und Heilung um bis zu {v}.',
  46: 'Stellt alle 5 Sek. {v} Gesundheit wieder her.',
  47: 'Verringert die Magiewiderstände der Ziele Eurer Zauber um {v}.',
  48: 'Erhöht den Blockwert Eures Schildes um {v}.'
};

let itemTipEl = /** @type {HTMLElement | null} */ (null);
let itemTipFor = /** @type {Element | null} */ (null);

/** Set pieces (one per name), for the set block. @param {number} setId */
function itemTipSetPieces(setId){
  const seen = new Map();
  for (const it of bisData.items.items) if (it.set === setId && !seen.has(it.n)) seen.set(it.n, it);
  // Paper-doll order: head, shoulders, chest, … (BIS_SLOTS).
  const slotIdx = it => { const i = BIS_SLOTS.findIndex(sl => sl.inv.includes(it.it)); return i < 0 ? 99 : i; };
  return [...seen.values()].sort((a, z) => slotIdx(a) - slotIdx(z) || a.n.localeCompare(z.n));
}

/** Tooltip HTML for an item. @param {ForeverItem} item */
function itemTipHtml(item){
  const line = (html, cls) => `<div class="item-tip-line${cls ? ' ' + cls : ''}">${html}</div>`;
  const row = (left, right) => `<div class="item-tip-row"><span>${left}</span><span>${right}</span></div>`;
  const de = n => n.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  const out = [`<div class="item-tip-name" style="color:${bisQualityColor(item)}">${escapeHtml(item.n)}</div>`];
  if (ITEM_TIP_BIND[item.b]) out.push(line(ITEM_TIP_BIND[item.b]));
  const slot = ITEM_TIP_SLOTS[item.it] || '';
  const type = item.c === 2 ? (ITEM_TIP_WEAPONS[item.sc] || '') : item.c === 4 ? (BIS_ARMOR_TYPES[item.sc] || '') : '';
  if (slot || type) out.push(row(escapeHtml(slot), escapeHtml(type)));
  if (item.dm){
    out.push(row(`${item.dm.min} - ${item.dm.max} Schaden`, `Tempo ${item.dm.speed.toLocaleString('de-DE', { minimumFractionDigits: 2 })}`));
    out.push(line(`(${de(item.dm.dps)} Schaden pro Sekunde)`));
  }
  const stats = item.s || [];
  const bonusArmor = stats.filter(([st]) => st === 50).reduce((sum, [, v]) => sum + v, 0);
  if (item.ar || bonusArmor) out.push(line(`${(item.ar || 0) + bonusArmor} Rüstung`, bonusArmor ? 'item-tip-green' : ''));
  // Object keys are sorted numerically, so the game's order is spelled out.
  const order = [0, 1, 4, 3, 7, 5, 6, 51, 52, 53, 54, 55, 56];
  const base = stats.filter(([st]) => ITEM_TIP_BASE[st]).sort((a, z) => order.indexOf(a[0]) - order.indexOf(z[0]));
  for (const [st, v] of base) out.push(line(`${v > 0 ? '+' : ''}${v} ${ITEM_TIP_BASE[st]}`));
  if (item.ac){
    const names = Object.entries(BIS_CHR_CLASS_ID).filter(([, cid]) => item.ac & (1 << (cid - 1))).map(([id]) => CLASS_MAP[id] ? CLASS_MAP[id].label : id);
    if (names.length && names.length < 9) out.push(line(`Klassen: ${escapeHtml(names.join(', '))}`));
  }
  if (item.rl) out.push(line(`Benötigt Stufe ${item.rl}`));
  for (const [st, v] of stats) if (ITEM_TIP_EQUIP[st]) out.push(line('Anlegen: ' + ITEM_TIP_EQUIP[st].replace('{v}', String(v)), 'item-tip-green'));
  if (item.set && bisData.items.sets[item.set]){
    const pieces = itemTipSetPieces(item.set);
    const owned = pieces.filter(p => bisIsOwned(p.id)).length;
    out.push(`<div class="item-tip-set">${line(`${escapeHtml(bisData.items.sets[item.set])} (${owned}/${pieces.length})`, 'item-tip-yellow')}
      ${pieces.map(p => line(escapeHtml(p.n), 'item-tip-piece' + (bisIsOwned(p.id) ? ' owned' : ''))).join('')}</div>`);
  }
  if (item.fa) out.push(line(`Nur ${BIS_FACTION_LABEL[item.fa] || item.fa}`, 'item-tip-yellow'));
  out.push(line(`Gegenstandsstufe ${item.il}`, 'item-tip-grey'));
  const src = bisSourceLines(item);
  if (src.length) out.push(`<div class="item-tip-src">${src.map(s => line(escapeHtml(s))).join('')}</div>`);
  return out.join('');
}

/** Keep the tooltip next to the pointer, inside the viewport. @param {number} x @param {number} y */
function itemTipMove(x, y){
  if (!itemTipEl) return;
  const r = itemTipEl.getBoundingClientRect();
  const pad = 8, off = 16;
  let left = x + off, top = y + off;
  if (left + r.width > window.innerWidth - pad) left = Math.max(pad, x - off - r.width);
  if (top + r.height > window.innerHeight - pad) top = Math.max(pad, window.innerHeight - pad - r.height);
  itemTipEl.style.left = `${left}px`;
  itemTipEl.style.top = `${top}px`;
}

function itemTipHide(){
  itemTipFor = null;
  if (itemTipEl) itemTipEl.classList.add('hidden');
}

document.addEventListener('mouseover', ev => {
  const target = /** @type {Element} */ (ev.target);
  const host = target && target.closest ? target.closest('[data-item-id]') : null;
  if (!host){ if (itemTipFor) itemTipHide(); return; }
  if (host === itemTipFor) return;
  const item = bisData && bisData.byId.get(Number(host.getAttribute('data-item-id')));
  if (!item){ itemTipHide(); return; }
  if (!itemTipEl){
    itemTipEl = document.createElement('div');
    itemTipEl.className = 'item-tooltip hidden';
    itemTipEl.setAttribute('role', 'tooltip');
    document.body.appendChild(itemTipEl);
  }
  itemTipFor = host;
  itemTipEl.innerHTML = itemTipHtml(item);
  itemTipEl.classList.remove('hidden');
  itemTipMove(ev.clientX, ev.clientY);
});
document.addEventListener('mousemove', ev => {
  if (!itemTipFor) return;
  if (!itemTipFor.isConnected) itemTipHide(); else itemTipMove(ev.clientX, ev.clientY);
});
document.documentElement.addEventListener('mouseleave', () => { if (itemTipFor) itemTipHide(); });
// Re-rendered lists drop the hovered element; scrolling / clicking moves on.
document.addEventListener('scroll', () => { if (itemTipFor) itemTipHide(); }, true);
document.addEventListener('click', () => { if (itemTipFor) itemTipHide(); }, true);
