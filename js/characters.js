// Characters: Armory/WarcraftLogs lookups, character chips, the User
// Settings nickname and the Armory part of the Meine Charaktere cards
// (the page itself, with editing, lives in js/mychar-page.js).
//
// Classic (non-module) script — shares the global scope with the other
// js/*.js files; load order is set in index.html. Code that runs at load
// time may only use files loaded before this one.

// ---------------------------------------------------------------------
// Armory lookups for "Meine Charaktere" — fetches one character's live
// class/level/item level from the Worker's /armory-character endpoint
// (see ARMORY_CHARACTER_URL / discord-auth-worker.js). Session-only
// cache (armoryCache) so switching pages or re-rendering a member list
// doesn't re-hit the Worker/Blizzard for characters already fetched
// recently. Never throws — callers always get back either a result or
// a debug-carrying failure object, mirroring the Discord role-sync
// pattern, and every failure is also logged to the console so a
// misconfigured namespace/realm-slug is easy to spot.
async function fetchArmoryCharacter(realmSlug, name, opts){
  const force = !!(opts && opts.force);
  const key = characterProfileCacheKey(realmSlug, name);
  // Testmodus: made-up characters, don't ask the Worker.
  if (RUDE_TESTMODE){ armoryCache[key] = { fetchedAt: Date.now(), result: { found: false, debug: { detail: 'Testmodus' } } }; return armoryCache[key].result; }
  const cached = armoryCache[key];
  if (!force && cached && (Date.now() - cached.fetchedAt) < ARMORY_CACHE_MS){
    return cached.result;
  }
  if (!isWorkerConfigured()){
    const result = { found: false, debug: { reason: 'worker_not_configured', detail: 'WORKER_URL is not set up yet — see the README.' } };
    armoryCache[key] = { fetchedAt: Date.now(), result };
    return result;
  }
  let result;
  try{
    const res = await fetch(ARMORY_CHARACTER_URL + '?realm=' + encodeURIComponent(realmSlug) + '&name=' + encodeURIComponent(name));
    if (!res.ok){
      result = { found: false, debug: { reason: 'http_error', status: res.status, detail: 'The Worker itself returned HTTP ' + res.status + ' for /armory-character.' } };
    } else {
      result = await res.json();
    }
  }catch(e){
    result = { found: false, debug: { reason: 'fetch_failed', detail: 'Could not reach the Worker at all: ' + e.message } };
  }
  if (!result || !result.found){
    console.warn('[Armory] "' + name + '" @ "' + realmSlug + '" — could not load live character data:', result && result.debug);
  }
  armoryCache[key] = { fetchedAt: Date.now(), result };
  return result;
}

// Mirrors fetchArmoryCharacter above exactly, just against the Worker's
// /warcraftlogs-character endpoint instead — same cache-then-fetch shape,
// same never-throws/always-return-a-debug-carrying-result contract, kept
// as a fully separate function (rather than folding into
// fetchArmoryCharacter) since the two can succeed/fail independently:
// Armory only needs Battle.net credentials, this needs its own
// WarcraftLogs API client and configured zone ids (see README.md).
async function fetchWarcraftLogsCharacter(realmSlug, name, opts){
  const force = !!(opts && opts.force);
  const key = characterProfileCacheKey(realmSlug, name);
  if (RUDE_TESTMODE){ wclCache[key] = { fetchedAt: Date.now(), result: { found: false, debug: { detail: 'Testmodus' } } }; return wclCache[key].result; }
  const cached = wclCache[key];
  if (!force && cached && (Date.now() - cached.fetchedAt) < WCL_CACHE_MS){
    return cached.result;
  }
  if (!isWorkerConfigured()){
    const result = { found: false, debug: { reason: 'worker_not_configured', detail: 'WORKER_URL is not set up yet — see the README.' } };
    wclCache[key] = { fetchedAt: Date.now(), result };
    return result;
  }
  let result;
  try{
    const res = await fetch(WARCRAFTLOGS_CHARACTER_URL + '?realm=' + encodeURIComponent(realmSlug) + '&name=' + encodeURIComponent(name));
    if (!res.ok){
      result = { found: false, debug: { reason: 'http_error', status: res.status, detail: 'The Worker itself returned HTTP ' + res.status + ' for /warcraftlogs-character.' } };
    } else {
      result = await res.json();
    }
  }catch(e){
    result = { found: false, debug: { reason: 'fetch_failed', detail: 'Could not reach the Worker at all: ' + e.message } };
  }
  if (!result || !result.found){
    console.warn('[WarcraftLogs] "' + name + '" @ "' + realmSlug + '" — could not load live rankings:', result && result.debug);
  } else if (result.warcraftlogs && Array.isArray(result.warcraftlogs.zones)){
    // Temporary diagnostic aid (see the matching comment on the Worker's
    // `_raw` field) — logs each zone's untouched WarcraftLogs response
    // whenever the lookup *succeeds* but the numbers might still be
    // wrong (e.g. 0/0 for a character that clearly has logs), since that
    // means the field-mapping guess, not the connection, is what's off.
    // Safe to remove once the mapping is confirmed correct against real
    // WarcraftLogs data.
    console.info('[WarcraftLogs] "' + name + '" @ "' + realmSlug + '" — raw zoneRankings per zone (copy this if the numbers look wrong):', result.warcraftlogs.zones.map(z => ({ label: z.label, raw: z._raw })));
  }
  wclCache[key] = { fetchedAt: Date.now(), result };
  return result;
}

