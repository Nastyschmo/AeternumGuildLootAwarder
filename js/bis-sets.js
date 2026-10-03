// BiS-Planer, part 2: saved item sets and "Habe ich" (owned items).
//
// Firebase (see README § 6f for the rules):
//  - bisSets/<uid>/<setId>   private sets, only the owner reads/writes them
//  - bisPublic/<setId>       sets the owner marked "öffentlich"; every
//                            logged-in user (Community included) can read
//                            them — basis for a later public build browser
//  - bisOwned/<uid>/<itemId> = true   items the user has ("Habe ich");
//                            one tick counts in every set
// A set lives in exactly one of the two set paths; toggling "öffentlich"
// moves it with one multi-path update. Saving needs the Gildenmitglied
// role or higher (Community can browse but not create, as agreed);
// owned items work for everyone logged in. Logged out, ticks are kept in
// localStorage only.
//
// The planner's working copy is still bisDraft (js/bis-planner.js);
// bisDraft.setId names the saved set it was loaded from / saved to.

const BIS_OWNED_KEY = 'rude-bis-owned-v1';
const BIS_SET_NAME_MAX = 60;

/** @type {Record<string, BisSavedSet>} own sets, private and public, by id */
let bisMySets = {};
/** @type {Record<string, BisSavedSet>} other users' public sets, by id */
let bisOtherSets = {};
/** Owned item ids ("Habe ich"). */
let bisOwned = bisLoadLocalOwned();
/** uid the Firebase listeners are attached for ('' = none). */
let bisSyncUid = '';
/** @type {{ ref: any, cb: Function }[]} */
let bisSyncRefs = [];
let bisPrivateRaw = {}, bisPublicRaw = {};
/** Text in the set-name field, kept across re-renders. */
let bisSetNameDraft = null;
let bisSetStatus = '';

/** @returns {Set<number>} */
function bisLoadLocalOwned(){
  try {
    const v = JSON.parse(localStorage.getItem(BIS_OWNED_KEY) || '[]');
    return new Set(Array.isArray(v) ? v.map(Number).filter(n => n > 0) : []);
  } catch (e){ return new Set(); }
}
function bisSaveLocalOwned(){
  try { localStorage.setItem(BIS_OWNED_KEY, JSON.stringify([...bisOwned])); } catch (e){ /* private mode */ }
}

function bisCanSaveSets(){
  return Boolean(db && discordIdentity && isMemberOrHigher());
}

/** @param {number} itemId */
function bisIsOwned(itemId){
  return bisOwned.has(itemId);
}
/** Tick / untick an item everywhere. @param {number} itemId @param {boolean} owned */
function bisSetOwned(itemId, owned){
  if (owned) bisOwned.add(itemId); else bisOwned.delete(itemId);
  bisSaveLocalOwned();
  if (db && bisSyncUid){
    db.ref(`${DB_PATH}/bisOwned/${bisSyncUid}/${itemId}`).set(owned ? true : null)
      .catch(() => { bisSetStatus = 'Konnte „Habe ich“ nicht speichern — Firebase-Regeln aktualisiert?'; renderBisPlanner(); });
  }
}

// ---------------------------------------------------------------- sync
/** Attach / detach the Firebase listeners for the logged-in user. Cheap to call on every render. */
function bisSyncListeners(){
  const uid = (db && discordIdentity) ? discordIdentity.id : '';
  if (uid === bisSyncUid) return;
  for (const { ref, cb } of bisSyncRefs) ref.off('value', cb);
  bisSyncRefs = [];
  bisMySets = {};
  bisOtherSets = {};
  bisPrivateRaw = {};
  bisPublicRaw = {};
  bisSyncUid = uid;
  if (!uid){
    bisOwned = bisLoadLocalOwned();
    return;
  }
  const listen = (ref, onValue) => {
    const cb = (snap) => { onValue(snap.val() || {}); if (currentPage === 'bis') renderBisPlanner(); };
    ref.on('value', cb, () => { onValue({}); bisSetStatus = 'Keine Leserechte für gespeicherte Sets — Firebase-Regeln aktualisiert?'; if (currentPage === 'bis') renderBisPlanner(); });
    bisSyncRefs.push({ ref, cb });
  };
  listen(db.ref(`${DB_PATH}/bisSets/${uid}`), (v) => { bisPrivateRaw = v; bisMergeSets(); });
  // All public sets: own ones show under "Meine Sets", the others grouped by user.
  listen(db.ref(`${DB_PATH}/bisPublic`), (v) => { bisPublicRaw = v; bisMergeSets(); });
  let firstOwned = true;
  listen(db.ref(`${DB_PATH}/bisOwned/${uid}`), (v) => {
    const remote = new Set(Object.keys(v).filter(k => v[k]).map(Number));
    if (firstOwned){
      // Ticks made while logged out join the account once.
      firstOwned = false;
      const updates = {};
      for (const id of bisOwned) if (!remote.has(id)){ updates[id] = true; remote.add(id); }
      if (Object.keys(updates).length) db.ref(`${DB_PATH}/bisOwned/${uid}`).update(updates).catch(() => {});
    }
    bisOwned = remote;
    bisSaveLocalOwned();
  });
}

