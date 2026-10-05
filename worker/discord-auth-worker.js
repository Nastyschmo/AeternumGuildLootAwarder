// Cloudflare Worker with two jobs for the guild page:
//
//  1. POST /mint-token — verifies a Discord login server-side, checks that
//     person's CURRENT roles in your Discord server (via a bot token —
//     see GUILD_ID/DISCORD_ROLE_TO_SITE_ROLE below), and mints a real
//     Firebase Authentication token for them with the resolved site role
//     embedded as a tamper-proof claim. This is the piece that lets your
//     Firebase Realtime Database rules actually reject anyone who hasn't
//     logged in (and trust the role they're assigned) — the guild page
//     alone can't do either on its own, since a plain static page has
//     nowhere safe to keep a real secret.
//
//  2. GET /wowhead-news — fetches Wowhead's public "WoW: Forever" RSS feed
//     and hands back { latest, patchNotes } as JSON: the newest article
//     overall, and (searched across the whole feed) the newest article
//     that looks like an official Blizzard patch-notes/hotfix write-up.
//     Either can be null. This exists purely to get around the browser's
//     CORS rules: Wowhead's feed doesn't allow being fetched directly from
//     another site's JavaScript, but a server (this Worker) can fetch
//     anything, so it fetches the feed itself and re-serves just the bit
//     the guild page needs. Cached for 20 minutes so the guild page stays
//     fast and Wowhead doesn't get hit on every visit.
//     (Blizzard's own news site renders its article list with JavaScript
//     after load and has no public RSS/API a Worker could read directly,
//     so patch notes are sourced via Wowhead's own coverage of them too —
//     Wowhead reliably publishes its own article, with its own thumbnail,
//     whenever Blizzard ships official patch notes or hotfixes.)
//
//  3. GET /armory-character?realm=<slug>&name=<charname> — looks up one
//     character's live data (class, level, item level, guild, faction)
//     from Blizzard's own Game Data API, for the "meine Charaktere"
//     nickname/character feature. Uses Battle.net's app-only
//     client-credentials OAuth flow (BNET_CLIENT_ID/SECRET below — this is
//     a *public* lookup of any character by name, not the per-user
//     "protected" profile API, which would require every member to
//     individually authorize this app with their own Battle.net
//     account — not appropriate here). Targets the TBC Anniversary realms
//     namespace (built from BNET_REGION — see getBattlenetEnv below) since that's where the
//     guild's active characters currently are — NOT Classic Era/Anniversary
//     (namespace "classic1x"), whose character/guild-roster endpoints have
//     been broken on Blizzard's side since September 2024 with no fix as
//     of this writing. Returns { found, character, debug } — mirroring the
//     roleDebug pattern above — never throws a hard error to the client,
//     so a namespace mismatch or a not-found character is easy to diagnose
//     via the debug object instead of silently failing. `character.equipment`
//     is a Wowhead-gear-check-style list of every equipped item (icon,
//     name, quality color, enchant text) — NOT a full 3D character render,
//     which Blizzard's Classic API doesn't expose (see
//     fetchCharacterEquipment below for why).
//
//  4. Scheduled (Cron Trigger) — periodically re-checks every already-known
//     member's CURRENT Discord roles and fixes up their stored site role in
//     Firebase if it's changed (e.g. a Community member who got promoted to
//     Guild Member on Discord, but hasn't logged back in to the guild page
//     since). Without this, a site role is only ever refreshed at login —
//     see job 1 above — so anyone who doesn't log back in stays stuck on
//     their old role indefinitely. This job needs no browser/login at all;
//     it fetches your whole Discord server's member list once (via the same
//     bot token as job 1) and writes straight to Firebase using the service
//     account's own admin access (bypassing the database rules entirely,
//     same as the Admin SDK would). See FIREBASE_DATABASE_URL and the
//     "Keeping roles in sync automatically" section in README.md to turn
//     this on — it's inert (never runs) until a Cron Trigger is added for
//     this Worker in the Cloudflare dashboard.
//
//  5. GET /warcraftlogs-character?realm=<slug>&name=<charname> — a
//     character's current-phase WarcraftLogs raid rankings (per-zone boss
//     kills + best all-star points/rank, plus an overall Best Perf. Avg)
//     for the "Meine Charaktere" page. Uses its own separate API client
//     (WCL_CLIENT_ID/SECRET below, or WARCRAFTLOGS_CLIENT_ID/SECRET — see
//     getWarcraftLogsEnv — free, self-service, nothing to do with Discord/
//     Battle.net/Firebase) and a fixed, hand-maintained
//     list of the current tier's zone ids (WARCRAFTLOGS_ZONES below — see
//     README.md's "Aktuelle Logs-Übersicht (WarcraftLogs)" for setup and
//     how to find a zone's id). Same fail-open `{ found, debug }` pattern
//     as jobs 1 and 3 — no client credentials or zone ids configured yet
//     just means these cards don't show, nothing else breaks.
//
//  6. POST /notify-application — DMs the Officers/Admins who've opted into
//     "Bewerbungen melden" (Manage access on the guild page) whenever
//     someone submits a new application, using the same bot token as jobs
//     1/4/5 (no extra secret needed). Verifies the application is real by
//     re-reading it from Firebase with the service-account admin
//     credential (same one job 4 uses) before DMing anyone. The message
//     text and the recipient list are both decided by the Worker from
//     Firebase, never taken from the request — see handleNotifyApplication
//     below for the full anti-abuse reasoning. Optional env var SITE_URL
//     overrides the page URL used in the DM's link (e.g. after moving to
//     a custom domain).
//
// Deployment (see README.md for the full walkthrough):
//   1. Create a free Cloudflare account → Workers & Pages → Create Worker.
//   2. Paste this whole file in as the Worker's code.
//   3. Add a secret (Settings → Variables and Secrets):
//      - FIREBASE_SERVICE_ACCOUNT_JSON — the full contents of the service
//        account key JSON file from Firebase (Project settings → Service
//        accounts → Generate new private key).
//      - DISCORD_BOT_TOKEN — your Discord bot's token (Developer Portal →
//        your app → Bot → Reset Token). The bot must be a member of your
//        server (invite it via OAuth2 → URL Generator → scope "bot", no
//        special permissions needed). See README.md for the full walkthrough.
//      - BNET_CLIENT_ID / BNET_CLIENT_SECRET — from a Battle.net developer
//        app (develop.battle.net/access/clients → Create Client). Optional:
//        only needed for the "meine Charaktere" Armory lookup feature —
//        everything else on the guild page works fine without it. See
//        README.md for the walkthrough. (BATTLENET_CLIENT_ID/
//        BATTLENET_CLIENT_SECRET also work, if that's what you already
//        have set — see getBattlenetEnv below.)
//      - BNET_REGION — optional, defaults to 'eu' if not set. Only needed
//        if the guild's realms are on a different Battle.net region.
//      - WCL_CLIENT_ID / WCL_CLIENT_SECRET — from a free WarcraftLogs API
//        client (client.warcraftlogs.com/api/clients/ → Create Client).
//        Optional: only needed for the WarcraftLogs cards on "meine
//        Charaktere" — everything else works fine without it.
//        (WARCRAFTLOGS_CLIENT_ID/WARCRAFTLOGS_CLIENT_SECRET also work, if
//        that's what you already have set — see getWarcraftLogsEnv below.)
//        Optionally add WCL_HOST if you need a non-default WarcraftLogs
//        host — defaults to www.warcraftlogs.com if not set. Also fill in
//        WARCRAFTLOGS_ZONES below with your current tier's zone ids. See
//        README.md for the full walkthrough.
//   4. Edit GUILD_ID and DISCORD_ROLE_TO_SITE_ROLE just below to match your
//      own server and its role IDs.
//   5. Deploy. Copy the Worker's URL (looks like
//      https://guild-page-auth.YOURNAME.workers.dev) into WORKER_URL near
//      the top of rude-guild-page.html's <script> section (append
//      /mint-token to it — the news and Armory features reuse the same
//      URL, swapping in /wowhead-news or /armory-character itself).
//
// This Worker never sees your guild's data — its Discord-login job is only
// "is this really a valid Discord login, and what's their current server
// role?", and its news job only ever reads Wowhead's own public feed.

const WOWHEAD_FEED_URL = 'https://www.wowhead.com/news/rss/classic-series';
const WOWHEAD_NEWS_CACHE_SECONDS = 1200; // 20 minutes

