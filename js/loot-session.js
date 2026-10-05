// Loot-Runden: the Loot tab of a raid window and the voting pop-up of the
// Loot Council.
//
// Items stay tradeable for 2 hours after they drop, so a long raid hands
// out loot in several Loot-Runden (sessions): an officer starts a Runde,
// adds what dropped — RCLootCouncil CSV import (js/loot-import.js) or one
// by one via the item search — and opens the pop-up: per item the decision
// aid (lootCandidates, js/loot.js), every council member's vote and the
// award buttons. Awarding writes the loot history (lootAwards) and marks
// the item done; "Extern / frei" closes an item without a guild award
// (an external won the roll, disenchanted, bank).
//
// Soft-Reserve raids: items with a soft-reserve are rolled in game among
// the reservers (winner entered here, externals via "Extern / frei");
// Hard-Reserves (raidEvents/<id>/hr, set in the Anmeldung tab,
// js/raid-reserves.js) stay in the guild and go through the council vote.
//
// Firebase (own listener, officers / admins read + write — README § 6f):
//  - lootSessions/<eventId>/<sessionId> = { startedAt, startedBy,
//    closedAt?, items: { <key>: { itemId, itemName, at, boss?, ext?,
//    rclcName?, rclcResponse?, votes?: { <voterUid>: "<uid>|<charKey>" },
//    done?: 'award' | 'free', awardId?, doneNote? } } }
// The Loot Council = everybody with the Discord role officer or admin.

/** Items can be traded within the raid this long after they dropped. */
const LOOT_TRADE_MS = 2 * 3600 * 1000;

/** eventId -> sessionId -> session. @type {Record<string, Record<string, LootSession>>} */
let lootSessions = {};
let lootSessSyncUid = '';
let lootSessError = '';
/** The open voting pop-up. @type {null | { eventId: string, sid: string, key: string }} */
let lootModal = null;
/** Note / name typed in the pop-up (survives live re-renders). */
let lootModalNote = '';
/** "eventId|sid" of the Runde whose import / item search is unfolded. */
let lootSessOpenImport = '';
let lootSessOpenAdd = '';
/** Item search text per "eventId|sid". @type {Record<string, string>} */
const lootSessQuery = {};

function lootSessionSync(){
  const uid = (db && discordIdentity && isOfficerOrAdmin()) ? discordIdentity.id : '';
  if (!uid || uid === lootSessSyncUid) return;
  lootSessSyncUid = uid;
  db.ref(`${DB_PATH}/lootSessions`).on('value', snap => {
    /** @type {Record<string, Record<string, LootSession>>} */
    const out = {};
    for (const [eventId, byId] of Object.entries(snap.val() || {})) {
      for (const [sid, raw] of Object.entries(byId || {})) {
        const s = lootNormalizeSession(raw);
        if (s) (out[eventId] = out[eventId] || {})[sid] = s;
      }
    }
    lootSessions = out;
    lootSessError = '';
    lootRerender();
  }, () => { lootSessError = 'Keine Leserechte für Loot-Runden — Firebase-Regeln aktualisiert?'; lootRerender(); });
}

/** @param {any} raw @returns {LootSession | null} */
function lootNormalizeSession(raw){
  if (!raw || typeof raw !== 'object' || !Number(raw.startedAt)) return null;
  /** @type {Record<string, LootSessionItem>} */
  const items = {};
  for (const [k, it] of Object.entries(raw.items && typeof raw.items === 'object' ? raw.items : {})) {
    if (!it || !(Number(it.itemId) > 0)) continue;
    const votes = Object.fromEntries(Object.entries(it.votes && typeof it.votes === 'object' ? it.votes : {}).filter(([, v]) => typeof v === 'string'));
    items[k] = {
      itemId: Number(it.itemId), itemName: String(it.itemName || '').slice(0, 100), at: Number(it.at) || Number(raw.startedAt),
      boss: String(it.boss || '').slice(0, 60), ext: String(it.ext || '').slice(0, 60),
      rclcName: String(it.rclcName || '').slice(0, 40), rclcResponse: String(it.rclcResponse || '').slice(0, 40),
      votes, done: it.done === 'award' || it.done === 'free' ? it.done : '',
      awardId: String(it.awardId || ''), doneNote: String(it.doneNote || '').slice(0, 120)
    };
  }
  return { startedAt: Number(raw.startedAt), startedBy: String(raw.startedBy || ''), closedAt: Number(raw.closedAt) || 0, items };
}

