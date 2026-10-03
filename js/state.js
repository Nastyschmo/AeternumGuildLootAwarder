// Data model: normalizers for everything stored in Firebase,
// defaultState()/normalizeState(), derived getters (sorted
// applications/polls, poll results, ...), the in-memory state variables, and
// saveData().
//
// Classic (non-module) script — shares the global scope with the other
// js/*.js files; load order is set in index.html. Code that runs at load
// time may only use files loaded before this one.

// The state of an empty database. Built through normalizeState() so it
// always has every key a loaded state has (it used to be a hand-written
// object that lacked classDeepDives, classDiveUpdateHistory and
// classDiveSources).
/** @returns {State} */
function defaultState(){
  return normalizeState({});
}

// A character needs at least a name to be worth keeping; realmSlug falls
// back to the guild's own realm (the overwhelmingly common case) rather
// than being dropped, and ids are (re)generated if missing so existing
// rows always have something stable to key a DOM/click-handler off of.
let characterProfileIdCounter = 0;
function nextCharacterProfileId(){
  characterProfileIdCounter += 1;
  return 'char' + Date.now().toString(36) + characterProfileIdCounter;
}
/** @returns {CharacterProfile} */
function normalizeCharacterProfile(entry){
  if (!entry || typeof entry !== 'object') return { nickname: '', characters: [] };
  const rawChars = Array.isArray(entry.characters) ? entry.characters : [];
  const characters = [];
  let mainAssigned = false;
  for (const c of rawChars){
    if (characters.length >= CHARACTER_PROFILE_MAX_CHARACTERS) break;
    if (!c || typeof c.name !== 'string' || !c.name.trim()) continue;
    const isMain = !!c.isMain && !mainAssigned;
    if (isMain) mainAssigned = true;
    characters.push({
      id: (typeof c.id === 'string' && c.id) ? c.id : nextCharacterProfileId(),
      name: c.name.trim().slice(0, 24),
      realmSlug: (typeof c.realmSlug === 'string' && c.realmSlug.trim()) ? c.realmSlug.trim().toLowerCase().slice(0, 40) : DEFAULT_REALM_SLUG,
      isMain
    });
  }
  // If nothing was explicitly marked Main, the first character quietly
  // becomes it — there's always an unambiguous "main" to show elsewhere
  // (Manage access, Bewerbungen) once at least one character exists.
  if (!mainAssigned && characters.length) characters[0].isMain = true;
  return {
    nickname: (typeof entry.nickname === 'string') ? entry.nickname.trim().slice(0, 30) : '',
    characters
  };
}
function mainCharacterOf(profile){
  if (!profile || !Array.isArray(profile.characters)) return null;
  return profile.characters.find(c => c.isMain) || profile.characters[0] || null;
}

// Shared "how do we display this member" helper — nickname (if they've
// set one under "User Settings" (formerly "Meine Charaktere verwalten") with the Discord username
// alongside in parentheses, otherwise just the Discord username. Used
// everywhere a member shows up by name to Admins/Offiziere (Manage
// access, the class/spec voting details, the per-member voting table)
// so it's consistent across the whole page.
function memberDisplayLabel(uid, username){
  const fallback = username || 'Unbekannt';
  const profile = uid ? (state.characterProfiles || {})[uid] : null;
  return (profile && profile.nickname) ? `${profile.nickname} (${fallback})` : fallback;
}

/** @returns {Announcement | null} */
function normalizeAnnouncement(a){
  if (!a || typeof a.text !== 'string' || !a.text.trim()) return null;
  const html = looksLikeHtml(a.text) ? sanitizeRichText(a.text) : legacyPlainTextToHtml(a.text);
  if (!stripHtmlToText(html).trim()) return null;
  // Title is plain text (shown escaped, never as HTML) — optional, since
  // announcements posted before this feature existed have none; those
  // fall back to a snippet of the body when rendered.
  const title = (typeof a.title === 'string') ? a.title.trim().slice(0, 120) : '';
  return {
    text: html,
    title,
    authorName: (typeof a.authorName === 'string' && a.authorName) ? a.authorName : 'Unbekannt',
    authorId: typeof a.authorId === 'string' ? a.authorId : '',
    createdAt: (typeof a.createdAt === 'number' && a.createdAt > 0) ? a.createdAt : 0,
    editedAt: (typeof a.editedAt === 'number' && a.editedAt > 0) ? a.editedAt : 0
  };
}

// ---------------------------------------------------------------------
// Custom polls — a generic tool for Admins/Officers to build their own
// votings (title + arbitrary options + single/multiple choice + a
// duration + visibility/anonymity settings). Deliberately separate from
// the hard-coded WoW Forever class/spec survey above, which stays a
// one-off, code-defined thing.
// ---------------------------------------------------------------------
const POLL_MIN_OPTIONS = 2;
const POLL_MAX_OPTIONS = 10;
const POLL_MIN_DURATION_DAYS = 1;
const POLL_MAX_DURATION_DAYS = 90;
const POLL_DAY_MS = 24 * 60 * 60 * 1000;