// ---------------------------------------------------------------------
// Battle.net Armory lookup (GET /armory-character).
//
// CLASSIC_NAMESPACE targets the TBC Anniversary realms specifically
// (confirmed via an official Blizzard developer-forum reply: "the new
// namespace is classicann-{region}") — a different, current namespace
// from "classic1x" (Classic Era/Anniversary), whose character and
// guild-roster endpoints have been broken since September 2024. If
// Blizzard ever renames this namespace again, this is the one constant to
// update.
//
// getBattlenetEnv() reads secret names two ways — BNET_CLIENT_ID/
// BNET_CLIENT_SECRET/BNET_REGION (short form) or BATTLENET_CLIENT_ID/
// BATTLENET_CLIENT_SECRET/BATTLENET_REGION (long form) — since which one
// exists on a given Worker depends on when/how the Battle.net app was set
// up (e.g. reused secrets from an earlier project). Whichever pair is
// actually set wins; region defaults to 'eu' if neither is set.
// ---------------------------------------------------------------------
const CLASSIC_LOCALE = 'de_DE';

function getBattlenetEnv(env){
  return {
    clientId: env.BNET_CLIENT_ID || env.BATTLENET_CLIENT_ID || '',
    clientSecret: env.BNET_CLIENT_SECRET || env.BATTLENET_CLIENT_SECRET || '',
    region: env.BNET_REGION || env.BATTLENET_REGION || 'eu'
  };
}

// Simple in-memory cache for the app-access-token — the client-credentials
// token is valid for ~24h and shared across every /armory-character
// request this Worker handles, so there's no reason to fetch a fresh one
// every time. This lives only for as long as this Worker "isolate" stays
// warm (Cloudflare may spin up a new one at any time) — worst case, one
// extra token request. Never persisted anywhere. Keyed by client id, so a
// credential change (or a mismatched cache from a previous deploy) can
// never serve a token minted for the wrong app.
let cachedBattlenetToken = null; // { clientId, token, expiresAt } | null

async function getBattlenetAppToken(env){
  const { clientId, clientSecret } = getBattlenetEnv(env);
  if (!clientId || !clientSecret){
    throw Object.assign(new Error('missing_credentials'), { debugReason: 'no_battlenet_credentials', detail: 'Neither BNET_CLIENT_ID/BNET_CLIENT_SECRET nor BATTLENET_CLIENT_ID/BATTLENET_CLIENT_SECRET secrets are set on this Worker.' });
  }
  if (cachedBattlenetToken && cachedBattlenetToken.clientId === clientId && cachedBattlenetToken.expiresAt > Date.now() + 60000){
    return cachedBattlenetToken.token;
  }
  let res;
  try{
    res = await fetch('https://oauth.battle.net/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + btoa(`${clientId}:${clientSecret}`)
      },
      body: 'grant_type=client_credentials'
    });
  }catch(e){
    throw Object.assign(new Error('token_fetch_failed'), { debugReason: 'battlenet_oauth_fetch_failed', detail: 'Could not reach oauth.battle.net at all: ' + e.message });
  }
  if (!res.ok){
    let bodyText = ''; try{ bodyText = await res.text(); }catch(e2){}
    throw Object.assign(new Error('token_request_failed'), {
      debugReason: 'battlenet_oauth_error',
      status: res.status,
      detail: `Battle.net's OAuth token endpoint returned HTTP ${res.status}. This usually means BNET_CLIENT_ID/BNET_CLIENT_SECRET (or BATTLENET_CLIENT_ID/BATTLENET_CLIENT_SECRET) are wrong, or don't belong to the same Battle.net client, or that client was deleted/regenerated. Response: ${bodyText}`
    });
  }
  const data = await res.json();
  cachedBattlenetToken = { clientId, token: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
  return cachedBattlenetToken.token;
}

// Blizzard's numeric class ids map 1:1 onto the guild page's own CLASSES
// list (Death Knight/Monk/Demon Hunter/Evoker don't exist in Classic-era
// content and are omitted here on purpose).
const BATTLENET_CLASS_ID_TO_KEY = {
  1: 'warrior', 2: 'paladin', 3: 'hunter', 4: 'rogue', 5: 'priest',
  7: 'shaman', 8: 'mage', 9: 'warlock', 11: 'druid'
};

// ---------------------------------------------------------------------
// Equipped-gear icon grid (part of GET /armory-character's response, see
// below) — a Wowhead-gear-check-style list of every equipped item with its
// icon, name, quality color and enchant text. NOT a full 3D character
// render: Blizzard's Classic Game Data API doesn't expose one (only a tiny
// avatar at best, nowhere near the paper-doll renders Retail gets), so this
// is the closest equivalent actually available for TBC Classic.
//
// LEFT/RIGHT/BOTTOM mirror the real in-game paper-doll layout (left: head
// down to wrist: right: hands down to trinkets; bottom: weapons) so the
// grid reads the same way a character's own gear panel does in-game.
// ---------------------------------------------------------------------
const EQUIPMENT_LEFT_SLOTS = ['HEAD', 'NECK', 'SHOULDER', 'BACK', 'CHEST', 'SHIRT', 'TABARD', 'WRIST'];
const EQUIPMENT_RIGHT_SLOTS = ['HANDS', 'WAIST', 'LEGS', 'FEET', 'FINGER_1', 'FINGER_2', 'TRINKET_1', 'TRINKET_2'];
const EQUIPMENT_BOTTOM_SLOTS = ['MAIN_HAND', 'OFF_HAND', 'RANGED'];
const EQUIPMENT_SLOT_LABELS = {
  HEAD: 'Kopf', NECK: 'Hals', SHOULDER: 'Schulter', BACK: 'Rücken', CHEST: 'Brust',
  SHIRT: 'Hemd', TABARD: 'Wappenrock', WRIST: 'Handgelenk', HANDS: 'Hände',
  WAIST: 'Taille', LEGS: 'Beine', FEET: 'Füße', FINGER_1: 'Ring 1', FINGER_2: 'Ring 2',
  TRINKET_1: 'Schmuckstück 1', TRINKET_2: 'Schmuckstück 2', MAIN_HAND: 'Haupthand',
  OFF_HAND: 'Nebenhand', RANGED: 'Fernkampf'
};
// Standard WoW item-quality colors (unrelated to this site's own vote/UI
// colors — these are the game's own convention, so members recognize them
// on sight): grey/white/green/blue/purple/orange.
const ITEM_QUALITY_COLORS = {
  POOR: '#9d9d9d', COMMON: '#ffffff', UNCOMMON: '#1eff00', RARE: '#0070dd',
  EPIC: '#a335ee', LEGENDARY: '#ff8000', ARTIFACT: '#e6cc80', HEIRLOOM: '#00ccff'
};

// Item icon URLs never change for a given item id, so this cache (item id
// -> icon URL) is shared across every equipment lookup for as long as this
// Worker "isolate" stays warm — same lifetime/reasoning as
// cachedBattlenetToken above. Worst case on a cold start: one extra
// Blizzard call per unique item, which is still far cheaper than that on
// every request.
const itemIconCache = new Map();

