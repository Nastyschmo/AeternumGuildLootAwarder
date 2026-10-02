// @ts-check
// Shared foundation: editable guild content, Firebase/Discord/Worker config,
// role helpers, HTML escaping + rich-text sanitizing, shared
// class/profession/spec constants, and the cached DOM element map (els).
//
// Classic (non-module) script — shares the global scope with the other
// js/*.js files; load order is set in index.html. Code that runs at load
// time may only use files loaded before this one.

// ---------------------------------------------------------------------
// Easy-to-edit guild content — change these without touching layout/CSS.
// ---------------------------------------------------------------------
const GUILD_NAME = 'rude';
const GUILD_TAGLINE = 'Spineshatter-EU';
const GUILD_CREST_LETTER = 'R';
// Official WoW: Forever release date (confirmed Nov 4, 2026, 23:00 UTC —
// per Blizzard's own announcement and independently mirrored by
// Wowhead's and Icy Veins' own release-date pages/countdowns). Update
// this single line if Blizzard ever moves the date.
const WOW_FOREVER_RELEASE_MS = Date.parse('2026-11-04T23:00:00Z');
const HERO_DESC = 'Wir bereiten uns auf World of Warcraft: Forever vor. Diese Seite wächst mit — als erstes: eine Umfrage, wer welche Klasse und Spezialisierung spielen möchte.';
const INTRO_TITLE = 'Bereit für ein neues Kapitel';
const INTRO_TEXT = 'Diese Seite ist der Startpunkt der WoW Forever Gilde TBA - Gilden und Community Ankündigungen, Abstimmungen für Gilden Member, Guides, Übersicht des Raid-Kader sowie Informationen über verfügbare Berufe. Schaut regelmäßig vorbei und bleibt up2date.';
// Add a real image URL per item once you have screenshots/artwork —
// until then a placeholder tile is shown automatically.
const NEWS_VOTING_IMAGE = 'assets/news-voting.jpg';
// Reuses the same WoW: Forever logo file as the topbar countdown pill —
// see assets/logo.png (that's the guild's own uploaded logo asset, not
// a Blizzard trademark).
const NEWS_LAUNCH_IMAGE = 'assets/logo.png';
// Blizzard's own company logo for the Beta-Infos card — the guild's own
// uploaded copy of Blizzard's official logo, see assets/blizzard-logo.jpg.
const NEWS_BETA_IMAGE = 'assets/blizzard-logo.jpg';
const NEWS_ITEMS = [
  { title: 'Klassen-Umfrage ist live', blurb: 'Trag ein, welche Klasse(n) du in WoW: Forever spielen möchtest — hilft uns bei der Recruiting-Planung.', image: NEWS_VOTING_IMAGE, linkPage: 'forever', requiresLogin: true },
  { title: 'Beta-Infos folgen', blurb: 'Wir halten Euch mit wichtigen Infos zur Beta hier am laufenden!', image: NEWS_BETA_IMAGE },
  { title: 'Launch: 4. November 2026', blurb: 'Bis dahin sammeln wir hier wichtige Gildeninterne Informationen, Entscheidungen und Informationen über den Start in die neue alte Welt!', image: NEWS_LAUNCH_IMAGE }
];
// Shown (cycled, as many as needed) whenever there aren't enough real
// news items to fill a full row — keeps the grid looking intentional
// instead of lopsided, e.g. when someone's logged out and the
// Klassen-Umfrage tile (which needs a login to do anything with) is
// hidden for them, or simply before there's much news yet.
const NEWS_PLACEHOLDER_ITEMS = [
  { title: 'Hier ist noch Platz für Neuigkeiten', blurb: 'Vielleicht schon bald mit deiner Heldentat drauf?' },
  { title: 'Content-Baustelle', blurb: 'Unsere Kobolde arbeiten dran. Bitte etwas Geduld (und Kekse spenden).' },
  { title: 'Nichts zu sehen hier', blurb: 'Genau wie unser Bankfach vor dem ersten Raid-Loot.' },
  { title: 'Reserviert für Ruhm', blurb: 'Vielleicht die nächste große Ankündigung? Wer weiß.' },
  { title: 'Platzhalter Nr. 5', blurb: 'Wenn du das liest, bist du offiziell ein News-Nerd. Respekt.' }
];
const NEWS_MIN_CARD_COUNT = 5;
// Auto-generated "news" tile for the newest Ankündigung — always uses
// this messenger-goblin artwork plus a short auto-summary of the
// announcement text. Shown as long as that announcement still exists;
// disappears on its own the moment it's edited away to nothing or
// deleted. Built dynamically in renderNewsGrid() below, not part of the
// static NEWS_ITEMS list above.
const NEWS_ANNOUNCEMENT_IMAGE = 'assets/news-announcement.jpg';
const NEWS_ANNOUNCEMENT_SUMMARY_LIMIT = 170; // ~3 lines in a news-card body
function summarizeAnnouncementText(html){
  // Insert a space after block-level closing tags / line breaks first,
  // so e.g. a heading followed by a paragraph doesn't get glued into
  // one word once the tags are stripped.
  const spaced = String(html ?? '').replace(/<\/(p|div|li|h1|h2)>|<br\s*\/?>/gi, m => m + ' ');
  const text = stripHtmlToText(spaced).replace(/\s+/g, ' ').trim();
  if (text.length <= NEWS_ANNOUNCEMENT_SUMMARY_LIMIT) return text;
  let cut = text.slice(0, NEWS_ANNOUNCEMENT_SUMMARY_LIMIT);
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace > 80) cut = cut.slice(0, lastSpace);
  return cut.trim() + '…';
}