// Defensive coercion for one poll — re-validates every field on every
// load, same reasoning as normalizeAnnouncement/normalizeForeverEntry.
/** @returns {Poll | null} */
function normalizePoll(p){
  if (!p || typeof p.title !== 'string' || !p.title.trim()) return null;
  const title = p.title.trim().slice(0, 150);

  const rawOptions = Array.isArray(p.options) ? p.options : [];
  const seenIds = new Set();
  const options = [];
  for (const o of rawOptions){
    if (!o || typeof o.id !== 'string' || !o.id || typeof o.label !== 'string' || !o.label.trim()) continue;
    if (seenIds.has(o.id)) continue;
    seenIds.add(o.id);
    options.push({ id: o.id, label: o.label.trim().slice(0, 80) });
    if (options.length >= POLL_MAX_OPTIONS) break;
  }
  if (options.length < POLL_MIN_OPTIONS) return null;
  const validOptionIds = new Set(options.map(o => o.id));

  const multipleChoice = !!p.multipleChoice;
  const resultsVisible = p.resultsVisible !== false; // default true
  const anonymous = !!p.anonymous;
  let durationDays = Number(p.durationDays);
  if (!Number.isFinite(durationDays) || durationDays < POLL_MIN_DURATION_DAYS) durationDays = POLL_MIN_DURATION_DAYS;
  if (durationDays > POLL_MAX_DURATION_DAYS) durationDays = POLL_MAX_DURATION_DAYS;
  const createdAt = (typeof p.createdAt === 'number' && p.createdAt > 0) ? p.createdAt : 0;
  const expiresAt = (typeof p.expiresAt === 'number' && p.expiresAt > 0) ? p.expiresAt : (createdAt ? createdAt + durationDays * POLL_DAY_MS : 0);

  const rawVotes = (p.votes && typeof p.votes === 'object') ? p.votes : {};
  /** @type {Record<DiscordId, PollVote>} */
  const votes = {};
  for (const uid of Object.keys(rawVotes)){
    const v = rawVotes[uid];
    if (!v) continue;
    const rawChoices = Array.isArray(v.choices) ? v.choices : [];
    let choices = rawChoices.filter(c => typeof c === 'string' && validOptionIds.has(c));
    choices = Array.from(new Set(choices));
    if (!multipleChoice) choices = choices.slice(0, 1);
    if (!choices.length) continue;
    votes[uid] = {
      username: (typeof v.username === 'string' && v.username) ? v.username : 'Unbekannt',
      choices
    };
  }

  return {
    title, options, multipleChoice, resultsVisible, anonymous, durationDays, createdAt, expiresAt,
    closed: !!p.closed,
    createdByName: (typeof p.createdByName === 'string' && p.createdByName) ? p.createdByName : 'Unbekannt',
    createdById: typeof p.createdById === 'string' ? p.createdById : '',
    votes
  };
}

// Classic/TBC/SoD professions cap out at 375 skill (not Retail's much
// higher caps), so that's the ceiling for a profession "level" answer —
// shared between the chat form's own input validation and the
// normalizer that re-validates whatever actually got saved.
const PROFESSION_MAX_LEVEL = 375;
// Applicants can be logging their characters on any of Warcraft Logs'
// separate sites (Classic Era "vanilla", Season of Discovery "sod",
// Classic Progression/Anniversary "classic" or "fresh", or plain
// retail), each under its own subdomain, with a locale prefix in front
// of that for non-English UIs (e.g. de.fresh.warcraftlogs.com) — so
// this only pins the domain itself (warcraftlogs.com) and otherwise
// accepts any subdomain chain in front of it, rather than guessing at
// which specific game-version subdomains exist today.
const WARCRAFTLOGS_URL_RE = /^https:\/\/([a-z0-9-]+\.)*warcraftlogs\.com(\/|$)/i;

