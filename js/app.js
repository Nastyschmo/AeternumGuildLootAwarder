// App shell, loaded last: quest markers/bell, sidebar navigation (PAGES,
// showPage), access-dependent UI (applyAccessControl), global event wiring,
// renderAll(), Firebase sync listeners and bootstrap().
//
// Classic (non-module) script — shares the global scope with the other
// js/*.js files; load order is set in index.html. Code that runs at load
// time may only use files loaded before this one.
// Must stay the last script: it calls bootstrap() at the very end.

// ---------------------------------------------------------------------
// "Quest available" system — a WoW-style gold "!" on Ankündigungen /
// Abstimmungen in the sidebar, plus a topbar bell that lists everything
// open at once. Gated to Member+ (isMemberOrHigher()) since Community
// accounts can't see either page anyway. Two independent kinds of
// "pending":
//  - Ankündigungen: has a NEWER announcement been posted than the
//    timestamp this member last opened that page? Needs its own
//    per-member marker (seenState/<uid>/announcementsSeenAt), written
//    by markAnnouncementsSeen() whenever the page is opened.
//  - Abstimmungen: is there an open poll/the class survey this member
//    hasn't voted in yet? No separate marker needed — derived directly
//    from the vote data (foreverSavedEntry()/pollUserChoices()) that's
//    already there, so voting itself is what clears the "!".
// ---------------------------------------------------------------------
function newestAnnouncementAt(){
  return Object.values(state.announcements || {}).reduce((max, a) => Math.max(max, a.createdAt || 0), 0);
}
function announcementsSeenAt(){
  if (!discordIdentity) return 0;
  const s = state.seenState && state.seenState[discordIdentity.id];
  return (s && typeof s.announcementsSeenAt === 'number') ? s.announcementsSeenAt : 0;
}
function questPendingAnnouncement(){
  if (!discordIdentity || !isMemberOrHigher()) return false;
  return newestAnnouncementAt() > announcementsSeenAt();
}
// List (not just a boolean) so the quest bell can name each one —
// the class/spec survey plus every open custom poll not yet voted in.
function questPendingPollItems(){
  if (!discordIdentity || !isMemberOrHigher()) return [];
  const items = [];
  if (!isVotingClosed('forever') && !foreverSavedEntry()) items.push({ page: 'forever', title: 'Klassen & Spezialisierung' });
  sortedPolls().forEach(poll => {
    if (!pollIsClosed(poll) && pollUserChoices(poll).length === 0) items.push({ page: 'forever', title: poll.title });
  });
  return items;
}
// New applications are an Officer/Admin-only "quest", gated to
// isOfficerOrAdmin() instead of isMemberOrHigher(). Originally tracked
// like Ankündigungen (newest createdAt vs. a per-user "seen up to"
// marker), but that meant the mark cleared the instant *anyone* opened
// the page once, even though the application itself still needed to be
// worked — so it looked like the exclamation mark "never goes away"
// (every visit just re-confirms there's still unresolved work) while
// giving no actual way to resolve it. Now it's status-based instead:
// only truly untouched applications ("Offen" — see APPLICATION_STATUSES
// below) count as a quest. The moment anyone sets a status on it at all
// — even just "Wird bearbeitet" — it's considered someone's business
// and stops demanding attention from everyone else; it only becomes a
// quest again if it's explicitly set back to Offen.
function questPendingApplicationsCount(){
  if (!discordIdentity || !isOfficerOrAdmin()) return 0;
  return Object.values(state.applications || {}).filter(a => (a.status || 'open') === 'open').length;
}
function pageQuestPending(pageId){
  if (pageId === 'announcements') return questPendingAnnouncement();
  if (pageId === 'forever') return questPendingPollItems().length > 0;
  if (pageId === 'recruit') return questPendingApplicationsCount() > 0;
  if (pageId === 'support') return supportOpenCount() > 0;
  return false;
}
// Marks Ankündigungen as "seen" up to the newest post that exists right
// now. Cheap no-op if there's nothing newer than what's already stored,
// so opening the page repeatedly doesn't spam Firebase with writes.
function markAnnouncementsSeen(){
  if (!discordIdentity || !isMemberOrHigher()) return;
  const latest = newestAnnouncementAt();
  if (latest <= announcementsSeenAt()) return;
  if (!state.seenState) state.seenState = {};
  state.seenState[discordIdentity.id] = Object.assign({}, state.seenState[discordIdentity.id], { announcementsSeenAt: latest });
  refreshQuestUI();
  saveData('seenState/' + discordIdentity.id);
}
// Called after anything that can change quest state (a vote saved, a
// new announcement posted, Ankündigungen marked seen, or just a normal
// Firebase sync) so the sidebar badges and the bell stay live.
function refreshQuestUI(){
  renderSidebarNav();
  renderQuestBell();
}
function renderQuestBell(){
  const show = !!discordIdentity && isMemberOrHigher();
  els.questBellWrap.classList.toggle('hidden', !show);
  if (!show) return;
  const announcementPending = questPendingAnnouncement();
  const pollItems = questPendingPollItems();
  const applicationsCount = questPendingApplicationsCount();
  const supportCount = supportOpenCount();
  const totalCount = (announcementPending ? 1 : 0) + pollItems.length + applicationsCount + supportCount;
  // The bell icon itself is the WoW "!" quest mark — filled gold when
  // there's something pending, just its empty outline when you're
  // caught up (see the .has-pending CSS). Each item inside the dropdown
  // instead gets a "?" — the WoW quest-turn-in mark, since clicking it
  // is literally "go there to finish this one".
  els.questBellBtn.classList.toggle('has-pending', totalCount > 0);
  els.questBellDot.classList.toggle('hidden', totalCount === 0);
  els.questBellDot.textContent = totalCount > 0 ? String(totalCount) : '';
  let html = '';
  if (totalCount === 0){
    html = `<div class="quest-popover-empty">Keine offenen Quests — du bist auf dem neuesten Stand!</div>`;
  } else {
    if (announcementPending){
      html += `<div class="quest-popover-section-title">Ankündigungen</div>
        <a class="quest-popover-item" data-quest-page="announcements">
          <span class="quest-popover-item-icon" aria-hidden="true">?</span>
          <span>Neue Ankündigung(en) warten auf dich</span>
        </a>`;
    }
    if (pollItems.length){
      html += `<div class="quest-popover-section-title">Abstimmungen</div>`;
      html += pollItems.map(it => `<a class="quest-popover-item" data-quest-page="${it.page}">
          <span class="quest-popover-item-icon" aria-hidden="true">?</span>
          <span>${escapeHtml(it.title)}</span>
        </a>`).join('');
    }
    if (applicationsCount){
      html += `<div class="quest-popover-section-title">Bewerbungen</div>
        <a class="quest-popover-item" data-quest-page="recruit">
          <span class="quest-popover-item-icon" aria-hidden="true">?</span>
          <span>${applicationsCount} offene Bewerbung${applicationsCount === 1 ? '' : 'en'} (noch nicht in Bearbeitung)</span>
        </a>`;
    }
    if (supportCount){
      html += `<div class="quest-popover-section-title">Meldungen</div>
        <a class="quest-popover-item" data-quest-page="support">
          <span class="quest-popover-item-icon" aria-hidden="true">?</span>
          <span>${supportCount} offene Meldung${supportCount === 1 ? '' : 'en'} („Problem melden“)</span>
        </a>`;
    }
  }
  els.questPopoverList.innerHTML = html;
  els.questPopoverList.querySelectorAll('[data-quest-page]').forEach(a => {
    a.addEventListener('click', () => {
      showPage(a.getAttribute('data-quest-page'));
      els.questPopover.classList.add('hidden');
      maybeAutoCloseSidebarOnMobile();
    });
  });
}