/** Sessions of an event, oldest first. @param {string} eventId @returns {[string, LootSession][]} */
function lootEventSessions(eventId){
  return Object.entries(lootSessions[eventId] || {}).sort((a, z) => a[1].startedAt - z[1].startedAt);
}
/** Items of a session, in drop order. @param {LootSession} s @returns {[string, LootSessionItem][]} */
function lootSessItems(s){
  return Object.entries(s.items).sort((a, z) => a[1].at - z[1].at || a[0].localeCompare(z[0]));
}
/** DB path of the session item an award came from ('' = none). @param {string} eventId @param {string} awardId */
function lootSessionItemOfAward(eventId, awardId){
  for (const [sid, s] of Object.entries(lootSessions[eventId] || {})) {
    for (const [k, it] of Object.entries(s.items)) if (it.awardId === awardId) return `lootSessions/${eventId}/${sid}/items/${k}`;
  }
  return '';
}
/** Is the item a Hard-Reserve of the event? (by name: Forever has items under several ids) @param {RaidEvent} e @param {number} itemId */
function lootItemIsHr(e, itemId){
  if (!e || !e.hr) return false;
  const ids = Object.keys(e.hr).map(Number);
  if (ids.includes(itemId)) return true;
  const name = raidSrItemName(itemId);
  return ids.some(id => raidSrItemName(id) === name);
}
/** Characters with a soft-reserve on the item. @param {string} eventId @param {number} itemId */
function lootSrHolders(eventId, itemId){
  const name = raidSrItemName(itemId);
  return Object.entries(raidReserves[eventId] || {})
    .filter(([, r]) => r.items.some(id => id === itemId || raidSrItemName(id) === name))
    .map(([u, r]) => { const s = raidUserSignup(eventId, u); return { uid: u, charName: (s && s.charName) || r.charName || r.name, classId: (s && s.classId) || r.classId }; });
}
/** The Loot Council: uids with the role officer / admin. */
function lootCouncil(){
  return Object.entries(state.discordRoles || {}).filter(([, r]) => r && (r.role === 'officer' || r.role === 'admin')).map(([u]) => u);
}
/** @param {string} uid */
function lootPersonName(uid){
  const prof = state.characterProfiles[uid];
  const role = state.discordRoles[uid];
  return (prof && prof.nickname) || (role && role.username) || 'Unbekannt';
}
/** "21:40" @param {number} ms */
function lootTime(ms){
  return new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}
/** Trade window of an item that dropped at `at`. @param {number} at */
function lootTradeHtml(at){
  const left = at + LOOT_TRADE_MS - Date.now();
  if (left <= 0) return '<span class="loot-trade loot-trade-over" title="Seit dem Drop sind 2 Stunden vergangen">Handelszeit abgelaufen</span>';
  const min = Math.ceil(left / 60000);
  const txt = min >= 60 ? `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')} h` : `${min} min`;
  return `<span class="loot-trade${min <= 30 ? ' loot-trade-soon' : ''}" title="Items sind 2 Stunden nach dem Drop handelbar">handelbar bis ${lootTime(at + LOOT_TRADE_MS)} · noch ${txt}</span>`;
}

// ---------------------------------------------------------------- Loot tab
/** The raid window's Loot tab. @param {string} id @param {RaidEvent} e */
function lootTabHtml(id, e){
  lootSync();
  const officer = isOfficerOrAdmin();
  const awards = Object.entries(lootAwards).filter(([, a]) => a.eventId === id).sort((a, z) => z[1].at - a[1].at);
  let council = '';
  if (officer){
    lootSessionSync();
    // BiS sets and everybody's "Habe ich" for the decision aid.
    bisSyncListeners();
    bisNeedSync();
    if (!bisData) bisLoadData().then(() => { if (currentPage === 'raids') renderRaidsPage(); }).catch(() => {});
    const sessions = lootEventSessions(id);
    const anyOpen = sessions.some(([, s]) => !s.closedAt);
    council = `
      ${lootSessError ? `<p class="bis-hint raid-error">${escapeHtml(lootSessError)}</p>` : ''}
      ${sessions.length ? '' : `<div class="loot-howto">
        <b>So läuft die Loot-Vergabe:</b>
        <ol>
          <li>„Loot-Runde starten“, sobald die ersten Bosse liegen.</li>
          <li>Items hinzufügen: RCLootCouncil-Export importieren oder einzeln suchen.</li>
          <li>„Abstimmung öffnen“: Pro Item stimmt jedes Council-Mitglied für einen Charakter — mit Entscheidungshilfe (BiS, SR, Anwesenheit, Loot).</li>
          <li>Vergeben (MS / OS). Items sind nur 2 Stunden handelbar — bei langen Raids einfach die nächste Runde starten.</li>
        </ol>
      </div>`}
      ${e.srMax ? `<p class="bis-hint loot-sr-hint">Soft-Reserve-Raid: Items mit SR würfeln die Reservierer im Spiel — Gewinner im Pop-up eintragen, Externe über „Extern / frei“. ${e.hr && Object.keys(e.hr).length ? 'Hard-Reserves (HR) bleiben in der Gilde und laufen über den Loot Council.' : 'Hard-Reserves (bleiben in der Gilde) legst Du im Tab „Anmeldung“ fest.'}</p>` : ''}
      ${sessions.map(([sid, s], i) => lootSessionCardHtml(id, e, sid, s, i + 1)).join('')}
      <div class="forever-actions"><button type="button" class="btn ${anyOpen ? 'btn-ghost' : 'btn-teal'} btn-sm" data-loot-sess-new="${escapeHtml(id)}">${sessions.length ? 'Neue Loot-Runde starten' : 'Loot-Runde starten'}</button></div>`;
  }
  return `<div class="raid-tab-body">
    ${lootLoadError ? `<p class="bis-hint raid-error">${escapeHtml(lootLoadError)}</p>` : ''}
    ${council}
    <div class="loot-awarded">
      <div class="raid-col-head">Vergeben in diesem Raid <span>${awards.length}</span></div>
      ${awards.length ? awards.map(([aid, a]) => lootAwardRowHtml(aid, a, officer)).join('') : `<p class="bis-hint">${officer ? 'Noch nichts vergeben.' : 'Noch kein Loot vergeben — die Vergabe macht der Loot Council.'}</p>`}
    </div>
  </div>`;
}

