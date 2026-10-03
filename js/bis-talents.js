// BiS-Planer, step 3: talents in an item set.
//
// A set carries the talent points of its class as three maps
// (tree 0..2: talent name -> rank), the same shape the Talent Builder
// keeps per class (talentBuild[cls].points). Editing reuses the Talent
// Builder itself: "Im Talent Builder bearbeiten" copies the set's talents
// in (backing up the user's own builder state), a banner there offers
// "Übernehmen & zurück", and the backup is restored afterwards.
// In Firebase the trees are stored as { t0, t1, t2 } (numeric keys would
// turn into arrays); talent names are valid keys (no . # $ / [ ]).

/** @typedef {Record<string, number>[]} BisTalentPoints */

/**
 * Pending Talent Builder edit for a BiS set: the class being edited and
 * the user's own builder state for that class, restored afterwards.
 * @type {{ cls: string, backup: { level: number, points: Record<string, number>[] } } | null}
 */
let bisTalentEdit = null;

/** Talent Builder class key ("Warrior") for a planner class id. @param {ClassId} classId */
function bisTalentClass(classId){
  return CLASS_MAP[classId] ? CLASS_MAP[classId].label : '';
}

/**
 * Clean talent points against the current tree data: known talents
 * only, ranks clamped to 1..max. Accepts the Firebase { t0, t1, t2 } shape
 * or an array. @param {any} raw @param {ClassId} classId @returns {BisTalentPoints}
 */
function bisNormalizeTalents(raw, classId){
  const data = TALENT_DATA[bisTalentClass(classId)];
  /** @type {BisTalentPoints} */
  const out = [{}, {}, {}];
  if (!raw || typeof raw !== 'object' || !data) return out;
  for (let i = 0; i < 3; i++){
    const tree = Array.isArray(raw) ? raw[i] : raw['t' + i];
    if (!tree || typeof tree !== 'object' || !data.trees[i]) continue;
    for (const t of data.trees[i].talents){
      const r = Math.min(t.max, Math.floor(Number(tree[t.name]) || 0));
      if (r > 0) out[i][t.name] = r;
    }
  }
  return out;
}
/** Firebase shape, or null when no points are spent. @param {BisTalentPoints | undefined} pts */
function bisTalentsPayload(pts){
  if (!pts) return null;
  /** @type {Record<string, Record<string, number>>} */
  const out = {};
  pts.forEach((tree, i) => { if (Object.keys(tree).length) out['t' + i] = { ...tree }; });
  return Object.keys(out).length ? out : null;
}
/** Points per tree. @param {BisTalentPoints | undefined} pts */
function bisTalentSpent(pts){
  return [0, 1, 2].map(i => Object.values((pts && pts[i]) || {}).reduce((s, r) => s + r, 0));
}
/** "31/20/0", or '' without talents. @param {BisTalentPoints | undefined} pts */
function bisTalentSummary(pts){
  const spent = bisTalentSpent(pts);
  return spent.some(n => n) ? spent.join('/') : '';
}
/** Same talents? @param {BisTalentPoints | undefined} a @param {BisTalentPoints | undefined} b */
function bisTalentsEqual(a, b){
  return JSON.stringify(bisTalentsPayload(a)) === JSON.stringify(bisTalentsPayload(b));
}

