// "Was ist neu in WoW Forever?" — the automatic game-data changelog.
//
// data/forever/changelog.json is written by the daily data workflow
// (scripts/forever-data/changelog.mjs): one entry per new client build
// with the items added / removed / changed (old → new values) and the
// talents whose text or ranks changed.
//
// On the Klassen page every build becomes a Patch-Update post in the same
// list and style as the hand-written ones (foreverChangePosts):
//  - "Allgemein": items (old → new) and which talents changed per class
//    (names only — the texts are in the class);
//  - each class: its talent changes, old / new text with the changed
//    words marked.
// Nothing is said twice: when officers already wrote a Patch-Update for
// the same day (± 1 day), the automatic part is added to that post as
// "Automatisch erkannt" instead of a post of its own, and items / talents
// the post already names are left out.
// Home shows a news tile while the newest build is less than 14 days old
// (members — the Klassen page is members only). Test mode shows a made-up
// build (testModeChangelog in js/testmode.js).

/** @typedef {{ c: string, n: string, k: 'added' | 'removed' | 'changed', from?: string, to?: string, ranks?: [number, number] }} ForeverTalentChange */
/** @typedef {[number, string, number]} ForeverItemRef */
/** @typedef {{ date: string, build: string, prevBuild: string, items?: { counts: { added: number, removed: number, changed: number }, added: ForeverItemRef[], removed: ForeverItemRef[], changed: [number, string, number, Record<string, [any, any]>][] }, talents?: ForeverTalentChange[] }} ForeverChangeEntry */

/** @type {ForeverChangeEntry[] | null} */
let foreverChanges = null;
let foreverChangesPromise = null;
const FOREVER_CHANGES_NEWS_DAYS = 14;
const FOREVER_QUALITY_LABELS = ['Schlecht', 'Gewöhnlich', 'Selten', 'Rar', 'Episch', 'Legendär'];
/** German class names for the "Talente" overview in Allgemein. */
const FOREVER_CLASS_DE = { Warrior: 'Krieger', Paladin: 'Paladin', Hunter: 'Jäger', Rogue: 'Schurke', Priest: 'Priester', Shaman: 'Schamane', Mage: 'Magier', Warlock: 'Hexenmeister', Druid: 'Druide' };

function foreverChangesLoad(){
  if (!foreverChangesPromise){
    foreverChangesPromise = (typeof RUDE_TESTMODE !== 'undefined' && RUDE_TESTMODE
      ? Promise.resolve(testModeChangelog())
      : fetch('data/forever/changelog.json').then(r => (r.ok ? r.json() : { entries: [] })))
      .catch(() => ({ entries: [] }))
      .then(data => {
        foreverChanges = Array.isArray(data && data.entries) ? data.entries : [];
        // The Klassen page is also built while hidden (renderAll) — refresh it either way.
        renderClassDeepDivesView();
        if (currentPage === 'home') renderNewsGrid();
      });
  }
  return foreverChangesPromise;
}

/** Item chip (icon + tooltip once the item data is loaded). @param {number} id @param {string} name */
function foreverChangeItemHtml(id, name){
  return lootItemHtml(id, name);
}

/** Short summary "3 neue Items · 2 geändert · 4 Talente". @param {ForeverChangeEntry} e @param {string} [cls] only this class's talents */
function foreverChangeSummary(e, cls){
  const c = e.items && !cls ? e.items.counts : { added: 0, removed: 0, changed: 0 };
  const t = (e.talents || []).filter(x => !cls || x.c === cls).length;
  return [
    c.added ? `${c.added} ${c.added === 1 ? 'neues Item' : 'neue Items'}` : '',
    c.changed ? `${c.changed} ${c.changed === 1 ? 'Item' : 'Items'} geändert` : '',
    c.removed ? `${c.removed} entfernt` : '',
    t ? `${t} ${t === 1 ? 'Talent' : 'Talente'}` : ''
  ].filter(Boolean).join(' · ');
}

// ---------------------------------------------------------------- old → new
const foreverArrow = '<span class="fc-arrow">→</span>';
/** @param {any} v */
const foreverOld = v => `<span class="fc-old">${escapeHtml(String(v))}</span>`;
/** @param {any} v */
const foreverNew = v => `<span class="fc-new">${escapeHtml(String(v))}</span>`;

