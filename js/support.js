// Support: "Problem melden" — every logged-in user (members, applicants,
// guests) can report a problem with the page: display (phone, card too
// wide …), data they can't see, wrong / outdated information, something
// that doesn't work, or an idea. A floating button bottom right (and
// "Problem melden" in the user menu) opens the form: category,
// description, optional screenshot — upload, paste (Ctrl+V or "Aus
// Zwischenablage") or "Screenshot dieser Seite" (supportCapture: the
// browser's screen capture of this tab on desktops, else the visible part
// re-drawn by html2canvas, vendor/html2canvas.min.js, loaded on demand).
// The report carries the context
// automatically — page, viewport, phone or not, browser, role, test mode
// and the last JavaScript errors —, so display problems can be
// reproduced. Reporters see their own reports with status and answer in
// the same window. Officers / admins work them off on the page
// "Meldungen" (status open / in progress / done, answer, open the page,
// screenshot); open ones count on the nav badge and Home "Zu tun".
//
// Firebase (README § 6f, own listeners — not SYNCED_KEYS):
//  - supportReports/<id> = { uid, name, role, cat, text, page, hash, vw,
//    vh, dpr, mobile, ua, errors: [..], shot (0/1), at, status, reply,
//    handledBy, handledAt }. Create: anyone logged in (own uid). Read /
//    update: officers / admins; reporters read their own via a query on uid.
//  - supportReportShots/<id> = JPEG data URL (resized in the browser),
//    read by officers / admins only when opened.

const SUPPORT_CATS = {
  display: 'Darstellung (Handy, zu breit, abgeschnitten …)',
  data: 'Daten fehlen / kann etwas nicht sehen',
  info: 'Information falsch oder veraltet',
  bug: 'Funktion geht nicht',
  idea: 'Idee / Wunsch'
};
const SUPPORT_STATUS = { open: 'Offen', progress: 'In Arbeit', done: 'Erledigt' };

/** Last JavaScript errors on this page (for the report). @type {string[]} */
const supportErrors = [];
window.addEventListener('error', ev => { supportErrors.push(String(ev.message || 'Fehler').slice(0, 200) + (ev.filename ? ` (${String(ev.filename).split('/').pop()}:${ev.lineno})` : '')); if (supportErrors.length > 5) supportErrors.shift(); });
window.addEventListener('unhandledrejection', ev => { supportErrors.push(`Promise: ${String((ev.reason && ev.reason.message) || ev.reason || '').slice(0, 200)}`); if (supportErrors.length > 5) supportErrors.shift(); });

/** id -> report (officers: all; others: own). @type {Record<string, any>} */
let supportReports = {};
let supportSyncKey = '';
let supportLoadError = '';
let supportFilter = 'open';
/** Report form draft. */
/** @type {{ cat: string, text: string, shot: string, err: string, sent: boolean, busy?: boolean }} */
let supportDraft = { cat: '', text: '', shot: '', err: '', sent: false };
/** Loaded screenshots (officers). @type {Record<string, string>} */
const supportShots = {};

/** Normalized report (or null). @param {any} r */
function supportNormalize(r){
  if (!r || typeof r !== 'object' || typeof r.text !== 'string') return null;
  return {
    uid: String(r.uid || ''), name: String(r.name || '').slice(0, 60), role: String(r.role || ''),
    cat: SUPPORT_CATS[r.cat] ? r.cat : 'bug', text: r.text.slice(0, 2000),
    page: String(r.page || ''), hash: String(r.hash || '').slice(0, 200),
    vw: Number(r.vw) || 0, vh: Number(r.vh) || 0, dpr: Number(r.dpr) || 1, mobile: r.mobile === true, ua: String(r.ua || '').slice(0, 300),
    errors: Array.isArray(r.errors) ? r.errors.filter(x => typeof x === 'string').slice(0, 5) : [],
    shot: Number(r.shot) || 0, at: Number(r.at) || 0,
    status: SUPPORT_STATUS[r.status] ? r.status : 'open',
    reply: String(r.reply || '').slice(0, 2000), handledBy: String(r.handledBy || '').slice(0, 60), handledAt: Number(r.handledAt) || 0
  };
}