// ---------------------------------------------------------------------
// Sidebar navigation — each entry is its own page (its own section in
// #pageHost, id="page-<id>"), not just a scroll target. Add a new page
// here + a matching <section class="page-section" id="page-xxx"> in the
// HTML to extend the site later.
// ---------------------------------------------------------------------
const PAGES = [
  {
    id: 'home', label: 'Home', group: 'guild',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1v-9"/></svg>'
  },
  {
    id: 'announcements', label: 'Ankündigungen', group: 'guild', show: 'member',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11v2a2 2 0 0 0 2 2h1l3 5V4L6 9H5a2 2 0 0 0-2 2Z"/><path d="M14 8a4 4 0 0 1 0 8"/><path d="M17 5a8 8 0 0 1 0 14"/></svg>'
  },
  {
    id: 'forever', label: 'Abstimmungen', group: 'guild', show: 'member',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="m8 12 3 3 5-6"/></svg>'
  },
  {
    id: 'professions', label: 'Berufe', group: 'guild', show: 'member',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 4 6 6-3 3-6-6z"/><path d="m11 7-7 7 3 3 7-7"/><path d="M4 20h7"/></svg>'
  },
  {
    id: 'recruit', label: 'Bewerbung', group: 'guild', show: 'applicant',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>'
  },
  {
    id: 'support', label: 'Meldungen', group: 'guild', show: 'officer',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/><path d="M12 8v4M12 15.5v.01"/></svg>'
  },
  {
    id: 'raids', label: 'Raids', group: 'raid', show: 'login',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="m9 15 2 2 4-4"/></svg>'
  },
  {
    id: 'bosses', label: 'Boss-Guides', group: 'raid', show: 'member',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c-4.4 0-8 3.1-8 7 0 2.4 1.3 4.5 3.3 5.8V19a1 1 0 0 0 1 1h7.4a1 1 0 0 0 1-1v-3.2c2-1.3 3.3-3.4 3.3-5.8 0-3.9-3.6-7-8-7Z"/><circle cx="9" cy="10.5" r="1.5"/><circle cx="15" cy="10.5" r="1.5"/><path d="M10 20v-2M14 20v-2"/></svg>'
  },
  {
    id: 'loot', label: 'Loot', group: 'raid', show: 'member',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h16v11H4z"/><path d="M4 9l2-5h12l2 5"/><path d="M12 9v11"/><path d="M9 14h6"/></svg>'
  },
  {
    id: 'mychar', label: 'Meine Charaktere', group: 'char',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>'
  },
  {
    id: 'bis', label: 'BiS-Planer', group: 'char',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/></svg>'
  },
  {
    id: 'classdeepdives', label: 'Klassen', group: 'know', show: 'member',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/><path d="M9 7h7M9 11h7"/></svg>'
  },
  {
    id: 'talentbuilder', label: 'Talentplaner', group: 'know',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="18" cy="12" r="2"/><circle cx="9" cy="19" r="2"/><circle cx="15" cy="19" r="2"/><path d="M12 7v3M8 11l-1 0M16 11l1 0M10.5 13 9 17M13.5 13 15 17"/></svg>'
  },
  {
    id: 'forevertools', label: 'Links & Tools', group: 'know',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>'
  }
];
// Who sees a page in the sidebar (PAGES[].show): unset = everybody,
// 'member' = members / officers / admins (pages that are guild-only or
// empty for others), 'applicant' = everybody who isn't a member yet plus
// officers / admins (Bewerbung). Only the navigation is filtered — a
// page opened by URL still shows its own login / access notice.
/** @param {{ show?: string }} p */
function pageInNav(p){
  if (p.show === 'member') return isMemberOrHigher();
  if (p.show === 'applicant') return !isMemberOrHigher() || isOfficerOrAdmin();
  // Raids: members see the calendar, guests the SR raids they can apply for.
  if (p.show === 'login') return Boolean(discordIdentity);
  if (p.show === 'officer') return isOfficerOrAdmin();
  return true;
}
// Sidebar sections, in this order; pages keep their PAGES order inside one.
const NAV_GROUPS = [
  { id: 'guild', label: 'Gilde' },
  { id: 'raid', label: 'Raid & Loot' },
  { id: 'char', label: 'Mein Charakter' },
  { id: 'know', label: 'Wissen & Tools' }
];
const SIDEBAR_COLLAPSED_KEY = 'rude-guild-sidebar-collapsed';
// Honor a page hash already in the URL (e.g. a reload, or a bookmark
// someone shared) instead of always resetting to Home.
// A Discord notification can deep-link straight to one application
// (#recruit?app=<id>) instead of just the Bewerbung page in general —
// parsed out here so showPage()'s own page-id matching never sees the
// query part, and consumed once applications actually render (see
// applyPendingApplicationDeepLink in renderApplicationsList).
let pendingDeepLinkApplicationId = null;
let currentPage = (() => {
  const raw = (window.location.hash || '').replace('#', '');
  const qIdx = raw.indexOf('?');
  if (qIdx < 0) return raw || 'home';
  try{
    const appId = new URLSearchParams(raw.slice(qIdx + 1)).get('app');
    if (appId) pendingDeepLinkApplicationId = appId;
  }catch(e){}
  return raw.slice(0, qIdx) || 'home';
})();

