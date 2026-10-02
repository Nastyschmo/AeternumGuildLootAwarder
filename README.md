# Rude Guild Page — Standalone Setup

This is a public guild homepage with a WoW Forever class survey:
`guild-loot-ledger.html` plus a small `assets/` folder (logo, background
image, news thumbnails). It stores its data in a free **Firebase Realtime
Database**, so it works when hosted anywhere — GitHub Pages, Netlify, your
own server, wherever.

**Keep `assets/` in the same folder as the HTML file** — the page loads
those images as regular relative files (`assets/logo.png` etc.), not
embedded inside the HTML. This is deliberate: earlier versions embedded
images directly in the HTML as base64 data, which made the single file
noticeably larger and occasionally triggered antivirus/browser
"safe browsing" false positives on download (large files packed with dense
base64 text can look like obfuscated binary content to automated
scanners). Splitting the images into real files avoids that.

The homepage itself (hero, intro, news) is public — anyone can see it. Only
the survey (voting, and seeing the guild-wide totals) requires logging in
with Discord.

You only need to do this setup **once**. After that, just share the hosted
URL and everyone can vote.

## 1. Create a free Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com/)
   and sign in with any Google account.
2. Click **Add project**, give it any name (e.g. `my-guild-page`), and finish
   the wizard (you can decline Google Analytics — not needed).

## 2. Turn on the Realtime Database

1. In the left sidebar, go to **Build → Realtime Database**.
2. Click **Create Database**.
3. Pick any region.
4. Choose **Start in test mode** for now (we'll lock it down in step 6).

## 3. Get your web app config

1. Click the gear icon next to "Project Overview" → **Project settings**.
2. Scroll to **Your apps** → click the **`</>`** (Web) icon.
3. Give the app any nickname → **Register app**.
4. You'll see a code block that looks like this:

   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "my-guild-page.firebaseapp.com",
     databaseURL: "https://my-guild-page-default-rtdb.firebaseio.com",
     projectId: "my-guild-page",
     storageBucket: "my-guild-page.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abcdef123456"
   };
   ```

   Keep this tab open — you'll need these values next.

## 4. Paste the config into the HTML file

1. Open `guild-loot-ledger.html` in any text editor.
2. Find this block near the top of the `<script>` section:

   ```js
   const FIREBASE_CONFIG = {
     apiKey: "YOUR_API_KEY",
     authDomain: "YOUR_PROJECT.firebaseapp.com",
     databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
     projectId: "YOUR_PROJECT",
     storageBucket: "YOUR_PROJECT.appspot.com",
     messagingSenderId: "YOUR_SENDER_ID",
     appId: "YOUR_APP_ID"
   };
   ```

3. Replace every placeholder value with the matching value from your own
   `firebaseConfig` (step 3). Save the file.

   This value is **not a secret** — it's normal for it to be visible in your
   public HTML/JS. Firebase access is controlled by the *Database Rules*
   you set in step 6, not by hiding this object.

## 5. Set up Discord login

Voting, announcements and applying all require logging in with Discord.
There are four roles, from most to least access:

- **Admin** — full access, plus can promote/demote anyone else.
- **Officer** — same as Admin except can't change anyone's role.
- **Guild Member** — can see and take part in Ankündigungen (announcements)
  and Abstimmungen (voting/polls).
- **Community** — the default for everyone else: anyone from outside the
  guild who logs in with Discord (e.g. to submit an application) lands
  here. A Community login can see Home, Talent Builder and the Bewerbung
  page, but **not** Ankündigungen or Abstimmungen — those stay
  guild-internal.

The very first person who ever logs in automatically becomes Admin
(bootstrap). Every login after that starts as Community — an Admin or
Officer promotes someone to Guild Member (or further, to Officer/Admin)
from the "Manage access" panel (in the account menu, top right) once
they've actually joined the guild.

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
   and click **New Application**. Name it anything (e.g. your guild's name).
2. Open the **OAuth2** tab. Under **Client information**, toggle
   **Public Client** ON, then **Save Changes**. This is what lets the login
   work with no server-side secret for the Discord half of things.
3. Still on OAuth2, under **Redirects**, click **Add Redirect** and enter
   this page's exact URL once you know it (e.g.
   `https://your-username.github.io/your-repo/`). If you load the page
   before finishing this step, it'll show you the exact string it expects
   here — just copy that in.
4. Copy the **Client ID** shown near the top of the OAuth2 page.
5. Open `guild-loot-ledger.html`, find the `DISCORD_CONFIG` block near the
   top of the `<script>` section, and paste your Client ID in, replacing
   the placeholder.

This Client ID isn't sensitive the way a client secret would be — Discord's
"Public Client" mode is specifically designed to work safely from a plain
web page like this one.

## 6. Lock down your database rules — the real way

The survey requires logging in with Discord before voting. But on its own,
that only gates the app's *UI* — anyone who finds your `databaseURL` could
still read or write the raw database directly, bypassing the login entirely.
Test mode's default rules (`.read: true, .write: true`) leave exactly that
door open.

Closing it for real means Firebase itself has to refuse anyone who isn't
authenticated — and that requires a genuine Firebase login tied to each
person's Discord identity. Since minting that login needs a private key that
must never reach the browser, this needs one small piece of server-side
code: a free Cloudflare Worker. It's the file `discord-auth-worker.js`
included alongside this README.

### 6a. Generate a Firebase service account key

1. In the Firebase console, go to **Project settings** (gear icon) →
   **Service accounts**.
2. Click **Generate new private key**. This downloads a JSON file — keep it
   somewhere safe. **Never** put this file's contents in the HTML page or
   commit it to your GitHub repo; it's a real secret.
3. Also go to **Build → Authentication** and click **Get started** once,
   just to turn the Authentication product on for your project. You don't
   need to enable any specific sign-in method (Google, email, etc.) — the
   custom-token login the Worker issues doesn't need one.

### 6b. Deploy the Cloudflare Worker

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com/) and create a
   free account if you don't have one.
