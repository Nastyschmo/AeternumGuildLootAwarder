// Raids page: raid calendar with sign-ups.
//
// Firebase (own listeners, started when the page opens — not SYNCED_KEYS):
//  - raidEvents/<id> = { title, instance, start (ms), note, createdBy,
//    createdAt, updatedAt, srMax, srLocked, signupState, size, targets,
//    roster, rosterPublished } — Officers / Admins create, edit, delete.
//    srMax > 0 turns on soft-reserves (js/raid-reserves.js); size /
//    targets / roster / rosterPublished are the Aufstellung
//    (js/raid-comp.js).
//  - raidSignups/<eventId>/<uid>/<charKey> = { status: 'yes' | 'maybe' |
//    'no', name, charName, classId, specId, note, updatedAt } — a member
//    signs up any number of own characters (charKey = the character's id
//    from Meine Charaktere, or "n_<name>" for a typed name). Older data
//    with the sign-up directly under <uid> is read as one character.
// Sign-ups close 24 h before the start; officers can close earlier
// (signupState 'closed') or reopen ('open') — the rules enforce it
// (README § 6f). Everyone logged in can read both. The role (tank /
// healer / damage) comes from the chosen spec (foreverSpecRole).

// Forever's announced raids (unlock 9 Dec 2026), name -> raid size. Add
// new raids here when Blizzard announces them (spring / summer 2027).
const RAID_INSTANCES = { 'Barrow Deeps': 10, 'Hyjal Summit': 20, "Onyxia's Lair": 40 };
const RAID_LAST_SIGNUP_KEY = 'rude-raid-last-signup-v1';
const RAID_STATUS_LABELS = { yes: 'Dabei', maybe: 'Vielleicht', no: 'Absage' };
/** Show events up to this long after their start in "Kommende" (a raid evening). */
const RAID_RUNNING_MS = 6 * 3600 * 1000;
/** Sign-ups close this long before the start (unless an officer reopens). */
const RAID_SIGNUP_CLOSE_MS = 24 * 3600 * 1000;

/** eventId -> uid -> charKey -> sign-up. @type {Record<string, Record<string, Record<string, RaidSignup>>>} */
let raidSignups = {};
/** @type {Record<string, RaidEvent>} */
let raidEvents = {};
let raidSyncUid = '';
let raidLoadError = '';
/** Event being edited by an Officer ('' = new event form, null = form closed). @type {string | null} */
let raidEditId = null;
let raidStatusMsg = '';

function raidSync(){
  const uid = (db && discordIdentity) ? discordIdentity.id : '';
  if (!uid || uid === raidSyncUid) return;
  raidSyncUid = uid;
  const rerender = () => { if (currentPage === 'raids') renderRaidsPage(); if (currentPage === 'loot') renderLootPage(); };
  db.ref(`${DB_PATH}/raidEvents`).on('value', snap => {
    /** @type {Record<string, RaidEvent>} */
    const out = {};
    for (const [id, raw] of Object.entries(snap.val() || {})) { const e = raidNormalizeEvent(raw); if (e) out[id] = e; }
    raidEvents = out;
    raidLoadError = '';
    rerender();
  }, () => { raidLoadError = 'Keine Leserechte für Raids — Firebase-Regeln aktualisiert?'; rerender(); });
  db.ref(`${DB_PATH}/raidSignups`).on('value', snap => {
    /** @type {Record<string, Record<string, Record<string, RaidSignup>>>} */
    const out = {};
    for (const [eventId, byUid] of Object.entries(snap.val() || {})) {
      out[eventId] = {};
      for (const [u, raw] of Object.entries(byUid || {})) {
        if (!raw || typeof raw !== 'object') continue;
        /** @type {Record<string, RaidSignup>} */
        const chars = {};
        // Old shape: one sign-up directly under <uid>.
        if (raw.status){ const s = raidNormalizeSignup(raw); if (s) chars.legacy = s; }
        else for (const [k, r] of Object.entries(raw)) { const s = raidNormalizeSignup(r); if (s) chars[k] = s; }
        if (Object.keys(chars).length) out[eventId][u] = chars;
      }
    }
    raidSignups = out;
    rerender();
  }, () => { raidLoadError = 'Keine Leserechte für Raid-Anmeldungen — Firebase-Regeln aktualisiert?'; rerender(); });
  raidReserveSync();
}

