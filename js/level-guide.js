// Levelguide: where to quest at which level, and the dungeon quests —
// with the whole quest chain (all steps from the first quest) and where
// each step starts. Data: data/forever/quests.json, built daily from
// QuestieDB's Forever data by scripts/forever-data/quests.mjs (Horde and
// neutral quests only — the guild plays Horde). Quest / NPC / zone names
// stay English (game data, like spells and items).
//
//  - "Mein Level" and "Mein Volk" (kept in localStorage) mark the zones
//    and dungeons that fit; with a race picked, other races' starting
//    zones don't fit and quests only other races can take are hidden. A
//    search finds quests, NPCs and zones.
//  - Every quest shows what to do (Blizzard's objective text, English)
//    and its targets: NPCs to kill, objects to use, items to collect
//    with who drops them, places to explore — with coordinates.
//  - Dungeons: per instance its quests by required level — quest giver
//    with zone + coordinates ("/way x y" to copy for TomTom), chain steps,
//    follow-up, rewards (item names with tooltip once the item data is
//    loaded).
//  - Zonen: world zones by level range, their quest hubs (quest givers
//    with the most quests) and quests.

const LG_LEVEL_KEY = 'rude-levelguide-level';
const LG_RACE_KEY = 'rude-levelguide-race';
/** Horde races (ids as in quests.json) with their German names. */
const LG_RACES = { orc: ['Orc', 'Orcs'], troll: ['Troll', 'Trolle'], tauren: ['Tauren', 'Tauren'], undead: ['Untoter', 'Untote'] };
/** @type {{ build: string, quests: Record<string, any>, npcs: Record<string, any[]>, objs: Record<string, any[]>, items: Record<string, any[]>, zones: Record<string, any> } | null} */
let lgData = null;
let lgLoading = false;
let lgError = '';
let lgTab = 'dungeons';
let lgQuery = '';
/** Expanded cards / chains. @type {Set<string>} */
const lgOpen = new Set();
let lgRace = (() => { try { const r = localStorage.getItem(LG_RACE_KEY) || ''; return LG_RACES[r] ? r : ''; } catch (e){ return ''; } })();
/** "Orcs & Trolle". @param {string[]} races */
const lgRacesLabel = races => races.map(r => (LG_RACES[r] || [r, r])[1]).join(' & ');
/** Can my race take this quest? (No race picked: all.) @param {any} q */
const lgForMe = q => !lgRace || !q.ra || q.ra.includes(lgRace);
let lgLevel = (() => { try { return Math.max(1, Math.min(60, Number(localStorage.getItem(LG_LEVEL_KEY)) || 0)); } catch (e){ return 0; } })();

function lgLoad(){
  if (lgData || lgLoading) return;
  lgLoading = true;
  fetch('data/forever/quests.json').then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
    .then(d => { lgData = d; lgError = ''; })
    .catch(() => { lgError = 'Die Questdaten konnten nicht geladen werden.'; })
    .then(() => { lgLoading = false; if (currentPage === 'levelguide') renderLevelGuidePage(); });
}