function bisMergeSets(){
  /** @type {Record<string, BisSavedSet>} */
  const all = {};
  for (const [id, raw] of Object.entries(bisPrivateRaw)){ const s = bisNormalizeSet(raw, false); if (s) all[id] = s; }
  /** @type {Record<string, BisSavedSet>} */
  const others = {};
  for (const [id, raw] of Object.entries(bisPublicRaw)){
    const s = bisNormalizeSet(raw, true);
    if (s) (s.ownerId === bisSyncUid ? all : others)[id] = s;
  }
  bisMySets = all;
  bisOtherSets = others;
}

/** @param {any} raw @param {boolean} isPublic @returns {BisSavedSet | null} */
function bisNormalizeSet(raw, isPublic){
  if (!raw || typeof raw !== 'object' || !CLASS_MAP[raw.classId]) return null;
  /** @type {Record<string, number>} */
  const slots = {};
  for (const s of BIS_SLOTS){
    const v = Number(raw.slots && raw.slots[s.key]);
    if (v > 0) slots[s.key] = v;
  }
  return {
    name: String(raw.name || 'Ohne Namen').slice(0, BIS_SET_NAME_MAX),
    classId: raw.classId,
    specId: String(raw.specId || ''),
    raceId: String(raw.raceId || '1'),
    level: Math.min(BIS_MAX_LEVEL, Math.max(1, Number(raw.level) || BIS_DEFAULT_LEVEL)),
    slots,
    public: isPublic,
    ownerId: String(raw.ownerId || ''),
    ownerName: String(raw.ownerName || ''),
    createdAt: Number(raw.createdAt) || 0,
    updatedAt: Number(raw.updatedAt) || 0
  };
}

/** Sets for the draft's class + spec, newest first. @returns {[string, BisSavedSet][]} */
function bisSetsForCurrentSpec(){
  const b = bisDraft;
  return Object.entries(bisMySets)
    .filter(([, s]) => s.classId === b.classId && s.specId === b.specId)
    .sort((a, z) => z[1].updatedAt - a[1].updatedAt);
}

/** A set by id, own or someone else's public one. @param {string} id */
function bisAnySet(id){
  return (id && (bisMySets[id] || bisOtherSets[id])) || null;
}
/** Is the set someone else's (read-only, can be saved as an own copy)? @param {string} id */
function bisIsForeignSet(id){
  return Boolean(id && !bisMySets[id] && bisOtherSets[id]);
}
/** Display name of a set's owner: nickname, Discord name, or the name saved with the set. @param {BisSavedSet} set */
function bisOwnerLabel(set){
  const prof = state.characterProfiles[set.ownerId];
  const role = state.discordRoles[set.ownerId];
  return (prof && prof.nickname) || (role && role.username) || set.ownerName || 'Unbekannt';
}
/** Is the set recommended by the Admins? Only public sets count (a recommended set made private again drops out). @param {string} id */
function bisIsRecommended(id){
  const set = bisAnySet(id);
  return Boolean(set && set.public && state.bisRecommended[id]);
}
/** Recommended sets for the draft's class + spec (own or others'), newest first. @returns {[string, BisSavedSet][]} */
function bisRecommendedSets(){
  const b = bisDraft;
  return Object.entries({ ...bisOtherSets, ...bisMySets })
    .filter(([id, s]) => s.classId === b.classId && s.specId === b.specId && bisIsRecommended(id))
    .sort((a, z) => z[1].updatedAt - a[1].updatedAt);
}
/** Set to open when switching to a class/spec: the newest own one, else the newest recommendation. */
function bisDefaultSetForSpec(){
  const own = bisSetsForCurrentSpec();
  if (own.length) return own[0][0];
  const rec = bisRecommendedSets();
  return rec.length ? rec[0][0] : '';
}
/** Admins mark / unmark a public set as recommended. @param {string} id @param {boolean} on */
async function bisSetRecommended(id, on){
  const set = bisAnySet(id);
  if (!set || currentRole !== 'admin') return;
  try {
    await db.ref(`${DB_PATH}/bisRecommended/${id}`).set(on ? true : null);
    bisSetStatus = on ? `„${set.name}“ wird jetzt empfohlen.` : `„${set.name}“ wird nicht mehr empfohlen.`;
  } catch (e){
    bisSetStatus = 'Empfehlung konnte nicht gespeichert werden — Firebase-Regeln aktualisiert?';
  }
  renderBisPlanner();
}

