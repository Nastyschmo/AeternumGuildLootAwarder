// @ts-check
// "Nicht vergessen" tab of the Levelguide (js/level-guide.js): the things
// that are easy to miss while leveling in WoW Forever — free bags, the camp
// system, the Cozy Sleeping Bag chain, hidden item quests, gold to save —
// sorted by level. Horde and neutral entries only (the guild plays Horde).
// Same content as nasty-gaming's /checklist (apps/community/src/data/
// checklist.ts there); collected from community guides, mostly beta state
// (sources per entry). Edited by hand — bump LEVEL_CHECKLIST_UPDATED.
//
// Loaded as a classic <script> before js/level-guide.js (see index.html).

const LEVEL_CHECKLIST_UPDATED = '2026-11-03';

/**
 * @typedef {{ id: string, level: number, kind: 'bag'|'camp'|'quest'|'secret'|'gold'|'tip'|'pet'|'gear', cls?: string,
 *   title: string, where: string, text: string, steps?: string[], source?: { label: string, url: string } }} LevelCheckItem
 */
/** @type {{ passages: { from: number, to: number }[], items: LevelCheckItem[] }} */
const LEVEL_CHECKLIST = {
  "passages": [
    {
      "from": 1,
      "to": 9
    },
    {
      "from": 10,
      "to": 19
    },
    {
      "from": 20,
      "to": 29
    },
    {
      "from": 30,
      "to": 39
    },
    {
      "from": 40,
      "to": 49
    },
    {
      "from": 50,
      "to": 60
    }
  ],
  "items": [
    {
      "id": "bars",
      "level": 1,
      "kind": "tip",
      "title": "Aktionsleisten selbst bestücken",
      "where": "überall",
      "text": "Seit dem 2. November landen neu gelernte Zauber nicht mehr automatisch in der Aktionsleiste, und neue Taschen werden nicht mehr automatisch angelegt. Nach jedem Lehrer-Besuch das Zauberbuch öffnen und neue Taschen selbst in einen Taschenplatz ziehen.",
      "source": {
        "label": "Blizzard – Development Notes 2. Nov.",
        "url": "https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-%E2%80%93-updated-november-2/2360696"
      }
    },
    {
      "id": "start-bag",
      "level": 1,
      "kind": "bag",
      "title": "Gratis-Tasche im Startgebiet",
      "where": "jedes Startgebiet",
      "text": "Jedes Startgebiet hat eine Quest mit einer 6-Platz-Tasche, meist bis Stufe 7 (auf Zephyr Isle z. B. die Simple Leather Satchel). Nicht weiterziehen, bevor Du sie hast.",
      "source": {
        "label": "conquestcapped – Startgebiete",
        "url": "https://conquestcapped.com/guides/wow-forever/wow-forever-starting-zones/"
      }
    },
    {
      "id": "gather-early",
      "level": 1,
      "kind": "tip",
      "title": "Sammelberuf früh lernen",
      "where": "jedes Startgebiet",
      "text": "In den Startgebieten gibt es Junior-Lehrer bzw. ein Quest-Item für einen Sammelberuf. Früh mitnehmen – Kräuter, Erze und Leder bringen beim Leveln Gold und brauchst Du später fürs Lager.",
      "source": {
        "label": "conquestcapped – Startgebiete",
        "url": "https://conquestcapped.com/guides/wow-forever/wow-forever-starting-zones/"
      }
    },
    {
      "id": "item-quests",
      "level": 1,
      "kind": "secret",
      "title": "Items mit Quest-Symbol anklicken",
      "where": "überall",
      "text": "Viele neue Forever-Quests starten nicht bei einem NPC, sondern über ein Item aus der Beute. Alles mit Quest-Symbol in den Taschen sofort anklicken. Grüne Quests lohnen sich weiterhin (öffnen oft die nächste Stufe einer Kette), graue kannst Du abbrechen.",
      "source": {
        "label": "conquestcapped – Quest-Items",
        "url": "https://conquestcapped.com/guides/wow-forever/wow-forever-quest-items/"
      }
    },
    {
      "id": "gustjumper",
      "level": 1,
      "kind": "pet",
      "title": "Musical Gustjumper (Begleiter)",
      "where": "Zephyr Isle 51.5, 72.1",
      "text": "Bei 51.5, 72.1 auf Zephyr Isle fünf Fröschen etwas vorsingen – Belohnung ist ein Begleiter-Haustier.",
      "source": {
        "label": "wowdb.wiki – Secrets",
        "url": "http://wowdb.wiki/forever/guides/secrets-and-hidden-quests"
      }
    },
    {
      "id": "great-outdoors",
      "level": 5,
      "kind": "camp",
      "title": "The Great Outdoors – Lagerfeuer freischalten",
      "where": "Startgebiet / Kochlehrer",
      "text": "Ab etwa Stufe 5: An ein Lagerfeuer setzen, dann zum Kochlehrer für Dein erstes Basic Campfire. Ohne diese Quest gibt es keine Lager-Buffs.",
      "steps": [
        "Quest „The Great Outdoors“ annehmen",
        "An einem Lagerfeuer Platz nehmen",
        "Beim Kochlehrer das Basic Campfire lernen (Simple Wood + Flint and Tinder in der Tasche)"
      ],
      "source": {
        "label": "Blizzard Watch – Campfire",
        "url": "https://blizzardwatch.com/2026/09/15/need-know-wow-forevers-campfire-system-works/"
      }
    },
    {
      "id": "camp-objects",
      "level": 10,
      "kind": "camp",
      "title": "Lager-Objekte bauen (Berufe auf 20)",
      "where": "Berufslehrer",
      "text": "Ab Berufsskill 20 lernst Du beim Lehrer das Lager-Objekt Deines Berufs. Die Buffs bekommst Du, wenn Du etwa eine Minute am Feuer sitzt; jedes Objekt hat 1 Std. Abklingzeit, jeder Spieler stellt eins. In der Gruppe aufteilen!",
      "steps": [
        "Camp Chair (Kürschnerei): +2 % Crit – nicht mit Moonkin Aura",
        "Fish Bowl (Angeln): +8 % alle Werte – nicht mit Blessing of Kings",
        "Lodestone (Bergbau): Angriffskraft – nicht mit Blessing of Might",
        "Größeres Lagerfeuer (Kochen 90 / 200) hält mehr Objekte"
      ],
      "source": {
        "label": "ForeverChanges – Camping",
        "url": "https://foreverchanges.pro/professions/camping"
      }
    },
    {
      "id": "cozy-bag",
      "level": 14,
      "kind": "quest",
      "title": "Cozy Sleeping Bag – die versteckte Questreihe",
      "where": "Westfall / Brachland → Stonetalon → Loch Modan → Hillsbrad",
      "text": "Die wichtigste versteckte Kette: kein Questgeber, Start über ein Objekt. Belohnungen: der Schlafsack (Rasten darin gibt bis zu 3 % mehr Erfahrung für 2 Std.), laut Guides 12-Platz-Taschen unterwegs (Sturdy Lunchbox, Old Toolbox) und Holz + Feuerstein fürs Lagerfeuer.",
      "steps": [
        "Horde: „Burned-Out Remains“ am abgebrannten Turm südlich von Camp Taurajo (Brachland)",
        "Stonetalon: verlassenes Lager nordöstlich von Sun Rock Retreat (ca. 40.7, 52.5) – „Pocket Litter“ an der Kiste beim Zelt",
        "Nördlich den Hügel hoch: „Mound of Dirt“ anklicken",
        "Weiter über Loch Modan und Hillsbrad Foothills",
        "Thoradin's Wall: „Messenger Bag“, dann „Hastily Rolled-Up Satchel“ – fertig",
        "Optional: „Rekindle“ am Lagerfeuer im verlassenen Lager"
      ],
      "source": {
        "label": "Method",
        "url": "https://www.method.gg/wow-forever/how-to-unlock-the-cozy-sleeping-bag-in-wow-forever"
      }
    },
    {
      "id": "lordaeron",
      "level": 15,
      "kind": "quest",
      "title": "Ruins of Lordaeron – Dungeon-Quests",
      "where": "Ruins of Lordaeron",
      "text": "Die Quests für den neuen Dungeon brauchen seit dem 2. November einheitlich Stufe 15. Vorher abholen, bevor Du eine Gruppe suchst.",
      "source": {
        "label": "Blizzard – Development Notes 2. Nov.",
        "url": "https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-%E2%80%93-updated-november-2/2360696"
      }
    },
    {
      "id": "books",
      "level": 15,
      "kind": "secret",
      "title": "Bibliotheks-Bücher sammeln",
      "where": "ganz Azeroth, Bibliotheken in den Hauptstädten",
      "text": "40 Bücher liegen in der Welt verteilt. Für 10 gibt es eine Halskette, für 20 einen Ring – Magier schalten zusätzlich Research frei. Nebenbei mitnehmen, wann immer Du eins siehst.",
      "source": {
        "label": "wowclassicforever.info",
        "url": "https://wowclassicforever.info/secrets/"
      }
    },
    {
      "id": "coldflame",
      "level": 21,
      "kind": "gear",
      "cls": "mage",
      "title": "Coldflame Saber (Magier)",
      "where": "Scroll of the Saber + Blade of Silverlaine",
      "text": "Die Scroll of the Saber macht aus der Blade of Silverlaine einen Säbel mit 98 Feuerschaden gegen eingefrorene Ziele – stark für Frost.",
      "source": {
        "label": "wowdb.wiki – Secrets",
        "url": "http://wowdb.wiki/forever/guides/secrets-and-hidden-quests"
      }
    },
    {
      "id": "skywatcher",
      "level": 23,
      "kind": "bag",
      "title": "12-Platz-Tasche vom Skywatcher Plateau",
      "where": "Skywatcher Plateau",
      "text": "Ab etwa Stufe 23 gibt es hier eine Quest mit einer normalen 12-Platz-Tasche – das klare Taschen-Ziel in der Mitte des Levelns.",
      "source": {
        "label": "conquestcapped – Taschen",
        "url": "https://conquestcapped.com/guides/wow-forever/wow-forever-bag-guide/"
      }
    },
    {
      "id": "mount-gold",
      "level": 30,
      "kind": "gold",
      "title": "Gold fürs Reittier zurücklegen",
      "where": "überall",
      "text": "Mit 40 kostet das Reittier 100 Gold. Dazu kommt das Training: alle Klassenzauber von 1 bis 60 kosten seit dem 2. November zusammen etwa 206–207 Gold. Ab jetzt nichts Unnötiges mehr im Auktionshaus kaufen.",
      "source": {
        "label": "Blizzard – Development Notes 2. Nov.",
        "url": "https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-%E2%80%93-updated-november-2/2360696"
      }
    },
    {
      "id": "mount",
      "level": 40,
      "kind": "gold",
      "title": "Reiten lernen",
      "where": "Reitlehrer Deines Volkes",
      "text": "Stufe 40: Reiten lernen und das erste Reittier kaufen (100 Gold)."
    },
    {
      "id": "raids",
      "level": 60,
      "kind": "tip",
      "title": "Raids kommen etwa einen Monat nach dem Launch",
      "where": "–",
      "text": "Laut Blizzard öffnen die Raids rund einen Monat nach dem Launch; bis dahin sind keine großen Klassen-Änderungen geplant. Zeit für Dungeon-Ausrüstung, Berufe und Ruf.",
      "source": {
        "label": "Blizzard – Development Notes 2. Nov.",
        "url": "https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-%E2%80%93-updated-november-2/2360696"
      }
    }
  ]
};