/** Zone name. @param {number} z */
const lgZoneName = z => ((lgData.zones || {})[z] || {}).n || '';
/** Grouping key (the same instance can carry several zone ids). @param {string} n */
const lgNameKey = n => n.toLowerCase().replace(/[^a-z0-9]/g, '');
/** Where an NPC / object stands: name, sub name, zone, coordinates. @param {any[]} ref */
function lgWhereHtml(ref, kind){
  if (!ref) return '<span class="bis-item-meta">unbekannt</span>';
  const [name, z, x, y, sub] = ref;
  const coords = x > 0 && y > 0 ? `${x.toFixed(1)}, ${y.toFixed(1)}` : '';
  return `<span class="lg-who">${kind === 'o' ? '<span class="bis-item-meta">Objekt:</span> ' : ''}<b>${escapeHtml(name)}</b>${sub ? ` <span class="bis-item-meta">&lt;${escapeHtml(sub)}&gt;</span>` : ''}</span>
    <span class="lg-where">${escapeHtml(lgZoneName(z) || '?')}${coords ? ` <span class="lg-coords">${coords}</span> <button type="button" class="lg-way" data-lg-way="/way ${x.toFixed(1)} ${y.toFixed(1)}" title="TomTom-Wegpunkt kopieren (im selben Gebiet eingeben)">/way</button>` : ''}</span>`;
}
/** Quest start line. @param {any} q */
function lgStartHtml(q){
  if (!q.s) return '<span class="bis-item-meta">Start unbekannt</span>';
  if (q.s[0] === 'n') return lgWhereHtml(lgData.npcs[q.s[1]], 'n');
  if (q.s[0] === 'o') return lgWhereHtml(lgData.objs[q.s[1]], 'o');
  return `<span class="lg-who"><span class="bis-item-meta">Startet durch Item:</span> <b>${escapeHtml(q.s[2] || `#${q.s[1]}`)}</b></span>`;
}
/** Item chip of a reward. @param {number} id */
function lgItemHtml(id){
  const it = lgData.items[id];
  if (!it) return '';
  const color = ITEM_QUALITY_COLORS[BIS_QUALITY_KEYS[it[1]] || 'COMMON'];
  const icon = talentIconUrl(it[2] || 'inv_misc_questionmark', 'medium');
  return `<span class="lg-item" data-item-id="${id}"><img src="${escapeHtml(icon)}" alt="" width="18" height="18" loading="lazy" onerror="this.style.visibility='hidden'"><span style="color:${color}">${escapeHtml(it[0])}</span></span>`;
}
/** Class badges of a class quest. @param {any} q */
const lgClassHtml = q => (q.c || []).map(c => CLASS_MAP[c] ? `<span class="lg-class" style="color:${CLASS_MAP[c].color}">${escapeHtml(CLASS_MAP[c].label)}</span>` : '').join('');

/**
 * All quests before this one, first quest first: every quest of a
 * preQuestGroup, one of a preQuestSingle (the first the Horde can take).
 * @param {string | number} id @returns {string[]}
 */
function lgChain(id){
  const out = [];
  const seen = new Set();
  const walk = (qid, depth) => {
    const q = lgData.quests[qid];
    if (!q || depth > 30) return;
    const one = q.po && (q.po.find(p => lgData.quests[p] && lgForMe(lgData.quests[p])) || q.po[0]);
    const pre = [...(q.pa || []), ...(one ? [one] : [])];
    for (const p of pre) if (!seen.has(String(p))) { seen.add(String(p)); walk(p, depth + 1); out.push(String(p)); }
  };
  walk(id, 0);
  return out;
}

