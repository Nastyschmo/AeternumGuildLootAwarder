// Discord login (OAuth + PKCE), Worker token minting, role resolution
// (ensureDiscordRole) and the Manage access modal.
//
// Classic (non-module) script — shares the global scope with the other
// js/*.js files; load order is set in index.html. Code that runs at load
// time may only use files loaded before this one.

function isDiscordConfigured(){
  return DISCORD_CONFIG.clientId && DISCORD_CONFIG.clientId !== 'YOUR_DISCORD_CLIENT_ID';
}

function loadDiscordIdentity(){
  try{
    const raw = localStorage.getItem(DISCORD_IDENTITY_KEY);
    return raw ? JSON.parse(raw) : null;
  }catch(e){
    return null;
  }
}

function saveDiscordIdentity(identity){
  try{ localStorage.setItem(DISCORD_IDENTITY_KEY, JSON.stringify(identity)); }catch(e){}
}

function logoutDiscord(){
  try{ localStorage.removeItem(DISCORD_IDENTITY_KEY); }catch(e){}
  try{ if (firebase.auth().currentUser) firebase.auth().signOut(); }catch(e){}
  window.location.reload();
}

function randomPkceString(length){
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => ('0' + b.toString(16)).slice(-2)).join('').slice(0, length);
}

async function sha256Base64Url(input){
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  let str = '';
  new Uint8Array(digest).forEach(b => { str += String.fromCharCode(b); });
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function startDiscordLogin(){
  const verifier = randomPkceString(64);
  const challenge = await sha256Base64Url(verifier);
  const state = randomPkceString(24);
  sessionStorage.setItem(DISCORD_PKCE_VERIFIER_KEY, verifier);
  sessionStorage.setItem(DISCORD_OAUTH_STATE_KEY, state);
  // Carries a pending #recruit?app=<id> deep link through the Discord
  // OAuth round-trip too — otherwise clicking a notification link while
  // logged out would land back on a generic Bewerbung page after login
  // instead of the specific application it pointed at.
  try{ sessionStorage.setItem(RETURN_ANCHOR_KEY, currentPage + (pendingDeepLinkApplicationId ? ('::app::' + pendingDeepLinkApplicationId) : '')); }catch(e){}
  const params = new URLSearchParams({
    client_id: DISCORD_CONFIG.clientId,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify',
    state: state,
    code_challenge: challenge,
    code_challenge_method: 'S256'
  });
  window.location.href = 'https://discord.com/oauth2/authorize?' + params.toString();
}

// Handles the redirect back from Discord (?code=...&state=...), if present.
// On success, returns the Firebase custom token minted by our Worker (after
// it independently verified the Discord login server-side). Returns null
// if there was no callback to handle, or if it failed.
async function handleDiscordCallback(){
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code) return null;

  const returnedState = params.get('state');
  const expectedState = sessionStorage.getItem(DISCORD_OAUTH_STATE_KEY);
  const verifier = sessionStorage.getItem(DISCORD_PKCE_VERIFIER_KEY);
  window.history.replaceState({}, '', window.location.pathname);
  sessionStorage.removeItem(DISCORD_OAUTH_STATE_KEY);
  sessionStorage.removeItem(DISCORD_PKCE_VERIFIER_KEY);

  if (!verifier || !returnedState || returnedState !== expectedState){
    console.warn('[Discord role sync] login aborted before it reached our Worker — the PKCE state/verifier check failed (missing sessionStorage entry, or you opened two login attempts at once). This is unrelated to your Discord role; just try logging in again.');
    showDiscordLoginError('Login could not be verified — please try again.');
    return null;
  }

  try{
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: DISCORD_CONFIG.clientId,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: DISCORD_REDIRECT_URI,
        code_verifier: verifier
      })
    });
    if (!tokenRes.ok){
      let bodyText = '';
      try{ bodyText = await tokenRes.text(); }catch(e2){}
      console.warn('[Discord role sync] Discord’s token exchange failed (HTTP ' + tokenRes.status + ') — this happens before our Worker is even contacted, so it can’t be a role-sync bug. Usually a wrong/expired code (double-submit, back-button reuse) or a redirect_uri mismatch in the Discord app settings.', bodyText);
      throw new Error('token exchange failed');
    }
    const tokenData = await tokenRes.json();

    // Hand the Discord access token to our Worker — it independently
    // verifies it with Discord (never trusts a client-supplied identity)
    // and mints a real Firebase Authentication token for that user.
    const mintRes = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ discordAccessToken: tokenData.access_token })
    });
    if (!mintRes.ok){
      let bodyText = '';
      try{ bodyText = await mintRes.text(); }catch(e2){}
      console.warn('[Discord role sync] our Worker (' + WORKER_URL + ') rejected the mint request (HTTP ' + mintRes.status + '). Nothing was resolved from your Discord roles — you’ll fall back to whatever role you already had, or Community. Check the Worker’s own logs (wrangler tail / Cloudflare dashboard) and confirm the deployed Worker matches discord-auth-worker.js.', bodyText);
      throw new Error('token mint failed');
    }
    const mintData = await mintRes.json();

    saveDiscordIdentity({ id: mintData.user.id, username: mintData.user.username, avatar: mintData.user.avatar || null });
    // mintData.role is the Worker's freshly-checked answer to "what's
    // their current Discord server role?" (see ensureDiscordRole below —
    // this is the one moment the site has a trustworthy answer to that,
    // so it's captured here rather than re-derived later).
    //
    // mintData.roleDebug explains *why* that role was chosen (nothing
    // secret in it — just Discord role ids and an HTTP status). Logged
    // to the console any time the result wasn't a clean role match, so
    // that if someone ends up stuck on Community, opening devtools right
    // after logging in shows exactly which setup step to check next
    // (bot token, bot not in the server, wrong GUILD_ID, or a role id
    // that doesn't match DISCORD_ROLE_TO_SITE_ROLE) instead of just
    // "it didn't work". See "Syncing roles from your Discord server" in
    // README.md.
    if (mintData.roleDebug && mintData.roleDebug.reason !== 'matched'){
      console.warn('[Discord role sync] resolved to "' + mintData.role + '" — reason:', mintData.roleDebug);
    } else if (mintData.roleDebug){
      console.info('[Discord role sync] resolved to "' + mintData.role + '" via matched Discord role:', mintData.roleDebug);
    } else {
      console.warn('[Discord role sync] resolved to "' + mintData.role + '", but the Worker’s response had no roleDebug field at all. That means the deployed Cloudflare Worker is still running an OLDER version of discord-auth-worker.js (from before role-sync diagnostics were added) — redeploy the current discord-auth-worker.js and log in again to get a real reason instead of this message.');
    }
    return { token: mintData.token, role: mintData.role };
  }catch(e){
    console.warn('[Discord role sync] Discord login threw before it could finish — see the warning above (or, if there is none, the error below) for what actually failed.', e);
    showDiscordLoginError('Discord login failed. Please try again.');
    return null;
  }
}

