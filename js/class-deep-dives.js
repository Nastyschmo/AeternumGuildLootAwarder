// Class Deep Dives page, including the spell/talent auto-link tooltips in
// Deep Dive texts.
//
// Classic (non-module) script — shares the global scope with the other
// js/*.js files; load order is set in index.html. Code that runs at load
// time may only use files loaded before this one.

// Builds a readable tooltip for a talent-tree talent, independent of
// anyone's actual allocated points (unlike the live Talent Builder's own
// tooltip) — a Deep Dive mention isn't about "my current build", so this
// always shows the talent's full/final-rank description.
function classDiveTalentTooltipHtml(talent){
  let html = `<div class="talent-tip-title">${escapeHtml(talent.name)}</div>`;
  html += `<div class="talent-tip-rank">${talent.max > 1 ? `Talent — bis zu ${talent.max} Ränge` : 'Talent'}</div>`;
  const desc = Array.isArray(talent.desc) ? talent.desc[talent.desc.length - 1] : talent.desc;
  if (desc) html += `<div class="talent-tip-desc">${escapeHtml(desc)}</div>`;
  if (talent.cost) html += `<div class="talent-tip-cost">${escapeHtml(talent.cost)}</div>`;
  if (talent.req) html += `<div class="talent-tip-req ok">Benötigt: ${escapeHtml(talent.req)} (max)</div>`;
  return html;
}
function classDiveRacialTooltipHtml(name, desc, race){
  let html = `<div class="talent-tip-title">${escapeHtml(name)}</div>`;
  html += `<div class="talent-tip-rank">Volks-Fähigkeit${race ? ' — ' + escapeHtml(race) : ''}</div>`;
  if (desc) html += `<div class="talent-tip-desc">${escapeHtml(desc)}</div>`;
  return html;
}
const classDiveSpellIndexCache = {};
// index: array of { name, kind, cls, ... } sorted longest-name-first so
// the matcher greedily prefers "Shadow Word: Death" over a shorter
// prefix. Pulls from three sources, since a Blizzard class deep dive
// talks about all three: the base spellbook ("tabs" sections only —
// general abilities like "Attack"/"Block" are deliberately excluded,
// too generic a word to safely autolink in free-form prose), the talent
// trees, and that class's available racial abilities.
function classDiveSpellIndexFor(classId){
  if (classDiveSpellIndexCache[classId]) return classDiveSpellIndexCache[classId];
  let entries = [];
  if (classId === 'general'){
    // The general card has no single class — merge every class's index.
    // On a name collision between classes, the first class (CLASSES
    // order) wins; ambiguous, but still useful.
    const seen = new Set();
    CLASSES.forEach(c => {
      classDiveSpellIndexFor(c.id).forEach(e => {
        if (seen.has(e.name)) return;
        seen.add(e.name);
        entries.push(e);
      });
    });
  } else {
    const clsInfo = CLASS_MAP[classId];
    const label = clsInfo && clsInfo.label;
    if (label){
      const seen = new Set();
      const book = SPELLBOOK_DATA[label];
      if (book){
        const allSpells = [];
        (book.tabs || []).forEach(sec => (sec.spells || []).forEach(s => allSpells.push(s)));
        groupSpellRanks(allSpells).forEach(g => {
          if (seen.has(g.name)) return;
          seen.add(g.name);
          entries.push({ name: g.name, kind: 'spell', cls: label, ranks: g.ranks });
        });
      }
      const talentBook = TALENT_DATA[label];
      if (talentBook){
        (talentBook.trees || []).forEach(tree => (tree.talents || []).forEach(t => {
          if (!t || !t.name || seen.has(t.name)) return;
          seen.add(t.name);
          entries.push({ name: t.name, kind: 'talent', cls: label, talent: t });
        }));
      }
      ['Horde', 'Alliance'].forEach(faction => {
        (RACIAL_DATA[faction] || []).forEach(race => {
          if (!race.classes || !race.classes.includes(label)) return;
          (race.abilities || []).forEach(([name, desc]) => {
            if (!name || seen.has(name)) return;
            seen.add(name);
            entries.push({ name, kind: 'racial', cls: label, desc, race: race.race });
          });
        });
      });
    }
  }
  entries.sort((a, b) => b.name.length - a.name.length);
  classDiveSpellIndexCache[classId] = entries;
  return entries;
}
function classDiveMentionTooltipHtml(entry){
  if (entry.kind === 'talent') return classDiveTalentTooltipHtml(entry.talent);
  if (entry.kind === 'racial') return classDiveRacialTooltipHtml(entry.name, entry.desc, entry.race);
  return spellTooltipHtml(entry.cls, entry.name, entry.ranks);
}
const CLASSDIVE_WORDISH_RE = /[A-Za-zÀ-ÖØ-öø-ÿ0-9']/;
function annotateSpellMentions(rootEl, classId){
  if (!rootEl) return;
  const index = classDiveSpellIndexFor(classId);
  if (!index.length) return;
  const byName = new Map(index.map(e => [e.name, e]));
  const pattern = index.map(e => escapeRegExp(e.name)).join('|');
  if (!pattern) return;
  const regex = new RegExp(pattern, 'g');
  const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, null);
  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) textNodes.push(node);
  textNodes.forEach(textNode => {
    const text = textNode.nodeValue;
    regex.lastIndex = 0;
    let match;
    let lastEnd = 0;
    const frag = document.createDocumentFragment();
    let any = false;
    while ((match = regex.exec(text))){
      const start = match.index, end = start + match[0].length;
      const before = text[start - 1], after = text[end];
      if ((before && CLASSDIVE_WORDISH_RE.test(before)) || (after && CLASSDIVE_WORDISH_RE.test(after))){
        regex.lastIndex = start + 1;
        continue;
      }
      any = true;
      if (start > lastEnd) frag.appendChild(document.createTextNode(text.slice(lastEnd, start)));
      const entry = byName.get(match[0]);
      const span = document.createElement('span');
      span.className = 'classdive-spell-link';
      span.setAttribute('data-spell-name', entry.name);
      span.textContent = match[0];
      frag.appendChild(span);
      lastEnd = end;
    }
    if (!any) return;
    if (lastEnd < text.length) frag.appendChild(document.createTextNode(text.slice(lastEnd)));
    textNode.parentNode.replaceChild(frag, textNode);
  });
  rootEl.querySelectorAll('.classdive-spell-link').forEach(span => {
    span.addEventListener('mouseenter', (evt) => {
      if (!els.talentTooltip) return;
      const entry = byName.get(span.getAttribute('data-spell-name'));
      if (!entry) return;
      els.talentTooltip.innerHTML = classDiveMentionTooltipHtml(entry);
      els.talentTooltip.classList.remove('hidden');
      positionTalentTooltip(evt);
    });
    span.addEventListener('mousemove', positionTalentTooltip);
    span.addEventListener('mouseleave', hideTalentTooltip);
  });
}
els.classDivesLoginBtn.addEventListener('click', () => startDiscordLogin());

