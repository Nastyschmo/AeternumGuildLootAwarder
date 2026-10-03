// BiS-Planer, step 2: "Öffentliche Builds" — a browsable list of every
// public item set (bisPublic, loaded by bisSyncListeners() in
// js/bis-sets.js), for every logged-in account incl. Community. Filters
// by class / spec and a text search (set or player name); recommended
// sets first, then newest. "Im Planer öffnen" loads a set into the
// planner (unsaved changes are asked about first). Admins can delete
// someone else's public set for moderation. No comments, as agreed —
// the point is to find the people behind good builds.

/** 'planner' | 'browse' — which tab of the BiS page is shown. */
let bisView = 'planner';
let bisBrowseClass = '';
let bisBrowseSpec = '';
let bisBrowseQuery = '';

/** The two tabs at the top of the BiS page. */
function bisViewTabsHtml(){
  const tab = (id, label) => `<button type="button" class="bis-tab${bisView === id ? ' active' : ''}" data-bis-view="${id}">${label}</button>`;
  return `<div class="bis-tabs" role="tablist">${tab('planner', 'Mein Planer')}${tab('browse', 'Öffentliche Builds')}</div>`;
}
/** @param {HTMLElement} root */
function bisWireViewTabs(root){
  root.querySelectorAll('[data-bis-view]').forEach(btn => btn.addEventListener('click', () => {
    const v = btn.getAttribute('data-bis-view');
    if (v === bisView) return;
    bisView = v;
    renderBisPlanner();
  }));
}

/** All public sets (own and others') matching the filters, recommended first, then newest. @returns {[string, BisSavedSet][]} */
function bisBrowseMatches(){
  const q = bisBrowseQuery.trim().toLowerCase();
  const all = { ...bisOtherSets };
  for (const [id, s] of Object.entries(bisMySets)) if (s.public) all[id] = s;
  return Object.entries(all)
    .filter(([, s]) => (!bisBrowseClass || s.classId === bisBrowseClass) && (!bisBrowseSpec || s.specId === bisBrowseSpec))
    .filter(([, s]) => !q || s.name.toLowerCase().includes(q) || bisOwnerLabel(s).toLowerCase().includes(q))
    .sort((a, z) => Number(bisIsRecommended(z[0])) - Number(bisIsRecommended(a[0])) || z[1].updatedAt - a[1].updatedAt);
}

/** One set as a card. @param {string} id @param {BisSavedSet} s */
function bisBrowseCardHtml(id, s){
  const cls = CLASS_MAP[s.classId];
  const items = BIS_SLOTS.map(sl => s.slots[sl.key] && bisData.byId.get(s.slots[sl.key])).filter(Boolean);
  const owned = items.filter(i => bisIsOwned(i.id)).length;
  const date = s.updatedAt ? new Date(s.updatedAt).toLocaleDateString('de-DE') : '';
  const mine = s.ownerId === bisSyncUid;
  const canModerate = !mine && currentRole === 'admin';
  return `<div class="bis-build-card${bisIsRecommended(id) ? ' bis-build-rec' : ''}">
    <div class="bis-build-head">
      <img class="bis-build-class" src="${escapeHtml(foreverClassIconUrl(s.classId))}" alt="" style="border-color:${cls.color}">
      <div class="bis-build-title">
        <div class="bis-build-name">${bisIsRecommended(id) ? '<span class="bis-rec-badge" title="Von der Gildenleitung empfohlen">★</span>' : ''}${escapeHtml(s.name)}</div>
        <div class="bis-build-meta"><span style="color:${cls.color}">${escapeHtml(cls.label)} · ${escapeHtml(foreverSpecLabel(s.classId, s.specId))}</span> · Stufe ${s.level} · von <strong>${escapeHtml(bisOwnerLabel(s))}</strong>${mine ? ' (Du)' : ''}${date ? ' · ' + date : ''}</div>
      </div>
    </div>
    <div class="bis-build-items">${items.length
      ? items.map(i => `<span title="${escapeHtml(i.n)}${bisIsOwned(i.id) ? ' — hast Du' : ''}" class="${bisIsOwned(i.id) ? 'bis-build-owned' : ''}">${bisIconHtml(i, 28)}</span>`).join('')
      : '<span class="bis-hint">Noch keine Items gewählt.</span>'}</div>
    <div class="bis-build-foot">
      <span class="bis-build-count">${items.length} Items${items.length ? ` · ${owned}/${items.length} hast Du` : ''}</span>
      <span class="bis-build-actions">
        ${canModerate ? `<button type="button" class="btn btn-ghost btn-sm" data-bis-browse-delete="${escapeHtml(id)}" title="Als Admin entfernen">Entfernen</button>` : ''}
        <button type="button" class="btn btn-teal btn-sm" data-bis-open="${escapeHtml(id)}">Im Planer öffnen</button>
      </span>
    </div>
  </div>`;
}

