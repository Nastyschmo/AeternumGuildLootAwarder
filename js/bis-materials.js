// BiS-Planer: the Materialliste — materials of every open crafted slot,
// each with where to get it (data/forever/items.json `materials`, built by
// scripts/forever-data/materials.mjs): vendors, drops (with the zones most
// droppers live in), gathering nodes and their zones, skinning /
// disenchanting hints, and the profession craft for intermediate goods
// (bars, transmutes, bolts). "In Rohstoffe aufschlüsseln" replaces crafted
// materials that are only crafted by their own materials, recursively —
// assuming one item per craft, which holds for smelting, transmutes and
// bolts.

const BIS_MATS_RAW_KEY = 'rude-bis-mats-raw-v1';
let bisMatsRaw = (() => { try { return localStorage.getItem(BIS_MATS_RAW_KEY) === '1'; } catch (e){ return false; } })();
/** Material ids whose source lines are expanded (UI only). */
const bisMatsOpen = new Set();

/** @param {number} id @returns {ForeverItemSource | undefined} */
function bisMaterialSrc(id){
  const m = bisData && bisData.items.materials;
  return m ? m[id] : undefined;
}
/** @param {number} id */
function bisMaterialName(id){
  const names = (bisData && bisData.items.reagents) || {};
  return names[id] || 'Item ' + id;
}

/** German source lines for a material. @param {number} id @returns {string[]} */
function bisMaterialSourceLines(id){
  const raw = bisMaterialSrc(id);
  if (!raw) return [];
  const s = bisSources(/** @type {ForeverItem} */ ({ src: raw })) || raw;
  const npc = n => n.z ? `${n.n} (${n.z})` : n.n;
  const out = [];
  if (s.vendors && s.vendors.length) out.push('Händler: ' + s.vendors.map(npc).join(', '));
  if (s.oz && s.oz.length) out.push(`Vorkommen${s.objects && s.objects.length ? ' (' + s.objects.slice(0, 3).join(', ') + ')' : ''}: ${s.oz.join(', ')}`);
  else if (s.objects && s.objects.length) out.push('Objekt: ' + s.objects.join(', '));
  if (s.drops && s.drops.length) out.push('Drop: ' + s.drops.map(npc).join(', '));
  if (s.dropCount) out.push(`Drop von ${s.dropCount} Gegnern${s.dz && s.dz.length ? ', v. a. in ' + s.dz.join(', ') : ''}`);
  if (s.sk) out.push('Kürschnerei (Häuten)');
  if (s.de) out.push('Entzaubern (Verzauberkunst)');
  if (s.craft){
    const c = s.craft;
    let line = `Herstellung: ${bisCraftSkill(c)}`;
    if (c.m && c.m.length) line += ' aus ' + c.m.map(([m, n]) => `${n}× ${bisMaterialName(m)}`).join(', ');
    if (c.rec){
      const rs = c.rec.src ? bisSourceLines(/** @type {ForeverItem} */ ({ src: c.rec.src })) : [];
      line += ` · Rezept: ${c.rec.n}${rs.length ? ' — ' + rs.join('; ') : ''}`;
    }
    out.push(line);
  }
  if (s.quests && s.quests.length) out.push('Quest: ' + s.quests.map(q => q.n).join(', '));
  if (s.containers && s.containers.length) out.push('Enthalten in: ' + s.containers.join(', '));
  return out;
}

/**
 * Break a material down into its own materials? Only if crafting is the
 * way to get it: not when it is also gathered, skinned, dropped or sold
 * (Rugged Leather, Essence of Fire, Rune Thread stay as they are).
 * @param {ForeverItemSource} s
 */
function bisMaterialExpandable(s){
  return Boolean(s.craft && s.craft.m && s.craft.m.length && !s.sk && !s.de && !(s.oz && s.oz.length)
    && !s.dropCount && !(s.drops && s.drops.length) && !(s.vendors && s.vendors.length));
}
/**
 * Materials of the open crafted slots: id -> count. With `raw`, crafted
 * materials are replaced by their own materials (one item per craft).
 * @param {BisBuild} b @param {boolean} raw @returns {Map<number, number>}
 */