// ---------------------------------------------------------------------
// Character chip rendering — shared between Manage access and the
// Bewerbungen review view, so a member's characters look/behave the
// same in both places. Shows cached live Armory data (class/level/item
// level) when available; otherwise just the name/realm the member typed
// in themselves.
// ---------------------------------------------------------------------
function characterChipHtml(char){
  const cached = armoryCache[characterProfileCacheKey(char.realmSlug, char.name)];
  let meta = '';
  if (cached && cached.result){
    if (cached.result.found){
      const c = cached.result.character;
      const cls = c.classKey ? CLASS_MAP[c.classKey] : null;
      const bits = [c.className || (cls ? cls.label : null), (c.level != null ? 'Lvl ' + c.level : null), (c.itemLevel ? c.itemLevel + ' ilvl' : null)].filter(Boolean);
      meta = ` <span class="character-chip-meta"${cls ? ` style="color:${cls.color}"` : ''}>· ${escapeHtml(bits.join(' · '))}</span>`;
    } else {
      meta = ` <span class="character-chip-meta character-chip-meta-error">· Armory: nicht geladen</span>`;
    }
  }
  return `<span class="character-chip${char.isMain ? ' character-chip-main' : ''}">${char.isMain ? '★ ' : ''}${escapeHtml(char.name)} <span class="character-chip-realm">(${escapeHtml(char.realmSlug)})</span>${meta}</span>`;
}

function characterBlockHtml(uid){
  const profile = (state.characterProfiles || {})[uid];
  if (!profile || !profile.characters || !profile.characters.length){
    return { chipsHtml: '<span class="access-member-characters-empty">Keine Charaktere hinterlegt</span>', hasCharacters: false };
  }
  return { chipsHtml: profile.characters.map(characterChipHtml).join(''), hasCharacters: true };
}

async function refreshMemberArmoryData(uid){
  const profile = (state.characterProfiles || {})[uid];
  if (!profile || !profile.characters || !profile.characters.length) return;
  await Promise.all(profile.characters.map(c => fetchArmoryCharacter(c.realmSlug, c.name, { force: true })));
}

// ---------------------------------------------------------------------
// "User Settings" — only the nickname now; characters are added and
// edited on the Meine Charaktere page (js/mychar-page.js).
// ---------------------------------------------------------------------
function openCharacterModal(){
  if (!discordIdentity) return;
  const existing = (state.characterProfiles || {})[discordIdentity.id];
  els.characterNicknameInput.value = (existing && existing.nickname) || '';
  els.characterSaveStatus.textContent = '';
  els.characterSaveStatus.className = 'armory-status';
  els.accessPopover.classList.add('hidden');
  els.characterModal.classList.remove('hidden');
}