/** One Loot-Runde in the Loot tab. @param {string} eventId @param {RaidEvent} e @param {string} sid @param {LootSession} s @param {number} n */
function lootSessionCardHtml(eventId, e, sid, s, n){
  const items = lootSessItems(s);
  const open = items.filter(([, it]) => !it.done);
  const ctx = `${eventId}|${sid}`;
  const firstOpen = open.length ? Math.min(...open.map(([, it]) => it.at)) : 0;
  const chip = ([, it]) => {
    const a = it.awardId ? lootAwards[it.awardId] : null;
    return `<span class="loot-sess-chip${it.done ? ' done' : ''}">${lootItemHtml(it.itemId, it.itemName)}${a ? ` → ${lootCharHtml(a)}` : it.done ? ` <span class="bis-item-meta">${escapeHtml(it.doneNote || 'frei')}</span>` : ''}${lootItemIsHr(e, it.itemId) ? ' <span class="loot-tag loot-tag-hr">HR</span>' : ''}</span>`;
  };
  const head = `<div class="loot-sess-head">
      <div><span class="raid-col-head">Loot-Runde ${n} <span>gestartet ${lootTime(s.startedAt)}${s.closedAt ? ` · abgeschlossen ${lootTime(s.closedAt)}` : ''}</span></span>
        <span class="bis-item-meta">${items.length} ${items.length === 1 ? 'Item' : 'Items'} · ${items.length - open.length} vergeben${open.length ? ` · ${open.length} offen` : ''}</span></div>
      ${firstOpen ? lootTradeHtml(firstOpen) : ''}
    </div>`;
  if (s.closedAt){
    return `<details class="loot-sess loot-sess-closed">
      <summary>${head}</summary>
      <div class="loot-sess-items">${items.map(chip).join('') || '<span class="bis-item-meta">Keine Items.</span>'}</div>
      <div class="forever-actions">
        ${items.length ? `<button type="button" class="btn btn-ghost btn-sm" data-loot-modal="${escapeHtml(ctx)}">Ansehen</button>` : ''}
        <button type="button" class="btn btn-ghost btn-sm" data-loot-sess-close="${escapeHtml(ctx)}|0">Wieder öffnen</button>
      </div>
    </details>`;
  }
  const importOpen = lootSessOpenImport === ctx;
  const addOpen = lootSessOpenAdd === ctx;
  return `<div class="loot-sess">
    ${head}
    ${items.length ? `<div class="loot-sess-items">${items.map(chip).join('')}</div>` : '<p class="bis-hint">Noch keine Items — importieren oder einzeln hinzufügen.</p>'}
    <div class="forever-actions">
      <button type="button" class="btn ${items.length ? 'btn-teal' : 'btn-ghost'} btn-sm" data-loot-modal="${escapeHtml(ctx)}" ${items.length ? '' : 'disabled'}>Abstimmung öffnen${open.length ? ` (${open.length} offen)` : ''}</button>
      <button type="button" class="btn ${importOpen ? 'btn-outline-gold' : 'btn-ghost'} btn-sm" data-loot-sess-import="${escapeHtml(ctx)}">RCLC-Import</button>
      <button type="button" class="btn ${addOpen ? 'btn-outline-gold' : 'btn-ghost'} btn-sm" data-loot-sess-additem="${escapeHtml(ctx)}">Item hinzufügen</button>
      <button type="button" class="btn btn-ghost btn-sm" data-loot-sess-close="${escapeHtml(ctx)}|1">Runde abschließen</button>
      ${items.some(([, it]) => it.done) ? '' : `<button type="button" class="btn btn-ghost btn-sm" data-loot-sess-delete="${escapeHtml(ctx)}">Runde löschen</button>`}
    </div>
    ${importOpen ? lootImportHtml(eventId, sid) : ''}
    ${addOpen ? `<div class="raid-sr-search loot-sess-add">
      <input type="search" class="apply-text-input" data-loot-sess-search="${escapeHtml(ctx)}" placeholder="Item suchen …" value="${escapeHtml(lootSessQuery[ctx] || '')}" autocomplete="off">
      <div class="raid-sr-results" data-loot-sess-results="${escapeHtml(ctx)}">${lootSearchHtml(ctx, e.instance, lootSessQuery[ctx], 'loot-sess-add')}</div>
    </div>` : ''}
  </div>`;
}

