// "Berufe" page: the guild's profession directory.
//
// Every member keeps professions per character — profession, skill and
// optionally special recipes — in their own character profile
// (characterProfiles/<uid>/characters[i].professions, written like the
// rest of the profile, no extra rules). They are edited per character on
// "Meine Charaktere" (profCharEditorHtml / profWireEditor below, used by
// js/mychar-page.js). This page shows:
//  - the directory: per profession who has it, with skill and recipes;
//    a search by player or item answers "who can make X?" — crafters who
//    listed the recipe, then crafters whose skill would be enough.
// Recipes are crafted items from data/forever/items.json (craft.p) and,
// for Enchanting, enchants from enchants.json (spell ids). Alchemy,
// cooking and first aid have no recipe data yet (items.json holds gear).

/** PROFESSIONS id -> SkillLine id in the item data. */
const PROF_SKILL_LINE = {
  alchemy: 171, blacksmithing: 164, enchanting: 333, engineering: 202, herbalism: 182, leatherworking: 165,
  mining: 186, skinning: 393, tailoring: 197, first_aid: 129, cooking: 185, fishing: 356
};
const PROF_MAX_SKILL = 300;
const PROF_MAX_PRIMARY = 2;
const PROF_MAX_RECIPES = 40;
const PROF_RESULTS = 10;

let profFilter = '';
let profQuery = '';
/** Recipe search text per "charId|profId". @type {Record<string, string>} */
const profRecipeQuery = {};

/** A recipe as shown: name, item (for the tooltip) or enchant. @param {string} profId @param {number} id */
function profRecipeInfo(profId, id){
  if (profId === 'enchanting' && bisData){
    const e = bisData.enchants.find(x => x.id === id);
    if (e) return { name: e.n, item: null, r: (e.craft && e.craft.r) || 0 };
  }
  const item = bisData && bisData.byId.get(id);
  return { name: item ? item.n : `#${id}`, item: item || null, r: (item && item.src && item.src.craft && item.src.craft.r) || 0 };
}

/** Recipes the item data knows for a profession. @param {string} profId */
function profRecipeCandidates(profId){
  const line = PROF_SKILL_LINE[profId];
  if (!bisData || !line) return [];
  const items = bisData.items.items.filter(i => i.src && i.src.craft && i.src.craft.p === line)
    .map(i => ({ id: i.id, name: i.n, item: i, r: i.src.craft.r || 0 }));
  const enchants = profId === 'enchanting'
    ? bisData.enchants.filter(e => e.craft && e.craft.p === line).map(e => ({ id: e.id, name: e.n, item: null, r: e.craft.r || 0 }))
    : [];
  return items.concat(enchants);
}

/** Chip for a recipe (item tooltip on hover). @param {string} profId @param {number} id @param {string} [extra] */
function profRecipeChip(profId, id, extra){
  const info = profRecipeInfo(profId, id);
  const color = info.item ? bisQualityColor(info.item) : 'var(--text)';
  return `<span class="prof-recipe"${info.item ? ` data-item-id="${id}"` : ''}><span style="color:${color}">${escapeHtml(info.name)}</span>${extra || ''}</span>`;
}

/** Every crafter of the guild: one entry per character and profession. */
function profAllEntries(){
  const out = [];
  for (const [uid, prof] of Object.entries(state.characterProfiles || {})) {
    for (const c of prof.characters) {
      for (const p of c.professions || []) out.push({ uid, owner: prof.nickname || profOwnerName(uid), char: c, p });
    }
  }
  return out;
}

/** Display name of a member without a nickname. @param {string} uid */
function profOwnerName(uid){
  const role = state.discordRoles && state.discordRoles[uid];
  return (role && role.username) || 'Unbekannt';
}

/**
 * "Gilde: Kraxl (Rezept), Grom (Skill 300)" for a crafted BoE item, for
 * the BiS planner's source lines; '' for BoP items or without crafters.
 * @param {ForeverItem} item
 */
function profGuildCraftersLine(item){
  const c = item.src && item.src.craft;
  if (!c || item.b === 1 || !state.characterProfiles) return '';
  const profId = Object.keys(PROF_SKILL_LINE).find(k => PROF_SKILL_LINE[k] === c.p);
  if (!profId) return '';
  const crafters = profAllEntries().filter(e => e.p.id === profId);
  const known = crafters.filter(e => (e.p.recipes || []).some(id => id === item.id || profRecipeInfo(profId, id).name === item.n));
  const could = crafters.filter(e => !known.includes(e) && c.r && (e.p.skill || 0) >= c.r);
  const names = known.map(e => `${e.char.name} (Rezept)`).concat(could.map(e => `${e.char.name} (Skill ${e.p.skill})`));
  return names.length ? `Gilde: ${names.slice(0, 6).join(', ')}${names.length > 6 ? ' …' : ''}` : '';
}

