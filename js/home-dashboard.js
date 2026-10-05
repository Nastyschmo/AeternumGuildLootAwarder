// Home page dashboard ("Welcome"), shown below the hero — what's relevant
// for whoever is looking:
//  - Guests / applicants (logged out or not a member yet): who we are,
//    who we're looking for (only when recruitingNeeds names classes),
//    "So bewirbst du dich" in three steps, and the apply button.
//  - Members: a compact hero, the next 7 days as a strip (raid days from
//    GUILD_RAID_WEEKDAYS, each raid with the own status), the next raid with the own sign-up /
//    line-up status, open votes (only when there are any), the newest
//    announcement, the own recent loot and shortcuts.
//  - Officers / admins additionally get "Zu tun": untouched applications,
//    raids whose sign-up closed without a line-up, unpublished line-ups
//    close to the start, open Loot-Runden with items left.
// Guests can't read members / raids / loot, so officers' and admins'
// browsers keep a small public summary up to date (publicStats: members,
// mains, planned raids, items awarded — README § 6f, read: everyone),
// written only when a number changed; "Wer wir sind" shows it.
// Reads the raid / loot listeners (js/raids.js, js/loot.js,
// js/loot-session.js) — started here for members — so no new data.

function renderHomeDashboard(){
  const root = document.getElementById('homeDashboard');
  if (!root) return;
  const member = !!discordIdentity && isMemberOrHigher();
  // Members get a slim hero so the dashboard is on the first screen.
  document.getElementById('heroSection').classList.toggle('hero-compact', member);
  homeHeroCta(member);
  if (!member){ root.innerHTML = homeGuestHtml(); homeWire(root); return; }
  raidSync();
  lootSync();
  if (isOfficerOrAdmin()) lootSessionSync();
  if (isOfficerOrAdmin()) homeUpdatePublicStats();
  const votes = homeVotesHtml();
  root.innerHTML = `
    ${isOfficerOrAdmin() ? homeTodoHtml() : ''}
    <div class="home-dash-grid">
      ${homeNextRaidHtml()}
      ${votes}
      ${homeAnnouncementHtml(!votes)}
      ${homeLootHtml()}
      ${homeShortcutsHtml()}
    </div>`;
  homeWire(root);
}

/** Hero button: what's most useful right now. @param {boolean} member */
function homeHeroCta(member){
  const btn = els.heroCtaBtn;
  let target = 'recruit', label = 'Jetzt bewerben';
  if (member){
    if (questPendingPollItems().length){ target = 'forever'; label = 'Zur Abstimmung'; }
    else { target = 'raids'; label = 'Zum Raid-Kalender'; }
  }
  btn.dataset.target = target;
  btn.textContent = label;
}

/** A dashboard card. @param {string} title @param {string} body @param {string} [cls] */
function homeCard(title, body, cls){
  return `<div class="tac-card home-card${cls ? ' ' + cls : ''}"><div class="home-card-title">${title}</div>${body}</div>`;
}
/** @param {string} page @param {string} label @param {boolean} [primary] */
function homeLink(page, label, primary){
  return `<button type="button" class="btn ${primary ? 'btn-teal' : 'btn-ghost'} btn-sm" data-home-page="${page}">${label}</button>`;
}

// ---------------------------------------------------------------- public stats
/** Current numbers (officer / admin view of the data). @returns {Omit<PublicStats, 'updatedAt'>} */
function homeComputeStats(){
  const now = Date.now();
  const roles = Object.values(state.discordRoles || {});
  return {
    members: roles.filter(r => r && ['member', 'officer', 'admin'].includes(r.role)).length,
    raiders: Object.values(state.characterProfiles || {}).reduce((n, p) => n + p.characters.filter(characterIsRaider).length, 0),
    raidsPlanned: Object.values(raidEvents).filter(e => e.start > now).length,
    itemsAwarded: Object.keys(lootAwards).length
  };
}
let homeStatsWriting = false;
/** Write publicStats when a number changed (officers / admins, once raids and loot have loaded). */
function homeUpdatePublicStats(){
  if (!db || homeStatsWriting || !raidEventsLoaded || !lootAwardsLoaded) return;
  const next = homeComputeStats();
  const prev = state.publicStats;
  if (prev && Object.keys(next).every(k => prev[k] === next[k])) return;
  homeStatsWriting = true;
  db.ref(`${DB_PATH}/publicStats`).set({ ...next, updatedAt: Date.now() })
    .catch(() => { /* rules not updated yet — guests just see no numbers */ })
    .finally(() => { homeStatsWriting = false; });
}
/** Numbers row for guests ('' when unknown). */
function homeStatsHtml(){
  const s = state.publicStats;
  if (!s) return '';
  /** @param {number} n @param {string} one @param {string} many */
  const item = (n, one, many) => ({ n, label: n === 1 ? one : many });
  const items = [
    item(s.members, 'Mitglied', 'Mitglieder'),
    item(s.raiders, 'Raid-Main', 'Raid-Mains'),
    item(s.raidsPlanned, 'Raid geplant', 'Raids geplant'),
    item(s.itemsAwarded, 'Item vergeben', 'Items vergeben')
  ].filter(x => x.n > 0);
  if (!items.length) return '';
  return `<div class="home-stats">${items.map(x => `<div><b>${x.n}</b><span>${x.label}</span></div>`).join('')}</div>`;
}

