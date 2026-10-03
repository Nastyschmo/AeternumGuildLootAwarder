// Talent Builder page: talent calculator, Zauberbuch, Rassen,
// Klassenänderungen and Legacy-Perks tabs. Uses the game data from
// data/talentsforever.js.
//
// Classic (non-module) script — shares the global scope with the other
// js/*.js files; load order is set in index.html. Code that runs at load
// time may only use files loaded before this one.

// ---------------------------------------------------------------------
// Talent Builder — an interactive WoW: Forever talent point calculator
// for all 9 classes, in the site's own look instead of talentsforever
// .com's own styling. The talent tree data itself (trees, ranks, tier
// positions, prerequisites, tooltip text) is a straight, trimmed-down
// copy of talentsforever.com's public data export (CC BY 4.0 — see
// https://creativecommons.org/licenses/by/4.0/), so this stays working
// even if that site changes; the attribution link required by that
// license is in the page footer of this section, plus the "Talent
// Builder" nav link points there for anyone who wants their full site.
// Icons are loaded from Wowhead's public icon CDN (wow.zamimg.com) by
// the same icon names the game itself uses — not rehosted here.
// ---------------------------------------------------------------------
// TALENT_DATA, SPELLBOOK_DATA, SPELL_DESC_DATA, RACIAL_DATA,
// CLASS_RACIAL_DATA, CLASS_ABILITY_DATA and LEGACY_DATA live in
// data/talentsforever.js (loaded before this script).

// ---- Talent Builder logic ------------------------------------------
// Classic-WoW-style rules: each tree has up to 7 tiers (rows) of 4
// talents; a tier unlocks once (row-1)*5 points are already spent
// somewhere in that same tree, and a talent with a "req" needs that
// prerequisite talent maxed out first. Points available = level - 9
// (0 below level 10), same formula the real game uses.
const TALENT_CLASSES = Object.keys(TALENT_DATA);
const CLASS_COLORS = {
  Warrior: '#C79C6E', Paladin: '#F58CBA', Hunter: '#ABD473', Rogue: '#FFF569',
  Priest: '#F0F0F0', Shaman: '#2359FF', Mage: '#69CCF0', Warlock: '#9482C9', Druid: '#FF7D0A'
};
const CLASS_LABELS_DE = {
  Warrior: 'Krieger', Paladin: 'Paladin', Hunter: 'Jäger', Rogue: 'Schurke',
  Priest: 'Priester', Shaman: 'Schamane', Mage: 'Magier', Warlock: 'Hexenmeister', Druid: 'Druide'
};
const TALENT_BUILDER_STORAGE_KEY = 'rude-guild-talent-builder';
const TALENT_MAX_LEVEL = 60;
const TALENT_MIN_LEVEL = 10;

function talentPointsForLevel(level){
  return Math.max(0, Math.floor(level) - 9);
}

function emptyTalentBuild(){
  const build = {};
  TALENT_CLASSES.forEach(cls => { build[cls] = { level: TALENT_MAX_LEVEL, points: [{}, {}, {}] }; });
  return build;
}

function loadTalentBuild(){
  try{
    const raw = localStorage.getItem(TALENT_BUILDER_STORAGE_KEY);
    if (!raw) return emptyTalentBuild();
    const parsed = JSON.parse(raw);
    const build = emptyTalentBuild();
    TALENT_CLASSES.forEach(cls => {
      const saved = parsed && parsed[cls];
      if (!saved) return;
      if (typeof saved.level === 'number' && saved.level >= TALENT_MIN_LEVEL && saved.level <= TALENT_MAX_LEVEL){
        build[cls].level = saved.level;
      }
      if (Array.isArray(saved.points)){
        for (let i = 0; i < 3; i++){
          if (saved.points[i] && typeof saved.points[i] === 'object') build[cls].points[i] = Object.assign({}, saved.points[i]);
        }
      }
    });
    return build;
  }catch(e){
    return emptyTalentBuild();
  }
}

function saveTalentBuild(build){
  try{ localStorage.setItem(TALENT_BUILDER_STORAGE_KEY, JSON.stringify(build)); }catch(e){}
}

let talentBuild = null; // lazily loaded on first visit to the page
let talentBuilderClass = 'Warrior';

function ensureTalentBuildLoaded(){
  if (!talentBuild) talentBuild = loadTalentBuild();
}

function talentPointsSpentInTree(cls, treeIdx){
  const points = talentBuild[cls].points[treeIdx];
  return Object.values(points).reduce((sum, r) => sum + r, 0);
}

function talentPointsSpentTotal(cls){
  return [0, 1, 2].reduce((sum, i) => sum + talentPointsSpentInTree(cls, i), 0);
}

function talentTotalAvailable(cls){
  return talentPointsForLevel(talentBuild[cls].level);
}

function talentPointsRemaining(cls){
  return talentTotalAvailable(cls) - talentPointsSpentTotal(cls);
}

