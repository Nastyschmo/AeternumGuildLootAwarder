// "Was ist neu in WoW Forever?" — the automatic game-data changelog.
//
// data/forever/changelog.json is written by the daily data workflow
// (scripts/forever-data/changelog.mjs): one entry per new client build
// with the items added / removed / changed and the talents whose text or
// ranks changed. Shown
//  - on the Klassen page: category "Allgemein" lists every build, each
//    class lists its own talent changes;
//  - on Home as a news tile while the newest build is less than 14 days
//    old (members — the Klassen page is members only).
// Test mode shows a made-up entry instead (testModeChangelog in
// js/testmode.js), since the real log only fills with new builds.

/** @typedef {{ date: string, build: string, prevBuild: string, items?: { counts: { added: number, removed: number, changed: number }, added: [number, string, number][], removed: [number, string, number][], changed: [number, string, number, string[]][] }, talents?: { c: string, n: string, k: 'added' | 'removed' | 'changed', from?: string, to?: string, ranks?: [number, number] }[] }} ForeverChangeEntry */

/** @type {ForeverChangeEntry[] | null} */
let foreverChanges = null;
let foreverChangesPromise = null;
const FOREVER_CHANGES_NEWS_DAYS = 14;

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

/** "05.10.2026" @param {string} iso */
function foreverChangeDate(iso){
  const d = new Date(iso + 'T12:00:00');
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
/** Item chip (icon + tooltip once the item data is loaded). @param {number} id @param {string} name */
function foreverChangeItemHtml(id, name){
  return lootItemHtml(id, name);
}
/** Short summary "3 neue Items · 2 geändert · 4 Talente". @param {ForeverChangeEntry} e */
function foreverChangeSummary(e){
  const c = e.items ? e.items.counts : { added: 0, removed: 0, changed: 0 };
  const t = (e.talents || []).length;
  return [
    c.added ? `${c.added} ${c.added === 1 ? 'neues Item' : 'neue Items'}` : '',
    c.changed ? `${c.changed} ${c.changed === 1 ? 'Item' : 'Items'} geändert` : '',
    c.removed ? `${c.removed} entfernt` : '',
    t ? `${t} ${t === 1 ? 'Talent' : 'Talente'}` : ''
  ].filter(Boolean).join(' · ');
}
/** One talent change. @param {NonNullable<ForeverChangeEntry['talents']>[number]} t @param {boolean} withClass */
function foreverTalentChangeHtml(t, withClass){
  const cls = CLASSES.find(c => c.label === t.c);
  const head = `${withClass ? `<span class="forever-change-cls" style="color:${cls ? cls.color : 'var(--text)'}">${escapeHtml(t.c)}</span> · ` : ''}<b>${escapeHtml(t.n)}</b>`;
  if (t.k === 'added') return `<li>${head} <span class="loot-tag loot-tag-good">neu</span>${t.to ? `<div class="forever-change-to">${escapeHtml(t.to)}</div>` : ''}</li>`;
  if (t.k === 'removed') return `<li>${head} <span class="loot-tag">entfernt</span></li>`;
  return `<li>${head}${t.ranks ? ` <span class="bis-item-meta">Ränge ${t.ranks[0]} → ${t.ranks[1]}</span>` : ''}
    ${t.from ? `<div class="forever-change-from">${escapeHtml(t.from)}</div>` : ''}
    ${t.to ? `<div class="forever-change-to">${escapeHtml(t.to)}</div>` : ''}</li>`;
}

/** Klassen → Allgemein: every build with all changes. */
function foreverChangesGeneralHtml(){
  foreverChangesLoad();
  // Item icons / tooltips need the big item data — only while the page is open.
  if (!bisData && currentPage === 'classdeepdives') bisLoadData().then(renderClassDeepDivesView).catch(() => {});
  const list = foreverChanges;
  const body = list === null ? '<p class="classdive-empty">Lade …</p>'
    : !list.length ? '<p class="classdive-empty">Noch keine Änderungen erfasst — die Liste füllt sich automatisch, sobald Blizzard einen neuen Forever-Build ausliefert (täglicher Daten-Abgleich).</p>'
    : list.map((e, i) => {
      const it = e.items;
      const items = (label, rows, extra) => rows && rows.length ? `<div class="forever-change-group"><div class="forever-change-label">${label}</div>
        <div class="forever-change-items">${rows.map(r => `<span class="forever-change-item">${foreverChangeItemHtml(r[0], r[1])}${extra ? extra(r) : ''}</span>`).join('')}</div></div>` : '';
      const more = (shown, total) => total > shown ? `<p class="bis-hint">… und ${total - shown} weitere.</p>` : '';
      return `<details class="forever-change"${i === 0 ? ' open' : ''}>
        <summary><b>Build ${escapeHtml(e.build)}</b> <span class="bis-item-meta">${escapeHtml(foreverChangeDate(e.date))}${e.prevBuild ? ` · vorher ${escapeHtml(e.prevBuild)}` : ''} · ${escapeHtml(foreverChangeSummary(e))}</span></summary>
        ${it ? `${items('Neue Items', it.added)}${more(it.added.length, it.counts.added)}
          ${items('Geändert', it.changed, r => ` <span class="bis-item-meta">${escapeHtml(r[3].join(', '))}</span>`)}${more(it.changed.length, it.counts.changed)}
          ${items('Entfernt', it.removed)}${more(it.removed.length, it.counts.removed)}` : ''}
        ${e.talents && e.talents.length ? `<div class="forever-change-group"><div class="forever-change-label">Talente</div><ul class="forever-change-talents">${e.talents.map(t => foreverTalentChangeHtml(t, true)).join('')}</ul></div>` : ''}
      </details>`;
    }).join('');
  return `<div class="classdive-updates-section forever-changes">
    <div class="classdive-section-title">Änderungen im Spiel <span class="bis-item-meta">automatisch aus den Forever-Spieldaten</span></div>
    ${body}
  </div>`;
}

/** Klassen → one class: its talent changes over the recorded builds. @param {string} classLabel */
function foreverChangesClassHtml(classLabel){
  foreverChangesLoad();
  if (!foreverChanges) return '';
  const rows = foreverChanges.map(e => ({ e, talents: (e.talents || []).filter(t => t.c === classLabel) })).filter(x => x.talents.length);
  return `<div class="classdive-updates-section forever-changes">
    <div class="classdive-section-title">Talent-Änderungen im Spiel <span class="bis-item-meta">automatisch aus den Forever-Spieldaten</span></div>
    ${rows.length ? rows.map(({ e, talents }) => `<div class="forever-change-group">
        <div class="forever-change-label">Build ${escapeHtml(e.build)} · ${escapeHtml(foreverChangeDate(e.date))}</div>
        <ul class="forever-change-talents">${talents.map(t => foreverTalentChangeHtml(t, false)).join('')}</ul>
      </div>`).join('') : '<p class="classdive-empty">Seit Beginn der Aufzeichnung keine Talent-Änderungen für diese Klasse.</p>'}
  </div>`;
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