async function saveCharacterProfile(){
  if (!discordIdentity) return;
  const previous = state.characterProfiles[discordIdentity.id];
  state.characterProfiles[discordIdentity.id] = normalizeCharacterProfile({
    nickname: els.characterNicknameInput.value,
    characters: previous ? previous.characters : []
  });
  els.characterSaveStatus.textContent = 'Saving…';
  els.characterSaveStatus.className = 'armory-status';
  const ok = await saveData('characterProfiles/' + discordIdentity.id);
  if (ok){
    els.characterSaveStatus.textContent = 'Gespeichert!';
    els.characterSaveStatus.className = 'armory-status armory-status-ok';
    applyAccessControl();
    setTimeout(() => {
      if (els.characterSaveStatus.textContent === 'Gespeichert!'){
        els.characterSaveStatus.textContent = '';
        els.characterModal.classList.add('hidden');
      }
    }, 900);
  } else {
    if (previous) state.characterProfiles[discordIdentity.id] = previous;
    else delete state.characterProfiles[discordIdentity.id];
    els.characterSaveStatus.textContent = 'Konnte nicht speichern — Firebase-Regeln prüfen (siehe README)';
    els.characterSaveStatus.className = 'armory-status armory-status-error';
  }
}

els.accessCharactersBtn.addEventListener('click', () => openCharacterModal());
const settingsTestStartBtn = document.getElementById('settingsTestStartBtn');
if (settingsTestStartBtn) settingsTestStartBtn.addEventListener('click', testModeStart);
els.characterSaveBtn.addEventListener('click', () => saveCharacterProfile());
els.characterModalCloseBtn.addEventListener('click', () => els.characterModal.classList.add('hidden'));
els.characterModal.addEventListener('click', (e) => {
  if (e.target === els.characterModal) els.characterModal.classList.add('hidden');
});

// ---------------------------------------------------------------------
// "Meine Charaktere" page — a member's own character-profile overview,
// styled in the guild page's own fantasy/gold look (not a copy of
// Blizzard's Armory page). Shows the same live class/level/item-level
// data as Manage access and Bewerbungen, just as full cards instead of
// compact chips, plus a real link out to each character's actual
// Blizzard Armory page.
// ---------------------------------------------------------------------
const ARMORY_WEB_REGION = 'eu';
const ARMORY_WEB_LOCALE = 'en-us';
function armoryWebUrl(realmSlug, name){
  return `https://worldofwarcraft.blizzard.com/${ARMORY_WEB_LOCALE}/classicann/${ARMORY_WEB_REGION}/armory/character/${encodeURIComponent((realmSlug || '').toLowerCase())}/${encodeURIComponent((name || '').toLowerCase())}`;
}

const ARMORY_FACTION_LABELS = { HORDE: 'Horde', ALLIANCE: 'Allianz' };

// Standard WoW item-quality colors — must stay in sync with
// ITEM_QUALITY_COLORS in discord-auth-worker.js (the Worker only sends
// the quality *keyword*, e.g. "EPIC"; the actual color is applied here).
const ITEM_QUALITY_COLORS = {
  POOR: '#9d9d9d', COMMON: '#ffffff', UNCOMMON: '#1eff00', RARE: '#0070dd',
  EPIC: '#a335ee', LEGENDARY: '#ff8000', ARTIFACT: '#e6cc80', HEIRLOOM: '#00ccff'
};
// Paper-doll layout, matching in-game — must stay in sync with
// EQUIPMENT_LEFT/RIGHT/BOTTOM_SLOTS in discord-auth-worker.js. Kept as
// its own copy here (rather than sent over the wire) since it's just a
// fixed display order, identical for every character.
const MYCHAR_EQUIP_LEFT_SLOTS = ['HEAD', 'NECK', 'SHOULDER', 'BACK', 'CHEST', 'SHIRT', 'TABARD', 'WRIST'];
const MYCHAR_EQUIP_RIGHT_SLOTS = ['HANDS', 'WAIST', 'LEGS', 'FEET', 'FINGER_1', 'FINGER_2', 'TRINKET_1', 'TRINKET_2'];
const MYCHAR_EQUIP_BOTTOM_SLOTS = ['MAIN_HAND', 'OFF_HAND', 'RANGED'];

