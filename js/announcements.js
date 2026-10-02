// Ankündigungen: rich-text toolbar, announcement list,
// posting/editing/deleting.
//
// Classic (non-module) script — shares the global scope with the other
// js/*.js files; load order is set in index.html. Code that runs at load
// time may only use files loaded before this one.

// ---------------------------------------------------------------------
// Announcements — Admins/Officers post free-text announcements, shown as
// collapsible cards (reusing the same .voting-card shell). Newest first;
// whenever a genuinely new announcement shows up, everyone's local
// collapse state resets to the default (newest expanded, the rest
// collapsed underneath it) — a fresh announcement should always surface.
// ---------------------------------------------------------------------
let announceCardManualOpen = {}; // { [announceId]: true|false }
let announceLastNewestId; // undefined = not yet rendered once
let announceEditingId = null; // id of the announcement currently being edited inline, or null

// Small formatting toolbar shared by the "new announcement" composer and
// by inline per-card editing. Plain buttons (not a <select>) on purpose —
// a button can use mousedown.preventDefault() to keep the contenteditable
// selection alive across the click, which a native <select> can't do
// reliably, so sizing is 4 buttons rather than a dropdown.
function announceToolbarMarkup(){
  return `
    <button type="button" data-cmd="h1" title="Überschrift 1">H1</button>
    <button type="button" data-cmd="h2" title="Überschrift 2">H2</button>
    <button type="button" data-cmd="p" title="Normaler Text">¶</button>
    <span class="announce-toolbar-sep"></span>
    <button type="button" data-cmd="bold" title="Fett"><b>F</b></button>
    <button type="button" data-cmd="italic" title="Kursiv"><i>K</i></button>
    <button type="button" data-cmd="underline" title="Unterstrichen"><u>U</u></button>
    <span class="announce-toolbar-sep"></span>
    <button type="button" data-cmd="ul" title="Aufzählung">• Liste</button>
    <span class="announce-toolbar-sep"></span>
    <button type="button" data-size="2" title="Kleine Schrift">A⁻</button>
    <button type="button" data-size="3" title="Normale Schrift">A</button>
    <button type="button" data-size="5" title="Große Schrift">A⁺</button>
    <button type="button" data-size="7" title="Sehr große Schrift">A⁺⁺</button>
  `;
}
function execAnnounceFormatCmd(editorEl, cmd){
  editorEl.focus();
  const blockTag = { h1: 'H1', h2: 'H2', p: 'P' }[cmd];
  if (blockTag) document.execCommand('formatBlock', false, blockTag);
  else if (cmd === 'bold') document.execCommand('bold');
  else if (cmd === 'italic') document.execCommand('italic');
  else if (cmd === 'underline') document.execCommand('underline');
  else if (cmd === 'ul') document.execCommand('insertUnorderedList');
}
function wireAnnounceToolbar(toolbarEl, editorEl){
  if (!toolbarEl || !editorEl) return;
  toolbarEl.querySelectorAll('button').forEach(btn => {
    // Without this, clicking the button would move focus off the editor
    // first, collapsing/losing the text selection the command should
    // apply to.
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', () => {
      editorEl.focus();
      const cmd = btn.getAttribute('data-cmd');
      const size = btn.getAttribute('data-size');
      if (cmd) execAnnounceFormatCmd(editorEl, cmd);
      else if (size) document.execCommand('fontSize', false, size);
    });
  });
}

function sortedAnnouncements(){
  return Object.keys(state.announcements || {})
    .map(id => Object.assign({ id }, state.announcements[id]))
    .sort((a, b) => b.createdAt - a.createdAt);
}

function toggleAnnounceCard(id){
  const body = document.getElementById('announceBody-' + id);
  if (!body) return;
  const currentlyOpen = !body.classList.contains('hidden');
  announceCardManualOpen[id] = !currentlyOpen;
  applyCardCollapsedUi('announceCard-' + id, 'announceBody-' + id, currentlyOpen);
}

function formatAnnounceDate(ts){
  if (!ts) return '';
  try{
    return new Date(ts).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }catch(e){ return ''; }
}

