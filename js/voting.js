// Abstimmungen: vote-details modal, voting card chrome, custom polls and the
// WoW Forever class/spec survey.
//
// Classic (non-module) script — shares the global scope with the other
// js/*.js files; load order is set in index.html. Code that runs at load
// time may only use files loaded before this one.

// Shared "who voted for this bar" modal — used by both the general
// Abstimmungen poll bars and the class/spec survey bars, since neither
// kind of hover tooltip works on a touchscreen. `names` is the list of
// voter usernames for this one option/spec; pass `anonymous: true` for
// an anonymous poll to show only the count, never names.
function showVoteDetailsModal(title, names, opts){
  opts = opts || {};
  const count = opts.anonymous ? (opts.count || 0) : (names ? names.length : 0);
  els.voteDetailsModalTitle.textContent = title;
  els.voteDetailsModalSubtitle.textContent = opts.anonymous
    ? `${count} Stimme${count === 1 ? '' : 'n'} — anonyme Abstimmung, keine Namen sichtbar.`
    : `${count} Stimme${count === 1 ? '' : 'n'}`;
  els.voteDetailsModalList.innerHTML = (!opts.anonymous && names && names.length)
    ? names.map(n => `<div class="access-member-row"><span class="access-member-name">${escapeHtml(n)}</span></div>`).join('')
    : (opts.anonymous ? '' : `<div class="lootlib-note">Noch keine Stimmen.</div>`);
  els.voteDetailsModal.classList.remove('hidden');
}
els.voteDetailsModalCloseBtn.addEventListener('click', () => els.voteDetailsModal.classList.add('hidden'));
els.voteDetailsModal.addEventListener('click', (e) => {
  if (e.target === els.voteDetailsModal) els.voteDetailsModal.classList.add('hidden');
});

// --- WoW Forever class survey rendering ---
function foreverSavedEntry(){
  if (!discordIdentity) return null;
  return state.foreverSurvey[discordIdentity.id] || null;
}

// ---------------------------------------------------------------------
// Voting card chrome — the collapsible wrapper shared by every voting
// (currently just WoW Forever). Only tracks per-session manual
// collapse/expand overrides, never persisted; the default (open unless
// the voting is closed) is re-applied on every render UNLESS the person
// already toggled the card themselves this session.
// ---------------------------------------------------------------------
let votingCardManualOpen = {}; // { [votingId]: true|false } — undefined = no manual override yet

// Generic collapse/expand toggle for any ".voting-card"-styled shell,
// reused by both votings and announcement cards.
function applyCardCollapsedUi(cardElId, bodyElId, collapsed){
  const card = document.getElementById(cardElId);
  const body = document.getElementById(bodyElId);
  if (!card || !body) return;
  card.classList.toggle('open', !collapsed);
  body.classList.toggle('hidden', collapsed);
}

function applyVotingCollapsedUi(votingId, collapsed){
  applyCardCollapsedUi('votingCard-' + votingId, 'votingBody-' + votingId, collapsed);
}

function toggleVotingCard(votingId){
  const body = document.getElementById('votingBody-' + votingId);
  if (!body) return;
  const currentlyOpen = !body.classList.contains('hidden');
  votingCardManualOpen[votingId] = !currentlyOpen;
  applyVotingCollapsedUi(votingId, currentlyOpen);
}

function renderVotingChrome(votingId){
  const closed = isVotingClosed(votingId);
  const badge = document.getElementById('votingBadge-' + votingId);
  if (badge){
    badge.textContent = closed ? 'Geschlossen' : 'Offen';
    badge.classList.toggle('closed', closed);
  }
  const adminControls = document.getElementById('votingAdminControls-' + votingId);
  if (adminControls) adminControls.classList.toggle('hidden', !canManageVotings());
  const closeBtn = document.getElementById('votingCloseBtn-' + votingId);
  if (closeBtn) closeBtn.textContent = closed ? 'Abstimmung wieder öffnen' : 'Abstimmung schließen';
  const closedNote = document.getElementById('votingClosedNote-' + votingId);
  if (closedNote) closedNote.classList.toggle('hidden', !closed);
  // Only re-apply the "open unless closed" default while the viewer
  // hasn't manually expanded/collapsed the card themselves this session.
  if (votingCardManualOpen[votingId] === undefined){
    applyVotingCollapsedUi(votingId, closed);
  }
}

async function toggleVotingClosed(votingId){
  if (!canManageVotings()) return;
  if (!state.votingStatus) state.votingStatus = {};
  const wasClosed = isVotingClosed(votingId);
  const previous = state.votingStatus[votingId];
  state.votingStatus[votingId] = { closed: !wasClosed };
  const statusEl = document.getElementById('votingCloseStatus-' + votingId);
  if (statusEl){ statusEl.textContent = 'Saving…'; statusEl.className = 'armory-status'; }
  renderAll();
  const ok = await saveData('votingStatus/' + votingId);
  if (!ok){
    // Write failed (most likely: the Firebase rules haven't been updated
    // to allow votingStatus writes yet — see the README). Roll back so
    // the UI never claims the voting was closed/reopened when it wasn't.
    if (previous) state.votingStatus[votingId] = previous;
    else delete state.votingStatus[votingId];
    if (statusEl){
      statusEl.textContent = 'Konnte nicht speichern — Firebase-Regeln prüfen (siehe README)';
      statusEl.className = 'armory-status armory-status-error';
    }
    renderAll();
  } else if (statusEl){
    statusEl.textContent = '';
    statusEl.className = 'armory-status';
  }
}