/** Short "Zone x, y /way" of an NPC / object. @param {any[]} ref */
function lgSpotHtml(ref){
  if (!ref) return '';
  const [, z, x, y] = ref;
  return `<span class="lg-where">${escapeHtml(lgZoneName(z) || '?')}${x > 0 && y > 0 ? ` <span class="lg-coords">${x.toFixed(1)}, ${y.toFixed(1)}</span> <button type="button" class="lg-way" data-lg-way="/way ${x.toFixed(1)} ${y.toFixed(1)}" title="TomTom-Wegpunkt kopieren (im selben Gebiet eingeben)">/way</button>` : ''}</span>`;
}
/** What to do: objective text and targets. @param {any} q */
function lgTasksHtml(q){
  const rows = (q.ob || []).map(o => {
    if (o[0] === 'n') { const n = lgData.npcs[o[1]]; return n ? `<li><span class="lg-ttype">Töten</span><b>${escapeHtml(n[0])}</b>${lgSpotHtml(n)}</li>` : ''; }
    if (o[0] === 'o') { const ob = lgData.objs[o[1]]; return ob ? `<li><span class="lg-ttype">Benutzen</span><b>${escapeHtml(ob[0])}</b>${lgSpotHtml(ob)}</li>` : ''; }
    if (o[0] === 't') return `<li><span class="lg-ttype">Erkunden</span><span>${escapeHtml(o[1])}</span>${o[2] ? lgSpotHtml(['', o[2], o[3], o[4]]) : ''}</li>`;
    if (o[0] === 'i') {
      const [, , name, droppers, more, objs] = o;
      const from = droppers.map(d => lgData.npcs[d]).filter(Boolean);
      const objects = objs.map(d => lgData.objs[d]).filter(Boolean);
      const src = from.length
        ? `<span><span class="bis-item-meta">von</span> ${from.map(n => `<b>${escapeHtml(n[0])}</b>`).join(', ')}${more ? ` <span class="bis-item-meta">+${more} weitere</span>` : ''}</span>${lgSpotHtml(from[0])}`
        : objects.length ? `<span><span class="bis-item-meta">aus</span> ${objects.map(n => `<b>${escapeHtml(n[0])}</b>`).join(', ')}</span>${lgSpotHtml(objects[0])}` : '';
      return `<li><span class="lg-ttype">Sammeln</span><b class="lg-titem">${escapeHtml(name || `Item #${o[1]}`)}</b>${src}</li>`;
    }
    return '';
  }).join('');
  if (!q.o && !rows) return '';
  return `<div class="lg-task">${q.o ? `<div><span class="lg-label">Aufgabe</span><span class="lg-otext">${escapeHtml(q.o)}</span></div>` : ''}${rows ? `<ul class="lg-targets">${rows}</ul>` : ''}</div>`;
}
/** Turn-in line when it isn't where the quest starts. @param {any} q */
function lgEndHtml(q){
  if (!q.e || (q.s && q.s[0] === q.e[0] && q.s[1] === q.e[1])) return '';
  const ref = q.e[0] === 'n' ? lgData.npcs[q.e[1]] : lgData.objs[q.e[1]];
  return ref ? `<div class="lg-quest-start"><span class="lg-label">Abgabe</span>${lgWhereHtml(ref, q.e[0])}</div>` : '';
}
/** Race badge of a race quest. @param {any} q */
const lgRaceHtml = q => q.ra ? `<span class="lg-tag">nur ${escapeHtml(lgRacesLabel(q.ra))}</span>` : '';

/** One quest with start, chain, follow-up and rewards. @param {string} id @param {string} ctx unique per list */
function lgQuestHtml(id, ctx){
  const q = lgData.quests[id];
  const chain = lgChain(id);
  const key = `${ctx}|${id}`;
  const open = lgOpen.has(key);
  const fits = lgLevel && q.r <= lgLevel;
  return `<div class="lg-quest${fits ? '' : lgLevel ? ' lg-quest-high' : ''}">
    <div class="lg-quest-head"><span class="lg-lvl" title="Quest-Level ${q.l} · ab Level ${q.r}">${q.l || '?'}</span><b class="lg-qname">${escapeHtml(q.n)}</b>
      <span class="bis-item-meta">ab ${q.r}</span>${lgClassHtml(q)}${q.ra ? lgRaceHtml(q) : q.h ? '<span class="lg-tag">nur Horde</span>' : ''}</div>
    <div class="lg-quest-start"><span class="lg-label">Start</span>${lgStartHtml(q)}</div>
    ${lgTasksHtml(q)}
    ${lgEndHtml(q)}
    ${chain.length ? `<div class="lg-chain"><button type="button" class="lg-chain-toggle" data-lg-open="${escapeHtml(key)}">${open ? '▾' : '▸'} Questreihe: ${chain.length} ${chain.length === 1 ? 'Vorquest' : 'Vorquests'} — erste Quest: <b>${escapeHtml((lgData.quests[chain[0]] || {}).n || '?')}</b></button>
      ${open ? `<ol class="lg-steps">${chain.map(c => { const s = lgData.quests[c]; return `<li><div><span class="lg-lvl">${s.l || '?'}</span><b>${escapeHtml(s.n)}</b> <span class="bis-item-meta">ab ${s.r}</span>${lgClassHtml(s)}${lgRaceHtml(s)}</div><div class="lg-quest-start">${lgStartHtml(s)}</div>${lgTasksHtml(s)}${lgEndHtml(s)}</li>`; }).join('')}
        <li class="lg-step-final"><div><span class="lg-lvl">${q.l || '?'}</span><b>${escapeHtml(q.n)}</b> <span class="bis-item-meta">diese Quest</span></div></li></ol>` : ''}</div>` : ''}
    ${q.nx && lgData.quests[q.nx] ? `<div class="lg-next"><span class="lg-label">Weiter mit</span>${escapeHtml(lgData.quests[q.nx].n)} <span class="bis-item-meta">(${lgData.quests[q.nx].l || '?'})</span></div>` : ''}
    ${q.rw && q.rw.length ? `<div class="lg-rewards"><span class="lg-label">Belohnung</span>${q.rw.map(lgItemHtml).join('')}</div>` : ''}
  </div>`;
}