// ---------------------------------------------------------------- voting pop-up
function lootModalHtml(){
  if (!lootModal) return '';
  const { eventId, sid } = lootModal;
  const s = (lootSessions[eventId] || {})[sid];
  const e = raidEvents[eventId];
  if (!s || !e){ lootModal = null; return ''; }
  const items = lootSessItems(s);
  if (!items.length){ lootModal = null; return ''; }
  if (!s.items[lootModal.key]) lootModal.key = (items.find(([, it]) => !it.done) || items[0])[0];
  const n = lootEventSessions(eventId).findIndex(([id]) => id === sid) + 1;
  const council = lootCouncil();
  const list = items.map(([k, it]) => {
    const a = it.awardId ? lootAwards[it.awardId] : null;
    const votes = Object.keys(it.votes).length;
    const status = a ? `→ ${lootCharHtml(a)}` : it.done ? escapeHtml(it.doneNote || 'frei vergeben') : `${votes}/${council.length} Stimmen${it.votes[discordIdentity.id] ? '' : ' · <b>Du fehlst</b>'}`;
    return `<button type="button" class="loot-modal-item${k === lootModal.key ? ' active' : ''}${it.done ? ' done' : ''}" data-loot-modal-pick="${escapeHtml(k)}">
      ${lootItemHtml(it.itemId, it.itemName)}
      <span class="bis-item-meta">${lootItemIsHr(e, it.itemId) ? '<span class="loot-tag loot-tag-hr">HR</span> ' : ''}${status}</span>
    </button>`;
  }).join('');
  const open = items.filter(([, it]) => !it.done).length;
  return `<div class="access-modal loot-modal" id="lootModal" role="dialog" aria-modal="true" aria-labelledby="lootModalTitle">
    <div class="access-modal-card loot-modal-card">
      <div class="access-modal-header">
        <h2 id="lootModalTitle">Loot-Runde ${n} · ${escapeHtml(e.title)}</h2>
        <button type="button" class="btn btn-ghost btn-sm" data-loot-modal-close aria-label="Schließen">✕</button>
      </div>
      <p class="access-modal-note">${items.length} ${items.length === 1 ? 'Item' : 'Items'} · ${open} offen · Loot Council: ${council.map(u => escapeHtml(lootPersonName(u))).join(', ') || '—'}</p>
      <div class="loot-modal-body">
        <div class="loot-modal-list">${list}</div>
        <div class="loot-modal-main">${lootModalItemHtml(eventId, sid, lootModal.key, s.items[lootModal.key], council)}</div>
      </div>
    </div>
  </div>`;
}

