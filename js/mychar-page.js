// "Meine Charaktere" page: everything about the member's own characters
// in one place — add, edit (name, realm, class, spec, main) and remove
// characters, their professions (editor from js/professions.js) and one
// BiS set per spec (own saved sets, js/bis-sets.js), plus the live Armory
// / WarcraftLogs data (js/characters.js).
//
// Edits go into a draft (mycharDraft) until "Speichern" writes the whole
// profile to characterProfiles/<uid> — the member's own path, no extra
// rules. Character.bisSets = { specId: setId } (bisSets/<uid>/<id> or an
// own bisPublic set).

/** @type {Character[] | null} */
let mycharDraft = null;
let mycharDirty = false;
let mycharStatus = '';
/** Character ids whose edit form is open. */
const mycharEditing = new Set();

/** Fresh draft from the saved profile (deep enough to edit freely). */
function mycharStartDraft(){
  const prof = discordIdentity && state.characterProfiles[discordIdentity.id];
  mycharDraft = prof ? prof.characters.map(c => ({
    ...c,
    professions: (c.professions || []).map(p => ({ ...p, recipes: [...(p.recipes || [])] })),
    bisSets: { ...(c.bisSets || {}) }
  })) : [];
  mycharDirty = false;
}

/** Saved version of a draft character (null = new). @param {string} id */
function mycharSaved(id){
  const prof = discordIdentity && state.characterProfiles[discordIdentity.id];
  return (prof && prof.characters.find(c => c.id === id)) || null;
}

/** Edit form: name, realm, class, spec, main, remove. @param {Character} c */
function mycharFormHtml(c){
  return `<div class="mychar-form">
    <label>Name<input type="text" class="apply-text-input" maxlength="24" data-mychar-field="name" data-mychar-id="${c.id}" value="${escapeHtml(c.name)}" placeholder="Charaktername"></label>
    <label>Realm<input type="text" class="apply-text-input" maxlength="40" data-mychar-field="realmSlug" data-mychar-id="${c.id}" value="${escapeHtml(c.realmSlug)}"></label>
    <label>Klasse<select data-mychar-field="classId" data-mychar-id="${c.id}">
      <option value="">Klasse …</option>
      ${CLASSES.map(k => `<option value="${k.id}" ${c.classId === k.id ? 'selected' : ''}>${escapeHtml(k.label)}</option>`).join('')}
    </select></label>
    <label>Spec<select data-mychar-field="specId" data-mychar-id="${c.id}" ${c.classId ? '' : 'disabled'}>
      <option value="">Spec …</option>
      ${(c.classId ? foreverSpecsForClass(c.classId) : []).map(sp => `<option value="${sp.id}" ${c.specId === sp.id ? 'selected' : ''}>${escapeHtml(sp.label)}</option>`).join('')}
    </select></label>
    <label>Raid-Status<select data-mychar-field="raidRole" data-mychar-id="${c.id}">
      <option value="main" ${characterIsRaider(c) ? 'selected' : ''}>Main (Raider)</option>
      <option value="twink" ${characterIsRaider(c) ? '' : 'selected'}>Twink</option>
    </select></label>
    <label class="mychar-form-main"><input type="radio" name="mycharMain" data-mychar-main="${c.id}" ${c.isMain ? 'checked' : ''}> Hauptcharakter (Anzeige)</label>
    <button type="button" class="btn btn-ghost btn-sm" data-mychar-remove="${c.id}">Charakter entfernen</button>
  </div>`;
}

