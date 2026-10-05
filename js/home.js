// Home page: Wowhead news card, release countdown, public shell (hero/intro)
// and the news carousel.
//
// Classic (non-module) script — shares the global scope with the other
// js/*.js files; load order is set in index.html. Code that runs at load
// time may only use files loaded before this one.

// ---------------------------------------------------------------------
// Wowhead "WoW: Forever" news card — always exactly ONE card showing the
// latest Wowhead post (never one-per-update). It links straight out to
// the real Wowhead article in a new tab, unlike the internal-navigation
// cards above. Fetched once via the Worker (see WOWHEAD_NEWS_URL) since
// the browser can't call Wowhead's feed directly (CORS); fails silently
// if the Worker isn't deployed/reachable — the rest of the page must
// keep working fine either way.
//
// Alongside it, a second, separate card for official Blizzard patch
// notes / hotfixes: Blizzard's own news site has no feed a Worker can
// read (it loads articles with JavaScript after the page loads), so
// this is sourced from the SAME Wowhead feed — Wowhead reliably posts
// its own article (with its own thumbnail) whenever Blizzard ships
// official patch notes, and the Worker picks out the newest one of
// those specifically (see getWowheadNewsAndPatchNotes in the Worker).
// Same "exactly one card, content replaced in place" behavior.
// ---------------------------------------------------------------------
let wowheadNewsItem = null;
let wowheadPatchNotesItem = null;
async function fetchWowheadNews(){
  if (!isWorkerConfigured()) return;
  try{
    const res = await fetch(WOWHEAD_NEWS_URL);
    if (!res.ok) return;
    const data = await res.json();
    if (!data) return;
    if (data.latest && data.latest.title && data.latest.url) wowheadNewsItem = data.latest;
    if (data.patchNotes && data.patchNotes.title && data.patchNotes.url) wowheadPatchNotesItem = data.patchNotes;
    renderNewsGrid();
  }catch(e){
    // No Wowhead/patch-notes card — page carries on without it.
  }
}

// ---- Release countdown pill (topbar, top-mid, every page) ---------
// Ticks once a second; lives in the topbar itself (not inside
// #pageHost), so it survives page navigation untouched.
let releaseCountdownIntervalStarted = false;
function updateReleaseCountdown(){
  updateHeroCountdown();
  const el = document.getElementById('topbarCountdownTimer');
  if (!el) return;
  const diff = WOW_FOREVER_RELEASE_MS - Date.now();
  const pad = n => String(n).padStart(2, '0');
  if (!(diff > 0)){
    el.textContent = 'Live!';
    return;
  }
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = pad(Math.floor((totalSeconds % 86400) / 3600));
  const minutes = pad(Math.floor((totalSeconds % 3600) / 60));
  const seconds = pad(totalSeconds % 60);
  el.textContent = `${days}T ${hours}:${minutes}:${seconds}`;
}
/**
 * Big countdown in the Home hero: days / hours to the Forever launch,
 * after it (members) the time to the next raid. Hidden otherwise.
 */
function updateHeroCountdown(){
  const el = document.getElementById('heroCountdown');
  const eyebrow = document.getElementById('heroEyebrow');
  if (!el) return;
  const now = Date.now();
  const span = (ms, what) => {
    const h = Math.floor(ms / 3600000);
    const d = Math.floor(h / 24);
    const parts = d ? [[d, d === 1 ? 'Tag' : 'Tage'], [h % 24, 'Std']] : [[h, 'Std'], [Math.floor(ms / 60000) % 60, 'Min']];
    return `Noch ${parts.map(([n, l]) => `<b>${n}</b> ${l}`).join(' ')} ${what}`;
  };
  let html = '';
  if (WOW_FOREVER_RELEASE_MS > now){
    html = span(WOW_FOREVER_RELEASE_MS - now, 'bis zum Launch');
    if (eyebrow) eyebrow.textContent = `World of Warcraft: Forever · Launch ${new Date(WOW_FOREVER_RELEASE_MS).toLocaleDateString('de-DE', { day: 'numeric', month: 'long' })}`;
  } else {
    if (eyebrow) eyebrow.textContent = 'World of Warcraft: Forever';
    if (discordIdentity && isMemberOrHigher() && typeof raidEvents === 'object'){
      const next = Object.values(raidEvents).filter(e => e.start > now).sort((a, z) => a.start - z.start)[0];
      if (next) html = span(next.start - now, `bis ${escapeHtml(next.title)}`);
    }
  }
  if (el.innerHTML !== html) el.innerHTML = html;
  el.classList.toggle('hidden', !html);
}
function initReleaseCountdown(){
  updateReleaseCountdown();
  if (!releaseCountdownIntervalStarted){
    releaseCountdownIntervalStarted = true;
    setInterval(updateReleaseCountdown, 1000);
  }
}

function renderPublicShell(){
  els.navGuildName.textContent = GUILD_NAME;
  els.navCrest.textContent = GUILD_CREST_LETTER;
  els.navCrestMini.textContent = GUILD_CREST_LETTER;
  els.heroTitle.textContent = GUILD_NAME.toUpperCase();
  els.heroTagline.textContent = GUILD_TAGLINE;
  els.heroDesc.textContent = HERO_DESC;
  els.footerGuildName.textContent = GUILD_NAME;
  renderNewsGrid();
  refreshQuestUI();
  initSidebarState();
  initTalentBuilder();
  initReleaseCountdown();
  showPage(currentPage);
}