async function fetchItemIcon(itemId, token, region){
  if (itemIconCache.has(itemId)) return itemIconCache.get(itemId);
  let icon = null;
  try{
    const res = await fetch(`https://${region}.api.blizzard.com/data/wow/media/item/${itemId}?namespace=static-classicann-${region}&locale=${CLASSIC_LOCALE}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok){
      const data = await res.json();
      const asset = Array.isArray(data.assets) && data.assets.find(a => a.key === 'icon');
      icon = (asset && asset.value) || null;
    }
  }catch(e){
    icon = null; // Best-effort only — a missing icon just falls back to a placeholder client-side.
  }
  itemIconCache.set(itemId, icon);
  return icon;
}

// Fetches one character's full equipped-item list and resolves each item's
// icon. Returns a flat array (in EQUIPMENT_LEFT/RIGHT/BOTTOM_SLOTS order
// isn't guaranteed here — the client sorts by slot when rendering) of
// { slot, slotLabel, name, quality, icon, ilvl, enchantText } — one entry
// per slot that's actually populated in-game (an empty slot is simply
// absent from the list, not included as null). Never throws: on any
// failure this returns `{ items: [], debug }` so a hiccup here never takes
// down the rest of the character card, which already has its own class/
// level/ilvl data from handleArmoryCharacter above.
async function fetchCharacterEquipment(realmSlug, name, token, region){
  let res;
  try{
    res = await fetch(`https://${region}.api.blizzard.com/profile/wow/character/${encodeURIComponent(realmSlug)}/${encodeURIComponent(name)}/equipment?namespace=profile-classicann-${region}&locale=${CLASSIC_LOCALE}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  }catch(e){
    return { items: [], debug: { reason: 'fetch_failed', detail: 'Could not reach Blizzard’s equipment endpoint at all: ' + e.message } };
  }
  if (!res.ok){
    return { items: [], debug: { reason: 'blizzard_api_error', status: res.status, detail: `Blizzard’s equipment endpoint returned HTTP ${res.status}.` } };
  }
  let data;
  try{
    data = await res.json();
  }catch(e){
    return { items: [], debug: { reason: 'bad_json', detail: 'Blizzard’s equipment response could not be parsed as JSON.' } };
  }
  const equipped = Array.isArray(data.equipped_items) ? data.equipped_items : [];

  const items = await Promise.all(equipped.map(async (eq) => {
    const slot = eq.slot && eq.slot.type;
    if (!slot) return null;
    const itemId = eq.item && eq.item.id;
    const icon = itemId ? await fetchItemIcon(itemId, token, region) : null;
    // `enchantments` holds both permanent enchants and socketed gems on
    // Blizzard's side, each with its own human-readable `display_string`
    // (already localized) — joined as-is since that's already exactly the
    // "Enchanted: +N X" text WoW itself shows.
    const enchantText = Array.isArray(eq.enchantments)
      ? eq.enchantments.map(e => e.display_string).filter(Boolean).join(' · ')
      : '';
    return {
      slot,
      slotLabel: EQUIPMENT_SLOT_LABELS[slot] || slot,
      name: eq.name || (eq.item && eq.item.id ? `Item #${eq.item.id}` : 'Unbekannt'),
      quality: (eq.quality && eq.quality.type) || 'COMMON',
      icon,
      ilvl: (eq.level && eq.level.value) || null,
      enchantText
    };
  }));

  return { items: items.filter(Boolean), debug: { reason: 'ok' } };
}

// GET /armory-character?realm=<slug>&name=<charname>
// Always resolves to a 200 with { found, character?, debug } — mirroring
// resolveSiteRoleFromDiscord's pattern above — so a wrong namespace, a
// misspelled realm slug, or Battle.net being briefly unavailable is easy
// to diagnose from the browser console rather than a silent failure.
async function handleArmoryCharacter(request, env, cors){
  const url = new URL(request.url);
  const realmSlug = (url.searchParams.get('realm') || '').trim().toLowerCase();
  const name = (url.searchParams.get('name') || '').trim().toLowerCase();
  if (!realmSlug || !name){
    return json({ found: false, debug: { reason: 'missing_params', detail: 'Both "realm" and "name" query params are required.' } }, 200, cors);
  }

  let token;
  const { region } = getBattlenetEnv(env);
  try{
    token = await getBattlenetAppToken(env);
  }catch(e){
    return json({ found: false, debug: { reason: e.debugReason || 'battlenet_auth_failed', status: e.status, detail: e.detail || e.message } }, 200, cors);
  }

  const namespace = `profile-classicann-${region}`;
  const apiUrl = `https://${region}.api.blizzard.com/profile/wow/character/${encodeURIComponent(realmSlug)}/${encodeURIComponent(name)}?namespace=${namespace}&locale=${CLASSIC_LOCALE}`;
  let res;
  try{
    res = await fetch(apiUrl, { headers: { Authorization: `Bearer ${token}` } });
  }catch(e){
    return json({ found: false, debug: { reason: 'fetch_failed', detail: 'Could not reach Blizzard’s Game Data API at all: ' + e.message } }, 200, cors);
  }
  if (!res.ok){
    let detail = `Blizzard’s API returned HTTP ${res.status} for realm "${realmSlug}", character "${name}" (namespace ${namespace}).`;
    if (res.status === 404) detail += ' 404 usually means the character/realm-slug is spelled wrong, the character hasn’t logged in recently enough for Blizzard to have indexed it, or (if this keeps happening for every character) the region (BNET_REGION) doesn’t match where this realm actually is — double-check it against a character’s own Armory URL.';
    else if (res.status === 401) detail += ' 401 usually means the Battle.net app token is invalid — check BNET_CLIENT_ID/BNET_CLIENT_SECRET.';
    return json({ found: false, debug: { reason: 'blizzard_api_error', status: res.status, detail } }, 200, cors);
  }
  let data;
  try{
    data = await res.json();
  }catch(e){
    return json({ found: false, debug: { reason: 'bad_json', detail: 'Blizzard’s response could not be parsed as JSON.' } }, 200, cors);
  }
  const classId = data.character_class && data.character_class.id;

  // Equipment is fetched as a second, best-effort call — its own failure
  // never fails the whole /armory-character response, since the class/
  // level/ilvl summary above is already useful on its own (and is exactly
  // what this endpoint returned before the equipment-grid feature).
  const equipment = await fetchCharacterEquipment(realmSlug, name, token, region);

  return json({
    found: true,
    character: {
      name: data.name || name,
      realm: (data.realm && data.realm.name) || realmSlug,
      level: data.level || null,
      classKey: BATTLENET_CLASS_ID_TO_KEY[classId] || null,
      className: (data.character_class && data.character_class.name) || null,
      raceName: (data.race && data.race.name) || null,
      faction: (data.faction && data.faction.type) || null,
      guildName: (data.guild && data.guild.name) || null,
      itemLevel: data.average_item_level || data.equipped_item_level || null,
      lastLoginTimestamp: data.last_login_timestamp || null,
      equipment: equipment.items,
      equipmentDebug: equipment.debug
    },
    debug: { reason: 'ok' }
  }, 200, cors);
}

// ---------------------------------------------------------------------
// GET /warcraftlogs-character?realm=<slug>&name=<charname> — a character's
// current-phase WarcraftLogs raid rankings, for the "Meine Charaktere"
// page: per-zone boss-kill counts + best all-star points/rank, plus an
// overall Best Perf. Avg. Needs its own API client (free, self-service —
// see README.md's "Aktuelle Logs-Übersicht (WarcraftLogs)" section) since
// this is a completely separate service from Discord/Battle.net/Firebase.
//
// WARCRAFTLOGS_ZONES below is a fixed, hand-maintained list of the
// current tier's zone ids (same pattern as GUILD_ID/DISCORD_ROLE_TO_SITE_
// ROLE above) — WarcraftLogs has no reliable "current phase" concept of
// its own to query automatically, and for a Classic progression server
// hand-picking the zones is more predictable anyway. Update this array
// whenever a new phase/tier unlocks; see the README for how to find a
// zone's id.
//
// A note on reliability: WarcraftLogs' v2 API returns zoneRankings as an
// untyped JSON blob (not a typed GraphQL object), so unlike every other
// integration in this file, its exact field names aren't guaranteed by a
// schema — the parsing below follows WarcraftLogs' long-standing, widely
// used response shape, but this endpoint's `debug` field is the first
// place to look if the numbers it returns ever look wrong after a real
// deploy (see the README's troubleshooting note for what to check).
// ---------------------------------------------------------------------
// Fill in your current tier's zone ids here. An entry with `id: 0` is
// treated as "not configured yet" and simply skipped (see README.md).
// `id: 'current'` is a special value for whichever zone WarcraftLogs
// itself currently treats as this character's default/most-relevant one —
// its own site leaves the "?zone=" query param off the URL for exactly
// that zone (every other zone gets an explicit "?zone=<id>" when picked
// from the character's Rankings tab dropdown), so there's no fixed numeric
// id to copy for it; this asks WarcraftLogs to resolve it the same way
// its own UI does (by calling `zoneRankings` with no zoneID argument at
// all) instead of guessing a number.
const WARCRAFTLOGS_ZONES = [
  // BT/Hyjal is this character's current/default zone on WarcraftLogs
  // (confirmed from a real screenshot of their Rankings page) — its own
  // site never puts a "?zone=" id in the URL for it, so `id: 'current'`
  // here, rather than a specific number. Listed first so it stays the
  // top-priority "Best Perf. Avg" zone as long as it's the current tier.
  { id: 'current', label: 'BT / Hyjal' },
  { id: 1056, label: 'SSC / TK' },
  { id: 1048, label: 'Gruul / Magtheridon' }
];

// Reads WarcraftLogs credentials two ways — WCL_CLIENT_ID/WCL_CLIENT_SECRET/
// WCL_HOST (short form) or WARCRAFTLOGS_CLIENT_ID/WARCRAFTLOGS_CLIENT_SECRET
// (long form) — same "whichever pair is actually set wins" pattern as
// getBattlenetEnv above, since which one exists on a given Worker depends
// on which guide/step was followed when it was set up. WCL_HOST lets a
// non-default WarcraftLogs host be used (e.g. a regional or self-hosted
// endpoint); defaults to the public site if not set. Accepts the host with
// or without a "https://" prefix or trailing slash.
function getWarcraftLogsEnv(env){
  const rawHost = env.WCL_HOST || 'www.warcraftlogs.com';
  return {
    clientId: env.WCL_CLIENT_ID || env.WARCRAFTLOGS_CLIENT_ID || '',
    clientSecret: env.WCL_CLIENT_SECRET || env.WARCRAFTLOGS_CLIENT_SECRET || '',
    host: rawHost.replace(/^https?:\/\//, '').replace(/\/+$/, '')
  };
}

// Client-credentials token, cached for this Worker isolate's lifetime —
// same reasoning/pattern as cachedBattlenetToken above (WarcraftLogs
// tokens are also long-lived, and this is a per-app, not per-user, token).
// Keyed by clientId so a credential change never serves a stale token.
let cachedWarcraftLogsToken = null; // { clientId, token, expiresAt } | null

async function getWarcraftLogsToken(env){
  const { clientId, clientSecret, host } = getWarcraftLogsEnv(env);
  if (!clientId || !clientSecret){
    throw Object.assign(new Error('missing_credentials'), { debugReason: 'no_warcraftlogs_credentials', detail: 'Neither WCL_CLIENT_ID/WCL_CLIENT_SECRET nor WARCRAFTLOGS_CLIENT_ID/WARCRAFTLOGS_CLIENT_SECRET secrets are set on this Worker.' });
  }
  if (cachedWarcraftLogsToken && cachedWarcraftLogsToken.clientId === clientId && cachedWarcraftLogsToken.expiresAt > Date.now() + 60000){
    return cachedWarcraftLogsToken.token;
  }
  let res;
  try{
    res = await fetch(`https://${host}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + btoa(`${clientId}:${clientSecret}`)
      },
      body: 'grant_type=client_credentials'
    });
  }catch(e){
    throw Object.assign(new Error('token_fetch_failed'), { debugReason: 'warcraftlogs_oauth_fetch_failed', detail: `Could not reach ${host} at all: ` + e.message });
  }
  if (!res.ok){
    let bodyText = ''; try{ bodyText = await res.text(); }catch(e2){}
    throw Object.assign(new Error('token_request_failed'), {
      debugReason: 'warcraftlogs_oauth_error',
      status: res.status,
      detail: `WarcraftLogs' OAuth token endpoint returned HTTP ${res.status}. This usually means WCL_CLIENT_ID/WCL_CLIENT_SECRET (or WARCRAFTLOGS_CLIENT_ID/WARCRAFTLOGS_CLIENT_SECRET) are wrong, or the client was deleted/regenerated. Response: ${bodyText}`
    });
  }
  const data = await res.json();
  cachedWarcraftLogsToken = { clientId, token: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
  return cachedWarcraftLogsToken.token;
}

async function handleWarcraftLogsCharacter(request, env, cors){
  const url = new URL(request.url);
  const realmSlug = (url.searchParams.get('realm') || '').trim().toLowerCase();
  const name = (url.searchParams.get('name') || '').trim();
  if (!realmSlug || !name){
    return json({ found: false, debug: { reason: 'missing_params', detail: 'Both "realm" and "name" query params are required.' } }, 200, cors);
  }

  const configuredZones = WARCRAFTLOGS_ZONES.filter(z => z && z.id);
  if (!configuredZones.length){
    return json({ found: false, debug: { reason: 'no_zones_configured', detail: 'WARCRAFTLOGS_ZONES has no zone ids filled in yet — see README.md "Aktuelle Logs-Übersicht (WarcraftLogs)".' } }, 200, cors);
  }

  let token;
  try{
    token = await getWarcraftLogsToken(env);
  }catch(e){
    return json({ found: false, debug: { reason: e.debugReason || 'warcraftlogs_auth_failed', status: e.status, detail: e.detail || e.message } }, 200, cors);
  }

  const { region } = getBattlenetEnv(env);
  const serverRegion = (region || 'eu').toUpperCase();
  // Each configured zone becomes its own aliased zoneRankings(...) field in
  // one GraphQL request (z0, z1, z2, …) rather than N separate requests —
  // WarcraftLogs' API is rate-limited per-app, so this keeps one character
  // card to a single API call no matter how many zones are configured.
  //
  // WarcraftLogs' zoneRankings defaults to `metric: dps` when no metric is
  // given (confirmed from a real raw-response dump — the returned JSON
  // itself says `metric: "dps"`). For a healer or tank, that's the wrong
  // role: its `allStars` comes back empty (no DPS all-star entry exists for
  // them) and `bestPerformanceAverage`/`medianPerformanceAverage` are the
  // character's *DPS* numbers, not the Healing/Tank numbers WarcraftLogs'
  // own character page shows by default. Tanks specifically aren't ranked
  // on `hps` either — WarcraftLogs ranks tank survivability under its own
  // metric, `krsi` ("Kihra's Resolve-weighted Survivability Index", an avg
  // of TMI and resolve-weighted effective-healing-received; this is also
  // what the "Tank" role tab uses on warcraftlogs.com). So each zone is
  // queried three times — `dps`, `hps`, `krsi` (aliased ...D / ...H / ...K)
  // — and the merge step below picks whichever one actually has `allStars`
  // data, since that's the role WarcraftLogs itself recognizes this
  // character as raiding in. A pure-DPS character simply has empty
  // `allStars` on the `hps`/`krsi` copies and keeps using its `dps` copy as
  // before.
  const zoneFields = configuredZones.map((z, i) => {
    const zoneArg = z.id === 'current' ? '' : `zoneID: ${z.id}`;
    const withMetric = (metric) => zoneArg ? `zoneRankings(${zoneArg}, metric: ${metric})` : `zoneRankings(metric: ${metric})`;
    return `z${i}D: ${withMetric('dps')}\n          z${i}H: ${withMetric('hps')}\n          z${i}K: ${withMetric('krsi')}`;
  }).join('\n          ');
  const query = `query($name: String!, $serverSlug: String!, $serverRegion: String!) {
        characterData {
          character(name: $name, serverSlug: $serverSlug, serverRegion: $serverRegion) {
            id
            ${zoneFields}
          }
        }
      }`;

  const { host } = getWarcraftLogsEnv(env);
  let res;
  try{
    res = await fetch(`https://${host}/api/v2/client`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { name, serverSlug: realmSlug, serverRegion } })
    });
  }catch(e){
    return json({ found: false, debug: { reason: 'fetch_failed', detail: 'Could not reach WarcraftLogs’ API at all: ' + e.message } }, 200, cors);
  }
  if (!res.ok){
    let bodyText = ''; try{ bodyText = await res.text(); }catch(e2){}
    return json({ found: false, debug: { reason: 'warcraftlogs_api_error', status: res.status, detail: `WarcraftLogs’ API returned HTTP ${res.status}. ${bodyText}` } }, 200, cors);
  }
  let payload;
  try{
    payload = await res.json();
  }catch(e){
    return json({ found: false, debug: { reason: 'bad_json', detail: 'WarcraftLogs’ response could not be parsed as JSON.' } }, 200, cors);
  }
  if (payload.errors && payload.errors.length){
    return json({ found: false, debug: { reason: 'graphql_error', detail: payload.errors.map(e => e.message).join('; ') } }, 200, cors);
  }

  const character = payload && payload.data && payload.data.characterData && payload.data.characterData.character;
  if (!character){
    const checkUrl = `https://${host}/character/${serverRegion.toLowerCase()}/${encodeURIComponent(realmSlug)}/${encodeURIComponent(name)}`;
    return json({
      found: false,
      debug: {
        reason: 'character_not_found',
        detail: `WarcraftLogs has no character matching name="${name}", serverSlug="${realmSlug}", serverRegion="${serverRegion}". Two common causes: (1) this character genuinely has no logs uploaded to WarcraftLogs yet — open ${checkUrl} directly to check; (2) serverSlug/serverRegion don't match what WarcraftLogs itself uses for this realm (this Worker reuses the same realm slug/region as the Blizzard Armory lookup, which isn't guaranteed to be identical to WarcraftLogs' own — compare the slug in that URL against what WarcraftLogs shows once you find the character by searching its site).`,
        checkUrl
      }
    }, 200, cors);
  }

  // zoneRankings' shape (see the file-header note above for why this is
  // "best effort"): { bestPerformanceAverage, medianPerformanceAverage,
  // allStars: [{ points, rank, spec, ... }], rankings: [{ encounter:
  // { name }, totalKills, ... }] }.
  //
  // Each zone was queried as metric: dps (…D), hps (…H) and krsi (…K) — see
  // the query-building comment above. Pick whichever one actually has
  // allStars data, since an empty allStars means WarcraftLogs doesn't
  // recognize the character as playing that role; that's also why
  // bestPerformanceAverage/medianPerformanceAverage can otherwise look
  // "off" compared to WarcraftLogs' own character page (it defaults to the
  // character's real role, not always dps). hps/krsi are preferred over dps
  // when they have data (dps is the API's fallback default, so it's the
  // least reliable signal of the three); if two non-dps variants both have
  // allStars data (shouldn't normally happen for a single-role character),
  // hps wins arbitrarily. Falls back to the dps copy if none of the three
  // have allStars data (e.g. a character with no ranked logs at all in this
  // zone yet).
  const pickRoleVariant = (dpsRaw, hpsRaw, krsiRaw) => {
    const hasAllStars = (raw) => raw && Array.isArray(raw.allStars) && raw.allStars.length;
    if (hasAllStars(hpsRaw)) return hpsRaw;
    if (hasAllStars(krsiRaw)) return krsiRaw;
    if (dpsRaw) return dpsRaw;
    return hpsRaw || krsiRaw || null;
  };
  const zones = configuredZones.map((z, i) => {
    const raw = pickRoleVariant(character['z' + i + 'D'], character['z' + i + 'H'], character['z' + i + 'K']);
    if (!raw || typeof raw !== 'object'){
      return { label: z.label, hasData: false };
    }
    const bestAllStar = Array.isArray(raw.allStars) && raw.allStars.length ? raw.allStars[0] : null;
    const encounters = Array.isArray(raw.rankings) ? raw.rankings : [];
    return {
      label: z.label,
      hasData: true,
      killed: encounters.filter(r => (r && r.totalKills) > 0).length,
      total: encounters.length,
      points: bestAllStar && typeof bestAllStar.points === 'number' ? Math.round(bestAllStar.points * 100) / 100 : null,
      rank: bestAllStar && typeof bestAllStar.rank === 'number' ? bestAllStar.rank : null,
      // Temporary diagnostic aid, not used for display: the untouched
      // zoneRankings JSON WarcraftLogs actually sent for this zone. Since
      // that shape isn't guaranteed by a schema (see the file-header note
      // above), this is here so a wrong-looking result (e.g. 0/0 for a
      // character that clearly has logs) can be root-caused from a single
      // browser-console copy/paste instead of more guessing — remove once
      // the mapping above is confirmed correct against real data.
      _raw: raw
    };
  });

  // "Best Perf. Avg" is reported per-zone by WarcraftLogs, not once
  // overall — this surfaces the first configured zone that actually has a
  // number, which in practice is whichever current-tier zone the member
  // has parses in (their highest-priority progression zone, since
  // WARCRAFTLOGS_ZONES is meant to be ordered newest/hardest-first).
  let bestPerformance = null;
  for (let i = 0; i < configuredZones.length; i++){
    // Reuses the same dps/hps pick as `zones` above (zones[i]._raw), so
    // "Best Perf. Avg" always matches whatever role the zone card shows.
    const raw = zones[i] && zones[i]._raw;
    if (raw && typeof raw.bestPerformanceAverage === 'number'){
      bestPerformance = {
        best: Math.round(raw.bestPerformanceAverage * 10) / 10,
        median: typeof raw.medianPerformanceAverage === 'number' ? Math.round(raw.medianPerformanceAverage * 10) / 10 : null,
        zoneLabel: configuredZones[i].label
      };
      break;
    }
  }

  return json({
    found: true,
    warcraftlogs: {
      characterUrl: `https://${host}/character/${serverRegion.toLowerCase()}/${encodeURIComponent(realmSlug)}/${encodeURIComponent(name)}`,
      zones,
      bestPerformance
    },
    debug: { reason: 'ok' }
  }, 200, cors);
}

