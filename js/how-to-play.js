// "How to play" card on the Class Overview page: the curated per-spec
// guide from data/howtoplay.js (role, playstyle, priority, stats, tips,
// sources), with links into our own tools — the class in the Talent
// Builder, the spec in the BiS planner, the ★ recommended sets and the
// spec's public builds. Ability names in the text get the same hover
// tooltips as the Deep Dive (annotateSpellMentions).
//
// The recommended / public sets come from the BiS planner's listeners
// (bisSyncListeners() in js/bis-sets.js), started here as well so the
// links work without visiting the planner first. When they update, only
// the link box is re-rendered (htpRefreshLinks) — a full re-render of
// the Class Overview would throw away an officer's unsaved editor text.

/**
 * Talent texts as they were when the guide was last reviewed
 * (data/howtoplay-baseline.json, written by scripts/howtoplay/check.mjs).
 * Loaded on first use; the card then flags talents whose live text changed.
 * @typedef {{ updated: string, build: string, classes: Record<string, Record<string, { max: number, desc: string }>> }} HtpBaseline
 * @type {HtpBaseline | null}
 */
let htpBaseline = null;
/** @type {Promise<void> | null} */
let htpBaselinePromise = null;
function htpLoadBaseline(){
  if (!htpBaselinePromise){
    htpBaselinePromise = fetch('data/howtoplay-baseline.json', { cache: 'no-cache' })
      .then(r => r.ok ? r.json() : null)
      .then(json => { htpBaseline = json && json.classes ? json : null; }, () => {});
  }
  return htpBaselinePromise;
}
/** Talents named in the guide whose live data differs from the baseline. @param {string} classId */
function htpDrift(classId){
  const base = htpBaseline && htpBaseline.classes[classId];
  const data = TALENT_DATA[CLASS_MAP[classId].label];
  if (!base || !data) return [];
  const live = new Map(data.trees.flatMap(tr => tr.talents.map(t => [t.name, t])));
  /** @type {{ name: string, old: string, now: string }[]} */
  const out = [];
  for (const [name, old] of Object.entries(base)){
    const t = live.get(name);
    const now = t ? (Array.isArray(t.desc) ? t.desc[t.desc.length - 1] || '' : String(t.desc || '')) : '';
    if (!t) out.push({ name, old: old.desc, now: '' });
    else if (t.max !== old.max || now !== old.desc) out.push({ name, old: old.desc, now: t.max !== old.max ? `${now} (${t.max} statt ${old.max} Ränge)` : now });
  }
  return out;
}
/** @param {string} classId */
function htpDriftHtml(classId){
  const drift = htpDrift(classId);
  if (!drift.length) return '';
  const since = new Date(HOW_TO_PLAY_UPDATED + 'T12:00:00').toLocaleDateString('de-DE');
  return `<details class="htp-drift">
    <summary>⚠ ${drift.length === 1 ? 'Ein hier genanntes Talent wurde' : `${drift.length} hier genannte Talente wurden`} seit dem ${escapeHtml(since)} im Spiel geändert – Texte dazu evtl. veraltet</summary>
    <ul>${drift.map(d => `<li><strong>${escapeHtml(d.name)}</strong>${d.now
      ? `<div class="htp-drift-old">vorher: ${escapeHtml(d.old)}</div><div class="htp-drift-new">jetzt: ${escapeHtml(d.now)}</div>`
      : ' — nicht mehr im Talentbaum'}</li>`).join('')}</ul>
  </details>`;
}

/** Selected spec per class (UI only, reset on reload). @type {Record<string, string>} */
const htpSpecByClass = {};

/** @param {string} classId */
function htpSelectedSpec(classId){
  const specs = foreverSpecsForClass(classId);
  const id = htpSpecByClass[classId];
  return specs.some(s => s.id === id) ? id : (specs[0] ? specs[0].id : '');
}

/** Public sets of a class + spec (own and others'): recommended ones and the count of all. @param {string} classId @param {string} specId */
function htpSetsFor(classId, specId){
  const all = { ...bisOtherSets };
  for (const [id, s] of Object.entries(bisMySets)) if (s.public) all[id] = s;
  const matches = Object.entries(all).filter(([, s]) => s.classId === classId && s.specId === specId);
  const recommended = matches.filter(([id]) => bisIsRecommended(id)).sort((a, z) => z[1].updatedAt - a[1].updatedAt);
  return { recommended, total: matches.length };
}