/** Decision aid + votes for one item. @param {string} eventId @param {string} sid @param {string} key @param {LootSessionItem} it @param {string[]} council */
function lootModalItemHtml(eventId, sid, key, it, council){
  const e = raidEvents[eventId];
  const ctx = `${escapeHtml(eventId)}|${escapeHtml(sid)}|${escapeHtml(key)}`;
  const hr = lootItemIsHr(e, it.itemId);
  const sr = e.srMax ? lootSrHolders(eventId, it.itemId) : [];
  const flags = [
    hr ? '<span class="loot-tag loot-tag-hr" title="Hard-Reserve: bleibt in der Gilde, Loot Council">Hard-Reserve</span>' : '',
    sr.length ? `<span class="loot-tag loot-tag-good">SR: ${sr.map(x => escapeHtml(x.charName)).join(', ')}</span>` : '',
    it.boss ? `<span class="bis-item-meta">${escapeHtml(it.boss)}</span>` : '',
    lootTradeHtml(it.at)
  ].filter(Boolean).join(' ');
  const head = `<div class="loot-modal-item-head">
      <div class="loot-modal-item-name">${lootItemHtml(it.itemId, it.itemName)}</div>
      <div class="loot-modal-flags">${flags}</div>
      ${it.rclcName ? `<div class="bis-item-meta">RCLootCouncil: ${escapeHtml(it.rclcName)}${it.rclcResponse ? ` · ${escapeHtml(it.rclcResponse)}` : ''}</div>` : ''}
    </div>`;
  if (it.done){
    const a = it.awardId ? lootAwards[it.awardId] : null;
    return `${head}
      <div class="loot-modal-done">
        ${a ? `✓ Vergeben an ${lootCharHtml(a)} <span class="loot-tag">${LOOT_KIND_LABELS[a.kind]}</span>${a.note ? ` <span class="bis-item-meta">${escapeHtml(a.note)}</span>` : ''}`
          : `✓ ${escapeHtml(it.doneNote || 'Frei vergeben')}`}
      </div>
      <div class="forever-actions">
        <button type="button" class="btn btn-ghost btn-sm" data-loot-undo="${ctx}">Zurücknehmen</button>
        ${lootNextOpen(eventId, sid, key) ? `<button type="button" class="btn btn-teal btn-sm" data-loot-modal-pick="${escapeHtml(lootNextOpen(eventId, sid, key))}">Nächstes offenes Item →</button>` : ''}
      </div>`;
  }
  // Votes by candidate.
  /** @type {Record<string, string[]>} */
  const byCand = {};
  for (const [voter, cand] of Object.entries(it.votes)) (byCand[cand] = byCand[cand] || []).push(voter);
  const top = Math.max(0, ...Object.values(byCand).map(v => v.length));
  const mine = it.votes[discordIdentity.id] || '';
  const missing = council.filter(u => !it.votes[u]);
  // Suggested order (#), but whoever has votes moves up — most votes first.
  const rows = lootCandidates(eventId, it.itemId).map((r, i) => ({ ...r, rank: i + 1 }))
    .sort((a, z) => (byCand[z.key] || []).length - (byCand[a.key] || []).length || a.rank - z.rank);
  const bisCell = {
    yes: '<span class="loot-tag loot-tag-good">BiS</span>',
    owned: '<span class="loot-tag" title="Steht auf der BiS-Liste, aber „Habe ich“ ist angehakt">hat es</span>',
    no: '<span class="bis-item-meta">—</span>',
    none: '<span class="bis-item-meta" title="Keine BiS-Liste für diesen Spec zugewiesen">keine Liste</span>',
    private: '<span class="bis-item-meta" title="Die zugewiesene BiS-Liste ist privat — für Officer nicht lesbar">privat</span>'
  };
  const rclc = (it.rclcName || '').toLowerCase();
  const table = rows.length ? `<table class="loot-table loot-vote-table">
      <thead><tr><th>#</th><th>Charakter</th><th>BiS</th><th>SR</th><th title="In der Aufstellung bzw. „Dabei“ bei den letzten ${LOOT_ATTENDANCE_EVENTS} Raids">Anw.</th><th title="Main-Spec-Items der letzten 30 Tage">Loot 30 T.</th><th>Stimmen</th><th></th></tr></thead>
      <tbody>${rows.map(r => {
        const voters = byCand[r.key] || [];
        const lead = top > 0 && voters.length === top;
        return `<tr class="${r.tier ? 'loot-row-strong' : ''}${lead ? ' loot-row-lead' : ''}">
          <td title="Platz im Vorschlag">${r.rank}</td>
          <td>${lootCharHtml({ charName: r.s.charName || r.s.name, classId: r.s.classId })}
            <span class="bis-item-meta">${escapeHtml(foreverSpecLabel(r.s.classId, r.s.specId))}${r.isMain === false ? ' · Twink' : ''}${r.s.status === 'maybe' ? ' · vielleicht' : ''}${r.hasItem ? ' · hat es schon bekommen' : ''}${rclc && (r.s.charName || '').toLowerCase() === rclc ? ` · <b>RCLC: ${escapeHtml(it.rclcResponse || 'gewählt')}</b>` : ''}</span></td>
          <td>${bisCell[r.bis]}</td>
          <td>${r.sr ? '<span class="loot-tag loot-tag-good">SR</span>' : '<span class="bis-item-meta">—</span>'}</td>
          <td>${r.ofEvents ? `${r.attended}/${r.ofEvents}` : '<span class="bis-item-meta">—</span>'}</td>
          <td>${r.loot}</td>
          <td class="loot-votes">${voters.length ? `<b>${voters.length}</b> <span class="bis-item-meta">${voters.map(v => escapeHtml(lootPersonName(v))).join(', ')}</span>` : '<span class="bis-item-meta">—</span>'}</td>
          <td class="loot-actions">
            <button type="button" class="btn ${mine === r.key ? 'btn-outline-gold' : 'btn-ghost'} btn-sm" data-loot-vote="${ctx}|${escapeHtml(r.key)}" title="${mine === r.key ? 'Stimme zurückziehen' : 'Für diesen Charakter stimmen'}">${mine === r.key ? '★ Deine Stimme' : '☆ Stimme'}</button>
            <button type="button" class="btn btn-teal btn-sm" data-loot-give="${ctx}|${escapeHtml(r.key)}|ms" title="Als Main-Spec vergeben">MS</button>
            <button type="button" class="btn btn-ghost btn-sm" data-loot-give="${ctx}|${escapeHtml(r.key)}|os" title="Als Off-Spec vergeben">OS</button>
          </td>
        </tr>`;
      }).join('')}</tbody>
    </table>` : '<p class="bis-hint">Niemand in der Aufstellung / angemeldet.</p>';
  let modeHint = '';
  if (hr) modeHint = 'Hard-Reserve: bleibt in der Gilde — der Loot Council stimmt ab.';
  else if (e.srMax && sr.length) modeHint = `Soft-Reserve von ${sr.map(x => escapeHtml(x.charName)).join(', ')}: im Spiel würfeln lassen und den Gewinner hier vergeben (Externe: „Extern / frei“).`;
  else if (e.srMax) modeHint = 'Kein Soft-Reserve auf dem Item: freier Wurf — gewinnt jemand aus der Gilde, hier vergeben, sonst „Extern / frei“.';
  return `${head}
    ${modeHint ? `<p class="bis-hint loot-mode-hint">${modeHint}</p>` : ''}
    <div class="loot-vote-state">Stimmen: <b>${Object.keys(it.votes).length}/${council.length}</b>${missing.length ? ` <span class="bis-item-meta">· fehlt noch: ${missing.map(u => escapeHtml(lootPersonName(u))).join(', ')}</span>` : ' <span class="bis-item-meta">· alle haben abgestimmt</span>'}</div>
    ${table}
    <div class="loot-modal-foot">
      <input type="text" class="apply-text-input" data-loot-modal-note maxlength="120" placeholder="Notiz zur Vergabe bzw. Name des Externen (optional)" value="${escapeHtml(lootModalNote)}">
      <button type="button" class="btn btn-ghost btn-sm" data-loot-free="${ctx}|extern" title="Ein Externer hat es gewonnen, oder freier Wurf außerhalb der Gilde">Extern / frei</button>
      <button type="button" class="btn btn-ghost btn-sm" data-loot-free="${ctx}|de" title="Entzaubert oder in die Gildenbank">Entzaubern / Bank</button>
    </div>
    <p class="bis-hint"># = Vorschlag (BiS und SR zuerst, wer es noch nicht hat, Main vor Twink, weniger Loot, mehr Anwesenheit); wer Stimmen hat, steht oben. Jede Stimme ist sofort für den ganzen Council sichtbar; vergeben kann jedes Council-Mitglied.</p>`;
}