/** Instances (dungeons / raids) with their quests, grouped by name. */
function lgInstances(){
  /** @type {Map<string, { name: string, kind: string, ids: string[], lo: number, hi: number }>} */
  const by = new Map();
  for (const [id, q] of Object.entries(lgData.quests)) {
    const z = lgData.zones[q.z];
    if (!z || (z.k !== 'd' && z.k !== 'r')) continue;
    const key = lgNameKey(z.n);
    if (!by.has(key)) by.set(key, { name: z.n, kind: z.k, ids: [], lo: 0, hi: 0 });
    by.get(key).ids.push(id);
  }
  // Level range: the middle 80 % of the quest levels (single odd quests don't stretch it).
  for (const g of by.values()) {
    const lv = g.ids.map(id => lgData.quests[id].l || lgData.quests[id].r).filter(Boolean).sort((a, b) => a - b);
    const pick = f => lv[Math.min(lv.length - 1, Math.floor(lv.length * f))] || 0;
    g.lo = pick(0.1); g.hi = pick(0.9);
  }
  return [...by.values()].sort((a, z) => a.lo - z.lo || a.name.localeCompare(z.name));
}
/** World zones with enough quests, by level. */
function lgWorldZones(){
  return Object.entries(lgData.zones).filter(([, z]) => z.k === 'z' && z.c >= 5).map(([id, z]) => ({ id, ...z })).sort((a, z) => a.lv[0] - z.lv[0] || a.lv[1] - z.lv[1]);
}
/** Does a level range fit my level? (Wide ranges — capitals — never do.) @param {number} lo @param {number} hi */
const lgFits = (lo, hi) => Boolean(lgLevel) && hi - lo <= 15 && lgLevel >= lo - 2 && lgLevel <= hi + 1;
/** Another race's starting zone (only once I picked my race)? @param {any} z */
const lgOtherStart = z => Boolean(lgRace && z.st && !z.st.includes(lgRace));
/** Search filter for a quest. @param {string} id */
function lgMatch(id){
  const q = lgData.quests[id];
  if (!lgForMe(q)) return false;
  if (!lgQuery) return true;
  const s = q.s && (q.s[0] === 'n' ? lgData.npcs[q.s[1]] : q.s[0] === 'o' ? lgData.objs[q.s[1]] : null);
  return `${q.n} ${s ? s[0] : ''} ${lgZoneName(q.z)}`.toLowerCase().includes(lgQuery);
}