/** Other users' public sets for the draft's class + spec, grouped by owner (recommended ones are listed separately). @returns {{ owner: string, sets: [string, BisSavedSet][] }[]} */
function bisOtherSetsByOwner(){
  const b = bisDraft;
  /** @type {Map<string, { owner: string, sets: [string, BisSavedSet][] }>} */
  const groups = new Map();
  for (const [id, s] of Object.entries(bisOtherSets)){
    if (s.classId !== b.classId || s.specId !== b.specId || bisIsRecommended(id)) continue;
    if (!groups.has(s.ownerId)) groups.set(s.ownerId, { owner: bisOwnerLabel(s), sets: [] });
    groups.get(s.ownerId).sets.push([id, s]);
  }
  const list = [...groups.values()];
  list.forEach(g => g.sets.sort((a, z) => a[1].name.localeCompare(z[1].name, 'de')));
  return list.sort((a, z) => a.owner.localeCompare(z.owner, 'de'));
}

/** Does the draft differ from its saved set? */
function bisDraftDirty(){
  const set = bisAnySet(bisDraft.setId);
  if (!set) return Object.keys(bisDraft.slots).length > 0;
  if (set.raceId !== bisDraft.raceId || set.level !== bisDraft.level) return true;
  const keys = new Set([...Object.keys(set.slots), ...Object.keys(bisDraft.slots)]);
  for (const k of keys) if ((set.slots[k] || 0) !== ((bisDraft.slots[k] && bisDraft.slots[k].itemId) || 0)) return true;
  return false;
}

// ---------------------------------------------------------------- actions
/** @param {string} id */
function bisLoadSet(id){
  const set = bisAnySet(id);
  if (!set) return;
  bisDraft = {
    classId: set.classId, specId: set.specId, raceId: set.raceId, level: set.level, setId: id,
    slots: Object.fromEntries(Object.entries(set.slots).map(([k, itemId]) => [k, { itemId }]))
  };
  bisSetNameDraft = null;
  bisSetStatus = '';
  bisSaveDraft();
  renderBisPlanner();
}

/** Payload written to Firebase for the current draft. @param {string} name @param {BisSavedSet} [prev] */
function bisSetPayload(name, prev){
  const b = bisDraft;
  const now = firebase.database.ServerValue.TIMESTAMP;
  return {
    name, classId: b.classId, specId: b.specId, raceId: b.raceId, level: b.level,
    slots: Object.fromEntries(Object.entries(b.slots).map(([k, v]) => [k, v.itemId])),
    ownerId: discordIdentity.id,
    ownerName: (state.characterProfiles[discordIdentity.id] && state.characterProfiles[discordIdentity.id].nickname) || discordIdentity.username || '',
    createdAt: prev && prev.createdAt ? prev.createdAt : now,
    updatedAt: now
  };
}
function bisSetPath(id, isPublic){
  return isPublic ? `bisPublic/${id}` : `bisSets/${bisSyncUid}/${id}`;
}

/**
 * Save the draft: into its own set, or as a new one (always new for
 * someone else's public set). @param {boolean} asNew @returns {Promise<boolean>}
 */