/** The "Builds & Tools" box of the selected spec. @param {string} classId @param {string} specId */
function htpLinksHtml(classId, specId){
  const specLabel = foreverSpecLabel(classId, specId);
  const loggedIn = Boolean(discordIdentity);
  const { recommended, total } = htpSetsFor(classId, specId);
  const recHtml = recommended.length
    ? `<ul class="htp-rec-list">${recommended.map(([id, s]) => `<li>
        <span class="bis-rec-badge" title="Von der Gildenleitung empfohlen">★</span>
        <span class="htp-rec-name">${escapeHtml(s.name)}</span>
        <span class="htp-rec-meta">von ${escapeHtml(bisOwnerLabel(s))}${bisTalentSummary(s.talents) ? ' · Talente ' + bisTalentSummary(s.talents) : ''}</span>
        <button type="button" class="btn btn-teal btn-sm" data-htp-open-set="${escapeHtml(id)}">Im Planer öffnen</button>
      </li>`).join('')}</ul>`
    : `<p class="htp-hint">${loggedIn ? `Noch kein empfohlenes ${escapeHtml(specLabel)}-Set.` : 'Empfohlene Sets siehst Du nach dem Discord-Login.'}</p>`;
  return `<div class="htp-links-head">Unsere Builds &amp; Tools</div>
    <div class="htp-link-row">
      <button type="button" class="btn btn-ghost btn-sm" data-htp-talents>Talent Builder: ${escapeHtml(CLASS_MAP[classId].label)}</button>
      <button type="button" class="btn btn-ghost btn-sm" data-htp-bis>BiS-Planer: ${escapeHtml(specLabel)}</button>
      ${loggedIn ? `<button type="button" class="btn btn-ghost btn-sm" data-htp-browse>Öffentliche ${escapeHtml(specLabel)}-Builds (${total})</button>` : ''}
    </div>
    ${recHtml}`;
}

