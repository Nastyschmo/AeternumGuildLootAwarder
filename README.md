# Rude Guild Page — Standalone Setup

This is a public guild homepage with a WoW Forever class survey. Files:

- `index.html` — the page's HTML skeleton
- `css/main.css` — styles (classic + Horde theme)
- `js/*.js` — the app logic, one file per area (`core.js` holds the config
  blocks below and the editable guild content; see the header of each file)
- `data/talentsforever.js` — game data for the Talent Builder
- `assets/` — images (logo, backgrounds, news thumbnails)
- `worker/discord-auth-worker.js` — the Cloudflare Worker (deployed
  separately, see step 6b)

 The page stores its data in a free **Firebase Realtime
Database**, so it works when hosted anywhere — GitHub Pages, Netlify, your
own server, wherever.

**Keep `css/`, `js/`, `data/` and `assets/` next to `index.html`** — the
page loads them as relative files. The images in particular as regular relative files (`assets/logo.png` etc.), not
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

1. Open `js/core.js` in any text editor.
2. Find this block near the top:

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
5. Open `js/core.js`, find the `DISCORD_CONFIG` block near the
   top, and paste your Client ID in, replacing
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

Open `js/core.js`, find `WORKER_URL` near the top, and set it to your Worker's URL plus `/mint-token`, e.g.:

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
extra secret or config is required for this part. The response also
carries the last 8 articles (`recent`); the Wowhead card then gets a
dropdown to switch between them (older Worker without `recent`: one card
as before, no dropdown — redeploy the Worker to get it).

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
      "bossGuides": {
        ".read": "auth != null && (root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'member' || root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'officer' || root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'admin')",
        "$instance": {
          "$boss": {
            ".write": "auth != null && (root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'officer' || root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'admin')",
            ".validate": "newData.hasChildren(['updatedAt']) && newData.child('updatedAt').isNumber() && (!newData.child('text').exists() || (newData.child('text').isString() && newData.child('text').val().length <= 20000))"
          }
        }
      },
      "publicStats": {
        ".read": true,
        ".write": "auth != null && (root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'admin' || root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'officer')",
        ".validate": "newData.hasChildren(['members', 'raiders', 'raidsPlanned', 'itemsAwarded', 'updatedAt']) && newData.child('members').isNumber() && newData.child('raiders').isNumber() && newData.child('raidsPlanned').isNumber() && newData.child('itemsAwarded').isNumber() && newData.child('updatedAt').isNumber()"
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
          ".write": "auth != null && (!data.exists() || (root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'admin' || root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'officer'))",
          ".validate": "(data.exists() && (!data.child('applicantId').exists() || newData.child('applicantId').val() == data.child('applicantId').val())) || (!data.exists() && newData.child('applicantId').val() == auth.uid && ((root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'admin' || root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'officer') || ((!root.child('guild-loot-data/applicationLocks').child(auth.uid).exists() || now - root.child('guild-loot-data/applicationLocks').child(auth.uid).val() > 86400000) && newData.parent().parent().child('applicationLocks').child(auth.uid).val() == now)))"
        }
      },
      "applicationLocks": {
        "$uid": {
          ".write": "auth != null && auth.uid === $uid",
          ".validate": "newData.val() == now"
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
      },
      "bisSets": {
        "$uid": {
          ".read": "auth != null && auth.uid === $uid",
          "$setId": {
            ".write": "auth != null && auth.uid === $uid && (!newData.exists() || (root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'member' || root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'officer' || root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'admin'))",
            ".validate": "newData.hasChildren(['name', 'classId', 'specId', 'raceId', 'level', 'ownerId']) && newData.child('ownerId').val() === auth.uid && newData.child('name').isString() && newData.child('name').val().length > 0 && newData.child('name').val().length <= 60 && newData.child('level').isNumber() && newData.child('level').val() >= 1 && newData.child('level').val() <= 60"
          }
        }
      },
      "bisPublic": {
        ".read": "auth != null",
        ".indexOn": ["ownerId"],
        "$setId": {
          ".write": "auth != null && (!data.exists() || data.child('ownerId').val() === auth.uid || root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'admin') && (!newData.exists() || (newData.child('ownerId').val() === auth.uid && (root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'member' || root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'officer' || root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'admin')))",
          ".validate": "newData.hasChildren(['name', 'classId', 'specId', 'raceId', 'level', 'ownerId']) && newData.child('ownerId').val() === auth.uid && newData.child('name').isString() && newData.child('name').val().length > 0 && newData.child('name').val().length <= 60 && newData.child('level').isNumber() && newData.child('level').val() >= 1 && newData.child('level').val() <= 60"
        }
      },
      "bisOwned": {
        ".read": "auth != null && (root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'member' || root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'officer' || root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'admin')",
        "$uid": {
          ".read": "auth != null && auth.uid === $uid",
          ".write": "auth != null && auth.uid === $uid",
          "$itemId": {
            ".validate": "newData.val() === true"
          }
        }
      },
      "raidEvents": {
        ".read": "auth != null",
        "$eventId": {
          ".write": "auth != null && (root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'officer' || root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'admin')",
          ".validate": "newData.hasChildren(['title', 'start', 'createdBy']) && newData.child('title').isString() && newData.child('title').val().length > 0 && newData.child('title').val().length <= 80 && newData.child('start').isNumber()"
        }
      },
      "raidSignups": {
        ".read": "auth != null",
        "$eventId": {
          ".write": "auth != null && (root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'officer' || root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'admin')",
          "$uid": {
            ".write": "auth != null && auth.uid === $uid && (!newData.exists() || (root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'member' || root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'officer' || root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'admin')) && (root.child('guild-loot-data/raidEvents').child($eventId).child('signupState').val() === 'open' || (root.child('guild-loot-data/raidEvents').child($eventId).child('signupState').val() !== 'closed' && now < root.child('guild-loot-data/raidEvents').child($eventId).child('start').val() - 86400000))",
            "$charKey": {
              ".validate": "newData.hasChildren(['status', 'classId', 'specId']) && newData.child('status').isString() && newData.child('status').val().matches(/^(yes|maybe|no)$/)"
            }
          }
        }
      },
      "raidReserves": {
        ".read": "auth != null",
        "$eventId": {
          ".write": "auth != null && (root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'officer' || root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'admin')",
          "$uid": {
            ".write": "auth != null && auth.uid === $uid && root.child('guild-loot-data/raidEvents').child($eventId).exists() && root.child('guild-loot-data/raidEvents').child($eventId).child('srLocked').val() !== true && (!newData.exists() || (root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'member' || root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'officer' || root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'admin') || root.child('guild-loot-data/raidApplications').child($eventId).child(auth.uid).child('status').val() === 'accepted')",
            ".validate": "newData.hasChildren(['items'])",
            "items": {
              "$slot": { ".validate": "newData.isNumber() && (newData.val() === data.val() || ($slot === 's1' && root.child('guild-loot-data/raidEvents').child($eventId).child('srMax').val() >= 1) || ($slot === 's2' && root.child('guild-loot-data/raidEvents').child($eventId).child('srMax').val() >= 2) || ($slot === 's3' && root.child('guild-loot-data/raidEvents').child($eventId).child('srMax').val() >= 3))" }
            }
          }
        }
      },
      "raidApplications": {
        ".read": "auth != null && (root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'officer' || root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'admin')",
        "$eventId": {
          "$uid": {
            ".read": "auth != null && auth.uid === $uid",
            ".write": "auth != null && (root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'officer' || root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'admin')",
            "app": {
              ".write": "auth != null && auth.uid === $uid && (!newData.exists() || (root.child('guild-loot-data/raidEvents').child($eventId).child('srMax').val() >= 1 && !data.parent().child('status').exists() && (root.child('guild-loot-data/raidEvents').child($eventId).child('signupState').val() === 'open' || (root.child('guild-loot-data/raidEvents').child($eventId).child('signupState').val() !== 'closed' && now < root.child('guild-loot-data/raidEvents').child($eventId).child('start').val() - 86400000))))",
              ".validate": "newData.hasChildren(['name', 'chars', 'at']) && newData.child('at').isNumber() && (!newData.child('note').exists() || (newData.child('note').isString() && newData.child('note').val().length <= 1000))"
            },
            "msgs": {
              "$msgId": {
                ".write": "auth != null && !data.exists() && (auth.uid === $uid || (root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'officer' || root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'admin'))",
                ".validate": "newData.hasChildren(['by', 'text', 'at']) && newData.child('by').val() === auth.uid && newData.child('text').isString() && newData.child('text').val().length > 0 && newData.child('text').val().length <= 1000 && newData.child('at').isNumber()"
              }
            },
            "status": { ".validate": "newData.isString() && newData.val().matches(/^(accepted|declined)$/)" }
          }
        }
      },
      "raidApplicationShots": {
        "$eventId": {
          ".read": "auth != null && (root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'officer' || root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'admin')",
          "$uid": {
            ".read": "auth != null && auth.uid === $uid",
            ".write": "auth != null && ((root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'officer' || root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'admin') || (auth.uid === $uid && (!newData.exists() || (root.child('guild-loot-data/raidEvents').child($eventId).child('srMax').val() >= 1 && (root.child('guild-loot-data/raidEvents').child($eventId).child('signupState').val() === 'open' || (root.child('guild-loot-data/raidEvents').child($eventId).child('signupState').val() !== 'closed' && now < root.child('guild-loot-data/raidEvents').child($eventId).child('start').val() - 86400000))))))",
            "$shot": { ".validate": "$shot.matches(/^s[123]$/) && newData.isString() && newData.val().length <= 600000 && newData.val().matches(/^data:image\\/(jpeg|png|webp);base64,/)" }
          }
        }
      },
      "lootAwards": {
        ".read": "auth != null && (root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'member' || root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'officer' || root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'admin')",
        "$awardId": {
          ".write": "auth != null && (root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'officer' || root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'admin')",
          ".validate": "newData.hasChildren(['itemId', 'uid', 'kind', 'at']) && newData.child('itemId').isNumber() && newData.child('uid').isString() && newData.child('kind').val().matches(/^(ms|os|other)$/) && newData.child('at').isNumber()"
        }
      },
      "lootSessions": {
        ".read": "auth != null && (root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'officer' || root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'admin')",
        "$eventId": {
          ".write": "auth != null && (root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'officer' || root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'admin')",
          "$sessionId": {
            ".validate": "newData.hasChildren(['startedAt']) && newData.child('startedAt').isNumber()"
          }
        }
      },
      "raidPlans": {
        "$eventId": {
          ".read": "auth != null && (root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'officer' || root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'admin' || (root.child('guild-loot-data/raidEvents').child($eventId).child('rosterPublished').val() === true && root.child('guild-loot-data/raidEvents').child($eventId).child('rosterUids').child(auth.uid).val() === true))",
          ".write": "auth != null && (root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'officer' || root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'admin')"
        }
      },
      "bisRecommended": {
        ".read": "auth != null",
        "$setId": {
          ".write": "auth != null && root.child('guild-loot-data/discordRoles').child(auth.uid).child('role').val() == 'admin'",
          ".validate": "newData.val() === true"
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
  (`SYNCED_KEYS` in `js/app.js`). **A new top-level key needs both a
  `SYNCED_KEYS` entry and its own `.read` rule here**, or it won't load.
  `recruitingNeeds` has `.read: true` so the public "Aktuell gesucht"
  overview on Home/Bewerbung works for logged-out visitors.
- **`applications` is readable only by Admins/Officers** — except that
  every logged-in account may read *its own* applications through the
  query `orderByChild('applicantId').equalTo(<own uid>)` (that's what the
  Bewerbung page uses to show an applicant their own status). The
  `.indexOn: ["applicantId"]` entry is required for that query.
- **BiS-Planer:** `bisSets/<uid>` (private item sets) and
  `bisOwned/<uid>` ("Habe ich" items) are readable only by their owner;
  the page listens to the own path directly (not via `SYNCED_KEYS`).
  `bisPublic` holds the sets an owner marked "öffentlich" and is readable
  by every logged-in account (Community included); the page reads its own
  ones with `orderByChild('ownerId').equalTo(<own uid>)`, which needs the
  `.indexOn: ["ownerId"]`. Saving a set needs the role Gildenmitglied,
  Officer or Admin, and only into one's own name (`ownerId`); deleting
  one's own sets always works, and Admins may delete any public set.
  Owned items can be written by any logged-in account for itself.
- **`bisRecommended/<setId>` = true** marks a public set as recommended
  ("★ Empfohlen" at the top of the set dropdown). Readable by every
  logged-in account (it's in `SYNCED_KEYS`), writable only by Admins.
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
  anyone else's. A new application must carry the submitter's own id as
  `applicantId` (nobody can file one in someone else's name), and
  non-Officers can submit at most **one per 24 hours**: the page writes
  the application together with `applicationLocks/<their-discord-id>` set
  to the server time in one update, and the rules reject the new
  application if the previous lock is younger than 24 hours.
  `applicationLocks` isn't readable by anyone and isn't loaded by the page
  (so it's deliberately not in `SYNCED_KEYS`). The "Erinnerung senden"
  button doesn't write to the
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
`js/core.js`'s `FIREBASE_CONFIG` (it's pre-filled with your
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
2. Push `index.html` together with the `css/`, `js/`, `data/` and
   `assets/` folders, keeping the folder structure exactly as-is. The page
   won't load its styles, logic or images without them.
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
own web server) — just upload `index.html` together with `css/`, `js/`,
`data/` and `assets/`.

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
3. The Worker already allows the preview: its built-in
   `DEFAULT_ALLOWED_ORIGINS` list contains both the GitHub Pages origin and
   `https://preview.aeternumguildlootawarder.pages.dev`. Calls from any
   other site's page are refused. To change the list (e.g. for a custom
   domain), set a Worker variable `ALLOWED_ORIGINS` to a comma-separated
   list of origins (`https://host` without path or trailing slash) — it
   replaces the built-in list. Remove an old `ALLOWED_ORIGIN` variable if
   one is set, since it would take precedence over the built-in list.

### 8c. Optional: keep the preview private

Preview deployments are already marked `noindex` for search engines, but
anyone with the URL can open them. To lock them down: Pages project →
**Settings** → **General** → **Access policy** → enable it for preview
deployments (Cloudflare Access, free for up to 50 users) and allow your
own e-mail address.

## Editing the homepage content (guild name, intro text, news)

Open `js/core.js`, find the block near the top headed
"Easy-to-edit guild content" — it has plain
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
near the top of `js/core.js`.

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
updated export from them and ask Claude to refresh the
`TALENT_DATA`/`SPELLBOOK_DATA`/`SPELL_DESC_DATA`/`RACIAL_DATA`/
`CLASS_RACIAL_DATA`/`CLASS_ABILITY_DATA`/`LEGACY_DATA` constants in
`data/talentsforever.js` with it (that file is loaded by `index.html`, so
upload it together with the page).

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

## Design Reveal (Horde theme)

There's a second, dark "Horde" theme built into the page (same layout,
retinted — see PROJECT.md for the full story). Every visitor gets a
one-time popup (*"Die Fraktion wurde gewählt, der Name steht fest. Neues
Design jetzt freischalten?"*) — clicking **Okay** plays a burn-through
animation into the new theme. It's remembered per browser in
`localStorage`. Admins additionally get a **Design** switcher at the
bottom of **User Settings** (**Klassisch** / **Horde**) plus a button to
replay the popup and burn animation. The theme's hero background is
`assets/bg-texture-horde.jpg`.

## Updating later

Changes are made on feature branches and land on `main` via pull
requests; GitHub Pages redeploys `main` automatically. The config blocks
(`FIREBASE_CONFIG`, `DISCORD_CONFIG`, `WORKER_URL`) live in `js/core.js` and
stay as they are across updates — nothing to re-paste.

The Cloudflare Worker (`worker/discord-auth-worker.js`) is deployed
separately: whenever a change touches it, open your Worker in the
Cloudflare dashboard → **Edit code** → paste the new contents → **Deploy**.
The pull request says so when that's needed, and in which order relative
to merging.

## WoW Forever item data (automatic)

**Was ist neu? (changelog):** after regenerating, the workflow runs
`scripts/forever-data/changelog.mjs`, which compares the new data with the
last commit and — only when the client build changed — adds an entry to
`data/forever/changelog.json`: items added / removed / changed with their
old and new values (name, quality, item level, required level, stats,
damage, armor, slot, binding, set) and talents whose text or ranks
changed. Same build = importer change, not recorded. On the Klassen page
every build shows up as a Patch-Update in the same list and style as the
hand-written ones (`js/forever-changes.js`): "Allgemein" lists the items
(old → new) and which talents changed per class, each class its talents
with the changed words marked. When officers already wrote a Patch-Update
on that day (± 1 day), the automatic part is added to that post
("Automatisch erkannt") and leaves out items / talents the post already
names. Home shows a news tile for 14 days after a new build. `--backfill` rebuilds the log from git history.

`data/forever/items.json` holds every equippable WoW Forever item of
uncommon quality or better — name, slot, item level, required level,
armor/weapon type, icon, final stats, armor, weapon damage, item set — plus
where it comes from (NPC drops with zone, quest rewards, vendors, objects,
containers). `data/forever/meta.json` records the client build it was made
from. `data/forever/class-stats.json` holds base health, mana and
attributes per class and level (1–60), race offsets, crit per
agility/intellect, the level-60 combat rating conversions and which races
can play which class (`combos`, from the client's `CharBaseInfo`) and each
race's faction. Nobody edits
these by hand:

- `scripts/forever-data/update.mjs` builds them from the newest WoW Forever
  client build on [wago.tools](https://wago.tools) (DB2 exports; items the
  Forever export lacks are taken from the newest Classic Era build), the
  sources from [QuestieDB](https://github.com/Questie/QuestieDB)
  (`data/Forever`), and icon names from the
  [wowdev listfile](https://github.com/wowdev/wow-listfile).
- Enchantments (`scripts/forever-data/enchants.mjs` →
  `data/forever/enchants.json`): ENCHANT_ITEM spells (SpellEffect 53) →
  SpellItemEnchantment effect text, SpellEquippedItems slot masks, source
  = profession (SkillLineAbility, recipe item) or on-use item (ItemEffect
  TriggerType 0) with QuestieDB sources. `st`: flat stats as
  `[item stat id, value]` — stat effects (type 5), armor / resistances
  (type 4) and equip spells (type 3) whose auras are plain bonuses
  (stats, attack power, spell damage, healing, mana per 5, health,
  defense, resistances); procs and % effects are left out.
- Talent trees (`scripts/forever-data/talents.mjs` → `data/forever/talents.js`,
  `window.FOREVER_TALENT_TREES`): Forever keeps its trees in the client's
  retail-style Trait tables (not the Classic Talent/TalentTab ones). Names,
  ranks, positions, prerequisites and per-rank tooltip numbers come from
  there (approach from ElliotWood/Forever's `export_beta.py`, MIT);
  `data/talentsforever.js` keeps the hand-made snapshot
  (`TALENT_DATA_SNAPSHOT`) for class/tree icons, tab names and tooltips
  the client text can't resolve, and merges both into `TALENT_DATA`.
  Sanity checks: nine classes, three named tabs each, 7×4 grid, name
  overlap with the snapshot, key talents present.
- Class stats (`scripts/forever-data/class-stats.mjs`): base mana and crit
  per agility/intellect from the client's `PlayerExpectedStat`; base
  health and attributes (server-side, not in the client) from Wowhead's
  Forever gear-planner data as snapshotted in
  [ElliotWood/Forever](https://github.com/ElliotWood/Forever) (MIT), which
  checked them against Forever character sheets. Below level 60 the rating
  → % conversion isn't in the client anymore; the TBC curve is assumed
  (rating per 1% × max(level − 8, 2) / 52) and should be shown as an
  estimate.
- Zones: names from the client's `AreaTable` (Forever, gaps from Classic
  Era); which zone ids are dungeons/raids/battlegrounds from QuestieDB's
  zone enum (`src/corrections/enum/zones.lua`), dungeon vs. raid from the
  `Map` table. QuestieDB's Forever data lacks loot for some raid bosses
  (Molten Core), so for items without drops the droppers come from its
  Wotlk data — only NPCs Forever has, in a dungeon/raid zone.
- Crafting (`scripts/forever-data/crafting.mjs`): which profession makes
  an item and at what skill, from the client's `SpellEffect` (create
  item), `SkillLineAbility` and the recipe items' `ItemEffect`; the
  recipe's own sources come from QuestieDB. Trainer-learned recipes have
  no recipe item; their skill is estimated (marked `e`). Materials from
  `SpellReagents` (`m`, names in the top-level `reagents` map).
- Materials (`scripts/forever-data/materials.mjs`): for every reagent of
  crafted gear — and, recursively, of crafted reagents (Arcanite Bar →
  Thorium Bar → Thorium Ore) — where to get it, in the top-level
  `materials` map: QuestieDB sources, the profession craft, zones of the
  gathering nodes (`oz`, from object spawns), the zones most droppers of a
  world drop live in (`dz`), and skinning (`sk`) / disenchanting (`de`)
  hints derived from the name.
- `.github/workflows/forever-data.yml` runs it **every day**. If the data
  changed, it runs the importer's sanity checks and the type check, opens a
  pull request and merges it immediately.

One-time GitHub setting this needs: **Settings → Actions → General →
Workflow permissions** = *Read and write permissions*, and tick *Allow
GitHub Actions to create and approve pull requests*. To refresh right away,
open the **Actions** tab → *Forever data* → *Run workflow*.

## BiS-Planer

Page *BiS-Planer* (`js/bis-planner.js`) loads `data/forever/items.json` and
`class-stats.json` the first time it is opened. Pick class, spec, race and
level (1–60); per slot you choose an item from all items your class can
wear at that level (armor/weapon proficiencies, class restrictions,
two-handers block the off hand). The page sums up the stats (health, mana,
attributes, armor, attack power, hit/crit %), shows where every item comes
from and builds a farm list grouped by zone; a slot ticked as *Habe ich*
drops off the list. Quest rewards without a required level count from the
quest's level; items the client gives no level at all (some raid drops)
count from item level − 5, max. 60, shown as "ca.". Faction: the race decides Alliance/Horde; items only one
faction can get (the importer's `fa`, from one-faction vendors/quests in
QuestieDB, e.g. Warsong Gulch gear) are hidden for the other one, and
other-faction vendors/quests are left out of the sources. Crafted items show
the profession and skill and where the recipe drops/is sold; the card
*Benötigte Berufe* sums up which professions the open slots need — BoP
crafts you must make yourself, BoE ones can be bought. *Materialliste*
adds up the materials of all open crafted slots; clicking one shows where to
get it, and "In Rohstoffe aufschlüsseln" breaks materials that are only
crafted (bars, transmutes, bolts) down into their own materials. The item picker can be narrowed by
*Herkunft*: a search field with suggestions (type "ra" → Ragefire Chasm,
Razorfen …) where several entries can be picked at once — open world,
quests, vendors, professions, dungeons, raids, battlegrounds
(`instances` in items.json). The choice is remembered per browser
(`rude-bis-content-v1`) so it stays while you go through the slots. The working copy lives in the
browser (`localStorage` key `rude-bis-draft-v1`).

**Item-Sets** (`js/bis-sets.js`): Gildenmitglieder and up can save the
current selection as a named set per class + spec (free text, e.g. "Raid:
Ragnaros", "AoE-Farm", "PvP"), several per spec; the set bar above the
slots loads, saves, saves as new, deletes and toggles *öffentlich*.
Private sets live in `bisSets/<uid>`, public ones in `bisPublic` (moved
there with one multi-path update; readable by every logged-in account as
the basis for a later public build list). *Habe ich* belongs to the item,
not the set: `bisOwned/<uid>/<itemId>` — one tick counts in every set;
logged out it stays in `localStorage` (`rude-bis-owned-v1`) and joins the
account at the next login. The set dropdown also lists
other users' public sets for the same class + spec, grouped per user
("Öffentlich von <Name>"); loading one shows the owner, and changes can
be saved as an own copy. Community accounts can browse those but not
save; logged-out visitors use the planner locally. Leaving a set with
unsaved changes asks in a styled dialog (Speichern / Verwerfen / Weiter
bearbeiten — `bisDialog()` in js/bis-sets.js, also used for delete and
"Alle Slots leeren"). Admins can tick *★ empfehlen* on any public set:
recommended sets head the dropdown for everyone (group "★ Empfohlen",
with a "Von der Gildenleitung empfohlen" note when loaded), and switching
to a class/spec without own sets opens the newest recommendation.

**Öffentliche Builds** (`js/bis-browser.js`): a second tab on the BiS
page lists every public set as a card (class, spec, level, owner, date,
★ for recommended, item icons, "x/y hast Du") — filter by class / spec,
search by set or player name, recommended first, then newest. "Im
Planer öffnen" loads the set into the planner. Every logged-in account
(Community included) can browse; Admins can remove someone else's public
set (also clears its recommendation). No comments by design.

**Talente im Set** (`js/bis-talents.js`): the side card "Talente" shows
the set's talent points per tree (icons with rank, "31/20/0", warning
when more points than the level allows). "Im Talent Builder bearbeiten"
opens the Talent Builder with the set's talents (the user's own builder
state for that class is backed up), a banner there offers "Übernehmen &
zurück" / "Abbrechen" and restores the backup; "Aus Talent Builder
übernehmen" copies the current builder state. Saved with the set as
`talents: { t0, t1, t2 }` (talent name -> rank); switching class clears
them. No rules change.

**Raids** (`js/raids.js`, page "Raids"): raid calendar with sign-ups.
**Raid window:** the list shows one compact card per raid (date, phase —
Anmeldung offen / geschlossen / Raid-Tag / Vorbei —, counts, the own
sign-up or "✓ In der Aufstellung"); a click opens the raid window with
three steps as tabs: **1 Anmeldung** (sign-up form, sign-ups, Soft- and
Hard-Reserves; officers: "Anmeldung schließen → Aufstellung"),
**2 Aufstellung** (officers edit it until the end of the raid day —
midnight after the start, at least 6 h —, members see it once
published), **3 Taktik** (players of the published line-up and officers), **4 Loot** (Loot-Runden, see Loot-Vergabe). The window opens
on the tab that fits the phase; open raid and tab are kept in
sessionStorage.
**Several characters per member, sign-up deadline, Aufstellung:**
`raidSignups/<eventId>/<uid>/<charKey>` (charKey = character id from
Meine Charaktere, `n_<name>` for a typed name; older single sign-ups
directly under `<uid>` are still read and replaced on the next sign-up).
Sign-ups close 24 h before the start; officers can close earlier or
reopen (`raidEvents/<id>/signupState` 'closed' / 'open') — the rules
enforce it. Sign-ups are open to everybody, whatever the raid size.
Officers build the Aufstellung on the card (`js/raid-comp.js`): the raid
size comes from the instance (`RAID_INSTANCES`), targets per role
(defaults 10 → 2/3/5, 20 → 2/5/13, 40 → 4/10/26), pick at most one
character per player; a character already in a line-up of the same
instance in the same raid ID (reset Wednesday 07:00 German time,
`raidLockoutKey`) is locked (🔒) and greyed out in the sign-up form
(`raidEvents/<id>/roster/<uid>|<charKey>`), then publish
(`rosterPublished`) — members see the line-up and the Ersatzbank.
Characters carry a raid status (`raidRole` 'main' / 'twink', several
mains allowed) set on Meine Charaktere; twinks show dashed with "T".
The loot decision aid uses the Aufstellung when there is one.

Officers / Admins create, edit and delete events (instance from a dropdown
of Forever's announced raids, `RAID_INSTANCES` in js/raids.js; `raidEvents/<id>`:
title, instance, start, note); members sign up as Dabei / Vielleicht /
Absage with character, class, spec and an optional note
(`raidSignups/<eventId>/<uid>`); the roster splits tanks / healers / damage
by the spec's role. Everyone logged in can read both; deleting an event
also clears its sign-ups. **Rules:** `raidEvents` and `raidSignups`
(README § 6f). Own listeners, not in `SYNCED_KEYS`.

**Taktik** (`js/raid-tactics.js`, step 3 of the raid window, between
Aufstellung and Loot): boss-by-boss raid plan instead of external sheets.
Tabs "Ganzer Raid" plus the instance's bosses (`RAID_BOSSES`). Per boss:
assignments per line-up character (Seelenstein, Anregen, Wiedergeburt,
Flüche, Segen, Auren, Heal- / Tank-Ziele, Decurse groups, Unterbrechen …
— `RAID_TACTIC_ABILITIES`, only spells present in our Forever data, talent
abilities only for the spec), a positioning board (boss, raid groups,
single players and raid markers dragged onto the field, optional map
image link), a Kick-Reihenfolge per boss cast (who interrupts in which
order; only characters with an interrupt in our data: Kick, Pummel,
Shield Bash for Protection, Counterspell, Earth Shock, Silence for
Shadow, Feral Charge for Feral, Spell Lock), a note and "MRT-Notiz
kopieren" (class-colored text for the in-game note). "Ganzer Raid" adds
the ability summary of the line-up and the raid groups ("Automatisch
verteilen"). Players see "Deine Aufgaben" on top (assignments, kick
number, own spot on the board) and on Home (next raid of theirs with
tasks).
`raidPlans/<eventId>` = `{ groups: { "<uid>|<charKey>": n }, bosses: {
<bossKey>: { a: { "<abilityId>~<uid>|<charKey>": { t, n } }, note, kicks: {
<kickId>: { spell, order: ["<uid>|<charKey>", …] } }, map: { bg, tok: {
<token>: { x, y } } } } } }`. Readable by officers / admins and
the players of the published line-up (`raidEvents/<id>/rosterUids`, uid ->
true, kept by the officers' client when the line-up changes); written by
officers / admins. **Rules:** `raidPlans` (README § 6f). Own listener,
not in `SYNCED_KEYS`.

**Boss-Guides** (`js/boss-guides.js`, page "Boss-Guides" under Raid &
Loot, members): every dungeon / raid with its bosses. Boss lists come
from the Forever client's `DungeonEncounter` table (official names and
order; instances Forever adds are marked "Neu in Forever") via
`scripts/forever-data/journal.mjs` → `data/forever/journal.json`; Forever
raids not in the client yet use the announced names (`RAID_BOSSES`).
Blizzard's Dungeon Journal (description, abilities, flags) is imported
by the same script as soon as the client ships the Journal tables (it
doesn't yet). Officers write per boss: tactics (rich text), hints per
role, mechanics (`BOSS_MECHANICS`: Furcht, Magie, Flüche, Gift,
Krankheit, unterbrechbare Zauber, Raserei, Feuer-/Frost-/Schatten-/
Naturschaden, Adds, Gedankenkontrolle, Wipe-Gefahr) and class notes. The
mechanics list the classes that negate or ease them and put the matching
abilities first in the raid window's Taktik step ("empfohlen"; the
others under "Weitere Fähigkeiten"). `bossGuides/<instanceKey>/<bossKey>`
= `{ text, roles: { tank, healer, damage }, classes: { classId: note },
mech: { id: true }, img, updatedAt, updatedBy }` (keys: `raidBossKey(name)`;
`img` = picture link — the client has no boss models: its Creature table
only holds mounts / pets and NPC → model is server-side).
**Rules:** `bossGuides` (README § 6f; read: members, write: officers /
admins). In `SYNCED_KEYS`.

**Gast-Bewerbungen für SR-Raids** (`js/raid-externals.js`): people
logged in with Discord but without a guild role (community) see the
Raids page as a guest view — the upcoming Soft-Reserve raids (`srMax` >
0) — and apply per raid: 1–3 characters (name, class, spec, Armory link
— required), up to 3 gear screenshots (resized to JPEG in the browser,
≤ ~550 KB, stored as data URLs in `raidApplicationShots/<eventId>/<uid>/s1..s3`,
read by officers / the guest only when opened) and a note; then a
message thread with the raid leads. Guests can edit while the sign-up is
open and nothing was decided, and withdraw. Officers review them in the
raid window's Anmeldung tab: "Mit <Charakter> annehmen" writes the
decision and a sign-up "Dabei" (`raidSignups/<eventId>/<uid>/x_c1`,
`ext: true`, chip "Gast") — the guest shows up in the Aufstellung and may
soft-reserve (`raidReserves` rule) —, "Ablehnen" / "Zurücksetzen" remove
it again. Officers' Home "Zu tun" lists open guest applications.
`raidApplications/<eventId>/<uid>` = `{ app: { name, chars: { c1..c3: {
n, cls, spec, armory } }, note, shots, at, upd }, status: 'accepted' |
'declined', char, decidedBy, decidedAt, msgs: { <id>: { by, name, text,
at } } }`. **Rules:** `raidApplications`, `raidApplicationShots`, and
the `raidReserves/$eventId/$uid` write rule (README § 6f). Own
listeners, not in `SYNCED_KEYS`.

**Soft-Reserve** (`js/raid-reserves.js`): Officers turn it on per event
(`srMax` 1–3 items per player, "Aus" = off) and can lock it (`srLocked`,
"Reserves sperren" on the card). Members signed up as Dabei / Vielleicht search an
item and reserve it (`raidReserves/<eventId>/<uid>/items/s1..s3` = item id; fixed slots because rules can't count children — slot sN needs `srMax` >= N); the
card lists all reserves by item, contested items first, players who
aren't signed up any more struck through, plus "Reserves kopieren" (plain
text) for the loot master. Forever has many items twice (Classic id and
a new id, same stats), so the search shows one result per name and
stats (versions with other stats stay apart, with their stat line) and
the list groups by name. Withdrawing frees the own reserves (unless locked). The search shows only items
for the signed-up class and spec by default ("Nur Items für …", can be
switched off): usable at 60, the class's own armor type (cloaks
excepted), and only stats the spec wants (`RAID_SR_SPEC_STATS`: core
stats, one needed, plus allowed extras — e.g. str on paladin healing
plate, int on hunter mail); casters / healers don't get melee weapons
without caster stats. Non-gear items always show. Our
raid-loot data is incomplete (QuestieDB lacks many boss drops), so the
search covers every rare+ item and lists known drops of the event's
instance first. **Rules:** `raidReserves` (README § 6f) enforce the
limit and the lock; lowering the limit later still lets players remove
items. Deleting an event also clears its reserves.

**Item-Tooltips** (`js/item-tooltip.js`): hovering any element with
`data-item-id` (BiS planner slots and picker, public builds, Gildenbedarf,
soft-reserves) shows a tooltip laid out like the German game client —
binding, slot / type, damage, armor, base stats, classes, required level,
green "Anlegen:" lines, set pieces (owned ones highlighted), item level
and the source. Equip effects that aren't plain stats (procs, "Benutzen:")
aren't in items.json and don't show. Colors: `--tip-*` tokens (the game's
own, same in both themes).

**Talente in den Werten** (`js/bis-talent-stats.js`): the set's talents
count in the stat totals when their effect is fixed and always on —
% to a stat / health / mana / armor from items, crit, hit, dodge, parry,
block, "% of Intellect / Spirit as attack power, spell damage,
healing or armor", and hit / crit for one spell school (`hit:Shadow`
etc., own rows like "Treffer (Schattenzauber)"). Curated per talent in `BIS_TALENT_STATS`
('Class|Talent' -> kind + which "%" number of the rank's text); the
value is read from the text at the set's rank, so Forever's tuning
changes come in with the talent data. Talents tied to a form, weapon,
single ability or proc are left out. The applied talents
are listed under the stats.

**Meine Charaktere** (`js/mychar-page.js`): the member's characters in
one place — add, edit (name, realm, class, spec, main), remove; per
character the professions and one BiS set per spec (an own saved set,
chosen from a dropdown, with "Habe ich" progress and a link into the
planner — sets are still created in the BiS planner). Assignments are
stored as `characters[i].bisSets = { specId: setId }` for the planned
loot distribution. Everything is a draft until "Speichern" writes the
own `characterProfiles/<uid>` (no rules change). User Settings keeps
only the nickname.

**Berufe** (`js/professions.js`, page "Berufe"): every member enters
professions per character — profession, skill (1–300) and special
recipes — on Meine Charaktere. Stored in the
own character profile (`characterProfiles/<uid>/characters[i].professions`
= `[{ id, skill, recipes? }]`, at most two primary professions, 40
recipes), so **no rules change**. Recipes are crafted items from
items.json (`craft.p`) and, for Enchanting, enchants (spell ids);
alchemy / cooking / first aid have no recipe data yet. The directory
lists crafters per profession (filter chips, search by player or item);
an item search shows "Wer kann das herstellen?" — who listed the recipe,
then who has enough skill. The BiS planner's source lines name guild
crafters for BoE crafted items ("Gilde: Hammerfaust (Rezept), …").

**Testmodus** (`js/testmode.js`, User Settings → "Testmodus starten"
for Admins and for anyone an Admin unlocked in Manage access — checkbox
"Testmodus" per person, `discordRoles/<uid>/testMode`; no rules change,
people can already write their own entry and the test mode never touches
the real data): the whole site on a made-up guild (17 people, 21 characters,
public BiS sets, five raid events incl. a past one with loot, a raid
running today with two Loot-Runden and votes, a raid-ID lockout case,
soft-reserves with a Hard-Reserve, three applications), only in this browser.
`window.firebase` is replaced by an in-memory stand-in before js/core.js
loads; changes are kept in localStorage until "Szenario neu laden".
The red bar on top switches the person you look through (admin,
officer, members, an applicant) and has a "Was testen?" checklist.
Discord DMs and Armory / WarcraftLogs lookups are skipped. "Testmodus
beenden" restores the real login.

**Game icons** (`js/game-icons.js`): original WoW icons from Wowhead's
icon CDN (same source as talents / items) for headings and roles —
`GAME_ICONS` maps a purpose to an icon name (talents, spells, items,
patch, tank, healer, damage, raid, loot, votes …); every name occurs in
our own game data, so the CDN has it. Used in the Patch-Updates (section
heads), raid role columns / counts and the Home card titles. Class and
spec mentions in Patch-Updates and the Deep Dive / Allgemeine Infos text
("Druiden", "Schutz-Paladine", "Holy Priest", English and German) get the
class or spec icon in front (`annotateClassMentions`, before the spell
auto-links) Emojis in those hand-written texts are shown as game
icons (`replaceEmojis`, `GAME_EMOJI_ICONS`: ⚙️ gear, 📅 pocket watch, ⚔️
sword, 🐉 dragon head …); an emoji right before a class / spec mention is
dropped (the mention has its icon), other emojis are removed, ✅ / ❌
become ✓ / ✗ — on display only, the stored text is unchanged. Spec names used as a
heading or list header on their own ("Waffen", "Furor", "Schutz",
"Vergeltung") get the spec icon of the class mentioned last before them
(or the page's class) — `annotateSpecHeadings`, the same spec icons as
the class vote.

**Home-Dashboard** (`js/home-dashboard.js`, below the hero on Home):
guests / applicants see who we are, who we're looking for
(recruitingNeeds), "So bewirbst du dich" in three steps and links to the
open pages; members see the next raid with their sign-up / line-up
status ("Jetzt anmelden"), open votes, the newest announcement, their
recent loot and hints for Meine Charaktere (no characters, no class, no
BiS list on a main); officers / admins get "Zu tun" on top (untouched
applications, closed sign-ups without a line-up, unpublished line-ups
within 48 h, a running raid without a Loot-Runde, open Loot-Runden). The
hero button changes with it (Jetzt bewerben / Zur Abstimmung / Zum
Raid-Kalender); members get a slim hero. Members see the next 7 days as a
strip: raid days (`GUILD_RAID_WEEKDAYS` in js/core.js) and every raid
with the own status (✓ in der Aufstellung, ● angemeldet, ✗ abgesagt,
! noch nicht angemeldet, – geschlossen); officers also get "Raidtag —
noch kein Raid angelegt" in Zu tun with a button to the new-raid form. **Guild numbers for guests:** guests can't
read members, raids or loot, so the browsers of officers / admins keep
`publicStats` = { members, raiders (Main characters), raidsPlanned,
itemsAwarded, updatedAt } up to date (written on Home only when a number
changed); "Wer wir sind" shows them. **Rules:** `publicStats` (README
§ 6f, read: everyone, write: officers / admins), in `SYNCED_KEYS`. The hero shows a countdown to
the Forever launch (afterwards, for members, to the next raid). The news
row shows only real items (newest announcement, Wowhead / patch notes,
NEWS_ITEMS until their `until` date) and hides itself when empty.
Reads existing data only — no rules change.

**Loot-Runden** (`js/loot-session.js`, raid window → tab "Loot",
officers / admins = the Loot Council): items are tradeable for 2 hours
after the drop, so a raid hands out loot in several Runden. "Loot-Runde
starten" → add what dropped: RCLootCouncil CSV export
(`js/loot-import.js`; rows of the raid's evening that aren't in this raid
yet are pre-selected, the RCLC player / response is kept as a hint) or
single items via the search → "Abstimmung öffnen": a pop-up with the
Runde's items on the left (votes, "Du fehlst", awarded) and per item the
decision aid with every council member's vote (☆ Stimme, one per member
and item, changeable), the trade timer and "MS" / "OS" to award —
written to `lootAwards` (with `sessionId`), then the next open item.
"Extern / frei" (external won the roll) and "Entzaubern / Bank" close an
item without a guild award; "Zurücknehmen" reopens it. **Hard-Reserves**
(`raidEvents/<id>/hr`, Anmeldung tab, officers): items the guild keeps
in SR runs with externals — not soft-reservable, flagged HR, decided by
the council; SR items are rolled in game among the reservers.
`lootSessions/<eventId>/<sessionId>` = { startedAt, startedBy, closedAt?,
items: { itemId, itemName, at, boss?, ext?, rclcName?, rclcResponse?,
votes: { voterUid: "<uid>|<charKey>" }, done?, awardId?, doneNote? } }.
**Rules:** `lootSessions` (README § 6f) — officers / admins read and
write. Own listener, not in `SYNCED_KEYS`.

**Loot-Vergabe** (`js/loot.js`, Loot Council with a decision aid):
the pop-up of a Loot-Runde lists everybody in the raid — the
Aufstellung, else everybody signed up (Dabei / Vielleicht)
with BiS (item on the BiS set the character assigned for the signed-up
spec on Meine Charaktere, not ticked "Habe ich"; only public sets are
readable), Soft-Reserve, attendance ("Dabei" for the last 10 earlier
raids), main-spec loot of the last 30 days and main / twink — in a
suggested order (BiS + SR, not received yet, main before twink, less
loot, more attendance). "MS" / "OS" writes `lootAwards/<id>`. The Loot
tab lists the raid's loot for everybody; the page "Loot" shows the
history by raid or per player. Awards keep the boss and the RCLC row id
(`ext`), so re-importing the same export adds nothing.
**Rules:** `lootAwards` (README § 6f) — members read, officers / admins
write. Own listener, not in `SYNCED_KEYS`.

**Gildenbedarf** (`js/bis-need.js`, third tab on the BiS page): who in
the guild still needs which item, per raid / dungeon and boss. Built from
every public set (own public sets included) and everybody's "Habe ich"
ticks; a player needs an item when one of their public sets has it and
they haven't ticked it. Bosses and zones come from the items' drop
sources (`instances` decides raid / dungeon); droppers without a zone go
under "Instanz unbekannt". Filters: Raids / Dungeons / Alle, search
(player, item, boss, instance), "Auch wer es schon hat". **Rules:**
members, officers and admins may read all of `bisOwned` (README § 6f);
without that the tab still works but can't tell who already has an item.

**Verzauberung pro Slot** (`js/bis-enchants.js`, data from
`scripts/forever-data/enchants.mjs` → `data/forever/enchants.json`):
every slot with an item gets an enchant dropdown with the enchants that
fit that item (grouped Berufe / Items, with effect and skill), its
source line (profession + skill + recipe source, or the item and where
it comes from) and a "verzaubert" tick. The tick belongs to item +
enchant and counts in every set (stored next to the owned items as
`bisOwned/<uid>/e<itemId>_<enchantId>`); the farm list gets a
"Verzauberungen" section. Saved with the set as `enchants: { slot:
spellId }`; picking another item keeps the enchant only if it still
fits. Flat enchant stats (`st`) are added to the stat totals, and so
are hit / crit / dodge / block % read from the enchant text
(`bisEnchantChances`, e.g. "Hit +1%"); procs (Crusader) and haste are
not. No rules change. Rules: README § 6f.

## How to play (Class Overview)

Each class in **Class Overview** has a "How to play" card above its
Patch-Updates: an intro, leveling and race notes, then one tab per spec
(role, playstyle, priority, stats, tips) and the sources it was summarised
from. The text lives in `data/howtoplay.js` – a hand-curated best-of from
public WoW Forever guides, written in our own words and checked against
the live talent data (every talent it names exists in that tree). Edit it
via PR and bump `HOW_TO_PLAY_UPDATED`; ability names stay English and get
the Deep Dive hover tooltips automatically.

The "Unsere Builds & Tools" box links each spec to the Talent Builder, the
BiS planner (opens the newest own / ★ recommended set of that spec), its
★ recommended sets and the spec's public builds; the BiS planner links back
("How to play <Spec> →" under the spec select). Each class also has a
"Berufe" note, and every recommended set with talents gets "Talente
ansehen": it opens the set's talents in the Talent Builder with a banner
("In meinen Talent Builder übernehmen" / "Zurück zum Guide"); the user's
own builder state is backed up (also in localStorage, restored on the
next page load if the preview was left open). No new Firebase paths – it
reads `bisPublic` and `bisRecommended`, which already have their rules.

**Staying current.** The talent data under `data/forever/` refreshes daily
from the game client. `data/howtoplay-baseline.json` remembers, for every
talent the guide names, its rank count and max-rank text at the time the
guide was last reviewed. When they drift apart:

- the card shows "⚠ … seit dem <Stand> im Spiel geändert" with before/after
  text per talent;
- the daily *Forever data* workflow keeps one open issue labelled
  `how-to-play` with the same list (and closes it when nothing differs);
- after updating the guide text: `node scripts/howtoplay/check.mjs --baseline`
  and bump `HOW_TO_PLAY_UPDATED`. The *Type check* workflow runs
  `check.mjs --strict` on every PR and fails if the guide names a talent
  the baseline doesn't know (or the other way round).

## Type checking (development only)

The page has no build step — browsers run `js/*.js` as-is. TypeScript is
only used as a checker: types are written as JSDoc comments in the JS,
and the shared data model (`State`, `Application`, `Poll`, …) lives in
`types/model.d.ts`. Every file in `js/` and `data/` is checked.

```sh
npm install        # once — installs TypeScript locally
npm run typecheck  # tsc -p . (noEmit)
```

The same check runs as a GitHub Action (`.github/workflows/typecheck.yml`)
on every pull request. `package.json`, `tsconfig.json`, `types/` and
`node_modules/` (git-ignored) aren't used by the page itself.

## Costs

Firebase's free "Spark" plan includes 1GB of storage and 10GB/month of
database traffic — this app's data is tiny (a bit of JSON), so this page
will stay free indefinitely under normal use.