/** One changed item field as "Itemlevel 57 → 60" (stats per stat). @param {string} f @param {[any, any]} pair @returns {string[]} */
function foreverFieldChanges(f, [a, b]){
  const simple = (label, fmt) => [`${label} ${foreverOld(a == null ? '–' : fmt(a))} ${foreverArrow} ${foreverNew(b == null ? '–' : fmt(b))}`];
  if (f === 'il') return simple('Itemlevel', x => x);
  if (f === 'rl') return simple('Benötigt Stufe', x => x);
  if (f === 'ar') return simple('Rüstung', x => x);
  if (f === 'n') return simple('Name', x => x);
  if (f === 'q') return simple('Qualität', x => FOREVER_QUALITY_LABELS[x] || x);
  if (f === 'dm') return simple('Schaden', x => `${x.min}–${x.max} (${x.dps} DPS)`);
  if (f === 's'){
    const before = new Map(a || []), after = new Map(b || []);
    const out = [];
    for (const stat of new Set([...before.keys(), ...after.keys()])) {
      const label = BIS_STAT_LABELS[stat] || `Wert ${stat}`;
      const x = before.get(stat), y = after.get(stat);
      if (x === y) continue;
      if (x == null) out.push(`${foreverNew(`+${y} ${label}`)} <span class="fc-tag">neu</span>`);
      else if (y == null) out.push(`${foreverOld(`+${x} ${label}`)} <span class="fc-tag">entfernt</span>`);
      else out.push(`${label} ${foreverOld(`+${x}`)} ${foreverArrow} ${foreverNew(`+${y}`)}`);
    }
    return out;
  }
  return [{ it: 'Slot', b: 'Bindung', set: 'Set-Zugehörigkeit' }[f] + ' geändert'];
}

/**
 * Word diff of two talent texts: the text after the change with removed
 * words struck through and new words marked (numbers usually).
 * @param {string} from @param {string} to
 */
function foreverTextDiff(from, to){
  const a = from.split(/(\s+)/), b = to.split(/(\s+)/);
  // LCS table (texts are a sentence or two — small).
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  let i = 0, j = 0, out = '';
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]){ out += escapeHtml(a[i]); i++; j++; }
    // Old word first (struck through), then the new one.
    else if (i < a.length && (j >= b.length || dp[i + 1][j] >= dp[i][j + 1])){ out += /\S/.test(a[i]) ? `<del class="fc-del">${escapeHtml(a[i])}</del>` : ''; i++; }
    else { out += /\S/.test(b[j]) ? `<ins class="fc-ins">${escapeHtml(b[j])}</ins>` : escapeHtml(b[j]); j++; }
  }
  return out;
}

/** One talent change as a list entry. @param {ForeverTalentChange} t */
function foreverTalentChangeHtml(t){
  if (t.k === 'added') return `<li><b>${escapeHtml(t.n)}</b> <span class="fc-tag fc-tag-new">neues Talent</span>${t.to ? `<br>${escapeHtml(t.to)}` : ''}</li>`;
  if (t.k === 'removed') return `<li><b>${escapeHtml(t.n)}</b> <span class="fc-tag">entfernt</span></li>`;
  const ranks = t.ranks ? ` · Ränge ${foreverOld(t.ranks[0])} ${foreverArrow} ${foreverNew(t.ranks[1])}` : '';
  const text = t.from && t.to && t.from !== t.to ? `<br>${foreverTextDiff(t.from, t.to)}` : '';
  return `<li><b>${escapeHtml(t.n)}</b>${ranks}${text}</li>`;
}

// ---------------------------------------------------------------- posts
/** Does the officers' post text already name it? @param {string} plain lower-case text @param {string} name */
const foreverMentioned = (plain, name) => Boolean(plain) && plain.includes(name.toLowerCase());

/**
 * The automatic part of one build for a category, as Patch-Update HTML
 * (same look as the hand-written posts: emoji section heads, "alt → neu").
 * '' when nothing is left (e.g. everything already named in the post).
 * @param {ForeverChangeEntry} e @param {string} classLabel '' = Allgemein @param {string} known lower-case text of a post to not repeat
 */