/** @param {any} raw @returns {RaidEvent | null} */
function raidNormalizeEvent(raw){
  if (!raw || typeof raw !== 'object' || !Number(raw.start)) return null;
  const size = [10, 20, 40].includes(Number(raw.size)) ? Number(raw.size) : 0;
  const t = raw.targets && typeof raw.targets === 'object' ? raw.targets : null;
  return {
    title: String(raw.title || raw.instance || 'Raid').slice(0, 80),
    instance: String(raw.instance || '').slice(0, 60),
    start: Number(raw.start),
    note: String(raw.note || '').slice(0, 500),
    createdBy: String(raw.createdBy || ''),
    createdAt: Number(raw.createdAt) || 0,
    updatedAt: Number(raw.updatedAt) || 0,
    srMax: Math.min(RAID_SR_MAX, Math.max(0, Math.trunc(Number(raw.srMax)) || 0)),
    srLocked: raw.srLocked === true,
    signupState: raw.signupState === 'closed' || raw.signupState === 'open' ? raw.signupState : 'auto',
    size,
    targets: t ? { tank: Math.max(0, Number(t.tank) || 0), healer: Math.max(0, Number(t.healer) || 0), damage: Math.max(0, Number(t.damage) || 0) } : null,
    roster: Object.fromEntries(Object.entries(raw.roster && typeof raw.roster === 'object' ? raw.roster : {}).filter(([, v]) => v === true)),
    rosterPublished: raw.rosterPublished === true
  };
}
/** @param {any} raw @returns {RaidSignup | null} */
function raidNormalizeSignup(raw){
  if (!raw || typeof raw !== 'object' || !RAID_STATUS_LABELS[raw.status] || !CLASS_MAP[raw.classId]) return null;
  return {
    status: raw.status,
    name: String(raw.name || '').slice(0, 60),
    charName: String(raw.charName || '').slice(0, 40),
    classId: raw.classId,
    specId: String(raw.specId || ''),
    note: String(raw.note || '').slice(0, 120),
    updatedAt: Number(raw.updatedAt) || 0
  };
}

/** Every character sign-up of an event, flat. @param {string} eventId */
function raidSignupList(eventId){
  const out = [];
  for (const [uid, chars] of Object.entries(raidSignups[eventId] || {})) {
    for (const [charKey, s] of Object.entries(chars)) out.push({ uid, charKey, key: `${uid}|${charKey}`, ...s, role: foreverSpecRole(s.classId, s.specId) });
  }
  return out;
}
/** A member's most committed sign-up (Dabei before Vielleicht before Absage). @param {string} eventId @param {string} uid */
function raidUserSignup(eventId, uid){
  const rank = { yes: 0, maybe: 1, no: 2 };
  const list = Object.values((raidSignups[eventId] || {})[uid] || {}).sort((a, z) => rank[a.status] - rank[z.status]);
  return list[0] || null;
}
/** Can members still change their sign-ups? @param {RaidEvent} e */
function raidSignupOpen(e){
  if (e.signupState === 'closed') return false;
  if (e.signupState === 'open') return true;
  return Date.now() < e.start - RAID_SIGNUP_CLOSE_MS;
}
/** Character key for a sign-up. @param {Character | undefined} c @param {string} name */
function raidCharKey(c, name){
  return c ? c.id : 'n_' + name.toLowerCase().replace(/[^a-z0-9äöüß]/g, '').slice(0, 30);
}