// ---------------------------------------------------------------- guests
function homeGuestHtml(){
  const badges = recruitingNeedsBadges(state.recruitingNeeds || {});
  const step = (n, title, text) => `<li><span class="home-step-num">${n}</span><div><b>${title}</b><p>${text}</p></div></li>`;
  return `<div class="home-dash-grid home-dash-guest">
    ${homeCard('Wer wir sind', `
      <p class="home-text">${escapeHtml(GUILD_NAME)} ist eine deutschsprachige <b>${escapeHtml(GUILD_FACTION)}</b>-Gilde auf <b>${escapeHtml(GUILD_TAGLINE)}</b> und startet gemeinsam in <b>World of Warcraft: Forever</b> (Launch ${new Date(WOW_FOREVER_RELEASE_MS).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })}).</p>
      <dl class="home-facts">
        <div><dt>Fraktion</dt><dd>${escapeHtml(GUILD_FACTION)}</dd></div>
        <div><dt>Raidtage</dt><dd>${escapeHtml(GUILD_RAID_DAYS)}</dd></div>
        <div><dt>Forever-Server</dt><dd>${escapeHtml(GUILD_FOREVER_RULESET)}-Ruleset</dd></div>
      </dl>
      ${homeStatsHtml()}
      <p class="home-text">Wir raiden zusammen, planen Aufstellung und Loot transparent hier auf der Seite und helfen uns gegenseitig mit Berufen, BiS-Listen und Guides.${badges ? '' : ' Wir freuen uns über jede Bewerbung — egal welche Klasse.'}</p>`, badges ? '' : 'home-card-wide')}
    ${badges ? homeCard('Aktuell gesucht', `<div class="recruit-need-badges">${badges}</div><p class="bis-hint">Wir freuen uns aber über jede Bewerbung.</p>`) : ''}
    ${homeCard('So bewirbst du dich', `
      <ol class="home-steps">
        ${step(1, 'Mit Discord anmelden', 'Oben rechts — damit wir wissen, wer Du bist.')}
        ${step(2, 'Bewerbungs-Chat ausfüllen', 'Ein paar Fragen zu Dir, Deinen Charakteren, Berufen und Logs.')}
        ${step(3, 'Gespräch', 'Ein Offizier meldet sich bei Dir auf Discord.')}
      </ol>
      <div class="forever-actions">${homeLink('recruit', 'Jetzt bewerben', true)}</div>`, 'home-card-wide')}
    ${homeCard('Schon mal reinschauen', `
      <p class="home-text">Auch ohne Mitgliedschaft offen: Talentplaner, BiS-Planer und Links & Tools rund um WoW: Forever.</p>
      <div class="home-links">${homeLink('talentbuilder', 'Talentplaner')}${homeLink('bis', 'BiS-Planer')}${homeLink('forevertools', 'Links & Tools')}</div>`, 'home-card-wide')}
  </div>`;
}