function bisMaterialTotals(b, raw){
  /** @type {Map<number, number>} */
  const totals = new Map();
  const add = (id, n, depth) => {
    const src = raw && depth < 5 ? bisMaterialSrc(id) : null;
    if (src && bisMaterialExpandable(src)){
      const c = src.craft;
      for (const [m, k] of c.m) add(m, n * k, depth + 1);
      return;
    }
    totals.set(id, (totals.get(id) || 0) + n);
  };
  for (const s of BIS_SLOTS){
    const sel = b.slots[s.key];
    const item = sel && !bisIsOwned(sel.itemId) && bisData.byId.get(sel.itemId);
    const c = item && item.src && item.src.craft;
    if (!c || !c.m || (s.key === 'offhand' && bisOffhandBlocked(b))) continue;
    for (const [id, n] of c.m) add(id, n, 0);
  }
  return totals;
}

/** The Materialliste card, or '' without crafted open slots. @param {BisBuild} b */
function bisMaterialsCardHtml(b){
  const direct = bisMaterialTotals(b, false);
  if (!direct.size) return '';
  const totals = bisMatsRaw ? bisMaterialTotals(b, true) : direct;
  const canExpand = [...direct.keys()].some(id => { const s = bisMaterialSrc(id); return Boolean(s && bisMaterialExpandable(s)); });
  const rows = [...totals].sort((a, z) => bisMaterialName(a[0]).localeCompare(bisMaterialName(z[0]), 'de')).map(([id, n]) => {
    const lines = bisMaterialSourceLines(id);
    const open = bisMatsOpen.has(id);
    return `<li class="bis-mat${open ? ' open' : ''}">
      <button type="button" class="bis-mat-head" data-bis-mat="${id}" aria-expanded="${open}" ${lines.length ? '' : 'disabled'}>
        <strong>${n}×</strong> <span>${escapeHtml(bisMaterialName(id))}</span>
        ${lines.length ? `<span class="bis-mat-arrow" aria-hidden="true">${open ? '▲' : '▼'}</span>` : '<span class="bis-item-meta">Quelle unbekannt</span>'}
      </button>
      ${open ? `<div class="bis-mat-src">${lines.map(l => `<div>${escapeHtml(l)}</div>`).join('')}</div>` : ''}
    </li>`;
  }).join('');
  return `<div class="tac-card bis-mats">
    <h3 class="bis-card-title">Materialliste</h3>
    ${canExpand ? `<label class="bis-mat-raw"><input type="checkbox" id="bisMatsRaw" ${bisMatsRaw ? 'checked' : ''}> In Rohstoffe aufschlüsseln</label>` : ''}
    <ul class="bis-mat-list">${rows}</ul>
    <p class="bis-hint">Alle Materialien für die offenen herstellbaren Slots, auch BoE-Teile, die Du alternativ fertig kaufen kannst. Klick auf ein Material zeigt, wo es herkommt.${bisMatsRaw ? ' Aufgeschlüsselt mit einem Stück pro Herstellung.' : ''}</p>
  </div>`;
}

/** @param {HTMLElement} root */
function bisWireMaterials(root){
  root.querySelectorAll('[data-bis-mat]').forEach(btn => btn.addEventListener('click', () => {
    const id = Number(btn.getAttribute('data-bis-mat'));
    if (bisMatsOpen.has(id)) bisMatsOpen.delete(id); else bisMatsOpen.add(id);
    renderBisPlanner();
  }));
  const raw = /** @type {HTMLInputElement} */ (root.querySelector('#bisMatsRaw'));
  if (raw) raw.addEventListener('change', () => {
    bisMatsRaw = raw.checked;
    try { localStorage.setItem(BIS_MATS_RAW_KEY, bisMatsRaw ? '1' : '0'); } catch (e){ /* private mode */ }
    renderBisPlanner();
  });
}