/** Display name of the logged-in user (nickname, Discord name). */
function raidMyName(){
  const uid = discordIdentity && discordIdentity.id;
  const prof = uid && state.characterProfiles[uid];
  const role = uid && state.discordRoles[uid];
  return (prof && prof.nickname) || (role && role.username) || (discordIdentity && discordIdentity.username) || '';
}
/** Characters from "Meine Charaktere", mains first. @returns {Character[]} */
function raidMyCharacters(){
  const uid = discordIdentity && discordIdentity.id;
  const prof = uid && state.characterProfiles[uid];
  return prof ? [...prof.characters].sort((a, z) => Number(characterIsRaider(z)) - Number(characterIsRaider(a)) || Number(z.isMain) - Number(a.isMain)) : [];
}
/** The member's character behind a sign-up (null for typed names). @param {string} uid @param {string} charKey @param {string} charName */
function raidSignupChar(uid, charKey, charName){
  const prof = state.characterProfiles[uid];
  if (!prof) return null;
  return prof.characters.find(c => c.id === charKey) || prof.characters.find(c => c.name.toLowerCase() === (charName || '').toLowerCase()) || null;
}
/** Last sign-up choice (character, class, spec), for the next form. */
function raidLastChoice(){
  try {
    const v = JSON.parse(localStorage.getItem(RAID_LAST_SIGNUP_KEY) || 'null');
    if (v && CLASS_MAP[v.classId]) return v;
  } catch (e){ /* ignore */ }
  const main = raidMyCharacters()[0];
  const classId = (main && main.classId) || 'warrior';
  return { charName: main ? main.name : '', classId, specId: (main && main.specId) || foreverSpecsForClass(classId)[0].id };
}

/** "Fr., 10.10. · 20:00" @param {number} ms */
function raidDateLabel(ms){
  const d = new Date(ms);
  return `${d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })} · ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`;
}

/** Sign-ups of an event, split by status and role. @param {string} eventId */
function raidRoster(eventId){
  const list = raidSignupList(eventId);
  const by = st => list.filter(s => s.status === st).sort((a, z) => a.classId.localeCompare(z.classId) || (a.charName || a.name).localeCompare(z.charName || z.name, 'de'));
  const yes = by('yes');
  return {
    yes, maybe: by('maybe'), no: by('no'),
    players: new Set(list.filter(s => s.status === 'yes').map(s => s.uid)).size,
    tank: yes.filter(s => s.role === 'tank'), healer: yes.filter(s => s.role === 'healer'), damage: yes.filter(s => s.role === 'damage')
  };
}

/** @param {{ uid: string, charKey?: string, name: string, charName: string, classId: string, specId: string, note: string }} s */
function raidChipHtml(s){
  const cls = CLASS_MAP[s.classId];
  const char = s.charKey ? raidSignupChar(s.uid, s.charKey, s.charName) : null;
  const twink = char && !characterIsRaider(char);
  const title = [s.name, `${cls.label} · ${foreverSpecLabel(s.classId, s.specId)}`, twink ? 'Twink' : '', s.note].filter(Boolean).join(' — ');
  return `<span class="raid-chip${twink ? ' raid-chip-twink' : ''}" style="--class-color:${cls.color}" title="${escapeHtml(title)}">${escapeHtml(s.charName || s.name || 'Unbekannt')}${twink ? ' <small>T</small>' : ''}${s.note ? ' 💬' : ''}</span>`;
}