async function bisSaveSet(asNew){
  if (!bisCanSaveSets()) return false;
  const current = bisAnySet(bisDraft.setId);
  const name = (bisSetNameDraft !== null ? bisSetNameDraft : (current ? current.name : '')).trim().slice(0, BIS_SET_NAME_MAX);
  if (!name){ bisSetStatus = 'Bitte gib dem Set einen Namen.'; renderBisPlanner(); return false; }
  const prev = !asNew && bisDraft.setId ? bisMySets[bisDraft.setId] : null;
  let ok = false;
  const id = prev ? bisDraft.setId : db.ref(`${DB_PATH}/bisSets`).push().key;
  const isPublic = prev ? prev.public : false;
  try {
    await db.ref(`${DB_PATH}/${bisSetPath(id, isPublic)}`).set(bisSetPayload(name, prev));
    bisDraft.setId = id;
    bisSetNameDraft = null;
    bisSetStatus = prev ? `„${name}“ gespeichert.` : `Neues Set „${name}“ angelegt.`;
    bisSaveDraft();
    ok = true;
  } catch (e){
    bisSetStatus = 'Speichern fehlgeschlagen — Firebase-Regeln aktualisiert?';
  }
  renderBisPlanner();
  return ok;
}

async function bisDeleteSet(){
  const id = bisDraft.setId, set = id && bisMySets[id];
  if (!set) return;
  const answer = await bisDialog('Set löschen?', `Das Set „${set.name}“ wird endgültig gelöscht. Deine aktuelle Auswahl bleibt als Entwurf erhalten.`,
    [{ id: 'delete', label: 'Löschen', primary: true }, { id: 'cancel', label: 'Abbrechen' }]);
  if (answer !== 'delete') return;
  try {
    await db.ref(`${DB_PATH}/${bisSetPath(id, set.public)}`).remove();
    bisDraft.setId = '';
    bisSetNameDraft = null;
    bisSetStatus = `„${set.name}“ gelöscht. Die Auswahl bleibt als Entwurf erhalten.`;
    bisSaveDraft();
  } catch (e){
    bisSetStatus = 'Löschen fehlgeschlagen.';
  }
  renderBisPlanner();
}

/** Move the active set between private and public. @param {boolean} makePublic */
async function bisSetPublic(makePublic){
  const id = bisDraft.setId, set = id && bisMySets[id];
  if (!set || set.public === makePublic) return;
  const payload = bisSetPayload(set.name, set);
  payload.slots = set.slots; // move the saved version, not unsaved draft edits
  payload.raceId = set.raceId;
  payload.level = set.level;
  try {
    await db.ref(DB_PATH).update({ [bisSetPath(id, set.public)]: null, [bisSetPath(id, makePublic)]: payload });
    bisSetStatus = makePublic ? `„${set.name}“ ist jetzt öffentlich.` : `„${set.name}“ ist wieder privat.`;
  } catch (e){
    bisSetStatus = 'Ändern fehlgeschlagen.';
  }
  renderBisPlanner();
}

// ---------------------------------------------------------------- dialog
/**
 * Styled replacement for confirm(): a small modal with any buttons.
 * Resolves with the clicked button's id, or 'cancel' on Escape / backdrop.
 * @param {string} title @param {string} text
 * @param {{ id: string, label: string, primary?: boolean }[]} buttons
 * @returns {Promise<string>}
 */
function bisDialog(title, text, buttons){
  return new Promise((resolve) => {
    els.bisDialogTitle.textContent = title;
    els.bisDialogText.textContent = text;
    els.bisDialogActions.innerHTML = buttons.map(b =>
      `<button type="button" class="btn btn-sm ${b.primary ? 'btn-teal' : 'btn-ghost'}" data-bis-dialog="${escapeHtml(b.id)}">${escapeHtml(b.label)}</button>`).join('');
    const close = (answer) => {
      els.bisDialog.classList.add('hidden');
      els.bisDialog.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKey, true);
      resolve(answer);
    };
    const onBackdrop = (e) => { if (e.target === els.bisDialog) close('cancel'); };
    const onKey = (e) => { if (e.key === 'Escape'){ e.stopPropagation(); close('cancel'); } };
    els.bisDialogActions.querySelectorAll('[data-bis-dialog]').forEach(btn =>
      btn.addEventListener('click', () => close(btn.getAttribute('data-bis-dialog'))));
    els.bisDialog.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey, true);
    els.bisDialog.classList.remove('hidden');
    const first = /** @type {HTMLButtonElement | null} */ (els.bisDialogActions.querySelector('button'));
    if (first) first.focus();
  });
}

