// Raids: guests ("Externe") applying for Soft-Reserve raids.
//
// Anyone logged in with Discord who isn't a guild member (role community)
// sees the Raids page as a guest view: the upcoming SR raids (srMax > 0)
// and, per raid, their application — 1–3 characters (name, class, spec,
// Armory link, required), up to 3 gear screenshots (Armory may be out of
// date or show PvP gear) and a note; then a message thread with the raid
// leads. Officers / admins review them in the raid window's Anmeldung tab:
// accept with one of the characters (writes a sign-up "Dabei" marked
// `ext`, so the guest shows up in the Aufstellung and may soft-reserve),
// decline, or reset; and answer in the thread. Officers' Home lists open
// guest applications under "Zu tun".
//
// Firebase (README § 6f, own listeners — not SYNCED_KEYS):
//  - raidApplications/<eventId>/<uid> = {
//      app: { name, chars: { c1..c3: { n, cls, spec, armory } }, note,
//             shots (count), at, upd },          — written by the guest
//      status: 'accepted' | 'declined' (none = open), char: 'c1',
//      decidedBy, decidedAt,                    — written by officers
//      msgs: { <pushId>: { by, name, text, at } } — both, append only }
//    Read: officers / admins (all), the guest (own). The guest can edit
//    while the sign-up is open and nothing was decided; withdraw always.
//  - raidApplicationShots/<eventId>/<uid>/s1..s3 = JPEG data URL (resized
//    in the browser, ≤ ~550 KB) — apart from the application so lists
//    don't download images; loaded when a screenshot is opened.
//  - raidReserves: accepted guests may soft-reserve (rules check
//    raidApplications/<eventId>/<uid>/status).