function lgDungeonsHtml(){
  const list = lgInstances();
  return list.map(g => {
    const ids = g.ids.filter(lgMatch).sort((a, z) => lgData.quests[a].r - lgData.quests[z].r || lgData.quests[a].l - lgData.quests[z].l);
    if (!ids.length) return '';
    const key = `d|${lgNameKey(g.name)}`;
    const open = lgOpen.has(key) || Boolean(lgQuery);
    const fits = g.kind === 'd' && lgFits(g.lo, g.hi);
    return `<div class="tac-card lg-card${fits ? ' lg-fits' : ''}">
      <button type="button" class="lg-card-head" data-lg-open="${escapeHtml(key)}">
        <span class="lg-range">${g.lo}–${g.hi}</span><b>${escapeHtml(g.name)}</b>${g.kind === 'r' ? '<span class="lg-tag">Raid</span>' : ''}
        <span class="bis-item-meta">${ids.length} ${ids.length === 1 ? 'Quest' : 'Quests'}</span>${fits ? '<span class="lg-tag lg-tag-fit">passt zu Deinem Level</span>' : ''}<span class="lg-arrow">${open ? '▾' : '▸'}</span>
      </button>
      ${open ? `<div class="lg-card-body">${ids.map(id => lgQuestHtml(id, key)).join('')}</div>` : ''}
    </div>`;
  }).join('');
}

function lgZonesHtml(){
  return lgWorldZones().map(z => {
    const ids = Object.keys(lgData.quests).filter(id => String(lgData.quests[id].z) === z.id && lgMatch(id))
      .sort((a, b) => lgData.quests[a].r - lgData.quests[b].r || lgData.quests[a].l - lgData.quests[b].l);
    if (!ids.length) return '';
    const key = `z|${z.id}`;
    const open = lgOpen.has(key) || Boolean(lgQuery);
    const other = lgOtherStart(z);
    const fits = !other && lgFits(z.lv[0], z.lv[1]);
    const start = z.st ? `<span class="lg-tag${lgRace && !other ? ' lg-tag-fit' : ''}">${lgRace && !other ? 'Dein Startgebiet' : `Startgebiet ${escapeHtml(lgRacesLabel(z.st))}`}</span>` : '';
    // Quest hubs: the quest givers with the most quests here.
    /** @type {Map<number, number>} */
    const givers = new Map();
    for (const id of ids) { const q = lgData.quests[id]; if (q.s && q.s[0] === 'n') givers.set(q.s[1], (givers.get(q.s[1]) || 0) + 1); }
    const hubs = [...givers].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 6);
    return `<div class="tac-card lg-card${fits ? ' lg-fits' : ''}${other ? ' lg-other' : ''}">
      <button type="button" class="lg-card-head" data-lg-open="${escapeHtml(key)}">
        <span class="lg-range">${z.lv[0]}–${z.lv[1]}</span><b>${escapeHtml(z.n)}</b>
        <span class="bis-item-meta">${ids.length} Quests</span>${start}${fits ? '<span class="lg-tag lg-tag-fit">passt zu Deinem Level</span>' : ''}<span class="lg-arrow">${open ? '▾' : '▸'}</span>
      </button>
      ${open ? `<div class="lg-card-body">
        ${hubs.length ? `<div class="lg-hubs"><div class="raid-col-head">Questgeber mit den meisten Quests</div>${hubs.map(([npc, n]) => `<div class="lg-hub">${lgWhereHtml(lgData.npcs[npc], 'n')}<span class="bis-item-meta">${n} Quests</span></div>`).join('')}</div>` : ''}
        ${ids.map(id => lgQuestHtml(id, key)).join('')}
      </div>` : ''}
    </div>`;
  }).join('');
}

/** The open tab; a search looks through both (dungeons first). */
function lgListHtml(){
  const html = lgQuery ? lgDungeonsHtml() + lgZonesHtml() : lgTab === 'zones' ? lgZonesHtml() : lgDungeonsHtml();
  return html || '<div class="tac-card"><p class="bis-hint">Nichts gefunden.</p></div>';
}

