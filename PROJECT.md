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