// Tier index is 0-based (row-1); needs (tier)*5 points already spent
// elsewhere in the tree to unlock, i.e. row 1 needs 0, row 2 needs 5, …
function isTierUnlocked(cls, treeIdx, row){
  return talentPointsSpentInTree(cls, treeIdx) >= (row - 1) * 5;
}

function talentRank(cls, treeIdx, talentName){
  return talentBuild[cls].points[treeIdx][talentName] || 0;
}

function findTalent(cls, treeIdx, talentName){
  const tree = TALENT_DATA[cls].trees[treeIdx];
  return tree.talents.find(t => t.name === talentName) || null;
}

// Can a point be added to this exact talent right now?
function canAddTalentPoint(cls, treeIdx, talentName){
  const talent = findTalent(cls, treeIdx, talentName);
  if (!talent) return false;
  if (talentPointsRemaining(cls) <= 0) return false;
  if (talentRank(cls, treeIdx, talentName) >= talent.max) return false;
  if (!isTierUnlocked(cls, treeIdx, talent.row)) return false;
  if (talent.req && talentRank(cls, treeIdx, talent.req) < findTalent(cls, treeIdx, talent.req).max) return false;
  return true;
}

// Can the last point on this talent be removed right now? Blocked if
// another talent in the tree depends on it directly (req) with any
// points spent, or if removing it would drop the tree's total below
// what's needed to keep some OTHER already-invested tier unlocked.
function canRemoveTalentPoint(cls, treeIdx, talentName){
  const rank = talentRank(cls, treeIdx, talentName);
  if (rank <= 0) return false;
  const tree = TALENT_DATA[cls].trees[treeIdx];
  const talent = findTalent(cls, treeIdx, talentName);

  // Nothing that requires this talent (at any rank) may still be invested.
  const isMaxed = rank >= talent.max;
  if (isMaxed){
    const dependent = tree.talents.find(t => t.req === talentName && talentRank(cls, treeIdx, t.name) > 0);
    if (dependent) return false;
  }

  // Simulate the removal and check every currently-invested talent's
  // tier is still unlocked afterwards.
  const spentAfter = talentPointsSpentInTree(cls, treeIdx) - 1;
  const stillOk = tree.talents.every(t => {
    const r = talentRank(cls, treeIdx, t.name) - (t.name === talentName ? 1 : 0);
    if (r <= 0) return true;
    return spentAfter >= (t.row - 1) * 5;
  });
  return stillOk;
}

function addTalentPoint(cls, treeIdx, talentName){
  if (!canAddTalentPoint(cls, treeIdx, talentName)) return false;
  const points = talentBuild[cls].points[treeIdx];
  points[talentName] = (points[talentName] || 0) + 1;
  saveTalentBuild(talentBuild);
  return true;
}

function removeTalentPoint(cls, treeIdx, talentName){
  if (!canRemoveTalentPoint(cls, treeIdx, talentName)) return false;
  const points = talentBuild[cls].points[treeIdx];
  points[talentName] = (points[talentName] || 0) - 1;
  if (points[talentName] <= 0) delete points[talentName];
  saveTalentBuild(talentBuild);
  return true;
}

function resetTalentTree(cls, treeIdx){
  talentBuild[cls].points[treeIdx] = {};
  saveTalentBuild(talentBuild);
}

function resetTalentClass(cls){
  talentBuild[cls].points = [{}, {}, {}];
  saveTalentBuild(talentBuild);
}

function setTalentLevel(cls, level){
  level = Math.max(TALENT_MIN_LEVEL, Math.min(TALENT_MAX_LEVEL, Math.round(level)));
  talentBuild[cls].level = level;
  // Dropping the level below what's already spent needs to give up
  // points somewhere — remove the highest-tier, most recently reachable
  // ones first (simplest well-defined rule: repeatedly strip whichever
  // spent talent has the highest row, breaking ties by tree order).
  let guard = 0;
  while (talentPointsSpentTotal(cls) > talentPointsForLevel(level) && guard < 1000){
    guard++;
    /** @type {{ treeIdx: number, name: string, row: number } | null} */
    let best = null;
    for (let treeIdx = 0; treeIdx < 3; treeIdx++){
      const tree = TALENT_DATA[cls].trees[treeIdx];
      tree.talents.forEach(t => {
        if (talentRank(cls, treeIdx, t.name) > 0){
          if (!best || t.row > best.row) best = { treeIdx, name: t.name, row: t.row };
        }
      });
    }
    if (!best) break;
    const points = talentBuild[cls].points[best.treeIdx];
    points[best.name] -= 1;
    if (points[best.name] <= 0) delete points[best.name];
  }
  saveTalentBuild(talentBuild);
}