// ---------------------------------------------------------------------
// Custom polls — rendering, composer, voting, and Officer moderation.
// ---------------------------------------------------------------------
function renderPollComposerOptions(){
  els.pollOptionInputs.innerHTML = pollComposerOptionDrafts.map((val, i) => `
    <div class="poll-option-input-row">
      <input type="text" data-poll-option-index="${i}" placeholder="Option ${i + 1}…" maxlength="80" value="${escapeHtml(val)}">
      ${pollComposerOptionDrafts.length > POLL_MIN_OPTIONS ? `<button type="button" class="poll-option-remove-btn" data-poll-option-remove="${i}" title="Entfernen">✕</button>` : ''}
    </div>
  `).join('');
  els.pollOptionInputs.querySelectorAll('input[data-poll-option-index]').forEach((/** @type {HTMLInputElement} */ input) => {
    input.addEventListener('input', () => {
      const idx = Number(input.getAttribute('data-poll-option-index'));
      pollComposerOptionDrafts[idx] = input.value;
    });
  });
  els.pollOptionInputs.querySelectorAll('[data-poll-option-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.getAttribute('data-poll-option-remove'));
      if (pollComposerOptionDrafts.length <= POLL_MIN_OPTIONS) return;
      pollComposerOptionDrafts.splice(idx, 1);
      renderPollComposerOptions();
    });
  });
  els.pollAddOptionBtn.classList.toggle('hidden', pollComposerOptionDrafts.length >= POLL_MAX_OPTIONS);
}

function addPollComposerOption(){
  if (pollComposerOptionDrafts.length >= POLL_MAX_OPTIONS) return;
  pollComposerOptionDrafts.push('');
  renderPollComposerOptions();
}

function resetPollComposer(){
  pollComposerOptionDrafts = ['', ''];
  els.pollTitleInput.value = '';
  els.pollDurationInput.value = '7';
  els.pollResultsVisibleInput.checked = true;
  els.pollAnonymousInput.checked = false;
  const singleRadio = /** @type {HTMLInputElement} */ (document.querySelector('input[name="pollChoiceMode"][value="single"]'));
  if (singleRadio) singleRadio.checked = true;
  renderPollComposerOptions();
}

async function publishPoll(){
  if (!discordIdentity || !isOfficerOrAdmin()) return;
  const title = els.pollTitleInput.value.trim().slice(0, 150);
  if (!title) return;
  const rawOptions = pollComposerOptionDrafts.map(v => v.trim()).filter(Boolean);
  if (rawOptions.length < POLL_MIN_OPTIONS) return;
  const options = rawOptions.slice(0, POLL_MAX_OPTIONS).map((label, i) =>
    ({ id: 'o' + i + '_' + Math.random().toString(36).slice(2, 7), label: label.slice(0, 80) }));
  const modeInput = /** @type {HTMLInputElement} */ (document.querySelector('input[name="pollChoiceMode"]:checked'));
  const multipleChoice = !!modeInput && modeInput.value === 'multiple';
  let durationDays = Number(els.pollDurationInput.value);
  if (!Number.isFinite(durationDays) || durationDays < POLL_MIN_DURATION_DAYS) durationDays = POLL_MIN_DURATION_DAYS;
  if (durationDays > POLL_MAX_DURATION_DAYS) durationDays = POLL_MAX_DURATION_DAYS;
  const resultsVisible = !!els.pollResultsVisibleInput.checked;
  const anonymous = !!els.pollAnonymousInput.checked;

  let id = null;
  try{ id = db ? db.ref(DB_PATH + '/polls').push().key : null; }catch(e){}
  if (!id) id = Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const createdAt = Date.now();
  if (!state.polls) state.polls = {};
  state.polls[id] = {
    title, options, multipleChoice, resultsVisible, anonymous, durationDays,
    createdAt, expiresAt: createdAt + durationDays * POLL_DAY_MS,
    closed: false,
    createdByName: discordIdentity.username,
    createdById: discordIdentity.id,
    votes: {}
  };
  els.pollPublishStatus.textContent = 'Saving…';
  els.pollPublishStatus.className = 'armory-status';
  renderAll();
  const ok = await saveData('polls/' + id);
  if (ok){
    resetPollComposer();
    els.pollPublishStatus.textContent = 'Veröffentlicht!';
    els.pollPublishStatus.className = 'armory-status armory-status-ok';
    setTimeout(() => { if (els.pollPublishStatus.textContent === 'Veröffentlicht!') els.pollPublishStatus.textContent = ''; }, 2000);
  } else {
    // Write failed (most likely: the Firebase rules haven't been updated
    // to allow poll writes yet — see the README). Roll back so the UI
    // never claims the poll was posted when it wasn't.
    delete state.polls[id];
    els.pollPublishStatus.textContent = 'Konnte nicht speichern — Firebase-Regeln prüfen (siehe README)';
    els.pollPublishStatus.className = 'armory-status armory-status-error';
    renderAll();
  }
}

function togglePollDraftOption(pollId, optionId, multipleChoice){
  const current = pollVoteDrafts[pollId] || [];
  let next;
  if (multipleChoice){
    next = current.includes(optionId) ? current.filter(id => id !== optionId) : current.concat(optionId);
  } else {
    next = current.includes(optionId) ? [] : [optionId];
  }
  pollVoteDrafts[pollId] = next;
  renderPollList();
}