/** Listen: officers / admins all reports, everybody else their own. */
function supportSync(){
  if (!db || !discordIdentity) return;
  const officer = isOfficerOrAdmin();
  const key = `${discordIdentity.id}|${officer ? 'all' : 'own'}`;
  if (key === supportSyncKey) return;
  if (supportSyncKey) db.ref(`${DB_PATH}/supportReports`).off();
  supportSyncKey = key;
  supportReports = {};
  const base = db.ref(`${DB_PATH}/supportReports`);
  const ref = officer ? base : base.orderByChild('uid').equalTo(discordIdentity.id);
  ref.on('value', snap => {
    /** @type {Record<string, any>} */
    const out = {};
    for (const [id, raw] of Object.entries(snap.val() || {})) { const r = supportNormalize(raw); if (r) out[id] = r; }
    supportReports = out;
    supportLoadError = '';
    supportRerender();
  }, () => { supportLoadError = 'Keine Leserechte für Meldungen — Firebase-Regeln aktualisiert?'; supportRerender(); });
}
function supportRerender(){
  if (currentPage === 'support') renderSupportPage();
  if (currentPage === 'home' && isOfficerOrAdmin()) renderHomeDashboard();
  const modal = document.getElementById('supportModal');
  if (modal && !modal.classList.contains('hidden')) supportRenderModal();
  renderSidebarNav();
  renderQuestBell();
}
/** Open reports (officers' badge and "Zu tun"). */
function supportOpenCount(){
  if (!isOfficerOrAdmin()) return 0;
  supportSync();
  return Object.values(supportReports).filter(r => r.status === 'open').length;
}

/** Label of a page id. @param {string} id */
const supportPageLabel = id => { const p = (typeof PAGES !== 'undefined' ? PAGES : []).find(x => x.id === id); return p ? p.label : (id || '—'); };
const supportWhen = ms => new Date(ms).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