// Phone breakpoint match — the sidebar switches from a permanent rail
// to a slide-out drawer at the same width the CSS uses (see the
// `@media (max-width: 760px)` sidebar rules above).
const MOBILE_SIDEBAR_QUERY = '(max-width: 760px)';
function isMobileSidebarLayout(){
  return window.matchMedia ? window.matchMedia(MOBILE_SIDEBAR_QUERY).matches : window.innerWidth <= 760;
}
// On a phone, picking a page from the open drawer should both navigate
// AND close the drawer again — nobody wants to manually collapse it
// after every tap. Desktop's permanent rail is untouched by this.
function maybeAutoCloseSidebarOnMobile(){
  if (isMobileSidebarLayout()) setSidebarCollapsed(true);
}

function renderSidebarNav(){
  const pagesOf = g => PAGES.filter(p => p.group === g.id && pageInNav(p));
  const groups = NAV_GROUPS.filter(g => pagesOf(g).length);
  els.sidebarNav.innerHTML = groups.map(g => `<div class="sidebar-nav-group">
      <div class="sidebar-nav-heading">${escapeHtml(g.label)}</div>
      ${pagesOf(g).map(p => {
        const badge = pageQuestPending(p.id) ? '<span class="nav-quest-badge" title="Hier gibt\'s was zu tun!" aria-label="Neu">!</span>' : '';
        return `<a class="sidebar-nav-item ${p.id === currentPage ? 'active' : ''}" data-page="${p.id}"><span class="sidebar-nav-icon" aria-hidden="true">${p.icon}</span><span class="sidebar-nav-label">${escapeHtml(p.label)}</span>${badge}</a>`;
      }).join('')}
    </div>`).join('');
  els.sidebarNav.querySelectorAll('[data-page]').forEach(a => {
    a.addEventListener('click', () => { showPage(a.getAttribute('data-page')); maybeAutoCloseSidebarOnMobile(); });
  });
  // Mini rail: same sections, separated by a thin line.
  els.sidebarNavMini.innerHTML = groups.map(g => pagesOf(g).map(p => {
    const badge = pageQuestPending(p.id) ? '<span class="nav-quest-badge-mini" aria-hidden="true"></span>' : '';
    return `<a class="sidebar-nav-item-mini ${p.id === currentPage ? 'active' : ''}" data-page="${p.id}" title="${escapeHtml(p.label)}" aria-label="${escapeHtml(p.label)}">${p.icon}${badge}</a>`;
  }).join('')).join('<span class="sidebar-nav-mini-sep" aria-hidden="true"></span>');
  els.sidebarNavMini.querySelectorAll('[data-page]').forEach(a => {
    a.addEventListener('click', () => { showPage(a.getAttribute('data-page')); maybeAutoCloseSidebarOnMobile(); });
  });
}