const RAID_EXT_MAX_CHARS = 3;
const RAID_EXT_MAX_SHOTS = 3;
const RAID_EXT_SHOT_MAX_BYTES = 550000;
/** Screenshots we render: JPEG / PNG / WebP data URLs only. */
const RAID_EXT_SHOT_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
/** Armory and other character links: https, no quotes / brackets. */
const RAID_EXT_URL_RE = /^https:\/\/[^\s'"()\\<>]+$/;

/** eventId -> uid -> application. @type {Record<string, Record<string, any>>} */
let raidApps = {};
let raidAppsLoaded = false;
let raidAppsSyncKey = '';
/** Open guest form per event (draft). @type {Record<string, any>} */
const raidExtDrafts = {};
/** eventId|uid -> s1..s3 data URLs, loaded on demand. @type {Record<string, Record<string, string>>} */
const raidExtShots = {};
let raidExtMsg = '';
/** Unsent message per thread ("eventId|uid"), kept across live re-renders. @type {Record<string, string>} */
const raidExtMsgDrafts = {};
/** Officers: which applications ("eventId|uid") are expanded / collapsed by hand. @type {Record<string, boolean>} */
const raidExtOpenState = {};

/** Normalized application (or null). @param {any} raw */
function raidAppNormalize(raw){
  if (!raw || typeof raw !== 'object') return null;
  const a = raw.app && typeof raw.app === 'object' ? raw.app : null;
  const chars = a ? Object.entries(a.chars && typeof a.chars === 'object' ? a.chars : {})
    .filter(([k, c]) => /^c[1-3]$/.test(k) && c && CLASS_MAP[c.cls])
    .map(([k, c]) => ({ key: k, n: String(c.n || '').slice(0, 40), cls: c.cls, spec: String(c.spec || ''), armory: RAID_EXT_URL_RE.test(String(c.armory || '')) ? String(c.armory).slice(0, 300) : '' }))
    .sort((x, z) => x.key.localeCompare(z.key)) : [];
  const msgs = Object.entries(raw.msgs && typeof raw.msgs === 'object' ? raw.msgs : {})
    .filter(([, m]) => m && typeof m.text === 'string')
    .map(([id, m]) => ({ id, by: String(m.by || ''), name: String(m.name || '').slice(0, 60), text: m.text.slice(0, 1000), at: Number(m.at) || 0 }))
    .sort((x, z) => x.at - z.at);
  return {
    app: a ? { name: String(a.name || '').slice(0, 60), chars, note: String(a.note || '').slice(0, 1000), shots: Math.max(0, Math.min(RAID_EXT_MAX_SHOTS, Math.trunc(Number(a.shots)) || 0)), at: Number(a.at) || 0, upd: Number(a.upd) || 0 } : null,
    status: raw.status === 'accepted' || raw.status === 'declined' ? raw.status : '',
    char: /^c[1-3]$/.test(String(raw.char || '')) ? String(raw.char) : '',
    decidedBy: String(raw.decidedBy || '').slice(0, 60),
    decidedAt: Number(raw.decidedAt) || 0,
    msgs
  };
}

/** Officers: all applications; guests: their own per SR event. */
function raidAppsSync(){
  if (!db || !discordIdentity) return;
  const uid = discordIdentity.id;
  const officer = isOfficerOrAdmin();
  const events = officer ? [] : Object.entries(raidEvents).filter(([, e]) => e.srMax > 0).map(([id]) => id).sort();
  const key = officer ? `all|${uid}` : `${uid}|${events.join(',')}`;
  if (key === raidAppsSyncKey) return;
  // Re-subscribe: drop the old listeners first.
  if (raidAppsSyncKey.startsWith('all|')) db.ref(`${DB_PATH}/raidApplications`).off();
  else if (raidAppsSyncKey) for (const id of raidAppsSyncKey.split('|')[1].split(',').filter(Boolean)) db.ref(`${DB_PATH}/raidApplications/${id}/${raidAppsSyncKey.split('|')[0]}`).off();
  raidAppsSyncKey = key;
  raidApps = {};
  const rerender = () => { if (currentPage === 'raids') renderRaidsPage(); if (currentPage === 'home') renderHomeDashboard(); };
  if (officer) {
    db.ref(`${DB_PATH}/raidApplications`).on('value', snap => {
      /** @type {Record<string, Record<string, any>>} */
      const out = {};
      for (const [e, byUid] of Object.entries(snap.val() || {})) for (const [u, raw] of Object.entries(byUid || {})) { const a = raidAppNormalize(raw); if (a && a.app) (out[e] = out[e] || {})[u] = a; }
      raidApps = out;
      raidAppsLoaded = true;
      rerender();
    }, () => { raidAppsLoaded = true; raidExtMsg = 'Keine Leserechte für Gast-Bewerbungen — Firebase-Regeln aktualisiert?'; rerender(); });
    return;
  }
  for (const id of events) {
    db.ref(`${DB_PATH}/raidApplications/${id}/${uid}`).on('value', snap => {
      const a = raidAppNormalize(snap.val());
      if (a && (a.app || a.msgs.length)) (raidApps[id] = raidApps[id] || {})[uid] = a;
      else if (raidApps[id]) delete raidApps[id][uid];
      raidAppsLoaded = true;
      rerender();
    }, () => { raidAppsLoaded = true; rerender(); });
  }
}

/** Open (undecided) guest applications of upcoming raids, for officers' "Zu tun". */
function raidExtOpenCount(){
  const now = Date.now();
  let n = 0;
  for (const [id, byUid] of Object.entries(raidApps)) {
    const e = raidEvents[id];
    if (!e || now >= raidDayEnd(e)) continue;
    n += Object.values(byUid).filter(a => a.app && !a.status).length;
  }
  return n;
}
/** May the guest still change the application? @param {RaidEvent} e @param {any} a */
const raidExtEditable = (e, a) => raidSignupOpen(e) && raidPhase(e) === 'signup' && (!a || !a.status);

/** Class name in its color. @param {string} classId */
const raidExtClass = classId => CLASS_MAP[classId] ? `<span style="color:${CLASS_MAP[classId].color}">${escapeHtml(CLASS_MAP[classId].label)}</span>` : '';
/** One applied character (line). @param {any} c */
function raidExtCharHtml(c){
  return `<span class="raid-ext-char"><b>${escapeHtml(c.n)}</b> ${raidExtClass(c.cls)} · ${escapeHtml(foreverSpecLabel(c.cls, c.spec))} ${roleIconHtml(foreverSpecRole(c.cls, c.spec), 14)}
    ${c.armory ? `<a href="${escapeHtml(c.armory)}" target="_blank" rel="noopener noreferrer">Armory ↗</a>` : ''}</span>`;
}
/** Message thread + answer box. @param {string} id @param {string} uid @param {any} a */
function raidExtThreadHtml(id, uid, a){
  const me = discordIdentity ? discordIdentity.id : '';
  const msgs = (a && a.msgs) || [];
  return `<div class="raid-ext-thread">
    <div class="raid-col-head">Nachrichten <span>${msgs.length ? `${msgs.length}` : 'noch keine'}</span></div>
    ${msgs.map(m => `<div class="raid-ext-msg${m.by === me ? ' mine' : ''}${m.by !== uid ? ' lead' : ''}"><div class="raid-ext-msg-head"><b>${escapeHtml(m.name || 'Unbekannt')}</b>${m.by !== uid ? ' <span class="loot-tag">Raidleitung</span>' : ''} <span class="bis-item-meta">${escapeHtml(new Date(m.at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))}</span></div><p>${escapeHtml(m.text).replace(/\n/g, '<br>')}</p></div>`).join('')}
    <div class="raid-ext-reply"><textarea class="apply-text-input" rows="2" maxlength="1000" data-raid-ext-msg="${escapeHtml(id)}|${escapeHtml(uid)}" placeholder="${uid === me ? 'Nachricht an die Raidleitung …' : 'Antwort an den Gast …'}">${escapeHtml(raidExtMsgDrafts[`${id}|${uid}`] || '')}</textarea>
      <button type="button" class="btn btn-ghost btn-sm" data-raid-ext-send="${escapeHtml(id)}|${escapeHtml(uid)}">Senden</button></div>
  </div>`;
}
/** Screenshot thumbnails (loaded on demand). @param {string} id @param {string} uid @param {number} count */
function raidExtShotsHtml(id, uid, count){
  if (!count) return '';
  const loaded = raidExtShots[`${id}|${uid}`];
  if (!loaded) return `<button type="button" class="btn btn-ghost btn-sm" data-raid-ext-shots="${escapeHtml(id)}|${escapeHtml(uid)}">${count} ${count === 1 ? 'Screenshot' : 'Screenshots'} anzeigen</button>`;
  return `<div class="raid-ext-shots">${Object.entries(loaded).filter(([, src]) => RAID_EXT_SHOT_RE.test(src)).map(([k, src]) => `<button type="button" class="raid-ext-shot" data-raid-ext-zoom="${escapeHtml(id)}|${escapeHtml(uid)}|${k}"><img src="${src}" alt="Screenshot ${k.slice(1)}"></button>`).join('') || '<span class="bis-item-meta">Keine Screenshots gefunden.</span>'}</div>`;
}

// ---------------------------------------------------------------- guest view
/** The Raids page for guests: upcoming SR raids with the own application. */
function raidExtPageHtml(){
  raidAppsSync();
  const uid = discordIdentity.id;
  const now = Date.now();
  const list = Object.entries(raidEvents).filter(([, e]) => e.srMax > 0 && now < raidDayEnd(e)).sort((a, z) => a[1].start - z[1].start);
  const intro = `<div class="tac-card raid-ext-intro">
    <h3 class="bis-card-title">${gameIconHtml('apply', 22)} Als Gast mitraiden</h3>
    <p>In unseren <b>Soft-Reserve-Raids</b> nehmen wir gerne Gäste mit. Bewirb Dich mit Deinem Charakter: Armory-Link, Klasse und Spezialisierung — und zeig uns Dein Gear per Screenshot, falls die Armory nicht aktuell ist oder Du gerade PvP-Gear trägst. Die Raidleitung meldet sich hier bei Dir.</p>
  </div>`;
  if (!list.length) return `${intro}<div class="tac-card"><p class="bis-hint">${raidLoadError ? escapeHtml(raidLoadError) : 'Gerade ist kein Soft-Reserve-Raid geplant. Schau bald wieder vorbei!'}</p></div>`;
  return intro + (raidExtMsg ? `<p class="bis-hint raid-error">${escapeHtml(raidExtMsg)}</p>` : '') + list.map(([id, e]) => {
    const a = (raidApps[id] || {})[uid] || null;
    const phase = raidPhase(e);
    const editable = raidExtEditable(e, a);
    const draft = raidExtDrafts[id];
    let body;
    if (draft) body = raidExtFormHtml(id, draft);
    else if (!a || !a.app) body = editable
      ? `<div class="raid-next"><span>Noch keine Bewerbung für diesen Raid.</span><button type="button" class="btn btn-teal btn-sm" data-raid-ext-apply="${escapeHtml(id)}">Bewerben</button></div>`
      : '<p class="bis-hint">Die Anmeldung für diesen Raid ist geschlossen.</p>';
    else {
      const chosen = a.app.chars.find(c => c.key === a.char);
      const status = a.status === 'accepted' ? `<p class="home-status home-status-good">✓ Du bist dabei${chosen ? ` mit ${raidExtCharHtml(chosen)}` : ''}.</p>`
        : a.status === 'declined' ? '<p class="home-status">Diesmal hat es leider nicht geklappt — schau in die Nachrichten.</p>'
        : '<p class="home-status home-status-todo">Bewerbung eingegangen — die Raidleitung schaut sie sich an.</p>';
      body = `${status}
        <div class="raid-ext-app">${a.app.chars.map(raidExtCharHtml).join('')}${a.app.note ? `<p class="raid-note">${escapeHtml(a.app.note)}</p>` : ''}${raidExtShotsHtml(id, uid, a.app.shots)}</div>
        <div class="forever-actions">${editable ? `<button type="button" class="btn btn-ghost btn-sm" data-raid-ext-edit="${escapeHtml(id)}">Bewerbung ändern</button>` : ''}
          ${phase !== 'done' && a.status !== 'accepted' ? `<button type="button" class="btn btn-ghost btn-sm" data-raid-ext-withdraw="${escapeHtml(id)}">Zurückziehen</button>` : ''}</div>
        ${a.status === 'accepted' ? raidSrSectionHtml(id, e, phase === 'done') : ''}`;
    }
    return `<div class="tac-card raid-card">
      <div class="raid-head"><div>${raidTitleHtml(e)}</div></div>
      <p class="bis-item-meta">${roleCountsHtml(raidRoster(id))} · Soft-Reserve: ${e.srMax} ${e.srMax === 1 ? 'Item' : 'Items'} pro Spieler</p>
      ${e.note ? `<p class="raid-note">${escapeHtml(e.note)}</p>` : ''}
      ${body}
      ${a && (a.app || a.msgs.length) ? raidExtThreadHtml(id, uid, a) : ''}
    </div>`;
  }).join('');
}

/** Application form (draft: { chars: [{ n, cls, spec, armory }], note, shots: [dataUrl], err }). */
function raidExtFormHtml(id, d){
  const row = (c, i) => `<div class="raid-ext-form-char">
    <span class="tac-kick-num">${i + 1}</span>
    <label>Charaktername<input type="text" class="apply-text-input" maxlength="40" data-raid-ext-f="${i}|n" value="${escapeHtml(c.n)}" placeholder="z. B. Thrallina"></label>
    <label>Klasse<select data-raid-ext-f="${i}|cls"><option value="">—</option>${CLASSES.map(x => `<option value="${x.id}" ${c.cls === x.id ? 'selected' : ''}>${escapeHtml(x.label)}</option>`).join('')}</select></label>
    <label>Spezialisierung<select data-raid-ext-f="${i}|spec" ${c.cls ? '' : 'disabled'}><option value="">—</option>${foreverSpecsForClass(c.cls).map(s => `<option value="${s.id}" ${c.spec === s.id ? 'selected' : ''}>${escapeHtml(s.label)}</option>`).join('')}</select></label>
    <label class="raid-ext-armory">Armory-Link<input type="url" class="apply-text-input" maxlength="300" data-raid-ext-f="${i}|armory" value="${escapeHtml(c.armory)}" placeholder="https://worldofwarcraft.blizzard.com/de-de/character/eu/…"></label>
    ${d.chars.length > 1 ? `<button type="button" class="btn btn-ghost btn-sm" data-raid-ext-delchar="${i}" title="Charakter entfernen">✕</button>` : ''}
  </div>`;
  return `<div class="raid-ext-form" data-raid-ext-form="${escapeHtml(id)}">
    <div class="raid-col-head">Deine Bewerbung <span>Pflicht: Name, Klasse, Spezialisierung und Armory-Link</span></div>
    ${d.chars.map(row).join('')}
    ${d.chars.length < RAID_EXT_MAX_CHARS ? '<button type="button" class="btn btn-ghost btn-sm" data-raid-ext-addchar>+ weiterer Charakter</button>' : ''}
    <div class="raid-col-head">Gear-Screenshots <span>optional, bis zu ${RAID_EXT_MAX_SHOTS} — wenn die Armory nicht aktuell ist oder Du PvP-Gear trägst</span></div>
    <div class="raid-ext-shots">${d.shots.map((src, i) => `<span class="raid-ext-shot"><img src="${src}" alt="Screenshot ${i + 1}"><button type="button" data-raid-ext-delshot="${i}" aria-label="Entfernen">×</button></span>`).join('')}
      ${d.shots.length < RAID_EXT_MAX_SHOTS ? `<label class="raid-ext-shot-add">+ Screenshot<input type="file" accept="image/png,image/jpeg,image/webp" multiple data-raid-ext-file hidden></label>` : ''}</div>
    <label class="raid-form-note">Nachricht an die Raidleitung (optional)<textarea class="apply-text-input" rows="3" maxlength="1000" data-raid-ext-note placeholder="Was trägst Du gerade, Raid-Erfahrung, Fragen …">${escapeHtml(d.note)}</textarea></label>
    ${d.err ? `<p class="bis-hint raid-error">${escapeHtml(d.err)}</p>` : ''}
    <div class="forever-actions">
      <button type="button" class="btn btn-teal btn-sm" data-raid-ext-submit>${d.existing ? 'Speichern' : 'Bewerbung abschicken'}</button>
      <button type="button" class="btn btn-ghost btn-sm" data-raid-ext-cancel>Abbrechen</button>
    </div>
  </div>`;
}

/** Shrink an image file to a JPEG data URL under RAID_EXT_SHOT_MAX_BYTES. @param {File} file @returns {Promise<string>} */
function raidExtShrink(file){
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let max = 1600, q = 0.82, out = '';
      for (let i = 0; i < 8; i++) {
        const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        out = canvas.toDataURL('image/jpeg', q);
        if (out.length <= RAID_EXT_SHOT_MAX_BYTES) return resolve(out);
        max = Math.round(max * 0.8); q = Math.max(0.5, q - 0.08);
      }
      reject(new Error('too big'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('no image')); };
    img.src = url;
  });
}

