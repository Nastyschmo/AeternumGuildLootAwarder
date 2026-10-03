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
  listen(db.ref(`${DB_PATH}/bisPublic`).orderByChild('ownerId').equalTo(uid), (v) => { bisPublicRaw = v; bisMergeSets(); });
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
  for (const [id, raw] of Object.entries(bisPublicRaw)){ const s = bisNormalizeSet(raw, true); if (s) all[id] = s; }
  bisMySets = all;
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

/** Does the draft differ from its saved set? */
function bisDraftDirty(){
  const set = bisDraft.setId && bisMySets[bisDraft.setId];
  if (!set) return Object.keys(bisDraft.slots).length > 0;
  if (set.raceId !== bisDraft.raceId || set.level !== bisDraft.level) return true;
  const keys = new Set([...Object.keys(set.slots), ...Object.keys(bisDraft.slots)]);
  for (const k of keys) if ((set.slots[k] || 0) !== ((bisDraft.slots[k] && bisDraft.slots[k].itemId) || 0)) return true;
  return false;
}

// ---------------------------------------------------------------- actions
/** @param {string} id */
function bisLoadSet(id){
  const set = bisMySets[id];
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

/** Save the draft: into its set, or as a new one. @param {boolean} asNew */
async function bisSaveSet(asNew){
  if (!bisCanSaveSets()) return;
  const name = (bisSetNameDraft !== null ? bisSetNameDraft : (bisMySets[bisDraft.setId] || {}).name || '').trim().slice(0, BIS_SET_NAME_MAX);
  if (!name){ bisSetStatus = 'Bitte gib dem Set einen Namen.'; renderBisPlanner(); return; }
  const prev = !asNew && bisDraft.setId ? bisMySets[bisDraft.setId] : null;
  const id = prev ? bisDraft.setId : db.ref(`${DB_PATH}/bisSets`).push().key;
  const isPublic = prev ? prev.public : false;
  try {
    await db.ref(`${DB_PATH}/${bisSetPath(id, isPublic)}`).set(bisSetPayload(name, prev));
    bisDraft.setId = id;
    bisSetNameDraft = null;
    bisSetStatus = prev ? `„${name}“ gespeichert.` : `Neues Set „${name}“ angelegt.`;
    bisSaveDraft();
  } catch (e){
    bisSetStatus = 'Speichern fehlgeschlagen — Firebase-Regeln aktualisiert?';
  }
  renderBisPlanner();
}

async function bisDeleteSet(){
  const id = bisDraft.setId, set = id && bisMySets[id];
  if (!set || !confirm(`Set „${set.name}“ wirklich löschen?`)) return;
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

// ---------------------------------------------------------------- UI
/** The "Item-Set" bar above the slots. */
function bisSetBarHtml(){
  if (!discordIdentity){
    return `<div class="bis-setbar"><span class="bis-hint">Melde Dich mit Discord an, um Item-Sets zu speichern — z. B. eins für Raids, eins für AoE-Farmen. Bis dahin bleibt Deine Auswahl in diesem Browser.</span></div>`;
  }
  if (!isMemberOrHigher()){
    return `<div class="bis-setbar"><span class="bis-hint">Item-Sets speichern können Gildenmitglieder. Deine Auswahl bleibt in diesem Browser.</span></div>`;
  }
  const sets = bisSetsForCurrentSpec();
  const active = bisDraft.setId && bisMySets[bisDraft.setId];
  const name = bisSetNameDraft !== null ? bisSetNameDraft : (active ? active.name : '');
  const dirty = bisDraftDirty();
  return `<div class="bis-setbar">
    <div class="bis-control">
      <label for="bisSetSelect">Item-Set</label>
      <select id="bisSetSelect">
        <option value="">${active ? '— neuer Entwurf —' : '— ungespeicherter Entwurf —'}</option>
        ${sets.map(([id, s]) => `<option value="${escapeHtml(id)}" ${id === bisDraft.setId ? 'selected' : ''}>${escapeHtml(s.name)}${s.public ? ' (öffentlich)' : ''}</option>`).join('')}
      </select>
    </div>
    <div class="bis-control bis-setbar-name">
      <label for="bisSetName">Name</label>
      <input type="text" id="bisSetName" class="apply-text-input" maxlength="${BIS_SET_NAME_MAX}" placeholder="z. B. Raid: Ragnaros, AoE-Farm, PvP" value="${escapeHtml(name)}">
    </div>
    <div class="bis-setbar-actions">
      ${active
        ? `<button type="button" class="btn btn-teal btn-sm" id="bisSetSaveBtn" ${dirty || bisSetNameDraft !== null ? '' : 'disabled'}>Speichern</button>
           <button type="button" class="btn btn-ghost btn-sm" id="bisSetSaveNewBtn">Als neues Set</button>
           <button type="button" class="btn btn-ghost btn-sm" id="bisSetDeleteBtn">Löschen</button>
           <label class="bis-check" title="Öffentliche Sets können alle Eingeloggten sehen, auch Community."><input type="checkbox" id="bisSetPublic" ${active.public ? 'checked' : ''}> öffentlich</label>`
        : `<button type="button" class="btn btn-teal btn-sm" id="bisSetSaveNewBtn">Set speichern</button>`}
    </div>
    <div class="bis-setbar-status">${dirty && active ? '<span class="bis-dirty">● ungespeicherte Änderungen</span> ' : ''}${escapeHtml(bisSetStatus)}</div>
  </div>`;
}

/** @param {HTMLElement} root */
function bisWireSetBar(root){
  const sel = /** @type {HTMLSelectElement | null} */ (root.querySelector('#bisSetSelect'));
  if (!sel) return;
  sel.addEventListener('change', () => {
    if (bisDraftDirty() && !confirm('Ungespeicherte Änderungen verwerfen?')){ sel.value = bisDraft.setId || ''; return; }
    if (sel.value) bisLoadSet(sel.value);
    else { bisDraft.setId = ''; bisSetNameDraft = null; bisSetStatus = ''; bisSaveDraft(); renderBisPlanner(); }
  });
  const nameInput = /** @type {HTMLInputElement} */ (root.querySelector('#bisSetName'));
  nameInput.addEventListener('input', () => {
    bisSetNameDraft = nameInput.value;
    const btn = /** @type {HTMLButtonElement | null} */ (root.querySelector('#bisSetSaveBtn'));
    if (btn) btn.disabled = false;
  });
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter'){ e.preventDefault(); bisSaveSet(!bisDraft.setId); } });
  const on = (id, fn) => { const el = root.querySelector(id); if (el) el.addEventListener('click', fn); };
  on('#bisSetSaveBtn', () => bisSaveSet(false));
  on('#bisSetSaveNewBtn', () => bisSaveSet(true));
  on('#bisSetDeleteBtn', bisDeleteSet);
  const pub = /** @type {HTMLInputElement | null} */ (root.querySelector('#bisSetPublic'));
  if (pub) pub.addEventListener('change', () => bisSetPublic(pub.checked));
}