// Tracks whether we've ever written a history entry for this session,
// so the very first page render replaces the load entry (no dangling
// "blank" back-step) while every navigation after that pushes a real
// one. Without this, clicking between pages never touches browser
// history at all, so pressing "back" jumps straight out of the app to
// whatever page the browser happened to have open before this one —
// which is confusing and (depending on what that was) can look like a
// bug in the guild page itself.
let historyInitialized = false;
function showPage(pageId, opts){
  opts = opts || {};
  if (!PAGES.some(p => p.id === pageId)) pageId = 'home';
  currentPage = pageId;
  document.querySelectorAll('.page-section').forEach(s => {
    s.classList.toggle('hidden', s.id !== 'page-' + pageId);
  });
  els.sidebarNav.querySelectorAll('[data-page]').forEach(a => {
    a.classList.toggle('active', a.getAttribute('data-page') === pageId);
  });
  els.sidebarNavMini.querySelectorAll('[data-page]').forEach(a => {
    a.classList.toggle('active', a.getAttribute('data-page') === pageId);
  });
  window.scrollTo({ top: 0 });
  if (!opts.fromPopState){
    try{
      const url = '#' + pageId;
      if (!historyInitialized) history.replaceState({ page: pageId }, '', url);
      else history.pushState({ page: pageId }, '', url);
    }catch(e){}
  }
  historyInitialized = true;
  // The talent tree grids are the heaviest thing on the page to build
  // (468 talent nodes across 9 classes) — render them only once someone
  // actually opens the page, not on every load.
  if (pageId === 'talentbuilder'){ renderTalentSubnav(); renderTalentBuilderPage(); }
  if (pageId === 'mychar') renderMyCharactersPage();
  // "Hilfreich forEVER" is a small, fully static list (hand-curated
  // above) — build its DOM once, the first time someone actually opens
  // the page, not on every visit and never on renderAll() (nothing
  // about it ever changes at runtime).
  if (pageId === 'forevertools') renderForeverToolsPage();
  if (pageId === 'bis') renderBisPlanner();
  if (pageId === 'home') renderHomeDashboard();
  if (pageId === 'classdeepdives') renderClassDeepDivesView();
  if (pageId === 'raids') renderRaidsPage();
  if (pageId === 'support') renderSupportPage();
  if (pageId === 'bosses') renderBossGuidesPage();
  if (pageId === 'professions') renderProfessionsPage();
  if (pageId === 'loot') renderLootPage();
  // Opening Ankündigungen is what clears its quest "!" — mark up to the
  // newest post that exists right now as seen (no-op if already caught up).
  if (pageId === 'announcements') markAnnouncementsSeen();
  // Bewerbungen's quest "!" is status-based now (questPendingApplicationsCount),
  // not seen/unseen, so there's nothing to mark here on open — it clears
  // when an application is actually set to Angenommen/Abgelehnt.
}

