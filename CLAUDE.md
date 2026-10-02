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
- **Kleine, fokussierte Änderungen**: ein Thema pro PR.
- Jede neue Firebase-Datenpfad-Nutzung **muss** im PR explizit als
  "Rules-Update nötig" markiert werden (siehe Work Log 2026-10-01 – Tests
  laufen gegen ein gemocktes Firebase und fangen fehlende Rules nicht ab).
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

- Aktuell steckt die gesamte App in `index.html` (HTML + CSS + JS). Geplant
  ist ein schrittweises Aufteilen in mehrere Dateien – bis dahin Änderungen
  im bestehenden Stil halten.
- Farben immer über die CSS-Custom-Properties in `:root` (nie hartkodierte
  Hex-Werte), damit das Horde-Theme (`html.theme-horde`) greift.
- Nutzereingaben in HTML immer über `escapeHtml()` bzw. für Rich Text über
  `sanitizeRichText()` ausgeben.
- Keine Secrets ins Repo. Die Firebase-Web-Config ist öffentlich und ok;
  Bot-Token, Service-Account usw. leben nur als Cloudflare-Worker-Secrets.