function foreverChangeHtml(e, classLabel, known){
  let html = '';
  let skipped = 0;
  if (!classLabel && e.items){
    const it = e.items;
    const keep = (/** @type {any[]} */ rows) => rows.filter(r => { const m = foreverMentioned(known, r[1]); if (m) skipped++; return !m; });
    const added = keep(it.added), changed = keep(it.changed), removed = keep(it.removed);
    const more = (shown, total) => total > shown ? `<li class="fc-more">… und ${total - shown} weitere</li>` : '';
    if (added.length || changed.length || removed.length){
      html += '<h2>⚔️ Items</h2>';
      if (changed.length) html += `<p><b>Geändert</b></p><ul class="fc-items">${changed.map(r => `<li>${foreverChangeItemHtml(r[0], r[1])}<span class="fc-sep">:</span> ${Object.entries(r[3] || {}).flatMap(([f, pair]) => foreverFieldChanges(f, pair)).join(' · ')}</li>`).join('')}${more(it.changed.length, it.counts.changed)}</ul>`;
      if (added.length) html += `<p><b>Neu im Spiel</b></p><ul class="fc-items">${added.map(r => `<li>${foreverChangeItemHtml(r[0], r[1])}</li>`).join('')}${more(it.added.length, it.counts.added)}</ul>`;
      if (removed.length) html += `<p><b>Entfernt</b></p><ul class="fc-items">${removed.map(r => `<li>${foreverChangeItemHtml(r[0], r[1])}</li>`).join('')}${more(it.removed.length, it.counts.removed)}</ul>`;
    }
  }
  const talents = (e.talents || []).filter(t => !classLabel || t.c === classLabel);
  if (talents.length){
    if (classLabel){
      const rest = talents.filter(t => { const m = foreverMentioned(known, t.n); if (m) skipped++; return !m; });
      if (rest.length) html += `<h2>✨ Talente</h2><ul>${rest.map(foreverTalentChangeHtml).join('')}</ul>`;
    } else {
      // Allgemein: only who changed — the texts are in each class.
      /** @type {Map<string, string[]>} */
      const byClass = new Map();
      for (const t of talents) { if (!byClass.has(t.c)) byClass.set(t.c, []); byClass.get(t.c).push(t.n); }
      html += `<h2>✨ Talente</h2><ul>${[...byClass].map(([c, names]) => {
        const cls = CLASSES.find(x => x.label === c);
        return `<li><button type="button" class="fc-class-link" data-select-classdive="${cls ? cls.id : ''}" style="color:${cls ? cls.color : 'var(--text)'}">${escapeHtml(FOREVER_CLASS_DE[c] || c)}</button>: ${names.map(escapeHtml).join(', ')}</li>`;
      }).join('')}</ul><p class="fc-hint">Die Texte vorher / nachher stehen bei der jeweiligen Klasse.</p>`;
    }
  }
  if (!html) return '';
  return `${html}${skipped ? `<p class="fc-hint">${skipped} ${skipped === 1 ? 'weitere Änderung steht' : 'weitere Änderungen stehen'} schon oben im Beitrag.</p>` : ''}`;
}

/**
 * The category's Patch-Updates with the automatic ones merged in, newest
 * first. A build on the same day (± 1) as an officers' post is added to
 * that post; otherwise it becomes its own post (auto: true).
 * @param {ClassDeepDiveUpdate[]} manual @param {string} classLabel '' = Allgemein
 * @returns {(ClassDeepDiveUpdate & { auto?: boolean, build?: string })[]}
 */
function foreverChangePosts(manual, classLabel){
  foreverChangesLoad();
  /** @type {(ClassDeepDiveUpdate & { auto?: boolean, build?: string })[]} */
  const posts = manual.map(u => ({ ...u }));
  const day = iso => new Date(iso + 'T12:00:00').getTime();
  for (const e of foreverChanges || []) {
    const near = posts.find(u => !u.auto && u.date && Math.abs(day(u.date) - day(e.date)) <= 86400000 * 1.5);
    const body = foreverChangeHtml(e, classLabel, near ? stripHtmlToText(near.text).toLowerCase() : '');
    if (!body) continue;
    const intro = `<p>WoW: Forever – Build <b>${escapeHtml(e.build)}</b>${e.prevBuild ? ` (vorher ${escapeHtml(e.prevBuild)})` : ''}. Automatisch aus den Spieldaten erkannt: ${escapeHtml(foreverChangeSummary(e, classLabel || undefined))}.</p>`;
    if (near) near.text += `<div class="fc-auto-block"><h2>🔎 Automatisch erkannt (Build ${escapeHtml(e.build)})</h2>${body}</div>`;
    else posts.push({ id: `auto-${e.build}-${classLabel || 'general'}`, date: e.date, title: '', text: intro + body, createdAt: day(e.date), auto: true, build: e.build });
  }
  return posts.sort((a, z) => (z.date || '').localeCompare(a.date || '') || (z.createdAt - a.createdAt));
}

/** News tile for the newest build (members, < 14 days). @returns {NewsItem | null} */
function foreverChangesNewsItem(){
  if (!discordIdentity || !isMemberOrHigher()) return null;
  foreverChangesLoad();
  const e = foreverChanges && foreverChanges[0];
  if (!e || Date.now() - new Date(e.date + 'T12:00:00').getTime() > FOREVER_CHANGES_NEWS_DAYS * 86400000) return null;
  return {
    title: `Neu in WoW Forever: Build ${e.build}`,
    blurb: `${foreverChangeSummary(e)} — alle Details unter Klassen → Allgemein.`,
    image: NEWS_LAUNCH_IMAGE,
    linkPage: 'classdeepdives',
    badge: 'Spieldaten · automatisch'
  };
}