// ---------------------------------------------------------------------
// Discord role → site role mapping.
//
// Edit these two to match your own server. GUILD_ID is your Discord
// server's ID. DISCORD_ROLE_TO_SITE_ROLE maps each Discord role ID you
// care about to a site role — checked TOP TO BOTTOM, so if someone holds
// more than one of these Discord roles, the first (highest) match in this
// list wins. Anyone who isn't in the server at all, or holds none of these
// roles, gets 'community' (the site's public default).
//
// Admin is deliberately NOT in this list and can't be auto-assigned from
// Discord — it's only ever granted by hand via the site's own "Manage
// access" panel, so promoting someone to Admin always requires a
// conscious action from an existing Admin.
// ---------------------------------------------------------------------
const GUILD_ID = '1398020976964276224';
const DISCORD_ROLE_TO_SITE_ROLE = [
  { discordRoleId: '1411046832322379837', siteRole: 'officer' },   // Offi
  { discordRoleId: '1411047468224745613', siteRole: 'member' },    // Guild Member
  { discordRoleId: '1411360563019255850', siteRole: 'community' }  // Community
];

// Your Firebase Realtime Database's URL — same value as `databaseURL` in
// guild-loot-ledger.html's FIREBASE_CONFIG. Only needed for the periodic
// role re-sync job (see the top of this file and "Keeping roles in sync
// automatically" in README.md) — leave it as-is if you don't want that job,
// it just won't have anywhere to write to and will skip itself.
const FIREBASE_DATABASE_URL = 'https://aeternum-guild-loot-awards-default-rtdb.europe-west1.firebasedatabase.app';