/** BiS set per spec: own sets of the class, the spec's own sets first. @param {Character} c */
function mycharBisHtml(c){
  if (!c.classId) return '<p class="bis-hint">Setz die Klasse (Bearbeiten), um BiS-Listen zuzuweisen.</p>';
  const sets = Object.entries(bisMySets).filter(([, s]) => s.classId === c.classId);
  return foreverSpecsForClass(c.classId).map(sp => {
    const chosen = (c.bisSets || {})[sp.id] || '';
    const set = chosen && bisMySets[chosen];
    const ordered = sets.slice().sort((a, z) => Number(z[1].specId === sp.id) - Number(a[1].specId === sp.id) || a[1].name.localeCompare(z[1].name, 'de'));
    let info = '';
    if (chosen && !set) info = '<span class="bis-item-meta">Set nicht mehr vorhanden</span>';
    else if (set){
      const ids = Object.values(set.slots);
      const owned = ids.filter(id => bisIsOwned(id)).length;
      info = `<span class="mychar-bis-progress"><span style="width:${ids.length ? Math.round(owned / ids.length * 100) : 0}%"></span></span>
        <span class="bis-item-meta">${owned}/${ids.length} Habe ich</span>
        <button type="button" class="btn btn-ghost btn-sm" data-mychar-open-set="${escapeHtml(chosen)}">Im BiS-Planer öffnen</button>
        ${set.public ? '' : '<span class="bis-item-meta mychar-bis-private">Privat — der Loot Council sieht es nicht. Im BiS-Planer öffentlich machen.</span>'}`;
    }
    return `<div class="mychar-bis-row">
      <span class="mychar-bis-spec">${c.specId === sp.id ? '★ ' : ''}${escapeHtml(sp.label)}</span>
      <select data-mychar-bis="${c.id}|${sp.id}">
        <option value="">— keine —</option>
        ${ordered.map(([id, s]) => `<option value="${escapeHtml(id)}" ${id === chosen ? 'selected' : ''}>${escapeHtml(s.name)}${s.specId !== sp.id ? ` (${escapeHtml(foreverSpecLabel(s.classId, s.specId))})` : ''}${s.public ? '' : ' · privat'}</option>`).join('')}
        ${chosen && !set ? `<option value="${escapeHtml(chosen)}" selected>(gelöscht)</option>` : ''}
      </select>
      ${info}
    </div>`;
  }).join('') + (sets.length ? '' : `<p class="bis-hint">Noch keine gespeicherten Sets für ${escapeHtml(CLASS_MAP[c.classId].label)} — leg im BiS-Planer welche an.</p>`);
}

/** @param {Character} c */
function mycharCardHtml(c){
  const saved = mycharSaved(c.id);
  const editing = mycharEditing.has(c.id) || !c.name;
  const cls = c.classId && CLASS_MAP[c.classId];
  // Armory data only for saved characters (name / realm as stored).
  const armory = saved && saved.name ? mycharArmoryHtml(saved) : null;
  const accent = cls ? cls.color : (armory ? armory.accentColor : 'var(--gold)');
  const sub = [c.realmSlug, cls ? cls.label : '', cls && c.specId ? foreverSpecLabel(c.classId, c.specId) : ''].filter(Boolean).join(' · ');
  return `<div class="mychar-card" style="border-top-color:${accent}" data-mychar-card="${c.id}">
    <div class="mychar-card-head">
      <div>
        <div class="mychar-card-name" ${cls ? `style="color:${cls.color}"` : ''}>${escapeHtml(c.name || 'Neuer Charakter')}${c.isMain ? ' <span class="mychar-main-badge">★ Hauptcharakter</span>' : ''} <span class="mychar-role-badge${characterIsRaider(c) ? '' : ' twink'}">${characterIsRaider(c) ? 'Main' : 'Twink'}</span></div>
        <div class="mychar-card-realm">${escapeHtml(sub)}</div>
      </div>
      <button type="button" class="btn btn-ghost btn-sm" data-mychar-edit="${c.id}">${editing ? 'Fertig' : 'Bearbeiten'}</button>
    </div>
    ${editing ? mycharFormHtml(c) : ''}
    <div class="mychar-section">
      <div class="mychar-section-title">Berufe</div>
      ${bisData ? profCharEditorHtml(c) : '<p class="bis-hint">Lade Rezepte …</p>'}
    </div>
    <div class="mychar-section">
      <div class="mychar-section-title">BiS-Liste pro Spec</div>
      <p class="bis-hint mychar-bis-hint">Ordne dem Charakter Deine Sets aus dem BiS-Planer zu — für die Loot-Vergabe; dafür muss das Set öffentlich sein. Erstellt und bearbeitet werden Sets weiter im BiS-Planer.</p>
      ${mycharBisHtml(c)}
    </div>
    ${armory ? `<div class="mychar-section"><div class="mychar-section-title">Armory</div>${armory.html}</div>` : ''}
  </div>`;
}