function showDiscordLoginError(msg){
  const el = document.getElementById('discordLoginError');
  if (el) el.textContent = msg;
}

function discordAvatarUrl(identity){
  if (!identity || !identity.avatar) return null;
  return `https://cdn.discordapp.com/avatars/${identity.id}/${identity.avatar}.png?size=64`;
}

// Set only right after a FRESH Discord login this page load (the Worker
// just checked this person's live Discord server roles and handed back
// its answer — see handleDiscordCallback above) — left undefined for a
// returning visit that simply resumes an already-logged-in Firebase
// session without a new Discord round trip. That's what makes
// ensureDiscordRole below only ever resync a role at actual login time,
// never demote/promote someone based on a stale or missing answer.
let freshDiscordRoleClaim;

// Ensures this Discord user has a role entry in the synced state.
// Returns true if state.discordRoles changed and needs saving.
//
// Role logic, in order:
//  1. Admin is never touched here — once granted (by the one-time
//     bootstrap below, or later by hand via "Manage access"), it's only
//     ever changed by hand. The Discord-role sync below only ever
//     resolves to Officer/Guild Member/Community.
//  2. The very first login ever (on a brand new setup, before anyone has
//     a role) becomes Admin, so there's always someone who can use
//     "Manage access" afterward.
//  3. Everyone else gets whatever role the Worker just resolved from
//     their live Discord server roles (freshDiscordRoleClaim) — but only
//     at the moment they actually logged in. A returning visit that just
//     resumes an existing session keeps their last-synced role rather
//     than guessing from nothing.
function ensureDiscordRole(){
  if (!discordIdentity) return false;
  if (!state.discordRoles) state.discordRoles = {};
  const existing = state.discordRoles[discordIdentity.id];

  if (existing && existing.role === 'admin'){
    let changed = false;
    if (existing.username !== discordIdentity.username || existing.avatar !== discordIdentity.avatar){
      existing.username = discordIdentity.username;
      existing.avatar = discordIdentity.avatar;
      changed = true;
    }
    currentRole = 'admin';
    return changed;
  }

  if (!existing && Object.keys(state.discordRoles).length === 0){
    state.discordRoles[discordIdentity.id] = { role: 'admin', username: discordIdentity.username, avatar: discordIdentity.avatar };
    currentRole = 'admin';
    return true;
  }

  const resolvedRole = (freshDiscordRoleClaim && ACCESS_ROLES[freshDiscordRoleClaim])
    ? freshDiscordRoleClaim
    : (existing ? existing.role : 'community');
  const changed = !existing || existing.role !== resolvedRole
    || existing.username !== discordIdentity.username || existing.avatar !== discordIdentity.avatar;
  // Object.assign (not a fresh object literal) on top of `existing` —
  // this entry can carry extra per-user settings beyond role/username/
  // avatar now (notifyOnApplications, see "Manage access" below), and a
  // plain overwrite here would silently wipe that setting back to unset
  // on this person's very next login.
  state.discordRoles[discordIdentity.id] = Object.assign({}, existing, { role: resolvedRole, username: discordIdentity.username, avatar: discordIdentity.avatar });
  currentRole = resolvedRole;
  return changed;
}