// ---------------------------------------------------------------- members
/** Own status for a raid: in / signed / no / todo / closed. @param {string} id @param {RaidEvent} e */
function homeRaidStatus(id, e){
  const uid = discordIdentity.id;
  if (e.rosterPublished && raidCompPicked(id, e).some(s => s.uid === uid)) return 'in';
  const best = raidUserSignup(id, uid);
  if (best) return best.status === 'no' ? 'no' : 'signed';
  return raidPhase(e) === 'signup' ? 'todo' : 'closed';
}
const HOME_RAID_STATUS = {
  in: ['✓', 'In der Aufstellung'], signed: ['●', 'Angemeldet'], no: ['✗', 'Abgesagt'],
  todo: ['!', 'Noch nicht angemeldet'], closed: ['–', 'Anmeldung geschlossen']
};
/** Start of the local day of ms. @param {number} ms */
function homeDayStart(ms){
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** The next 7 days: raid days and each raid with the own status. */
function homeWeekHtml(){
  const today = homeDayStart(Date.now());
  const officer = isOfficerOrAdmin();
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const from = d.getTime();
    const to = homeDayStart(from + 36 * 3600000);
    const raids = Object.entries(raidEvents).filter(([, e]) => e.start >= from && e.start < to).sort((a, z) => a[1].start - z[1].start);
    const raidDay = GUILD_RAID_WEEKDAYS.includes(d.getDay());
    const label = i === 0 ? 'Heute' : i === 1 ? 'Morgen' : d.toLocaleDateString('de-DE', { weekday: 'short' });
    days.push(`<div class="home-day${raidDay ? ' raid-day' : ''}${raids.length ? ' has-raid' : ''}">
      <div class="home-day-head"><b>${escapeHtml(label)}</b><span>${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</span></div>
      ${raids.map(([id, e]) => {
        const st = homeRaidStatus(id, e);
        return `<button type="button" class="home-day-raid st-${st}" data-home-raid="${escapeHtml(id)}" title="${escapeHtml(`${e.title} · ${HOME_RAID_STATUS[st][1]}`)}">
          <span class="home-day-st">${HOME_RAID_STATUS[st][0]}</span><span class="home-day-title">${escapeHtml(e.instance || e.title)}</span>
          <span class="home-day-time">${new Date(e.start).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>
        </button>`;
      }).join('')}
      ${!raids.length && raidDay ? `<span class="home-day-empty">${officer ? 'Raidtag — kein Raid angelegt' : 'Raidtag'}</span>` : ''}
    </div>`);
  }
  return `<div class="home-week">${days.join('')}</div>
    <p class="home-week-legend">${Object.values(HOME_RAID_STATUS).map(([icon, text]) => `<span>${icon} ${text}</span>`).join('')}</p>`;
}

function homeNextRaidHtml(){
  const now = Date.now();
  const uid = discordIdentity.id;
  const upcoming = Object.entries(raidEvents).filter(([, e]) => now < raidDayEnd(e)).sort((a, z) => a[1].start - z[1].start);
  if (!upcoming.length) return homeCard('Raids · nächste 7 Tage', `${homeWeekHtml()}<p class="home-text">${raidLoadError ? escapeHtml(raidLoadError) : 'Noch kein Raid geplant.'}</p><div class="home-links">${homeLink('raids', 'Zum Raid-Kalender')}</div>`, 'home-card-raid home-card-wide');
  const [id, e] = upcoming[0];
  const phase = raidPhase(e);
  const mine = Object.entries((raidSignups[id] || {})[uid] || {});
  const inLineup = raidCompPicked(id, e).filter(s => s.uid === uid);
  let status;
  if (inLineup.length && e.rosterPublished) status = `<p class="home-status home-status-good">✓ Du bist in der Aufstellung: ${inLineup.map(raidChipHtml).join(' ')}</p>`;
  else if (mine.length) status = `<p class="home-status">Angemeldet: ${mine.map(([k, s]) => `${raidChipHtml({ uid, charKey: k, ...s })} <span class="bis-item-meta">${RAID_STATUS_LABELS[s.status]}</span>`).join(' ')}${e.rosterPublished ? ' <span class="bis-item-meta">· auf der Ersatzbank</span>' : ''}</p>`;
  else if (phase === 'signup') status = '<p class="home-status home-status-todo">Du bist noch nicht angemeldet.</p>';
  else status = '<p class="home-status">Die Anmeldung ist geschlossen.</p>';
  const more = upcoming.length - 1;
  const r = raidRoster(id);
  return homeCard('Raids · nächste 7 Tage', `
    ${homeWeekHtml()}
    <div class="home-card-sub">Nächster Raid</div>
    <div class="raid-date">${escapeHtml(raidDateLabel(e.start))} <span class="raid-phase raid-phase-${phase}">${RAID_PHASE_LABELS[phase]}</span></div>
    <div class="home-raid-title">${escapeHtml(e.title)}${raidEventSize(e) ? ` <span class="bis-item-meta">${raidEventSize(e)}er</span>` : ''}</div>
    <p class="bis-item-meta">${r.players} Spieler dabei · ${r.tank.length} T · ${r.healer.length} H · ${r.damage.length} DD</p>
    ${status}
    <div class="home-links">
      <button type="button" class="btn ${phase === 'signup' && !mine.length ? 'btn-teal' : 'btn-ghost'} btn-sm" data-home-raid="${escapeHtml(id)}">${phase === 'signup' && !mine.length ? 'Jetzt anmelden' : 'Raid öffnen'}</button>
      ${more ? homeLink('raids', `+ ${more} ${more === 1 ? 'weiterer Raid' : 'weitere Raids'}`) : ''}
    </div>`, 'home-card-raid home-card-wide');
}

/** Open votes — '' when there's nothing to vote on (the card is left out). */
function homeVotesHtml(){
  const items = questPendingPollItems();
  if (!items.length) return '';
  return homeCard(`Abstimmungen <span class="loot-tag loot-tag-hr">${items.length} offen</span>`, `
    <p class="home-text">Deine Stimme fehlt noch bei:</p>
    <div class="home-votes">${items.map(it => `<button type="button" class="home-vote" data-home-page="${it.page}"><span class="nav-quest-badge" aria-hidden="true">!</span><span>${escapeHtml(it.title)}</span><span class="home-vote-go">Abstimmen →</span></button>`).join('')}</div>`);
}

/** @param {boolean} [wide] */
function homeAnnouncementHtml(wide){
  const raw = sortedAnnouncements()[0];
  const a = raw ? normalizeAnnouncement(raw) : null;
  if (!a) return homeCard('Neueste Ankündigung', '<p class="home-text">Noch keine Ankündigungen.</p>', wide ? 'home-card-wide' : '');
  const unread = questPendingAnnouncement();
  return homeCard(`Neueste Ankündigung${unread ? ' <span class="loot-tag loot-tag-hr">neu</span>' : ''}`, `
    <div class="home-raid-title">${escapeHtml(a.title || 'Ankündigung')}</div>
    <p class="bis-item-meta">${escapeHtml(new Date(a.createdAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }))}${a.authorName ? ` · ${escapeHtml(a.authorName)}` : ''}</p>
    <p class="home-text">${escapeHtml(summarizeAnnouncementText(a.text))}</p>
    <div class="home-links">${homeLink('announcements', unread ? 'Lesen' : 'Alle Ankündigungen')}</div>`, wide ? 'home-card-wide' : '');
}

function homeLootHtml(){
  const mine = Object.values(lootAwards).filter(a => a.uid === discordIdentity.id).sort((a, z) => z.at - a.at).slice(0, 4);
  return homeCard('Mein Loot', mine.length
    ? `${mine.map(a => `<div class="loot-award-row">${lootItemHtml(a.itemId, a.itemName)} → ${lootCharHtml(a)} <span class="bis-item-meta">${escapeHtml(new Date(a.at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }))}</span></div>`).join('')}
      <div class="home-links">${homeLink('loot', 'Ganze Historie')}</div>`
    : `<p class="home-text">${lootLoadError ? escapeHtml(lootLoadError) : 'Noch kein Loot bekommen — das ändert sich hoffentlich bald.'}</p>`);
}