// One equipped-item row: icon (colored border by quality) + name +
// enchant text. `item` is null for an empty slot (nothing equipped
// there) — rendered as a bare placeholder box, same as the game's own
// paper-doll shows an empty socket.
function mycharEquipSlotHtml(item){
  if (!item){
    return `<div class="mychar-equip-item mychar-equip-item-empty"><div class="mychar-equip-icon mychar-equip-icon-empty"></div></div>`;
  }
  const color = ITEM_QUALITY_COLORS[item.quality] || ITEM_QUALITY_COLORS.COMMON;
  const iconHtml = item.icon
    ? `<img class="mychar-equip-icon" src="${escapeHtml(item.icon)}" alt="" loading="lazy" style="border-color:${color}" onerror="this.classList.add('mychar-equip-icon-empty');this.removeAttribute('src');">`
    : `<div class="mychar-equip-icon mychar-equip-icon-empty" style="border-color:${color}"></div>`;
  return `<div class="mychar-equip-item" title="${escapeHtml(item.slotLabel)}${item.ilvl ? ' — ilvl ' + item.ilvl : ''}">
    ${iconHtml}
    <div class="mychar-equip-text">
      <div class="mychar-equip-name" style="color:${color}">${escapeHtml(item.name)}</div>
      ${item.enchantText ? `<div class="mychar-equip-enchant">Verzaubert: ${escapeHtml(item.enchantText)}</div>` : ''}
    </div>
  </div>`;
}

// Full Wowhead-gear-check-style equipment grid for one character — two
// columns (left/right paper-doll halves) plus a weapons row along the
// bottom. Returns '' when there's no equipment data at all (e.g. the
// Worker's equipment lookup itself failed — see equipmentDebug), so the
// rest of the card still renders fine without it.
function mycharEquipmentGridHtml(equipment){
  if (!Array.isArray(equipment) || !equipment.length) return '';
  const bySlot = {};
  equipment.forEach(item => { bySlot[item.slot] = item; });
  const leftHtml = MYCHAR_EQUIP_LEFT_SLOTS.map(slot => mycharEquipSlotHtml(bySlot[slot])).join('');
  const rightHtml = MYCHAR_EQUIP_RIGHT_SLOTS.map(slot => mycharEquipSlotHtml(bySlot[slot])).join('');
  const bottomItems = MYCHAR_EQUIP_BOTTOM_SLOTS.map(slot => bySlot[slot]).filter(Boolean);
  const bottomHtml = bottomItems.length
    ? `<div class="mychar-equip-bottom">${bottomItems.map(mycharEquipSlotHtml).join('')}</div>`
    : '';
  return `<div class="mychar-equip-wrap">
    <div class="mychar-equip-grid">
      <div class="mychar-equip-col">${leftHtml}</div>
      <div class="mychar-equip-col">${rightHtml}</div>
    </div>
    ${bottomHtml}
  </div>`;
}