// ---- Auto-linked spell/ability names in free text (Class Deep Dives) --
// Scans rendered rich text for the class's own spellbook ability names
// (the "tabs" sections only — general abilities like "Attack"/"Block" are
// deliberately excluded, they're too generic a word to safely autolink in
// free-form prose) and wraps each mention in a span that reuses the exact
// same hover tooltip + tooltip positioning as the Talent Builder's own
// Zauberbuch panel, so an officer typing/pasting a deep dive gets live
// tooltips on every ability it mentions for free, backed by the same data.
function escapeRegExp(str){
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


// ---------------------------------------------------------------------
// FIREBASE SETUP — replace this with YOUR project's config.
// Get it from: Firebase console → Project settings → Your apps → Web app.
// This value is not secret; access control is handled by your Database
// Rules (see the README), not by hiding this object.
// ---------------------------------------------------------------------
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDlc3JJjZ2kFip-uFn8B-FW1mABjPSKgvM",
  authDomain: "aeternum-guild-loot-awards.firebaseapp.com",
  databaseURL: "https://aeternum-guild-loot-awards-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "aeternum-guild-loot-awards",
  storageBucket: "aeternum-guild-loot-awards.firebasestorage.app",
  messagingSenderId: "539427044594",
  appId: "1:539427044594:web:3f4e2f58e4eb901fc3646b",
  measurementId: "G-J9MQD020BG"
};
const DB_PATH = 'guild-loot-data';
let db = null;
let syncStarted = false;

// ---------------------------------------------------------------------
// ACCESS CONTROL — Discord login (Public Client OAuth + PKCE, no secret
// needed client-side). Only two roles now that the page is just the
// survey + homepage: Admin (can manage roles) and Guild Member. The
// first person who ever logs in automatically becomes Admin.
//
// A logged-in Discord identity by itself does NOT protect your Firebase
// data — a small Cloudflare Worker verifies each login and mints a real
// Firebase Authentication token, which is what your Database Rules
// actually check. See the README.
// ---------------------------------------------------------------------
const DISCORD_CONFIG = {
  clientId: '1547344145960407081'
};
const WORKER_URL = 'https://guildlootdiscordworker.sebastian-spiehs.workers.dev/mint-token';
// Same Worker, different endpoints — reused instead of a second Worker.
const WOWHEAD_NEWS_URL = WORKER_URL.replace(/\/mint-token$/, '/wowhead-news');
const ARMORY_CHARACTER_URL = WORKER_URL.replace(/\/mint-token$/, '/armory-character');
const WARCRAFTLOGS_CHARACTER_URL = WORKER_URL.replace(/\/mint-token$/, '/warcraftlogs-character');
const NOTIFY_APPLICATION_URL = WORKER_URL.replace(/\/mint-token$/, '/notify-application');
const DISCORD_REDIRECT_URI = window.location.origin + window.location.pathname;
// #recruit?app=<id> — a link straight into one application on the
// Bewerbung page (see pendingDeepLinkApplicationId / showPage), used by
// both the "new application" and the "reminder" Discord DMs so clicking
// them lands an Officer/Admin directly on the relevant card instead of
// just the Bewerbung page in general.
function applicationDeepLinkUrl(applicationId){
  return window.location.origin + window.location.pathname + '#recruit?app=' + encodeURIComponent(applicationId);
}
const DISCORD_IDENTITY_KEY = 'guild-loot-discord-identity';
const DISCORD_PKCE_VERIFIER_KEY = 'guild-loot-discord-pkce-verifier';
const DISCORD_OAUTH_STATE_KEY = 'guild-loot-discord-oauth-state';
const RETURN_ANCHOR_KEY = 'rude-guild-return-anchor';

function isWorkerConfigured(){
  return WORKER_URL && !WORKER_URL.includes('YOUR-WORKER-SUBDOMAIN');
}