/** The whole card for one class, or '' (General / no content). @param {string} classId */
function howToPlayCardHtml(classId){
  const guide = HOW_TO_PLAY[classId];
  if (!guide) return '';
  const specs = foreverSpecsForClass(classId).filter(s => guide.specs[s.id]);
  if (!specs.length) return '';
  const specId = htpSelectedSpec(classId);
  const spec = guide.specs[specId] || guide.specs[specs[0].id];
  const role = foreverSpecRole(classId, specId);
  const tabs = specs.map(s => {
    const icon = foreverSpecIconUrl(classId, s.id);
    return `<button type="button" class="htp-tab${s.id === specId ? ' active' : ''}" data-htp-spec="${s.id}">
      ${icon ? `<img src="${escapeHtml(icon)}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}${escapeHtml(s.label)}
    </button>`;
  }).join('');
  const list = (items, ordered) => `<${ordered ? 'ol' : 'ul'} class="htp-list">${items.map(t => `<li>${escapeHtml(t)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`;
  const updated = new Date(HOW_TO_PLAY_UPDATED + 'T12:00:00').toLocaleDateString('de-DE');
  return `<div class="tac-card htp-card" id="howToPlayCard">
    <div class="classdive-section-head">
      <span class="classdive-section-title">How to play</span>
      <span class="classdive-post-date">Stand ${escapeHtml(updated)}</span>
    </div>
    ${htpDriftHtml(classId)}
    <div class="htp-text">
      <p class="htp-intro">${escapeHtml(guide.intro)}</p>
      <div class="htp-facts">
        <div><span class="htp-fact-label">Leveln</span>${escapeHtml(guide.leveling)}</div>
        <div><span class="htp-fact-label">Völker</span>${escapeHtml(guide.races)}</div>
      </div>
    </div>
    <div class="htp-tabs" role="tablist">${tabs}</div>
    <div class="htp-spec">
      <div class="htp-text">
        <p class="htp-summary"><span class="htp-role" style="--role-color:${FOREVER_ROLE_COLORS[role]}">${escapeHtml(FOREVER_ROLE_LABELS[role])}</span>${escapeHtml(spec.summary)}</p>
        <div class="htp-grid">
          <div class="htp-block htp-block-wide"><h4>Spielweise</h4><p>${escapeHtml(spec.playstyle)}</p></div>
          <div class="htp-block"><h4>Priorität</h4>${list(spec.priority, true)}</div>
          <div class="htp-block"><h4>Stats</h4><p>${escapeHtml(spec.stats)}</p><h4>Tipps</h4>${list(spec.tips, false)}</div>
        </div>
      </div>
      <div class="htp-links" id="htpLinks">${htpLinksHtml(classId, specId)}</div>
    </div>
    <details class="htp-sources">
      <summary>Quellen (${guide.sources.length})</summary>
      <p class="htp-hint">Zusammengefasst aus öffentlichen WoW-Forever-Guides und mit unseren aktuellen Talent-Daten abgeglichen. Zahlen und Prioritäten können sich mit Patches ändern.</p>
      <ul>${guide.sources.map(s => `<li><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.label)}</a></li>`).join('')}</ul>
    </details>
  </div>`;
}

/** Wire the card after renderClassDeepDivesView() put it in. @param {HTMLElement} root @param {string} classId */
function wireHowToPlay(root, classId){
  const card = /** @type {HTMLElement} */ (root.querySelector('#howToPlayCard'));
  if (!card) return;
  bisSyncListeners();
  if (!htpBaselinePromise) htpLoadBaseline().then(() => {
    // Re-render the card (only) once the baseline is in, if it's still shown.
    const shown = /** @type {HTMLElement} */ (root.querySelector('#howToPlayCard'));
    if (!shown || !htpDrift(classId).length || selectedClassDiveId !== classId) return;
    shown.outerHTML = howToPlayCardHtml(classId);
    wireHowToPlay(root, classId);
  });
  card.querySelectorAll('[data-htp-spec]').forEach(btn => btn.addEventListener('click', () => {
    htpSpecByClass[classId] = btn.getAttribute('data-htp-spec');
    card.outerHTML = howToPlayCardHtml(classId);
    wireHowToPlay(root, classId);
  }));
  card.querySelectorAll('.htp-text').forEach((/** @type {HTMLElement} */ el) => annotateSpellMentions(el, classId));
  htpWireLinks(card, classId);
}

/** @param {HTMLElement} card @param {string} classId */
function htpWireLinks(card, classId){
  const specId = htpSelectedSpec(classId);
  const on = (sel, fn) => card.querySelectorAll(sel).forEach(el => el.addEventListener('click', () => fn(el)));
  on('[data-htp-talents]', () => {
    talentBuilderClass = CLASS_MAP[classId].label;
    showPage('talentbuilder');
  });
  on('[data-htp-bis]', () => htpOpenBis(classId, specId, ''));
  on('[data-htp-open-set]', el => htpOpenBis(classId, specId, el.getAttribute('data-htp-open-set')));
  on('[data-htp-browse]', () => {
    bisView = 'browse';
    bisBrowseClass = classId;
    bisBrowseSpec = specId;
    bisBrowseQuery = '';
    showPage('bis');
  });
}

/** Re-render just the link box (the BiS set listeners changed). */
function htpRefreshLinks(){
  if (currentPage !== 'classdeepdives') return;
  const card = /** @type {HTMLElement} */ (document.getElementById('howToPlayCard'));
  const box = document.getElementById('htpLinks');
  if (!card || !box || !HOW_TO_PLAY[selectedClassDiveId]) return;
  box.innerHTML = htpLinksHtml(selectedClassDiveId, htpSelectedSpec(selectedClassDiveId));
  htpWireLinks(box, selectedClassDiveId);
}

/**
 * Open a class + spec in the BiS planner: a given set, else the newest
 * own / recommended set of that spec, else the current draft switched to
 * that spec (a class change clears items and talents, like the planner's
 * own class buttons). Unsaved changes are asked about first.
 * @param {ClassId} classId @param {string} specId @param {string} setId
 */
async function htpOpenBis(classId, specId, setId){
  if (!bisDraft) bisDraft = bisLoadDraft();
  const b = bisDraft;
  const sameSpec = b.classId === classId && b.specId === specId;
  if ((setId ? b.setId !== setId : !sameSpec) && !(await bisConfirmLeave())) return;
  bisView = 'planner';
  if (!setId && !sameSpec){
    if (b.classId !== classId){ b.slots = {}; b.talents = [{}, {}, {}]; }
    b.classId = classId;
    b.specId = specId;
    b.setId = '';
    bisSetNameDraft = null;
    bisSetStatus = '';
    setId = bisDefaultSetForSpec();
    bisSaveDraft();
  }
  if (setId && b.setId !== setId) bisLoadSet(setId);
  showPage('bis');
}

/** Jump to a spec's guide on the Class Overview page. @param {ClassId} classId @param {string} specId */
function htpShow(classId, specId){
  htpSpecByClass[classId] = specId;
  selectedClassDiveId = classId;
  showPage('classdeepdives');
  renderClassDeepDivesView();
  const card = document.getElementById('howToPlayCard');
  if (card) card.scrollIntoView({ block: 'start' });
}