// Pure top-to-bottom lookup against DISCORD_ROLE_TO_SITE_ROLE, shared by
// both the per-login check (resolveSiteRoleFromDiscord below) and the
// periodic re-sync job (syncDiscordRolesToFirebase) so the two can never
// drift apart into resolving the same Discord roles differently.
function resolveSiteRoleFromRoleIds(roleIds){
  const roles = Array.isArray(roleIds) ? roleIds : [];
  const matched = DISCORD_ROLE_TO_SITE_ROLE.find(mapping => roles.includes(mapping.discordRoleId));
  return matched ? matched.siteRole : 'community';
}

// Looks up this person's current roles in your Discord server (via the
// bot token) and resolves them to a site role using the mapping above.
// Always resolves to *something* — including when the bot isn't
// configured yet, the API call fails, or the person isn't a member of
// your server at all — so a hiccup here never blocks login entirely, it
// just falls back to the lowest-privilege role.
//
// Also returns a `debug` object alongside the resolved role, explaining
// exactly *why* that role was chosen. This never blocks or changes
// anything — it's returned to the client purely so that if someone ends
// up with the wrong role (typically stuck on Community), whoever set this
// up can open the browser console right after logging in and immediately
// see which of the setup steps is the problem, instead of only knowing
// "it didn't work" — see the "Syncing roles from your Discord server"
// section in README.md for what each debug reason means.
async function resolveSiteRoleFromDiscord(discordUserId, env){
  if (!env.DISCORD_BOT_TOKEN){
    return { role: 'community', debug: { reason: 'no_bot_token', detail: 'DISCORD_BOT_TOKEN secret is not set on this Worker.' } };
  }
  let res;
  try{
    res = await fetch(`https://discord.com/api/guilds/${GUILD_ID}/members/${discordUserId}`, {
      headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }
    });
  }catch(e){
    return { role: 'community', debug: { reason: 'fetch_failed', detail: 'Could not reach Discord’s API at all: ' + e.message } };
  }
  if (!res.ok){
    let reason = 'discord_api_error';
    let detail = `Discord’s API returned HTTP ${res.status} for GET /guilds/${GUILD_ID}/members/${discordUserId}.`;
    if (res.status === 401) detail += ' 401 usually means DISCORD_BOT_TOKEN is missing/invalid/regenerated since it was pasted into the Worker.';
    else if (res.status === 403) detail += ' 403 usually means the bot exists but isn’t actually a member of this server (or was kicked) — re-invite it via the OAuth2 URL Generator (scope "bot").';
    else if (res.status === 404) detail += ' 404 usually means either GUILD_ID is wrong, or this Discord user isn’t a member of that server.';
    return { role: 'community', debug: { reason, status: res.status, detail } };
  }
  let member;
  try{
    member = await res.json();
  }catch(e){
    return { role: 'community', debug: { reason: 'bad_json', detail: 'Discord’s response could not be parsed as JSON.' } };
  }
  const roles = Array.isArray(member.roles) ? member.roles : [];
  const matched = DISCORD_ROLE_TO_SITE_ROLE.find(mapping => roles.includes(mapping.discordRoleId));
  if (matched) return { role: matched.siteRole, debug: { reason: 'matched', matchedDiscordRoleId: matched.discordRoleId, allRoleIdsOnDiscord: roles } };
  return {
    role: 'community',
    debug: {
      reason: 'no_matching_role',
      detail: 'This Discord member was found, but none of their current Discord role IDs match any entry in DISCORD_ROLE_TO_SITE_ROLE. Compare allRoleIdsOnDiscord below against the discordRoleId values configured in the Worker — a mismatched/typo’d id is the most common cause.',
      allRoleIdsOnDiscord: roles
    }
  };
}

// ---------------------------------------------------------------------
// Periodic role re-sync (Cron Trigger → scheduled() below).
//
// Job 1 above (resolveSiteRoleFromDiscord) only ever runs when someone
// actually logs in — so a Community member promoted to Guild Member on
// Discord stays stuck on Community here until they next log back in. This
// job fixes that without needing anyone to log in at all: it fetches your
// whole Discord server's current member list once, re-resolves everyone
// who's already known to the guild page (i.e. already has a discordRoles
// entry — they logged in at least once before), and corrects any entry
// whose role no longer matches their current Discord roles.
// ---------------------------------------------------------------------