// ---------------------------------------------------------------------
// Class Deep Dives page — see normalizeClassDeepDives above for the data
// shape. Purely local (not persisted) UI state: which class cards are
// expanded, and which ones currently have their summary open for
// editing — both reset on reload, same pattern as the applications
// list's expandedClosedApplications.
// ---------------------------------------------------------------------
const editingClassDiveSummary = new Set();
// Which class (General or a CLASSES id) is currently showing in the main
// pane, selected via the left-hand filter sidebar — one class's content
// visible at a time, forum-board style, rather than every class's cards
// stacked and individually collapsed as before. Starts on General.
let selectedClassDiveId = 'general';
function selectClassDive(classId){
  if (selectedClassDiveId === classId) return;
  selectedClassDiveId = classId;
  renderClassDeepDivesView();
}
// Which individual Patch-Update "forum posts" are expanded — collapsed
// by default (see classDiveUpdatePostHtml), independent per update id,
// reset on reload same as the other UI-only state here.
const expandedClassDiveUpdates = new Set();
function toggleClassDiveUpdatePost(updateId){
  if (expandedClassDiveUpdates.has(updateId)) expandedClassDiveUpdates.delete(updateId);
  else expandedClassDiveUpdates.add(updateId);
  renderClassDeepDivesView();
}
// Same idea, but for the pinned Deep Dive / Allgemeine Infos summary at
// the top of each class — it's always shown first, but (being usually
// the longest single piece of content on the page) starts collapsed too,
// same forum-post treatment as the Patch-Updates below it, so picking a
// class doesn't dump a huge wall of text before you've even seen the
// Patch-Updates list. Keyed by classId (one summary per class).
const expandedClassDiveSummaries = new Set();
function toggleClassDiveSummary(classId){
  if (editingClassDiveSummary.has(classId)) return; // already forced open while editing — a header click shouldn't collapse the live editor
  if (expandedClassDiveSummaries.has(classId)) expandedClassDiveSummaries.delete(classId);
  else expandedClassDiveSummaries.add(classId);
  renderClassDeepDivesView();
}
async function saveClassDiveSummary(classId, html){
  if (!discordIdentity || !isOfficerOrAdmin() || !state.classDeepDives || !state.classDeepDives[classId]) return;
  const sanitized = sanitizeRichText(html || '');
  const backup = state.classDeepDives[classId];
  state.classDeepDives[classId] = Object.assign({}, backup, { summary: sanitized, summaryUpdatedAt: Date.now() });
  editingClassDiveSummary.delete(classId);
  renderClassDeepDivesView();
  const ok = await saveData('classDeepDives/' + classId);
  if (!ok){ state.classDeepDives[classId] = backup; renderClassDeepDivesView(); }
}
async function addClassDiveUpdate(classId, dateStr, titleStr, html){
  if (!discordIdentity || !isOfficerOrAdmin() || !state.classDeepDives || !state.classDeepDives[classId]) return;
  const sanitized = sanitizeRichText(html || '');
  if (!stripHtmlToText(sanitized).trim()) return;
  const backup = state.classDeepDives[classId];
  const entry = {
    id: Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    date: /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : '',
    title: (typeof titleStr === 'string') ? titleStr.trim().slice(0, 120) : '',
    text: sanitized,
    createdAt: Date.now()
  };
  state.classDeepDives[classId] = normalizeClassDeepDiveEntry(Object.assign({}, backup, { updates: [entry, ...backup.updates] }));
  renderClassDeepDivesView();
  const ok = await saveData('classDeepDives/' + classId);
  if (!ok){ state.classDeepDives[classId] = backup; renderClassDeepDivesView(); }
}
async function deleteClassDiveUpdate(classId, updateId){
  if (!discordIdentity || !isOfficerOrAdmin() || !state.classDeepDives || !state.classDeepDives[classId]) return;
  const backup = state.classDeepDives[classId];
  state.classDeepDives[classId] = Object.assign({}, backup, { updates: backup.updates.filter(u => u.id !== updateId) });
  renderClassDeepDivesView();
  const ok = await saveData('classDeepDives/' + classId);
  if (!ok){ state.classDeepDives[classId] = backup; renderClassDeepDivesView(); }
}
async function addClassDiveHistoryEntry(date, build, text){
  if (!discordIdentity || !isOfficerOrAdmin()) return;
  const entry = normalizeClassDiveHistoryEntry({ date, build, text });
  if (!entry) return;
  const id = newPushId('classDiveUpdateHistory') || (Date.now() + '_' + Math.random().toString(36).slice(2, 8));
  const backup = state.classDiveUpdateHistory;
  state.classDiveUpdateHistory = Object.assign({}, backup, { [id]: entry });
  renderClassDeepDivesView();
  const ok = await saveData('classDiveUpdateHistory/' + id);
  if (!ok){ state.classDiveUpdateHistory = backup; renderClassDeepDivesView(); }
}
async function deleteClassDiveHistoryEntry(id){
  if (!discordIdentity || !isOfficerOrAdmin() || !state.classDiveUpdateHistory || !state.classDiveUpdateHistory[id]) return;
  const backup = state.classDiveUpdateHistory;
  const copy = Object.assign({}, backup);
  delete copy[id];
  state.classDiveUpdateHistory = copy;
  renderClassDeepDivesView();
  const ok = await saveData('classDiveUpdateHistory/' + id);
  if (!ok){ state.classDiveUpdateHistory = backup; renderClassDeepDivesView(); }
}
async function addClassDiveSource(label, url){
  if (!discordIdentity || !isOfficerOrAdmin()) return;
  const entry = normalizeClassDiveSourceEntry({ label, url });
  if (!entry) return;
  const id = newPushId('classDiveSources') || (Date.now() + '_' + Math.random().toString(36).slice(2, 8));
  const backup = state.classDiveSources;
  state.classDiveSources = Object.assign({}, backup, { [id]: entry });
  renderClassDeepDivesView();
  const ok = await saveData('classDiveSources/' + id);
  if (!ok){ state.classDiveSources = backup; renderClassDeepDivesView(); }
}
async function deleteClassDiveSource(id){
  if (!discordIdentity || !isOfficerOrAdmin() || !state.classDiveSources || !state.classDiveSources[id]) return;
  const backup = state.classDiveSources;
  const copy = Object.assign({}, backup);
  delete copy[id];
  state.classDiveSources = copy;
  renderClassDeepDivesView();
  const ok = await saveData('classDiveSources/' + id);
  if (!ok){ state.classDiveSources = backup; renderClassDeepDivesView(); }
}
function formatClassDiveDate(dateStr){
  if (!dateStr) return '';
  try{
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('de-DE');
  }catch(e){ return dateStr; }
}
// Forum-post title for a Patch-Update: the officer's own title if they
// gave one, otherwise a generated "Patch-Update – <Datum>" so every post
// still has something to show as its card header.
function classDiveUpdateTitle(u){
  if (u.title) return u.title;
  const dateLabel = formatClassDiveDate(u.date);
  return dateLabel ? `Patch-Update – ${dateLabel}` : 'Patch-Update';
}
// Pulls up to maxLines "lines" of plain text out of a Patch-Update's rich
// HTML, for the collapsed forum-post preview. Plain `.textContent` alone
// won't do — it runs block elements together with no separator at all
// (`<p>A</p><p>B</p>` → "AB") — so this walks the block-level children
// (paragraphs, list items, headings, table rows treated as one line
// each) and takes their text one "line" at a time instead. Falls back to
// the whole stripped text as a single line for content with no block
// structure at all (shouldn't normally happen, sanitizeRichText always
// wraps bare text in a paragraph, but better safe for old/odd data).
function classDiveHtmlPreviewLines(html, maxLines){
  const container = document.createElement('div');
  container.innerHTML = String(html ?? '');
  const lines = [];
  // Collect one line past maxLines on purpose — that's how "is there
  // more?" gets decided below. Stopping exactly at maxLines would mean
  // never discovering whether a 6th line exists, so a 6-line entry and a
  // 5-line entry would look identical (both "not truncated").
  const limit = maxLines + 1;
  const pushLine = (text) => {
    const t = String(text ?? '').replace(/\s+/g, ' ').trim();
    if (t) lines.push(t);
  };
  const walk = (node) => {
    for (const child of Array.from(node.children)){
      if (lines.length >= limit) return;
      const tag = child.tagName;
      if (tag === 'TABLE'){
        for (const tr of Array.from(child.querySelectorAll('tr'))){
          if (lines.length >= limit) return;
          const cells = Array.from(tr.children).map(td => td.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
          if (cells.length) pushLine(cells.join(' – '));
        }
        continue;
      }
      if (tag === 'P' || tag === 'LI' || /^H[1-6]$/.test(tag)){
        pushLine(child.textContent);
        continue;
      }
      if (tag === 'UL' || tag === 'OL' || tag === 'DIV'){
        walk(child);
        continue;
      }
      pushLine(child.textContent);
    }
  };
  walk(container);
  if (!lines.length){
    const whole = container.textContent.replace(/\s+/g, ' ').trim();
    if (whole) lines.push(whole);
  }
  const truncated = lines.length > maxLines;
  return { lines: lines.slice(0, maxLines), truncated };
}
const CLASSDIVE_CLOCK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="var(--gold-bright)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>';
const CLASSDIVE_LINK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="var(--gold-bright)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l2.5-2.5a5 5 0 0 0-7.07-7.07L11 4.88"/><path d="M14 11a5 5 0 0 0-7.07 0l-2.5 2.5a5 5 0 0 0 7.07 7.07L13 19.12"/></svg>';

// Update-Historie (hand-written) — always expanded (no toggle), in the
// "Allgemein" category below the Patch-Updates (which include the
// automatic ones from js/forever-changes.js). Rows are the hard-coded CLASSDIVE_HISTORY_SEED
// (oldest first, not deletable) followed by whatever Officers/Admins
// have added since (Firebase-backed, in push-key/insertion order, so
// newly added rows land at the bottom — a forward-reading changelog).
function classDiveHistoryCardHtml(canManage){
  const addedIds = Object.keys(state.classDiveUpdateHistory || {});
  const seedRows = CLASSDIVE_HISTORY_SEED.map((e, i) => ({ id: 'seed-' + i, entry: e, deletable: false }));
  const addedRows = addedIds.map(id => ({ id, entry: state.classDiveUpdateHistory[id], deletable: true }));
  const rows = seedRows.concat(addedRows);
  const rowsHtml = rows.map(r => `<tr>
      <td>${escapeHtml(r.entry.date)}</td>
      <td>${escapeHtml(r.entry.build)}</td>
      <td>${escapeHtml(r.entry.text)}</td>
      ${canManage ? `<td>${r.deletable ? `<button type="button" class="btn btn-ghost btn-sm classdive-history-delete" data-delete-history="${r.id}" title="Eintrag löschen">✕</button>` : ''}</td>` : ''}
    </tr>`).join('');
  const addFormHtml = canManage
    ? `<div class="classdive-history-add">
        <div class="classdive-history-add-row">
          <input type="text" class="classdive-history-add-date" id="classdiveHistoryDate" placeholder="Datum, z.B. 2. Okt.">
          <input type="text" class="classdive-history-add-build" id="classdiveHistoryBuild" placeholder="Build (optional)">
        </div>
        <textarea class="classdive-history-add-text" id="classdiveHistoryText" rows="2" placeholder="Was ist passiert?"></textarea>
        <div class="forever-actions">
          <button type="button" class="btn btn-teal btn-sm" id="classdiveHistoryAddBtn">Eintrag hinzufügen</button>
        </div>
      </div>`
    : '';
  return `<div class="tac-card classdive-card classdive-card-static">
    <div class="classdive-toggle classdive-toggle-static">
      <span class="classdive-general-icon" aria-hidden="true">${CLASSDIVE_CLOCK_ICON}</span>
      <span class="classdive-toggle-title" style="color:var(--gold-bright)">Update-Historie</span>
      <span class="classdive-toggle-meta">${rows.length} Eintr${rows.length === 1 ? 'ag' : 'äge'}</span>
    </div>
    <div class="classdive-body">
      <div class="classdive-section">
        <div class="classdive-history-wrap">
          <table class="classdive-history-table">
            <thead><tr><th>Datum</th><th>Build</th><th>Was ist passiert?</th>${canManage ? '<th></th>' : ''}</tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
        ${addFormHtml}
      </div>
    </div>
  </div>`;
}

// Quellen — always expanded, pinned at the very bottom. Purely a link
// list (officer-curated references for the content above), not tied to
// any one class.
function classDiveSourcesCardHtml(canManage){
  const ids = Object.keys(state.classDiveSources || {});
  const sourcesHtml = ids.map(id => {
    const s = state.classDiveSources[id];
    return `<li class="classdive-source-item">
      <a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.label)}</a>
      ${canManage ? `<button type="button" class="btn btn-ghost btn-sm classdive-source-delete" data-delete-source="${id}" title="Quelle löschen">✕</button>` : ''}
    </li>`;
  }).join('');
  const addFormHtml = canManage
    ? `<div class="classdive-source-add">
        <input type="text" class="classdive-source-add-label" id="classdiveSourceLabel" placeholder="Beschreibung, z.B. „Blizzard Forum-Post“">
        <input type="url" class="classdive-source-add-url" id="classdiveSourceUrl" placeholder="https://…">
        <div class="forever-actions">
          <button type="button" class="btn btn-teal btn-sm" id="classdiveSourceAddBtn">Quelle hinzufügen</button>
        </div>
      </div>`
    : '';
  return `<div class="tac-card classdive-card classdive-card-static">
    <div class="classdive-toggle classdive-toggle-static">
      <span class="classdive-general-icon" aria-hidden="true">${CLASSDIVE_LINK_ICON}</span>
      <span class="classdive-toggle-title" style="color:var(--gold-bright)">Quellen</span>
      <span class="classdive-toggle-meta">${ids.length} Link${ids.length === 1 ? '' : 's'}</span>
    </div>
    <div class="classdive-body">
      <div class="classdive-section">
        ${ids.length ? `<ul class="classdive-sources-list">${sourcesHtml}</ul>` : `<p class="classdive-empty">Noch keine Quellen hinterlegt.</p>`}
        ${addFormHtml}
      </div>
    </div>
  </div>`;
}

// One Patch-Update rendered as a collapsed-by-default "forum post": a
// header (title + date + officer delete button) and either a short
// plain-text preview (collapsed) or the full rich content (expanded).
// Both the header and the preview are click targets for expanding —
// `data-toggle-classdive-post` appears on each so either one opens it.
/** @param {ClassDeepDiveUpdate & { auto?: boolean, build?: string }} u */
function classDiveUpdatePostHtml(c, u, canManage){
  const expanded = expandedClassDiveUpdates.has(u.id);
  const title = classDiveUpdateTitle(u);
  const dateLabel = formatClassDiveDate(u.date);
  // Automatic posts (game data) aren't stored — nothing to delete.
  if (u.auto) canManage = false;
  const deleteBtnHtml = canManage
    ? `<button type="button" class="btn btn-ghost btn-sm classdive-update-delete" data-delete-update="${c.id}" data-delete-update-id="${u.id}" title="Eintrag löschen">✕</button>`
    : '';
  const bodyHtml = expanded
    ? `<div class="classdive-post-body">
         <div class="classdive-update-text" data-classdive-update-id="${u.id}">${u.text}</div>
       </div>`
    : (() => {
        const { lines, truncated } = classDiveHtmlPreviewLines(u.text, 5);
        const previewHtml = lines.map(l => `<p>${escapeHtml(l)}</p>`).join('') + (truncated ? '<p class="classdive-post-more">…weiterlesen</p>' : '');
        return `<div class="classdive-post-preview" data-toggle-classdive-post="${u.id}">${previewHtml}</div>`;
      })();
  return `<div class="classdive-post${expanded ? ' expanded' : ''}" data-classdive-post="${u.id}">
    <div class="classdive-post-head" data-toggle-classdive-post="${u.id}">
      <span class="classdive-post-title">${escapeHtml(title)}</span>
      ${u.auto ? `<span class="fc-auto-tag" title="Automatisch aus den Forever-Spieldaten (Build ${escapeHtml(u.build || '')})">automatisch</span>` : ''}
      ${dateLabel ? `<span class="classdive-post-date">${escapeHtml(dateLabel)}</span>` : ''}
      <span class="classdive-post-arrow" aria-hidden="true">${expanded ? '▲' : '▼'}</span>
    </div>
    ${bodyHtml}
    ${canManage ? `<div class="classdive-post-actions">${deleteBtnHtml}</div>` : ''}
  </div>`;
}

// The Deep Dive / Allgemeine Infos summary, pinned first in the main
// pane — same collapsed-forum-post treatment as classDiveUpdatePostHtml
// (collapsed by default, short preview, click the header to expand),
// except while there's no summary yet at all: that's not something to
// collapse, so it stays a plain prompt card with no header/arrow until
// an Officer/Admin actually adds one. While editing, the header isn't a
// toggle (no point collapsing the live editor away) and shows no arrow.
function classDiveSummaryCardHtml(c, dive, canManage){
  const editingSummary = editingClassDiveSummary.has(c.id);
  const title = c.isGeneral ? 'Allgemeine Infos' : 'Deep Dive';
  if (!dive.summary && !editingSummary){
    const addBtnHtml = canManage
      ? `<button type="button" class="btn btn-ghost btn-sm" data-edit-summary="${c.id}">${c.isGeneral ? 'Infos hinzufügen' : 'Deep Dive hinzufügen'}</button>`
      : '';
    return `<div class="tac-card classdive-summary-card" data-classdive-card="${c.id}">
      <div class="classdive-section-head">
        <span class="classdive-section-title">${title}</span>
        ${addBtnHtml}
      </div>
      <p class="classdive-empty">${c.isGeneral ? 'Noch keine allgemeinen Infos hinterlegt.' : 'Noch kein Deep Dive hinterlegt.'}</p>
    </div>`;
  }
  const expanded = editingSummary || expandedClassDiveSummaries.has(c.id);
  const metaHtml = dive.summaryUpdatedAt
    ? `<span class="classdive-post-date">Aktualisiert am ${escapeHtml(new Date(dive.summaryUpdatedAt).toLocaleDateString('de-DE'))}</span>`
    : '';
  const editBtnHtml = (canManage && !editingSummary)
    ? `<button type="button" class="btn btn-ghost btn-sm classdive-post-editbtn" data-edit-summary="${c.id}">Bearbeiten</button>`
    : '';
  let bodyHtml;
  if (editingSummary){
    const summaryPlaceholder = escapeHtml(c.isGeneral
      ? 'Allgemeine WoW Forever Infos (Regelwerk, serverweite Besonderheiten, etc.) hier einfügen oder reinkopieren…'
      : `Blizzards Class Deep Dive für ${c.label} hier einfügen oder reinkopieren…`);
    bodyHtml = `<div class="classdive-post-body">
        <div class="announce-toolbar" id="classdive-summary-toolbar-${c.id}">${announceToolbarMarkup()}</div>
        <div class="announce-editor classdive-summary-edit" id="classdive-summary-edit-${c.id}" contenteditable="true" data-placeholder="${summaryPlaceholder}">${dive.summary}</div>
        <div class="forever-actions">
          <button type="button" class="btn btn-teal btn-sm" data-save-summary="${c.id}">Speichern</button>
          <button type="button" class="btn btn-ghost btn-sm" data-cancel-summary="${c.id}">Abbrechen</button>
        </div>
      </div>`;
  } else if (expanded){
    bodyHtml = `<div class="classdive-post-body"><div class="classdive-summary-text">${dive.summary}</div></div>`;
  } else {
    const { lines, truncated } = classDiveHtmlPreviewLines(dive.summary, 5);
    const previewHtml = lines.map(l => `<p>${escapeHtml(l)}</p>`).join('') + (truncated ? '<p class="classdive-post-more">…weiterlesen</p>' : '');
    bodyHtml = `<div class="classdive-post-preview" data-toggle-classdive-summary="${c.id}">${previewHtml}</div>`;
  }
  const toggleAttr = editingSummary ? '' : ` data-toggle-classdive-summary="${c.id}"`;
  return `<div class="classdive-post classdive-summary-card${expanded ? ' expanded' : ''}" data-classdive-card="${c.id}">
    <div class="classdive-post-head"${toggleAttr}>
      <span class="classdive-post-title">${title}</span>
      ${metaHtml}
      ${editBtnHtml}
      ${editingSummary ? '' : `<span class="classdive-post-arrow" aria-hidden="true">${expanded ? '▲' : '▼'}</span>`}
    </div>
    ${bodyHtml}
  </div>`;
}

function renderClassDeepDivesView(){
  const loggedIn = !!discordIdentity;
  const hasAccess = loggedIn && isMemberOrHigher();
  els.classDivesLoggedOut.classList.toggle('hidden', loggedIn);
  els.classDivesNoAccess.classList.toggle('hidden', !loggedIn || hasAccess);
  els.classDivesList.classList.toggle('hidden', !hasAccess);
  if (!hasAccess) return;
  const canManage = isOfficerOrAdmin();
  const dives = state.classDeepDives || {};
  const generalPseudo = {
    id: 'general', label: 'Allgemein', color: 'var(--gold-bright)',
    isGeneral: true,
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="var(--gold-bright)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/><path d="M9 7h7M9 11h7"/></svg>'
  };
  const categories = [generalPseudo, ...CLASSES];
  // selectedClassDiveId can point at a class that's no longer in the list
  // in some odd edge case — fall back to General rather than rendering
  // an empty main pane with nothing selected in the sidebar.
  if (!categories.some(c => c.id === selectedClassDiveId)) selectedClassDiveId = 'general';
  const activeCat = categories.find(c => c.id === selectedClassDiveId);
  const activeDive = dives[activeCat.id] || { summary: '', summaryUpdatedAt: 0, updates: [] };

  // Left-hand pre-filter — one button per category (General + every
  // class), highlighting whichever is currently shown in the main pane.
  const sidebarHtml = categories.map(c => {
    const dive = dives[c.id] || { summary: '', summaryUpdatedAt: 0, updates: [] };
    const iconUrl = c.isGeneral ? '' : foreverClassIconUrl(c.id);
    const active = c.id === selectedClassDiveId;
    const count = foreverChangePosts(dive.updates, c.isGeneral ? '' : c.label).length;
    return `<button type="button" class="classdive-filter-btn${active ? ' active' : ''}" data-select-classdive="${c.id}" style="--classdive-color:${c.color}">
      ${c.isGeneral ? `<span class="classdive-general-icon" aria-hidden="true">${c.icon}</span>` : (iconUrl ? `<img class="classdive-filter-icon wow-icon-frame" src="${iconUrl}" alt="" loading="lazy" onerror="this.style.display='none'">` : '')}
      <span class="classdive-filter-label">${escapeHtml(c.label)}</span>
      ${count ? `<span class="classdive-filter-count">${count}</span>` : ''}
    </button>`;
  }).join('');

  // Main pane — only the selected category's content. The Deep Dive /
  // Allgemeine Infos summary is pinned at the very top, first thing in
  // the main pane, so anyone new to the class always finds it there —
  // but (being usually the longest content on the page) it's collapsed
  // by default too, same forum-post treatment as the Patch-Updates below
  // it (see classDiveSummaryCardHtml / classDiveUpdatePostHtml).
  const c = activeCat, dive = activeDive;
  const iconUrl = c.isGeneral ? '' : foreverClassIconUrl(c.id);
  const summaryCardHtml = classDiveSummaryCardHtml(c, dive, canManage);

  // Hand-written posts plus the automatic ones from the game data
  // (js/forever-changes.js), one list, newest first.
  const posts = foreverChangePosts(dive.updates, c.isGeneral ? '' : c.label);
  if (posts.some(u => u.auto) && !bisData && currentPage === 'classdeepdives') bisLoadData().then(renderClassDeepDivesView).catch(() => {});
  const updatesListHtml = posts.length
    ? posts.map(u => classDiveUpdatePostHtml(c, u, canManage)).join('')
    : `<p class="classdive-empty">Noch keine Patch-Updates erfasst.</p>`;
  const addUpdateFormHtml = canManage
    ? `<div class="classdive-add-update">
        <div class="classdive-add-update-row">
          <input type="date" class="classdive-add-update-date" id="classdive-update-date-${c.id}" value="${new Date().toISOString().slice(0, 10)}">
          <input type="text" class="classdive-add-update-title" id="classdive-update-title-${c.id}" maxlength="120" placeholder="Titel, z.B. „Patch-Notes 2. Oktober“ (optional)">
        </div>
        <div class="announce-toolbar classdive-add-update-toolbar" id="classdive-update-toolbar-${c.id}">${announceToolbarMarkup()}</div>
        <div class="announce-editor classdive-add-update-text" id="classdive-update-text-${c.id}" contenteditable="true" data-placeholder="Was hat sich geändert? z.B. 'Buff auf X-Talent, Nerf auf Y-Prozentsatz'… (auch Einfügen mit Formatierung geht)"></div>
        <div class="forever-actions">
          <button type="button" class="btn btn-teal btn-sm" data-add-update="${c.id}">Update hinzufügen</button>
        </div>
      </div>`
    : '';

  const mainHtml = `
    <div class="classdive-main-head">
      ${c.isGeneral ? `<span class="classdive-general-icon" aria-hidden="true">${c.icon}</span>` : (iconUrl ? `<img class="classdive-filter-icon wow-icon-frame" src="${iconUrl}" alt="" loading="lazy" onerror="this.style.display='none'">` : '')}
      <h2 class="classdive-main-title" style="color:${c.color}">${escapeHtml(c.label)}</h2>
    </div>
    ${summaryCardHtml}
    ${c.isGeneral ? '' : howToPlayCardHtml(c.id)}
    <div class="classdive-updates-section">
      <div class="classdive-section-title">Patch-Updates</div>
      <div class="classdive-updates" data-classdive-updates="${c.id}">${updatesListHtml}</div>
      ${addUpdateFormHtml}
    </div>`;

  els.classDivesList.innerHTML = `
    <div class="classdive-layout">
      <nav class="classdive-sidebar" aria-label="Klassen-Filter">${sidebarHtml}</nav>
      <div class="classdive-main">${mainHtml}${c.isGeneral ? classDiveHistoryCardHtml(canManage) : ''}</div>
    </div>
    ${classDiveSourcesCardHtml(canManage)}`;

  if (!c.isGeneral) wireHowToPlay(els.classDivesList, c.id);
  els.classDivesList.querySelectorAll('[data-select-classdive]').forEach(btn => {
    btn.addEventListener('click', () => selectClassDive(btn.getAttribute('data-select-classdive')));
  });
  els.classDivesList.querySelectorAll('[data-toggle-classdive-post]').forEach(el => {
    el.addEventListener('click', () => toggleClassDiveUpdatePost(el.getAttribute('data-toggle-classdive-post')));
  });
  els.classDivesList.querySelectorAll('[data-toggle-classdive-summary]').forEach(el => {
    el.addEventListener('click', () => toggleClassDiveSummary(el.getAttribute('data-toggle-classdive-summary')));
  });
  els.classDivesList.querySelectorAll('[data-edit-summary]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-edit-summary');
      editingClassDiveSummary.add(id);
      expandedClassDiveSummaries.add(id);
      renderClassDeepDivesView();
    });
  });
  els.classDivesList.querySelectorAll('[data-cancel-summary]').forEach(btn => {
    btn.addEventListener('click', () => { editingClassDiveSummary.delete(btn.getAttribute('data-cancel-summary')); renderClassDeepDivesView(); });
  });
  els.classDivesList.querySelectorAll('[data-save-summary]').forEach(btn => {
    btn.addEventListener('click', () => {
      const classId = btn.getAttribute('data-save-summary');
      const editor = document.getElementById('classdive-summary-edit-' + classId);
      saveClassDiveSummary(classId, editor ? editor.innerHTML : '');
    });
  });
  els.classDivesList.querySelectorAll('[data-add-update]').forEach(btn => {
    btn.addEventListener('click', () => {
      const classId = btn.getAttribute('data-add-update');
      const dateInput = /** @type {HTMLInputElement} */ (document.getElementById('classdive-update-date-' + classId));
      const titleInput = /** @type {HTMLInputElement} */ (document.getElementById('classdive-update-title-' + classId));
      const editor = document.getElementById('classdive-update-text-' + classId);
      addClassDiveUpdate(classId, dateInput ? dateInput.value : '', titleInput ? titleInput.value : '', editor ? editor.innerHTML : '');
    });
  });
  // Rich-text toolbars: the summary editor only exists while editing, the
  // add-update editor only exists for the currently-selected class when
  // canManage — wire up whichever of each are currently in the DOM.
  const summaryToolbar = document.getElementById('classdive-summary-toolbar-' + c.id);
  const summaryEditor = document.getElementById('classdive-summary-edit-' + c.id);
  if (summaryToolbar && summaryEditor) wireAnnounceToolbar(summaryToolbar, summaryEditor);
  const updateToolbar = document.getElementById('classdive-update-toolbar-' + c.id);
  const updateEditor = document.getElementById('classdive-update-text-' + c.id);
  if (updateToolbar && updateEditor) wireAnnounceToolbar(updateToolbar, updateEditor);
  els.classDivesList.querySelectorAll('[data-delete-update]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteClassDiveUpdate(btn.getAttribute('data-delete-update'), btn.getAttribute('data-delete-update-id'));
    });
  });
  // Auto-link ability/spell names mentioned in the read-only text against
  // that card's own Talent Builder spellbook, with the exact same hover
  // tooltip. Only the displayed (non-editing) summary and expanded
  // update entries — never the live editor, so nothing fights the
  // officer's cursor while they're typing, and never the collapsed
  // plain-text previews, which have no markup to annotate anyway.
  const summaryTextEl = els.classDivesList.querySelector('.classdive-summary-card .classdive-summary-text');
  if (summaryTextEl) annotateSpellMentions(summaryTextEl, c.id);
  els.classDivesList.querySelectorAll('.classdive-update-text').forEach(el => annotateSpellMentions(el, c.id));

  // Update-Historie + Quellen — always-expanded static cards, wired
  // separately since they have no toggle/expand state of their own.
  els.classDivesList.querySelectorAll('[data-delete-history]').forEach(btn => {
    btn.addEventListener('click', () => deleteClassDiveHistoryEntry(btn.getAttribute('data-delete-history')));
  });
  const historyAddBtn = document.getElementById('classdiveHistoryAddBtn');
  if (historyAddBtn){
    historyAddBtn.addEventListener('click', () => {
      const dateInput = /** @type {HTMLInputElement} */ (document.getElementById('classdiveHistoryDate'));
      const buildInput = /** @type {HTMLInputElement} */ (document.getElementById('classdiveHistoryBuild'));
      const textInput = /** @type {HTMLInputElement} */ (document.getElementById('classdiveHistoryText'));
      addClassDiveHistoryEntry(dateInput ? dateInput.value : '', buildInput ? buildInput.value : '', textInput ? textInput.value : '');
    });
  }
  els.classDivesList.querySelectorAll('[data-delete-source]').forEach(btn => {
    btn.addEventListener('click', () => deleteClassDiveSource(btn.getAttribute('data-delete-source')));
  });
  const sourceAddBtn = document.getElementById('classdiveSourceAddBtn');
  if (sourceAddBtn){
    sourceAddBtn.addEventListener('click', () => {
      const labelInput = /** @type {HTMLInputElement} */ (document.getElementById('classdiveSourceLabel'));
      const urlInput = /** @type {HTMLInputElement} */ (document.getElementById('classdiveSourceUrl'));
      addClassDiveSource(labelInput ? labelInput.value : '', urlInput ? urlInput.value : '');
    });
  }
}