function bisBrowseListHtml(){
  const matches = bisBrowseMatches();
  if (!matches.length){
    return `<p class="bis-hint">${bisBrowseClass || bisBrowseSpec || bisBrowseQuery ? 'Keine öffentlichen Builds für diese Filter.' : 'Noch keine öffentlichen Builds. Speichere ein Set im Planer und hake „öffentlich“ an.'}</p>`;
  }
  return `<p class="bis-hint bis-browse-count">${matches.length} ${matches.length === 1 ? 'Build' : 'Builds'}</p>
    <div class="bis-build-grid">${matches.map(([id, s]) => bisBrowseCardHtml(id, s)).join('')}</div>`;
}

/** The "Öffentliche Builds" tab. @param {HTMLElement} root */
function renderBisBrowser(root){
  if (!discordIdentity){
    root.innerHTML = `${bisViewTabsHtml()}<div class="tac-card"><p class="bis-hint">Öffentliche Builds sehen alle mit Discord eingeloggten Spieler. Melde Dich oben rechts an.</p></div>`;
    bisWireViewTabs(root);
    return;
  }
  const specs = bisBrowseClass ? foreverSpecsForClass(bisBrowseClass) : [];
  root.innerHTML = `${bisViewTabsHtml()}
    <div class="bis-controls tac-card">
      <div class="bis-control">
        <label>Klasse</label>
        <div class="bis-class-row">
          <button type="button" class="talent-class-btn bis-class-all${bisBrowseClass ? '' : ' active'}" data-bis-browse-class="">Alle</button>
          ${CLASSES.map(c => `<button type="button" class="talent-class-btn${c.id === bisBrowseClass ? ' active' : ''}" style="--class-color:${c.color}" data-bis-browse-class="${c.id}" title="${escapeHtml(c.label)}"><img src="${escapeHtml(foreverClassIconUrl(c.id))}" alt=""></button>`).join('')}
        </div>
      </div>
      <div class="bis-control">
        <label for="bisBrowseSpec">Spezialisierung</label>
        <select id="bisBrowseSpec" ${bisBrowseClass ? '' : 'disabled'}>
          <option value="">Alle</option>
          ${specs.map(s => `<option value="${s.id}" ${s.id === bisBrowseSpec ? 'selected' : ''}>${escapeHtml(s.label)}</option>`).join('')}
        </select>
      </div>
      <div class="bis-control bis-setbar-name">
        <label for="bisBrowseSearch">Suche</label>
        <input type="search" id="bisBrowseSearch" class="apply-text-input" placeholder="Set- oder Spielername …" value="${escapeHtml(bisBrowseQuery)}" autocomplete="off">
      </div>
    </div>
    <div id="bisBrowseList">${bisBrowseListHtml()}</div>`;
  bisWireViewTabs(root);
  root.querySelectorAll('[data-bis-browse-class]').forEach(btn => btn.addEventListener('click', () => {
    bisBrowseClass = btn.getAttribute('data-bis-browse-class');
    bisBrowseSpec = '';
    renderBisPlanner();
  }));
  const spec = /** @type {HTMLSelectElement} */ (root.querySelector('#bisBrowseSpec'));
  spec.addEventListener('change', () => { bisBrowseSpec = spec.value; renderBisPlanner(); });
  const search = /** @type {HTMLInputElement} */ (root.querySelector('#bisBrowseSearch'));
  // Only the list re-renders while typing, so the field keeps its focus.
  search.addEventListener('input', () => { bisBrowseQuery = search.value; bisRenderBrowseList(root); });
  bisWireBrowseList(root);
}

/** @param {HTMLElement} root */
function bisRenderBrowseList(root){
  const list = root.querySelector('#bisBrowseList');
  if (!list) return;
  list.innerHTML = bisBrowseListHtml();
  bisWireBrowseList(root);
}

/** @param {HTMLElement} root */
function bisWireBrowseList(root){
  root.querySelectorAll('[data-bis-open]').forEach(btn => btn.addEventListener('click', async () => {
    const id = btn.getAttribute('data-bis-open');
    if (!(await bisConfirmLeave())) return;
    bisView = 'planner';
    bisLoadSet(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }));
  root.querySelectorAll('[data-bis-browse-delete]').forEach(btn => btn.addEventListener('click', async () => {
    const id = btn.getAttribute('data-bis-browse-delete');
    const set = bisAnySet(id);
    if (!set || currentRole !== 'admin') return;
    const answer = await bisDialog('Öffentliches Set entfernen?',
      `„${set.name}“ von ${bisOwnerLabel(set)} wird aus den öffentlichen Builds gelöscht. Das lässt sich nicht rückgängig machen.`,
      [{ id: 'delete', label: 'Entfernen', primary: true }, { id: 'cancel', label: 'Abbrechen' }]);
    if (answer !== 'delete') return;
    try {
      await db.ref(DB_PATH).update({ [`bisPublic/${id}`]: null, [`bisRecommended/${id}`]: null });
    } catch (e){
      bisSetStatus = 'Entfernen fehlgeschlagen.';
    }
    renderBisPlanner();
  }));
}