async function savePollVote(pollId){
  if (!discordIdentity || !state.polls || !state.polls[pollId]) return;
  const poll = state.polls[pollId];
  if (pollIsClosed(poll)) return;
  const choices = pollVoteDrafts[pollId] || pollUserChoices(poll);
  if (!choices.length) return;
  const previous = poll.votes[discordIdentity.id];
  poll.votes[discordIdentity.id] = { username: discordIdentity.username, choices: choices.slice() };
  let statusEl = document.getElementById('pollVoteStatus-' + pollId);
  if (statusEl){ statusEl.textContent = 'Saving…'; statusEl.className = 'armory-status'; }
  renderPollList();
  refreshQuestUI();
  const ok = await saveData('polls/' + pollId + '/votes/' + discordIdentity.id);
  if (!ok){
    if (previous) poll.votes[discordIdentity.id] = previous;
    else delete poll.votes[discordIdentity.id];
    renderPollList();
    refreshQuestUI();
    statusEl = document.getElementById('pollVoteStatus-' + pollId);
    if (statusEl){
      statusEl.textContent = 'Konnte nicht speichern — Firebase-Regeln prüfen (siehe README)';
      statusEl.className = 'armory-status armory-status-error';
    }
  }
}

async function togglePollClosed(pollId){
  if (!isOfficerOrAdmin() || !state.polls || !state.polls[pollId]) return;
  const poll = state.polls[pollId];
  const previous = poll.closed;
  poll.closed = !previous;
  renderPollList();
  const ok = await saveData('polls/' + pollId + '/closed');
  if (!ok){
    poll.closed = previous;
    renderPollList();
  }
}

async function deletePoll(pollId){
  if (!isOfficerOrAdmin() || !state.polls || !state.polls[pollId]) return;
  const previous = state.polls[pollId];
  delete state.polls[pollId];
  delete pollVoteDrafts[pollId];
  renderPollList();
  const ok = await saveData('polls/' + pollId);
  if (!ok){
    state.polls[pollId] = previous;
    renderPollList();
  }
}

function togglePollCard(id){
  const body = document.getElementById('pollBody-' + id);
  if (!body) return;
  const currentlyOpen = !body.classList.contains('hidden');
  pollCardManualOpen[id] = !currentlyOpen;
  applyCardCollapsedUi('pollCard-' + id, 'pollBody-' + id, currentlyOpen);
}