// Straight-line/elbow connector paths (SVG "M..V..H..V..") between a
// talent and its prerequisite, computed purely from row/col grid math
// (no DOM measurement needed) using the same fixed cell size the CSS
// grid uses.
const TALENT_CELL = 64;
const TALENT_GAP = 22;
function talentCellCenterX(col){ return (col - 1) * (TALENT_CELL + TALENT_GAP) + TALENT_CELL / 2; }
function talentCellTopY(row){ return (row - 1) * (TALENT_CELL + TALENT_GAP); }
function talentCellBottomY(row){ return talentCellTopY(row) + TALENT_CELL; }

function talentConnectorPath(parentRow, parentCol, childRow, childCol){
  const x1 = talentCellCenterX(parentCol), y1 = talentCellBottomY(parentRow);
  const x2 = talentCellCenterX(childCol), y2 = talentCellTopY(childRow);
  if (x1 === x2) return `M${x1} ${y1} V${y2}`;
  const midY = y1 + (y2 - y1) / 2;
  return `M${x1} ${y1} V${midY} H${x2} V${y2}`;
}

function talentIconUrl(icon, size){
  return `https://wow.zamimg.com/images/wow/icons/${size || 'medium'}/${icon}.jpg`;
}

function renderTalentClassSelector(){
  if (!els.talentClassSelector) return;
  els.talentClassSelector.innerHTML = TALENT_CLASSES.map(cls => {
    const active = cls === talentBuilderClass ? ' active' : '';
    const color = CLASS_COLORS[cls] || 'var(--gold)';
    return `<button type="button" class="talent-class-btn${active}" data-class="${cls}" style="--class-color:${color}">
      <img src="${talentIconUrl(TALENT_DATA[cls].icon)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
      <span>${escapeHtml(CLASS_LABELS_DE[cls] || cls)}</span>
    </button>`;
  }).join('');
  els.talentClassSelector.querySelectorAll('[data-class]').forEach(btn => {
    btn.addEventListener('click', () => {
      talentBuilderClass = btn.getAttribute('data-class');
      renderTalentBuilderPage();
    });
  });
}

function talentTooltipHtml(cls, treeIdx, talent){
  const rank = talentRank(cls, treeIdx, talent.name);
  const nextRankIdx = Math.min(rank, talent.max - 1);
  const descLine = talent.desc && talent.desc[nextRankIdx] ? talent.desc[nextRankIdx] : '';
  const rankLabel = rank >= talent.max
    ? `Rang ${talent.max}/${talent.max} (maximal)`
    : `Rang ${rank}/${talent.max}${rank > 0 ? ' — nächster Rang:' : ''}`;
  let html = `<div class="talent-tip-title">${escapeHtml(talent.name)}</div>`;
  html += `<div class="talent-tip-rank">${escapeHtml(rankLabel)}</div>`;
  if (descLine) html += `<div class="talent-tip-desc">${escapeHtml(descLine)}</div>`;
  if (talent.cost) html += `<div class="talent-tip-cost">${escapeHtml(talent.cost)}</div>`;
  if (talent.req){
    const reqTalent = findTalent(cls, treeIdx, talent.req);
    const reqOk = reqTalent && talentRank(cls, treeIdx, talent.req) >= reqTalent.max;
    html += `<div class="talent-tip-req ${reqOk ? 'ok' : ''}">Benötigt: ${escapeHtml(talent.req)} (max)</div>`;
  }
  return html;
}

function showTalentTooltip(evt, cls, treeIdx, talent){
  if (!els.talentTooltip) return;
  els.talentTooltip.innerHTML = talentTooltipHtml(cls, treeIdx, talent);
  els.talentTooltip.classList.remove('hidden');
  positionTalentTooltip(evt);
}
function positionTalentTooltip(evt){
  if (!els.talentTooltip || els.talentTooltip.classList.contains('hidden')) return;
  const pad = 16;
  let x = evt.clientX + pad, y = evt.clientY + pad;
  const rect = els.talentTooltip.getBoundingClientRect();
  if (x + rect.width > window.innerWidth) x = evt.clientX - rect.width - pad;
  if (y + rect.height > window.innerHeight) y = evt.clientY - rect.height - pad;
  els.talentTooltip.style.left = Math.max(8, x) + 'px';
  els.talentTooltip.style.top = Math.max(8, y) + 'px';
}
function hideTalentTooltip(){
  if (els.talentTooltip) els.talentTooltip.classList.add('hidden');
}