// GET /guilds/{guild.id}/members, paginated (Discord caps each page at
// 1000). Requires the "Server Members Intent" to be enabled for your bot
// in the Developer Portal (Bot → Privileged Gateway Intents) — without it
// this 403s even though the same bot token works fine for job 1's
// single-member lookup, which doesn't need that intent.
async function fetchAllGuildMembers(env){
  const members = [];
  let after = '0';
  while (true){
    let res;
    try{
      res = await fetch(`https://discord.com/api/guilds/${GUILD_ID}/members?limit=1000&after=${after}`, {
        headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }
      });
    }catch(e){
      throw Object.assign(new Error('discord_members_fetch_failed'), { detail: 'Could not reach Discord’s API at all: ' + e.message });
    }
    if (!res.ok){
      let detail = `Discord’s API returned HTTP ${res.status} for GET /guilds/${GUILD_ID}/members.`;
      if (res.status === 403) detail += ' 403 here (but not on the single-member lookup job 1 uses) usually means the "Server Members Intent" isn’t enabled for the bot in the Developer Portal → Bot → Privileged Gateway Intents.';
      throw Object.assign(new Error('discord_members_fetch_failed'), { status: res.status, detail });
    }
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    members.push(...batch);
    if (batch.length < 1000) break;
    after = batch[batch.length - 1].user.id;
  }
  return members;
}

// Mints a Google OAuth2 access token for the same service account used to
// mint Firebase custom tokens (createFirebaseCustomToken below), but with
// the Realtime Database scope instead — this grants admin-level access
// that bypasses the database's security rules entirely (same as the
// Admin SDK), which is what lets this job write to discordRoles without a
// logged-in user's auth. No Firebase rule changes are needed for this job.
async function createGoogleAccessToken(env){
  const raw = env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON secret is not set');
  const serviceAccount = JSON.parse(raw);

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  };
  const encHeader = base64url(JSON.stringify(header));
  const encPayload = base64url(JSON.stringify(payload));
  const unsigned = `${encHeader}.${encPayload}`;
  const key = await importPrivateKey(serviceAccount.private_key);
  const signature = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${base64url(arrayBufferToBinaryString(signature))}`;

  let res;
  try{
    res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${encodeURIComponent(jwt)}`
    });
  }catch(e){
    throw new Error('Could not reach Google’s OAuth token endpoint: ' + e.message);
  }
  if (!res.ok){
    const bodyText = await res.text().catch(() => '');
    throw new Error(`Google OAuth token request failed: HTTP ${res.status} ${bodyText}`);
  }
  const data = await res.json();
  return data.access_token;
}

async function syncDiscordRolesToFirebase(env){
  if (!env.DISCORD_BOT_TOKEN){
    console.log('[role sync] skipped: DISCORD_BOT_TOKEN secret is not set.');
    return;
  }
  if (!FIREBASE_DATABASE_URL){
    console.log('[role sync] skipped: FIREBASE_DATABASE_URL is not configured at the top of the Worker.');
    return;
  }

  let members;
  try{
    members = await fetchAllGuildMembers(env);
  }catch(e){
    console.log('[role sync] could not fetch the Discord member list: ' + (e.detail || e.message));
    return;
  }

  // discordUserId -> the site role they currently resolve to, for everyone
  // presently in the server.
  const currentRoleByUserId = new Map();
  for (const member of members){
    if (!member || !member.user || !member.user.id) continue;
    currentRoleByUserId.set(member.user.id, resolveSiteRoleFromRoleIds(member.roles));
  }

  let accessToken;
  try{
    accessToken = await createGoogleAccessToken(env);
  }catch(e){
    console.log('[role sync] could not mint a Firebase access token: ' + e.message);
    return;
  }

  let stored;
  try{
    const res = await fetch(`${FIREBASE_DATABASE_URL}/guild-loot-data/discordRoles.json`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    stored = await res.json();
  }catch(e){
    console.log('[role sync] could not read discordRoles from Firebase: ' + e.message);
    return;
  }
  if (!stored){
    console.log('[role sync] discordRoles is empty — nobody has logged in yet, nothing to re-check.');
    return;
  }

  // Only touches uids that already have a discordRoles entry (i.e. have
  // logged in at least once — this job never invents new members). Admin
  // is always left alone: it's hand-granted and never auto-assigned, on
  // login or here. Anyone who's left the server entirely (no longer in
  // currentRoleByUserId) falls back to 'community', same as a fresh login
  // for them would resolve today.
  const updates = {};
  for (const [uid, entry] of Object.entries(stored)){
    if (!entry || entry.role === 'admin') continue;
    const resolvedRole = currentRoleByUserId.has(uid) ? currentRoleByUserId.get(uid) : 'community';
    if (resolvedRole !== entry.role) updates[`${uid}/role`] = resolvedRole;
  }

  const changedCount = Object.keys(updates).length;
  if (changedCount === 0){
    console.log(`[role sync] checked ${Object.keys(stored).length} known member(s) — all already up to date.`);
    return;
  }

  try{
    const res = await fetch(`${FIREBASE_DATABASE_URL}/guild-loot-data/discordRoles.json`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => '')}`);
  }catch(e){
    console.log('[role sync] failed to write updated roles to Firebase: ' + e.message);
    return;
  }

  console.log(`[role sync] updated ${changedCount} member(s): ` + JSON.stringify(updates));
}

export default {
  async fetch(request, env, ctx) {
    const cors = corsHeaders(request, env);
    const url = new URL(request.url);

    if (isOriginAllowed(request, env) === false) {
      return json({ error: 'Origin not allowed' }, 403, cors);
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    const route = ['wowhead-news', 'armory-character', 'warcraftlogs-character', 'notify-application']
      .find(r => url.pathname.endsWith('/' + r)) || 'mint-token';
    if (rateLimited(route, request)) {
      return json({ error: 'Too many requests — please wait a minute and try again.' }, 429, Object.assign({ 'Retry-After': '60' }, cors));
    }

    if (url.pathname.endsWith('/wowhead-news')) {
      if (request.method !== 'GET') {
        return json({ error: 'Method not allowed' }, 405, cors);
      }
      return handleWowheadNews(request, cors, ctx);
    }

    if (url.pathname.endsWith('/armory-character')) {
      if (request.method !== 'GET') {
        return json({ error: 'Method not allowed' }, 405, cors);
      }
      return handleArmoryCharacter(request, env, cors);
    }

    if (url.pathname.endsWith('/warcraftlogs-character')) {
      if (request.method !== 'GET') {
        return json({ error: 'Method not allowed' }, 405, cors);
      }
      return handleWarcraftLogsCharacter(request, env, cors);
    }

    if (url.pathname.endsWith('/notify-application')) {
      if (request.method !== 'POST') {
        return json({ error: 'Method not allowed' }, 405, cors);
      }
      return handleNotifyApplication(request, env, cors);
    }

    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405, cors);
    }

    return handleMintToken(request, env, cors);
  },

  // Fires on the Cron Trigger schedule configured for this Worker in the
  // Cloudflare dashboard (Settings → Triggers → Cron Triggers) — see
  // "Keeping roles in sync automatically" in README.md. Does nothing at
  // all until a trigger is added there; this handler being present is not
  // by itself enough to make it run.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(syncDiscordRolesToFirebase(env));
  }
};

async function handleMintToken(request, env, cors) {
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: 'Invalid request body' }, 400, cors);
    }

    const discordAccessToken = body && body.discordAccessToken;
    if (!discordAccessToken || typeof discordAccessToken !== 'string') {
      return json({ error: 'Missing discordAccessToken' }, 400, cors);
    }

    // Verify the login directly with Discord ourselves — never trust a
    // client-supplied user id/username, since anyone could lie about that.
    let discordUser;
    try {
      const discordRes = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${discordAccessToken}` }
      });
      if (!discordRes.ok) {
        return json({ error: 'Discord token is not valid' }, 401, cors);
      }
      discordUser = await discordRes.json();
    } catch (e) {
      return json({ error: 'Could not reach Discord' }, 502, cors);
    }

    if (!discordUser || !discordUser.id) {
      return json({ error: 'Unexpected response from Discord' }, 502, cors);
    }

    const { role: siteRole, debug: roleDebug } = await resolveSiteRoleFromDiscord(discordUser.id, env);

    let customToken;
    try {
      customToken = await createFirebaseCustomToken(discordUser.id, siteRole, env);
    } catch (e) {
      return json({ error: 'Could not mint Firebase token: ' + e.message }, 500, cors);
    }

    return json({
      token: customToken,
      role: siteRole,
      // Not secret (just Discord role ids + an HTTP status), and ignored
      // by the app's own logic — the client only ever logs this to the
      // browser console so a role that unexpectedly resolved to Community
      // can be diagnosed. See resolveSiteRoleFromDiscord above.
      roleDebug,
      user: {
        id: discordUser.id,
        username: discordUser.username,
        avatar: discordUser.avatar || null
      }
    }, 200, cors);
}