// WarcraftLogs block: one small card per configured zone (boss kills +
// best all-star points/rank) plus an overall Best Perf. Avg tile — shown
// below the equipment grid. Has its own independent loading/not-found
// state from the Armory data above (see fetchWarcraftLogsCharacter).
function mycharWarcraftLogsHtml(c){
  const cached = wclCache[characterProfileCacheKey(c.realmSlug, c.name)];
  if (!cached){
    return `<div class="mychar-wcl-wrap"><div class="mychar-card-loading">Lädt WarcraftLogs-Daten…</div></div>`;
  }
  const found = cached.result && cached.result.found;
  if (!found){
    const reason = cached.result && cached.result.debug && cached.result.debug.reason;
    // Quiet, no-retry-button states for "feature isn't set up at all" —
    // showing an error/retry button for something the guild simply
    // hasn't configured yet would be confusing, not helpful.
    if (reason === 'worker_not_configured' || reason === 'no_zones_configured' || reason === 'no_warcraftlogs_credentials'){
      return '';
    }
    const debugInfo = (cached.result && cached.result.debug) || {};
    // "Not found" isn't really an error (retrying won't fix a character
    // that genuinely has no logs, or a realm-slug mismatch between
    // Blizzard's and WarcraftLogs' own naming) — so this gets its own
    // calmer state with a direct link to check on WarcraftLogs itself,
    // instead of the generic error+retry-button treatment below.
    if (reason === 'character_not_found' && debugInfo.checkUrl){
      return `<div class="mychar-wcl-wrap">
        <div class="mychar-card-error" title="${escapeHtml(debugInfo.detail || '')}">
          Keine Logs auf WarcraftLogs gefunden für diesen Namen/Realm.
          <a class="mychar-wcl-link" href="${escapeHtml(debugInfo.checkUrl)}" target="_blank" rel="noopener noreferrer">Selbst prüfen ↗</a>
        </div>
      </div>`;
    }
    const detail = debugInfo.detail || '';
    return `<div class="mychar-wcl-wrap">
      <div class="mychar-card-error" ${detail ? `title="${escapeHtml(detail)}"` : ''}>
        Konnte keine WarcraftLogs-Daten laden.
        <button type="button" class="btn btn-ghost btn-sm" data-mychar-wcl-refresh="${c.id}">Erneut versuchen</button>
      </div>
    </div>`;
  }
  const wcl = cached.result.warcraftlogs;
  const zoneCardsHtml = (wcl.zones || []).map(z => {
    if (!z.hasData){
      return `<div class="mychar-wcl-zone mychar-wcl-zone-empty"><div class="mychar-wcl-zone-label">${escapeHtml(z.label)}</div><div class="mychar-wcl-zone-none">Keine Logs</div></div>`;
    }
    return `<div class="mychar-wcl-zone">
      <div class="mychar-wcl-zone-label">${escapeHtml(z.label)}</div>
      <div class="mychar-wcl-zone-kills">${z.killed}/${z.total}</div>
      <div class="mychar-wcl-zone-stats">
        <div><span class="mychar-wcl-zone-stat-label">Bestplatzierte</span><span class="mychar-wcl-zone-stat-value">${z.points != null ? z.points.toLocaleString('de-DE') : '—'}</span></div>
        <div><span class="mychar-wcl-zone-stat-label">Position</span><span class="mychar-wcl-zone-stat-value mychar-wcl-rank">${z.rank != null ? '#' + z.rank : '—'}</span></div>
      </div>
    </div>`;
  }).join('');
  const bestPerfHtml = wcl.bestPerformance
    ? `<div class="mychar-wcl-bestperf">
        <div class="mychar-wcl-bestperf-label">Best Perf. Avg <span class="mychar-wcl-bestperf-zone">(${escapeHtml(wcl.bestPerformance.zoneLabel)})</span></div>
        <div class="mychar-wcl-bestperf-value">${wcl.bestPerformance.best}</div>
        ${wcl.bestPerformance.median != null ? `<div class="mychar-wcl-bestperf-median">Median: ${wcl.bestPerformance.median}</div>` : ''}
      </div>`
    : '';
  return `<div class="mychar-wcl-wrap">
    <div class="mychar-wcl-head">
      <span class="mychar-wcl-title">WarcraftLogs — aktuelle Phase</span>
      <a class="mychar-wcl-link" href="${escapeHtml(wcl.characterUrl)}" target="_blank" rel="noopener noreferrer">Auf WarcraftLogs ansehen ↗</a>
    </div>
    <div class="mychar-wcl-zones">${zoneCardsHtml}</div>
    ${bestPerfHtml}
  </div>`;
}