// ---------------------------------------------------------------- editor (Meine Charaktere)
/** Profession rows + "add" select for one character of the draft. @param {Character} c */
function profCharEditorHtml(c){
  const profs = c.professions || [];
  const primary = profs.filter(p => PROFESSION_MAP[p.id].primary).length;
  const free = PROFESSIONS.filter(p => !profs.some(x => x.id === p.id) && (!p.primary || primary < PROF_MAX_PRIMARY));
  const rows = profs.map(p => {
    const key = `${c.id}|${p.id}`;
    const hasRecipes = profRecipeCandidates(p.id).length > 0;
    return `<div class="prof-edit-row">
      <div class="prof-edit-head">
        <strong>${escapeHtml(PROFESSION_MAP[p.id].label)}</strong>
        <label class="prof-skill">Skill <input type="number" min="1" max="${PROF_MAX_SKILL}" value="${p.skill || ''}" data-prof-skill="${escapeHtml(key)}"></label>
        <button type="button" class="btn btn-ghost btn-sm" data-prof-remove="${escapeHtml(key)}">Entfernen</button>
      </div>
      ${hasRecipes ? `<div class="prof-recipes">
        ${(p.recipes || []).map(id => profRecipeChip(p.id, id, `<button type="button" data-prof-recipe-remove="${escapeHtml(key)}|${id}" aria-label="Entfernen">×</button>`)).join('')}
        ${(p.recipes || []).length < PROF_MAX_RECIPES ? `<div class="prof-recipe-search">
          <input type="search" class="apply-text-input" data-prof-recipe-search="${escapeHtml(key)}" placeholder="Besonderes Rezept hinzufügen …" value="${escapeHtml(profRecipeQuery[key] || '')}" autocomplete="off">
          <div class="raid-sr-results" data-prof-recipe-results="${escapeHtml(key)}">${profRecipeResultsHtml(c, p.id)}</div>
        </div>` : ''}
      </div>` : ''}
    </div>`;
  }).join('');
  return `${rows || '<p class="bis-hint">Noch keine Berufe.</p>'}
    ${free.length ? `<select class="prof-add" data-prof-add="${escapeHtml(c.id)}"><option value="">+ Beruf hinzufügen …</option>${free.map(p => `<option value="${p.id}">${escapeHtml(p.label)}</option>`).join('')}</select>` : ''}`;
}