2. **Workers & Pages → Create → Create Worker.** Give it any name (e.g.
   `rude-guild-auth`) → Deploy (the default "Hello World" code is fine for
   now, you'll replace it next).
3. Click **Edit code**. Delete everything and paste in the full contents of
   `discord-auth-worker.js`. Click **Deploy**.
4. Go to the Worker's **Settings → Variables and Secrets**. Add a secret
   named `FIREBASE_SERVICE_ACCOUNT_JSON`, and paste in the *entire contents*
   of the service account JSON file from step 6a (as one block of text).
   Save — this is stored encrypted and is never visible again, including to
   you.
5. Copy the Worker's URL from the top of its page — it looks like
   `https://rude-guild-auth.your-subdomain.workers.dev`.

### 6c. Point the app at your Worker

Open `guild-loot-ledger.html`, find `WORKER_URL` near the top of the
`<script>` section, and set it to your Worker's URL plus `/mint-token`, e.g.:

```js
const WORKER_URL = 'https://rude-guild-auth.your-subdomain.workers.dev/mint-token';
```

That's it — the Wowhead news card below reuses this same Worker URL
automatically, no separate setup needed.

### 6d. Wowhead "WoW: Forever" news card (automatic)

The News section on the homepage always shows one card for the *latest*
post from Wowhead's official "WoW: Forever" feed, linking straight out to
the real article on Wowhead. It's not a card you edit — it updates itself:
whenever Wowhead publishes something new, that single card's content is
simply replaced (title, image, blurb, link), so it never piles up multiple
Wowhead cards over time.

Right alongside it, a second, separate card does the same thing for
**official Blizzard patch notes / hotfixes**. Blizzard's own news site
(news.blizzard.com) loads its article list with JavaScript after the page
loads, so there's no plain feed or API a Worker can read from Blizzard
directly — instead, this reuses the same Wowhead feed, since Wowhead
reliably publishes its own article (complete with its own thumbnail image)
every time Blizzard ships official patch notes or hotfixes. The Worker
picks out the newest one of those specifically, separately from the
general "latest post" card, so a patch-notes release always gets its own
clearly-labeled card ("Blizzard Patch Notes · via Wowhead") even if it
isn't the very newest thing Wowhead happened to publish. If the same
article is both the newest Wowhead post *and* the newest patch notes, only
one card shows (no duplicate). Clicking either card's image/thumbnail
comes from Wowhead's own article — that's the "WoWhead thumbnail pic"
you'll see, not a screenshot pulled from Blizzard's site directly; if an
article has no image, the usual "Bild folgt" placeholder shows instead.
When there's currently no patch-notes article in the feed (the normal
case between patches), that card simply doesn't render — nothing broken,
it just reappears next time Blizzard/Wowhead publish one.

This works through a second endpoint (`GET /wowhead-news`) on the *same*
Cloudflare Worker from step 6b — browsers can't fetch Wowhead's feed
directly (Wowhead doesn't allow that from other sites' JavaScript), so the
Worker fetches it server-side once and hands the guild page back both
items in one response (`{ latest, patchNotes }`). It's cached for 20
minutes so the page stays fast and Wowhead isn't hit on every visit. No
extra secret or config is required for this part.