// Back/forward now steps through the guild page's own Home /
// Ankündigungen / Abstimmungen history instead of leaving the app.
window.addEventListener('popstate', (e) => {
  const pageId = (e.state && e.state.page) || 'home';
  showPage(pageId, { fromPopState: true });
});

function setSidebarCollapsed(collapsed){
  els.sidebar.classList.toggle('collapsed', collapsed);
  // Only the desktop rail's open/closed choice is remembered across
  // visits. On a phone the drawer is always transient — it starts
  // closed on every load and closes again after each navigation — so
  // this must NOT persist here. If it did, opening the drawer once on
  // a phone (or having the rail expanded from an earlier desktop visit
  // in the same browser) would save "expanded" and every future phone
  // page-load would start with the drawer already open — which,
  // because it's a fixed full-screen-ish overlay, sits on top of and
  // hides the burger button that's supposed to open/close it. That's
  // exactly the bug this guards against.
  if (!isMobileSidebarLayout()){
    try{ localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0'); }catch(e){}
  }
}
function initSidebarState(){
  let collapsed = isMobileSidebarLayout();
  if (!isMobileSidebarLayout()){
    try{
      const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      if (saved !== null) collapsed = saved === '1';
    }catch(e){}
  }
  setSidebarCollapsed(collapsed);
}
// If the browser window crosses from desktop-sized into phone-sized
// (resize, or rotating a tablet) while the drawer happens to be open,
// force it shut immediately — same reasoning as above: an open
// full-screen drawer must never be left sitting over the burger button
// that's meant to control it.
let wasMobileSidebarLayout = isMobileSidebarLayout();
window.addEventListener('resize', () => {
  const nowMobile = isMobileSidebarLayout();
  if (nowMobile && !wasMobileSidebarLayout) setSidebarCollapsed(true);
  wasMobileSidebarLayout = nowMobile;
});

els.burgerBtn.addEventListener('click', () => setSidebarCollapsed(!els.sidebar.classList.contains('collapsed')));
els.sidebarBackdrop.addEventListener('click', () => setSidebarCollapsed(true));
els.navBrand.addEventListener('click', () => { showPage('home'); maybeAutoCloseSidebarOnMobile(); });
els.navCrestMini.addEventListener('click', () => showPage('home'));
els.heroCtaBtn.addEventListener('click', () => showPage(els.heroCtaBtn.dataset.target || 'recruit'));
els.navLoginBtn.addEventListener('click', () => startDiscordLogin());
els.foreverLoginBtn.addEventListener('click', () => startDiscordLogin());
els.recruitLoginBtn.addEventListener('click', () => startDiscordLogin());
els.applySubmitBtn.addEventListener('click', () => submitApplication());
els.recruitNeedsSaveBtn.addEventListener('click', () => saveRecruitingNeeds());

function applyAccessControl(){
  const loggedIn = !!discordIdentity;
  els.navLoginBtn.classList.toggle('hidden', loggedIn);
  els.accessControlWrap.classList.toggle('hidden', !loggedIn);
  if (!loggedIn){
    const designRow = document.getElementById('settingsDesignRow');
    if (designRow) designRow.classList.add('hidden');
    return;
  }
  const roleLabel = (ACCESS_ROLES[currentRole] || ACCESS_ROLES.community).label;
  const myProfile = (state.characterProfiles || {})[discordIdentity.id];
  const displayName = (myProfile && myProfile.nickname) ? myProfile.nickname : discordIdentity.username;
  els.accessBadge.textContent = displayName;
  els.accessPopoverName.textContent = displayName;
  els.accessPopoverRole.textContent = roleLabel + ((myProfile && myProfile.nickname) ? ' · ' + discordIdentity.username : '');
  const mainChar = mainCharacterOf(myProfile);
  if (mainChar){
    els.accessPopoverCharacters.textContent = 'Hauptcharakter: ' + mainChar.name;
    els.accessPopoverCharacters.classList.remove('hidden');
  } else {
    els.accessPopoverCharacters.classList.add('hidden');
  }
  const avatarUrl = discordAvatarUrl(discordIdentity);
  if (avatarUrl){
    els.accessAvatarImg.src = avatarUrl;
    els.accessAvatarImg.classList.remove('hidden');
  } else {
    els.accessAvatarImg.classList.add('hidden');
  }
  els.accessManageBtn.classList.toggle('hidden', currentRole !== 'admin');
  // Design switcher in User Settings — admin-only while this is being
  // tried out, see the big comment above initDesignReveal().
  const testRow = document.getElementById('settingsTestRow');
  // Test mode: Admins, and whoever an Admin unlocked in Manage access (discordRoles/<uid>/testMode).
  if (testRow) testRow.classList.toggle('hidden', !canUseTestMode() || Boolean(RUDE_TESTMODE));
  const designRow = document.getElementById('settingsDesignRow');
  if (designRow){
    designRow.classList.toggle('hidden', currentRole !== 'admin');
    if (currentRole === 'admin') updateDesignSwitcherUI();
  }
}

els.accessSwitchBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  els.accessPopover.classList.toggle('hidden');
});
document.addEventListener('click', (e) => {
  if (!els.accessPopover.classList.contains('hidden') && !els.accessPopover.contains(/** @type {Node} */ (e.target)) && e.target !== els.accessSwitchBtn){
    els.accessPopover.classList.add('hidden');
  }
});
els.accessLogoutBtn.addEventListener('click', () => logoutDiscord());