// ---------------------------------------------------------------- report form (modal)
function supportOpen(){
  let modal = document.getElementById('supportModal');
  if (!modal){
    modal = document.createElement('div');
    modal.id = 'supportModal';
    modal.className = 'access-modal support-modal hidden';
    modal.addEventListener('click', ev => { if (ev.target === modal) supportClose(); });
    document.body.appendChild(modal);
  }
  if (supportDraft.sent) supportDraft = { cat: '', text: '', shot: '', err: '', sent: false };
  modal.classList.remove('hidden');
  supportSync();
  supportRenderModal();
}
function supportClose(){
  const modal = document.getElementById('supportModal');
  if (modal) modal.classList.add('hidden');
}
function supportRenderModal(){
  const modal = document.getElementById('supportModal');
  if (!modal) return;
  const d = supportDraft;
  const page = supportPageLabel(currentPage);
  const mine = discordIdentity ? Object.entries(supportReports).filter(([, r]) => r.uid === discordIdentity.id).sort((a, z) => z[1].at - a[1].at).slice(0, 5) : [];
  let body;
  if (!discordIdentity) body = '<p class="access-modal-note">Zum Melden bitte oben rechts mit Discord anmelden — so können wir nachfragen, falls etwas unklar ist.</p>';
  else if (d.sent) body = `<p class="home-status home-status-good">✓ Danke! Deine Meldung ist angekommen. Den Stand siehst Du hier unter „Deine Meldungen“.</p>
      <div class="forever-actions"><button type="button" class="btn btn-ghost btn-sm" data-support-new>Noch etwas melden</button></div>`;
  else body = `
      <label class="support-field">Was ist los?<select data-support-cat><option value="">— bitte wählen —</option>${Object.entries(SUPPORT_CATS).map(([k, l]) => `<option value="${k}" ${d.cat === k ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('')}</select></label>
      <label class="support-field">Beschreibung<textarea class="apply-text-input" rows="4" maxlength="2000" data-support-text placeholder="Was hast Du gemacht, was ist passiert, was hättest Du erwartet? Wo genau auf der Seite?">${escapeHtml(d.text)}</textarea></label>
      <div class="support-field">Screenshot (optional)
        ${d.shot ? `<div class="raid-ext-shots"><span class="raid-ext-shot"><img src="${d.shot}" alt="Screenshot"><button type="button" data-support-delshot aria-label="Entfernen">×</button></span></div>`
          : `<div class="support-shot-actions">
            <button type="button" class="btn btn-ghost btn-sm" data-support-capture>${d.busy ? 'Screenshot wird erstellt …' : 'Screenshot dieser Seite'}</button>
            ${navigator.clipboard && typeof navigator.clipboard.read === 'function' ? '<button type="button" class="btn btn-ghost btn-sm" data-support-paste>Aus Zwischenablage</button>' : ''}
            <label class="btn btn-ghost btn-sm">Bild hochladen<input type="file" accept="image/png,image/jpeg,image/webp" data-support-file hidden></label>
          </div>
          <span class="support-shot-tip">Tipp: Ein kopiertes Bild kannst Du auch mit Strg+V (Mac: ⌘+V) hier einfügen.</span>`}
      </div>
      <p class="access-modal-note">Wird automatisch mitgeschickt: Seite „${escapeHtml(page)}“, Bildschirm ${window.innerWidth}×${window.innerHeight}${supportIsMobile() ? ' (Handy)' : ''}, Browser, Deine Rolle${supportErrors.length ? `, ${supportErrors.length} Fehlermeldung(en) der Seite` : ''}.</p>
      ${d.err ? `<p class="bis-hint raid-error">${escapeHtml(d.err)}</p>` : ''}
      <div class="forever-actions"><button type="button" class="btn btn-teal btn-sm" data-support-send>Meldung senden</button></div>`;
  modal.innerHTML = `<div class="access-modal-card support-card">
    <div class="access-modal-header"><h2>${gameIconHtml('todo', 22)} Problem melden</h2><button type="button" class="btn btn-ghost btn-sm" data-support-close>Schließen</button></div>
    <p class="access-modal-note">Etwas sieht komisch aus, fehlt oder stimmt nicht? Sag uns Bescheid — die Gildenleitung kümmert sich darum.</p>
    ${body}
    ${mine.length ? `<div class="support-mine"><div class="raid-col-head">Deine Meldungen</div>${mine.map(([, r]) => `<div class="support-mine-item">
      <div><span class="support-status support-status-${r.status}">${SUPPORT_STATUS[r.status]}</span> <b>${escapeHtml(SUPPORT_CATS[r.cat].split(' (')[0])}</b> <span class="bis-item-meta">${escapeHtml(supportWhen(r.at))} · ${escapeHtml(supportPageLabel(r.page))}</span></div>
      <p>${escapeHtml(r.text.length > 160 ? r.text.slice(0, 160) + ' …' : r.text)}</p>
      ${r.reply ? `<p class="support-reply"><b>Antwort${r.handledBy ? ` von ${escapeHtml(r.handledBy)}` : ''}:</b> ${escapeHtml(r.reply)}</p>` : ''}
    </div>`).join('')}</div>` : ''}
  </div>`;
  supportWireModal(modal);
}
/** Use an image blob as the report's screenshot. @param {Blob} blob */
async function supportSetShot(blob){
  const d = supportDraft;
  try { d.shot = await raidExtShrink(blob); d.err = ''; } catch (e){ d.err = 'Das Bild konnte nicht verarbeitet werden (kein Bild oder zu groß).'; }
  supportRenderModal();
}
/** Ctrl+V / ⌘+V while the form is open: take a pasted image. @param {ClipboardEvent} ev */
function supportOnPaste(ev){
  const modal = document.getElementById('supportModal');
  if (!modal || modal.classList.contains('hidden') || supportDraft.sent || supportDraft.shot) return;
  const item = Array.from((ev.clipboardData && ev.clipboardData.items) || []).find(i => i.kind === 'file' && i.type.startsWith('image/'));
  const file = item && item.getAsFile();
  if (!file) return; // plain text goes into the text field as usual
  ev.preventDefault();
  supportSetShot(file);
}

/**
 * "Screenshot dieser Seite": hides the form, then on desktops asks the
 * browser for a capture of this tab (Chrome / Edge offer "Diesen Tab"
 * directly — pixel-exact, best for display problems); phones and
 * browsers without screen capture get the visible part re-drawn by
 * html2canvas instead (close, not pixel-exact).
 */
async function supportCapture(){
  const d = supportDraft;
  const modal = document.getElementById('supportModal');
  const fab = /** @type {HTMLElement | null} */ (document.querySelector('.support-fab'));
  const md = navigator.mediaDevices;
  const useTab = Boolean(md && typeof md.getDisplayMedia === 'function') && !supportIsMobile();
  d.busy = true;
  d.err = '';
  if (modal) modal.classList.add('hidden');
  if (fab) fab.classList.add('hidden');
  try {
    // getDisplayMedia must be called right away (it needs the click).
    const blob = useTab ? await supportCaptureTab(md) : await supportCaptureDom();
    d.shot = await raidExtShrink(blob);
  } catch (e){
    d.err = e && e.name === 'NotAllowedError' ? 'Aufnahme abgebrochen — Du kannst auch ein Bild hochladen oder einfügen.' : 'Der Screenshot hat nicht geklappt — lade stattdessen ein Bild hoch oder füge eins ein.';
  }
  d.busy = false;
  if (modal) modal.classList.remove('hidden');
  if (fab) fab.classList.remove('hidden');
  supportRenderModal();
}
/** One frame of a screen capture of this tab. @param {MediaDevices} md @returns {Promise<Blob>} */
async function supportCaptureTab(md){
  const stream = await md.getDisplayMedia(/** @type {any} */ ({ video: { displaySurface: 'browser' }, audio: false, preferCurrentTab: true, selfBrowserSurface: 'include' }));
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.srcObject = stream;
    await video.play();
    // Give the page a moment to repaint without the form and the browser's picker.
    await new Promise(r => setTimeout(r, 450));
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    return await new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('empty'))), 'image/png'));
  } finally { stream.getTracks().forEach(t => t.stop()); }
}
/** The visible part of the page re-drawn by html2canvas (loaded on first use). @returns {Promise<Blob>} */
async function supportCaptureDom(){
  const w = /** @type {any} */ (window);
  if (!w.html2canvas) await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'vendor/html2canvas.min.js';
    s.onload = res;
    s.onerror = rej;
    document.head.appendChild(s);
  });
  const canvas = await w.html2canvas(document.body, {
    x: window.scrollX, y: window.scrollY, width: window.innerWidth, height: window.innerHeight,
    scale: Math.min(2, window.devicePixelRatio || 1), useCORS: true, logging: false,
    backgroundColor: getComputedStyle(document.body).backgroundColor || null,
    ignoreElements: el => el.id === 'supportModal' || el.classList.contains('support-fab'),
    // html2canvas can't draw gradient text (background-clip: text) — plain gold instead.
    onclone: doc => doc.querySelectorAll('h1, h2, h3, .hero-title').forEach((/** @type {HTMLElement} */ el) => {
      const cs = getComputedStyle(el);
      if (cs.backgroundClip === 'text' || cs.webkitBackgroundClip === 'text'){
        el.style.background = 'none';
        el.style.webkitTextFillColor = 'currentColor';
        el.style.color = 'var(--gold-bright)';
      }
    })
  });
  return await new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('empty'))), 'image/png'));
}

const supportIsMobile = () => window.matchMedia('(max-width: 760px)').matches || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

/** @param {HTMLElement} modal */
function supportWireModal(modal){
  const d = supportDraft;
  const on = (sel, ev, fn) => { const el = modal.querySelector(sel); if (el) el.addEventListener(ev, fn); };
  on('[data-support-close]', 'click', supportClose);
  on('[data-support-new]', 'click', () => { supportDraft = { cat: '', text: '', shot: '', err: '', sent: false }; supportRenderModal(); });
  on('[data-support-cat]', 'change', ev => { d.cat = /** @type {HTMLSelectElement} */ (ev.target).value; });
  on('[data-support-text]', 'input', ev => { d.text = /** @type {HTMLTextAreaElement} */ (ev.target).value; });
  on('[data-support-delshot]', 'click', () => { d.shot = ''; supportRenderModal(); });
  on('[data-support-file]', 'change', async ev => {
    const f = (/** @type {HTMLInputElement} */ (ev.target).files || [])[0];
    if (!f) return;
    supportSetShot(f);
  });
  on('[data-support-capture]', 'click', () => { if (!d.busy) supportCapture(); });
  on('[data-support-paste]', 'click', async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const it of items) {
        const type = it.types.find(t => t.startsWith('image/'));
        if (type) return supportSetShot(await it.getType(type));
      }
      d.err = 'In der Zwischenablage ist kein Bild.';
    } catch (e){ d.err = 'Kein Zugriff auf die Zwischenablage — drück stattdessen Strg+V (Mac: ⌘+V).'; }
    supportRenderModal();
  });
  on('[data-support-send]', 'click', async () => {
    if (!d.cat){ d.err = 'Bitte wähle aus, worum es geht.'; supportRenderModal(); return; }
    if (d.text.trim().length < 5){ d.err = 'Bitte beschreib kurz, was nicht passt.'; supportRenderModal(); return; }
    const ref = db.ref(`${DB_PATH}/supportReports`).push();
    const report = {
      uid: discordIdentity.id, name: discordIdentity.username || '', role: currentRole,
      cat: d.cat, text: d.text.trim().slice(0, 2000),
      page: currentPage, hash: String(window.location.hash || '').slice(0, 200),
      vw: window.innerWidth, vh: window.innerHeight, dpr: Math.round((window.devicePixelRatio || 1) * 100) / 100, mobile: supportIsMobile(),
      ua: navigator.userAgent.slice(0, 300), errors: supportErrors.slice(-5), shot: d.shot ? 1 : 0,
      at: Date.now(), status: 'open', ...(RUDE_TESTMODE ? { test: true } : {})
    };
    try {
      await db.ref(`${DB_PATH}/supportReports/${ref.key}`).set(report);
      if (d.shot) await db.ref(`${DB_PATH}/supportReportShots/${ref.key}`).set(d.shot);
      supportDraft = { cat: '', text: '', shot: '', err: '', sent: true };
    } catch (e){ d.err = 'Senden fehlgeschlagen — bitte später nochmal versuchen.'; }
    supportRenderModal();
  });
}

// ---------------------------------------------------------------- officers: page "Meldungen"
function renderSupportPage(){
  const root = document.getElementById('supportRoot');
  if (!root) return;
  if (!discordIdentity || !isOfficerOrAdmin()){ root.innerHTML = '<div class="tac-card"><p class="bis-hint">Die Meldungen sehen Offiziere und Admins.</p></div>'; return; }
  supportSync();
  const all = Object.entries(supportReports).sort((a, z) => z[1].at - a[1].at);
  const count = st => all.filter(([, r]) => r.status === st).length;
  const list = all.filter(([, r]) => supportFilter === 'all' || r.status === supportFilter);
  const filterBtn = (k, l) => `<button type="button" class="tac-boss${supportFilter === k ? ' active' : ''}" data-support-filter="${k}">${l}${k === 'all' ? ` <small>${all.length}</small>` : ` <small>${count(k)}</small>`}</button>`;
  root.innerHTML = `${supportLoadError ? `<p class="bis-hint raid-error">${escapeHtml(supportLoadError)}</p>` : ''}
    <div class="tac-card">
      <div class="tac-bosses">${filterBtn('open', 'Offen')}${filterBtn('progress', 'In Arbeit')}${filterBtn('done', 'Erledigt')}${filterBtn('all', 'Alle')}</div>
      <p class="bis-hint">Meldungen kommen über „Problem melden“ (Button unten rechts) — mit Seite, Bildschirmgröße, Browser und den letzten Fehlermeldungen.</p>
    </div>
    ${list.length ? list.map(([id, r]) => supportItemHtml(id, r)).join('') : '<div class="tac-card"><p class="bis-hint">Keine Meldungen in dieser Ansicht.</p></div>'}`;
  supportWirePage(root);
}
function supportItemHtml(id, r){
  const shot = supportShots[id];
  return `<div class="tac-card support-item support-item-${r.status}">
    <div class="support-item-head">
      <span class="support-status support-status-${r.status}">${SUPPORT_STATUS[r.status]}</span>
      <b>${escapeHtml(SUPPORT_CATS[r.cat])}</b>
      <span class="bis-item-meta">${escapeHtml(supportWhen(r.at))} · ${escapeHtml(r.name || 'Unbekannt')} (${escapeHtml((ACCESS_ROLES[r.role] || { label: r.role || '?' }).label)})</span>
    </div>
    <p class="support-text">${escapeHtml(r.text).replace(/\n/g, '<br>')}</p>
    <div class="support-ctx">
      <span>Seite: <button type="button" class="support-link" data-support-goto="${escapeHtml(r.page)}">${escapeHtml(supportPageLabel(r.page))}</button>${r.hash ? ` <code>${escapeHtml(r.hash)}</code>` : ''}</span>
      <span>Bildschirm: ${r.vw}×${r.vh}${r.dpr !== 1 ? ` @${r.dpr}x` : ''}${r.mobile ? ' · Handy' : ''}</span>
      <span title="${escapeHtml(r.ua)}">${escapeHtml(supportBrowser(r.ua))}</span>
    </div>
    ${r.errors.length ? `<details class="support-errors"><summary>${r.errors.length} Fehlermeldung(en) der Seite</summary><ul>${r.errors.map(e => `<li><code>${escapeHtml(e)}</code></li>`).join('')}</ul></details>` : ''}
    ${r.shot ? (shot ? `<div class="raid-ext-shots"><button type="button" class="raid-ext-shot" data-support-zoom="${escapeHtml(id)}"><img src="${shot}" alt="Screenshot"></button></div>` : `<button type="button" class="btn btn-ghost btn-sm" data-support-shot="${escapeHtml(id)}">Screenshot anzeigen</button>`) : ''}
    <div class="support-handle">
      <label>Status<select data-support-status="${escapeHtml(id)}">${Object.entries(SUPPORT_STATUS).map(([k, l]) => `<option value="${k}" ${r.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="support-reply-edit">Antwort (erscheint bei ${escapeHtml(r.name || 'der meldenden Person')} im Meldefenster)<textarea class="apply-text-input" rows="2" maxlength="2000" data-support-reply="${escapeHtml(id)}">${escapeHtml(r.reply)}</textarea></label>
      <div class="forever-actions"><button type="button" class="btn btn-ghost btn-sm" data-support-save="${escapeHtml(id)}">Antwort speichern</button><button type="button" class="btn btn-ghost btn-sm" data-support-del="${escapeHtml(id)}">Löschen</button>
        ${r.handledBy ? `<span class="bis-item-meta">zuletzt bearbeitet von ${escapeHtml(r.handledBy)}</span>` : ''}</div>
    </div>
  </div>`;
}
/** Short browser / OS label from a user agent. @param {string} ua */
function supportBrowser(ua){
  const b = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return [b, os].filter(Boolean).join(' · ');
}
/** @param {HTMLElement} root */
function supportWirePage(root){
  const ref = id => db.ref(`${DB_PATH}/supportReports/${id}`);
  const fail = () => { supportLoadError = 'Speichern fehlgeschlagen — Firebase-Regeln aktualisiert?'; renderSupportPage(); };
  const by = () => (discordIdentity && discordIdentity.username) || '';
  root.querySelectorAll('[data-support-filter]').forEach(btn => btn.addEventListener('click', () => { supportFilter = btn.getAttribute('data-support-filter'); renderSupportPage(); }));
  root.querySelectorAll('[data-support-goto]').forEach(btn => btn.addEventListener('click', () => showPage(btn.getAttribute('data-support-goto') || 'home')));
  root.querySelectorAll('[data-support-status]').forEach((/** @type {HTMLSelectElement} */ el) => el.addEventListener('change', () => {
    ref(el.getAttribute('data-support-status')).update({ status: el.value, handledBy: by(), handledAt: Date.now() }).catch(fail);
  }));
  root.querySelectorAll('[data-support-save]').forEach(btn => btn.addEventListener('click', () => {
    const id = btn.getAttribute('data-support-save');
    const box = /** @type {HTMLTextAreaElement | null} */ (root.querySelector(`[data-support-reply="${CSS.escape(id)}"]`));
    ref(id).update({ reply: box ? box.value.trim().slice(0, 2000) : '', handledBy: by(), handledAt: Date.now() }).catch(fail);
  }));
  root.querySelectorAll('[data-support-del]').forEach(btn => btn.addEventListener('click', async () => {
    const id = btn.getAttribute('data-support-del');
    if (!confirm('Meldung löschen?')) return;
    try { await db.ref(`${DB_PATH}/supportReportShots/${id}`).remove(); await ref(id).remove(); } catch (e){ fail(); }
  }));
  root.querySelectorAll('[data-support-shot]').forEach(btn => btn.addEventListener('click', () => {
    const id = btn.getAttribute('data-support-shot');
    db.ref(`${DB_PATH}/supportReportShots/${id}`).once('value').then(snap => {
      const v = snap.val();
      supportShots[id] = typeof v === 'string' && RAID_EXT_SHOT_RE.test(v) ? v : '';
      renderSupportPage();
    }).catch(fail);
  }));
  root.querySelectorAll('[data-support-zoom]').forEach(btn => btn.addEventListener('click', () => raidExtZoom(supportShots[btn.getAttribute('data-support-zoom')] || '')));
}

// ---------------------------------------------------------------- entry points
(function supportInit(){
  const fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 'support-fab';
  fab.title = 'Problem mit der Seite melden';
  fab.setAttribute('aria-label', 'Problem melden');
  fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/><path d="M12 8v4M12 15.5v.01"/></svg><span>Problem melden</span>';
  fab.addEventListener('click', supportOpen);
  document.body.appendChild(fab);
  const menuBtn = document.getElementById('accessSupportBtn');
  if (menuBtn) menuBtn.addEventListener('click', () => { const pop = document.getElementById('accessPopover'); if (pop) pop.classList.add('hidden'); supportOpen(); });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape') supportClose(); });
  document.addEventListener('paste', supportOnPaste);
})();