function renderAnnouncementsView(){
  const loggedIn = !!discordIdentity;
  const hasAccess = loggedIn && isMemberOrHigher();
  els.announceLoggedOut.classList.toggle('hidden', loggedIn);
  els.announceNoAccess.classList.toggle('hidden', !loggedIn || hasAccess);
  els.announceLoggedIn.classList.toggle('hidden', !hasAccess);
  if (!hasAccess) return;

  els.announceComposer.classList.toggle('hidden', !isOfficerOrAdmin());

  const list = sortedAnnouncements();

  // A genuinely new newest announcement (including going from none to
  // one) resets everyone's local collapse choices back to the default —
  // newest open, everything else collapses underneath it.
  const newestId = list.length ? list[0].id : null;
  if (announceLastNewestId !== undefined && newestId !== announceLastNewestId){
    announceCardManualOpen = {};
  }
  announceLastNewestId = newestId;

  if (!list.length){
    els.announceList.innerHTML = `<div class="lootlib-note">Noch keine Ankündigungen.</div>`;
    return;
  }

  const canManage = isOfficerOrAdmin();
  els.announceList.innerHTML = list.map((a, idx) => {
    const dateStr = formatAnnounceDate(a.createdAt);
    // Announcements from before the title field existed have none — fall
    // back to a snippet of the body so the header never shows blank.
    let headerTitle = a.title;
    if (!headerTitle){
      const plainText = stripHtmlToText(a.text);
      headerTitle = plainText.length > 70 ? plainText.slice(0, 70).trim() + '…' : plainText;
    }
    const editedTag = a.editedAt ? ' · <span class="announce-edited-tag">bearbeitet</span>' : '';
    const isEditing = canManage && announceEditingId === a.id;

    const adminControlsHtml = canManage
      ? `<div class="voting-admin-controls">
          <span class="lootlib-note">Nur für Admins/Offiziere sichtbar.</span>
          <div class="voting-admin-controls-actions">
            <button type="button" class="btn btn-sm btn-outline-gold" data-announce-edit="${a.id}">Bearbeiten</button>
            <button type="button" class="btn btn-sm btn-outline-gold" data-announce-delete="${a.id}">Löschen</button>
          </div>
        </div>`
      : '';

    const bodyHtml = isEditing
      ? `<input type="text" class="announce-title-input" id="announceEditTitle-${a.id}" placeholder="Titel der Ankündigung…" maxlength="120" value="${escapeHtml(a.title)}">
         <div class="announce-toolbar" id="announceEditToolbar-${a.id}">${announceToolbarMarkup()}</div>
         <div class="announce-editor" id="announceEditEditor-${a.id}" contenteditable="true" data-placeholder="Text der Ankündigung…">${a.text}</div>
         <div class="announce-card-edit-actions">
           <button type="button" class="btn btn-teal btn-sm" data-announce-save-edit="${a.id}">Speichern</button>
           <button type="button" class="btn btn-sm btn-ghost" data-announce-cancel-edit="${a.id}">Abbrechen</button>
           <span id="announceEditStatus-${a.id}" class="armory-status"></span>
         </div>`
      : `${adminControlsHtml}<div class="announce-card-text">${a.text}</div>`;

    return `<div class="voting-card announce-card" id="announceCard-${a.id}" data-announce-id="${a.id}">
      <button type="button" class="voting-card-header" data-announce-toggle="${a.id}">
        <span class="voting-card-chevron">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7"/></svg>
        </span>
        <span class="voting-card-title announce-card-title">${escapeHtml(headerTitle)}</span>
        <span class="announce-card-meta">${escapeHtml(a.authorName)}${dateStr ? ' · ' + escapeHtml(dateStr) : ''}${editedTag}</span>
      </button>
      <div class="voting-card-body" id="announceBody-${a.id}">
        ${bodyHtml}
      </div>
    </div>`;
  }).join('');

  // Default: only the newest announcement (idx 0) starts expanded, unless
  // the viewer already manually toggled this specific card this session.
  // A card currently being edited is always forced open (see
  // startEditAnnouncement) so this loop naturally leaves it as-is.
  list.forEach((a, idx) => {
    if (announceCardManualOpen[a.id] === undefined){
      applyCardCollapsedUi('announceCard-' + a.id, 'announceBody-' + a.id, idx !== 0);
    }
  });

  if (canManage && announceEditingId){
    const toolbarEl = document.getElementById('announceEditToolbar-' + announceEditingId);
    const editorEl = document.getElementById('announceEditEditor-' + announceEditingId);
    if (toolbarEl && editorEl){
      wireAnnounceToolbar(toolbarEl, editorEl);
      editorEl.focus();
    }
  }

  els.announceList.querySelectorAll('[data-announce-toggle]').forEach(btn => {
    btn.addEventListener('click', () => toggleAnnounceCard(btn.getAttribute('data-announce-toggle')));
  });
  els.announceList.querySelectorAll('[data-announce-delete]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteAnnouncement(btn.getAttribute('data-announce-delete'));
    });
  });
  els.announceList.querySelectorAll('[data-announce-edit]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      startEditAnnouncement(btn.getAttribute('data-announce-edit'));
    });
  });
  els.announceList.querySelectorAll('[data-announce-save-edit]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      saveAnnouncementEdit(btn.getAttribute('data-announce-save-edit'));
    });
  });
  els.announceList.querySelectorAll('[data-announce-cancel-edit]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      cancelEditAnnouncement();
    });
  });
}