async function setDiscordUserRole(discordId, role){
  if (!state.discordRoles || !state.discordRoles[discordId] || !ACCESS_ROLES[role]) return;
  state.discordRoles[discordId].role = role;
  if (discordIdentity && discordIdentity.id === discordId) currentRole = role;
  renderAll();
  // Manage access groups members by role — re-render it too (if open) so
  // someone whose role just changed visibly moves to their new group
  // instead of staying in the old one until the modal is reopened.
  if (!els.accessModal.classList.contains('hidden')) renderAccessModal();
  await saveData('discordRoles/' + discordId);
}

// "Notify this person about new applications" toggle, shown in Manage
// access next to each member's role — independent of role (an Admin or
// Officer can opt out, and in principle anyone could opt in, though the
// checkbox is only rendered for Officer/Admin rows since only they can
// see the applications list in the first place).
async function setDiscordUserNotify(discordId, enabled){
  if (!state.discordRoles || !state.discordRoles[discordId]) return;
  state.discordRoles[discordId].notifyOnApplications = !!enabled;
  await saveData('discordRoles/' + discordId);
}

// "Testmodus" toggle in Manage access: unlocks User Settings →
// "Testmodus starten" for this person (Admins always have it). Test mode
// only runs in that person's browser on made-up data (js/testmode.js), so
// this is a convenience switch, not a permission the rules protect.
async function setDiscordUserTestMode(discordId, enabled){
  if (!state.discordRoles || !state.discordRoles[discordId]) return;
  state.discordRoles[discordId].testMode = !!enabled;
  await saveData('discordRoles/' + discordId);
}
/** May the logged-in person start the test mode? */
function canUseTestMode(){
  if (currentRole === 'admin') return true;
  const me = discordIdentity && (state.discordRoles || {})[discordIdentity.id];
  return Boolean(me && me.testMode);
}