const ACCESS_ROLES = {
  admin: { label: 'Admin' },
  officer: { label: 'Officer' },
  member: { label: 'Guild Member' },
  community: { label: 'Community' }
};
// Admins AND Officers can open/close votings and post/delete
// announcements; only Admins can manage other members' roles.
function isOfficerOrAdmin(){
  return currentRole === 'admin' || currentRole === 'officer';
}
function canManageVotings(){
  return isOfficerOrAdmin();
}
// Guild-internal content (Ankündigungen, Abstimmungen) is for actual
// guild members and up — the public "Community" role (the default for
// anyone logging in just to apply, or anyone not yet promoted) does not
// see it, even though they're logged in with Discord.
function isMemberOrHigher(){
  return currentRole === 'admin' || currentRole === 'officer' || currentRole === 'member';
}

// New Discord logins default to 'community' — a public-facing role with
// no access to guild-internal pages. An Admin/Officer promotes someone
// to 'member' once they've actually joined the guild (see the "Manage
// access" panel). The very first person ever to log in becomes Admin
// (bootstrap), same as before.
let currentRole = 'community';
let discordIdentity = null;

function isFirebaseConfigured(){
  return FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey !== 'YOUR_API_KEY'
    && FIREBASE_CONFIG.databaseURL && !FIREBASE_CONFIG.databaseURL.includes('YOUR_PROJECT');
}