/** The "Talente" card in the planner's side column. */
function bisTalentCardHtml(){
  const b = bisDraft;
  const cls = bisTalentClass(b.classId);
  const data = TALENT_DATA[cls];
  if (!data) return '';
  const pts = b.talents || [{}, {}, {}];
  const spent = bisTalentSpent(pts);
  const total = spent.reduce((s, n) => s + n, 0);
  const available = Math.max(0, b.level - 9);
  ensureTalentBuildLoaded();
  const builderSpent = bisTalentSpent(talentBuild[cls] && talentBuild[cls].points);
  const builderHas = builderSpent.some(n => n);
  const trees = data.trees.map((tree, i) => {
    const chosen = tree.talents.filter(t => pts[i] && pts[i][t.name]);
    return `<div class="bis-tal-tree">
      <div class="bis-tal-tree-head"><strong>${escapeHtml(tree.name)}</strong><span>${spent[i]}</span></div>
      <div class="bis-tal-icons">${chosen.length
        ? chosen.map(t => `<span class="bis-tal-icon" title="${escapeHtml(t.name)} ${pts[i][t.name]}/${t.max}${t.desc && t.desc[pts[i][t.name] - 1] ? ' — ' + escapeHtml(t.desc[pts[i][t.name] - 1]) : ''}"><img src="${escapeHtml(talentIconUrl(t.icon))}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><b>${pts[i][t.name]}</b></span>`).join('')
        : '<span class="bis-item-meta">—</span>'}</div>
    </div>`;
  }).join('');
  return `<div class="tac-card bis-talents">
    <h3 class="bis-card-title">Talente${total ? ` <span class="bis-tal-sum">${spent.join(' / ')}</span>` : ''}</h3>
    ${total
      ? `<p class="bis-item-meta">${total} von ${available} Punkten auf Stufe ${b.level}${total > available ? ' — <span class="bis-tal-over">zu viele Punkte für diese Stufe</span>' : ''}</p>${trees}`
      : '<p class="bis-hint">Noch keine Talente im Set. Bearbeite sie im Talent Builder oder übernimm Deinen aktuellen Talent-Builder-Stand.</p>'}
    <div class="bis-tal-actions">
      <button type="button" class="btn btn-teal btn-sm" id="bisTalentEditBtn">Im Talent Builder bearbeiten</button>
      ${builderHas ? `<button type="button" class="btn btn-ghost btn-sm" id="bisTalentTakeBtn" title="Dein Talent-Builder-Stand für ${escapeHtml(cls)}: ${builderSpent.join('/')}">Aus Talent Builder übernehmen (${builderSpent.join('/')})</button>` : ''}
      ${total ? '<button type="button" class="btn btn-ghost btn-sm" id="bisTalentClearBtn">Leeren</button>' : ''}
    </div>
  </div>`;
}

/** @param {HTMLElement} root */
function bisWireTalentCard(root){
  const b = bisDraft;
  const cls = bisTalentClass(b.classId);
  const on = (id, fn) => { const el = root.querySelector(id); if (el) el.addEventListener('click', fn); };
  on('#bisTalentEditBtn', () => {
    ensureTalentBuildLoaded();
    const own = talentBuild[cls];
    bisTalentEdit = { cls, backup: { level: own.level, points: own.points.map(t => ({ ...t })) } };
    talentBuild[cls] = {
      level: Math.max(TALENT_MIN_LEVEL, Math.min(TALENT_MAX_LEVEL, b.level)),
      points: (b.talents || [{}, {}, {}]).map(t => ({ ...t }))
    };
    saveTalentBuild(talentBuild);
    talentBuilderClass = cls;
    showPage('talentbuilder');
    window.scrollTo({ top: 0 });
  });
  on('#bisTalentTakeBtn', () => {
    ensureTalentBuildLoaded();
    b.talents = bisNormalizeTalents(talentBuild[cls].points, b.classId);
    bisSaveDraft();
    renderBisPlanner();
  });
  on('#bisTalentClearBtn', () => {
    b.talents = [{}, {}, {}];
    bisSaveDraft();
    renderBisPlanner();
  });
}

/** Banner above the Talent Builder trees while editing a BiS set's talents. */
function bisRenderTalentBanner(){
  const el = document.getElementById('talentBisBanner');
  if (!el) return;
  if (!bisTalentEdit || !bisDraft){ el.classList.add('hidden'); el.innerHTML = ''; return; }
  const set = bisAnySet(bisDraft.setId);
  el.classList.remove('hidden');
  el.innerHTML = `<span>Du bearbeitest die Talente für Deinen BiS-Planer${set ? ` (Set „${escapeHtml(set.name)}“)` : ''} — ${escapeHtml(bisTalentEdit.cls)}.</span>
    <span class="bis-tal-actions">
      <button type="button" class="btn btn-teal btn-sm" id="talentBisApplyBtn">Übernehmen &amp; zurück zum BiS-Planer</button>
      <button type="button" class="btn btn-ghost btn-sm" id="talentBisCancelBtn">Abbrechen</button>
    </span>`;
  const finish = (apply) => {
    const edit = bisTalentEdit;
    if (!edit) return;
    if (apply) bisDraft.talents = bisNormalizeTalents(talentBuild[edit.cls].points, bisDraft.classId);
    // Give the user their own Talent Builder state back.
    talentBuild[edit.cls] = edit.backup;
    saveTalentBuild(talentBuild);
    bisTalentEdit = null;
    bisSaveDraft();
    showPage('bis');
  };
  document.getElementById('talentBisApplyBtn').addEventListener('click', () => finish(true));
  document.getElementById('talentBisCancelBtn').addEventListener('click', () => finish(false));
}