/** The own sign-up controls of an event: one form, one line per signed-up character. @param {string} id */
function raidSignupFormHtml(id){
  if (!isMemberOrHigher()) return '<p class="bis-hint">Anmelden können sich Gildenmitglieder.</p>';
  const e = raidEvents[id];
  const mineAll = (raidSignups[id] || {})[discordIdentity.id] || {};
  const mineList = Object.entries(mineAll);
  const open = raidSignupOpen(e);
  const closesAt = e.start - RAID_SIGNUP_CLOSE_MS;
  const own = mineList.length ? `<div class="raid-own-signups">${mineList.map(([k, s]) => `<span class="raid-own-signup">
      ${raidChipHtml({ uid: discordIdentity.id, charKey: k, ...s })}
      <span class="bis-item-meta">${escapeHtml(foreverSpecLabel(s.classId, s.specId))} · ${RAID_STATUS_LABELS[s.status]}</span>
      ${open ? `<button type="button" class="loot-del" data-raid-withdraw="${escapeHtml(id)}|${escapeHtml(k)}" title="Diesen Charakter abmelden" aria-label="Abmelden">×</button>` : ''}
    </span>`).join('')}</div>` : '';
  if (!open){
    return `<div class="raid-signup raid-signup-closed">
      <p class="bis-hint">🔒 Anmeldung geschlossen${e.signupState === 'closed' ? ' (von den Offizieren)' : ''} — Änderungen bitte direkt an die Raidleitung.</p>
      ${own}
    </div>`;
  }
  const v = raidLastChoice();
  const chars = raidMyCharacters();
  const knownChar = chars.find(c => c.name === v.charName);
  const known = Boolean(knownChar);
  // A character from "Meine Charaktere" with a class set fixes the class;
  // only the spec stays free (e.g. tank or damage for this raid).
  const lockedClass = knownChar && knownChar.classId;
  const classId = lockedClass || v.classId;
  const specs = foreverSpecsForClass(classId);
  const specId = specs.some(s => s.id === v.specId) ? v.specId : ((knownChar && knownChar.specId) || specs[0].id);
  const btn = st => `<button type="button" class="btn btn-sm btn-ghost" data-raid-status="${st}" data-raid-id="${escapeHtml(id)}">${RAID_STATUS_LABELS[st]}</button>`;
  return `<div class="raid-signup" data-raid-form="${escapeHtml(id)}">
    ${own}
    <div class="raid-signup-fields">
      ${chars.length ? `<select data-raid-char aria-label="Charakter">
        ${chars.map((c, i) => `<option value="${i}" ${c.name === v.charName ? 'selected' : ''}>${characterIsRaider(c) ? '' : '(Twink) '}${escapeHtml(c.name)}${c.classId ? ` (${escapeHtml(CLASS_MAP[c.classId].label)})` : ''}</option>`).join('')}
        <option value="other" ${known ? '' : 'selected'}>Anderer Charakter …</option>
      </select>` : ''}
      <input type="text" class="apply-text-input${known ? ' hidden' : ''}" data-raid-field="charName" maxlength="40" placeholder="Charaktername" value="${escapeHtml(v.charName || '')}">
      <select data-raid-field="classId" ${lockedClass ? 'disabled title="Klasse aus Meine Charaktere"' : ''}>${CLASSES.map(c => `<option value="${c.id}" ${c.id === classId ? 'selected' : ''}>${escapeHtml(c.label)}</option>`).join('')}</select>
      <select data-raid-field="specId">${specs.map(s => `<option value="${s.id}" ${s.id === specId ? 'selected' : ''}>${escapeHtml(s.label)} (${escapeHtml(FOREVER_ROLE_LABELS[s.role])})</option>`).join('')}</select>
      <input type="text" class="apply-text-input" data-raid-field="note" maxlength="120" placeholder="Notiz (optional), z. B. „komme 20:15“">
    </div>
    <p class="bis-hint raid-class-hint${known && !lockedClass ? '' : ' hidden'}">Tipp: Hinterleg die Klasse des Charakters auf der Seite „Meine Charaktere“ — dann wird sie hier fest übernommen.</p>
    <div class="raid-signup-buttons">${btn('yes')}${btn('maybe')}${btn('no')}
      <span class="bis-item-meta">${mineList.length ? 'Weiteren Charakter anmelden oder einen angemeldeten ändern.' : 'Du kannst mehrere Charaktere anmelden — die Offiziere stellen daraus den Raid zusammen.'} Anmeldeschluss: ${e.signupState === 'open' ? 'von den Offizieren offen gehalten' : escapeHtml(raidDateLabel(closesAt))}</span>
    </div>
  </div>`;
}