async function renderMyCharactersPage(){
  const loggedOut = !discordIdentity;
  els.mycharLoggedOut.classList.toggle('hidden', !loggedOut);
  els.mycharLoggedIn.classList.toggle('hidden', loggedOut);
  if (loggedOut) return;
  bisSyncListeners();
  if (!bisData) bisLoadData().then(() => { if (currentPage === 'mychar') renderMyCharactersPage(); }).catch(() => {});
  // Unsaved edits stay; otherwise follow the live profile.
  if (!mycharDraft || !mycharDirty) mycharStartDraft();
  mycharRender();
  // Fetch Armory / WarcraftLogs data for saved characters not cached yet.
  const saved = ((state.characterProfiles[discordIdentity.id] || {}).characters || []);
  const toFetchArmory = saved.filter(c => !armoryCache[characterProfileCacheKey(c.realmSlug, c.name)]);
  const toFetchWcl = saved.filter(c => !wclCache[characterProfileCacheKey(c.realmSlug, c.name)]);
  if (toFetchArmory.length || toFetchWcl.length){
    await Promise.all([
      ...toFetchArmory.map(c => fetchArmoryCharacter(c.realmSlug, c.name)),
      ...toFetchWcl.map(c => fetchWarcraftLogsCharacter(c.realmSlug, c.name))
    ]);
    if (currentPage === 'mychar') mycharRender();
  }
}

/** Draw the page from the draft (no fetching). */
function mycharRender(){
  const root = els.mycharList;
  // Keep the focus (and caret) in a text field across live re-renders.
  const active = /** @type {HTMLInputElement | null} */ (document.activeElement);
  let focusSel = '';
  if (active && root.contains(active)){
    if (active.hasAttribute('data-mychar-field')) focusSel = `[data-mychar-field="${active.getAttribute('data-mychar-field')}"][data-mychar-id="${CSS.escape(active.getAttribute('data-mychar-id'))}"]`;
    else if (active.hasAttribute('data-prof-recipe-search')) focusSel = `[data-prof-recipe-search="${CSS.escape(active.getAttribute('data-prof-recipe-search'))}"]`;
  }
  const bar = `<div class="mychar-savebar${mycharDirty ? ' dirty' : ''}">
      <button type="button" class="btn btn-sm btn-outline-gold" id="mycharAddBtn" ${mycharDraft.length >= CHARACTER_PROFILE_MAX_CHARACTERS ? 'disabled' : ''}>+ Charakter hinzufügen</button>
      ${mycharDirty ? `<span class="bis-hint">Ungespeicherte Änderungen</span>
        <button type="button" class="btn btn-teal btn-sm" id="mycharSaveBtn">Speichern</button>
        <button type="button" class="btn btn-ghost btn-sm" id="mycharResetBtn">Verwerfen</button>` : ''}
      ${mycharStatus ? `<span class="bis-hint">${escapeHtml(mycharStatus)}</span>` : ''}
    </div>`;
  root.innerHTML = bar + (mycharDraft.length
    ? `<div class="mychar-grid">${mycharDraft.map(mycharCardHtml).join('')}</div>`
    : '<div class="lootlib-note">Du hast noch keine Charaktere hinterlegt. Leg oben Deinen ersten an.</div>');
  mycharWire(root);
  wireMycharCardButtons();
  if (focusSel){
    const box = /** @type {HTMLInputElement | null} */ (root.querySelector(focusSel));
    if (box){ box.focus(); if (box.setSelectionRange && box.type !== 'number') box.setSelectionRange(box.value.length, box.value.length); }
  }
}