els.questBellBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  els.questPopover.classList.toggle('hidden');
});
document.addEventListener('click', (e) => {
  if (!els.questPopover.classList.contains('hidden') && !els.questPopover.contains(/** @type {Node} */ (e.target)) && e.target !== els.questBellBtn){
    els.questPopover.classList.add('hidden');
  }
});

function renderAll(){
  applyAccessControl();
  // Re-checked on every render (cheap no-op once resolved — see
  // designRevealChecked) because currentRole only actually becomes
  // 'admin' asynchronously, sometime after the first renderAll() a login
  // triggers — the eager call in bootstrap() alone would always see the
  // default 'community' role and never show anything.
  initDesignReveal();
  renderNewsGrid();
  renderPollList();
  renderForeverView();
  renderAnnouncementsView();
  renderClassDeepDivesView();
  renderRecruitView();
  refreshQuestUI();
  renderHomeDashboard();
  // Lazy like the Talent Builder page — only (re)rendered while actually
  // open, but on every state change while open, since it shows live data
  // (own characterProfiles can change from "User Settings" (formerly "Meine Charaktere verwalten")).
  if (currentPage === 'mychar') renderMyCharactersPage();
  // BiS-Planer: login / role changes decide whether sets can be saved.
  if (currentPage === 'bis') renderBisPlanner();
  if (currentPage === 'raids') renderRaidsPage();
  if (currentPage === 'support') renderSupportPage();
  if (currentPage === 'bosses') renderBossGuidesPage();
  if (currentPage === 'professions') renderProfessionsPage();
  if (currentPage === 'loot') renderLootPage();
}