function escapeHtml(str){
  return String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// Escapes text for safe HTML display, then turns any http(s)/www. URLs
// in it into real clickable links — used for applicant-submitted text
// (logs, remarks, experience) where people paste a bare URL and expect
// to click it rather than having to copy/paste it themselves. Trailing
// punctuation (a period ending the sentence, a comma, a closing
// bracket…) is kept outside the link so it doesn't get swallowed into
// the href.
function linkifyEscaped(str){
  const escaped = escapeHtml(str);
  return escaped.replace(/(https?:\/\/[^\s]+|www\.[^\s]+)/gi, (match) => {
    let url = match;
    let trail = '';
    const trailChars = ['.', ',', '!', '?', ';', ':', ')', ']', '}'];
    while (url.length && trailChars.includes(url[url.length - 1])){
      trail = url[url.length - 1] + trail;
      url = url.slice(0, -1);
    }
    if (!url) return match;
    const href = /^https?:\/\//i.test(url) ? url : 'https://' + url;
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${url}</a>${trail}`;
  });
}

function setStatus(text, isError){
  els.saveStatus.textContent = text;
  els.saveStatus.style.color = isError ? 'var(--danger-bright)' : 'var(--text-faint)';
  if (text && !isError){
    setTimeout(() => { if (els.saveStatus.textContent === text) els.saveStatus.textContent = ''; }, 1800);
  }
}

// ---------------------------------------------------------------------
// WoW Forever class survey — classes/roles, state shape, and rendering.
// WoW Forever (announced BlizzCon 2026, launches Nov 4 2026) has no
// published class/role system yet since it hasn't shipped. This maps
// classes to roles based on classic WoW conventions, adjusted per guild
// feedback (e.g. Paladin can also tank here). Easy to adjust further
// once Blizzard confirms the real system.
// ---------------------------------------------------------------------
const CLASSES = [
  { id: 'warrior', label: 'Warrior', color: '#C79C6E' },
  { id: 'paladin', label: 'Paladin', color: '#F58CBA' },
  { id: 'hunter', label: 'Hunter', color: '#ABD473' },
  { id: 'rogue', label: 'Rogue', color: '#FFF569' },
  { id: 'priest', label: 'Priest', color: '#FFFFFF' },
  { id: 'shaman', label: 'Shaman', color: '#2E9DF4' },
  { id: 'mage', label: 'Mage', color: '#69CCF0' },
  { id: 'warlock', label: 'Warlock', color: '#9482C9' },
  { id: 'druid', label: 'Druid', color: '#FF7D0A' }
];
const CLASS_MAP = Object.fromEntries(CLASSES.map(c => [c.id, c]));

// WoW Classic professions (primary + secondary), German labels, for the
// Bewerbung form's profession checkboxes. `primary` is just used to group
// them visually in two rows — every profession here is independently
// checkable (Classic's "max 2 primary professions" rule isn't enforced
// here; an applicant might list more than they'll actually keep, or be
// undecided yet).
const PROFESSIONS = [
  { id: 'alchemy', label: 'Alchemie', primary: true },
  { id: 'blacksmithing', label: 'Schmiedekunst', primary: true },
  { id: 'enchanting', label: 'Verzauberkunst', primary: true },
  { id: 'engineering', label: 'Ingenieurskunst', primary: true },
  { id: 'herbalism', label: 'Kräuterkunde', primary: true },
  { id: 'leatherworking', label: 'Lederverarbeitung', primary: true },
  { id: 'mining', label: 'Bergbau', primary: true },
  { id: 'skinning', label: 'Kürschnerei', primary: true },
  { id: 'tailoring', label: 'Schneiderei', primary: true },
  { id: 'first_aid', label: 'Erste Hilfe', primary: false },
  { id: 'cooking', label: 'Kochkunst', primary: false },
  { id: 'fishing', label: 'Angeln', primary: false }
];
const PROFESSION_MAP = Object.fromEntries(PROFESSIONS.map(p => [p.id, p]));

// ---------------------------------------------------------------------
// "Meine Charaktere" — nickname + character list per member, optionally
// enriched with live data from Blizzard's Armory (class/level/item
// level) via the Worker's /armory-character endpoint. Guild's active
// characters are on TBC Anniversary realms, so the realm slug defaults
// to the guild's own realm — members with an alt elsewhere can just
// change it.
// ---------------------------------------------------------------------
const DEFAULT_REALM_SLUG = 'spineshatter';
const CHARACTER_PROFILE_MAX_CHARACTERS = 6;
// Mirrors the Worker's BATTLENET_CLASS_ID_TO_KEY — lets fetched Armory
// data reuse the same CLASS_MAP colors/labels the rest of the page uses.
const ARMORY_CACHE_MS = 5 * 60 * 1000; // avoid re-hitting the Worker on every render
let armoryCache = {}; // 'realmSlug|name' -> { fetchedAt, result } — session-only, never persisted
// Same cache-key/session-only pattern as armoryCache above, but kept as
// its own object since WarcraftLogs is a separate Worker endpoint with
// its own independent loading/error state (a member's Armory data can
// load fine while WarcraftLogs is unconfigured, or vice versa).
const WCL_CACHE_MS = ARMORY_CACHE_MS;
let wclCache = {}; // 'realmSlug|name' -> { fetchedAt, result } — session-only, never persisted

function characterProfileCacheKey(realmSlug, name){
  return (realmSlug || '').toLowerCase() + '|' + (name || '').toLowerCase();
}

// Real WoW Classic talent specializations. Spec ids are only ever looked
// up scoped to their own class (via foreverSpecsForClass /
// foreverSpecLabel) — several classes reuse the same id (e.g. 'holy' for
// both Paladin and Priest, 'protection' for Warrior and Paladin,
// 'restoration' for Shaman and Druid), so there is deliberately no single
// global spec map. Each spec also carries a `role` ('tank' | 'healer' |
// 'damage') per classic WoW convention, used only for bar/legend
// coloring in the guild overview below — Druid is the one class with 4
// entries instead of 3: Feral splits into "Feral Combat" (Cat DPS,
// damage) and "Feral Tank" (Bear, tank) as two separate, independently
// votable specs.
const FOREVER_SPECS = {
  warrior: [{ id: 'arms', label: 'Arms', role: 'damage' }, { id: 'fury', label: 'Fury', role: 'damage' }, { id: 'protection', label: 'Protection', role: 'tank' }],
  paladin: [{ id: 'holy', label: 'Holy', role: 'healer' }, { id: 'protection', label: 'Protection', role: 'tank' }, { id: 'retribution', label: 'Retribution', role: 'damage' }],
  hunter: [{ id: 'beast_mastery', label: 'Beast Mastery', role: 'damage' }, { id: 'marksmanship', label: 'Marksmanship', role: 'damage' }, { id: 'survival', label: 'Survival', role: 'damage' }],
  rogue: [{ id: 'assassination', label: 'Assassination', role: 'damage' }, { id: 'combat', label: 'Combat', role: 'damage' }, { id: 'subtlety', label: 'Subtlety', role: 'damage' }],
  priest: [{ id: 'discipline', label: 'Discipline', role: 'healer' }, { id: 'holy', label: 'Holy', role: 'healer' }, { id: 'shadow', label: 'Shadow', role: 'damage' }],
  shaman: [{ id: 'elemental', label: 'Elemental', role: 'damage' }, { id: 'enhancement', label: 'Enhancement', role: 'damage' }, { id: 'restoration', label: 'Restoration', role: 'healer' }],
  mage: [{ id: 'arcane', label: 'Arcane', role: 'damage' }, { id: 'fire', label: 'Fire', role: 'damage' }, { id: 'frost', label: 'Frost', role: 'damage' }],
  warlock: [{ id: 'affliction', label: 'Affliction', role: 'damage' }, { id: 'demonology', label: 'Demonology', role: 'damage' }, { id: 'destruction', label: 'Destruction', role: 'damage' }],
  druid: [{ id: 'balance', label: 'Balance', role: 'damage' }, { id: 'feral', label: 'Feral Combat', role: 'damage' }, { id: 'feral_tank', label: 'Feral Tank', role: 'tank' }, { id: 'restoration', label: 'Restoration', role: 'healer' }]
};
const FOREVER_MAX_PICKS = 2;
// Tank = Blau, Healer = Grün, Damage = Gelb — used for both the overview
// bars and the legend above them.
const FOREVER_ROLE_COLORS = { tank: '#4da6ff', healer: '#3fcf6e', damage: '#f0cf6b' };
const FOREVER_ROLE_LABELS = { tank: 'Tank', healer: 'Healer', damage: 'Damage' };

function foreverSpecsForClass(classId){
  return FOREVER_SPECS[classId] || [];
}
function foreverSpecLabel(classId, specId){
  const found = foreverSpecsForClass(classId).find(s => s.id === specId);
  return found ? found.label : specId;
}
function foreverSpecRole(classId, specId){
  const found = foreverSpecsForClass(classId).find(s => s.id === specId);
  return found ? found.role : 'damage';
}
// Reuses the Talent Builder's own TALENT_DATA (class/tree icon names,
// same Wowhead CDN via talentIconUrl — see that section's own comment)
// instead of hand-listing icons a second time, so the class/spec survey
// overview always matches whatever the Talent Builder already shows.
// TALENT_DATA is keyed by the class's display name ("Warrior", …),
// which is exactly CLASS_MAP[id].label, and each class's `trees` array
// is keyed by the spec's display name — which matches FOREVER_SPECS'
// own labels for every spec except Druid's "Feral Tank": that's a
// survey-only split of Classic's single "Feral Combat" tree into its
// two voteable roles (Cat DPS / Bear tank), so it has no talent tree of
// its own and falls back to looking up the "Feral Combat" tree instead
// (FOREVER_SPEC_ICON_LABEL_OVERRIDE below) — fine for the tank half,
// since that tree's own TALENT_DATA icon (ability_racial_bearform) IS a
// bear icon, but wrong for the DPS/Cat half, which gets its own direct
// icon override instead (FOREVER_SPEC_ICON_NAME_OVERRIDE) rather than
// inheriting the bear one. 'large' (not Talent Builder's 'medium') is
// used here since these render much bigger than a talent grid square.
const FOREVER_SPEC_ICON_LABEL_OVERRIDE = { druid: { feral_tank: 'Feral Combat' } };
const FOREVER_SPEC_ICON_NAME_OVERRIDE = { druid: { feral: 'ability_druid_catform' } };
function foreverClassIconUrl(classId){
  const cls = CLASS_MAP[classId];
  const data = cls && TALENT_DATA[cls.label];
  return data ? talentIconUrl(data.icon, 'large') : null;
}
function foreverSpecIconUrl(classId, specId){
  const nameOverride = (FOREVER_SPEC_ICON_NAME_OVERRIDE[classId] || {})[specId];
  if (nameOverride) return talentIconUrl(nameOverride, 'large');
  const cls = CLASS_MAP[classId];
  const data = cls && TALENT_DATA[cls.label];
  if (!data) return null;
  const overrideLabel = (FOREVER_SPEC_ICON_LABEL_OVERRIDE[classId] || {})[specId];
  const lookupLabel = overrideLabel || foreverSpecLabel(classId, specId);
  const tree = data.trees.find(t => t.name === lookupLabel);
  return tree ? talentIconUrl(tree.icon, 'large') : null;
}

// Defensive coercion for one user's survey entry — re-validates every
// field on every load (Firebase drops empty arrays, and a class/spec
// pairing that was valid once could become stale if this map changes).
function foreverPickKey(p){
  return p ? p.classId + '|' + p.spec : '';
}
/** @returns {ForeverEntry} */
function normalizeForeverEntry(entry){
  const username = (entry && typeof entry.username === 'string') ? entry.username : '';
  const rawPicks = (entry && Array.isArray(entry.picks)) ? entry.picks : [];
  // Each pick is one CHARACTER, not one spec — the same class is allowed
  // twice (up to FOREVER_MAX_PICKS total, across any mix of classes),
  // and the two characters' specs are chosen completely independently.
  // That includes the same class+spec twice (e.g. two Frost Mage
  // characters) — that's a legitimate "I'm leveling two of the same
  // build" answer, not a duplicate to collapse. No content-based dedup
  // here; picks are only ever distinguished by their array position.
  const picks = [];
  for (const p of rawPicks){
    if (picks.length >= FOREVER_MAX_PICKS) break;
    if (!p || typeof p.classId !== 'string' || !CLASS_MAP[p.classId]) continue;
    const validSpecIds = foreverSpecsForClass(p.classId).map(s => s.id);
    if (!validSpecIds.length) continue;
    const spec = (typeof p.spec === 'string' && validSpecIds.includes(p.spec)) ? p.spec : validSpecIds[0];
    picks.push({ classId: p.classId, spec });
  }
  // "First Char" — which of this member's picks they intend to level to
  // max first. Falls back to the only pick when there's just one (an
  // unambiguous "first" already), otherwise to the first pick in list
  // order if nothing valid was stored — a member with picks always has
  // *some* answer here, even before this feature existed.
  let firstPick = (entry && entry.firstPick && typeof entry.firstPick.classId === 'string' && typeof entry.firstPick.spec === 'string')
    ? { classId: entry.firstPick.classId, spec: entry.firstPick.spec }
    : null;
  if (!picks.length){
    firstPick = null;
  } else if (!firstPick || !picks.some(p => foreverPickKey(p) === foreverPickKey(firstPick))){
    firstPick = { classId: picks[0].classId, spec: picks[0].spec };
  }
  return { username, picks, firstPick };
}

// Shared rich-text sanitizer. Used by Announcements and by Class Deep
// Dives (summary + per-update text), which both let Offis paste in
// formatted content and store a small allow-listed subset of HTML
// instead of plain text, never raw attacker-controlled markup. Tables are
// included because Blizzard's own class deep dives are usually laid out
// as tables, and losing that structure on paste was the whole complaint
// that led to this. This sanitizer re-runs on every load (not just at
// save time) as defense in depth against anything written directly to
// Firebase, bypassing the app's own editor.
const ANNOUNCE_ALLOWED_TAGS = new Set([
  'H1', 'H2', 'H3', 'B', 'STRONG', 'I', 'EM', 'U', 'BR', 'HR', 'DIV', 'P', 'UL', 'OL', 'LI', 'FONT', 'SPAN',
  'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH'
]);
// Attributes allowed on specific tags, beyond the FONT "size" exception
// below — table cells need colspan/rowspan to survive a pasted table.
const ANNOUNCE_ALLOWED_ATTRS = { TD: new Set(['colspan', 'rowspan']), TH: new Set(['colspan', 'rowspan']) };
function sanitizeRichText(html){
  const container = document.createElement('div');
  container.innerHTML = String(html ?? '');
  (function clean(/** @type {Element} */ node){
    Array.from(node.childNodes).forEach(child => {
      if (child.nodeType === 3) return; // plain text — always fine
      if (child.nodeType !== 1){ node.removeChild(child); return; }
      const el = /** @type {Element} */ (child); // nodeType 1 = element
      if (!ANNOUNCE_ALLOWED_TAGS.has(el.tagName)){
        // Drop script/style entirely (content included); unwrap anything
        // else so the text survives even if the wrapping tag doesn't.
        if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE'){
          node.removeChild(el);
          return;
        }
        while (el.firstChild) node.insertBefore(el.firstChild, el);
        node.removeChild(el);
        return;
      }
      const allowedAttrs = ANNOUNCE_ALLOWED_ATTRS[el.tagName];
      Array.from(el.attributes).forEach(attr => {
        if (el.tagName === 'FONT' && attr.name === 'size' && /^[1-7]$/.test(attr.value)) return;
        if (allowedAttrs && allowedAttrs.has(attr.name.toLowerCase()) && /^\d{1,2}$/.test(attr.value)) return;
        el.removeAttribute(attr.name);
      });
      clean(el);
    });
  })(container);
  return container.innerHTML;
}
function stripHtmlToText(html){
  const container = document.createElement('div');
  container.innerHTML = String(html ?? '');
  return container.textContent || '';
}
function looksLikeHtml(str){
  return /<\/?[a-z][\s\S]*>/i.test(str);
}
// Announcements saved before this feature existed are plain text — keep
// showing those correctly by wrapping them into a paragraph instead of
// losing their line breaks.
function legacyPlainTextToHtml(str){
  return '<p>' + escapeHtml(str).replace(/\n/g, '<br>') + '</p>';
}

const els = {
  sidebar: document.getElementById('sidebar'),
  sidebarNav: document.getElementById('sidebarNav'),
  sidebarNavMini: document.getElementById('sidebarNavMini'),
  burgerBtn: document.getElementById('burgerBtn'),
  sidebarBackdrop: document.getElementById('sidebarBackdrop'),
  navBrand: document.getElementById('navBrand'),
  navCrest: document.getElementById('navCrest'),
  navCrestMini: document.getElementById('navCrestMini'),
  navGuildName: document.getElementById('navGuildName'),
  navLoginBtn: document.getElementById('navLoginBtn'),
  questBellWrap: document.getElementById('questBellWrap'),
  questBellBtn: document.getElementById('questBellBtn'),
  questBellDot: document.getElementById('questBellDot'),
  questPopover: document.getElementById('questPopover'),
  questPopoverList: document.getElementById('questPopoverList'),
  accessControlWrap: document.getElementById('accessControlWrap'),
  accessSwitchBtn: document.getElementById('accessSwitchBtn'),
  accessBadge: document.getElementById('accessBadge'),
  accessAvatarImg: document.getElementById('accessAvatarImg'),
  accessPopover: document.getElementById('accessPopover'),
  accessPopoverName: document.getElementById('accessPopoverName'),
  accessPopoverRole: document.getElementById('accessPopoverRole'),
  accessManageBtn: document.getElementById('accessManageBtn'),
  accessLogoutBtn: document.getElementById('accessLogoutBtn'),
  accessPopoverCharacters: document.getElementById('accessPopoverCharacters'),
  accessCharactersBtn: document.getElementById('accessCharactersBtn'),
  accessModal: document.getElementById('accessModal'),
  accessModalCloseBtn: document.getElementById('accessModalCloseBtn'),
  characterModal: document.getElementById('characterModal'),
  characterModalCloseBtn: document.getElementById('characterModalCloseBtn'),
  characterNicknameInput: document.getElementById('characterNicknameInput'),
  characterComposerList: document.getElementById('characterComposerList'),
  characterAddBtn: document.getElementById('characterAddBtn'),
  characterSaveBtn: document.getElementById('characterSaveBtn'),
  characterSaveStatus: document.getElementById('characterSaveStatus'),
  voteDetailsModal: document.getElementById('voteDetailsModal'),
  voteDetailsModalTitle: document.getElementById('voteDetailsModalTitle'),
  voteDetailsModalSubtitle: document.getElementById('voteDetailsModalSubtitle'),
  voteDetailsModalList: document.getElementById('voteDetailsModalList'),
  voteDetailsModalCloseBtn: document.getElementById('voteDetailsModalCloseBtn'),
  accessMemberList: document.getElementById('accessMemberList'),
  heroTitle: document.getElementById('heroTitle'),
  heroTagline: document.getElementById('heroTagline'),
  heroDesc: document.getElementById('heroDesc'),
  heroCtaBtn: document.getElementById('heroCtaBtn'),
  introTitle: document.getElementById('introTitle'),
  introText: document.getElementById('introText'),
  newsGrid: document.getElementById('newsGrid'),
  newsPrevBtn: document.getElementById('newsPrevBtn'),
  newsNextBtn: document.getElementById('newsNextBtn'),
  footerGuildName: document.getElementById('footerGuildName'),
  foreverLoggedOut: document.getElementById('foreverLoggedOut'),
  foreverNoAccess: document.getElementById('foreverNoAccess'),
  foreverLoggedIn: document.getElementById('foreverLoggedIn'),
  foreverLoginBtn: document.getElementById('foreverLoginBtn'),
  foreverMyPicks: document.getElementById('foreverMyPicks'),
  foreverClassPicker: document.getElementById('foreverClassPicker'),
  foreverSaveBtn: document.getElementById('foreverSaveBtn'),
  foreverSaveStatus: document.getElementById('foreverSaveStatus'),
  foreverOverview: document.getElementById('foreverOverview'),
  foreverOfficerTableCard: document.getElementById('foreverOfficerTableCard'),
  foreverOfficerTable: document.getElementById('foreverOfficerTable'),
  forevertoolsList: document.getElementById('forevertoolsList'),
  announceLoggedOut: document.getElementById('announceLoggedOut'),
  announceNoAccess: document.getElementById('announceNoAccess'),
  announceLoggedIn: document.getElementById('announceLoggedIn'),
  announceLoginBtn: document.getElementById('announceLoginBtn'),
  classDivesLoggedOut: document.getElementById('classDivesLoggedOut'),
  classDivesNoAccess: document.getElementById('classDivesNoAccess'),
  classDivesList: document.getElementById('classDivesList'),
  classDivesLoginBtn: document.getElementById('classDivesLoginBtn'),
  announceComposer: document.getElementById('announceComposer'),
  announceTitleInput: document.getElementById('announceTitleInput'),
  announceToolbar: document.getElementById('announceToolbar'),
  announceEditor: document.getElementById('announceEditor'),
  announceSaveBtn: document.getElementById('announceSaveBtn'),
  announceSaveStatus: document.getElementById('announceSaveStatus'),
  announceList: document.getElementById('announceList'),
  pollComposer: document.getElementById('pollComposer'),
  pollTitleInput: document.getElementById('pollTitleInput'),
  pollOptionInputs: document.getElementById('pollOptionInputs'),
  pollAddOptionBtn: document.getElementById('pollAddOptionBtn'),
  pollDurationInput: document.getElementById('pollDurationInput'),
  pollResultsVisibleInput: document.getElementById('pollResultsVisibleInput'),
  pollAnonymousInput: document.getElementById('pollAnonymousInput'),
  pollPublishBtn: document.getElementById('pollPublishBtn'),
  pollPublishStatus: document.getElementById('pollPublishStatus'),
  pollList: document.getElementById('pollList'),
  setupScreen: document.getElementById('setupScreen'),
  discordSetupScreen: document.getElementById('discordSetupScreen'),
  workerSetupScreen: document.getElementById('workerSetupScreen'),
  setupArea: document.getElementById('setupArea'),
  publicPage: document.getElementById('publicPage'),
  saveStatus: document.getElementById('saveStatus'),
  talentSubnav: document.getElementById('talentSubnav'),
  talentClassSelector: document.getElementById('talentClassSelector'),
  talentLevelInput: document.getElementById('talentLevelInput'),
  talentLevelLabel: document.getElementById('talentLevelLabel'),
  talentPointsRemaining: document.getElementById('talentPointsRemaining'),
  talentResetAllBtn: document.getElementById('talentResetAllBtn'),
  talentTreesContainer: document.getElementById('talentTreesContainer'),
  talentTooltip: document.getElementById('talentTooltip'),
  recruitTeaserNeeds: document.getElementById('recruitTeaserNeeds'),
  recruitTeaserBtn: document.getElementById('recruitTeaserBtn'),
  recruitNeedsOverviewBadges: document.getElementById('recruitNeedsOverviewBadges'),
  recruitLoggedOut: document.getElementById('recruitLoggedOut'),
  recruitLoggedIn: document.getElementById('recruitLoggedIn'),
  recruitLoginBtn: document.getElementById('recruitLoginBtn'),
  applyChatCard: document.getElementById('applyChatCard'),
  recruitApplyNotice: document.getElementById('recruitApplyNotice'),
  recruitApplyNoticeTitle: document.getElementById('recruitApplyNoticeTitle'),
  recruitApplyNoticeBody: document.getElementById('recruitApplyNoticeBody'),
  recruitApplyNoticeActions: document.getElementById('recruitApplyNoticeActions'),
  applyChatLog: document.getElementById('applyChatLog'),
  applyChatComposer: document.getElementById('applyChatComposer'),
  applyChatQuestionBubble: document.getElementById('applyChatQuestionBubble'),
  applyChatInputArea: document.getElementById('applyChatInputArea'),
  applyChatError: document.getElementById('applyChatError'),
  applyChatSkipBtn: document.getElementById('applyChatSkipBtn'),
  applyChatNextBtn: document.getElementById('applyChatNextBtn'),
  applyChatDoneArea: document.getElementById('applyChatDoneArea'),
  applyChatRestartBtn: document.getElementById('applyChatRestartBtn'),
  applySubmitBtn: document.getElementById('applySubmitBtn'),
  applySubmitStatus: document.getElementById('applySubmitStatus'),
  recruitNeedsEditor: document.getElementById('recruitNeedsEditor'),
  recruitNeedsEditorGrid: document.getElementById('recruitNeedsEditorGrid'),
  recruitNeedsSaveBtn: document.getElementById('recruitNeedsSaveBtn'),
  recruitNeedsSaveStatus: document.getElementById('recruitNeedsSaveStatus'),
  applicationsCard: document.getElementById('applicationsCard'),
  applicationsList: document.getElementById('applicationsList'),
  mycharLoggedOut: document.getElementById('mycharLoggedOut'),
  mycharLoginBtn: document.getElementById('mycharLoginBtn'),
  mycharLoggedIn: document.getElementById('mycharLoggedIn'),
  mycharManageBtn: document.getElementById('mycharManageBtn'),
  mycharRefreshAllBtn: document.getElementById('mycharRefreshAllBtn'),
  mycharList: document.getElementById('mycharList')
};

// Coarse, human-friendly relative time in German — good enough for "how
// stale is this Armory snapshot", not meant to be precise to the minute.
function relativeTimeFromMs(ms){
  if (!ms) return null;
  const diffDays = Math.floor((Date.now() - ms) / 86400000);
  if (diffDays <= 0) return 'heute';
  if (diffDays === 1) return 'gestern';
  if (diffDays < 30) return `vor ${diffDays} Tagen`;
  const months = Math.floor(diffDays / 30);
  if (months < 12) return `vor ${months} Monat${months === 1 ? '' : 'en'}`;
  const years = Math.floor(months / 12);
  return `vor ${years} Jahr${years === 1 ? '' : 'en'}`;
}

function newPushId(path){
  try{ return db ? db.ref(DB_PATH + '/' + path).push().key : null; }catch(e){ return null; }
}