// POST /notify-application — DMs the Officers/Admins who've opted into
// "Bewerbungen melden" (Manage access on the guild page) about a guild
// application: either right after it was submitted (`kind: 'new'`) or when
// the applicant presses "Erinnerung senden" (`kind: 'reminder'`). The
// in-site quest bell works regardless; this is the extra Discord nudge.
//
// Body: { applicationId, kind }. Nothing else from the caller is trusted:
// no OAuth token is required (an applicant's browser calls this), so the
// Worker decides everything itself from Firebase, read with the service-
// account admin credential (same one the Cron role-sync job uses):
//   - the message text is built here from the stored application, with a
//     link to SITE_URL — a caller can't inject their own text or links;
//   - the recipients are read here from discordRoles (role admin/officer
//     AND notifyOnApplications set, minus the applicant) — a caller can't
//     pick who gets DM'd;
//   - 'new' only fires within 10 minutes of createdAt and only once per
//     application (stamps `notifiedAt`);
//   - 'reminder' only fires for a still-open application and only once per
//     APPLICATION_REMINDER_COOLDOWN_DAYS, measured against `reminderSentAt`,
//     which only this Worker writes (the applicant can write
//     `lastReminderAt` under the current rules, so that one isn't trusted
//     for the cooldown). Stamps both fields on success.
// Each recipient is also confirmed to still be a guild member before a DM
// is attempted. Discord mentions are disabled on the message.
const SITE_URL = 'https://nastyschmo.github.io/AeternumGuildLootAwarder/';
const APPLICATION_REMINDER_COOLDOWN_DAYS = 14;
const APPLICATION_CLASS_LABELS = {
  warrior: 'Warrior', paladin: 'Paladin', hunter: 'Hunter', rogue: 'Rogue',
  priest: 'Priest', shaman: 'Shaman', mage: 'Mage', warlock: 'Warlock', druid: 'Druid'
};

// Applicant-supplied names end up in a bot DM, so keep them to plain,
// short text: no links, markdown or mention syntax.
function sanitizeNotifyName(value){
  return String(value || '')
    .replace(/[^\p{L}\p{N} .'\-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
}

function buildApplicationNotifyMessage(kind, applicationId, application, siteUrl){
  const who = sanitizeNotifyName(application.firstName) || sanitizeNotifyName(application.applicantName) || 'Jemand';
  const classLabel = (Array.isArray(application.picks) ? application.picks : [])
    .map(p => p && APPLICATION_CLASS_LABELS[p.classId])
    .filter(Boolean)
    .join(' / ');
  const link = siteUrl + '#recruit?app=' + encodeURIComponent(applicationId);
  const suffix = classLabel ? ` (${classLabel})` : '';
  return kind === 'reminder'
    ? `Erinnerung: Die Bewerbung von ${who}${suffix} wartet noch auf eine Rückmeldung — direkt ansehen: ${link}`
    : `Neue Bewerbung von ${who}${suffix} — direkt ansehen: ${link}`;
}

async function handleNotifyApplication(request, env, cors) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Invalid request body' }, 400, cors);
  }

  const applicationId = body && body.applicationId;
  const kind = body && body.kind === 'reminder' ? 'reminder' : 'new';
  // Firebase push keys (and the client's own fallback id format) only —
  // also keeps the id safe to drop into a database path below.
  if (!applicationId || typeof applicationId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(applicationId)) {
    return json({ error: 'Missing or invalid applicationId' }, 400, cors);
  }
  if (!env.DISCORD_BOT_TOKEN) {
    return json({ error: 'Bot not configured — DISCORD_BOT_TOKEN secret is not set' }, 500, cors);
  }
  if (!FIREBASE_DATABASE_URL) {
    return json({ error: 'Firebase not configured — FIREBASE_DATABASE_URL is not set at the top of the Worker' }, 500, cors);
  }

  const applicationUrl = `${FIREBASE_DATABASE_URL}/guild-loot-data/applications/${applicationId}.json`;
  let accessToken, application, roles;
  try {
    accessToken = await createGoogleAccessToken(env);
    const headers = { Authorization: `Bearer ${accessToken}` };
    const [appRes, rolesRes] = await Promise.all([
      fetch(applicationUrl, { headers }),
      fetch(`${FIREBASE_DATABASE_URL}/guild-loot-data/discordRoles.json`, { headers })
    ]);
    if (!appRes.ok) throw new Error(`applications HTTP ${appRes.status}`);
    if (!rolesRes.ok) throw new Error(`discordRoles HTTP ${rolesRes.status}`);
    application = await appRes.json();
    roles = (await rolesRes.json()) || {};
  } catch (e) {
    return json({ error: 'Could not verify application: ' + e.message }, 502, cors);
  }
  if (!application || typeof application.createdAt !== 'number') {
    return json({ error: 'Application not found' }, 404, cors);
  }

  const now = Date.now();
  if (kind === 'new') {
    const TEN_MINUTES_MS = 10 * 60 * 1000;
    if (now - application.createdAt > TEN_MINUTES_MS) {
      return json({ error: 'Application not recent enough' }, 409, cors);
    }
    if (application.notifiedAt) {
      return json({ error: 'Already notified' }, 409, cors);
    }
  } else {
    if (application.status === 'accepted' || application.status === 'rejected') {
      return json({ error: 'Application is already closed' }, 409, cors);
    }
    const cooldownStart = Math.max(application.createdAt, Number(application.reminderSentAt) || 0);
    if (now - cooldownStart < APPLICATION_REMINDER_COOLDOWN_DAYS * 24 * 60 * 60 * 1000) {
      return json({ error: 'Reminder cooldown has not passed yet' }, 429, cors);
    }
  }

  const recipientIds = Object.keys(roles)
    .filter(id => /^[0-9]{5,25}$/.test(id) && id !== application.applicantId)
    .filter(id => {
      const r = roles[id];
      return r && r.notifyOnApplications === true && (r.role === 'admin' || r.role === 'officer');
    })
    .slice(0, 25);

  // Stamp before sending, so a second request racing this one (or a retry)
  // can't trigger another round of DMs for the same event.
  const stamp = kind === 'new' ? { notifiedAt: now } : { reminderSentAt: now, lastReminderAt: now };
  try {
    const res = await fetch(applicationUrl, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(stamp)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    return json({ error: 'Could not record notification: ' + e.message }, 502, cors);
  }

  if (!recipientIds.length) {
    return json({ results: [], reason: 'no_recipients' }, 200, cors);
  }

  const siteUrl = env.SITE_URL || SITE_URL;
  const message = buildApplicationNotifyMessage(kind, applicationId, application, siteUrl);
  const results = [];
  for (const discordId of recipientIds) {
    try {
      const memberRes = await fetch(`https://discord.com/api/guilds/${GUILD_ID}/members/${discordId}`, {
        headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }
      });
      if (!memberRes.ok) { results.push({ discordId, ok: false, error: 'not a guild member' }); continue; }

      const dmChannelRes = await fetch('https://discord.com/api/users/@me/channels', {
        method: 'POST',
        headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_id: discordId })
      });
      if (!dmChannelRes.ok) { results.push({ discordId, ok: false, error: 'could not open DM channel' }); continue; }
      const dmChannel = await dmChannelRes.json();

      const sendRes = await fetch(`https://discord.com/api/channels/${dmChannel.id}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: message, allowed_mentions: { parse: [] } })
      });
      results.push({ discordId, ok: sendRes.ok });
    } catch (e) {
      results.push({ discordId, ok: false, error: e.message });
    }
  }

  return json({ results }, 200, cors);
}

// Origins (scheme + host, no trailing slash) whose pages may call this
// Worker from the browser: the live GitHub Pages site and the fixed
// Cloudflare Pages preview. Override with the ALLOWED_ORIGINS env var — a
// comma-separated list — e.g. once the site moves to its own domain
// (ALLOWED_ORIGIN, singular, from older setups is still honored too).
// Requests from any other site's page get no CORS headers (the browser
// blocks them) and a 403. Requests without an Origin header (curl, other
// servers) aren't affected by this — CORS is a browser mechanism; the
// per-IP rate limits below are what bound those.
const DEFAULT_ALLOWED_ORIGINS = [
  'https://nastyschmo.github.io',
  'https://preview.aeternumguildlootawarder.pages.dev'
];

function allowedOrigins(env) {
  const raw = env.ALLOWED_ORIGINS || env.ALLOWED_ORIGIN || '';
  const list = raw.split(',').map(o => o.trim().replace(/\/+$/, '')).filter(Boolean);
  return list.length ? list : DEFAULT_ALLOWED_ORIGINS;
}

// null = no Origin header (not a browser page); true/false otherwise.
function isOriginAllowed(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  const list = allowedOrigins(env);
  return list.includes('*') || list.includes(origin);
}

// Best-effort per-IP rate limits, counted in this Worker isolate's memory
// (fixed one-minute windows). Cloudflare runs several isolates in parallel
// and recycles them, so this is not a hard global guarantee — it stops a
// single client from hammering an endpoint (and with it our Discord,
// Battle.net, WarcraftLogs and Google quotas) in a tight loop, which is
// the realistic abuse case for a guild page. A hard limit would need
// Cloudflare's Rate Limiting binding (wrangler config) or KV/Durable
// Objects. Limits are requests per minute per client IP.
const RATE_LIMITS = {
  'mint-token': 10,
  'notify-application': 5,
  'armory-character': 30,
  'warcraftlogs-character': 30,
  'wowhead-news': 60
};
const RATE_WINDOW_MS = 60 * 1000;
const rateBuckets = new Map(); // `${route}|${ip}` -> { windowStart, count }

function rateLimited(route, request) {
  const limit = RATE_LIMITS[route];
  if (!limit) return false;
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const now = Date.now();
  const key = route + '|' + ip;
  let bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.windowStart >= RATE_WINDOW_MS) {
    bucket = { windowStart: now, count: 0 };
    rateBuckets.set(key, bucket);
  }
  bucket.count += 1;
  // Keep the map from growing without bound in a long-lived isolate.
  if (rateBuckets.size > 5000) {
    for (const [k, b] of rateBuckets) if (now - b.windowStart >= RATE_WINDOW_MS) rateBuckets.delete(k);
  }
  return bucket.count > limit;
}

function corsHeaders(request, env) {
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    'Vary': 'Origin'
  };
  if (isOriginAllowed(request, env)) headers['Access-Control-Allow-Origin'] = request.headers.get('Origin');
  return headers;
}

// ---------------------------------------------------------------------
// GET /wowhead-news — latest WoW: Forever article from Wowhead's public
// RSS feed, reduced to just what the guild page's news card needs.
// ---------------------------------------------------------------------

async function handleWowheadNews(request, cors, ctx) {
  const cache = caches.default;
  // A fixed cache key (not the incoming request, which may carry query
  // params/headers that would otherwise fragment the cache) — everyone
  // who asks gets the same cached answer for the TTL below.
  const cacheKey = new Request('https://wowhead-news.internal/latest', { method: 'GET' });

  const cached = await cache.match(cacheKey);
  if (cached) return withCors(cached, cors);

  let feedText;
  try {
    const feedRes = await fetch(WOWHEAD_FEED_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GuildPageNewsBot/1.0)' }
    });
    if (!feedRes.ok) return json({ error: 'Wowhead feed request failed' }, 502, cors);
    feedText = await feedRes.text();
  } catch (e) {
    return json({ error: 'Could not reach Wowhead' }, 502, cors);
  }

  const result = getWowheadNewsAndPatchNotes(feedText);
  if (!result.latest) return json({ error: 'No news item found' }, 502, cors);

  const response = new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${WOWHEAD_NEWS_CACHE_SECONDS}` }
  });
  if (ctx && ctx.waitUntil) ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return withCors(response, cors);
}