function renderTalentTree(cls, treeIdx){
  const tree = TALENT_DATA[cls].trees[treeIdx];
  const spent = talentPointsSpentInTree(cls, treeIdx);

  const connectors = [];
  const cells = tree.talents.map(t => {
    const rank = talentRank(cls, treeIdx, t.name);
    const unlocked = isTierUnlocked(cls, treeIdx, t.row);
    const canAdd = canAddTalentPoint(cls, treeIdx, t.name);
    const maxed = rank >= t.max;
    const cls_ = 'talent-node' + (rank > 0 ? ' has-points' : '') + (maxed ? ' maxed' : '') + (!unlocked ? ' locked' : '') + (canAdd ? ' can-add' : '');
    if (t.req){
      const reqTalent = findTalent(cls, treeIdx, t.req);
      if (reqTalent){
        const active = rank > 0;
        connectors.push(`<path d="${talentConnectorPath(reqTalent.row, reqTalent.col, t.row, t.col)}" class="talent-connector${active ? ' active' : ''}"/>`);
      }
    }
    const left = talentCellCenterX(t.col) - TALENT_CELL / 2;
    const top = talentCellTopY(t.row);
    return `<button type="button" class="${cls_}" style="left:${left}px;top:${top}px;width:${TALENT_CELL}px;height:${TALENT_CELL}px"
      data-tree="${treeIdx}" data-talent="${escapeHtml(t.name)}" aria-label="${escapeHtml(t.name)}">
      <img src="${talentIconUrl(t.icon)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
      <span class="talent-rank-pip">${rank}/${t.max}</span>
    </button>`;
  }).join('');

  const gridW = 4 * TALENT_CELL + 3 * TALENT_GAP;
  const gridH = 7 * TALENT_CELL + 6 * TALENT_GAP;

  return `<div class="talent-tree-card">
    <div class="talent-tree-head">
      <img src="${talentIconUrl(tree.icon)}" alt="" class="talent-tree-icon" loading="lazy" onerror="this.style.visibility='hidden'">
      <div>
        <h3>${escapeHtml(tree.name)}</h3>
        <span class="talent-tree-points">${spent} Punkte</span>
      </div>
      <button type="button" class="btn btn-ghost btn-sm talent-reset-btn" data-reset-tree="${treeIdx}">Zurücksetzen</button>
    </div>
    <div class="talent-tree-grid" style="width:${gridW}px;height:${gridH}px">
      <svg class="talent-connectors" viewBox="0 0 ${gridW} ${gridH}" width="${gridW}" height="${gridH}">${connectors.join('')}</svg>
      ${cells}
    </div>
  </div>`;
}

function renderTalentBuilder(){
  ensureTalentBuildLoaded();
  if (!els.talentTreesContainer) return;
  bisRenderTalentBanner(); // "editing talents for a BiS set" (js/bis-talents.js)
  renderTalentClassSelector();

  const cls = talentBuilderClass;
  const level = talentBuild[cls].level;
  if (els.talentLevelInput) els.talentLevelInput.value = level;
  if (els.talentLevelLabel) els.talentLevelLabel.textContent = 'Stufe ' + level;
  if (els.talentPointsRemaining){
    const remaining = talentPointsRemaining(cls);
    els.talentPointsRemaining.textContent = remaining + ' / ' + talentTotalAvailable(cls) + ' Punkte übrig';
    els.talentPointsRemaining.classList.toggle('talent-points-empty', remaining === 0);
  }

  els.talentTreesContainer.innerHTML = [0, 1, 2].map(i => renderTalentTree(cls, i)).join('');

  els.talentTreesContainer.querySelectorAll('.talent-node').forEach(btn => {
    const treeIdx = Number(btn.getAttribute('data-tree'));
    const name = btn.getAttribute('data-talent');
    btn.addEventListener('click', (evt) => {
      evt.preventDefault();
      if (addTalentPoint(cls, treeIdx, name)) renderTalentBuilder();
    });
    btn.addEventListener('contextmenu', (evt) => {
      evt.preventDefault();
      if (removeTalentPoint(cls, treeIdx, name)) renderTalentBuilder();
    });
    btn.addEventListener('mouseenter', (evt) => showTalentTooltip(evt, cls, treeIdx, findTalent(cls, treeIdx, name)));
    btn.addEventListener('mousemove', positionTalentTooltip);
    btn.addEventListener('mouseleave', hideTalentTooltip);
  });
  els.talentTreesContainer.querySelectorAll('[data-reset-tree]').forEach(btn => {
    btn.addEventListener('click', () => {
      resetTalentTree(cls, Number(btn.getAttribute('data-reset-tree')));
      renderTalentBuilder();
    });
  });
}

function initTalentBuilder(){
  if (els.talentLevelInput){
    els.talentLevelInput.addEventListener('input', () => {
      setTalentLevel(talentBuilderClass, Number(els.talentLevelInput.value));
      renderTalentBuilder();
    });
  }
  if (els.talentResetAllBtn){
    els.talentResetAllBtn.addEventListener('click', () => {
      resetTalentClass(talentBuilderClass);
      renderTalentBuilder();
    });
  }
  renderTalentSubnav();
  const legacyResetAllBtn = document.getElementById('legacyResetAllBtn');
  if (legacyResetAllBtn){
    legacyResetAllBtn.addEventListener('click', () => {
      ensureLegacyBuildLoaded();
      resetLegacyAll();
      renderLegacyPanel();
    });
  }
}