// ---------------------------------------------------------------------
// Recruiting — member-submitted applications, plus an Admin/Officer-
// editable "which classes/specs are we currently looking for" list that
// the Home page teaser and this page's overview both read from.
//
// The application form used to be one flat page (normalizeApplicationV1
// below); it's since been rebuilt as a chat-bot-style Q&A flow with a
// different, richer set of fields (normalizeApplicationV2). Both
// normalizers stay around and normalizeApplication() dispatches between
// them by the entry's `version` field, so any application submitted
// through the old form before this change keeps loading and displaying
// correctly — nothing already in Firebase needs migrating.
// ---------------------------------------------------------------------
// Review status is independent of the form version (v1 and v2
// applications are flagged the exact same way), so it's applied here in
// the dispatcher rather than duplicated inside each normalizer.
// How long an applicant has to wait (since applying, or since their last
// reminder) before they're allowed to nudge the recruiting team again —
// see sendApplicationReminder() / recruitApplyGateState().
const APPLICATION_REMINDER_COOLDOWN_DAYS = 14;
const APPLICATION_STATUSES = {
  open:      { label: 'Offen' },
  claimed:   { label: 'Wird bearbeitet' },
  interview: { label: 'Gespräch geplant' },
  candidate: { label: 'Potenzieller Kandidat' },
  accepted:  { label: 'Angenommen' },
  rejected:  { label: 'Abgelehnt' }
};
/** @returns {ApplicationStatusFields} */
function normalizeApplicationStatusFields(entry){
  const status = (entry && APPLICATION_STATUSES[entry.status]) ? entry.status : 'open';
  const claimedBy = (entry && typeof entry.claimedBy === 'string') ? entry.claimedBy : '';
  const claimedByName = (entry && typeof entry.claimedByName === 'string') ? entry.claimedByName.slice(0, 80) : '';
  const interviewAt = (entry && typeof entry.interviewAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.interviewAt)) ? entry.interviewAt : '';
  // lastReminderAt gates the applicant's own "Erinnerung senden" button
  // (see APPLICATION_REMINDER_COOLDOWN_DAYS) — starts unset, so the
  // cooldown is measured from createdAt until the first reminder is sent.
  const lastReminderAt = (entry && typeof entry.lastReminderAt === 'number' && entry.lastReminderAt > 0) ? entry.lastReminderAt : 0;
  // Stamped only by the Worker's /notify-application (see
  // sendDiscordNotification) — notifiedAt when the "new application" DM
  // went out, reminderSentAt for the last reminder DM. Kept here so an
  // Officer saving the whole record (status change, notes, …) doesn't
  // wipe them; reminderSentAt is what the Worker's cooldown trusts.
  const notifiedAt = (entry && typeof entry.notifiedAt === 'number' && entry.notifiedAt > 0) ? entry.notifiedAt : 0;
  const reminderSentAt = (entry && typeof entry.reminderSentAt === 'number' && entry.reminderSentAt > 0) ? entry.reminderSentAt : 0;
  // Recruiting-team-only notes — never shown to the applicant, see the
  // "Notizen" textarea in the officer card and applyAccessControl().
  const notes = (entry && typeof entry.notes === 'string') ? entry.notes.slice(0, 2000) : '';
  return { status, claimedBy, claimedByName, interviewAt, lastReminderAt: Math.max(lastReminderAt, reminderSentAt), notifiedAt, reminderSentAt, notes };
}
/** @returns {Application | null} */
function normalizeApplication(entry){
  if (!entry || typeof entry !== 'object') return null;
  const base = entry.version === 2 ? normalizeApplicationV2(entry) : normalizeApplicationV1(entry);
  if (!base) return null;
  return Object.assign(base, normalizeApplicationStatusFields(entry));
}
/** @returns {Omit<ApplicationV1, keyof ApplicationStatusFields> | null} */
function normalizeApplicationV1(entry){
  if (!entry || typeof entry !== 'object') return null;
  // Applications can list more than one class (an applicant's main plus
  // an alt, say) — `picks` is an array of { classId, specs }. Older
  // applications saved before this existed only ever had a single
  // top-level classId/specs pair; treat that as a one-item picks list so
  // applications submitted before this change keep displaying correctly.
  const rawPicks = Array.isArray(entry.picks)
    ? entry.picks
    : (typeof entry.classId === 'string' ? [{ classId: entry.classId, specs: entry.specs }] : []);
  const seenClassIds = new Set();
  const picks = [];
  for (const p of rawPicks){
    if (!p || typeof p.classId !== 'string' || !CLASS_MAP[p.classId]) continue;
    if (seenClassIds.has(p.classId)) continue; // no duplicate class rows
    const validSpecIds = foreverSpecsForClass(p.classId).map(s => s.id);
    const rawSpecs = Array.isArray(p.specs) ? p.specs : [];
    const specs = Array.from(new Set(rawSpecs.filter(s => typeof s === 'string' && validSpecIds.includes(s))));
    if (!specs.length) continue;
    seenClassIds.add(p.classId);
    picks.push({ classId: p.classId, specs });
  }
  const experience = typeof entry.experience === 'string' ? entry.experience.trim().slice(0, 1500) : '';
  // Professions used to be a free-text field; now it's a checkbox list of
  // known PROFESSIONS ids. Keep both shapes readable: a legacy string
  // (already-submitted real applications) is kept as-is and shown
  // verbatim, while an array is filtered/deduped against the known
  // profession ids so a tampered/stale client can't smuggle junk in.
  let professions;
  if (Array.isArray(entry.professions)){
    professions = Array.from(new Set(entry.professions.filter(p => typeof p === 'string' && PROFESSION_MAP[p])));
  } else if (typeof entry.professions === 'string' && entry.professions.trim()){
    professions = entry.professions.trim().slice(0, 200); // legacy free-text
  } else {
    professions = [];
  }
  const hasProfessions = Array.isArray(professions) ? professions.length > 0 : !!professions;
  // At least one class+spec pick, experience and professions are the
  // required questions (marked with * on the form) — anything missing
  // one of these is treated as not a real application.
  if (!picks.length || !experience || !hasProfessions) return null;
  const nameAge = typeof entry.nameAge === 'string' ? entry.nameAge.trim().slice(0, 200) : '';
  const logs = typeof entry.logs === 'string' ? entry.logs.trim().slice(0, 800) : '';
  const remarks = typeof entry.remarks === 'string' ? entry.remarks.trim().slice(0, 1000) : '';
  return {
    picks, experience, professions, nameAge, logs, remarks,
    applicantName: (typeof entry.applicantName === 'string' && entry.applicantName) ? entry.applicantName.slice(0, 80) : 'Unbekannt',
    applicantId: typeof entry.applicantId === 'string' ? entry.applicantId : '',
    createdAt: (typeof entry.createdAt === 'number' && entry.createdAt > 0) ? entry.createdAt : 0
  };
}
// The current chat-bot form's shape — see APPLY_CHAT_STEPS further down
// for where each field is collected. firstName, age, picks (1–2 classes)
// and characters (one name per picked class) are the required
// questions; everything else is optional and defaults to "nothing
// given" rather than failing the whole application.
/** @returns {Omit<ApplicationV2, keyof ApplicationStatusFields> | null} */
function normalizeApplicationV2(entry){
  if (!entry || typeof entry !== 'object') return null;
  const firstName = typeof entry.firstName === 'string' ? entry.firstName.trim().slice(0, 60) : '';
  const age = (typeof entry.age === 'number' && entry.age >= 12 && entry.age <= 99) ? entry.age : null;

  const seenClassIds = new Set();
  const picks = [];
  for (const p of (Array.isArray(entry.picks) ? entry.picks : [])){
    if (picks.length >= 2) break;
    if (!p || typeof p.classId !== 'string' || !CLASS_MAP[p.classId] || seenClassIds.has(p.classId)) continue;
    const validSpecIds = foreverSpecsForClass(p.classId).map(s => s.id);
    const specs = Array.from(new Set((Array.isArray(p.specs) ? p.specs : []).filter(s => typeof s === 'string' && validSpecIds.includes(s))));
    if (!specs.length) continue;
    seenClassIds.add(p.classId);
    picks.push({ classId: p.classId, specs });
  }

  const rawCharacters = (entry.characters && typeof entry.characters === 'object') ? entry.characters : {};
  /** @type {Record<ClassId, string>} */
  const characters = {};
  picks.forEach(p => {
    const name = typeof rawCharacters[p.classId] === 'string' ? rawCharacters[p.classId].trim().slice(0, 24) : '';
    if (name) characters[p.classId] = name;
  });

  if (!firstName || !age || !picks.length || Object.keys(characters).length !== picks.length) return null;

  const normProfList = (list) => Array.from(
    new Map(
      (Array.isArray(list) ? list : [])
        .filter(x => x && typeof x.professionId === 'string' && PROFESSION_MAP[x.professionId]
          && (x.level === 'max' || (typeof x.level === 'number' && x.level >= 1 && x.level <= PROFESSION_MAX_LEVEL)))
        .map(x => [x.professionId, { professionId: x.professionId, level: x.level }])
    ).values()
  );
  const rawCharProf = (entry.charProfessions && typeof entry.charProfessions === 'object') ? entry.charProfessions : {};
  /** @type {Record<ClassId, ProfessionLevel[]>} */
  const charProfessions = {};
  picks.forEach(p => { charProfessions[p.classId] = normProfList(rawCharProf[p.classId]).slice(0, 2); });
  const extraProfessions = normProfList(entry.extraProfessions).filter(x => !PROFESSION_MAP[x.professionId].primary);

  const nickname = typeof entry.nickname === 'string' ? entry.nickname.trim().slice(0, 30) : '';

  // Logs are per-character (entry.charLogs: {classId: url}) since an
  // applicant with 2 classes needs to give logs for each. Applications
  // submitted before this (a single entry.logsUrl string, not attributed
  // to any particular class) are migrated here rather than dropped —
  // the one link is attributed to the first applied class so it still
  // shows up somewhere on the card.
  const rawCharLogs = (entry.charLogs && typeof entry.charLogs === 'object') ? entry.charLogs : null;
  /** @type {Record<ClassId, string>} */
  const charLogs = {};
  if (rawCharLogs){
    picks.forEach(p => {
      const v = typeof rawCharLogs[p.classId] === 'string' ? rawCharLogs[p.classId].trim().slice(0, 300) : '';
      if (v && WARCRAFTLOGS_URL_RE.test(v)) charLogs[p.classId] = v;
    });
  } else if (typeof entry.logsUrl === 'string' && entry.logsUrl && WARCRAFTLOGS_URL_RE.test(entry.logsUrl) && picks.length){
    charLogs[picks[0].classId] = entry.logsUrl.trim().slice(0, 300);
  }

  const remarks = typeof entry.remarks === 'string' ? entry.remarks.trim().slice(0, 1000) : '';

  return {
    version: 2,
    firstName, nickname, age, picks, characters, charProfessions, extraProfessions, charLogs, remarks,
    applicantName: (typeof entry.applicantName === 'string' && entry.applicantName) ? entry.applicantName.slice(0, 80) : 'Unbekannt',
    applicantId: typeof entry.applicantId === 'string' ? entry.applicantId : '',
    createdAt: (typeof entry.createdAt === 'number' && entry.createdAt > 0) ? entry.createdAt : 0
  };
}
/** @returns {RecruitingNeeds} */
function normalizeRecruitingNeeds(raw){
  const src = (raw && typeof raw === 'object') ? raw : {};
  /** @type {RecruitingNeeds} */
  const out = {};
  CLASSES.forEach(c => {
    const validSpecIds = foreverSpecsForClass(c.id).map(s => s.id);
    const specs = Array.isArray(src[c.id]) ? Array.from(new Set(src[c.id].filter(s => validSpecIds.includes(s)))) : [];
    if (specs.length) out[c.id] = specs;
  });
  return out;
}
// ---------------------------------------------------------------------
// Class Deep Dives — one card per class: Blizzard's own class deep-dive
// write-up (pasted in and kept current by Officers/Admins) plus a dated
// "Patch-Updates" history of what's actually changed for that class over
// WoW Forever's run, so members can see both the current state and how
// it got there. Gated to Member+ (same as Ankündigungen) — see
// renderClassDeepDivesView.
// ---------------------------------------------------------------------
// Like announcements, the Deep Dive summary and each Patch-Update entry
// store a small allow-listed subset of formatted HTML (headings, bold,
// lists, and — unlike announcements — tables, since Blizzard's own class
// deep dives are usually laid out as tables) rather than plain text, so
// pasting a formatted deep dive in keeps its structure instead of
// collapsing into one unformatted wall of text. Entries saved before this
// existed are plain text and get wrapped into a paragraph instead.
/** @returns {ClassDeepDiveUpdate | null} */
function normalizeClassDeepDiveUpdate(raw){
  if (!raw || typeof raw !== 'object' || typeof raw.text !== 'string' || !raw.text.trim()) return null;
  const html = looksLikeHtml(raw.text) ? sanitizeRichText(raw.text) : legacyPlainTextToHtml(raw.text);
  if (!stripHtmlToText(html).trim()) return null;
  return {
    id: (typeof raw.id === 'string' && raw.id) ? raw.id : (Date.now() + '_' + Math.random().toString(36).slice(2, 8)),
    date: (typeof raw.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date)) ? raw.date : '',
    // Optional, forum-post-style title (e.g. "Patch-Notes 2. Oktober") —
    // same optional/trimmed/length-capped pattern as an Announcement's
    // title (normalizeAnnouncement). Entries saved before this existed
    // have none; the render side falls back to a generated title from
    // the date (see classDiveUpdateTitle()).
    title: (typeof raw.title === 'string') ? raw.title.trim().slice(0, 120) : '',
    text: html,
    createdAt: (typeof raw.createdAt === 'number' && raw.createdAt > 0) ? raw.createdAt : 0
  };
}
/** @returns {ClassDeepDiveEntry} */
function normalizeClassDeepDiveEntry(raw){
  const src = (raw && typeof raw === 'object') ? raw : {};
  let summary = '';
  if (typeof src.summary === 'string' && src.summary.trim()){
    const html = looksLikeHtml(src.summary) ? sanitizeRichText(src.summary) : legacyPlainTextToHtml(src.summary);
    if (stripHtmlToText(html).trim()) summary = html;
  }
  const summaryUpdatedAt = (typeof src.summaryUpdatedAt === 'number' && src.summaryUpdatedAt > 0) ? src.summaryUpdatedAt : 0;
  const updates = (Array.isArray(src.updates) ? src.updates : [])
    .map(normalizeClassDeepDiveUpdate)
    .filter(Boolean)
    // Newest first — by date string if both entries have one (so a
    // backfilled older patch note still sorts correctly even if it was
    // typed in later), falling back to createdAt otherwise.
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt - a.createdAt));
  return { summary, summaryUpdatedAt, updates };
}
/** @returns {State['classDeepDives']} */
function normalizeClassDeepDives(raw){
  const src = (raw && typeof raw === 'object') ? raw : {};
  /** @type {State['classDeepDives']} */
  const out = {};
  out.general = normalizeClassDeepDiveEntry(src.general);
  CLASSES.forEach(c => { out[c.id] = normalizeClassDeepDiveEntry(src[c.id]); });
  return out;
}