function renderPollList(){
  if (!els.pollComposer) return;
  els.pollComposer.classList.toggle('hidden', !isOfficerOrAdmin());

  const polls = sortedPolls();
  if (!polls.length){
    els.pollList.innerHTML = `<div class="lootlib-note">Noch keine Abstimmungen.</div>`;
    return;
  }

  const canManage = isOfficerOrAdmin();
  els.pollList.innerHTML = polls.map(poll => {
    const closed = pollIsClosed(poll);
    const canSeeResults = pollCanSeeResults(poll);
    const results = canSeeResults ? pollResults(poll) : null;
    const maxCount = results ? Math.max(1, ...Object.values(results.counts)) : 1;
    const userChoices = pollVoteDrafts[poll.id] !== undefined ? pollVoteDrafts[poll.id] : pollUserChoices(poll);
    const hasVoted = pollUserChoices(poll).length > 0;

    const adminControlsHtml = canManage
      ? `<div class="voting-admin-controls">
          <span class="lootlib-note">Nur für Admins/Offiziere sichtbar.</span>
          <div class="voting-admin-controls-actions">
            <span id="pollAdminStatus-${poll.id}" class="armory-status"></span>
            <button type="button" class="btn btn-sm btn-outline-gold" data-poll-toggle-closed="${poll.id}">${poll.closed ? 'Wieder öffnen' : 'Abstimmung schließen'}</button>
            <button type="button" class="btn btn-sm btn-outline-gold" data-poll-delete="${poll.id}">Löschen</button>
          </div>
        </div>`
      : '';

    const closedNoteHtml = closed
      ? `<div class="voting-closed-note">Diese Abstimmung ist beendet — es kann nicht mehr abgestimmt werden.</div>`
      : '';

    const optionsHtml = poll.options.map(opt => {
      const selected = userChoices.includes(opt.id);
      const inputType = poll.multipleChoice ? 'checkbox' : 'radio';
      const inputName = poll.multipleChoice ? '' : `name="pollChoice-${poll.id}"`;
      const disabled = (closed || !discordIdentity) ? 'disabled' : '';
      const controlHtml = `<input type="${inputType}" ${inputName} class="poll-option-control" data-poll-option="${poll.id}|${opt.id}" ${selected ? 'checked' : ''} ${disabled}>`;

      let barHtml = '';
      if (canSeeResults){
        const count = results.counts[opt.id] || 0;
        const pct = (count / maxCount) * 100;
        const names = results.namesByOption[opt.id];
        const title = poll.anonymous ? `${count} Stimme(n)` : `${count} Stimme(n)${names.length ? ':\n' + names.join('\n') : ''}`;
        // The title= gives a hover tooltip on desktop; data-vote-details-*
        // (wired below) makes the same bar tappable on mobile, where
        // hover doesn't exist, opening a modal with the same info.
        barHtml = `<div class="poll-option-bar-wrap" data-vote-details-poll="${poll.id}" data-vote-details-option="${opt.id}" role="button" tabindex="0">
          <div class="poll-option-bar-track"><div class="poll-option-bar-fill" style="width:${pct}%" title="${escapeHtml(title)}"></div></div>
          <span class="poll-option-count">${count} Stimme${count === 1 ? '' : 'n'}</span>
        </div>`;
      }

      return `<div class="poll-option-row">
        <label>${controlHtml}</label>
        <span class="poll-option-label">${escapeHtml(opt.label)}</span>
        ${barHtml}
      </div>`;
    }).join('');

    const resultsNoteHtml = !canSeeResults
      ? `<div class="poll-hidden-results-note">Die Ergebnisse werden erst sichtbar, sobald die Abstimmung beendet ist.</div>`
      : '';
    const voterCountLine = canSeeResults
      ? `<div class="poll-voters-note">${results.voterCount} Mitglied${results.voterCount === 1 ? '' : 'er'} ${results.voterCount === 1 ? 'hat' : 'haben'} bisher abgestimmt.</div>`
      : '';

    const metaBits = [
      'von ' + escapeHtml(poll.createdByName),
      poll.multipleChoice ? 'Mehrfachauswahl' : 'Einfachauswahl',
      pollDaysLeftLabel(poll)
    ];

    return `<div class="voting-card" id="pollCard-${poll.id}" data-poll-id="${poll.id}">
      <button type="button" class="voting-card-header" data-poll-toggle="${poll.id}">
        <span class="voting-card-chevron">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7"/></svg>
        </span>
        <span class="voting-card-title announce-card-title">${escapeHtml(poll.title)}</span>
        <span class="voting-status-badge ${closed ? 'closed' : ''}">${closed ? 'Geschlossen' : 'Offen'}</span>
      </button>
      <div class="voting-card-body" id="pollBody-${poll.id}">
        ${adminControlsHtml}
        ${closedNoteHtml}
        <div class="poll-card-meta-line">${metaBits.join(' · ')}</div>
        <div class="poll-options-list">${optionsHtml}</div>
        ${resultsNoteHtml}
        ${voterCountLine}
        <div class="forever-actions">
          <button type="button" class="btn btn-teal btn-sm" data-poll-submit="${poll.id}" ${(closed || !discordIdentity) ? 'disabled' : ''}>${hasVoted ? 'Auswahl aktualisieren' : 'Abstimmen'}</button>
          <span id="pollVoteStatus-${poll.id}" class="armory-status"></span>
        </div>
      </div>
    </div>`;
  }).join('');

  // Default: only the newest poll starts expanded, same convention as
  // announcements/votings — the viewer's own manual toggle always wins.
  polls.forEach((poll, idx) => {
    if (pollCardManualOpen[poll.id] === undefined){
      applyCardCollapsedUi('pollCard-' + poll.id, 'pollBody-' + poll.id, idx !== 0);
    }
  });

  els.pollList.querySelectorAll('[data-poll-toggle]').forEach(btn => {
    btn.addEventListener('click', () => togglePollCard(btn.getAttribute('data-poll-toggle')));
  });
  els.pollList.querySelectorAll('[data-poll-option]').forEach(input => {
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('change', () => {
      const [pollId, optionId] = input.getAttribute('data-poll-option').split('|');
      const poll = state.polls[pollId];
      togglePollDraftOption(pollId, optionId, poll ? poll.multipleChoice : false);
    });
  });
  els.pollList.querySelectorAll('[data-poll-submit]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      savePollVote(btn.getAttribute('data-poll-submit'));
    });
  });
  els.pollList.querySelectorAll('[data-poll-toggle-closed]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePollClosed(btn.getAttribute('data-poll-toggle-closed'));
    });
  });
  els.pollList.querySelectorAll('[data-poll-delete]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deletePoll(btn.getAttribute('data-poll-delete'));
    });
  });
  els.pollList.querySelectorAll('[data-vote-details-poll]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const pollId = el.getAttribute('data-vote-details-poll');
      const optionId = el.getAttribute('data-vote-details-option');
      const poll = state.polls && state.polls[pollId];
      if (!poll) return;
      const opt = (poll.options || []).find(o => o.id === optionId);
      if (!opt) return;
      const results = pollResults(poll);
      showVoteDetailsModal(opt.label, results.namesByOption[optionId], { anonymous: poll.anonymous, count: results.counts[optionId] || 0 });
    });
  });
}

function renderForeverView(){
  const loggedIn = !!discordIdentity;
  const hasAccess = loggedIn && isMemberOrHigher();
  els.foreverLoggedOut.classList.toggle('hidden', loggedIn);
  els.foreverNoAccess.classList.toggle('hidden', !loggedIn || hasAccess);
  els.foreverLoggedIn.classList.toggle('hidden', !hasAccess);
  if (!hasAccess) return;
  renderVotingChrome('forever');
  const closed = isVotingClosed('forever');
  els.foreverClassPicker.classList.toggle('voting-disabled', closed);
  els.foreverMyPicks.classList.toggle('voting-disabled', closed);
  els.foreverSaveBtn.disabled = closed;
  els.foreverSaveBtn.title = closed ? 'Diese Abstimmung ist geschlossen' : '';
  if (foreverDraft === null){
    const saved = foreverSavedEntry();
    foreverDraft = saved ? saved.picks.map(p => ({ classId: p.classId, spec: p.spec })) : [];
    foreverFirstPickIndex = 0;
    if (saved && saved.firstPick){
      const idx = foreverDraft.findIndex(p => p.classId === saved.firstPick.classId && p.spec === saved.firstPick.spec);
      if (idx >= 0) foreverFirstPickIndex = idx;
    }
  }
  renderForeverPicksChips();
  renderForeverClassPicker();
  renderForeverOverview();
  renderForeverOfficerTable();
}