// Re-attaches this Worker's CORS headers to a Response pulled straight out
// of the Cache API (whose own headers don't include them).
function withCors(response, cors) {
  const headers = new Headers(response.headers);
  Object.entries(cors).forEach(([k, v]) => headers.set(k, v));
  return new Response(response.body, { status: response.status, headers });
}

// ---- Wowhead RSS parsing -------------------------------------------
// No XML/DOM parser is available in the Workers runtime, so this reads
// the (stable, well-formed) feed with regexes instead of pulling in a
// dependency. RSS feeds list items newest-first, so "the first <item>"
// is always simply the latest article.

function decodeEntities(str) {
  if (!str) return '';
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&amp;/g, '&'); // must run last, after the other named/numeric entities
}

function stripTags(str) {
  return (str || '').replace(/<[^>]*>/g, '');
}

// Wowhead's teaser <description> ends with an HTML "Continue reading »"
// link (escaped inside the text). Only the intro sentence(s) before that
// are wanted, as plain text.
function extractBlurb(descriptionHtml) {
  const decoded = decodeEntities(descriptionHtml || '');
  const cut = decoded.split(/<br\s*\/?>|<em>/i)[0];
  return stripTags(cut).replace(/\s+/g, ' ').trim();
}

function extractTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m ? m[1].trim() : '';
}

function extractImage(block) {
  const m = block.match(/<media:content\b[^>]*\burl="([^"]+)"/i)
    || block.match(/<enclosure\b[^>]*\burl="([^"]+)"[^>]*\btype="image\/[^"]*"/i);
  return m ? m[1] : null;
}

// Parses one <item>...</item> inner block into
// { title, url, image, pubDate, blurb }, or null if it's missing the bare
// minimum (title/link) to be usable.
function parseItemBlock(block) {
  const title = decodeEntities(extractTag(block, 'title'));
  const url = decodeEntities(extractTag(block, 'link'));
  const pubDate = extractTag(block, 'pubDate');
  const description = extractTag(block, 'description');
  if (!title || !url) return null;
  return {
    title,
    url,
    image: extractImage(block),
    pubDate: pubDate || null,
    blurb: extractBlurb(description)
  };
}

// Every <item> in the feed, in feed order (Wowhead lists newest-first).
function parseWowheadFeedItems(xmlText) {
  const items = [];
  const re = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(xmlText || '')) !== null) {
    const parsed = parseItemBlock(m[1]);
    if (parsed) items.push(parsed);
  }
  return items;
}

// Wowhead's own titling convention for these ("WoW: Forever Patch 1.0
// Patch Notes", "Hotfixes: September 20") — good enough to reliably spot
// Blizzard's official patch-notes/hotfix write-ups among general news
// posts. There's no separate feed for these — Blizzard's own news site
// renders its article list client-side with no public RSS/API a Worker
// can read, so this reuses the same Wowhead feed the general news card
// already relies on, since Wowhead reliably publishes its own article
// (with its own thumbnail) whenever Blizzard ships official patch notes.
const PATCH_NOTES_TITLE_PATTERN = /patch\s*notes|hotfixes?/i;
const WOWHEAD_RECENT_COUNT = 8;

function isPatchNotesItem(item) {
  return !!item && PATCH_NOTES_TITLE_PATTERN.test(item.title);
}

// Returns the newest post overall (for the general news card), the last
// WOWHEAD_RECENT_COUNT posts (the card's "Weitere Artikel" dropdown) AND
// the newest post that looks like an official patch-notes/hotfix write-up
// (for the patch-notes card), searched across the whole feed rather than
// just the first item, since a patch-notes post may not always be the
// very latest thing Wowhead published. Either can be null.
function getWowheadNewsAndPatchNotes(xmlText) {
  const items = parseWowheadFeedItems(xmlText);
  return {
    latest: items[0] || null,
    recent: items.slice(0, WOWHEAD_RECENT_COUNT),
    patchNotes: items.find(isPatchNotesItem) || null
  };
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers });
}

// Builds a Firebase custom auth token by hand (RFC 7519 JWT, RS256-signed
// with your service account's private key), following Firebase's documented
// format for minting tokens outside the Admin SDK — needed here because
// Cloudflare Workers can't run the Node-only firebase-admin package.
async function createFirebaseCustomToken(discordUserId, siteRole, env) {
  const raw = env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON secret is not set');
  const serviceAccount = JSON.parse(raw);

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
    iat: now,
    exp: now + 3600,
    // This becomes the Firebase Auth uid — we use the Discord user id
    // directly so it lines up with the app's discordRoles/foreverSurvey
    // lookups.
    uid: discordUserId,
    // Embedded as a signed, tamper-proof claim (auth.token.role in
    // Firebase rules) — this is what lets the guild page's own
    // discordRoles write rule trust that this role really did come from
    // this Worker's Discord check, not from someone editing their own
    // browser's JavaScript.
    claims: { role: siteRole }
  };

  const encHeader = base64url(JSON.stringify(header));
  const encPayload = base64url(JSON.stringify(payload));
  const unsigned = `${encHeader}.${encPayload}`;

  const key = await importPrivateKey(serviceAccount.private_key);
  const signature = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    new TextEncoder().encode(unsigned)
  );

  return `${unsigned}.${base64url(arrayBufferToBinaryString(signature))}`;
}

function base64url(input) {
  return btoa(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function arrayBufferToBinaryString(buf) {
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return binary;
}

async function importPrivateKey(pem) {
  const pemContents = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8',
    binaryDer.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}