/** Live Armory / WarcraftLogs part of a character card. @param {Character} c */
function mycharArmoryHtml(c){
  const cached = armoryCache[characterProfileCacheKey(c.realmSlug, c.name)];
  const armoryLink = armoryWebUrl(c.realmSlug, c.name);
  const found = cached && cached.result && cached.result.found;
  const ch = found ? cached.result.character : null;
  const cls = (ch && ch.classKey) ? CLASS_MAP[ch.classKey] : null;
  const accentColor = cls ? cls.color : 'var(--gold)';

  let bodyHtml;
  if (!cached){
    bodyHtml = `<div class="mychar-card-loading">Lädt Armory-Daten…</div>`;
  } else if (!found){
    const detail = (cached.result && cached.result.debug && cached.result.debug.detail) || '';
    bodyHtml = `<div class="mychar-card-error" ${detail ? `title="${escapeHtml(detail)}"` : ''}>
      Konnte keine Live-Daten laden.
      <button type="button" class="btn btn-ghost btn-sm" data-mychar-refresh="${c.id}">Erneut versuchen</button>
    </div>`;
  } else {
    const factionLabel = ARMORY_FACTION_LABELS[ch.faction] || ch.faction || '—';
    const lastSeen = relativeTimeFromMs(ch.lastLoginTimestamp);
    bodyHtml = `<div class="mychar-stat-grid">
      <div class="mychar-stat"><span class="mychar-stat-label">Level</span><span class="mychar-stat-value">${ch.level ?? '—'}</span></div>
      <div class="mychar-stat"><span class="mychar-stat-label">Klasse</span><span class="mychar-stat-value" ${cls ? `style="color:${cls.color}"` : ''}>${escapeHtml(ch.className || (cls ? cls.label : '—'))}</span></div>
      <div class="mychar-stat"><span class="mychar-stat-label">Rasse</span><span class="mychar-stat-value">${escapeHtml(ch.raceName || '—')}</span></div>
      <div class="mychar-stat"><span class="mychar-stat-label">Fraktion</span><span class="mychar-stat-value">${escapeHtml(factionLabel)}</span></div>
      <div class="mychar-stat"><span class="mychar-stat-label">Itemlevel</span><span class="mychar-stat-value">${ch.itemLevel ?? '—'}</span></div>
      <div class="mychar-stat"><span class="mychar-stat-label">Gilde</span><span class="mychar-stat-value">${escapeHtml(ch.guildName || '—')}</span></div>
      <div class="mychar-stat"><span class="mychar-stat-label">Zuletzt online</span><span class="mychar-stat-value">${escapeHtml(lastSeen || '—')}</span></div>
    </div>
    ${mycharEquipmentGridHtml(ch.equipment)}
    <button type="button" class="btn btn-ghost btn-sm mychar-refresh-btn" data-mychar-refresh="${c.id}">Aktualisieren</button>`;
  }

  return { accentColor, html: `${bodyHtml}
    <a class="mychar-armory-link" href="${armoryLink}" target="_blank" rel="noopener noreferrer">Im Armory ansehen ↗</a>
    ${mycharWarcraftLogsHtml(c)}` };
}

function wireMycharCardButtons(){
  els.mycharList.querySelectorAll('[data-mychar-refresh]').forEach((/** @type {HTMLButtonElement} */ btn) => {
    btn.addEventListener('click', async () => {
      if (!discordIdentity) return;
      const profile = (state.characterProfiles || {})[discordIdentity.id];
      const c = profile && profile.characters.find(x => x.id === btn.getAttribute('data-mychar-refresh'));
      if (!c) return;
      btn.disabled = true;
      btn.textContent = 'Lädt…';
      await fetchArmoryCharacter(c.realmSlug, c.name, { force: true });
      if (currentPage === 'mychar') renderMyCharactersPage();
    });
  });
  els.mycharList.querySelectorAll('[data-mychar-wcl-refresh]').forEach((/** @type {HTMLButtonElement} */ btn) => {
    btn.addEventListener('click', async () => {
      if (!discordIdentity) return;
      const profile = (state.characterProfiles || {})[discordIdentity.id];
      const c = profile && profile.characters.find(x => x.id === btn.getAttribute('data-mychar-wcl-refresh'));
      if (!c) return;
      btn.disabled = true;
      btn.textContent = 'Lädt…';
      await fetchWarcraftLogsCharacter(c.realmSlug, c.name, { force: true });
      if (currentPage === 'mychar') renderMyCharactersPage();
    });
  });
}

els.mycharLoginBtn.addEventListener('click', () => startDiscordLogin());
els.mycharRefreshAllBtn.addEventListener('click', async () => {
  if (!discordIdentity) return;
  const profile = (state.characterProfiles || {})[discordIdentity.id];
  const characters = (profile && profile.characters) || [];
  if (!characters.length) return;
  els.mycharRefreshAllBtn.disabled = true;
  els.mycharRefreshAllBtn.textContent = 'Lädt…';
  await Promise.all([
    ...characters.map(c => fetchArmoryCharacter(c.realmSlug, c.name, { force: true })),
    ...characters.map(c => fetchWarcraftLogsCharacter(c.realmSlug, c.name, { force: true }))
  ]);
  els.mycharRefreshAllBtn.disabled = false;
  els.mycharRefreshAllBtn.textContent = 'Alle aktualisieren';
  if (currentPage === 'mychar') renderMyCharactersPage();
});