// Visible to any guild member (Member/Officer/Admin) — a flat per-member
// table (not just the aggregate bars above) so everyone can see exactly
// who picked what, and which of a member's picks they intend to level to
// max first. Nothing sensitive here (it's the same info as the bars,
// just broken out by name), so this doesn't need officer-only gating —
// it just rides on the same member-or-higher gate as the rest of this
// view (renderForeverView already hides the whole page from Community).
function renderForeverOfficerTable(){
  const canSee = isMemberOrHigher();
  els.foreverOfficerTableCard.classList.toggle('hidden', !canSee);
  if (!canSee) return;
  // Object.entries (not .values) — the uid is needed to look up a
  // saved nickname from characterProfiles for the "Nickname (Discord)"
  // display.
  const entries = Object.entries(state.foreverSurvey || {})
    .filter(([, e]) => e && Array.isArray(e.picks) && e.picks.length)
    .map(([uid, e]) => ({ uid, ...e }));
  if (!entries.length){
    els.foreverOfficerTable.innerHTML = '<tr><td class="lootlib-note">Noch keine Stimmen.</td></tr>';
    return;
  }
  const memberLabel = (e) => memberDisplayLabel(e.uid, e.username);
  // Carries classId/colors alongside the label now (not just a plain
  // string) so the cell can render the class-color dot and spec/class
  // icons, and so the grouping logic below can tell "same class as the
  // row above" apart from "same label text" without re-parsing the
  // string.
  const pickInfo = (p) => {
    if (!p) return null;
    const cls = CLASS_MAP[p.classId];
    return {
      classId: p.classId,
      label: `${cls ? cls.label : p.classId} (${foreverSpecLabel(p.classId, p.spec)})`,
      classColor: cls ? cls.color : '#888',
      iconUrl: foreverSpecIconUrl(p.classId, p.spec),
      classIconUrl: foreverClassIconUrl(p.classId)
    };
  };
  // Precompute each row's three sortable columns once, up front — the
  // First/Second Char columns sort by the same text shown in the cell
  // (class + spec), so "sort by First Char" groups identical picks
  // together the same way "sort by Mitglied" groups identical members.
  const rows = entries.map(e => {
    // "First Char" / "Second Char" are picked out by ARRAY POSITION, not
    // by content — two picks can now be content-identical (e.g. two
    // Frost Mage characters), so comparing classId+spec can no longer
    // tell them apart. Find which index the stored firstPick matches
    // (first occurrence wins for a content tie, which is harmless since
    // they're identical anyway) and treat the *other* index as second.
    let firstIdx = 0;
    if (e.firstPick){
      const idx = e.picks.findIndex(p => p.classId === e.firstPick.classId && p.spec === e.firstPick.spec);
      if (idx >= 0) firstIdx = idx;
    }
    const first = e.picks[firstIdx] || e.picks[0];
    const secondIdx = firstIdx === 0 ? 1 : 0;
    const second = e.picks.length > 1 ? (e.picks[secondIdx] || null) : null;
    return { member: memberLabel(e), first: pickInfo(first), second: pickInfo(second) };
  });
  const sortKeyFn = {
    member: r => r.member,
    first: r => r.first ? r.first.label : '',
    second: r => r.second ? r.second.label : ''
  }[foreverOfficerSortK] || (r => r.member);
  rows.sort((a, b) => {
    const d = sortKeyFn(a).localeCompare(sortKeyFn(b), 'de', { sensitivity: 'base' });
    return (d * foreverOfficerSortDir) || a.member.localeCompare(b.member, 'de', { sensitivity: 'base' });
  });
  const pickCellHtml = (info) => info
    ? `<span class="forever-pick-cell">${info.classIconUrl ? `<img class="forever-pick-icon wow-icon-frame" src="${info.classIconUrl}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}${info.iconUrl ? `<img class="forever-pick-icon wow-icon-frame" src="${info.iconUrl}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}<span style="color:${info.classColor}">${escapeHtml(info.label)}</span></span>`
    : '—';
  // Grouping only makes sense when the table is actually sorted by one
  // of the two class columns — sorting by Mitglied interleaves classes
  // in alphabetical-by-name order, so a "class changed" border there
  // would land in effectively random places rather than meaning
  // anything.
  const groupBy = (foreverOfficerSortK === 'first' || foreverOfficerSortK === 'second') ? foreverOfficerSortK : null;
  let prevGroupKey = null;
  const rowsHtml = rows.map(r => {
    let groupStart = false;
    if (groupBy){
      const pick = r[groupBy];
      const groupKey = pick ? pick.classId : '\u0000none';
      groupStart = prevGroupKey !== null && groupKey !== prevGroupKey;
      prevGroupKey = groupKey;
    }
    return `<tr${groupStart ? ' class="forever-officer-group-start"' : ''}>
      <td>${escapeHtml(r.member)}</td>
      <td>${pickCellHtml(r.first)}</td>
      <td>${pickCellHtml(r.second)}</td>
    </tr>`;
  }).join('');
  const sortAttr = (k) => k === foreverOfficerSortK ? (foreverOfficerSortDir > 0 ? 'ascending' : 'descending') : 'none';
  els.foreverOfficerTable.innerHTML = `<thead><tr>
      <th data-k="member" aria-sort="${sortAttr('member')}">Mitglied</th>
      <th data-k="first" aria-sort="${sortAttr('first')}">First Char</th>
      <th data-k="second" aria-sort="${sortAttr('second')}">Second Char</th>
    </tr></thead><tbody>${rowsHtml}</tbody>`;
  els.foreverOfficerTable.querySelector('thead').addEventListener('click', e => {
    const th = /** @type {HTMLElement} */ (/** @type {HTMLElement} */ (e.target).closest('th[data-k]')); if (!th) return;
    const k = th.dataset.k;
    if (k === foreverOfficerSortK) foreverOfficerSortDir *= -1;
    else { foreverOfficerSortK = k; foreverOfficerSortDir = 1; }
    renderForeverOfficerTable();
  });
}

// Keeps foreverFirstPickIndex pointing at a real entry in foreverDraft
// after any add/remove — called after every mutation instead of trying
// to track it precisely inline everywhere.
function foreverClampFirstPickIndex(){
  if (!foreverDraft.length){ foreverFirstPickIndex = 0; return; }
  if (foreverFirstPickIndex < 0 || foreverFirstPickIndex >= foreverDraft.length) foreverFirstPickIndex = 0;
}

function renderForeverPicksChips(){
  if (!foreverDraft.length){
    els.foreverMyPicks.innerHTML = `<div class="lootlib-note">Noch keine Klasse gewählt — wähle unten bis zu ${FOREVER_MAX_PICKS}.</div>`;
    return;
  }
  foreverClampFirstPickIndex();
  // "First Char" only needs an explicit choice once there's more than one
  // pick — with a single pick, it's unambiguously the first one, shown
  // as a quiet ★ badge instead of a redundant radio control.
  const showFirstPicker = foreverDraft.length > 1;
  const hintHtml = showFirstPicker ? `<div class="forever-firstpick-hint">Welchen Charakter bringst du zuerst auf Max-Level?</div>` : '';
  // When the same class appears twice (two characters of that class),
  // label the chips "Charakter 1"/"Charakter 2" so two content-identical
  // picks (e.g. two Frost Mages) still read as clearly distinct entries.
  const classCounts = {};
  foreverDraft.forEach(p => { classCounts[p.classId] = (classCounts[p.classId] || 0) + 1; });
  const classSeen = {};
  els.foreverMyPicks.innerHTML = hintHtml + foreverDraft.map((p, i) => {
    const cls = CLASS_MAP[p.classId];
    const specLabel = foreverSpecLabel(p.classId, p.spec);
    const isFirst = i === foreverFirstPickIndex;
    classSeen[p.classId] = (classSeen[p.classId] || 0) + 1;
    const charSuffix = classCounts[p.classId] > 1 ? ` <span class="forever-pick-charnum">(Charakter ${classSeen[p.classId]})</span>` : '';
    const firstMarkupHtml = showFirstPicker
      ? `<label class="forever-firstpick-label" title="Als First Char markieren">
           <input type="radio" name="foreverFirstPick" data-first-pick-index="${i}" ${isFirst ? 'checked' : ''}> First Char
         </label>`
      : `<span class="forever-firstpick-badge" title="First Char">★ First Char</span>`;
    return `<span class="forever-pick-chip ${isFirst ? 'forever-pick-chip-first' : ''}" style="border-color:${cls.color}">
      <span class="forever-class-dot" style="background:${cls.color}"></span>
      ${escapeHtml(cls.label)} — ${escapeHtml(specLabel)}${charSuffix}
      ${firstMarkupHtml}
      <button type="button" data-remove-index="${i}" title="Remove">✕</button>
    </span>`;
  }).join('');
  els.foreverMyPicks.querySelectorAll('[data-remove-index]').forEach(btn => {
    btn.addEventListener('click', () => {
      foreverRemovePick(Number(btn.getAttribute('data-remove-index')));
    });
  });
  els.foreverMyPicks.querySelectorAll('[data-first-pick-index]').forEach(radio => {
    radio.addEventListener('change', () => {
      if (isVotingClosed('forever')) { renderForeverPicksChips(); return; }
      foreverFirstPickIndex = Number(radio.getAttribute('data-first-pick-index'));
      renderForeverPicksChips();
    });
  });
}

// Each class card holds up to one row per CHARACTER of that class the
// member is voting for (at most FOREVER_MAX_PICKS total, across all
// classes combined) — not one row per spec. The two characters' specs
// are fully independent: both can even be the same spec (e.g. two Frost
// Mage characters). Clicking the card body adds a first character for
// that class; once a class already has a character, use the explicit
// "+ weiterer …-Charakter" button to add a second one.
function renderForeverClassPicker(){
  const atCap = foreverDraft.length >= FOREVER_MAX_PICKS;
  els.foreverClassPicker.innerHTML = CLASSES.map(cls => {
    const validSpecs = foreverSpecsForClass(cls.id);
    const classPicks = [];
    foreverDraft.forEach((p, i) => { if (p.classId === cls.id) classPicks.push({ ...p, i }); });
    const picked = classPicks.length > 0;
    const canAddMore = !atCap && classPicks.length < FOREVER_MAX_PICKS;
    const disabled = !picked && (atCap || !validSpecs.length);
    const showCharLabel = classPicks.length > 1;

    const rowsHtml = picked
      ? classPicks.map((p, rowI) => {
          const options = validSpecs.map(s =>
            `<option value="${s.id}" ${p.spec === s.id ? 'selected' : ''}>${escapeHtml(s.label)}</option>`
          ).join('');
          const labelHtml = showCharLabel ? `<span class="forever-role-charlabel">Charakter ${rowI + 1}</span>` : '';
          return `<div class="forever-role-row">
            ${labelHtml}
            <div class="forever-role-controls">
              <select data-spec-for="${cls.id}" data-pick-index="${p.i}">${options}</select>
              <button type="button" class="forever-role-remove" data-remove-index="${p.i}" title="Entfernen">✕</button>
            </div>
          </div>`;
        }).join('')
      : `<div class="lootlib-note" style="margin:0;">${validSpecs.map(s => s.label).join(' / ')}</div>`;

    // Once a class already has a character, the row (select + ✕) fills
    // almost the whole card, so "click the card again" is unreliable —
    // most clicks land on the select instead of empty card space. Use an
    // explicit, unambiguous button for adding a second character instead.
    const addBtnHtml = (picked && canAddMore)
      ? `<button type="button" class="forever-add-role-btn" data-add-role="${cls.id}">+ weiterer ${escapeHtml(cls.label)}-Charakter</button>`
      : '';

    return `<div class="forever-class-card ${picked ? 'picked' : ''} ${disabled ? 'disabled' : ''}" data-class-card="${cls.id}">
      <div class="forever-class-name"><span class="forever-class-dot" style="background:${cls.color}"></span>${escapeHtml(cls.label)}</div>
      <div class="forever-role-rows">${rowsHtml}</div>
      ${addBtnHtml}
    </div>`;
  }).join('');
  els.foreverClassPicker.querySelectorAll('[data-class-card]').forEach(card => {
    const classId = card.getAttribute('data-class-card');
    function addPick(){
      if (isVotingClosed('forever')) return;
      const allSpecs = foreverSpecsForClass(classId).map(s => s.id);
      if (foreverDraft.length >= FOREVER_MAX_PICKS || !allSpecs.length) return;
      // New character defaults to the class's first spec — the member
      // can freely change it to anything, including the same spec as
      // this class's other character, if there's already one.
      foreverDraft.push({ classId, spec: allSpecs[0] });
      foreverClampFirstPickIndex();
      renderForeverPicksChips();
      renderForeverClassPicker();
    }
    card.addEventListener('click', (e) => {
      const target = /** @type {Element} */ (e.target);
      if (target.closest('select') || target.closest('[data-remove-index]') || target.closest('[data-add-role]')) return;
      // Whole-card click only adds the FIRST pick for this class — once
      // it already has a pick, use the explicit "+ weitere Spezialisierung" button
      // below (see comment above) so clicks land reliably.
      if (foreverDraft.some(p => p.classId === classId)) return;
      addPick();
    });
    card.querySelectorAll('[data-add-role]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        addPick();
      });
    });
    card.querySelectorAll('select[data-spec-for]').forEach((/** @type {HTMLSelectElement} */ select) => {
      select.addEventListener('click', e => e.stopPropagation());
      select.addEventListener('change', () => {
        if (isVotingClosed('forever')) { renderForeverClassPicker(); return; }
        const idx = Number(select.getAttribute('data-pick-index'));
        const entry = foreverDraft[idx];
        if (entry) entry.spec = select.value;
        renderForeverPicksChips();
        renderForeverClassPicker();
      });
    });
    card.querySelectorAll('[data-remove-index]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        foreverRemovePick(Number(btn.getAttribute('data-remove-index')));
      });
    });
  });
}

function foreverRemovePick(index){
  if (isVotingClosed('forever')) return;
  foreverDraft = foreverDraft.filter((p, i) => i !== index);
  if (index === foreverFirstPickIndex) foreverFirstPickIndex = 0;
  else if (index < foreverFirstPickIndex) foreverFirstPickIndex -= 1;
  foreverClampFirstPickIndex();
  renderForeverPicksChips();
  renderForeverClassPicker();
}

async function saveForeverPicks(){
  if (!discordIdentity || isVotingClosed('forever')) return;
  foreverClampFirstPickIndex();
  const previous = state.foreverSurvey[discordIdentity.id];
  const firstPickEntry = foreverDraft[foreverFirstPickIndex];
  state.foreverSurvey[discordIdentity.id] = {
    username: discordIdentity.username,
    picks: foreverDraft.map(p => ({ classId: p.classId, spec: p.spec })),
    firstPick: firstPickEntry ? { classId: firstPickEntry.classId, spec: firstPickEntry.spec } : null
  };
  els.foreverSaveStatus.textContent = 'Saving…';
  els.foreverSaveStatus.className = 'armory-status';
  const ok = await saveData('foreverSurvey/' + discordIdentity.id);
  if (ok){
    els.foreverSaveStatus.textContent = 'Gespeichert!';
    els.foreverSaveStatus.className = 'armory-status armory-status-ok';
    setTimeout(() => { if (els.foreverSaveStatus.textContent === 'Gespeichert!') els.foreverSaveStatus.textContent = ''; }, 2000);
  } else {
    // Write failed (most likely: the Firebase rules haven't been updated
    // to allow writes to foreverSurvey yet — see the README). Roll the
    // local optimistic update back so the UI never claims a vote was
    // saved when it actually wasn't.
    if (previous) state.foreverSurvey[discordIdentity.id] = previous;
    else delete state.foreverSurvey[discordIdentity.id];
    els.foreverSaveStatus.textContent = 'Konnte nicht speichern — Firebase-Regeln prüfen (siehe README)';
    els.foreverSaveStatus.className = 'armory-status armory-status-error';
  }
  renderForeverOverview();
  renderForeverOfficerTable();
  refreshQuestUI();
}

function foreverAggregate(){
  // classId -> { total, specs: { <specId>: count }, namesBySpec: { <specId>: [...] } }
  const agg = {};
  CLASSES.forEach(c => {
    const specs = {}, namesBySpec = {};
    foreverSpecsForClass(c.id).forEach(s => { specs[s.id] = 0; namesBySpec[s.id] = []; });
    agg[c.id] = { total: 0, specs, namesBySpec };
  });
  let voterCount = 0;
  Object.entries(state.foreverSurvey).forEach(([uid, entry]) => {
    if (!entry || !Array.isArray(entry.picks) || !entry.picks.length) return;
    voterCount++;
    const name = memberDisplayLabel(uid, entry.username);
    entry.picks.forEach(p => {
      if (!agg[p.classId]) return;
      agg[p.classId].total++;
      if (agg[p.classId].specs[p.spec] !== undefined){
        agg[p.classId].specs[p.spec]++;
        agg[p.classId].namesBySpec[p.spec].push(name);
      }
    });
  });
  return { agg, voterCount };
}

function renderForeverOverview(){
  const { agg, voterCount } = foreverAggregate();
  // Bars/legend are colored by role (Tank/Healer/Damage), not by class or
  // spec slot, so gaps in a role are visible across the whole roster at a
  // glance.
  const legendHtml = `<div class="forever-ov-legend">
    ${['tank', 'healer', 'damage'].map(role => `<span class="forever-ov-legend-item"><span class="forever-ov-legend-dot" style="background:${FOREVER_ROLE_COLORS[role]}"></span>${FOREVER_ROLE_LABELS[role]}</span>`).join('')}
  </div>`;
  if (!voterCount){
    els.foreverOverview.innerHTML = legendHtml + `<div class="lootlib-note">Noch keine Stimmen.</div>`;
    return;
  }
  // One global max (the single largest spec count anywhere, across every
  // class) rather than a per-class max — that's what makes bar heights
  // comparable at a glance across the whole chart, not just within one
  // class's own column.
  const maxSpecCount = Math.max(1, ...CLASSES.flatMap(cls => foreverSpecsForClass(cls.id).map(s => agg[cls.id].specs[s.id] || 0)));
  // A grouped vertical-bar chart — one column per class, one bar per
  // spec within it, height scaled against maxSpecCount and colored by
  // role. Raw counts print above each bar, and each bar's own talent-
  // tree icon prints directly below it (see .forever-ov-spec-icons'
  // comment for why that's a separate row rather than nested in the
  // bar) — that's what tells same-role specs apart at a glance (e.g. a
  // class with two Damage specs: same bar color, different icon). Both
  // the bar and its icon are click targets for showVoteDetailsModal
  // (who picked it), same as before.
  const chartHtml = CLASSES.map(cls => {
    const data = agg[cls.id];
    const specs = foreverSpecsForClass(cls.id);
    const barsHtml = specs.map((s) => {
      const count = data.specs[s.id] || 0;
      const heightPct = Math.max(count > 0 ? 4 : 1.5, (count / maxSpecCount) * 100);
      return `<div class="forever-ov-bar-col" data-vote-details-class="${cls.id}" data-vote-details-spec="${s.id}" role="button" tabindex="0" title="${escapeHtml(s.label)}: ${count}">
        <span class="forever-ov-bar-count">${count}</span>
        <div class="forever-ov-bar" style="height:${heightPct}%;background:${FOREVER_ROLE_COLORS[s.role]}"></div>
      </div>`;
    }).join('');
    const iconsHtml = specs.map((s) => {
      const iconUrl = foreverSpecIconUrl(cls.id, s.id);
      return `<div class="forever-ov-spec-icon-wrap" data-vote-details-class="${cls.id}" data-vote-details-spec="${s.id}" role="button" tabindex="0" title="${escapeHtml(s.label)}">
        ${iconUrl ? `<img class="forever-ov-spec-icon wow-icon-frame" src="${iconUrl}" alt="${escapeHtml(s.label)}" loading="lazy" onerror="this.style.visibility='hidden'">` : ''}
      </div>`;
    }).join('');
    const classIconUrl = foreverClassIconUrl(cls.id);
    return `<div class="forever-ov-class-col">
      <div class="forever-ov-bars">${barsHtml}</div>
      <div class="forever-ov-spec-icons">${iconsHtml}</div>
      <div class="forever-ov-baseline"></div>
      <div class="forever-ov-class-foot">
        ${classIconUrl ? `<img class="forever-ov-class-icon wow-icon-frame" src="${classIconUrl}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
        <span style="color:${cls.color}">${escapeHtml(cls.label)}</span>
      </div>
      <div class="forever-ov-class-total">${data.total} gesamt</div>
    </div>`;
  }).join('');
  els.foreverOverview.innerHTML = legendHtml +
    `<div class="lootlib-note" style="margin-bottom:8px;">${voterCount} Mitglied${voterCount === 1 ? '' : 'er'} haben bisher abgestimmt.</div>` +
    `<div class="forever-ov-chart-wrap"><div class="forever-ov-chart">${chartHtml}</div></div>`;
  els.foreverOverview.querySelectorAll('[data-vote-details-class]').forEach(el => {
    el.addEventListener('click', () => {
      const clsId = el.getAttribute('data-vote-details-class');
      const specId = el.getAttribute('data-vote-details-spec');
      const cls = CLASS_MAP[clsId];
      const spec = foreverSpecsForClass(clsId).find(s => s.id === specId);
      if (!cls || !spec) return;
      const names = (agg[clsId] && agg[clsId].namesBySpec[specId]) || [];
      showVoteDetailsModal(`${cls.label} — ${spec.label}`, names);
    });
  });
}

els.foreverSaveBtn.addEventListener('click', saveForeverPicks);
document.getElementById('votingToggle-forever').addEventListener('click', () => toggleVotingCard('forever'));
document.getElementById('votingCloseBtn-forever').addEventListener('click', () => toggleVotingClosed('forever'));
els.pollAddOptionBtn.addEventListener('click', addPollComposerOption);
els.pollPublishBtn.addEventListener('click', publishPoll);
renderPollComposerOptions();