function homeShortcutsHtml(){
  const prof = state.characterProfiles[discordIdentity.id];
  const chars = prof ? prof.characters : [];
  const noBis = chars.filter(c => characterIsRaider(c) && !(c.bisSets && Object.keys(c.bisSets).length)).length;
  const hints = [
    !chars.length ? 'Leg Deine Charaktere an — sonst wirst Du bei Raids nicht richtig zugeordnet.' : '',
    chars.length && chars.some(c => !c.classId) ? 'Bei einem Charakter fehlt noch die Klasse.' : '',
    noBis ? `${noBis === 1 ? 'Ein Main hat' : `${noBis} Mains haben`} noch keine BiS-Liste — die hilft bei der Loot-Vergabe.` : ''
  ].filter(Boolean);
  return homeCard('Mein Charakter', `
    ${chars.length ? `<p class="home-text">${chars.map(c => `<span class="raid-chip${characterIsRaider(c) ? '' : ' raid-chip-twink'}" style="--class-color:${c.classId && CLASS_MAP[c.classId] ? CLASS_MAP[c.classId].color : 'var(--text-muted)'}">${escapeHtml(c.name)}</span>`).join(' ')}</p>` : ''}
    ${hints.map(h => `<p class="home-status home-status-todo">${escapeHtml(h)}</p>`).join('')}
    <div class="home-links">${homeLink('mychar', 'Meine Charaktere')}${homeLink('bis', 'BiS-Planer')}${homeLink('talentbuilder', 'Talentplaner')}</div>`);
}

