// Hilfreich forEVER page: curated list of external community sites/tools.
//
// Classic (non-module) script — shares the global scope with the other
// js/*.js files; load order is set in index.html. Code that runs at load
// time may only use files loaded before this one.

// ---------------------------------------------------------------------
// "Hilfreich forEVER" — curated list of external community sites/tools
// for WoW: Forever, instead of us rebuilding things (like an item
// database) that already exist elsewhere and are actively maintained.
// Static, hand-picked list — nothing here touches Firebase.
//
// Every entry gets a `category`. Today they're all 'Allgemein', so
// renderForeverToolsPage() below doesn't print any category heading —
// but the moment a second distinct category shows up (e.g. 'Berufe',
// 'Dungeons', once the community splits into more specific sites),
// it starts grouping and heading them automatically. To add a new
// site, just add another object to this array.
//
// `thumb` is hotlinked straight from the target site's own og:image /
// twitter:image — no image is stored here — so it can break if that
// site changes its markup; the <img onerror> in renderForeverToolsPage()
// falls back to a plain placeholder box in that case, same pattern as
// the item-db icon fallback used to.
// ---------------------------------------------------------------------
const FOREVER_RESOURCES = [
  {
    title: 'ForeverChanges',
    url: 'https://foreverchanges.pro/',
    domain: 'foreverchanges.pro',
    thumb: 'https://foreverchanges.pro/og-five-features.png',
    category: 'Allgemein',
    blurb: 'Die umfangreichste Community-Datenbank für WoW Forever: interaktiver Talent-Rechner für alle 9 Klassen, komplettes Spellbook, Dungeon-Übersicht mit Loot-Tabellen (35 Dungeons), 2D/3D-Weltkarte und eine Item-Datenbank mit allen neuen und geänderten Items gegenüber Classic. Wird von einem Solo-Entwickler werbefrei betrieben.'
  },
  {
    title: 'Talents Forever',
    url: 'https://talentsforever.com/',
    domain: 'talentsforever.com',
    thumb: 'https://talentsforever.com/assets/og.png?v=606d5957',
    category: 'Allgemein',
    blurb: 'Kostenloser Talent-Rechner für alle 9 Klassen, direkt aus den Beta-Client-Daten gezogen. Baue Talentbäume, teile sie per Link und vergleiche Änderungen gegenüber Classic — inklusive Rasse-Boni und Legacy-Perks.'
  },
  {
    title: 'Wowhead Forever',
    url: 'https://www.wowhead.com/forever',
    domain: 'wowhead.com/forever',
    thumb: 'https://wow.zamimg.com/images/logos/share-icon.png',
    category: 'Allgemein',
    blurb: 'Die größte WoW-Forever-Seite überhaupt: Klassen-Guides, Berufe, Best-in-Slot-Listen, Quest-Datenbank und ein eigener Talent-Rechner — der Wowhead-Ableger speziell für Forever.'
  },
  {
    title: 'Patchbot — WoW Forever Patch-Notes',
    url: 'https://patchbot.io/games/world-of-warcraft-forever',
    domain: 'patchbot.io',
    thumb: 'https://cdn.patchbot.io/games/317/world-of-warcraft-forever_1789616963_md.webp',
    category: 'Allgemein',
    blurb: 'Sammelt die offiziellen Patch-Notes und Beta-Build-Updates direkt aus Blizzards eigenen Quellen — praktisch, um auf einen Blick zu sehen was sich zuletzt geändert hat, ohne die Foren selbst zu durchsuchen.'
  }
];

const FOREVER_RESOURCE_EXTERNAL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';

function resourceThumbHtml(thumb, title){
  if (!thumb) return `<span class="resource-thumb-ph" aria-hidden="true">${escapeHtml(title)}</span>`;
  return `<img src="${thumb}" alt="" loading="lazy" onerror="this.outerHTML='<span class=&quot;resource-thumb-ph&quot; aria-hidden=&quot;true&quot;>${escapeHtml(title)}</span>'">`;
}

let forevertoolsInitialized = false;
function renderForeverToolsPage(){
  if (forevertoolsInitialized) return;
  forevertoolsInitialized = true;
  const cats = [...new Set(FOREVER_RESOURCES.map(r => r.category))];
  const showCatHeadings = cats.length > 1;
  let html = '';
  let lastCat = null;
  FOREVER_RESOURCES.forEach(r => {
    if (showCatHeadings && r.category !== lastCat){
      html += `<div class="resource-category-heading">${escapeHtml(r.category)}</div>`;
      lastCat = r.category;
    }
    html += `<div class="resource-card">
      <a class="resource-card-header" href="${r.url}" target="_blank" rel="noopener">
        <span class="resource-card-title">${escapeHtml(r.title)}</span>
        <span class="resource-card-sep">—</span>
        <span class="resource-card-domain">${escapeHtml(r.domain)}</span>
        <span class="resource-card-external" aria-hidden="true">${FOREVER_RESOURCE_EXTERNAL_ICON}</span>
      </a>
      <div class="resource-card-body">
        <div class="resource-thumb">${resourceThumbHtml(r.thumb, r.title)}</div>
        <div class="resource-info">${escapeHtml(r.blurb)}</div>
      </div>
    </div>`;
  });
  els.forevertoolsList.innerHTML = html;
}