// Public, always-on: keeps state.recruitingNeeds up to date for
// everyone, logged in or not — this is what lets a logged-out visitor
// see "Aktuell gesucht" on Home/Bewerbung. It's a separate listener
// (scoped to just this one path) from startFirebaseSync() below on
// purpose: Firebase Realtime Database only grants read access to a
// `.on('value')` listener when the EXACT path it's listening at (or an
// ancestor of it) has a matching `.read` rule — a `.read: true` on a
// *child* path can't retroactively "unlock" a listener at the parent,
// so the main state listener (which listens at the root and needs
// `auth != null`) can never see this data before login. Listening here
// at `recruitingNeeds` directly is what makes its own public `.read`
// rule apply.
let publicSyncStarted = false;
function startPublicRecruitingSync(){
  if (publicSyncStarted) return;
  publicSyncStarted = true;
  db.ref(DB_PATH + '/recruitingNeeds').on('value', (snapshot) => {
    state.recruitingNeeds = normalizeRecruitingNeeds(snapshot.val());
    renderRecruitView();
  }, () => { /* not logged in yet / rules not deployed — badges just stay empty */ });
  // Guild numbers for the guests' Home (written by officers / admins,
  // js/home-dashboard.js) — same reason: read: true only works here.
  db.ref(DB_PATH + '/publicStats').on('value', (snapshot) => {
    state.publicStats = normalizePublicStats(snapshot.val());
    if (currentPage === 'home') renderHomeDashboard();
  }, () => { /* rules not deployed yet — guests just see no numbers */ });
}

// Every top-level key under DB_PATH that the page reads, except
// `applications` (handled separately below). Each one has its own
// `.read` rule (see README.md § 6f) instead of one blanket read at the
// DB_PATH root — Firebase rules can't take a read back on a child once
// a parent grants it, so a root-level read would make `applications`
// readable to every logged-in account. A new top-level key needs both
// an entry here AND its own `.read` rule, or it won't load.
const SYNCED_KEYS = [
  'discordRoles', 'foreverSurvey', 'votingStatus', 'announcements', 'polls',
  'recruitingNeeds', 'classDeepDives', 'classDiveUpdateHistory',
  'classDiveSources', 'characterProfiles', 'seenState', 'bisRecommended', 'publicStats',
  'bossGuides'
];
// Raw snapshot values per key, merged and run through normalizeState()
// as one object — so everything downstream sees exactly the same shape
// the old single root listener produced.
let remoteRaw = {};
const remoteLoaded = new Set();
let remoteApplyQueued = false;
// 'all' (Officer/Admin: the whole applications list) or 'own' (everyone
// else: only their own application, via a query the rules allow for
// applicantId == auth.uid). Starts as 'own' since that's always allowed
// and the role isn't known until discordRoles has loaded.
let applicationsMode = null;
let applicationsRef = null;

function applyRemoteState(){
  remoteApplyQueued = false;
  // Wait until every listener has answered once — running
  // ensureDiscordRole() before discordRoles has loaded would look like
  // a brand-new database and try the first-login Admin bootstrap.
  if (remoteLoaded.size < SYNCED_KEYS.length + 1) return;
  state = Object.keys(remoteRaw).length ? normalizeState(remoteRaw) : defaultState();
  const roleChanged = ensureDiscordRole();
  renderAll();
  setStatus('Synced', false);
  if (roleChanged && discordIdentity) saveData('discordRoles/' + discordIdentity.id);
  syncApplicationsListener();
}
// Batches the burst of initial snapshots (one per key) into one render.
function queueRemoteApply(){
  if (remoteApplyQueued) return;
  remoteApplyQueued = true;
  Promise.resolve().then(applyRemoteState);
}