/** Key of the next open item after `key` (wrapping), '' = none. @param {string} eventId @param {string} sid @param {string} key */
function lootNextOpen(eventId, sid, key){
  const s = (lootSessions[eventId] || {})[sid];
  if (!s) return '';
  const items = lootSessItems(s);
  const i = items.findIndex(([k]) => k === key);
  const order = [...items.slice(i + 1), ...items.slice(0, Math.max(0, i))];
  const next = order.find(([, it]) => !it.done);
  return next ? next[0] : '';
}

// ---------------------------------------------------------------- writes
/** @param {string} id */
async function lootSessStart(id){
  const sid = newPushId(`lootSessions/${id}`);
  if (!sid) return;
  try {
    await db.ref(`${DB_PATH}/lootSessions/${id}/${sid}`).set({ startedAt: Date.now(), startedBy: discordIdentity.id });
    lootSessOpenImport = `${id}|${sid}`;
    lootSessOpenAdd = '';
    raidStatusMsg = '';
  } catch (err){ raidStatusMsg = 'Loot-Runde konnte nicht gestartet werden — Firebase-Regeln aktualisiert?'; }
  renderRaidsPage();
}

/** @param {string} eventId @param {string} sid @param {string} key @param {string} candKey "uid|charKey" @param {string} kind */
async function lootSessAward(eventId, sid, key, candKey, kind){
  const s = (lootSessions[eventId] || {})[sid];
  const it = s && s.items[key];
  const [uid, charKey] = candKey.split('|');
  const signup = ((raidSignups[eventId] || {})[uid] || {})[charKey];
  const aid = newPushId('lootAwards');
  if (!it || !signup || !aid) return;
  const item = bisData && bisData.byId.get(it.itemId);
  const base = `lootSessions/${eventId}/${sid}/items/${key}`;
  try {
    await db.ref(DB_PATH).update({
      [`lootAwards/${aid}`]: {
        eventId, sessionId: sid, itemId: it.itemId, itemName: (item ? item.n : it.itemName) || '', uid,
        charName: signup.charName || signup.name, classId: signup.classId, specId: signup.specId,
        kind, note: lootModalNote.trim().slice(0, 120), by: discordIdentity.id, at: Date.now(),
        ...(it.boss ? { boss: it.boss } : {}), ...(it.ext ? { ext: it.ext } : {})
      },
      [`${base}/awardId`]: aid, [`${base}/done`]: 'award'
    });
    lootModalNote = '';
    const next = lootNextOpen(eventId, sid, key);
    if (next && lootModal) lootModal.key = next;
    raidStatusMsg = '';
  } catch (err){ raidStatusMsg = 'Vergabe konnte nicht gespeichert werden — Firebase-Regeln aktualisiert?'; }
  renderRaidsPage();
}