/** @param {HTMLElement} root */
function mycharWire(root){
  const changed = () => { mycharDirty = true; mycharStatus = ''; mycharRender(); };
  const byId = id => mycharDraft.find(c => c.id === id);
  const on = (sel, fn) => { const el = root.querySelector(sel); if (el) el.addEventListener('click', fn); };
  on('#mycharAddBtn', () => {
    if (mycharDraft.length >= CHARACTER_PROFILE_MAX_CHARACTERS) return;
    const c = { id: nextCharacterProfileId(), name: '', realmSlug: DEFAULT_REALM_SLUG, isMain: !mycharDraft.length, professions: [], bisSets: {} };
    mycharDraft.push(c);
    mycharEditing.add(c.id);
    changed();
  });
  on('#mycharSaveBtn', mycharSave);
  on('#mycharResetBtn', () => { mycharEditing.clear(); mycharStartDraft(); mycharStatus = ''; mycharRender(); });
  root.querySelectorAll('[data-mychar-edit]').forEach(btn => btn.addEventListener('click', () => {
    const id = btn.getAttribute('data-mychar-edit');
    const c = byId(id);
    if (mycharEditing.has(id) && c && c.name.trim()) mycharEditing.delete(id); else mycharEditing.add(id);
    mycharRender();
  }));
  root.querySelectorAll('[data-mychar-field]').forEach((/** @type {HTMLInputElement} */ input) => {
    const field = input.getAttribute('data-mychar-field');
    const c = byId(input.getAttribute('data-mychar-id'));
    if (!c) return;
    if (input.tagName === 'SELECT') input.addEventListener('change', () => {
      c[field] = input.value;
      // Another class: spec and BiS sets belonged to the old one.
      if (field === 'classId'){ c.specId = ''; c.bisSets = {}; }
      changed();
    });
    // Text: update the draft quietly, re-render when leaving the field.
    else {
      input.addEventListener('input', () => { c[field] = input.value; if (!mycharDirty){ mycharDirty = true; mycharStatus = ''; } });
      input.addEventListener('change', () => mycharRender());
    }
  });
  root.querySelectorAll('[data-mychar-main]').forEach(radio => radio.addEventListener('change', () => {
    const id = radio.getAttribute('data-mychar-main');
    mycharDraft.forEach(c => { c.isMain = c.id === id; });
    changed();
  }));
  root.querySelectorAll('[data-mychar-remove]').forEach(btn => btn.addEventListener('click', async () => {
    const c = byId(btn.getAttribute('data-mychar-remove'));
    if (!c) return;
    const answer = await bisDialog('Charakter entfernen?', `„${c.name || 'Neuer Charakter'}“ wird mit Berufen und BiS-Zuweisungen entfernt (erst beim Speichern endgültig).`,
      [{ id: 'remove', label: 'Entfernen', primary: true }, { id: 'cancel', label: 'Abbrechen' }]);
    if (answer !== 'remove') return;
    mycharDraft = mycharDraft.filter(x => x !== c);
    if (c.isMain && mycharDraft.length) mycharDraft[0].isMain = true;
    changed();
  }));
  root.querySelectorAll('[data-mychar-bis]').forEach((/** @type {HTMLSelectElement} */ sel) => sel.addEventListener('change', () => {
    const [charId, specId] = sel.getAttribute('data-mychar-bis').split('|');
    const c = byId(charId);
    if (!c) return;
    c.bisSets = { ...(c.bisSets || {}) };
    if (sel.value) c.bisSets[specId] = sel.value; else delete c.bisSets[specId];
    changed();
  }));
  root.querySelectorAll('[data-mychar-open-set]').forEach(btn => btn.addEventListener('click', () => {
    const set = bisMySets[btn.getAttribute('data-mychar-open-set')];
    if (set) htpOpenBis(set.classId, set.specId, btn.getAttribute('data-mychar-open-set'));
  }));
  profWireEditor(root, mycharDraft, changed);
}

/** Write the draft as the own character profile. */
async function mycharSave(){
  const uid = discordIdentity && discordIdentity.id;
  if (!uid || !mycharDraft) return;
  if (mycharDraft.some(c => !c.name.trim())){ mycharStatus = 'Jeder Charakter braucht einen Namen.'; mycharRender(); return; }
  const previous = state.characterProfiles[uid];
  state.characterProfiles[uid] = normalizeCharacterProfile({ nickname: previous ? previous.nickname : '', characters: mycharDraft });
  mycharStatus = 'Speichere …';
  mycharRender();
  const ok = await saveData('characterProfiles/' + uid);
  if (ok){
    mycharEditing.clear();
    mycharStartDraft();
    mycharStatus = 'Gespeichert!';
    applyAccessControl();
  } else {
    if (previous) state.characterProfiles[uid] = previous; else delete state.characterProfiles[uid];
    mycharStatus = 'Konnte nicht speichern — Firebase-Regeln prüfen.';
  }
  mycharRender();
}