// ---------------------------------------------------------------- officer view
/** Raid window, Anmeldung tab: the guest applications of an event. @param {string} id @param {RaidEvent} e */
function raidExtOfficerHtml(id, e){
  if (!isOfficerOrAdmin() || !e.srMax) return '';
  raidAppsSync();
  const list = Object.entries(raidApps[id] || {}).filter(([, a]) => a.app).sort((x, z) => (x[1].status ? 1 : 0) - (z[1].status ? 1 : 0) || x[1].app.at - z[1].app.at);
  const open = list.filter(([, a]) => !a.status).length;
  if (!list.length) return `<div class="raid-col-head raid-section-head">Gast-Bewerbungen <span>noch keine — Gäste bewerben sich auf der Raids-Seite (ohne Gildenrolle)</span></div>`;
  const label = { accepted: 'angenommen', declined: 'abgelehnt' };
  return `<div class="raid-col-head raid-section-head">Gast-Bewerbungen <span>${open} offen · ${list.length} insgesamt</span></div>
    <div class="raid-ext-list">${list.map(([uid, a]) => `<details class="raid-ext-item${a.status ? ` ${a.status}` : ''}" data-raid-ext-item="${escapeHtml(id)}|${escapeHtml(uid)}"${(raidExtOpenState[`${id}|${uid}`] ?? !a.status) ? ' open' : ''}>
      <summary><b>${escapeHtml(a.app.name || 'Gast')}</b> <span>${a.app.chars.map(c => `${escapeHtml(c.n)} · ${raidExtClass(c.cls)}`).join(', ')}</span>
        <span class="loot-tag${a.status === 'accepted' ? ' loot-tag-ms' : a.status === 'declined' ? '' : ' loot-tag-hr'}">${label[a.status] || 'offen'}</span>
        <span class="bis-item-meta">${escapeHtml(raidDateLabel(a.app.at))}</span></summary>
      <div class="raid-ext-app">
        ${a.app.chars.map(c => `<div class="raid-ext-char-row">${raidExtCharHtml(c)}
          ${raidPhase(e) !== 'done' && !(a.status === 'accepted' && a.char === c.key) ? `<button type="button" class="btn btn-teal btn-sm" data-raid-ext-accept="${escapeHtml(id)}|${escapeHtml(uid)}|${c.key}">Mit ${escapeHtml(c.n)} annehmen</button>` : a.char === c.key ? '<span class="loot-tag loot-tag-ms">angemeldet</span>' : ''}</div>`).join('')}
        ${a.app.note ? `<p class="raid-note">${escapeHtml(a.app.note)}</p>` : ''}
        ${raidExtShotsHtml(id, uid, a.app.shots)}
        <div class="forever-actions">
          ${a.status !== 'declined' ? `<button type="button" class="btn btn-ghost btn-sm" data-raid-ext-decline="${escapeHtml(id)}|${escapeHtml(uid)}">Ablehnen</button>` : ''}
          ${a.status ? `<button type="button" class="btn btn-ghost btn-sm" data-raid-ext-reset="${escapeHtml(id)}|${escapeHtml(uid)}">Zurücksetzen (offen)</button>` : ''}
          ${a.decidedBy ? `<span class="bis-item-meta">${escapeHtml(label[a.status] || '')} von ${escapeHtml(a.decidedBy)}</span>` : ''}
        </div>
      </div>
      ${raidExtThreadHtml(id, uid, a)}
    </details>`).join('')}</div>`;
}