// Builds the News grid on the Home page: the newest current Ankündigung
// always gets its own tile up front (goblin artwork + a short auto
// summary of its text), followed by the hand-written NEWS_ITEMS above.
// It stays there exactly as long as that announcement exists — the
// instant it's edited to empty or deleted, this recomputes from
// scratch and the tile is simply gone. Clicking it jumps to the
// Ankündigungen page.
// Scrolls the news carousel by exactly one card's width in the given
// direction (-1 = left/prev, 1 = right/next), however many cards are
// currently visible at once.
function scrollNewsCarousel(direction){
  const track = els.newsGrid;
  if (!track) return;
  const card = track.querySelector('.news-card');
  const gap = 18;
  const step = card ? card.getBoundingClientRect().width + gap : track.clientWidth;
  track.scrollBy({ left: direction * step, behavior: 'smooth' });
}

// Hides the arrows entirely when every card already fits on screen at
// once, and disables whichever arrow would scroll past the start/end.
function updateNewsCarouselArrows(){
  const track = els.newsGrid;
  if (!track || !els.newsPrevBtn || !els.newsNextBtn) return;
  const canScroll = track.scrollWidth > track.clientWidth + 2;
  els.newsPrevBtn.classList.toggle('hidden', !canScroll);
  els.newsNextBtn.classList.toggle('hidden', !canScroll);
  if (!canScroll) return;
  els.newsPrevBtn.disabled = track.scrollLeft <= 2;
  els.newsNextBtn.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
}

function renderNewsGrid(){
  /** @type {NewsItem[]} */
  const items = [];
  const latestRaw = sortedAnnouncements()[0];
  const latest = latestRaw ? normalizeAnnouncement(latestRaw) : null;
  if (latest){
    items.push({
      title: latest.title || 'Neue Ankündigung',
      blurb: summarizeAnnouncementText(latest.text),
      image: NEWS_ANNOUNCEMENT_IMAGE,
      linkPage: 'announcements'
    });
  }
  // Always exactly one patch-notes tile (never one per update), shown
  // right after the announcement tile — official Blizzard patch notes /
  // hotfixes are the most "official" of the auto-generated cards, so
  // they take priority over the general Wowhead news tile below.
  if (wowheadPatchNotesItem){
    items.push({
      title: wowheadPatchNotesItem.title,
      blurb: wowheadPatchNotesItem.blurb || 'Neue Patch Notes — antippen zum Lesen.',
      image: wowheadPatchNotesItem.image || null,
      linkUrl: wowheadPatchNotesItem.url,
      badge: 'Blizzard Patch Notes · via Wowhead'
    });
  }
  // Always exactly one general Wowhead tile (never one per update) — its
  // content just gets replaced in place whenever fetchWowheadNews() finds
  // a newer post. Skipped if it's the very same article already shown as
  // the patch-notes tile above, so the same post never appears twice.
  if (wowheadNewsItem && (!wowheadPatchNotesItem || wowheadNewsItem.url !== wowheadPatchNotesItem.url)){
    items.push({
      title: wowheadNewsItem.title,
      blurb: wowheadNewsItem.blurb || 'Neuer Artikel auf Wowhead — antippen zum Lesen.',
      image: wowheadNewsItem.image || null,
      linkUrl: wowheadNewsItem.url,
      badge: 'Wowhead · WoW: Forever'
    });
  }
  items.push(...NEWS_ITEMS);
  // A logged-out visitor can't do anything with a login-gated tile (e.g.
  // the Klassen-Umfrage, which just dead-ends at a login prompt) — drop
  // those for them rather than showing a card they can't use.
  const loggedIn = !!discordIdentity;
  const now = Date.now();
  // Only real news: no filler tiles; items with `until` disappear then.
  const visibleItems = items.filter(item => (loggedIn || !item.requiresLogin) && !(item.until && now > item.until));
  const section = document.getElementById('newsSection');
  if (section) section.classList.toggle('hidden', !visibleItems.length);
  els.newsGrid.innerHTML = visibleItems.map((item, idx) => {
    const thumbStyle = item.image ? ` style="background-image:url('${escapeHtml(item.image)}')"` : '';
    const isLink = !!(item.linkPage || item.linkUrl);
    const isPlaceholder = !item.image && !isLink && !item.badge;
    const cardClass = 'news-card' + (isLink ? ' news-card-link' : '') + (isPlaceholder ? ' news-card-placeholder' : '');
    const dataAttr = isLink ? ` data-news-link-idx="${idx}"` : '';
    const badgeHtml = item.badge ? `<span class="news-badge">${escapeHtml(item.badge)}</span>` : '';
    return `<div class="${cardClass}"${dataAttr}>
      <div class="news-thumb"${thumbStyle}>${item.image ? '' : (isPlaceholder ? '📜' : 'Bild folgt')}${badgeHtml}</div>
      <div class="news-body">
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.blurb)}</p>
      </div>
    </div>`;
  }).join('');
  els.newsGrid.querySelectorAll('[data-news-link-idx]').forEach(card => {
    const item = visibleItems[Number(card.getAttribute('data-news-link-idx'))];
    if (!item) return;
    if (item.linkUrl) card.addEventListener('click', () => window.open(item.linkUrl, '_blank', 'noopener'));
    else if (item.linkPage) card.addEventListener('click', () => showPage(item.linkPage));
  });
  els.newsGrid.scrollLeft = 0;
  updateNewsCarouselArrows();
}
els.newsPrevBtn.addEventListener('click', () => scrollNewsCarousel(-1));
els.newsNextBtn.addEventListener('click', () => scrollNewsCarousel(1));
els.newsGrid.addEventListener('scroll', updateNewsCarouselArrows);
window.addEventListener('resize', updateNewsCarouselArrows);