function renderLevelGuidePage(){
  const root = document.getElementById('levelGuideRoot');
  if (!root) return;
  lgLoad();
  if (!lgData){ root.innerHTML = `<div class="tac-card"><p class="bis-hint">${lgError ? escapeHtml(lgError) : 'Questdaten werden geladen …'}</p></div>`; return; }
  // Item tooltips on rewards need the item data (loaded once, in the background).
  if (typeof bisData !== 'undefined' && !bisData) bisLoadData().catch(() => {});
  const searchFocused = document.activeElement && /** @type {HTMLElement} */ (document.activeElement).hasAttribute('data-lg-search');
  root.innerHTML = `<div class="tac-card lg-top">
      <label class="lg-level">Mein Level<input type="number" min="1" max="60" class="apply-text-input" data-lg-level value="${lgLevel || ''}" placeholder="z. B. 23"></label>
      <label class="lg-level">Mein Volk<select class="apply-text-input" data-lg-race><option value="">Alle Völker</option>${Object.entries(LG_RACES).map(([k, [one]]) => `<option value="${k}"${lgRace === k ? ' selected' : ''}>${one}</option>`).join('')}</select></label>
      <div class="tac-bosses">${[['dungeons', 'Dungeons & Raids'], ['zones', 'Zonen']].map(([k, l]) => `<button type="button" class="tac-boss${lgTab === k ? ' active' : ''}" data-lg-tab="${k}">${l}</button>`).join('')}</div>
      <input type="search" class="apply-text-input lg-search" data-lg-search placeholder="Quest, NPC oder Zone suchen …" value="${escapeHtml(lgQuery)}">
      <p class="bis-hint">Horde und neutrale Quests aus QuestieDB (WoW Forever). Neue Forever-Inhalte erscheinen, sobald QuestieDB sie hat. Namen und Questtexte auf Englisch wie im Spiel-Datenstand.</p>
    </div>
    ${lgListHtml()}`;
  lgWire(root);
  if (searchFocused){ const s = /** @type {HTMLInputElement} */ (root.querySelector('[data-lg-search]')); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
}

/** @param {HTMLElement} root */
function lgWire(root){
  root.querySelectorAll('[data-lg-tab]').forEach(btn => btn.addEventListener('click', () => { lgTab = btn.getAttribute('data-lg-tab'); renderLevelGuidePage(); }));
  root.querySelectorAll('[data-lg-open]').forEach(btn => btn.addEventListener('click', () => {
    const k = btn.getAttribute('data-lg-open');
    if (lgOpen.has(k)) lgOpen.delete(k); else lgOpen.add(k);
    renderLevelGuidePage();
  }));
  const level = /** @type {HTMLInputElement} */ (root.querySelector('[data-lg-level]'));
  level.addEventListener('change', () => {
    lgLevel = Math.max(0, Math.min(60, Math.trunc(Number(level.value)) || 0));
    try { localStorage.setItem(LG_LEVEL_KEY, String(lgLevel)); } catch (e){ /* ignore */ }
    renderLevelGuidePage();
  });
  const race = /** @type {HTMLSelectElement} */ (root.querySelector('[data-lg-race]'));
  race.addEventListener('change', () => {
    lgRace = LG_RACES[race.value] ? race.value : '';
    try { localStorage.setItem(LG_RACE_KEY, lgRace); } catch (e){ /* ignore */ }
    renderLevelGuidePage();
  });
  const search = /** @type {HTMLInputElement} */ (root.querySelector('[data-lg-search]'));
  let t = 0;
  search.addEventListener('input', () => { clearTimeout(t); t = window.setTimeout(() => { lgQuery = search.value.trim().toLowerCase(); renderLevelGuidePage(); }, 250); });
  root.querySelectorAll('[data-lg-way]').forEach(btn => btn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(btn.getAttribute('data-lg-way')); btn.textContent = 'kopiert'; } catch (e){ btn.textContent = btn.getAttribute('data-lg-way'); }
  }));
}