/** Recipe search results for one character's profession. @param {Character} c @param {string} profId */
function profRecipeResultsHtml(c, profId){
  const key = `${c.id}|${profId}`;
  const q = (profRecipeQuery[key] || '').trim().toLowerCase();
  if (q.length < 2) return '';
  const p = (c.professions || []).find(x => x.id === profId);
  const have = new Set((p && p.recipes) || []);
  const seen = new Set();
  const hits = profRecipeCandidates(profId)
    .filter(r => !have.has(r.id) && r.name.toLowerCase().includes(q))
    .sort((a, z) => z.r - a.r || a.name.localeCompare(z.name))
    .filter(r => { const k = r.name + '|' + r.r; if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, PROF_RESULTS);
  if (!hits.length) return '<div class="raid-sr-result-empty">Nichts gefunden.</div>';
  return hits.map(r => `<button type="button" class="raid-sr-result" data-prof-recipe-add="${escapeHtml(key)}|${r.id}"${r.item ? ` data-item-id="${r.id}"` : ''}>
    ${r.item ? bisIconHtml(r.item, 22) : ''}<span style="color:${r.item ? bisQualityColor(r.item) : 'var(--text)'}">${escapeHtml(r.name)}</span>
    <span class="bis-item-meta">${r.r ? `Skill ${r.r}` : ''}</span>
  </button>`).join('');
}

/**
 * Wire the profession editors inside root. `chars` is the draft list,
 * `changed` re-renders after an edit.
 * @param {HTMLElement} root @param {Character[]} chars @param {() => void} changed
 */
function profWireEditor(root, chars, changed){
  const find = key => {
    const [charId, profId] = key.split('|');
    const c = chars.find(x => x.id === charId);
    return { c, p: c && (c.professions || []).find(x => x.id === profId) };
  };
  root.querySelectorAll('[data-prof-add]').forEach((/** @type {HTMLSelectElement} */ sel) => sel.addEventListener('change', () => {
    const c = chars.find(x => x.id === sel.getAttribute('data-prof-add'));
    if (!c || !PROFESSION_MAP[sel.value]) return;
    c.professions = (c.professions || []).concat({ id: sel.value, skill: 1, recipes: [] });
    changed();
  }));
  root.querySelectorAll('[data-prof-remove]').forEach(btn => btn.addEventListener('click', () => {
    const { c } = find(btn.getAttribute('data-prof-remove'));
    const profId = btn.getAttribute('data-prof-remove').split('|')[1];
    if (c) c.professions = (c.professions || []).filter(p => p.id !== profId);
    changed();
  }));
  root.querySelectorAll('[data-prof-skill]').forEach((/** @type {HTMLInputElement} */ input) => input.addEventListener('change', () => {
    const { p } = find(input.getAttribute('data-prof-skill'));
    if (!p) return;
    p.skill = Math.max(1, Math.min(PROF_MAX_SKILL, Math.trunc(Number(input.value)) || 1));
    changed();
  }));
  root.querySelectorAll('[data-prof-recipe-search]').forEach((/** @type {HTMLInputElement} */ input) => {
    const key = input.getAttribute('data-prof-recipe-search');
    input.addEventListener('input', () => {
      profRecipeQuery[key] = input.value;
      const box = root.querySelector(`[data-prof-recipe-results="${CSS.escape(key)}"]`);
      const { c } = find(key);
      if (box && c) box.innerHTML = profRecipeResultsHtml(c, key.split('|')[1]);
    });
  });
  root.querySelectorAll('[data-prof-recipe-remove]').forEach(btn => btn.addEventListener('click', () => {
    const parts = btn.getAttribute('data-prof-recipe-remove').split('|');
    const { p } = find(`${parts[0]}|${parts[1]}`);
    if (p) p.recipes = (p.recipes || []).filter(id => id !== Number(parts[2]));
    changed();
  }));
  // Delegated (results are replaced while typing); root outlives re-renders.
  if (!root.dataset.profWired) root.addEventListener('click', ev => {
    const btn = /** @type {HTMLElement} */ (ev.target).closest('[data-prof-recipe-add]');
    if (!btn || !root.contains(btn)) return;
    const parts = btn.getAttribute('data-prof-recipe-add').split('|');
    const { p } = find(`${parts[0]}|${parts[1]}`);
    const id = Number(parts[2]);
    if (!p || (p.recipes || []).includes(id) || (p.recipes || []).length >= PROF_MAX_RECIPES) return;
    p.recipes = (p.recipes || []).concat(id);
    profRecipeQuery[`${parts[0]}|${parts[1]}`] = '';
    changed();
  });
  root.dataset.profWired = '1';
}

// ---------------------------------------------------------------- directory
function profDirectoryHtml(){
  const entries = profAllEntries();
  const q = profQuery.trim().toLowerCase();
  const chip = (id, label, n) => `<button type="button" class="talent-class-btn bis-need-kind${profFilter === id ? ' active' : ''}" data-prof-filter="${id}">${escapeHtml(label)}${n !== undefined ? ` <span class="bis-item-meta">${n}</span>` : ''}</button>`;
  const counts = Object.fromEntries(PROFESSIONS.map(p => [p.id, entries.filter(e => e.p.id === p.id).length]));
  const head = `<div class="bis-controls tac-card">
      <div class="bis-control">
        <label>Beruf</label>
        <div class="bis-class-row prof-filter-row">${chip('', 'Alle')}${PROFESSIONS.filter(p => counts[p.id]).map(p => chip(p.id, p.label, counts[p.id])).join('')}</div>
      </div>
      <div class="bis-control bis-setbar-name">
        <label for="profSearch">Suche</label>
        <input type="search" id="profSearch" class="apply-text-input" placeholder="Spieler oder Item, z. B. „Lionheart“ …" value="${escapeHtml(profQuery)}" autocomplete="off">
      </div>
    </div>`;
  return head + `<div id="profList">${profListHtml(entries, q)}</div>`;
}

/** @param {ReturnType<typeof profAllEntries>} entries @param {string} q */
function profListHtml(entries, q){
  if (!entries.length) return '<div class="tac-card"><p class="bis-hint">Noch hat niemand Berufe eingetragen.</p></div>';
  const person = e => {
    const cls = e.char.classId && CLASS_MAP[e.char.classId];
    return `<span class="prof-person"><span style="color:${cls ? cls.color : 'var(--text)'}">${escapeHtml(e.char.name)}</span> <span class="bis-item-meta">${escapeHtml(e.owner)}</span></span>`;
  };
  let html = '';
  // An item search answers "who can make it?".
  if (q.length >= 2 && bisData) {
    const recipeHits = [];
    for (const p of PROFESSIONS) {
      if (profFilter && profFilter !== p.id) continue;
      for (const r of profRecipeCandidates(p.id)) if (r.name.toLowerCase().includes(q)) recipeHits.push({ prof: p.id, r });
    }
    const byName = new Map();
    for (const h of recipeHits) if (!byName.has(h.r.name)) byName.set(h.r.name, h);
    const rows = [...byName.values()].slice(0, 15).map(({ prof, r }) => {
      const sameName = recipeHits.filter(h => h.prof === prof && h.r.name === r.name).map(h => h.r.id);
      const crafters = entries.filter(e => e.p.id === prof);
      const known = crafters.filter(e => (e.p.recipes || []).some(id => sameName.includes(id)));
      const could = crafters.filter(e => !known.includes(e) && r.r && (e.p.skill || 0) >= r.r);
      if (!known.length && !could.length) return '';
      return `<div class="prof-who">
        <div class="prof-who-item">${profRecipeChip(prof, r.id)} <span class="bis-item-meta">${escapeHtml(PROFESSION_MAP[prof].label)}${r.r ? ` · Skill ${r.r}` : ''}</span></div>
        ${known.length ? `<div class="prof-who-line"><span class="bis-item-meta">Hat das Rezept:</span> ${known.map(person).join('')}</div>` : ''}
        ${could.length ? `<div class="prof-who-line"><span class="bis-item-meta">Skill reicht (Rezept nicht eingetragen):</span> ${could.map(person).join('')}</div>` : ''}
      </div>`;
    }).filter(Boolean);
    if (rows.length) html += `<div class="tac-card"><h3 class="bis-card-title">Wer kann das herstellen?</h3>${rows.join('')}</div>`;
  }
  for (const p of PROFESSIONS) {
    if (profFilter && profFilter !== p.id) continue;
    const list = entries.filter(e => e.p.id === p.id)
      .filter(e => !q || e.char.name.toLowerCase().includes(q) || e.owner.toLowerCase().includes(q)
        || (e.p.recipes || []).some(id => profRecipeInfo(p.id, id).name.toLowerCase().includes(q)))
      .sort((a, z) => (z.p.skill || 0) - (a.p.skill || 0) || a.char.name.localeCompare(z.char.name, 'de'));
    if (!list.length) continue;
    html += `<div class="tac-card prof-card">
      <h3 class="bis-card-title">${escapeHtml(p.label)} <span class="bis-item-meta">${list.length}</span></h3>
      ${list.map(e => `<div class="prof-row">
        <div class="prof-row-head">${person(e)}<span class="prof-skill-val">${e.p.skill || '?'}</span></div>
        ${(e.p.recipes || []).length ? `<div class="prof-recipes">${e.p.recipes.map(id => profRecipeChip(p.id, id)).join('')}</div>` : ''}
      </div>`).join('')}
    </div>`;
  }
  return html || '<div class="tac-card"><p class="bis-hint">Nichts gefunden.</p></div>';
}

// ---------------------------------------------------------------- page
function renderProfessionsPage(){
  const root = document.getElementById('professionsRoot');
  if (!root) return;
  if (!discordIdentity){
    root.innerHTML = '<div class="tac-card"><p class="bis-hint">Das Berufe-Verzeichnis sehen alle mit Discord eingeloggten Spieler. Melde Dich oben rechts an.</p></div>';
    return;
  }
  if (!bisData){
    root.innerHTML = '<div class="tac-card"><p class="bis-hint">Lade Rezepte …</p></div>';
    bisLoadData().then(() => { if (currentPage === 'professions') renderProfessionsPage(); })
      .catch(() => { root.innerHTML = '<div class="tac-card"><p class="bis-hint">Item-Daten konnten nicht geladen werden.</p></div>'; });
    return;
  }
  const focused = document.activeElement && document.activeElement.id === 'profSearch';
  root.innerHTML = `<p class="bis-hint prof-own-hint">Deine eigenen Berufe trägst Du auf <a href="#mychar" data-prof-goto-mychar>Meine Charaktere</a> ein.</p>` + profDirectoryHtml();
  root.querySelectorAll('[data-prof-goto-mychar]').forEach(a => a.addEventListener('click', ev => { ev.preventDefault(); showPage('mychar'); }));
  root.querySelectorAll('[data-prof-filter]').forEach(btn => btn.addEventListener('click', () => {
    profFilter = btn.getAttribute('data-prof-filter');
    renderProfessionsPage();
  }));
  const search = /** @type {HTMLInputElement | null} */ (root.querySelector('#profSearch'));
  if (search){
    search.addEventListener('input', () => {
      profQuery = search.value;
      const list = root.querySelector('#profList');
      if (list) list.innerHTML = profListHtml(profAllEntries(), profQuery.trim().toLowerCase());
    });
    if (focused){ search.focus(); search.setSelectionRange(search.value.length, search.value.length); }
  }
}