/** Full-size screenshot overlay. @param {string} src */
function raidExtZoom(src){
  if (!RAID_EXT_SHOT_RE.test(src)) return;
  const box = document.createElement('div');
  box.className = 'raid-ext-zoom';
  box.innerHTML = `<img src="${src}" alt="Screenshot"><button type="button" class="btn btn-ghost btn-sm">Schließen</button>`;
  box.addEventListener('click', () => box.remove());
  document.body.appendChild(box);
}

// ---------------------------------------------------------------- wiring
/** @param {HTMLElement} root */
function raidExtWire(root){
  if (!discordIdentity) return;
  const me = discordIdentity.id;
  const fail = (/** @type {string} */ msg) => () => { raidExtMsg = msg; renderRaidsPage(); };
  const appRef = (id, uid) => db.ref(`${DB_PATH}/raidApplications/${id}/${uid}`);
  // Messages (guests and officers).
  root.querySelectorAll('[data-raid-ext-msg]').forEach((/** @type {HTMLTextAreaElement} */ el) => el.addEventListener('input', () => { raidExtMsgDrafts[el.getAttribute('data-raid-ext-msg')] = el.value; }));
  root.querySelectorAll('[data-raid-ext-send]').forEach(btn => btn.addEventListener('click', () => {
    const [id, uid] = btn.getAttribute('data-raid-ext-send').split('|');
    const box = /** @type {HTMLTextAreaElement | null} */ (root.querySelector(`[data-raid-ext-msg="${CSS.escape(`${id}|${uid}`)}"]`));
    const text = box ? box.value.trim().slice(0, 1000) : '';
    if (!text) return;
    delete raidExtMsgDrafts[`${id}|${uid}`];
    appRef(id, uid).child('msgs').push({ by: me, name: discordIdentity.username || '', text, at: Date.now() }).catch(fail('Nachricht konnte nicht gesendet werden — Firebase-Regeln aktualisiert?'));
  }));
  // Screenshots: load / zoom.
  root.querySelectorAll('[data-raid-ext-shots]').forEach(btn => btn.addEventListener('click', () => {
    const k = btn.getAttribute('data-raid-ext-shots');
    const [id, uid] = k.split('|');
    db.ref(`${DB_PATH}/raidApplicationShots/${id}/${uid}`).once('value').then(snap => {
      raidExtShots[k] = Object.fromEntries(Object.entries(snap.val() || {}).filter(([s, v]) => /^s[1-3]$/.test(s) && typeof v === 'string'));
      renderRaidsPage();
    }).catch(fail('Screenshots konnten nicht geladen werden.'));
  }));
  root.querySelectorAll('[data-raid-ext-zoom]').forEach(btn => btn.addEventListener('click', () => {
    const [id, uid, s] = btn.getAttribute('data-raid-ext-zoom').split('|');
    raidExtZoom(((raidExtShots[`${id}|${uid}`]) || {})[s] || '');
  }));
  root.querySelectorAll('[data-raid-ext-item]').forEach((/** @type {HTMLDetailsElement} */ el) => el.addEventListener('toggle', () => { raidExtOpenState[el.getAttribute('data-raid-ext-item')] = el.open; }));
  // Officers: decide.
  const decide = async (/** @type {string} */ id, /** @type {string} */ uid, /** @type {'accepted' | 'declined' | ''} */ status, /** @type {string} */ charKey) => {
    raidExtOpenState[`${id}|${uid}`] = true; // keep it open after deciding
    const a = (raidApps[id] || {})[uid];
    if (!a || !a.app) return;
    const c = a.app.chars.find(x => x.key === charKey);
    /** @type {Record<string, any>} */
    const upd = {
      [`raidApplications/${id}/${uid}/status`]: status || null,
      [`raidApplications/${id}/${uid}/char`]: status === 'accepted' ? charKey : null,
      [`raidApplications/${id}/${uid}/decidedBy`]: status ? (discordIdentity.username || '') : null,
      [`raidApplications/${id}/${uid}/decidedAt`]: status ? Date.now() : null,
      // The sign-up: only the accepted character (guests have no other sign-ups).
      [`raidSignups/${id}/${uid}`]: status === 'accepted' && c
        ? { [`x_${c.key}`]: { status: 'yes', name: a.app.name || c.n, charName: c.n, classId: c.cls, specId: c.spec, note: 'Gast', ext: true, updatedAt: Date.now() } }
        : null
    };
    try { await db.ref(DB_PATH).update(upd); raidExtMsg = ''; }
    catch (e){ raidExtMsg = 'Konnte die Bewerbung nicht entscheiden — Firebase-Regeln aktualisiert?'; renderRaidsPage(); }
  };
  root.querySelectorAll('[data-raid-ext-accept]').forEach(btn => btn.addEventListener('click', () => { const [id, uid, c] = btn.getAttribute('data-raid-ext-accept').split('|'); decide(id, uid, 'accepted', c); }));
  root.querySelectorAll('[data-raid-ext-decline]').forEach(btn => btn.addEventListener('click', () => { const [id, uid] = btn.getAttribute('data-raid-ext-decline').split('|'); if (confirm('Bewerbung ablehnen? Schreib dem Gast am besten kurz, warum.')) decide(id, uid, 'declined', ''); }));
  root.querySelectorAll('[data-raid-ext-reset]').forEach(btn => btn.addEventListener('click', () => { const [id, uid] = btn.getAttribute('data-raid-ext-reset').split('|'); decide(id, uid, '', ''); }));

  // Guests: apply / edit / withdraw.
  const draftOf = (/** @type {string} */ id) => raidExtDrafts[id];
  root.querySelectorAll('[data-raid-ext-apply]').forEach(btn => btn.addEventListener('click', () => {
    const id = btn.getAttribute('data-raid-ext-apply');
    raidExtDrafts[id] = { chars: [{ n: '', cls: '', spec: '', armory: '' }], note: '', shots: [], err: '', existing: false };
    renderRaidsPage();
  }));
  root.querySelectorAll('[data-raid-ext-edit]').forEach(btn => btn.addEventListener('click', async () => {
    const id = btn.getAttribute('data-raid-ext-edit');
    const a = (raidApps[id] || {})[me];
    if (!a || !a.app) return;
    let shots = [];
    try { const snap = await db.ref(`${DB_PATH}/raidApplicationShots/${id}/${me}`).once('value'); shots = Object.entries(snap.val() || {}).sort().map(([, v]) => v).filter(v => typeof v === 'string' && RAID_EXT_SHOT_RE.test(v)); } catch (e){ /* keep none */ }
    raidExtDrafts[id] = { chars: a.app.chars.map(c => ({ n: c.n, cls: c.cls, spec: c.spec, armory: c.armory })), note: a.app.note, shots, err: '', existing: true };
    renderRaidsPage();
  }));
  root.querySelectorAll('[data-raid-ext-withdraw]').forEach(btn => btn.addEventListener('click', async () => {
    const id = btn.getAttribute('data-raid-ext-withdraw');
    if (!confirm('Bewerbung für diesen Raid zurückziehen?')) return;
    try {
      await appRef(id, me).child('app').remove();
      await db.ref(`${DB_PATH}/raidApplicationShots/${id}/${me}`).remove();
      delete raidExtShots[`${id}|${me}`];
    } catch (e){ fail('Zurückziehen fehlgeschlagen.')(); }
  }));
  const form = /** @type {HTMLElement | null} */ (root.querySelector('[data-raid-ext-form]'));
  if (!form) return;
  const id = form.getAttribute('data-raid-ext-form');
  const d = draftOf(id);
  // Text fields keep the draft on every key (live re-renders rebuild the form); class re-renders for its specs.
  form.querySelectorAll('[data-raid-ext-f]').forEach((/** @type {HTMLInputElement} */ el) => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
    const [i, f] = el.getAttribute('data-raid-ext-f').split('|');
    const c = d.chars[Number(i)];
    c[f] = el.value.trim();
    if (f === 'cls'){ c.spec = ''; renderRaidsPage(); }
  }));
  const note = /** @type {HTMLTextAreaElement} */ (form.querySelector('[data-raid-ext-note]'));
  note.addEventListener('input', () => { d.note = note.value; });
  form.querySelectorAll('[data-raid-ext-addchar]').forEach(btn => btn.addEventListener('click', () => { d.chars.push({ n: '', cls: '', spec: '', armory: '' }); renderRaidsPage(); }));
  form.querySelectorAll('[data-raid-ext-delchar]').forEach(btn => btn.addEventListener('click', () => { d.chars.splice(Number(btn.getAttribute('data-raid-ext-delchar')), 1); renderRaidsPage(); }));
  form.querySelectorAll('[data-raid-ext-delshot]').forEach(btn => btn.addEventListener('click', () => { d.shots.splice(Number(btn.getAttribute('data-raid-ext-delshot')), 1); renderRaidsPage(); }));
  const file = /** @type {HTMLInputElement | null} */ (form.querySelector('[data-raid-ext-file]'));
  if (file) file.addEventListener('change', async () => {
    d.err = '';
    for (const f of Array.from(file.files || []).slice(0, RAID_EXT_MAX_SHOTS - d.shots.length)) {
      try { d.shots.push(await raidExtShrink(f)); } catch (e){ d.err = `„${f.name}“ konnte nicht verarbeitet werden (kein Bild oder zu groß).`; }
    }
    renderRaidsPage();
  });
  form.querySelector('[data-raid-ext-cancel]').addEventListener('click', () => { delete raidExtDrafts[id]; renderRaidsPage(); });
  form.querySelector('[data-raid-ext-submit]').addEventListener('click', async () => {
    const chars = d.chars.filter(c => c.n || c.cls || c.armory);
    const bad = chars.find(c => !c.n || !CLASS_MAP[c.cls] || !foreverSpecsForClass(c.cls).some(s => s.id === c.spec) || !RAID_EXT_URL_RE.test(c.armory));
    if (!chars.length || bad){ d.err = 'Bitte für jeden Charakter Name, Klasse, Spezialisierung und einen Armory-Link (https://…) angeben.'; renderRaidsPage(); return; }
    const prev = (raidApps[id] || {})[me];
    const now = Date.now();
    const app = {
      name: discordIdentity.username || '',
      chars: Object.fromEntries(chars.map((c, i) => [`c${i + 1}`, { n: c.n.slice(0, 40), cls: c.cls, spec: c.spec, armory: c.armory.slice(0, 300) }])),
      note: d.note.trim().slice(0, 1000),
      shots: d.shots.length,
      at: prev && prev.app ? prev.app.at : now,
      upd: now
    };
    try {
      await db.ref(`${DB_PATH}/raidApplicationShots/${id}/${me}`).set(d.shots.length ? Object.fromEntries(d.shots.map((s, i) => [`s${i + 1}`, s])) : null);
      await appRef(id, me).child('app').set(app);
      delete raidExtDrafts[id];
      delete raidExtShots[`${id}|${me}`];
      raidExtMsg = '';
    } catch (e){ d.err = 'Speichern fehlgeschlagen — Anmeldung geschlossen oder Firebase-Regeln nicht aktualisiert?'; }
    renderRaidsPage();
  });
}