**If you already deployed the Worker before this feature existed**, you
need to redeploy it once: open your Worker in the Cloudflare dashboard →
**Edit code** → replace its contents with the current `discord-auth-worker.js`
→ **Deploy**. Everything else (your `FIREBASE_SERVICE_ACCOUNT_JSON` secret,
your Worker's URL) stays exactly the same. Until you redeploy, the guild
page keeps working fine — it just won't show these cards yet.

### 6e. "Meine Charaktere" — connect live character data from the Armory (optional)

Members can give themselves a nickname and add their character names under
**"User Settings"** (from their account menu, top right) even without this
step — but with it, each character's class, level and item level are
pulled live from Blizzard's own Game Data API instead of just being a plain
name. This is what shows up under "Manage access" and on applications,
since that's what officers actually care about.

It also fetches a Wowhead-gear-check-style equipment grid for "Meine
Charaktere" — every equipped item's icon, name (colored by quality) and
enchant text, laid out like the in-game paper-doll. This is **not** a full
3D character render: Blizzard's Classic Game Data API doesn't expose one
(only a tiny avatar at best, nothing like Retail's Armory renders), so the
icon grid is the closest equivalent actually available here. No extra setup
beyond the steps below — it uses the same Battle.net app and reuses every
already-cached item icon across all characters/members.

This targets **TBC Anniversary realms specifically** (where the guild's
active characters are) — not Classic Era/Anniversary, whose character API
has been broken on Blizzard's side since September 2024.

1. Go to **[develop.battle.net/access/clients](https://develop.battle.net/access/clients)**,
   log in with your Battle.net account, and click **Create Client**.
2. Give it any name (e.g. "Aeternum Guild Page"), Redirect URIs can be left
   empty — this only uses the app-only client-credentials flow, not a
   per-user login. Intended use: internal/personal tool is fine.
3. Once created, copy its **Client ID** and **Client Secret**.
4. In your Cloudflare Worker → **Settings → Variables and Secrets**, add
   two secrets: `BNET_CLIENT_ID` and `BNET_CLIENT_SECRET`, pasted from step 3.
   (If you already have `BATTLENET_CLIENT_ID`/`BATTLENET_CLIENT_SECRET` set
   from an earlier setup, those work too — the Worker checks both names, so
   you don't need to rename anything, just make sure whichever pair is set
   belongs to *this* Battle.net Client, not an old/different one.) Optionally
   add `BNET_REGION` (e.g. `eu`) if your realms aren't on the EU region —
   defaults to `eu` if not set. **Deploy** again if the dashboard doesn't
   auto-redeploy.
5. Redeploy the Worker itself with the current `discord-auth-worker.js` if
   you haven't already (see the note above) — it needs the `/armory-character`
   endpoint added by this feature.

That's it — no further config on the guild page itself is needed. If a
character's data doesn't show up, open the browser console after clicking
"Aktualisieren" next to that character: the page logs the exact reason
(missing/mismatched secrets, wrong realm slug, Blizzard API error) the same way the
Discord role sync does, rather than failing silently.

### 6f. Update your Firebase rules to actually require login — and enforce roles

Go to **Build → Realtime Database → Rules** and replace them with:

```json
{
  "rules": {
    "guild-loot-data": {
      "discordRoles": {
        ".read": "auth != null",
        "$uid": {
          ".write": "auth != null && (root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'admin' || auth.uid === $uid)",
          ".validate": "root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'admin' || newData.child('role').val() == auth.token.role || (!root.child('guild-loot-data/discordRoles').exists() && newData.child('role').val() == 'admin')"
        }
      },
      "recruitingNeeds": {
        ".read": true,
        ".write": "auth != null && (root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'admin' || root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'officer')"
      },
      "foreverSurvey": {
        ".read": "auth != null",
        "$uid": {
          ".write": "auth != null && auth.uid === $uid && root.child('guild-loot-data/votingStatus/forever/closed').val() != true"
        }
      },
      "characterProfiles": {
        ".read": "auth != null",
        "$uid": {
          ".write": "auth != null && auth.uid === $uid"
        }
      },
      "seenState": {
        ".read": "auth != null",
        "$uid": {
          ".write": "auth != null && auth.uid === $uid"
        }
      },
      "votingStatus": {
        ".read": "auth != null",
        "$votingId": {
          ".write": "auth != null && (root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'admin' || root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'officer')"
        }
      },
      "announcements": {
        ".read": "auth != null",
        "$announceId": {
          ".write": "auth != null && (root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'admin' || root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'officer')"
        }
      },
      "polls": {
        ".read": "auth != null",
        "$pollId": {
          ".write": "auth != null && (root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'admin' || root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'officer')",
          "votes": {
            "$uid": {
              ".write": "auth != null && auth.uid === $uid && root.child('guild-loot-data/polls').child($pollId).child('closed').val() != true && (root.child('guild-loot-data/polls').child($pollId).child('expiresAt').val() == 0 || now <= root.child('guild-loot-data/polls').child($pollId).child('expiresAt').val())"
            }
          }
        }
      },
      "applications": {
        ".read": "auth != null && ((root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'admin' || root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'officer') || (query.orderByChild == 'applicantId' && query.equalTo == auth.uid))",
        ".indexOn": [
          "applicantId"
        ],
        "$appId": {
          ".write": "auth != null && (!data.exists() || (root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'admin' || root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'officer'))"
        }
      },
      "classDeepDives": {
        ".read": "auth != null",
        "$classId": {
          ".write": "auth != null && (root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'admin' || root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'officer')"
        }
      },
      "classDiveUpdateHistory": {
        ".read": "auth != null",
        "$entryId": {
          ".write": "auth != null && (root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'admin' || root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'officer')"
        }
      },
      "classDiveSources": {
        ".read": "auth != null",
        "$sourceId": {
          ".write": "auth != null && (root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'admin' || root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'officer')"
        }
      }
    }
  }
}
```

Click **Publish**. What this enforces at the database level (not just in the UI):

- **Reads are granted per top-level key, not at the `guild-loot-data`
  root.** Firebase can't take a read back on a child once a parent grants
  it, so a root-level read would make *everything* below it readable to
  every logged-in account. Instead every key the page loads has its own
  `.read: "auth != null"`, and the page keeps one listener per key
  (`SYNCED_KEYS` in the page script). **A new top-level key needs both a
  `SYNCED_KEYS` entry and its own `.read` rule here**, or it won't load.
  `recruitingNeeds` has `.read: true` so the public "Aktuell gesucht"
  overview on Home/Bewerbung works for logged-out visitors.
- **`applications` is readable only by Admins/Officers** — except that
  every logged-in account may read *its own* applications through the
  query `orderByChild('applicantId').equalTo(<own uid>)` (that's what the
  Bewerbung page uses to show an applicant their own status). The
  `.indexOn: ["applicantId"]` entry is required for that query.
- Apart from `applications`, any logged-in account — including a
  Community login — can still technically read the remaining keys
  (announcements, polls, …) directly from Firebase, even though the page's
  UI hides Ankündigungen/Abstimmungen from Community accounts. Everything
  described below as "only Admins/Officers can X" is fully enforced — that's
  about *writing*, which Firebase checks per path.
- Everyone can only ever write their **own** survey entry
  (`foreverSurvey/<their-discord-id>`) — nobody can vote as someone else,
  even by bypassing the app and writing to Firebase directly.
- Everyone can only ever write their **own** nickname/character list
  (`characterProfiles/<their-discord-id>`) via "User Settings" (the
  account popover) — nobody can add characters under someone else's
  account, even by bypassing the app and writing to Firebase directly.
- Everyone can only ever write their **own** "seen" marker
  (`seenState/<their-discord-id>`) — this is just "have I opened
  Ankündigungen since the newest post", used to drive the gold "!" quest
  markers in the sidebar and the quest bell in the topbar; nobody can
  mark it seen (or unseen) for someone else.
- Once an Admin or Officer closes a voting (`votingStatus/<id>/closed` set
  to `true`), nobody — including Admins — can write a new
  `foreverSurvey/<uid>` entry anymore, so a closed voting really is closed,
  not just hidden in the UI. Reopening it (toggling `closed` back to
  `false`) is itself only allowed for Admins/Officers.
- Anyone logging in for the very first time ever (on a brand new setup)
  becomes Admin automatically (matching the app's own bootstrap behavior)
  — but only once, for the first person, so there's always someone able to
  use "Manage access" afterward.
- **Everyone else's role (Officer/Guild Member/Community) is resynced from
  your Discord server's own roles on every login** — see "Syncing roles
  from your Discord server" below. The value written can only ever be
  `auth.token.role`, a claim the Cloudflare Worker embeds directly into
  the login token after checking Discord itself — so nobody can hand
  themselves Officer, Guild Member, or Admin by editing their own
  browser's JavaScript or writing to Firebase directly; the actual check
  always happens server-side, in the Worker.
- **Admin is the one role never touched by that sync** — once granted (by
  the first-ever-login bootstrap above, or later by an existing Admin in
  "Manage access"), only another existing Admin can change it. No account
  can rewrite its own role to escalate itself, even by bypassing "Manage
  access" and writing directly to the database.
- Only Admins/Officers can post or delete announcements, create/close/
  delete a poll, or edit `recruitingNeeds`.
- Any logged-in member can write their own poll vote
  (`polls/<id>/votes/<their-discord-id>`), but only while that poll is
  neither manually closed nor past its own expiry time — enforced with
  Firebase's server-side `now`, so it can't be bypassed by changing your
  system clock.
- **Anyone logged in — including a Community login — can submit a new
  application** (`applications/<id>`), matching the whole point of the
  Bewerbung page being open to the public. Once an application exists,
  only Admins/Officers can edit or delete it — an applicant can't go back
  and rewrite their own submission after sending it, and can't touch
  anyone else's. The "Erinnerung senden" button doesn't write to the
  application at all — the Cloudflare Worker (`/notify-application`)
  checks the 14-day cooldown and stamps `lastReminderAt`/`reminderSentAt`
  itself with its admin credential.
- Only Admins/Officers can write to `classDeepDives/<classId>` (the Deep
  Dive summary and Patch-Updates history per class, plus the `general`
  entry), `classDiveUpdateHistory/<id>` (the Update-Historie table at the
  bottom of that page) and `classDiveSources/<id>` (the Quellen list below
  it) — every logged-in account can read all three.

**If you already set up this page before the Community role, the
recruiting features, or Class Deep Dives existed,** you need to re-paste
the rules above in full (they replace your old rules entirely — the added
bits over time have been the `recruitingNeeds` block, `'member'` →
`'community'` in the `discordRoles` validation, the `applications` block,
the `classDeepDives`, `classDiveUpdateHistory` and `classDiveSources`
blocks, and most recently the switch from one root-level `.read` to a
`.read` per key with a restricted `applications` read).
This does **not** change anyone who's already been assigned a role —
existing Guild Members/Officers/Admins keep their role exactly as-is;
only *new* logins from here on start as Community. Until you re-paste the
rules, the "Close voting" button, posting an announcement, creating or
voting on a poll, submitting or managing a Bewerbung, sending an
application reminder, and editing a Class Deep Dive (including its
Update-Historie and Quellen cards) will all show a "Could not save —
check your Firebase rules and connection" error instead of actually
working, and the public "Aktuell gesucht" overview will just stay empty
for logged-out visitors.

**If the page stays empty or shows "Could not sync" after logging in**,
the rules pasted in are most likely missing the `.read` entry of one of
the keys (or are an older version with the root-level `.read`, combined
with an older page). Re-paste the exact block above — it takes effect
immediately, no need to log out/in again.

### 6g. "Meine Charaktere" — current-phase WarcraftLogs rankings (optional)

Adds a WarcraftLogs card to each character on "Meine Charaktere": per-zone
boss-kill counts, best all-star points/rank, and an overall Best Perf. Avg
— pulled live from [WarcraftLogs](https://www.warcraftlogs.com)' own API.
Completely separate from Discord/Battle.net/Firebase, with its own free API
client.

**1. Create a WarcraftLogs API client**

1. Go to **[client.warcraftlogs.com/api/clients/](https://www.warcraftlogs.com/api/clients/)**,
   log in with your WarcraftLogs account, and click **Create Client**.
2. Give it any name (e.g. "rude Guild Page"), Redirect URL can be left
   empty — this only uses the app-only client-credentials flow, not a
   per-user login. Leave "Public Client" unchecked.
3. Once created, copy its **Client ID** and **Client Secret** — the secret
   is only shown once, so copy it now.
4. In your Cloudflare Worker → **Settings → Variables and Secrets**, add
   two secrets: `WCL_CLIENT_ID` and `WCL_CLIENT_SECRET`, pasted from step 3.
   (`WARCRAFTLOGS_CLIENT_ID`/`WARCRAFTLOGS_CLIENT_SECRET` also work, if
   that's what you already have set — the Worker checks both names, so you
   don't need to rename anything, just make sure whichever pair is set
   belongs to *this* WarcraftLogs client.) Also add `WCL_HOST` set to
   **`fresh.warcraftlogs.com`** — TBC Anniversary/Fresh realms (like this
   guild's) live on WarcraftLogs' separate Fresh instance, not the main
   `www.warcraftlogs.com` (defaults to that main site if `WCL_HOST` isn't
   set, which won't find these characters). Don't include `https://`, a
   language prefix like `de.` (that's just your browser's own redirect,
   not part of the real host), or a trailing slash.

**2. Fill in your current tier's zone ids**

WarcraftLogs has no reliable "what's the current phase" concept of its own
to query automatically, so the zones shown are a fixed, hand-picked list
you maintain yourself (same idea as `GUILD_ID` above) — update it whenever
a new phase/tier unlocks.

1. Open a character's own page on WarcraftLogs who definitely has logs in
   the raid you want a card for, go to its **"Rankings"** tab, and pick
   that raid from the zone dropdown there. Two cases:
   - **Most raids:** the URL gets a `?zone=` (or `#zone=`) query param —
     that number is the zone id, e.g. `...layonhanns?zone=**1056**` → `1056`.
   - **The current/most-relevant tier** (whatever WarcraftLogs itself
     already treats as this character's "main" zone): picking it usually
     leaves the URL **without** a `zone=` param at all — WarcraftLogs
     already defaults to it, so there's no fixed number to copy. Use the
     special value `'current'` for that one instead of a number (see
     below) — this asks WarcraftLogs to resolve it the same way its own
     site does, rather than guessing a number that might not exist.
2. Open `discord-auth-worker.js`, find `WARCRAFTLOGS_ZONES` (near
   `getWarcraftLogsToken`), and fill in each zone's real id — either the
   number from step 1, or `'current'` for the one that had none. An entry
   left at `id: 0` is skipped, not an error, so you can configure just one
   zone to start with:
   ```js
   const WARCRAFTLOGS_ZONES = [
     { id: 'current', label: 'BT / Hyjal' },
     { id: 1056, label: 'SSC / TK' },
     { id: 1048, label: 'Gruul / Magtheridon' }
   ];
   ```
   List them newest/hardest-first — the "Best Perf. Avg" tile shows the
   first zone in this list the member actually has logs in, so the zone
   they're most likely progressing in should come first. Since
   WarcraftLogs' notion of "current" moves forward on its own as new tiers
   release, keeping `'current'` on whichever zone is meant to always be the
   newest means that entry never needs revisiting — only the zones below it
   (once they stop being "current" and get their own fixed numeric id) need
   updating.
3. Paste the updated file into your Worker (**Edit code** → replace
   contents → **Deploy**).

That's it — no Firebase rules changes needed. If a character's WarcraftLogs
card doesn't show up at all, that's expected until both steps above are
done (the card just stays hidden, nothing else breaks). If it shows an
error instead, open the browser console after clicking "Erneut versuchen"
under that card — same debug-reason pattern as the Armory/Discord-role
checks above (`no_warcraftlogs_credentials`, `no_zones_configured`, etc.).

**"Keine Logs auf WarcraftLogs gefunden für diesen Namen/Realm"** (debug
reason `character_not_found`) shows its own calmer state with a **"Selbst
prüfen ↗"** link straight to that character's WarcraftLogs page — clicking
it settles which of the two usual causes it is:
- The page genuinely has no logs (empty/"character not found" on
  WarcraftLogs itself) → that member just hasn't uploaded a log with this
  character yet, nothing to fix on the guild page's side.
- The page *does* exist and has logs → the realm slug WarcraftLogs uses for
  this realm doesn't match Blizzard's own slug that this Worker reuses
  (`spineshatter`, in `characterProfiles`). Compare the realm segment in
  the URL that opens against what your members have saved under "User
  Settings", and adjust their saved realm slug to match if needed.

**A note on reliability:** unlike Discord/Battle.net/Firebase above,
WarcraftLogs' API returns its rankings data as a loosely-typed JSON blob
rather than a strict schema, so the exact field names this Worker reads
(`bestPerformanceAverage`, `allStars[0].points`/`.rank`,
`rankings[].totalKills`) follow WarcraftLogs' long-standing, widely-used
response shape but weren't able to be verified against a real, live
response while building this (no test WarcraftLogs account was available).
If the numbers ever look clearly wrong once real data comes through (e.g.
kills/points/rank all show as "—" even for a character with logs), that
mismatch is the first thing to check — `handleWarcraftLogsCharacter` in
`discord-auth-worker.js` has the parsing, with comments at each field.

## Syncing roles from your Discord server

Officer and Guild Member don't have to be assigned by hand — the site can
check someone's actual Discord server roles the moment they log in, and
assign the matching site role automatically. Admin is the one exception:
it's never auto-assigned (see above), only ever granted by hand.

### How it works

Every time someone logs in, the Cloudflare Worker (after verifying their
Discord login, same as before) additionally looks up their current roles
in your Discord server using a bot token, matches them against the mapping
you configure below, and embeds the result as a signed claim in the login
token — the site then writes that into `discordRoles` for display, but
Firebase itself independently checks that the value being written matches
what the Worker actually signed, so it can't be spoofed from the browser.
This resync happens on every fresh login (clicking "Mit Discord anmelden"
and completing it) — a returning visit that just resumes an already
logged-in session keeps whatever was last synced, rather than guessing.

If someone isn't a member of your Discord server at all, or holds none of
the mapped roles, they get **Community** — same as anyone who's never
touched Discord roles at all.

### 1. Create a bot for your existing Discord app

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
   and open the same Application you already created for login (the one
   `DISCORD_CONFIG.clientId` came from) — no need for a new one.
2. Left sidebar → **Bot**. If there's no bot yet, click **Add Bot** (or
   **Reset Token**, depending on the portal's current wording) and confirm.
3. Still on the Bot page, click **Reset Token** to reveal it, and copy it
   immediately — Discord only shows it once. (If you miss it, just reset
   it again.)

### 2. Invite the bot into your server

1. Left sidebar → **OAuth2 → URL Generator**.
2. Under **Scopes**, check **bot**. You don't need to select any
   Permissions — the bot only needs to be a member of the server, nothing
   more.
3. Copy the generated URL at the bottom, open it in a new tab, pick your
   server, and click **Authorize**. The bot will show up in your member
   list (offline is normal — it never needs to actually run/connect).

### 3. Add the bot token to the Worker

Open your Worker in the Cloudflare dashboard → **Settings → Variables and
Secrets** → add a new secret named `DISCORD_BOT_TOKEN` with the token from
step 1. This sits alongside the `FIREBASE_SERVICE_ACCOUNT_JSON` secret you
already added in step 6a — same place, same process.

### 4. Get your server ID and role IDs

1. In Discord itself (not the Developer Portal): **User Settings → Advanced**
   → turn on **Developer Mode**. This unlocks a "Copy ID" option on
   right-click menus for servers, roles, and users.
2. Right-click your server's icon → **Copy Server ID** — this is your
   `GUILD_ID`.
3. **Server Settings → Roles** → right-click (or use the "…" menu on) each
   role you want to map → **Copy Role ID**.

### 5. Configure the mapping and redeploy

Open `discord-auth-worker.js`, find `GUILD_ID` and
`DISCORD_ROLE_TO_SITE_ROLE` near the top, and fill in your own IDs:

```js
const GUILD_ID = 'your-server-id';
const DISCORD_ROLE_TO_SITE_ROLE = [
  { discordRoleId: 'role-id-1', siteRole: 'officer' },
  { discordRoleId: 'role-id-2', siteRole: 'member' },
  { discordRoleId: 'role-id-3', siteRole: 'community' }
];
```

The list is checked top to bottom — if someone holds more than one of
these Discord roles, the first (highest) match wins, so list
higher-privilege roles first. You can add, remove, or reorder entries
freely; just never add `'admin'` here (see above for why). Paste the
updated file into your Worker (**Edit code** → replace contents →
**Deploy**).

### 6. Re-paste the Firebase rules

The `discordRoles` write rule changed to trust the Worker's signed role
claim instead of only allowing `'community'` — re-paste the full rules
block from step 6e above (the `discordRoles` section is the one that
changed: `auth.uid === $uid` no longer requires `!data.exists()`, and the
validate check now compares against `auth.token.role`).

**Until you complete all of the above** (bot token secret + rules
re-pasted), login keeps working exactly as before — new logins just fall
back to Community, same as if Discord sync were never added at all,
nothing breaks in the meantime.

### Troubleshooting: someone logs in and ends up on Community anyway

Everything above fails *open* on purpose — any hiccup falls back to
Community rather than breaking login — which is safe, but means a mistake
in the setup is otherwise silent. To see exactly what happened:

1. Have that person open their browser's DevTools (F12, or
   right-click → Inspect → **Console** tab) *before* logging in.
2. Log in with Discord (a real fresh login — logging out and back in first
   if they're already logged in, since the check only runs on an actual
   login).
3. Right after it completes, look for a line starting with
   `[Discord role sync]`. If it resolved correctly you'll see an `info`
   line ("resolved to … via matched Discord role"); anything else prints a
   `warn` line with a `reason` and a plain-English `detail` explaining it:

   - **`no_bot_token`** — the `DISCORD_BOT_TOKEN` secret isn't set on the
     Worker at all. Redo step 3 above.
   - **`discord_api_error` with `status: 401`** — the bot token is
     invalid (wrong, or reset in the Developer Portal without updating the
     Worker's secret to match). Reset it again (step 1.3) and re-paste it
     into the Worker (step 3).
   - **`discord_api_error` with `status: 403`** — the bot isn't actually a
     member of your server (never invited, or was since kicked/removed).
     Redo step 2.
   - **`discord_api_error` with `status: 404`** — either `GUILD_ID` is
     wrong, or this particular Discord account isn't a member of that
     server. Double-check the server ID (step 4.2).
   - **`no_matching_role`** — the person *was* found in your server, but
     none of their current Discord role IDs match anything in
     `DISCORD_ROLE_TO_SITE_ROLE`. The log line lists their actual role IDs
     under `allRoleIdsOnDiscord` — compare those one-by-one against the
     `discordRoleId` values in the Worker (step 5). This is the most
     common case when someone visibly has the right role in Discord but
     still lands on Community: usually a role ID was mistyped, or the
     wrong role was copied (Discord lets you copy a role's ID from
     multiple places, including similarly-named roles).

This debug info is never shown to the person in the UI and contains
nothing sensitive (just Discord role ids and an HTTP status code) — it
only ever goes to that one browser's own console.

**If the console shows *no* `[Discord role sync]` line at all** after a
fresh login (not even a warning), the failure happened somewhere *before*
the Worker could even answer, and the console now says so explicitly —
look for whichever of these appears instead:

- **"the PKCE state/verifier check failed"** — happens before Discord is
  even contacted; almost always means the login was interrupted or retried
  (back button, double-click, an old tab). Just try logging in again.
- **"Discord's token exchange failed (HTTP …)"** — Discord itself rejected
  the code, usually a `redirect_uri` mismatch between what the site sent
  and what's configured in the Discord Developer Portal for your app.
- **"our Worker (…) rejected the mint request (HTTP …)"** — the Worker
  itself errored out (crashed, missing secret, etc. — the logged HTTP
  status and body are your first clue). Check the Worker's logs in the
  Cloudflare dashboard (or `wrangler tail`).
- **"the deployed Cloudflare Worker is still running an OLDER version…"**
  — the mint request *succeeded*, but the response had no `roleDebug`
  field at all. This means the live Worker hasn't been redeployed with the
  current `discord-auth-worker.js` — redeploy it (step 3) and log in
  again.

If you saw none of these either, the browser's console was probably
cleared or filtered — check that **All levels** (not just "Errors") is
selected in the console's log-level filter, since these are `warn`/`info`
level, not errors.

### 7. Keeping roles in sync automatically (optional)

Everything above only ever re-checks someone's Discord role **when they log
in**. So if a Community member gets promoted to Guild Member on Discord but
doesn't log back into the guild page, they stay stuck on Community on the
site until they do. This step adds a job that periodically re-checks
everyone who's ever logged in and fixes up their stored role by itself — no
one needs to log in again for it to take effect.

It needs no new secrets — it reuses `DISCORD_BOT_TOKEN` and
`FIREBASE_SERVICE_ACCOUNT_JSON`, which you already set up in steps 6a and
6e. It also needs **no Firebase rules changes** — it writes using the
service account's own admin access, which bypasses the database rules
entirely (the same way the Firebase Admin SDK would), rather than logging
in as a member.

#### 7.1. Enable the Server Members Intent

Discord requires this even though the bot already works fine for regular
logins — it's a separate, stricter permission specifically for *listing*
every member of your server at once (rather than looking up one member by
id, which is what a normal login does).

1. [Discord Developer Portal](https://discord.com/developers/applications)
   → your app → **Bot**.
2. Under **Privileged Gateway Intents**, turn on **Server Members Intent**
   and save.

#### 7.2. Set FIREBASE_DATABASE_URL in the Worker

Open `discord-auth-worker.js`, find `FIREBASE_DATABASE_URL` near
`GUILD_ID`, and confirm it matches `databaseURL` in
`guild-loot-ledger.html`'s `FIREBASE_CONFIG` (it's pre-filled with your
current one, so if you haven't changed Firebase projects there's nothing to
do here). Paste the updated file into your Worker (**Edit code** → replace
contents → **Deploy**) if you did change it.

#### 7.3. Add a Cron Trigger

1. In the Cloudflare dashboard, open your Worker → **Settings → Triggers**.
2. Under **Cron Triggers**, click **Add Cron Trigger**.
3. Pick how often it should run — once an hour (`0 * * * *`) is a
   reasonable default; once a day (`0 3 * * *`, 3am) is enough if you'd
   rather it run less often. Save.

That's it — no further deploy needed, the job is already in the Worker code
from this update. It fails open just like everything else here: if the
intent isn't enabled yet, or a secret is momentarily missing, it just skips
itself and tries again next time, without touching anyone's role.

A few things worth knowing about what it does and doesn't do:

- It only touches members who've **already logged in at least once** (i.e.
  already have an entry under `discordRoles` in Firebase) — it never
  invents new members or grants access to someone who's never visited the
  site.
- **Admin is never touched**, even if that person's Discord roles change or
  they leave the server — same as at login, Admin is only ever granted by
  hand.
- Someone who **leaves your Discord server entirely** gets dropped back to
  Community on the site too, not just left on their old role.
- Each run's outcome is written to the Worker's logs (**Logs** tab in the
  dashboard, or `wrangler tail`) as a line starting with `[role sync]` —
  either how many members it updated (and which), that everyone was
  already up to date, or why it skipped itself.

### 8. New-application notifications (optional)

The Bewerbung page's chat-bot application form already shows new
applications to anyone who opens the page as an Officer/Admin (the quest
bell in the top bar picks them up automatically, same as Ankündigungen).
This step adds an *extra* nudge on top of that: a Discord DM, sent by your
own bot, to whichever Officers/Admins opt in.

It needs no new secrets either — it reuses `DISCORD_BOT_TOKEN` and
`FIREBASE_SERVICE_ACCOUNT_JSON` from steps 6a/6e/7 above. If you've already
done step 7 (role sync), there's nothing further to deploy here — the
`/notify-application` endpoint is already in the Worker code from this
update. If you haven't done step 7, you only need `DISCORD_BOT_TOKEN` (not
`FIREBASE_DATABASE_URL`/the Cron Trigger) for this to work.

**Turning it on, per person:** open **Manage access** (top-right account
menu) as an Admin. Every Admin/Officer row now has a **"Bewerbungen
melden"** checkbox beneath their role dropdown — check it for anyone who
should get a DM when a new application comes in. It's per-person and
off by default; nobody gets DMed until they (or an Admin, on their behalf)
checks that box.

A few things worth knowing:

- Only Admin/Officer rows show the checkbox at all — matches who can
  actually see the applications list in the first place.
- The Worker independently re-reads the application from Firebase before
  DMing anyone, and only DMs ids that are still actual members of your
  Discord server — so this can't be used to spam arbitrary Discord users,
  even if someone found the endpoint URL.
- It's best-effort: if the Worker or Discord is briefly unreachable, the
  application is still saved and still shows up via the in-site quest bell
  regardless — the DM is a bonus on top, not a requirement.

## 7. Host it on GitHub Pages (or anywhere else)

1. Create a new **public** repository on GitHub. (Public matters — see the
   troubleshooting note below if Pages options look disabled.)
2. Upload `guild-loot-ledger.html` and rename it to `index.html` — **and
   upload the whole `assets/` folder alongside it**, keeping the folder
   name and structure exactly as-is (`assets/logo.png`, `assets/bg-texture.jpg`,
   `assets/bg-texture-horde.jpg`, etc.). The page won't show its images
   without this folder.
3. Go to the repo's **Settings** tab (top of the repo page, not your account
   settings).
4. In the left sidebar, under **Code and automation** (sometimes labeled
   **Code, planning, and automation**), click **Pages**.
5. On the Pages screen, find the **Build and deployment** heading. Directly
   under it is a **Source** dropdown — choose **Deploy from a branch**.
6. A **Branch** dropdown appears — select **main**, leave the folder as
   **/ (root)**, then click **Save**.
7. Wait about a minute, then refresh the Pages settings page. It'll show
   "Your site is live at `https://<your-github-username>.github.io/<repo-name>/`".

**If "Deploy from a branch" is greyed out or won't respond:** your repo is
probably still **private**. Branch-based Pages deploys need a public repo on
the free plan. Go to **Settings → General**, scroll to the **Danger Zone**,
and change visibility to Public.

Any static host works the same way (Netlify, Cloudflare Pages, Vercel, your
own web server) — just upload `index.html` together with `assets/`.

## 8. Test previews on Cloudflare Pages

GitHub Pages only ever serves `main`, so changes can't be tried out before
they're merged. Cloudflare Pages fills that gap: it builds the same repo and
serves one extra branch, `preview`, under its own fixed URL. The live site
stays on GitHub Pages; nothing about it changes.

**How it's used:** whenever something should be tried out before merging,
Claude force-pushes that feature branch's state onto `preview`. Cloudflare
deploys it within a minute or two at
`https://preview.<project>.pages.dev/`. One fixed branch (instead of a
preview per feature branch) means one fixed URL — which matters because
Discord only accepts exact redirect URLs, no wildcards.

> ⚠️ The preview talks to the **same live Firebase database** as the real
> site. Looking around is harmless, but anything saved there (votes,
> applications, announcements, role changes) is real data.

### 8a. Create the Pages project (once)

1. [dash.cloudflare.com](https://dash.cloudflare.com/) → **Workers & Pages**
   → **Create application**. The "Create an app" screen that opens is for
   Workers — don't use "Continue with GitHub" there. Instead click the
   small link at the bottom, **"Need to use the legacy Pages workflow?
   Continue to Pages"**, then **Connect to Git**. ("Legacy" is
   Cloudflare's wording; Pages is still fully supported and is the simpler
   fit for a plain static site like this one.)
2. Authorize GitHub and pick this repository.
3. Build settings:
   - **Project name:** e.g. `rude-guild` (becomes `rude-guild.pages.dev`)
   - **Production branch:** `main`
   - **Framework preset:** None
   - **Build command:** leave empty
   - **Build output directory:** `/`
4. **Save and Deploy.** The first build deploys `main` to
   `https://<project>.pages.dev/` — that copy is unused for now (the real
   site stays on GitHub Pages) but does no harm.
5. Project → **Settings** → **Builds** (sometimes **Builds & deployments**)
   → **Branch control**: keep automatic production deploys on, and set
   **Preview branch** to **Custom branches** with include pattern
   `preview`. That stops Cloudflare from building every `claude/...`
   feature branch.

### 8b. Let Discord login work on the preview (once)

1. Discord Developer Portal → your app → **OAuth2** → **Redirects** →
   **Add Redirect**: `https://preview.<project>.pages.dev/` (exactly, with
   the trailing slash). Save. The existing GitHub Pages redirect stays.
2. Firebase needs no change — the custom-token login the Worker issues
   doesn't check Firebase's authorized domains.
3. The Worker needs no change as long as `ALLOWED_ORIGIN` is unset (it then
   allows any origin). If `ALLOWED_ORIGIN` is ever set, the Worker has to
   learn to accept more than one origin first, or the preview loses login,
   news and Armory data.

### 8c. Optional: keep the preview private

Preview deployments are already marked `noindex` for search engines, but
anyone with the URL can open them. To lock them down: Pages project →
**Settings** → **General** → **Access policy** → enable it for preview
deployments (Cloudflare Access, free for up to 50 users) and allow your
own e-mail address.

## Editing the homepage content (guild name, intro text, news)

Open `guild-loot-ledger.html`, find the block near the top of the
`<script>` section headed "Easy-to-edit guild content" — it has plain
constants for the guild name, hero tagline/description, intro text, and a
`NEWS_ITEMS` list (title + blurb + optional `image` URL for a thumbnail).
Edit those and save; no other part of the file needs to change. Once you
have real screenshots/artwork, just fill in an `image: 'https://...'` for
a news item and its placeholder tile is replaced automatically.

**Blizzard's company logo for the "Beta-Infos folgen" card** now lives at
`assets/blizzard-logo.jpg` — it's the guild's own uploaded copy of
Blizzard's official logo (not something Claude fetched or recreated
itself; official brand logos are Blizzard's own trademarked artwork, so
that one had to come from you). To swap it for a different version later,
replace that file and/or update `const NEWS_BETA_IMAGE = 'assets/blizzard-logo.jpg';`
near the top of the `<script>` section.

The Wowhead "WoW: Forever" card and the announcement card are separate
from this list and don't need editing — they're generated automatically
(see step 6d and the announcements feature above).

## Talent Builder

A "Talent Builder" page in the sidebar (bottom entry) lets anyone explore
WoW: Forever's class/character data, split into five tabs:

- **Talente** — the talent-point calculator: pick a class, set a level
  (10–60, which sets how many points there are to spend — 51 at level 60),
  click a talent to spend a point, right-click to take one back, hover for
  the tooltip. It enforces the same rules the real game does: a tier needs
  5 points already spent elsewhere in that tree to unlock, and some
  talents need another one maxed first.
- **Zauberbuch** — every trainer-learnable spell/ability for the selected
  class (general abilities plus all spec tabs), grouped the same way the
  in-game spellbook is, with the ranks and hover tooltips (description,
  range/cast time/cooldown, level requirement) pulled from the data set's
  spell descriptions.
- **Rassen** — pick a faction and race to see that race's baseline
  abilities, plus (where the data has it) class-specific racial spell
  variants for the currently selected class.
- **Klassenänderungen** — the class-by-class list of baseline ability
  changes WoW: Forever makes versus Classic (e.g. a shortened cooldown, a
  reworked effect), for the selected class.
- **Legacy-Perks** — the account-wide Legacy perk trees (separate from
  class/level): a fixed 16-point pool across 3 trees, gated by "points
  already spent in this tree" thresholds (shown in each perk's tooltip)
  and, for a few perks, a prerequisite like the talent trees. A couple of
  slots are marked "to be added" upstream and are shown dimmed/disabled.

Nothing here needs your own setup — no Firebase/Discord/Worker involved —
each visitor's talent build and Legacy build are just remembered in their
own browser (`localStorage`), never synced or shared.

All of this data (talent trees, spellbooks, spell tooltips, racials,
class-ability changes, Legacy perks) is a trimmed copy of
[talentsforever.com](https://talentsforever.com/)'s public data export,
used under its **CC BY 4.0** license — the required attribution link is in
the page's own footer, so nothing further to do there. Icons are loaded
live from Wowhead's public icon CDN, not stored in the file.

If talentsforever.com later changes their data (new patch, corrected
numbers), that won't reach this page automatically — you'd need to get an
updated export from them and ask Claude to refresh the embedded
`TALENT_DATA`/`SPELLBOOK_DATA`/`SPELL_DESC_DATA`/`RACIAL_DATA`/
`CLASS_RACIAL_DATA`/`CLASS_ABILITY_DATA`/`LEGACY_DATA` constants in the
file with it.

## Bewerbung (Recruiting)

A "Bewerbung" page in the sidebar lets Discord-logged-in visitors apply to
the guild, and lets Admins/Officers manage recruiting from the same page:

- **Home page teaser** — a short, friendly "Gefällt dir, was du siehst?
  Dann bewirb dich doch gerne bei uns…" section with a button straight to
  the Bewerbung page. If any classes/specs are currently marked as sought
  (see below), it also shows those as small badges.
- **Bewerbung page** — logged-out visitors see a public "Aktuell gesucht"
  overview (which classes/specs are currently sought, or a friendly "every
  application is welcome" message if none are set) plus a Discord login
  gate. Logging in from here (or from anywhere else on the page) creates a
  **Community** account automatically — no need to already be a guild
  member. Once logged in, anyone can submit an application answering:
  - Name & Alter (optional, free text)
  - Klasse(n) + Spezialisierung(en) (required) — one row per class, each
    with its own spec checkboxes (same specs as the Klassen-Umfrage); a
    "+ Weitere Klasse hinzufügen" button adds another row so an applicant
    can list more than one class (e.g. their main and an alt). A class
    already used by another row is disabled in the others' dropdowns, and
    each row gets a ✕ to remove it once there's more than one.
  - WoW-Erfahrung — Versionen, Speedrun-/Parsegilden, etc. (required)
  - Logs, falls vorhanden (optional free text/links)
  - Berufe, die zu TBC geskillt werden sollen (required)
  - Sonstiges, was die Gilde noch wissen sollte (optional)

  Submitting is blocked with an inline message until every required field
  is filled in (at least one class row with a spec selected, WoW
  experience, professions).
- **Managing recruiting needs (Admins/Officers only)** — a "Gesuchte
  Klassen & Spezialisierungen verwalten" panel on the same page lets
  officers check off which class/spec combinations are currently sought.
  Saving updates `recruitingNeeds` in Firebase, which both the Home page
  teaser and the Bewerbung page's public overview read from — so there's
  only one place to update this, not two.
- **Reviewing applications (Admins/Officers only)** — a list of every
  submitted application (newest first), each showing the applicant's
  Discord name, every class/spec combination they applied for (as separate
  colored chips if they listed more than one), name & age (if given), WoW
  experience, logs (if given), professions, any extra remarks, and
  submission date, with a delete button. Applicants themselves can't edit
  or withdraw their own application after sending it (see the Firebase
  rules in step 6e) — if someone needs to change something, an officer can
  just delete it and ask them to resubmit.
- **What an applicant (Community role) can and can't see** — since anyone
  can log in from the Bewerbung page, that login only ever gets the
  Community role, not Guild Member. A Community login sees Home (news,
  the Bewerbung teaser), Talent Builder, and the Bewerbung page itself
  exactly like a guild member would — but Ankündigungen and Abstimmungen
  stay guild-internal: those pages show a short "only for guild members"
  note instead of their actual content. Once someone's application is
  accepted, an Admin/Officer promotes them from Community to Guild Member
  in the "Manage access" panel, and those pages open up for them.

No further setup is needed beyond the Firebase rules in step 6e — this
feature reuses the same Discord login and `discordRoles` (Admin/Officer/
Guild Member) system as the rest of the page.

## Design Reveal (Horde theme) — currently admin-only for testing

There's a second, dark "Horde" theme built into the page (same layout,
retinted — see PROJECT.md for the full story). **Right now it's gated to
the Admin role only**, so you can try it out live before deciding whether
to open it up to the whole guild:

- Log in as Admin and a one-time popup appears: *"Die Fraktion wurde
  gewählt, der Name steht fest. Neues Design jetzt freischalten?"* —
  clicking **Okay** plays a burn-through animation into the new theme.
- Afterward, a **Design** switcher appears at the bottom of **User
  Settings** (still Admin-only) with **Klassisch** / **Horde** buttons, so
  you can flip back and forth instantly without redoing the burn animation
  or losing your unlock.
- Needs `assets/bg-texture-horde.jpg` uploaded alongside the existing
  `assets/bg-texture.jpg` (see step 7 above) — that's the new theme's hero
  background image.
- Nothing about this is destructive: the old navy/gold theme's colors are
  still fully in the stylesheet, untouched. A non-admin visitor sees no
  popup and no switcher — the page behaves exactly like before.

**To open it up to everyone** once you're happy with it: in
`guild-loot-ledger.html`, find `if (currentRole !== 'admin') return;` inside
`initDesignReveal()`, and the matching `currentRole !== 'admin'` check
inside `applyAccessControl()` that shows/hides the `#settingsDesignRow`
switcher — removing (or loosening, e.g. to `'community'` so even logged-out
applicants get it) those two checks rolls it out to everyone. Ask Claude to
do this for you if you'd rather not edit it by hand.

## Updating later

If Claude (or you) makes further changes to the app, you'll get an updated
`guild-loot-ledger.html` (and, if images changed, an updated `assets/`
folder — keep re-uploading that alongside it). Before re-uploading the
HTML file, re-paste these blocks from your current file into the new one
so it keeps working without redoing any setup:
- `FIREBASE_CONFIG` (near the top of the `<script>` section)
- `DISCORD_CONFIG` and `WORKER_URL` (just below it)
- The "Easy-to-edit guild content" block, if you've customized it

The Cloudflare Worker (`discord-auth-worker.js`) itself rarely needs to
change — it doesn't know anything about your guild specifically. If an
update does touch this file (as with the Wowhead news card above), you'll
need to redeploy it once: paste the new contents into your Worker in the
Cloudflare dashboard and click **Deploy** — see step 6d.

## Costs

Firebase's free "Spark" plan includes 1GB of storage and 10GB/month of
database traffic — this app's data is tiny (a bit of JSON), so this page
will stay free indefinitely under normal use.