function renderAccessModal(){
  const roles = state.discordRoles || {};
  const ids = Object.keys(roles);
  if (ids.length === 0){
    els.accessMemberList.innerHTML = '<p class="access-modal-note">No one has logged in yet.</p>';
    return;
  }
  const roleOrder = ['admin', 'officer', 'member', 'community'];
  const roleOptHtml = (selected) => roleOrder.map(r =>
    `<option value="${r}" ${r === selected ? 'selected' : ''}>${ACCESS_ROLES[r].label}</option>`).join('');
  // A member's nickname (if set) is what they're sorted/displayed by
  // first — matches how they show up everywhere else on the page — with
  // the Discord username as a fallback and a case/locale-insensitive
  // comparison so "ä"/"a" etc. sort where a German speaker expects.
  const sortName = (id) => {
    const profile = (state.characterProfiles || {})[id];
    return (profile && profile.nickname) ? profile.nickname : ((roles[id] && roles[id].username) || '');
  };
  const memberRowHtml = (id) => {
    const m = roles[id];
    const isSelf = id === (discordIdentity && discordIdentity.id);
    const avatarUrl = m.avatar ? `https://cdn.discordapp.com/avatars/${id}/${m.avatar}.png?size=64` : null;
    const profile = (state.characterProfiles || {})[id];
    const nickHtml = (profile && profile.nickname) ? ` <span class="access-member-nickname">"${escapeHtml(profile.nickname)}"</span>` : '';
    const { chipsHtml, hasCharacters } = characterBlockHtml(id);
    // Only Admins/Officers can even see the applications list, so the
    // "notify me about new applications" toggle only makes sense — and
    // is only shown — for rows currently in one of those two roles.
    const canNotify = m.role === 'admin' || m.role === 'officer';
    const notifyHtml = canNotify
      ? `<label class="access-member-notify" title="Bei neuer Bewerbung per Discord-DM und In-Site-Hinweis benachrichtigen">
          <input type="checkbox" class="access-member-notify-checkbox" data-notify-discord-id="${id}" ${m.notifyOnApplications ? 'checked' : ''}>
          Bewerbungen melden
        </label>`
      : '';
    // Test mode: Admins always have it; everybody else when an Admin ticks it.
    const testHtml = m.role === 'admin' ? '' : `<label class="access-member-notify" title="Darf in den User Settings den Testmodus starten (erfundene Daten, nur im eigenen Browser)">
          <input type="checkbox" data-testmode-discord-id="${id}" ${m.testMode ? 'checked' : ''}>
          Testmodus
        </label>`;
    return `
      <div class="access-member-block">
        <div class="access-member-row">
          ${avatarUrl ? `<img class="access-member-avatar" src="${avatarUrl}" alt="" />` : `<span class="access-member-avatar"></span>`}
          <span class="access-member-name">${escapeHtml(m.username || 'Unknown')}${nickHtml}${isSelf ? ' (you)' : ''}</span>
          <select class="access-member-role-select" data-discord-id="${id}" ${isSelf ? 'disabled title="You can\'t change your own role — ask another Admin, or use a second Discord account."' : ''}>${roleOptHtml(m.role)}</select>
        </div>
        ${notifyHtml || testHtml ? `<div class="access-member-options">${notifyHtml}${testHtml}</div>` : ''}
        <div class="access-member-characters-row">
          <div class="character-chips">${chipsHtml}</div>
          ${hasCharacters ? `<button type="button" class="btn btn-ghost btn-sm access-member-armory-refresh" data-refresh-armory="${id}">Aktualisieren</button>` : ''}
        </div>
      </div>`;
  };
  // Grouped by role (Admin → Offi → Guild Member → Community) so the
  // list reads as "who has which access" at a glance, alphabetical
  // within each group instead of registration/login order.
  els.accessMemberList.innerHTML = roleOrder.map(role => {
    const idsInRole = ids.filter(id => (roles[id].role || 'community') === role);
    if (!idsInRole.length) return '';
    idsInRole.sort((a, b) => sortName(a).localeCompare(sortName(b), 'de', { sensitivity: 'base' }));
    return `<div class="access-role-group">
      <div class="access-role-group-head">${escapeHtml(ACCESS_ROLES[role].label)} <span class="access-role-group-count">(${idsInRole.length})</span></div>
      ${idsInRole.map(memberRowHtml).join('')}
    </div>`;
  }).join('');
  els.accessMemberList.querySelectorAll('.access-member-role-select:not([disabled])').forEach((/** @type {HTMLSelectElement} */ sel) => {
    sel.addEventListener('change', (e) => setDiscordUserRole(sel.getAttribute('data-discord-id'), sel.value));
  });
  els.accessMemberList.querySelectorAll('[data-notify-discord-id]').forEach((/** @type {HTMLInputElement} */ cb) => {
    cb.addEventListener('change', () => setDiscordUserNotify(cb.getAttribute('data-notify-discord-id'), cb.checked));
  });
  els.accessMemberList.querySelectorAll('[data-testmode-discord-id]').forEach((/** @type {HTMLInputElement} */ cb) => {
    cb.addEventListener('change', () => setDiscordUserTestMode(cb.getAttribute('data-testmode-discord-id'), cb.checked));
  });
  els.accessMemberList.querySelectorAll('[data-refresh-armory]').forEach((/** @type {HTMLButtonElement} */ btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Lädt…';
      await refreshMemberArmoryData(btn.getAttribute('data-refresh-armory'));
      renderAccessModal();
    });
  });
}

els.accessManageBtn.addEventListener('click', () => {
  els.accessPopover.classList.add('hidden');
  renderAccessModal();
  els.accessModal.classList.remove('hidden');
});
els.accessModalCloseBtn.addEventListener('click', () => els.accessModal.classList.add('hidden'));
els.accessModal.addEventListener('click', (e) => {
  if (e.target === els.accessModal) els.accessModal.classList.add('hidden');
});