// ---------------------------------------------------------------- officers
function homeTodoHtml(){
  const now = Date.now();
  /** @type {{ text: string, action: string }[]} */
  const todo = [];
  const apps = questPendingApplicationsCount();
  if (apps) todo.push({ text: `${apps} ${apps === 1 ? 'neue Bewerbung wartet' : 'neue Bewerbungen warten'} auf Bearbeitung.`, action: homeLink('recruit', 'Bewerbungen') });
  for (const [id, e] of Object.entries(raidEvents).sort((a, z) => a[1].start - z[1].start)) {
    const phase = raidPhase(e);
    if (phase === 'done') continue;
    const picked = raidCompPicked(id, e).length;
    const open = `<button type="button" class="btn btn-ghost btn-sm" data-home-raid="${escapeHtml(id)}" data-home-tab="comp">Aufstellung</button>`;
    if (phase === 'closed' && !picked) todo.push({ text: `${e.title} (${raidDateLabel(e.start)}): Anmeldung geschlossen, aber noch keine Aufstellung.`, action: open });
    else if (picked && !e.rosterPublished && e.start - now < 48 * 3600000) todo.push({ text: `${e.title} (${raidDateLabel(e.start)}): Aufstellung ist noch nicht veröffentlicht.`, action: open });
    if (phase === 'running' && !lootEventSessions(id).length) todo.push({ text: `${e.title} läuft heute — noch keine Loot-Runde gestartet.`, action: `<button type="button" class="btn btn-ghost btn-sm" data-home-raid="${escapeHtml(id)}" data-home-tab="loot">Loot</button>` });
  }
  // Raid days of the next 7 days without a raid.
  const today = homeDayStart(now);
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    if (!GUILD_RAID_WEEKDAYS.includes(d.getDay())) continue;
    const from = d.getTime(), to = homeDayStart(from + 36 * 3600000);
    if (Object.values(raidEvents).some(e => e.start >= from && e.start < to)) continue;
    todo.push({ text: `${d.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit' })} ist Raidtag — noch kein Raid angelegt.`, action: '<button type="button" class="btn btn-ghost btn-sm" data-home-newraid>Raid anlegen</button>' });
  }
  for (const [eventId, byId] of Object.entries(lootSessions)) {
    const e = raidEvents[eventId];
    for (const s of Object.values(byId)) {
      if (s.closedAt) continue;
      const left = Object.values(s.items).filter(it => !it.done).length;
      if (left && e) todo.push({ text: `${e.title}: Loot-Runde mit ${left} offenen ${left === 1 ? 'Item' : 'Items'}.`, action: `<button type="button" class="btn btn-ghost btn-sm" data-home-raid="${escapeHtml(eventId)}" data-home-tab="loot">Zur Runde</button>` });
    }
  }
  return homeCard('Zu tun <span class="bis-item-meta">für Offiziere</span>', todo.length
    ? `<ul class="home-todo">${todo.map(t => `<li><span>${escapeHtml(t.text)}</span>${t.action}</li>`).join('')}</ul>`
    : '<p class="home-text">✓ Nichts offen — alles erledigt.</p>', 'home-card-todo');
}

/** @param {HTMLElement} root */
function homeWire(root){
  root.querySelectorAll('[data-home-page]').forEach(btn => btn.addEventListener('click', () => showPage(btn.getAttribute('data-home-page'))));
  root.querySelectorAll('[data-home-newraid]').forEach(btn => btn.addEventListener('click', () => {
    raidOpen('');
    raidEditId = '';
    showPage('raids');
  }));
  root.querySelectorAll('[data-home-raid]').forEach(btn => btn.addEventListener('click', () => {
    const tab = /** @type {'' | 'signup' | 'comp' | 'loot'} */ (btn.getAttribute('data-home-tab') || '');
    raidOpenId = btn.getAttribute('data-home-raid');
    raidTab = tab;
    try { sessionStorage.setItem(RAID_VIEW_KEY, JSON.stringify({ id: raidOpenId, tab })); } catch (e){ /* ignore */ }
    showPage('raids');
  }));
}