/** @param {string} id @param {RaidEvent} e @param {boolean} past */
function raidEventCardHtml(id, e, past){
  const r = raidRoster(id);
  const canManage = isOfficerOrAdmin();
  const col = (label, list) => `<div class="raid-col"><div class="raid-col-head">${label} <span>${list.length}</span></div>${list.length ? list.map(raidChipHtml).join('') : '<span class="bis-item-meta">—</span>'}</div>`;
  const signupsHtml = `<div class="raid-roster">
      ${col('Tanks', r.tank)}${col('Heiler', r.healer)}${col('Damage', r.damage)}
    </div>
    ${r.maybe.length || r.no.length ? `<div class="raid-roster-extra">
      ${r.maybe.length ? `<div><span class="raid-col-head">Vielleicht</span> ${r.maybe.map(raidChipHtml).join('')}</div>` : ''}
      ${r.no.length ? `<div><span class="raid-col-head">Absagen</span> ${r.no.map(raidChipHtml).join('')}</div>` : ''}
    </div>` : ''}`;
  const published = e.rosterPublished && Object.keys(e.roster).length;
  return `<div class="tac-card raid-card${past ? ' raid-past' : ''}">
    <div class="raid-head">
      <div>
        <div class="raid-date">${escapeHtml(raidDateLabel(e.start))}</div>
        <h3 class="raid-title">${escapeHtml(e.title)}${e.instance && e.instance !== e.title ? ` <span class="bis-item-meta">${escapeHtml(e.instance)}</span>` : ''}${raidEventSize(e) ? ` <span class="bis-item-meta">· ${raidEventSize(e)}er</span>` : ''}</h3>
      </div>
      <div class="raid-counts">
        <span class="raid-count-yes">${r.players} ${r.players === 1 ? 'Spieler' : 'Spieler'} dabei</span>
        <span>${r.tank.length} Tanks · ${r.healer.length} Heiler · ${r.damage.length} DD <span class="bis-item-meta">(${r.yes.length} Chars)</span></span>
        <span class="bis-item-meta">${r.maybe.length} vielleicht · ${r.no.length} Absagen</span>
      </div>
    </div>
    ${e.note ? `<p class="raid-note">${escapeHtml(e.note)}</p>` : ''}
    ${past ? '' : raidSignupFormHtml(id)}
    ${published ? raidCompPublishedHtml(id, e) : ''}
    ${published ? `<details class="raid-signups-all"><summary>Alle Anmeldungen (${r.yes.length + r.maybe.length} Chars)</summary>${signupsHtml}</details>` : signupsHtml}
    ${canManage && !past ? raidCompPanelHtml(id, e) : ''}
    ${raidSrSectionHtml(id, e, past)}
    ${lootEventHtml(id, e)}
    ${canManage ? `<div class="raid-admin">
      ${past ? '' : `<button type="button" class="btn btn-ghost btn-sm" data-raid-signup-toggle="${escapeHtml(id)}">${raidSignupOpen(e) ? 'Anmeldung schließen' : 'Anmeldung öffnen'}</button>`}
      ${raidSrAdminHtml(id, e, past)}
      <button type="button" class="btn btn-ghost btn-sm" data-raid-edit="${escapeHtml(id)}">Bearbeiten</button>
      <button type="button" class="btn btn-ghost btn-sm" data-raid-delete="${escapeHtml(id)}">Löschen</button>
    </div>` : ''}
  </div>`;
}