// ---- Talent Builder: additional data tabs (Spellbook / Racials /
// Class ability changes / Legacy perks) -------------------------------
const TALENT_SUBTABS = [
  { id: 'talents', label: 'Talente' },
  { id: 'spellbook', label: 'Zauberbuch' },
  { id: 'racials', label: 'Rassen' },
  { id: 'abilities', label: 'Klassenänderungen' },
  { id: 'legacy', label: 'Legacy-Perks' }
];
let talentActiveSubtab = 'talents';
let racialsFaction = 'Alliance';
let racialsRaceIdx = 0;
let spellbookEntries = []; // rebuilt on each renderSpellbookPanel(), referenced by data-entry-idx

function renderTalentSubnav(){
  if (!els.talentSubnav) return;
  els.talentSubnav.innerHTML = TALENT_SUBTABS.map(t =>
    `<button type="button" class="talent-subtab-btn${t.id === talentActiveSubtab ? ' active' : ''}" data-subtab="${t.id}">${escapeHtml(t.label)}</button>`
  ).join('');
  els.talentSubnav.querySelectorAll('[data-subtab]').forEach(btn => {
    btn.addEventListener('click', () => {
      talentActiveSubtab = btn.getAttribute('data-subtab');
      renderTalentSubnav();
      renderTalentBuilderPage();
    });
  });
}

function renderTalentBuilderPage(){
  ['talents', 'spellbook', 'racials', 'abilities', 'legacy'].forEach(id => {
    const panel = document.getElementById('talentPanel-' + id);
    if (panel) panel.classList.toggle('hidden', id !== talentActiveSubtab);
  });
  if (els.talentClassSelector){
    const showClassSelector = talentActiveSubtab === 'talents' || talentActiveSubtab === 'spellbook' || talentActiveSubtab === 'abilities';
    els.talentClassSelector.classList.toggle('hidden', !showClassSelector);
  }
  const cls = talentBuilderClass;
  if (talentActiveSubtab === 'talents') renderTalentBuilder();
  else if (talentActiveSubtab === 'spellbook') renderSpellbookPanel(cls);
  else if (talentActiveSubtab === 'racials') renderRacialsPanel();
  else if (talentActiveSubtab === 'abilities') renderClassAbilitiesPanel(cls);
  else if (talentActiveSubtab === 'legacy') renderLegacyPanel();
}

// ---- Spellbook ---------------------------------------------------
function groupSpellRanks(list){
  const order = [];
  const byName = {};
  (list || []).forEach(([name, rank]) => {
    if (!byName[name]){ byName[name] = []; order.push(name); }
    byName[name].push(rank || '');
  });
  return order.map(name => ({ name, ranks: byName[name] }));
}

function spellTooltipHtml(cls, name, ranks){
  const topRank = ranks[ranks.length - 1];
  const entry = SPELL_DESC_DATA[`${cls}|${name}|${topRank}`] || null;
  let html = `<div class="talent-tip-title">${escapeHtml(name)}</div>`;
  html += `<div class="talent-tip-rank">${ranks.length > 1 ? `${ranks.length} Ränge` : (topRank || 'Ein Rang')}</div>`;
  if (entry && entry.d) html += `<div class="talent-tip-desc">${escapeHtml(entry.d)}</div>`;
  if (entry && entry.l && entry.l.length){
    html += `<div class="talent-tip-cost">${entry.l.map(pair => escapeHtml((pair[0] || '') + (pair[1] ? ' · ' + pair[1] : ''))).join('<br>')}</div>`;
  }
  if (entry && entry.lv) html += `<div class="talent-tip-req ok">${escapeHtml(entry.lv)}</div>`;
  if (!entry || (!entry.d && !(entry.l && entry.l.length))) html += `<div class="talent-tip-desc">Keine Beschreibung verfügbar.</div>`;
  return html;
}