/**
 * Before leaving the active set (other set, class, spec): if it has
 * unsaved changes, ask — Speichern / Verwerfen / Weiter bearbeiten.
 * @returns {Promise<boolean>} true = go on
 */
async function bisConfirmLeave(){
  const set = bisAnySet(bisDraft.setId);
  if (!set || !bisDraftDirty()) return true;
  const foreign = bisIsForeignSet(bisDraft.setId);
  /** @type {{ id: string, label: string, primary?: boolean }[]} */
  const buttons = [];
  if (bisCanSaveSets()) buttons.push({ id: 'save', label: foreign ? 'Als eigenes Set speichern' : 'Speichern', primary: true });
  buttons.push({ id: 'discard', label: 'Verwerfen' }, { id: 'stay', label: 'Weiter bearbeiten' });
  const answer = await bisDialog('Ungespeicherte Änderungen',
    foreign
      ? `Du hast das öffentliche Set „${set.name}“ von ${bisOwnerLabel(set)} verändert. Als eigenes Set speichern, die Änderungen verwerfen oder weiter bearbeiten?`
      : `Das Set „${set.name}“ hat ungespeicherte Änderungen. Speichern, verwerfen oder weiter bearbeiten?`,
    buttons);
  if (answer === 'save') return bisSaveSet(foreign);
  return answer === 'discard';
}

// ---------------------------------------------------------------- UI
/** The "Item-Set" bar above the slots. */
function bisSetBarHtml(){
  if (!discordIdentity){
    return `<div class="bis-setbar"><span class="bis-hint">Melde Dich mit Discord an, um Item-Sets zu speichern und öffentliche Sets anderer anzusehen. Bis dahin bleibt Deine Auswahl in diesem Browser.</span></div>`;
  }
  const canSave = isMemberOrHigher();
  const recommended = bisRecommendedSets();
  const mine = canSave ? bisSetsForCurrentSpec().filter(([id]) => !bisIsRecommended(id)) : [];
  const others = bisOtherSetsByOwner();
  const active = bisAnySet(bisDraft.setId);
  const foreign = bisIsForeignSet(bisDraft.setId);
  const name = bisSetNameDraft !== null ? bisSetNameDraft : (active ? active.name : '');
  const dirty = bisDraftDirty();
  const opt = ([id, s], extra) => `<option value="${escapeHtml(id)}" ${id === bisDraft.setId ? 'selected' : ''}>${escapeHtml(s.name)}${extra || ''}</option>`;
  const select = `<div class="bis-control bis-setbar-select">
      <label for="bisSetSelect">Item-Set</label>
      <select id="bisSetSelect">
        <option value="">${active ? '— neuer Entwurf —' : '— ungespeicherter Entwurf —'}</option>
        ${recommended.length ? `<optgroup label="★ Empfohlen">${recommended.map(e => opt(e, ` — ${escapeHtml(bisOwnerLabel(e[1]))}`)).join('')}</optgroup>` : ''}
        ${mine.length ? `<optgroup label="Meine Sets">${mine.map(e => opt(e, e[1].public ? ' · öffentlich' : '')).join('')}</optgroup>` : ''}
        ${others.map(g => `<optgroup label="Öffentlich von ${escapeHtml(g.owner)}">${g.sets.map(e => opt(e, ` — ${escapeHtml(g.owner)}`)).join('')}</optgroup>`).join('')}
      </select>
    </div>`;
  const recNote = active && bisIsRecommended(bisDraft.setId)
    ? '<span class="bis-rec-badge">★ Von der Gildenleitung empfohlen</span> '
    : '';
  const foreignNote = foreign
    ? `<div class="bis-setbar-owner">${recNote}Öffentliches Set von <strong>${escapeHtml(bisOwnerLabel(active))}</strong>${canSave ? ' — Änderungen kannst Du als eigenes Set speichern.' : ''}</div>`
    : (recNote ? `<div class="bis-setbar-owner">${recNote}</div>` : '');
  // Admins: recommend the loaded set (only public ones can be recommended).
  const recToggle = active && currentRole === 'admin'
    ? (active.public
      ? `<label class="bis-check bis-rec-toggle" title="Empfohlene Sets stehen bei allen ganz oben im Dropdown."><input type="checkbox" id="bisSetRecommend" ${bisIsRecommended(bisDraft.setId) ? 'checked' : ''}> ★ empfehlen</label>`
      : `<label class="bis-check bis-rec-toggle" title="Nur öffentliche Sets können empfohlen werden."><input type="checkbox" disabled> ★ empfehlen (erst öffentlich machen)</label>`)
    : '';
  if (!canSave){
    return `<div class="bis-setbar">
      ${select}
      ${foreignNote}
      <div class="bis-setbar-status"><span class="bis-hint">${others.length ? 'Öffentliche Sets anderer ansehen kannst Du; eigene speichern können Gildenmitglieder.' : 'Item-Sets speichern können Gildenmitglieder. Für diese Spec gibt es noch keine öffentlichen Sets.'}</span></div>
    </div>`;
  }
  let actions;
  if (active && !foreign){
    actions = `<button type="button" class="btn btn-teal btn-sm" id="bisSetSaveBtn" ${dirty || bisSetNameDraft !== null ? '' : 'disabled'}>Speichern</button>
      <button type="button" class="btn btn-ghost btn-sm" id="bisSetSaveNewBtn">Als neues Set</button>
      <button type="button" class="btn btn-ghost btn-sm" id="bisSetDeleteBtn">Löschen</button>
      <label class="bis-check" title="Öffentliche Sets können alle Eingeloggten sehen, auch Community."><input type="checkbox" id="bisSetPublic" ${active.public ? 'checked' : ''}> öffentlich</label>
      ${recToggle}`;
  } else {
    actions = `<button type="button" class="btn btn-teal btn-sm" id="bisSetSaveNewBtn">${foreign ? 'Als eigenes Set speichern' : 'Set speichern'}</button>
      ${foreign ? recToggle : ''}`;
  }
  return `<div class="bis-setbar">
    ${select}
    <div class="bis-control bis-setbar-name">
      <label for="bisSetName">Name</label>
      <input type="text" id="bisSetName" class="apply-text-input" maxlength="${BIS_SET_NAME_MAX}" placeholder="z. B. Raid: Ragnaros, AoE-Farm, PvP" value="${escapeHtml(name)}">
    </div>
    <div class="bis-setbar-actions">${actions}</div>
    ${foreignNote}
    <div class="bis-setbar-status">${dirty && active ? '<span class="bis-dirty">● ungespeicherte Änderungen</span> ' : ''}${escapeHtml(bisSetStatus)}</div>
  </div>`;
}