function syncApplicationsListener(){
  const wanted = (discordIdentity && isOfficerOrAdmin()) ? 'all' : 'own';
  if (wanted === applicationsMode) return;
  if (applicationsRef) applicationsRef.off();
  applicationsMode = wanted;
  const base = db.ref(DB_PATH + '/applications');
  applicationsRef = wanted === 'all'
    ? base
    : base.orderByChild('applicantId').equalTo(discordIdentity ? discordIdentity.id : '');
  applicationsRef.on('value', (snapshot) => {
    remoteRaw.applications = snapshot.val();
    remoteLoaded.add('applications');
    queueRemoteApply();
  }, () => {
    // Rules not updated yet / no access — show no applications rather
    // than blocking the whole page from loading.
    remoteRaw.applications = null;
    remoteLoaded.add('applications');
    queueRemoteApply();
  });
}

function startFirebaseSync(){
  if (syncStarted) return;
  syncStarted = true;
  for (const key of SYNCED_KEYS){
    db.ref(DB_PATH + '/' + key).on('value', (snapshot) => {
      remoteRaw[key] = snapshot.val();
      remoteLoaded.add(key);
      queueRemoteApply();
    }, (error) => {
      setStatus('Could not sync — check your Firebase rules and connection', true);
      // A key missing its `.read` rule shouldn't keep the rest of the
      // page from loading — except discordRoles, which has to be real
      // before ensureDiscordRole() may run (see applyRemoteState).
      if (key === 'discordRoles') return;
      remoteRaw[key] = null;
      remoteLoaded.add(key);
      queueRemoteApply();
    });
  }
  syncApplicationsListener();
}

function showSetupOnly(el){
  [els.setupScreen, els.discordSetupScreen, els.workerSetupScreen].forEach(s => s.classList.toggle('hidden', s !== el));
  els.setupArea.classList.remove('hidden');
  els.publicPage.classList.add('hidden');
}
function showPublicPage(){
  els.setupArea.classList.add('hidden');
  [els.setupScreen, els.discordSetupScreen, els.workerSetupScreen].forEach(s => s.classList.add('hidden'));
  els.publicPage.classList.remove('hidden');
}

async function bootstrap(){
  renderPublicShell();
  initDesignReveal();

  if (!isFirebaseConfigured()){
    showSetupOnly(els.setupScreen);
    return;
  }
  if (!isDiscordConfigured()){
    showSetupOnly(els.discordSetupScreen);
    return;
  }
  if (!isWorkerConfigured()){
    showSetupOnly(els.workerSetupScreen);
    return;
  }

  const hint = document.getElementById('discordRedirectHint');
  if (hint) hint.textContent = DISCORD_REDIRECT_URI;

  try{
    firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.database();
  }catch(e){
    setStatus('Could not connect to Firebase — check FIREBASE_CONFIG', true);
    showSetupOnly(els.setupScreen);
    return;
  }

  showPublicPage();
  renderAll();
  startPublicRecruitingSync();
  fetchWowheadNews(); // fire-and-forget — re-renders the news grid once it lands

  // If we're returning from the Discord redirect, this exchanges the code
  // for a real Firebase login token (minted by the Worker after it
  // verified the login with Discord itself, and checked their current
  // Discord server roles — see handleDiscordCallback/ensureDiscordRole).
  const pending = await handleDiscordCallback();
  if (pending){
    try{
      await firebase.auth().signInWithCustomToken(pending.token);
      freshDiscordRoleClaim = pending.role;
    }catch(e){
      showDiscordLoginError('Could not complete login. Please try again.');
    }
  }

  // The authoritative gate: Firebase's own auth state, not just whatever
  // we have cached locally. Fires immediately with the persisted session
  // on repeat visits, so most people won't need to re-login every time.
  firebase.auth().onAuthStateChanged((user) => {
    if (user){
      discordIdentity = loadDiscordIdentity() || { id: user.uid, username: 'Guild member', avatar: null };
      startFirebaseSync();
      let returnPage = null;
      try{ returnPage = sessionStorage.getItem(RETURN_ANCHOR_KEY); sessionStorage.removeItem(RETURN_ANCHOR_KEY); }catch(e){}
      if (returnPage){
        const parts = returnPage.split('::app::');
        if (parts[1]) pendingDeepLinkApplicationId = parts[1];
        showPage(parts[0]);
      }
    } else {
      try{ localStorage.removeItem(DISCORD_IDENTITY_KEY); }catch(e){}
      discordIdentity = null;
      foreverDraft = null;
      foreverFirstPickIndex = 0;
      renderAll();
    }
  });
}

bootstrap();