function startEditAnnouncement(id){
  if (!isOfficerOrAdmin() || !state.announcements || !state.announcements[id]) return;
  announceEditingId = id;
  // Editing must stay visible regardless of the card's collapsed state.
  announceCardManualOpen[id] = true;
  renderAnnouncementsView();
}

function cancelEditAnnouncement(){
  announceEditingId = null;
  renderAnnouncementsView();
}

async function saveAnnouncementEdit(id){
  if (!isOfficerOrAdmin() || !state.announcements || !state.announcements[id]) return;
  const editorEl = document.getElementById('announceEditEditor-' + id);
  const titleEl = /** @type {HTMLInputElement} */ (document.getElementById('announceEditTitle-' + id));
  const statusEl = document.getElementById('announceEditStatus-' + id);
  if (!editorEl) return;
  const html = sanitizeRichText(editorEl.innerHTML);
  if (!stripHtmlToText(html).trim()) return;
  const title = titleEl ? titleEl.value.trim().slice(0, 120) : '';
  const previous = state.announcements[id];
  state.announcements[id] = Object.assign({}, previous, { text: html, title, editedAt: Date.now() });
  if (statusEl){ statusEl.textContent = 'Saving…'; statusEl.className = 'armory-status'; }
  const ok = await saveData('announcements/' + id);
  if (ok){
    announceEditingId = null;
    renderAnnouncementsView();
  } else {
    // Roll the optimistic update back, but leave the editor and the
    // viewer's in-progress edit alone so nothing gets lost.
    state.announcements[id] = previous;
    if (statusEl){
      statusEl.textContent = 'Konnte nicht speichern — Firebase-Regeln prüfen (siehe README)';
      statusEl.className = 'armory-status armory-status-error';
    }
  }
}

async function saveAnnouncement(){
  if (!discordIdentity || !isOfficerOrAdmin()) return;
  const html = sanitizeRichText(els.announceEditor.innerHTML);
  if (!stripHtmlToText(html).trim()) return;
  const title = els.announceTitleInput.value.trim().slice(0, 120);
  let id = null;
  try{ id = db ? db.ref(DB_PATH + '/announcements').push().key : null; }catch(e){}
  if (!id) id = Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  if (!state.announcements) state.announcements = {};
  state.announcements[id] = /** @type {Announcement} */ ({
    text: html,
    title,
    authorName: discordIdentity.username,
    authorId: discordIdentity.id,
    createdAt: Date.now()
  });
  els.announceSaveStatus.textContent = 'Saving…';
  els.announceSaveStatus.className = 'armory-status';
  renderAll();
  const ok = await saveData('announcements/' + id);
  if (ok){
    els.announceEditor.innerHTML = '';
    els.announceTitleInput.value = '';
    els.announceSaveStatus.textContent = 'Veröffentlicht!';
    els.announceSaveStatus.className = 'armory-status armory-status-ok';
    setTimeout(() => { if (els.announceSaveStatus.textContent === 'Veröffentlicht!') els.announceSaveStatus.textContent = ''; }, 2000);
  } else {
    // Write failed (most likely: the Firebase rules haven't been updated
    // to allow announcement writes yet — see the README). Roll back so
    // the UI never claims the announcement was posted when it wasn't.
    delete state.announcements[id];
    els.announceSaveStatus.textContent = 'Konnte nicht speichern — Firebase-Regeln prüfen (siehe README)';
    els.announceSaveStatus.className = 'armory-status armory-status-error';
    renderAll();
  }
}

async function deleteAnnouncement(id){
  if (!isOfficerOrAdmin() || !state.announcements || !state.announcements[id]) return;
  const previous = state.announcements[id];
  delete state.announcements[id];
  if (announceEditingId === id) announceEditingId = null;
  renderAll();
  const ok = await saveData('announcements/' + id);
  if (!ok){
    state.announcements[id] = previous;
    renderAll();
  }
}
els.announceLoginBtn.addEventListener('click', () => startDiscordLogin());
els.announceSaveBtn.addEventListener('click', saveAnnouncement);
els.announceToolbar.innerHTML = announceToolbarMarkup();
wireAnnounceToolbar(els.announceToolbar, els.announceEditor);
