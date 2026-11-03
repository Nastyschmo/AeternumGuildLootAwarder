# rude Guild Page — Project Tracker

Status, open tasks, known issues and the work log (most recent first).
Rules of collaboration: `CLAUDE.md`.

## Known issues

- Class base stats (`data/forever/class-stats.json`) are frozen at build
  1.60.1.70450: their source (Wowhead gear-planner snapshot in
  github.com/ElliotWood/Forever) disappeared (HTTP 404, repo gone). The daily
  data workflow keeps the previous file; a new source is open.
- The spellbook / tooltip snapshot (`data/talentsforever.js`) is hand-kept and
  not refreshed by the daily workflow (only the talent trees are). Game
  patches that rename abilities need a manual edit there (done for
  Salvation, build 1.60.1.70425).

## Work log (most recent first)

- **2026-11-03** — How to play updated for Blizzard's development notes of
  Nov 2 (same as nasty-gaming): Rogue rework (Shank, Poised, Death Mark;
  Thousand Cuts / Cutthroat removed), Shaman (Lava Burst removed, Call of
  Thunder, Lightning Mastery, Stormstrike, Riptide), Warrior (Flurry,
  Defensive Stance, Improved Whirlwind), Paladin (Unsealed Wrath, Vengeance,
  Swift Judgement, Oath of Light, Righteous Fury threat; Voice of Truth
  removed), Priest (Binding Heal removed), Hunter, Druid, Mage, Warlock
  numbers. Baseline rewritten for build 1.60.1.70753 after the review.
  The data workflow no longer merges a data update blindly: it runs
  `check.mjs --strict` first and leaves the pull request open with a comment
  when a talent the guide names was added or removed (data PR #70 had been
  merged while the type-check workflow — which bot PRs don't trigger — would
  have failed).

- **2026-11-02** — Forever data: the importer read only the beta product
  (wow_classic_beta), which stopped at 1.60.1.70532 when the beta closed;
  the released game's builds (70630 … 70707) are under wago.tools' `wowf`
  product. `scripts/forever-data/update.mjs` now takes the highest 1.60
  build of both (same fix as nasty-gaming). How-to-play texts updated for
  the launch build and the Oct 28 / Oct 30 hotfixes (Druid: Berserk gone,
  Lacerate talent, Primal Bite capstone, Wild Growth cast time, Bloom;
  Paladin: Unsealed Wrath, Shieldsworn, Vengeance needs Seal of Command;
  Priest: Binding Heal trainer spell; Mage: Ice Lance cooldown, Missile
  Barrage row 2, Precision). Raid tactics: Salvation and Blessing of Light
  removed (gone since the Oct 30 hotfix). BiS talent stats: Mage Precision.
  Known gap: server hotfixes (Paladin / Druid / Priest talent reworks of
  Oct 30) are in no client build, so the live talent data still shows the
  beta state for them.

- **2026-10-18** — Updates in step with nasty-gaming: the data workflow
  also writes `data/forever/spells.json` (class abilities + racials, English;
  `scripts/forever-data/spells.mjs`, same as nasty), `changelog.mjs` (now the
  same as nasty's, rude paths) records ability changes (new / removed / text /
  learn level). The 15/16 Oct build's 21 ability changes (raid-wide totems and
  Battle Shout, Moonkin Aura, Salvation, Frost Blast, Shred …) were merged once
  from nasty's changelog (`--merge-abilities`, German texts dropped). Klassen
  page: "Fähigkeiten" in the automatic Patch-Updates (per class with text
  diff and learn level; Allgemein lists the classes). The 15 Oct Blizzard notes
  themselves are officer posts here (Firebase) — text handed to the user to
  paste.
- **2026-10-18** — Forever overview: characters per role (Tank / Healer /
  Damage) next to the legend, following the Alle / First / Second filter.
- **2026-10-18** — Forever-Abstimmung, Gilden-Übersicht (Klassen &
  Spezialisierungen gesamt): filter Alle / First Char / Second Char (picks[0]
  / picks[1]) — bars, class totals and the "who voted" lists follow it — and
  the number of characters next to the number of members.
- **2026-10-18** — Caught up with the WoW Forever class patch (build
  1.60.1.70425) and the broken data workflow:
  - `scripts/forever-data/update.mjs`: keeps the previous `class-stats.json`
    when the class base-stats source can't be fetched (it 404s now) instead
    of failing the whole update.
  - Talent Builder: saved builds (localStorage) drop talents the trees no
    longer have (Malediction, Shadow Affinity, Improved Fade, Wake of Fire,
    Improved Fire Nova, Call of Thunder) and clamp ranks to the new max
    (e.g. Fire Power 5 → 3). BiS sets already did this (`bisNormalizeTalents`).
  - How to play: already updated for the patch by PR #63 (kept as merged).
  - Raid tactics: Blessing of Salvation is gone — new assignment "Salvation"
    (per player); spellbook snapshot: Salvation / Mass Salvation.
  - Updates page: the word diff marks whole runs of removed / added words
    (removed words no longer run together).
  - No new Firebase data paths (no rules update); no worker deploy.