/** @param {HTMLElement} root */
function lootSessionWire(root){
  const fail = msg => () => { raidStatusMsg = msg; renderRaidsPage(); };
  const ref = path => db.ref(`${DB_PATH}/${path}`);
  root.querySelectorAll('[data-loot-sess-new]').forEach(btn => btn.addEventListener('click', () => lootSessStart(btn.getAttribute('data-loot-sess-new'))));
  root.querySelectorAll('[data-loot-sess-close]').forEach(btn => btn.addEventListener('click', () => {
    const [eventId, sid, on] = btn.getAttribute('data-loot-sess-close').split('|');
    ref(`lootSessions/${eventId}/${sid}/closedAt`).set(on === '1' ? Date.now() : null).catch(fail('Konnte die Runde nicht ändern.'));
  }));
  root.querySelectorAll('[data-loot-sess-delete]').forEach(btn => btn.addEventListener('click', async () => {
    const [eventId, sid] = btn.getAttribute('data-loot-sess-delete').split('|');
    const answer = await bisDialog('Loot-Runde löschen?', 'Die Runde mit ihren Items und Stimmen wird gelöscht (vergeben wurde darin noch nichts).',
      [{ id: 'delete', label: 'Löschen', primary: true }, { id: 'cancel', label: 'Abbrechen' }]);
    if (answer === 'delete') ref(`lootSessions/${eventId}/${sid}`).remove().catch(fail('Löschen fehlgeschlagen.'));
  }));
  root.querySelectorAll('[data-loot-sess-import]').forEach(btn => btn.addEventListener('click', () => {
    const ctx = btn.getAttribute('data-loot-sess-import');
    lootSessOpenImport = lootSessOpenImport === ctx ? '' : ctx;
    renderRaidsPage();
  }));
  root.querySelectorAll('[data-loot-sess-additem]').forEach(btn => btn.addEventListener('click', () => {
    const ctx = btn.getAttribute('data-loot-sess-additem');
    lootSessOpenAdd = lootSessOpenAdd === ctx ? '' : ctx;
    renderRaidsPage();
  }));
  root.querySelectorAll('[data-loot-sess-search]').forEach((/** @type {HTMLInputElement} */ input) => {
    const ctx = input.getAttribute('data-loot-sess-search');
    input.addEventListener('input', () => {
      lootSessQuery[ctx] = input.value;
      const box = root.querySelector(`[data-loot-sess-results="${CSS.escape(ctx)}"]`);
      const e = raidEvents[ctx.split('|')[0]];
      if (box) box.innerHTML = lootSearchHtml(ctx, e ? e.instance : '', input.value, 'loot-sess-add');
    });
  });
  // Delegated (search results are replaced while typing); root outlives re-renders.
  if (!root.dataset.lootSessWired) root.addEventListener('click', ev => {
    const btn = /** @type {HTMLElement} */ (ev.target).closest('[data-loot-sess-add]');
    if (!btn || !root.contains(btn)) return;
    const [eventId, sid, itemId] = btn.getAttribute('data-loot-sess-add').split('|');
    const key = newPushId(`lootSessions/${eventId}/${sid}/items`);
    if (!key) return;
    const item = bisData && bisData.byId.get(Number(itemId));
    lootSessQuery[`${eventId}|${sid}`] = '';
    ref(`lootSessions/${eventId}/${sid}/items/${key}`).set({ itemId: Number(itemId), itemName: item ? item.n : '', at: Date.now() }).catch(fail('Item konnte nicht hinzugefügt werden.'));
  });
  root.dataset.lootSessWired = '1';
  lootImportWire(root);

  // Pop-up.
  root.querySelectorAll('[data-loot-modal]').forEach(btn => btn.addEventListener('click', () => {
    const [eventId, sid] = btn.getAttribute('data-loot-modal').split('|');
    lootModal = { eventId, sid, key: '' };
    lootModalNote = '';
    renderRaidsPage();
  }));
  root.querySelectorAll('[data-loot-modal-close]').forEach(btn => btn.addEventListener('click', () => { lootModal = null; renderRaidsPage(); }));
  const modal = root.querySelector('#lootModal');
  if (modal) modal.addEventListener('click', ev => { if (ev.target === modal){ lootModal = null; renderRaidsPage(); } });
  root.querySelectorAll('[data-loot-modal-pick]').forEach(btn => btn.addEventListener('click', () => {
    if (!lootModal) return;
    lootModal.key = btn.getAttribute('data-loot-modal-pick');
    lootModalNote = '';
    renderRaidsPage();
    const main = document.querySelector('.loot-modal-main');
    if (main) main.scrollTop = 0;
  }));
  const note = /** @type {HTMLInputElement | null} */ (root.querySelector('[data-loot-modal-note]'));
  if (note) note.addEventListener('input', () => { lootModalNote = note.value; });
  root.querySelectorAll('[data-loot-vote]').forEach(btn => btn.addEventListener('click', () => {
    const [eventId, sid, key, uid, charKey] = btn.getAttribute('data-loot-vote').split('|');
    const it = ((lootSessions[eventId] || {})[sid] || { items: {} }).items[key];
    if (!it) return;
    const cand = `${uid}|${charKey}`;
    ref(`lootSessions/${eventId}/${sid}/items/${key}/votes/${discordIdentity.id}`).set(it.votes[discordIdentity.id] === cand ? null : cand)
      .catch(fail('Stimme konnte nicht gespeichert werden.'));
  }));
  root.querySelectorAll('[data-loot-give]').forEach(btn => btn.addEventListener('click', () => {
    const [eventId, sid, key, uid, charKey, kind] = btn.getAttribute('data-loot-give').split('|');
    lootSessAward(eventId, sid, key, `${uid}|${charKey}`, kind);
  }));
  root.querySelectorAll('[data-loot-free]').forEach(btn => btn.addEventListener('click', () => {
    const [eventId, sid, key, how] = btn.getAttribute('data-loot-free').split('|');
    const text = lootModalNote.trim();
    const label = how === 'de' ? (text ? `Entzaubert / Bank · ${text}` : 'Entzaubert / Bank') : (text ? `Extern: ${text}` : 'Extern / frei vergeben');
    const base = `lootSessions/${eventId}/${sid}/items/${key}`;
    db.ref(DB_PATH).update({ [`${base}/done`]: 'free', [`${base}/doneNote`]: label.slice(0, 120) })
      .then(() => { lootModalNote = ''; const next = lootNextOpen(eventId, sid, key); if (next && lootModal) lootModal.key = next; renderRaidsPage(); })
      .catch(fail('Konnte das Item nicht abschließen.'));
  }));
  root.querySelectorAll('[data-loot-undo]').forEach(btn => btn.addEventListener('click', () => {
    const [eventId, sid, key] = btn.getAttribute('data-loot-undo').split('|');
    const it = ((lootSessions[eventId] || {})[sid] || { items: {} }).items[key];
    if (!it) return;
    const base = `lootSessions/${eventId}/${sid}/items/${key}`;
    /** @type {Record<string, null>} */
    const updates = { [`${base}/done`]: null, [`${base}/awardId`]: null, [`${base}/doneNote`]: null };
    if (it.awardId) updates[`lootAwards/${it.awardId}`] = null;
    db.ref(DB_PATH).update(updates).catch(fail('Zurücknehmen fehlgeschlagen.'));
  }));
}

// Escape closes the pop-up.
document.addEventListener('keydown', ev => {
  if (ev.key === 'Escape' && lootModal && currentPage === 'raids'){ lootModal = null; renderRaidsPage(); }
});