function renderSpellbookPanel(cls){
  const container = document.getElementById('spellbookContainer');
  if (!container) return;
  const book = SPELLBOOK_DATA[cls];
  if (!book){ container.innerHTML = ''; return; }
  const sections = [{ name: 'Allgemein', spells: book.general }].concat(book.tabs);
  spellbookEntries = [];
  container.innerHTML = sections.map(sec => {
    const grouped = groupSpellRanks(sec.spells);
    const items = grouped.map(g => {
      const idx = spellbookEntries.length;
      spellbookEntries.push(g);
      const icon = book.icons[g.name];
      return `<button type="button" class="spellbook-entry" data-entry-idx="${idx}">
        ${icon ? `<img src="${talentIconUrl(icon)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : '<span class="spellbook-noicon"></span>'}
        <span class="spellbook-name">${escapeHtml(g.name)}</span>
        ${g.ranks.length > 1 ? `<span class="spellbook-rank-count">${g.ranks.length}×</span>` : ''}
      </button>`;
    }).join('');
    return `<div class="spellbook-section"><h3>${escapeHtml(sec.name)}</h3><div class="spellbook-grid">${items}</div></div>`;
  }).join('');
  container.querySelectorAll('[data-entry-idx]').forEach(btn => {
    const entry = spellbookEntries[Number(btn.getAttribute('data-entry-idx'))];
    if (!entry) return;
    btn.addEventListener('mouseenter', (evt) => {
      if (!els.talentTooltip) return;
      els.talentTooltip.innerHTML = spellTooltipHtml(cls, entry.name, entry.ranks);
      els.talentTooltip.classList.remove('hidden');
      positionTalentTooltip(evt);
    });
    btn.addEventListener('mousemove', positionTalentTooltip);
    btn.addEventListener('mouseleave', hideTalentTooltip);
  });
}

// ---- Racials -------------------------------------------------------
function raceLabelDe(name){
  const map = { Human: 'Mensch', Dwarf: 'Zwerg', 'Night Elf': 'Nachtelf', Gnome: 'Gnom',
    Orc: 'Orc', Undead: 'Untoter', Tauren: 'Taure', Troll: 'Troll' };
  return map[name] || name;
}

function renderRacialsPanel(){
  const factionEl = document.getElementById('racialsFactionToggle');
  const raceEl = document.getElementById('racialsRaceSelector');
  const container = document.getElementById('racialsContainer');
  if (!factionEl || !raceEl || !container) return;

  factionEl.innerHTML = ['Alliance', 'Horde'].map(f =>
    `<button type="button" class="racials-faction-btn${f === racialsFaction ? ' active' : ''}" data-faction="${f}">${f === 'Alliance' ? 'Allianz' : 'Horde'}</button>`
  ).join('');
  factionEl.querySelectorAll('[data-faction]').forEach(btn => {
    btn.addEventListener('click', () => {
      racialsFaction = btn.getAttribute('data-faction');
      racialsRaceIdx = 0;
      renderRacialsPanel();
    });
  });

  const races = RACIAL_DATA[racialsFaction] || [];
  raceEl.innerHTML = races.map((r, idx) =>
    `<button type="button" class="racials-race-btn${idx === racialsRaceIdx ? ' active' : ''}" data-race-idx="${idx}">
      <img src="${talentIconUrl(r.icon)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
      <span>${escapeHtml(raceLabelDe(r.race))}</span>
    </button>`
  ).join('');
  raceEl.querySelectorAll('[data-race-idx]').forEach(btn => {
    btn.addEventListener('click', () => {
      racialsRaceIdx = Number(btn.getAttribute('data-race-idx'));
      renderRacialsPanel();
    });
  });

  const race = races[racialsRaceIdx];
  if (!race){ container.innerHTML = ''; return; }
  let html = `<div class="racials-panel-head">
    <img src="${talentIconUrl(race.icon)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
    <div><h3>${escapeHtml(raceLabelDe(race.race))}</h3><span>Spielbar als: ${race.classes.map(c => escapeHtml(CLASS_LABELS_DE[c] || c)).join(', ')}</span></div>
  </div>`;
  html += `<div class="ability-card-grid">${(race.abilities || []).map(([name, desc, icon]) => `
    <div class="ability-card">
      <img src="${talentIconUrl(icon)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
      <div class="ability-card-body"><h4>${escapeHtml(name)}</h4><p>${escapeHtml(desc)}</p></div>
    </div>`).join('')}</div>`;

  const cls = talentBuilderClass;
  const classRacial = CLASS_RACIAL_DATA[cls];
  const classRacialSpells = classRacial && classRacial.races ? classRacial.races[race.race] : null;
  if (classRacialSpells && classRacialSpells.length){
    html += `<p class="racials-note">Klassen-spezifische Rassenzauber (${escapeHtml(CLASS_LABELS_DE[cls] || cls)}):</p>`;
    html += `<div class="ability-card-grid">${classRacialSpells.map(([name, desc, icon]) => `
      <div class="ability-card">
        <img src="${talentIconUrl(icon)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
        <div class="ability-card-body"><h4>${escapeHtml(name)}</h4><p>${escapeHtml(desc)}</p></div>
      </div>`).join('')}</div>`;
  }
  container.innerHTML = html;
}

// ---- Class ability changes ------------------------------------------
function renderClassAbilitiesPanel(cls){
  const container = document.getElementById('classAbilitiesContainer');
  if (!container) return;
  const list = CLASS_ABILITY_DATA[cls] || [];
  if (!list.length){ container.innerHTML = '<div class="ability-card-empty">Keine bekannten Änderungen für diese Klasse.</div>'; return; }
  container.innerHTML = `<div class="ability-card-grid">${list.map(([name, desc, icon]) => `
    <div class="ability-card">
      <img src="${talentIconUrl(icon)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
      <div class="ability-card-body"><h4>${escapeHtml(name)}</h4><p>${escapeHtml(desc)}</p></div>
    </div>`).join('')}</div>`;
}

// ---- Legacy perks ------------------------------------------------
// Account-wide, not tied to class or level: 3 trees, a fixed point
// pool (LEGACY_DATA.points), each perk gated by a flat "points already
// spent in this tree" threshold (its `gate`) instead of the talent
// tree's row-based formula, plus an optional `req` prerequisite exactly
// like talents. A few slots are unimplemented ("placeholder": true) and
// are shown dimmed and non-interactive.
const LEGACY_STORAGE_KEY = 'rude-guild-legacy-builder';

function emptyLegacyBuild(){
  return { points: LEGACY_DATA.trees.map(() => ({})) };
}
function loadLegacyBuild(){
  try{
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return emptyLegacyBuild();
    const parsed = JSON.parse(raw);
    const build = emptyLegacyBuild();
    if (Array.isArray(parsed && parsed.points)){
      LEGACY_DATA.trees.forEach((t, i) => {
        if (parsed.points[i] && typeof parsed.points[i] === 'object') build.points[i] = Object.assign({}, parsed.points[i]);
      });
    }
    return build;
  }catch(e){ return emptyLegacyBuild(); }
}
function saveLegacyBuild(){ try{ localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(legacyBuild)); }catch(e){} }

let legacyBuild = null;
function ensureLegacyBuildLoaded(){ if (!legacyBuild) legacyBuild = loadLegacyBuild(); }

function findLegacyPerk(treeIdx, name){
  return LEGACY_DATA.trees[treeIdx].perks.find(p => p.name === name) || null;
}
function legacyRank(treeIdx, name){ return legacyBuild.points[treeIdx][name] || 0; }
function legacyPointsSpentInTree(treeIdx){
  return Object.values(legacyBuild.points[treeIdx]).reduce((s, r) => s + r, 0);
}
function legacyPointsSpentTotal(){
  return LEGACY_DATA.trees.reduce((s, _, i) => s + legacyPointsSpentInTree(i), 0);
}
function legacyPointsRemaining(){ return LEGACY_DATA.points - legacyPointsSpentTotal(); }

function isLegacyPerkUnlocked(treeIdx, perk){ return legacyPointsSpentInTree(treeIdx) >= (perk.gate || 0); }

function canAddLegacyPoint(treeIdx, name){
  const perk = findLegacyPerk(treeIdx, name);
  if (!perk || perk.placeholder) return false;
  if (legacyPointsRemaining() <= 0) return false;
  if (legacyRank(treeIdx, name) >= perk.max) return false;
  if (!isLegacyPerkUnlocked(treeIdx, perk)) return false;
  if (perk.req){
    const reqPerk = findLegacyPerk(treeIdx, perk.req);
    if (!reqPerk || legacyRank(treeIdx, perk.req) < reqPerk.max) return false;
  }
  return true;
}

function canRemoveLegacyPoint(treeIdx, name){
  const rank = legacyRank(treeIdx, name);
  if (rank <= 0) return false;
  const tree = LEGACY_DATA.trees[treeIdx];
  const perk = findLegacyPerk(treeIdx, name);
  const isMaxed = rank >= perk.max;
  if (isMaxed){
    const dependent = tree.perks.find(p => p.req === name && legacyRank(treeIdx, p.name) > 0);
    if (dependent) return false;
  }
  const spentAfter = legacyPointsSpentInTree(treeIdx) - 1;
  return tree.perks.every(p => {
    const r = legacyRank(treeIdx, p.name) - (p.name === name ? 1 : 0);
    if (r <= 0) return true;
    return spentAfter >= (p.gate || 0);
  });
}

function addLegacyPoint(treeIdx, name){
  if (!canAddLegacyPoint(treeIdx, name)) return false;
  const points = legacyBuild.points[treeIdx];
  points[name] = (points[name] || 0) + 1;
  saveLegacyBuild();
  return true;
}
function removeLegacyPoint(treeIdx, name){
  if (!canRemoveLegacyPoint(treeIdx, name)) return false;
  const points = legacyBuild.points[treeIdx];
  points[name] = (points[name] || 0) - 1;
  if (points[name] <= 0) delete points[name];
  saveLegacyBuild();
  return true;
}
function resetLegacyTree(treeIdx){ legacyBuild.points[treeIdx] = {}; saveLegacyBuild(); }
function resetLegacyAll(){ legacyBuild.points = LEGACY_DATA.trees.map(() => ({})); saveLegacyBuild(); }

function legacyTooltipHtml(treeIdx, perk){
  const rank = legacyRank(treeIdx, perk.name);
  const nextRankIdx = Math.min(rank, perk.max - 1);
  const descLine = perk.ranks && perk.ranks[nextRankIdx] ? perk.ranks[nextRankIdx] : '';
  const rankLabel = rank >= perk.max ? `Rang ${perk.max}/${perk.max} (maximal)` : `Rang ${rank}/${perk.max}${rank > 0 ? ' — nächster Rang:' : ''}`;
  let html = `<div class="talent-tip-title">${escapeHtml(perk.name)}</div>`;
  html += `<div class="talent-tip-rank">${escapeHtml(rankLabel)}</div>`;
  if (descLine) html += `<div class="talent-tip-desc">${escapeHtml(descLine)}</div>`;
  if (perk.gate) html += `<div class="talent-tip-cost">Benötigt ${perk.gate} Punkte in diesem Baum</div>`;
  if (perk.req) html += `<div class="talent-tip-req ${legacyRank(treeIdx, perk.req) >= (findLegacyPerk(treeIdx, perk.req) || {}).max ? 'ok' : ''}">Benötigt: ${escapeHtml(perk.req)} (max)</div>`;
  return html;
}

function renderLegacyTree(treeIdx){
  const tree = LEGACY_DATA.trees[treeIdx];
  const spent = legacyPointsSpentInTree(treeIdx);
  const connectors = [];
  const cells = tree.perks.map(p => {
    const rank = legacyRank(treeIdx, p.name);
    const unlocked = isLegacyPerkUnlocked(treeIdx, p);
    const canAdd = canAddLegacyPoint(treeIdx, p.name);
    const maxed = rank >= p.max;
    const cls_ = 'talent-node' + (p.placeholder ? ' legacy-placeholder' : '') + (rank > 0 ? ' has-points' : '') + (maxed ? ' maxed' : '') + (!unlocked ? ' locked' : '') + (canAdd ? ' can-add' : '');
    if (p.req){
      const reqPerk = findLegacyPerk(treeIdx, p.req);
      if (reqPerk) connectors.push(`<path d="${talentConnectorPath(reqPerk.row, reqPerk.col, p.row, p.col)}" class="talent-connector${rank > 0 ? ' active' : ''}"/>`);
    }
    const left = talentCellCenterX(p.col) - TALENT_CELL / 2;
    const top = talentCellTopY(p.row);
    return `<button type="button" class="${cls_}" style="left:${left}px;top:${top}px;width:${TALENT_CELL}px;height:${TALENT_CELL}px"
      data-tree="${treeIdx}" data-perk="${escapeHtml(p.name)}" aria-label="${escapeHtml(p.name)}"${p.placeholder ? ' disabled' : ''}>
      <img src="${talentIconUrl(p.icon)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
      <span class="talent-rank-pip">${rank}/${p.max}</span>
    </button>`;
  }).join('');
  const gridW = 4 * TALENT_CELL + 3 * TALENT_GAP;
  const gridH = 4 * TALENT_CELL + 3 * TALENT_GAP;
  return `<div class="talent-tree-card">
    <div class="talent-tree-head">
      <img src="${talentIconUrl(tree.icon)}" alt="" class="talent-tree-icon" loading="lazy" onerror="this.style.visibility='hidden'">
      <div><h3>${escapeHtml(tree.name)}</h3><span class="talent-tree-points">${spent} Punkte</span></div>
      <button type="button" class="btn btn-ghost btn-sm talent-reset-btn" data-reset-legacy-tree="${treeIdx}">Zurücksetzen</button>
    </div>
    <div class="talent-tree-grid" style="width:${gridW}px;height:${gridH}px">
      <svg class="talent-connectors" viewBox="0 0 ${gridW} ${gridH}" width="${gridW}" height="${gridH}">${connectors.join('')}</svg>
      ${cells}
    </div>
  </div>`;
}

function renderLegacyPanel(){
  ensureLegacyBuildLoaded();
  const container = document.getElementById('legacyTreesContainer');
  if (!container) return;
  const remainingEl = document.getElementById('legacyPointsRemaining');
  if (remainingEl){
    const remaining = legacyPointsRemaining();
    remainingEl.textContent = remaining + ' / ' + LEGACY_DATA.points + ' Punkte übrig';
    remainingEl.classList.toggle('talent-points-empty', remaining === 0);
  }
  container.innerHTML = LEGACY_DATA.trees.map((_, i) => renderLegacyTree(i)).join('');
  container.querySelectorAll('.talent-node:not(.legacy-placeholder)').forEach(btn => {
    const treeIdx = Number(btn.getAttribute('data-tree'));
    const name = btn.getAttribute('data-perk');
    btn.addEventListener('click', (evt) => {
      evt.preventDefault();
      if (addLegacyPoint(treeIdx, name)) renderLegacyPanel();
    });
    btn.addEventListener('contextmenu', (evt) => {
      evt.preventDefault();
      if (removeLegacyPoint(treeIdx, name)) renderLegacyPanel();
    });
    btn.addEventListener('mouseenter', (evt) => {
      if (!els.talentTooltip) return;
      els.talentTooltip.innerHTML = legacyTooltipHtml(treeIdx, findLegacyPerk(treeIdx, name));
      els.talentTooltip.classList.remove('hidden');
      positionTalentTooltip(evt);
    });
    btn.addEventListener('mousemove', positionTalentTooltip);
    btn.addEventListener('mouseleave', hideTalentTooltip);
  });
  container.querySelectorAll('[data-reset-legacy-tree]').forEach(btn => {
    btn.addEventListener('click', () => {
      resetLegacyTree(Number(btn.getAttribute('data-reset-legacy-tree')));
      renderLegacyPanel();
    });
  });
}
