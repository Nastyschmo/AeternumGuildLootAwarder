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

- **2026-10-18** — Caught up with the WoW Forever class patch (build
  1.60.1.70425) and the broken data workflow:
  - `scripts/forever-data/update.mjs`: keeps the previous `class-stats.json`
    when the class base-stats source can't be fetched (it 404s now) instead
    of failing the whole update.
  - Talent Builder: saved builds (localStorage) drop talents the trees no
    longer have (Malediction, Shadow Affinity, Improved Fade, Wake of Fire,
    Improved Fire Nova, Call of Thunder) and clamp ranks to the new max
    (e.g. Fire Power 5 → 3). BiS sets already did this (`bisNormalizeTalents`).
  - How to play (`data/howtoplay.js`): Mental Strength +10 %, Arcane rework
    (Arcane Blast → spell damage from Intellect, Arcane Wrath, Missile
    Barrage), Improved Fire Blast replaces Wake of Fire, Heating Up, Ice
    Lance 200 %, Reckoning, Devouring Contagion, Power in Light. Baseline
    rewritten (`scripts/howtoplay/check.mjs --baseline`), stand 2026-10-18.
  - Raid tactics: Blessing of Salvation is gone — new assignment "Salvation"
    (per player); spellbook snapshot: Salvation / Mass Salvation.
  - Updates page: the word diff marks whole runs of removed / added words
    (removed words no longer run together).
  - No new Firebase data paths (no rules update); no worker deploy.
