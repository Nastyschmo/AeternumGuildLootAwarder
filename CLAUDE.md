# CLAUDE.md – Arbeitsregeln für die rude Guild Page

Diese Datei wird zu Beginn jeder Claude-Session automatisch gelesen. Sie
enthält die **Regeln der Zusammenarbeit**. Die **Projektdokumentation**
(Status, offene Aufgaben, Known Issues, Work Log) steht in `PROJECT.md` –
die ist neben dem Code die zentrale Dokumentationsgrundlage und wird nach
jeder abgeschlossenen Aufgabe aktualisiert.

## Projekt in einem Satz

Gilden-Website der WoW-Gilde **rude** (Spineshatter-EU, WoW Forever /
Classic), ausgeliefert als statische Seite über GitHub Pages
(`https://nastyschmo.github.io/AeternumGuildLootAwarder/`), Backend:
Firebase Realtime Database + Firebase Auth (Discord-Login) + Cloudflare
Worker.

## Workflow

- **Claude** entwickelt auf Feature-Branches, committet, pusht und darf
  Pull Requests jederzeit selbst erstellen.
- **Der Merge auf `main` (= Deploy auf GitHub Pages) macht der User.**
  Claude merged nie selbst auf `main`.
- Firebase-Rules, Cloudflare-Worker-Deploys und Konsolen-Einstellungen
  (Firebase, Discord, Cloudflare) macht vorerst ebenfalls der User. Claude
  liefert dafür den Code bzw. eine konkrete Schritt-für-Schritt-Anleitung im
  PR und in `PROJECT.md`.
- **Testen vor dem Merge** über Cloudflare Pages (README § 8): Claude legt
  den Stand eines Feature-Branches per Force-Push auf den Branch `preview`,
  der User testet unter `https://preview.aeternumguildlootawarder.pages.dev/`. `preview`
  ist ein reiner Wegwerf-Branch – nie darauf aufbauen, nie nach `main`
  mergen. Achtung: Die Preview nutzt die Live-Datenbank.
- **Kleine, fokussierte Änderungen**: ein Thema pro PR.
- Jede neue Firebase-Datenpfad-Nutzung **muss** im PR explizit als
  "Rules-Update nötig" markiert werden (siehe Work Log 2026-10-01 – Tests
  laufen gegen ein gemocktes Firebase und fangen fehlende Rules nicht ab).
  Ein neuer Top-Level-Key unter `guild-loot-data` braucht **beide**: einen
  Eintrag in `SYNCED_KEYS` (js/app.js) und eine eigene `.read`-Regel in
  `README.md` § 6f – eine Root-`.read`-Regel gibt es bewusst nicht mehr.
  Ausnahme: Keys, die die Seite nie liest (z. B. `applicationLocks`), kommen
  nicht in `SYNCED_KEYS` und bekommen keine `.read`-Regel.
  Keys, die nur pro Nutzer bzw. per Query gelesen werden (`applications`,
  `bisSets`, `bisOwned`, `bisPublic`, `raidEvents`, `raidSignups`, `raidReserves`), haben eigene Listener statt eines
  `SYNCED_KEYS`-Eintrags, brauchen aber ihre `.read`-Regel.
- Neue Seiten-Origins (eigene Domain usw.) müssen im Worker erlaubt
  werden: `DEFAULT_ALLOWED_ORIGINS` bzw. Worker-Variable `ALLOWED_ORIGINS`.
- Nach jeder abgeschlossenen Aufgabe: `PROJECT.md` aktualisieren
  (Work Log oben ergänzen, offene Tasks/Known Issues pflegen) – im selben PR.

## Sprache

- **UI-Texte: Deutsch** (Zielgruppe sind deutsche Spieler).
- **Fähigkeiten-/Zauber-/Talent-Texte bleiben vorerst Englisch** (Namen und
  Beschreibungen aus Blizzard-/Fremdquellen). Das ist eine
  Übergangslösung, bis Blizzard die API für WoW Forever freigibt – nicht
  übersetzen.
- Code-Kommentare, Commit-Messages und `PROJECT.md`: Englisch (bestehender
  Stil).

## Code-Konventionen

- Aufbau: `index.html` (HTML-Gerüst), `css/main.css` (Styles),
  `data/talentsforever.js` (Spiel-Daten) und `js/*.js` (App-Logik, eine
  Datei pro Bereich: `core.js` → `state.js` → Feature-Dateien → `app.js`
  zuletzt; Reihenfolge siehe `<script>`-Tags in `index.html`, Inhalt siehe
  Kopfkommentar jeder Datei). Alle Scripts sind klassische `<script>`-Tags
  ohne Bundler; ihre Top-Level-Deklarationen teilen sich den globalen
  Scope (keine Namen wählen, die mit `window`-Eigenschaften kollidieren).
- Code, der beim Laden sofort läuft (Event-Listener-Verdrahtung,
  Top-Level-Aufrufe, `const`-Initialisierer), darf nur auf Dateien
  zugreifen, die **vorher** geladen werden. Funktionsrümpfe dürfen alles
  aufrufen. Neue Feature-Dateien vor `app.js` einhängen.
- **TypeScript ohne Build-Schritt:** Typen stehen als JSDoc-Kommentare im
  JS, der Compiler prüft nur (`npm run typecheck`, läuft auch als GitHub
  Action auf jedem PR). Alle Dateien in `js/` und `data/` werden geprüft
  (`checkJs`). DOM-Elemente bei Bedarf casten, z. B.
  `/** @type {HTMLInputElement} */ (el)`; `els.*` ist schon typisiert
  (anhand der Tags in `index.html`). Das Datenmodell (`State`, `Application`,
  `Poll` …) steht in `types/model.d.ts` – bei neuen/entfernten Feldern in
  einem Normalizer dort mitpflegen. Vor jedem Push `npm run typecheck`.
- `data/forever/` wird automatisch erzeugt (README „WoW Forever item
  data“, täglicher Workflow) – nie von Hand bearbeiten; Änderungen am
  Format gehören in `scripts/forever-data/update.mjs`.
- Farben immer über die CSS-Custom-Properties in `:root` (nie hartkodierte
  Hex-Werte), damit das Horde-Theme (`html.theme-horde`) greift.
- Nutzereingaben in HTML immer über `escapeHtml()` bzw. für Rich Text über
  `sanitizeRichText()` ausgeben.
- Keine Secrets ins Repo. Die Firebase-Web-Config ist öffentlich und ok;
  Bot-Token, Service-Account usw. leben nur als Cloudflare-Worker-Secrets.