/** Officer form to create / edit an event. */
function raidEventFormHtml(){
  if (raidEditId === null) return '';
  const e = raidEditId ? raidEvents[raidEditId] : null;
  const start = e ? new Date(e.start) : (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(20, 0, 0, 0); return d; })();
  const pad = n => String(n).padStart(2, '0');
  const date = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
  const time = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
  // An older event may name an instance that's no longer listed: keep it.
  const instances = Object.keys(RAID_INSTANCES);
  if (e && e.instance && !instances.includes(e.instance)) instances.push(e.instance);
  return `<div class="tac-card raid-form">
    <h3 class="bis-card-title">${e ? 'Raid bearbeiten' : 'Raid anlegen'}</h3>
    <div class="raid-form-grid">
      <label>Instanz<select id="raidFormInstance">${instances.map(n => `<option value="${escapeHtml(n)}" ${e && e.instance === n ? 'selected' : ''}>${escapeHtml(n)}${RAID_INSTANCES[n] ? ` (${RAID_INSTANCES[n]} Spieler)` : ''}</option>`).join('')}</select></label>
      <label>Titel (optional)<input type="text" id="raidFormTitle" class="apply-text-input" maxlength="80" placeholder="z. B. „MC Clear #3“" value="${escapeHtml(e && e.title !== e.instance ? e.title : '')}"></label>
      <label>Datum<input type="date" id="raidFormDate" value="${date}"></label>
      <label>Uhrzeit<input type="time" id="raidFormTime" value="${time}"></label>
      <label>Raidgröße<select id="raidFormSize">${[10, 20, 40].map(n => `<option value="${n}" ${(e ? raidEventSize(e) : RAID_INSTANCES[instances[0]]) === n ? 'selected' : ''}>${n} Spieler</option>`).join('')}</select></label>
      <label>Soft-Reserve<select id="raidFormSr">${[0, 1, 2, 3].map(n => `<option value="${n}" ${(e ? e.srMax : 0) === n ? 'selected' : ''}>${n ? `${n} ${n === 1 ? 'Item' : 'Items'} pro Spieler` : 'Aus'}</option>`).join('')}</select></label>
    </div>
    <label class="raid-form-note">Notiz (optional)<textarea id="raidFormNote" class="apply-text-input" maxlength="500" rows="2" placeholder="Treffpunkt, Buffs, Consumables …">${escapeHtml(e ? e.note : '')}</textarea></label>
    <div class="forever-actions">
      <button type="button" class="btn btn-teal btn-sm" id="raidFormSave">${e ? 'Speichern' : 'Anlegen'}</button>
      <button type="button" class="btn btn-ghost btn-sm" id="raidFormCancel">Abbrechen</button>
    </div>
  </div>`;
}