/** @param {HTMLElement} root */
function bisWireSetBar(root){
  const sel = /** @type {HTMLSelectElement | null} */ (root.querySelector('#bisSetSelect'));
  if (!sel) return;
  sel.addEventListener('change', async () => {
    const target = sel.value;
    sel.value = bisDraft.setId || ''; // stays until the user confirms
    if (!(await bisConfirmLeave())) return;
    if (target) bisLoadSet(target);
    else { bisDraft.setId = ''; bisSetNameDraft = null; bisSetStatus = ''; bisSaveDraft(); renderBisPlanner(); }
  });
  const nameInput = /** @type {HTMLInputElement | null} */ (root.querySelector('#bisSetName'));
  if (nameInput){
    nameInput.addEventListener('input', () => {
      bisSetNameDraft = nameInput.value;
      const btn = /** @type {HTMLButtonElement | null} */ (root.querySelector('#bisSetSaveBtn'));
      if (btn) btn.disabled = false;
    });
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter'){ e.preventDefault(); bisSaveSet(!bisDraft.setId || bisIsForeignSet(bisDraft.setId)); }
    });
  }
  const on = (id, fn) => { const el = root.querySelector(id); if (el) el.addEventListener('click', fn); };
  on('#bisSetSaveBtn', () => bisSaveSet(false));
  on('#bisSetSaveNewBtn', () => bisSaveSet(true));
  on('#bisSetDeleteBtn', bisDeleteSet);
  const pub = /** @type {HTMLInputElement | null} */ (root.querySelector('#bisSetPublic'));
  if (pub) pub.addEventListener('change', () => bisSetPublic(pub.checked));
  const rec = /** @type {HTMLInputElement | null} */ (root.querySelector('#bisSetRecommend'));
  if (rec) rec.addEventListener('change', () => bisSetRecommended(bisDraft.setId, rec.checked));
}