// ---------------------------------------------------------------------
// Class Deep Dives — two always-expanded cards pinned at the bottom of
// the page (below the per-class cards): a beta/build Update-Historie
// table, and a Quellen (sources) link list. Both are plain text/links,
// not the rich-text editor the summary/updates use above — these are
// compact table rows and link lists, not prose. Officer/Admin-editable,
// same read access as the rest of the page.
// ---------------------------------------------------------------------
/** @returns {ClassDiveHistoryEntry | null} */
function normalizeClassDiveHistoryEntry(raw){
  if (!raw || typeof raw !== 'object') return null;
  const date = (typeof raw.date === 'string') ? raw.date.trim().slice(0, 40) : '';
  const build = (typeof raw.build === 'string') ? raw.build.trim().slice(0, 20) : '';
  const text = (typeof raw.text === 'string') ? raw.text.trim().slice(0, 1000) : '';
  if (!date && !build && !text) return null;
  return { date, build, text };
}
/** @returns {State['classDiveUpdateHistory']} */
function normalizeClassDiveHistory(raw){
  const src = (raw && typeof raw === 'object') ? raw : {};
  /** @type {State['classDiveUpdateHistory']} */
  const out = {};
  Object.keys(src).forEach(id => {
    const e = normalizeClassDiveHistoryEntry(src[id]);
    if (e) out[id] = e;
  });
  return out;
}
// Only a real http(s) link is accepted — guards against a javascript:
// or data: URL ever ending up clickable, same reasoning as everywhere
// else user-supplied URLs get rendered as a link.
/** @returns {ClassDiveSource | null} */
function normalizeClassDiveSourceEntry(raw){
  if (!raw || typeof raw !== 'object') return null;
  const url = (typeof raw.url === 'string') ? raw.url.trim().slice(0, 500) : '';
  if (!/^https?:\/\//i.test(url)) return null;
  const label = (typeof raw.label === 'string' && raw.label.trim()) ? raw.label.trim().slice(0, 120) : url;
  return { label, url };
}
/** @returns {State['classDiveSources']} */
function normalizeClassDiveSources(raw){
  const src = (raw && typeof raw === 'object') ? raw : {};
  /** @type {State['classDiveSources']} */
  const out = {};
  Object.keys(src).forEach(id => {
    const e = normalizeClassDiveSourceEntry(src[id]);
    if (e) out[id] = e;
  });
  return out;
}
// The beta build history up to 2026-10-01, backfilled once as fixed seed
// content (same pattern as the hard-coded NEWS_ITEMS on Home) rather
// than needing to be retyped through the editor row by row. Not
// deletable from the UI — only entries added afterward through
// "Eintrag hinzufügen" (stored in Firebase under classDiveUpdateHistory)
// get a delete button.
const CLASSDIVE_HISTORY_SEED = [
  { date: '16. Sept.', build: '69893', text: 'Build einen Tag vor dem Start, mit vielen Änderungen gegenüber der BlizzCon-Demo. Neue Talente sind Wrack (Hexenmeister) und Flawless Execution (Schurke). Entfernt wurden Vitality, Drain Hope, Restless Blades und Balance of Nature.' },
  { date: '17. Sept.', build: '–', text: 'Beta-Start mit Levelcap 20' },
  { date: '18. Sept.', build: '69913', text: 'Kleiner Fix an Launcher, Absturzberichten und Grafikdateien. Die Liste bekannter Probleme wurde erweitert.' },
  { date: '21. Sept.', build: '–', text: 'Bessere Server-Verbindung für Spieler in der EU' },
  { date: '22.–23. Sept.', build: '69977', text: 'Mac-Fixes (Anzeige und Stabilität). Gamepad: Charakterauswahl und Quest-Gegenstände funktionieren.' },
  { date: '24. Sept.', build: '70009', text: 'Erstes großes Update mit Klassen-Balancing, Cooldown Manager, Gamepad-Optionen und Item-Änderungen (Details unten)' },
  { date: '25. Sept.', build: '–', text: 'Kurzer Server-Neustart mit Stabilitätsfixes' },
  { date: '27. Sept.', build: '–', text: 'Fehler mit überfüllter Login-Warteschlange behoben' },
  { date: '28. Sept.', build: '–', text: 'Blizzard geht gegen Goldkäufer und Echtgeldhandel in der Beta vor.' },
  { date: '29. Sept.', build: '70058', text: 'Gamepad-Fixes: Weltkarte, Aktionsleisten, Tooltips, Bücher und Briefe' },
  { date: '30. Sept.', build: '70124', text: 'Absturzberichte, Spiel-Loader, ein neues Item-Symbol. Dazu die Ankündigung zur Krieger-Wut.' },
  { date: '1. Okt.', build: 'neu', text: 'Wartung, danach Levelcap 30. Die Patch Notes folgen.' }
];
/** @returns {ApplicationWithId[]} */
function sortedApplications(){
  return Object.keys(state.applications || {})
    .map(id => Object.assign({ id }, state.applications[id]))
    .sort((a, b) => b.createdAt - a.createdAt);
}
// The signed-in person's own most recent application, if they've ever
// applied — drives the apply-gate (recruitApplyGateState): can't fill
// out a new one on top of an existing one, win or lose.
function myLatestApplication(){
  if (!discordIdentity) return null;
  const mine = sortedApplications().filter(a => a.applicantId === discordIdentity.id);
  return mine.length ? mine[0] : null;
}
// Which closed (Angenommen/Abgelehnt) applications are currently expanded
// in the list — purely local UI state (not persisted to Firebase, not
// per-user), reset on page reload. Closed applications render collapsed
// by default (see renderApplicationsList) so a long history of finished
// applications doesn't bury the ones still needing attention.
const expandedClosedApplications = new Set();
function toggleApplicationExpanded(id){
  if (expandedClosedApplications.has(id)) expandedClosedApplications.delete(id);
  else expandedClosedApplications.add(id);
  renderApplicationsList();
}
// "<Applicant> — <Char1, Char2>" — the collapsed title for a closed
// application. v1 (legacy) applications never had per-class character
// names (just a free-text nameAge field), so they collapse to just the
// applicant's name.
function applicationCollapsedTitle(a){
  const chars = (a.version === 2 && Array.isArray(a.picks))
    ? a.picks.map(p => (a.characters || {})[p.classId]).filter(Boolean).join(', ')
    : '';
  return `${a.applicantName || 'Unbekannt'}${chars ? ' — ' + chars : ''}`;
}
// Small shared formatter: "Warrior (Protection, Fury)" — used by the
// Home teaser, the recruiting-page overview, and the officer's
// applications list, so the wording stays identical everywhere.
function recruitingNeedsBadges(needs){
  return CLASSES.filter(c => (needs[c.id] || []).length).map(c => {
    const specLabels = needs[c.id].map(s => foreverSpecLabel(c.id, s)).filter(Boolean).join(', ');
    return `<span class="recruit-need-badge" style="--need-color:${c.color}">${escapeHtml(c.label)}${specLabels ? ` <em>${escapeHtml(specLabels)}</em>` : ''}</span>`;
  }).join('');
}

function pollIsExpired(poll){
  return !!(poll.expiresAt && Date.now() >= poll.expiresAt);
}
function pollIsClosed(poll){
  return !!poll.closed || pollIsExpired(poll);
}
// Live results are visible to everyone once the poll allows it or has
// ended; Officers/Admins can always see live results so they can judge
// when to step in or close it early.
function pollCanSeeResults(poll){
  return !!poll.resultsVisible || pollIsClosed(poll) || isOfficerOrAdmin();
}
function pollDaysLeftLabel(poll){
  if (pollIsClosed(poll)) return 'beendet';
  const msLeft = poll.expiresAt - Date.now();
  const daysLeft = Math.max(0, Math.ceil(msLeft / POLL_DAY_MS));
  if (daysLeft <= 0) return 'endet heute';
  return daysLeft === 1 ? 'noch 1 Tag' : `noch ${daysLeft} Tage`;
}
function pollResults(poll){
  const counts = {};
  const namesByOption = {};
  poll.options.forEach(o => { counts[o.id] = 0; namesByOption[o.id] = []; });
  let voterCount = 0;
  Object.values(poll.votes).forEach(v => {
    voterCount++;
    v.choices.forEach(optId => {
      if (counts[optId] === undefined) return;
      counts[optId]++;
      namesByOption[optId].push(v.username);
    });
  });
  return { counts, namesByOption, voterCount };
}
function pollUserChoices(poll){
  if (!discordIdentity || !poll.votes[discordIdentity.id]) return [];
  return poll.votes[discordIdentity.id].choices;
}
function sortedPolls(){
  return Object.keys(state.polls || {})
    .map(id => Object.assign({ id }, state.polls[id]))
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** @returns {State} */
function normalizeState(parsed){
  return {
    discordRoles: (parsed.discordRoles && typeof parsed.discordRoles === 'object') ? parsed.discordRoles : {},
    foreverSurvey: (() => {
      const raw = (parsed.foreverSurvey && typeof parsed.foreverSurvey === 'object') ? parsed.foreverSurvey : {};
      /** @type {State['foreverSurvey']} */
    const out = {};
      for (const uid of Object.keys(raw)) out[uid] = normalizeForeverEntry(raw[uid]);
      return out;
    })(),
    votingStatus: (() => {
      const raw = (parsed.votingStatus && typeof parsed.votingStatus === 'object') ? parsed.votingStatus : {};
      /** @type {State['votingStatus']} */
    const out = {};
      for (const id of Object.keys(raw)){
        const v = raw[id];
        out[id] = { closed: !!(v && v.closed) };
      }
      return out;
    })(),
    announcements: (() => {
      const raw = (parsed.announcements && typeof parsed.announcements === 'object') ? parsed.announcements : {};
      /** @type {State['announcements']} */
    const out = {};
      for (const id of Object.keys(raw)){
        const norm = normalizeAnnouncement(raw[id]);
        if (norm) out[id] = norm;
      }
      return out;
    })(),
    polls: (() => {
      const raw = (parsed.polls && typeof parsed.polls === 'object') ? parsed.polls : {};
      /** @type {State['polls']} */
    const out = {};
      for (const id of Object.keys(raw)){
        const norm = normalizePoll(raw[id]);
        if (norm) out[id] = norm;
      }
      return out;
    })(),
    applications: (() => {
      const raw = (parsed.applications && typeof parsed.applications === 'object') ? parsed.applications : {};
      /** @type {State['applications']} */
    const out = {};
      for (const id of Object.keys(raw)){
        const norm = normalizeApplication(raw[id]);
        if (norm) out[id] = norm;
      }
      return out;
    })(),
    recruitingNeeds: normalizeRecruitingNeeds(parsed.recruitingNeeds),
    classDeepDives: normalizeClassDeepDives(parsed.classDeepDives),
    classDiveUpdateHistory: normalizeClassDiveHistory(parsed.classDiveUpdateHistory),
    classDiveSources: normalizeClassDiveSources(parsed.classDiveSources),
    characterProfiles: (() => {
      const raw = (parsed.characterProfiles && typeof parsed.characterProfiles === 'object') ? parsed.characterProfiles : {};
      /** @type {State['characterProfiles']} */
    const out = {};
      for (const uid of Object.keys(raw)) out[uid] = normalizeCharacterProfile(raw[uid]);
      return out;
    })(),
    // Per-member "what have you already seen" markers, behind the quest
    // bell/badges (see pageQuestPending()/renderQuestBell()). Only
    // Ankündigungen needs one of these — "have you voted yet" for
    // Abstimmungen is derived straight from the vote data itself, no
    // separate seen-flag needed there.
    seenState: (() => {
      const raw = (parsed.seenState && typeof parsed.seenState === 'object') ? parsed.seenState : {};
      /** @type {State['seenState']} */
    const out = {};
      for (const uid of Object.keys(raw)){
        const v = raw[uid];
        out[uid] = { announcementsSeenAt: (v && typeof v.announcementsSeenAt === 'number' && v.announcementsSeenAt > 0) ? v.announcementsSeenAt : 0 };
      }
      return out;
    })(),
    // BiS-Planer: public set ids the Admins recommend (bisRecommended/<setId> = true).
    bisRecommended: (() => {
      const raw = (parsed.bisRecommended && typeof parsed.bisRecommended === 'object') ? parsed.bisRecommended : {};
      /** @type {State['bisRecommended']} */
      const out = {};
      for (const id of Object.keys(raw)) if (raw[id] === true) out[id] = true;
      return out;
    })()
  };
}

function isVotingClosed(votingId){
  return !!(state.votingStatus && state.votingStatus[votingId] && state.votingStatus[votingId].closed);
}
/** @type {State} */
let state = defaultState();
let foreverDraft = null; // null = not yet initialized from saved data this session
let foreverFirstPickIndex = 0; // index into foreverDraft — which pick is "wird zuerst gespielt" (First Char)
let foreverOfficerSortK = 'member', foreverOfficerSortDir = 1; // officer detail table sort (Mitglied/First Char/Second Char)
let pollComposerOptionDrafts = ['', '']; // composer's in-progress option text inputs, always >= POLL_MIN_OPTIONS
let pollVoteDrafts = {}; // { [pollId]: [optionId, ...] } — per-poll in-progress selection before "Absenden"
let pollCardManualOpen = {}; // { [pollId]: true|false } — same collapse-override convention as votings/announcements
// Chat-bot-style application flow state — see "Bewerbung chat engine"
// further down for the step definitions and rendering. applyChatAnswers
// accumulates one validated value per step (keyed by step.key);
// applyChatStepIndex is how many steps have been answered so far (also
// the index of the step currently being asked). Per-step in-progress
// drafts for the more complex steps (class picks, character names,
// profession pickers) live in their own `applyChat*Draft` variables,
// declared right next to the step that uses them.
let applyChatStepIndex = 0;
let applyChatAnswers = {};
let recruitingNeedsDraft = null; // officer's in-progress edit of state.recruitingNeeds, only written back on "Speichern"

function getByPath(obj, path){
  return path.split('/').reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

// Returns true/false so callers that need to know whether a save actually
// reached Firebase (e.g. to roll back an optimistic local update) can
// check it.
async function saveData(path){
  setStatus('Saving…', false);
  if (!db){ setStatus('Not connected to Firebase — see setup instructions', true); return false; }
  try{
    const ref = path ? db.ref(DB_PATH + '/' + path) : db.ref(DB_PATH);
    const value = path ? getByPath(state, path) : state;
    await ref.set(value === undefined ? null : value);
    return true;
  }catch(e){
    setStatus('Could not save — check your Firebase rules and connection', true);
    return false;
  }
}