function renderRaidsPage(){
  const root = document.getElementById('raidsRoot');
  if (!root) return;
  if (!discordIdentity){
    root.innerHTML = '<div class="tac-card"><p class="bis-hint">Den Raid-Kalender sehen alle mit Discord eingeloggten Spieler. Melde Dich oben rechts an.</p></div>';
    return;
  }
  raidSync();
  const now = Date.now();
  const all = Object.entries(raidEvents);
  const upcoming = all.filter(([, e]) => e.start >= now - RAID_RUNNING_MS).sort((a, z) => a[1].start - z[1].start);
  // Keep the focus in a soft-reserve search box across live re-renders.
  const active = /** @type {HTMLInputElement | null} */ (document.activeElement);
  const focusSr = active && root.contains(active) ? active.getAttribute('data-raid-sr-search') : null;
  const past = all.filter(([, e]) => e.start < now - RAID_RUNNING_MS).sort((a, z) => z[1].start - a[1].start).slice(0, 10);
  root.innerHTML = `
    ${raidLoadError ? `<p class="bis-hint raid-error">${escapeHtml(raidLoadError)}</p>` : ''}
    ${raidStatusMsg ? `<p class="bis-hint">${escapeHtml(raidStatusMsg)}</p>` : ''}
    ${isOfficerOrAdmin() && raidEditId === null ? '<div class="forever-actions raid-new"><button type="button" class="btn btn-teal btn-sm" id="raidNewBtn">Raid anlegen</button></div>' : ''}
    ${raidEventFormHtml()}
    ${upcoming.length ? upcoming.map(([id, e]) => raidEventCardHtml(id, e, false)).join('') : '<div class="tac-card"><p class="bis-hint">Noch keine Raids geplant.</p></div>'}
    ${past.length ? `<details class="raid-past-list"><summary>Vergangene Raids (${past.length})</summary>${past.map(([id, e]) => raidEventCardHtml(id, e, true)).join('')}</details>` : ''}`;
  raidWire(root);
  raidSrWire(root);
  raidCompWire(root);
  lootWire(root);
  if (focusSr){
    const box = /** @type {HTMLInputElement | null} */ (root.querySelector(`[data-raid-sr-search="${CSS.escape(focusSr)}"]`));
    if (box){ box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
  }
}

/** Read one sign-up form. @param {HTMLElement} form */
function raidFormValues(form){
  const val = f => /** @type {HTMLInputElement} */ (form.querySelector(`[data-raid-field="${f}"]`)).value.trim();
  return { charName: val('charName').slice(0, 40), classId: val('classId'), specId: val('specId'), note: val('note').slice(0, 120) };
}

/** @param {HTMLElement} root */
function raidWire(root){
  const uid = discordIdentity.id;
  root.querySelectorAll('[data-raid-form]').forEach((/** @type {HTMLElement} */ form) => {
    const cls = /** @type {HTMLSelectElement} */ (form.querySelector('[data-raid-field="classId"]'));
    const spec = /** @type {HTMLSelectElement} */ (form.querySelector('[data-raid-field="specId"]'));
    const fillSpecs = (specId) => {
      spec.innerHTML = foreverSpecsForClass(cls.value).map(s => `<option value="${s.id}" ${s.id === specId ? 'selected' : ''}>${escapeHtml(s.label)} (${escapeHtml(FOREVER_ROLE_LABELS[s.role])})</option>`).join('');
    };
    cls.addEventListener('change', () => fillSpecs(''));
    // Picking one of "Meine Charaktere" fills name, class and spec.
    const pick = /** @type {HTMLSelectElement} */ (form.querySelector('[data-raid-char]'));
    const nameInput = /** @type {HTMLInputElement} */ (form.querySelector('[data-raid-field="charName"]'));
    if (pick) pick.addEventListener('change', () => {
      const c = raidMyCharacters()[Number(pick.value)];
      nameInput.classList.toggle('hidden', Boolean(c));
      // Class is fixed for a character with a known class, free otherwise.
      cls.disabled = Boolean(c && c.classId);
      cls.title = cls.disabled ? 'Klasse aus Meine Charaktere' : '';
      const hint = form.querySelector('.raid-class-hint');
      if (hint) hint.classList.toggle('hidden', !(c && !c.classId));
      if (!c){ nameInput.value = ''; nameInput.focus(); return; }
      nameInput.value = c.name;
      if (c.classId){ cls.value = c.classId; fillSpecs(c.specId || ''); }
    });
  });
  root.querySelectorAll('[data-raid-status]').forEach(btn => btn.addEventListener('click', async () => {
    const id = btn.getAttribute('data-raid-id');
    const form = /** @type {HTMLElement} */ (root.querySelector(`[data-raid-form="${CSS.escape(id)}"]`));
    const v = raidFormValues(form);
    if (!CLASS_MAP[v.classId] || !v.charName){ raidStatusMsg = 'Bitte einen Charakter wählen oder einen Namen eingeben.'; renderRaidsPage(); return; }
    try { localStorage.setItem(RAID_LAST_SIGNUP_KEY, JSON.stringify({ charName: v.charName, classId: v.classId, specId: v.specId })); } catch (e){ /* private mode */ }
    const char = raidMyCharacters().find(c => c.name === v.charName);
    const key = raidCharKey(char, v.charName);
    const entry = { status: btn.getAttribute('data-raid-status'), name: raidMyName(), ...v, updatedAt: Date.now() };
    try {
      const mine = (raidSignups[id] || {})[uid] || {};
      // An old single sign-up (directly under <uid>) is replaced by the new per-character shape.
      if (mine.legacy){
        /** @type {Record<string, any>} */
        const next = Object.fromEntries(Object.entries(mine).filter(([k]) => k !== 'legacy'));
        next[key] = entry;
        await db.ref(`${DB_PATH}/raidSignups/${id}/${uid}`).set(next);
      } else await db.ref(`${DB_PATH}/raidSignups/${id}/${uid}/${key}`).set(entry);
      raidStatusMsg = '';
    } catch (e){ raidStatusMsg = 'Anmeldung konnte nicht gespeichert werden — Anmeldung geschlossen oder Firebase-Regeln nicht aktualisiert?'; renderRaidsPage(); }
  }));
  root.querySelectorAll('[data-raid-withdraw]').forEach(btn => btn.addEventListener('click', async () => {
    const [id, key] = btn.getAttribute('data-raid-withdraw').split('|');
    const mine = (raidSignups[id] || {})[uid] || {};
    try { await db.ref(`${DB_PATH}/raidSignups/${id}/${uid}${key === 'legacy' ? '' : '/' + key}`).remove(); }
    catch (e){ raidStatusMsg = 'Abmelden fehlgeschlagen.'; renderRaidsPage(); return; }
    // The last character withdrawn frees the own reserves too (unless locked).
    const ev = raidEvents[id];
    if (Object.keys(mine).length <= 1 && (raidReserves[id] || {})[uid] && ev && !ev.srLocked) raidSrSave(id, {});
  }));
  root.querySelectorAll('[data-raid-signup-toggle]').forEach(btn => btn.addEventListener('click', async () => {
    const id = btn.getAttribute('data-raid-signup-toggle');
    const e = raidEvents[id];
    if (!e) return;
    try { await db.ref(`${DB_PATH}/raidEvents/${id}/signupState`).set(raidSignupOpen(e) ? 'closed' : 'open'); }
    catch (err){ raidStatusMsg = 'Konnte die Anmeldung nicht umschalten.'; renderRaidsPage(); }
  }));
  const on = (sel, fn) => { const el = root.querySelector(sel); if (el) el.addEventListener('click', fn); };
  on('#raidNewBtn', () => { raidEditId = ''; renderRaidsPage(); });
  on('#raidFormCancel', () => { raidEditId = null; renderRaidsPage(); });
  on('#raidFormSave', async () => {
    const get = id => /** @type {HTMLInputElement} */ (root.querySelector(id)).value.trim();
    const instance = get('#raidFormInstance').slice(0, 60);
    const start = new Date(`${get('#raidFormDate')}T${get('#raidFormTime') || '20:00'}`).getTime();
    if (!instance || !Number.isFinite(start)) { raidStatusMsg = 'Bitte Instanz, Datum und Uhrzeit angeben.'; renderRaidsPage(); return; }
    const prev = raidEditId ? raidEvents[raidEditId] : null;
    const id = raidEditId || newPushId('raidEvents');
    if (!id) return;
    const payload = {
      title: (get('#raidFormTitle') || instance).slice(0, 80), instance, start,
      note: get('#raidFormNote').slice(0, 500),
      srMax: Number(get('#raidFormSr')) || 0, srLocked: prev ? prev.srLocked : false,
      size: Number(get('#raidFormSize')) || RAID_INSTANCES[instance] || 20,
      // Aufstellung and sign-up state stay as they are when editing.
      signupState: prev ? prev.signupState : 'auto', rosterPublished: prev ? prev.rosterPublished : false,
      ...(prev && prev.targets ? { targets: prev.targets } : {}),
      ...(prev && Object.keys(prev.roster).length ? { roster: prev.roster } : {}),
      createdBy: prev ? prev.createdBy : uid, createdAt: prev ? prev.createdAt : Date.now(), updatedAt: Date.now()
    };
    try {
      await db.ref(`${DB_PATH}/raidEvents/${id}`).set(payload);
      raidEditId = null;
      raidStatusMsg = prev ? 'Raid gespeichert.' : 'Raid angelegt.';
    } catch (e){ raidStatusMsg = 'Speichern fehlgeschlagen — Firebase-Regeln aktualisiert?'; }
    renderRaidsPage();
  });
  root.querySelectorAll('[data-raid-edit]').forEach(btn => btn.addEventListener('click', () => {
    raidEditId = btn.getAttribute('data-raid-edit');
    renderRaidsPage();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }));
  root.querySelectorAll('[data-raid-delete]').forEach(btn => btn.addEventListener('click', async () => {
    const id = btn.getAttribute('data-raid-delete');
    const e = raidEvents[id];
    if (!e) return;
    const answer = await bisDialog('Raid löschen?', `„${e.title}“ am ${raidDateLabel(e.start)} wird mit allen Anmeldungen und Reserves gelöscht.`,
      [{ id: 'delete', label: 'Löschen', primary: true }, { id: 'cancel', label: 'Abbrechen' }]);
    if (answer !== 'delete') return;
    try { await db.ref(DB_PATH).update({ [`raidEvents/${id}`]: null, [`raidSignups/${id}`]: null, [`raidReserves/${id}`]: null }); }
    catch (err){ raidStatusMsg = 'Löschen fehlgeschlagen.'; renderRaidsPage(); }
  }));
}
