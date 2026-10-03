// "How to play" per class and spec — a curated best-of from public WoW
// Forever guides (sources listed per class), written in our own words and
// checked against the live talent data (data/forever/talents.js): every
// talent named here exists in that tree. Shown on the Class Overview page
// (js/how-to-play.js), which links each spec to the Talent Builder, the
// BiS planner and the recommended / public builds. Ability, talent and
// spell names stay English (they get the same hover tooltips as the Deep
// Dive texts); everything else is German. Edited by hand via PR — bump
// HOW_TO_PLAY_UPDATED when the content changes.

const HOW_TO_PLAY_UPDATED = '2026-10-03';

/** @type {Record<string, HowToPlayClass>} */
const HOW_TO_PLAY = {
  warrior: {
    intro: 'Plattenträger mit Wut als Ressource: Wut entsteht, wenn Du Schaden austeilst oder einsteckst. Forever gibt jedem Baum neue Werkzeuge – Arms spielt um Rend und Overpower (Bloodthrill), Fury lässt Whirlwind mit beiden Waffen zuschlagen (Raging Blows), Protection macht mit Bastion auch Schaden.',
    leveling: 'Arms mit Zweihänder ist der bequemste Weg: hoher Einzelschaden, Sweeping Strikes gegen Gruppen und viele Overpower-Procs über Bloodthrill. Fury lohnt sich erst mit zwei guten Waffen, meist ab Dungeon-Ausrüstung. Einen Schild für Dungeons mitnehmen – Tanks werden immer gesucht.',
    races: 'Alle Völker können Warrior spielen. Für Schaden sind Völker mit Angriffs- oder Waffen-Racials beliebt, für Tanks solche mit Stamina- bzw. Verteidigungs-Boni. Die Racials im Detail: Talent Builder → Völker.',
    specs: {
      arms: {
        summary: 'Zweihand-Nahkämpfer mit dem stärksten Dauerschaden beim Questen; Mortal Strike halbiert zusätzlich die Heilung auf dem Ziel (PvP).',
        playstyle: 'Rend auf dem Ziel halten – mit Bloodthrill können Deine Haupthand-Schläge dann Overpower freischalten. Mortal Strike auf Cooldown, überschüssige Wut in Slam (Improved Slam: kein Swing-Reset mehr) oder Heroic Strike.',
        priority: [
          'Mit Charge eröffnen (Improved Charge: mehr Wut)',
          'Rend aufrechterhalten',
          'Mortal Strike auf Cooldown',
          'Overpower, sobald verfügbar',
          'Execute unter 20 % Leben',
          'Slam bzw. Heroic Strike als Wut-Ablage'
        ],
        stats: 'Hit bis zum Cap, dann Strength/Attack Power und Crit. Das wichtigste Item ist eine Zweihandwaffe mit hohem Schaden.',
        tips: [
          'Weaponmaster hängt vom Waffentyp ab: Axt/Stangenwaffe = Crit, Streitkolben/Stab = Rüstung ignorieren, Schwert = Extra-Angriffe.',
          'Sweeping Strikes vor Gruppen-Pulls zünden.',
          'Spearing Strike macht Extraschaden gegen Riesen, Drachkin und berittene Gegner.'
        ]
      },
      fury: {
        summary: 'Beidhändiger Nahkämpfer – im Raid meist der stärkste physische Schaden, braucht aber gute Ausrüstung.',
        playstyle: 'Bloodthirst auf Cooldown, Whirlwind trifft mit Raging Blows auch mit der Nebenhand. Flurry hält die Angriffsgeschwindigkeit hoch, Death Wish ist Dein Burst. Wut-Überschuss geht in Heroic Strike, bei mehreren Zielen in Cleave.',
        priority: [
          'Battle Shout aktiv halten',
          'Bloodthirst auf Cooldown',
          'Whirlwind auf Cooldown',
          'Execute unter 20 % Leben',
          'Heroic Strike / Cleave bei Wut-Überschuss',
          'Death Wish zusammen mit anderen Cooldowns'
        ],
        stats: 'Hit bis zum Cap ist Pflicht (beidhändig verfehlst Du sonst sehr oft), dann Strength/Attack Power und Crit (Flurry).',
        tips: [
          'Boundless Rage erhöht die maximale Wut um 30 – weniger Verschwendung in Burst-Phasen.',
          'Bloodthirst gibt zusätzlich 10 % Laufgeschwindigkeit.',
          'Fury levelt zäh – erst mit ordentlicher Dungeon-Ausrüstung wechseln.'
        ]
      },
      protection: {
        summary: 'Schild-Tank. Bastion (+10 % Schaden mit Schild) macht Protection in Forever auch beim Questen brauchbar.',
        playstyle: 'Defensive Stance mit Schild. Shield Slam erzeugt sehr viel Bedrohung und skaliert mit Block Value, Revenge kommt nach Block/Dodge/Parry, Sunder Armor liegt auf dem Hauptziel. Wut bekommst Du zusätzlich über Shield Specialization und Master of Defense.',
        priority: [
          'Shield Slam auf Cooldown',
          'Revenge, sobald verfügbar',
          'Sunder Armor stapeln bzw. auffrischen',
          'Shield Block gegen harte Nahkampftreffer',
          'Thunder Clap und Demoralizing Shout bei mehreren Gegnern',
          'Heroic Strike / Cleave bei Wut-Überschuss'
        ],
        stats: 'Im Raid Defense und Stamina, dann Block Value (Shield Slam) und Hit für zuverlässige Bedrohung. In Dungeons reichen meist Stamina und Hit.',
        tips: [
          'Vanguard erlaubt Charge in Defensive Stance – sehr angenehm beim Pullen.',
          'Last Stand und Shield Wall (Improved Shield Wall: viel kürzerer Cooldown) sind Deine Notfallknöpfe.',
          'Concussion Blow und Shield Bash (Improved Shield Bash: Silence) zum Unterbrechen.'
        ]
      }
    },
    sources: [
      { label: 'Icy Veins – WoW Forever Class Guides', url: 'https://www.icy-veins.com/wow-forever/all-class-guides' },
      { label: 'Warcraft Tavern – Warrior', url: 'https://www.warcrafttavern.com/forever/guides/warrior/' },
      { label: 'classicwow.gg – Warrior Overview', url: 'https://classicwow.gg/forever/guides/warrior' },
      { label: 'Mobalytics – Protection Warrior', url: 'https://mobalytics.gg/wow-forever/profile/phaseshifter/classes/protection-warrior' },
      { label: 'wowforever.games – Warrior Guide', url: 'https://www.wowforever.games/129.html' }
    ]
  },

  paladin: {
    intro: 'Plattenträger mit Heilung und Siegeln. Neu in Forever: Holy Strike (ab Stufe 6) für alle Specs, Seal of Fury für Tanks, Templar\'s Bulwark – und die Horde bekommt mit den Untoten ihre ersten Paladine.',
    leveling: 'Retribution mit Zweihänder ist der natürliche Leveling-Spec. Holy Strike macht die ersten Stufen deutlich aktiver als im alten Classic. Siegel-Wechsel mit Twist of Light lohnt sich erst später.',
    races: 'Mensch, Zwerg und – neu – Untote.',
    specs: {
      holy: {
        summary: 'Mana-effizienter Heiler mit starker Einzelziel-Heilung.',
        playstyle: 'Holy Light für große Heilungen, Flash of Light für effizientes Nachheilen, Holy Shock für Sofort-Heilung. Illumination gibt bei kritischen Heilungen Mana zurück – Crit ist also auch Mana. Light\'s Vigil (31er-Talent) auf den Tank legen: Der nächste Holy Shock auf ihn hat keinen Cooldown und heilt auch seine Gruppe.',
        priority: [
          'Light\'s Vigil auf dem Tank halten',
          'Holy Shock bei akutem Schaden',
          'Flash of Light als effizienter Standard-Heal',
          'Holy Light nach Infusion of Light oder bei hohem Schaden',
          'Divine Favor für einen garantierten Crit im Notfall',
          'Cleanse gegen Gifte, Krankheiten und Magie'
        ],
        stats: 'Healing Power, Intellect und Crit (Illumination). Reverence lässt 30 % der Manaregeneration beim Zaubern weiterlaufen.',
        tips: [
          'Spiritual Focus schützt Deine Zauber vor Verzögerung durch Schaden.',
          'Voice of Truth macht 6 Sek. immun gegen Silence und Unterbrechungen – gegen Caster Gold wert.'
        ]
      },
      protection: {
        summary: 'Schild-Tank mit Absorb-Schilden und starker Gruppen-Bedrohung.',
        playstyle: 'Righteous Fury an, Seal of Fury liefert einen Absorb-Schild. Holy Shield aufrechterhalten, Consecration gegen Gruppen; Holy Strike senkt mit Iron Creed zusätzlich Deinen erlittenen Schaden. Templar\'s Bulwark ist ein Schild in Höhe Deines maximalen Lebens.',
        priority: [
          'Righteous Fury aktiv',
          'Holy Shield aufrechterhalten',
          'Holy Strike auf Cooldown (Iron Creed: −10 % Schaden)',
          'Consecration bei mehreren Gegnern',
          'Judgement – Swift Judgement setzt den Cooldown zurück',
          'Templar\'s Bulwark als großer Notfall-Schild'
        ],
        stats: 'Defense, Stamina und Block Value; Intellect gegen Mana-Probleme (Shield Specialization gibt beim Blocken Mana zurück).',
        tips: [
          'Templar\'s Bulwark löst Forbearance aus – nicht direkt nach Divine Shield nutzbar.',
          'Improved Righteous Fury senkt den erlittenen Schaden um 6 %.',
          'Reckoning gibt Extra-Angriffe nach Blocks und Crits gegen Dich.'
        ]
      },
      retribution: {
        summary: 'Zweihand-Nahkämpfer mit Holy-Schaden – der beste Paladin-Spec zum Questen.',
        playstyle: 'Seal of Command aktiv, Judgement auf Cooldown, Holy Strike – mit Sacred Arbiter frischt er alle Judgements auf. Twist of Light (31er) belohnt Siegel-Wechsel: Das alte Siegel hinterlässt ein Echo, das mit dem nächsten Schlag noch einmal wirkt.',
        priority: [
          'Siegel aktiv (meist Seal of Command)',
          'Judgement auf Cooldown',
          'Holy Strike auf Cooldown',
          'Siegel nach dem Judgement neu setzen bzw. wechseln (Twist of Light)',
          'Exorcism und Hammer of Wrath (Execute-Phase)',
          'Consecration bei mehreren Gegnern'
        ],
        stats: 'Hit bis zum Cap, Strength/Attack Power und Crit. Champion of the Light macht Intellect zu Zauberschaden. Hit und Crit sind in Forever je ein gemeinsamer Wert für Nahkampf und Zauber.',
        tips: [
          'Benediction und Holy Conduit halten das Mana stabil.',
          'Repentance ist Dein Crowd Control gegen Humanoide.',
          'Instrument of Law senkt Deine Bedrohung, solange Righteous Fury aus ist.'
        ]
      }
    },
    sources: [
      { label: 'lfcarry – Paladin Guide', url: 'https://lfcarry.com/guides/wow-forever-paladin' },
      { label: 'mythic-store – Paladin: alle Änderungen', url: 'https://mythic-store.com/blog/wow-forever-paladin-guide-every-change-explained' },
      { label: 'leprestore – Retribution Paladin', url: 'https://leprestore.com/guides/world-of-warcraft-forever/wow-forever-retribution-paladin-guide-best-builds-race-professions/' },
      { label: 'leprestore – Protection Paladin', url: 'https://leprestore.com/guides/world-of-warcraft-forever/wow-forever-protection-paladin-guide-best-builds-race-professions/' },
      { label: 'wowforever.games – Paladin Guide', url: 'https://www.wowforever.games/126.html' }
    ]
  },

  hunter: {
    intro: 'Fernkämpfer mit Begleiter – und in Forever mit drei echt unterschiedlichen Spielweisen: Pet plus Falken (Beast Mastery), ohne Pet mit Lone Wolf (Marksmanship) oder richtiger Nahkampf mit Fallen und Tritten (Survival). Neu: Menschen können Jäger werden.',
    leveling: 'Beast Mastery ist der stärkste Leveling-Spec: Das Pet tankt, Du schießt. Zähme früh ein gutes Pet und halte es mit Mend Pet am Leben.',
    races: 'Mensch (neu), Zwerg, Nachtelf, Orc, Taure, Troll und Skyborne – alle außer Gnom und Untoten.',
    specs: {
      beast_mastery: {
        summary: 'Pet-Spec: Das Tier tankt beim Questen und macht einen großen Teil des Schadens.',
        playstyle: 'Pet aufs Ziel, Hunter\'s Mark, dann aus der Distanz schießen. Summon Hawk (teilt sich den Cooldown mit Arcane Shot) schickt bis zu zwei Falken los, Bestial Wrath ist Dein Burst. Focused Fire gibt Dir und dem Pet +2 % Schaden, solange es aktiv ist.',
        priority: [
          'Hunter\'s Mark',
          'Pet angreifen lassen, kurz Bedrohung aufbauen',
          'Summon Hawk statt Arcane Shot (max. 2 Falken)',
          'Serpent Sting bei längeren Kämpfen',
          'Bestial Wrath auf Cooldown',
          'Auto Shot laufen lassen, Multi-Shot bei mehreren Gegnern'
        ],
        stats: 'Agility, Attack Power und Hit; Crit lohnt sich auch fürs Pet (Ferocity, Frenzy).',
        tips: [
          'Intimidation betäubt das Ziel – die Notbremse, wenn ein Gegner zu Dir rennt.',
          'Spirit Bond heilt Dich und das Pet nebenbei.',
          'Bestial Discipline lässt 50 % Deiner Manaregeneration beim Zaubern weiterlaufen.'
        ]
      },
      marksmanship: {
        summary: 'Reiner Fernkampf-Spec, laut Guides der stärkste Hunter-Schaden im Raid.',
        playstyle: 'Mit oder ohne Pet: Lone Wolf gibt +20 % Schaden, solange kein Pet aktiv ist. Trueshot Aura für die Gruppe, Serpent Sting plus Rapid Killing/Rapid Recuperation für Mana und Burst, Sniper Shot als großer Treffer mit Extra-Reichweite.',
        priority: [
          'Trueshot Aura aktiv',
          'Serpent Sting auf dem Ziel (Rapid Recuperation)',
          'Sniper Shot auf Cooldown',
          'Aimed Shot bzw. Arcane Shot (Improved Arcane Shot: kürzerer Cooldown)',
          'Multi-Shot bei mehreren Gegnern',
          'Rapid Fire für Burst'
        ],
        stats: 'Agility und Hit bis zum Cap, dann Crit (Mortal Shots). Careful Aim macht Intellect zu Attack Power.',
        tips: [
          'Ohne Pet (Lone Wolf) bist Du verwundbarer – Scatter Shot und Fallen bewusst einsetzen.',
          'Hawk Eye und Sniper Shot erlauben sehr große Distanzen.'
        ]
      },
      survival: {
        summary: 'Nahkampf-Jäger mit Fallen, Tritten und Blutungen – in Forever komplett überarbeitet.',
        playstyle: 'Hunter\'s Mark aufs Ziel und in den Nahkampf: Expose Prey schaltet Mongoose Bite frei, Lacerating Strikes legt damit eine Blutung. Strider Kick für Schaden und Tempo, Counterattack nach einem Parieren. Predator\'s Edge erhöht den Nebenhand-Schaden um 50 %.',
        priority: [
          'Hunter\'s Mark',
          'Mongoose Bite, sobald aktiv',
          'Strider Kick auf Cooldown',
          'Raptor Strike',
          'Counterattack nach einem Parieren',
          'Fallen gegen Gruppen (Clever Traps)'
        ],
        stats: 'Agility (Lightning Reflexes +10 %), Hit und Crit (Predator\'s Edge).',
        tips: [
          'Deterrence mit Survivalist\'s Discipline für Notfälle.',
          'Resourcefulness senkt die Manakosten Deiner Nahkampf-Fähigkeiten und Fallen stark.',
          'Survival ist der neueste und am wenigsten erprobte Spec – die Guides sind sich noch uneinig.'
        ]
      }
    },
    sources: [
      { label: 'Icy Veins – Marksmanship Hunter', url: 'https://www.icy-veins.com/wow-forever/marksmanship-hunter-ranged-dps-pve-guide' },
      { label: 'Mobalytics – Survival Hunter', url: 'https://mobalytics.gg/wow-forever/classes/survival-hunter-guide' },
      { label: 'classicwow.gg – Hunter Overview', url: 'https://classicwow.gg/forever/guides/hunter' },
      { label: 'leprestore – Hunter Overview', url: 'https://leprestore.com/guides/world-of-warcraft-forever/wow-forever-hunter-guide-overview/' },
      { label: 'wowforever.games – Hunter Guide', url: 'https://www.wowforever.games/120.html' }
    ]
  },

  rogue: {
    intro: 'Energie-Nahkämpfer mit Combo-Punkten, Giften und Stealth. Neu: Mutilate und Venom (Assassination), Thousand Cuts rund um Rupture (Subtlety).',
    leveling: 'Combat ist der einfachste Leveling-Weg: wenig Vorbereitung, Sinister Strike und Eviscerate, jede Waffe geht. Ab Stufe 20 Gifte nicht vergessen.',
    races: 'Alle Völker außer Tauren.',
    specs: {
      assassination: {
        summary: 'Gift-Spec mit Dolchen – laut aktuellen Sims der stärkste Rogue-Schaden auf Stufe 60.',
        playstyle: 'Instant Poison auf die Haupthand, Deadly Poison auf die Nebenhand. Mutilate (zwei Dolche, 2 Combo-Punkte, +20 % gegen vergiftete Ziele) baut auf, Seal Fate gibt bei Crits Extra-Punkte. Slice and Dice und Venom aufrechterhalten, übrige Punkte in Eviscerate.',
        priority: [
          'Slice and Dice aktiv',
          'Venom aktiv',
          'Eviscerate, wenn beide Buffs laufen',
          'Mutilate zum Punkte-Aufbau',
          'Cold Blood für einen sicheren Crit'
        ],
        stats: 'Hit bis zum Cap (auch die Gifte müssen treffen), Agility/Attack Power und Crit (Seal Fate).',
        tips: [
          'Mutilate braucht Dolche in beiden Händen.',
          'Improved Poisons lässt Gift-Aufladungen oft nicht verbrauchen.',
          'Relentless Strikes gibt Energie zurück – Finisher mit 5 Punkten lohnen sich.'
        ]
      },
      combat: {
        summary: 'Unkomplizierter Dauerschaden mit freier Waffenwahl.',
        playstyle: 'Sinister Strike baut Punkte auf, Slice and Dice bleibt aktiv, Eviscerate ist der Finisher. Hack and Slash belohnt je nach Waffe (Schwert/Axt: Extra-Angriffe, Dolch/Faust: Crit). Blade Flurry und Adrenaline Rush für Burst und Gruppen.',
        priority: [
          'Slice and Dice aktiv',
          'Sinister Strike bis 5 Punkte',
          'Eviscerate',
          'Blade Flurry bei 2+ Gegnern',
          'Adrenaline Rush für Burst',
          'Riposte nach einem Parieren'
        ],
        stats: 'Hit bis zum Cap, Agility/Attack Power und Crit. Weapon Expertise senkt die Chance, dass Gegner ausweichen oder parieren.',
        tips: [
          'Improved Kick silenced zusätzlich 2 Sek.',
          'Endurance verkürzt die Cooldowns von Sprint und Evasion deutlich.'
        ]
      },
      subtlety: {
        summary: 'Stealth- und Kontroll-Spec rund um Rupture und Hemorrhage.',
        playstyle: 'Aus Stealth mit Premeditation und Ambush (oder Cheap Shot/Garrote) eröffnen, dann Rupture aufrechthalten. Rupture-Ticks verbilligen über Thousand Cuts Hemorrhage bzw. Backstab, Hemorrhage erhöht wiederum den Rupture-Schaden. Preparation setzt Vanish und Co. zurück.',
        priority: [
          'Eröffnen: Premeditation + Ambush (oder Cheap Shot/Garrote)',
          'Rupture aktiv halten',
          'Hemorrhage (mit Dolch auch Backstab) zum Aufbau',
          'Slice and Dice',
          'Eviscerate mit übrigen Punkten',
          'Vanish → Ambush, Preparation für eine zweite Runde'
        ],
        stats: 'Agility/Attack Power, Hit und Crit; Serrated Blades ignoriert Rüstung.',
        tips: [
          'Stark im PvP und solo, weil Du Kämpfe aus Stealth kontrollierst.',
          'Cutthroat: Backstab kann Ambush ohne Stealth freischalten.'
        ]
      }
    },
    sources: [
      { label: 'Method – Rogue Leveling & Talents', url: 'https://www.method.gg/wow-forever/wow-forever-rogue-leveling-guide-and-talents' },
      { label: 'Mobalytics – Assassination Rogue', url: 'https://mobalytics.gg/wow-forever/classes/assassination-rogue-guide' },
      { label: 'classicwow.gg – Rogue Overview', url: 'https://classicwow.gg/forever/guides/rogue' },
      { label: 'brokenmeta.gg – Subtlety Rogue', url: 'https://brokenmeta.gg/en/wow-forever/guides/rogue/subtlety/' },
      { label: 'leprestore – Rogue Overview', url: 'https://leprestore.com/guides/world-of-warcraft-forever/wow-forever-rogue-guide-overview/' }
    ]
  },

  priest: {
    intro: 'Stoffträger mit Heilung, Schilden und Schattenmagie. Neu: Penance (Discipline), Prayer of Mending (Holy), Shadow Word: Death für alle und ein überarbeitetes Shadowform. Gnome können jetzt Priester werden.',
    leveling: 'Shadow ist der Leveling-Spec: DoTs, Mind Blast und Mind Flay; Spirit Tap füllt nach jedem Kill das Mana schnell wieder auf. Mit Wand Specialization überbrückt der Zauberstab leere Mana-Phasen.',
    races: 'Mensch, Zwerg, Nachtelf, Gnom (neu), Untote und Troll. Priester haben in Forever zusätzlich volksspezifische Zauber.',
    specs: {
      discipline: {
        summary: 'Schild- und Penance-Heiler: verhindert Schaden, bevor er entsteht.',
        playstyle: 'Power Word: Shield auf das Ziel, das Schaden nimmt (Soul Warding: kürzerer Cooldown), Penance zum Heilen oder für Holy-Schaden. Renewed Hope gibt mehr Crit auf Ziele mit Weakened Soul, Divine Aegis legt bei Crits zusätzliche Schilde. Power Infusion an einen Caster verteilen.',
        priority: [
          'Power Word: Shield auf das Ziel, das Schaden nimmt',
          'Penance auf Cooldown',
          'Flash Heal / Greater Heal auf Ziele mit Weakened Soul (Renewed Hope)',
          'Inner Focus für einen kostenlosen großen Heal',
          'Power Infusion an den stärksten Caster'
        ],
        stats: 'Healing Power, Intellect (Mental Strength +15 %) und Crit (Divine Aegis); Meditation macht Spirit/MP5 auch im Kampf nützlich.',
        tips: [
          'Mit Holy Fire und Power in Light machen Smite und Penance mehr Schaden – Disc kann auch solo ordentlich Schaden machen.',
          'Twin Disciplines verstärkt alle Sofortzauber.'
        ]
      },
      holy: {
        summary: 'Gruppen- und Raid-Heiler mit springenden und reaktiven Heilungen.',
        playstyle: 'Prayer of Mending auf Cooldown, Renew auf Tanks, Heal/Greater Heal (Divine Fury: kürzere Zauberzeit) für große Lücken, Binding Heal, wenn Du selbst auch Schaden hast, Prayer of Healing bzw. Holy Nova gegen Gruppen-Schaden. Litany of Light belohnt, verschiedene Heilzauber abzuwechseln.',
        priority: [
          'Prayer of Mending auf Cooldown',
          'Renew auf dem Tank',
          'Heal / Greater Heal bei großem Schaden',
          'Flash Heal für die schnelle Rettung',
          'Binding Heal, wenn Du selbst auch Schaden hast',
          'Prayer of Healing bei Gruppen-Schaden'
        ],
        stats: 'Healing Power, Spirit (Spiritual Guidance), Intellect und Crit.',
        tips: [
          'Heilzauber abwechseln (Litany of Light) spart Mana.',
          'Spirit of Redemption: Nach dem Tod heilst Du noch 15 Sek. weiter.'
        ]
      },
      shadow: {
        summary: 'Fernkampf-Schaden mit DoTs und hoher Mana-Effizienz.',
        playstyle: 'Shadowform halbiert die Manakosten Deiner Schattenzauber. Shadow Word: Pain und Devouring Plague aufrechterhalten, Mind Blast auf Cooldown, Mind Flay als Füller, Shadow Word: Death zum Abschluss – Vorsicht: Überlebt das Ziel, bekommst Du Rückstoß-Schaden. Shadow Weaving baut sich von selbst auf.',
        priority: [
          'Shadowform',
          'Shadow Word: Pain aktiv',
          'Devouring Plague (Devouring Contagion: springt beim Tod weiter)',
          'Mind Blast auf Cooldown',
          'Shadow Word: Death unter 20 % Leben (Early Demise)',
          'Mind Flay als Füller'
        ],
        stats: 'Hit bis zum Cap, Spell Power (Shadow), Intellect und Crit.',
        tips: [
          'Vampiric Embrace heilt Deine Gruppe mit.',
          'Silence unterbricht feindliche Caster.',
          'Spirit Tap füllt nach Kills schnell das Mana auf – ideal fürs Questen.'
        ]
      }
    },
    sources: [
      { label: 'classicwow.gg – Priest Overview', url: 'https://classicwow.gg/forever/guides/priest' },
      { label: 'wowclassicforever.info – Priest', url: 'https://wowclassicforever.info/classes/priest/' },
      { label: 'conquestcapped – Priest Talents', url: 'https://conquestcapped.com/guides/wow-forever/wow-forever-priest-talents/' },
      { label: 'endgametools – Priest Changes', url: 'https://endgametools.com/en/wow-forever/news/wow-forever-priest' }
    ]
  },

  shaman: {
    intro: 'Hybrid aus Totems, Elementarmagie und Nahkampf. Neu: Lava Burst, Maelstrom Weapon, Riptide und Water Shield – und Zwerge können Schamanen werden, damit gibt es sie erstmals auch bei der Allianz.',
    leveling: 'Enhancement ist der klassische Leveling-Weg: Nahkampf plus Shocks, wenig Pausen. Elemental funktioniert mit Lava Burst deutlich besser als früher, braucht aber mehr Mana.',
    races: 'Zwerg (neu), Orc, Taure, Troll und Skyborne.',
    specs: {
      elemental: {
        summary: 'Caster mit Feuer und Blitzen – Lava Burst ist das neue Herzstück.',
        playstyle: 'Flame Shock aufs Ziel, dann Lava Burst (+20 % Schaden mit Flame Shock), Lightning Bolt als Füller, Chain Lightning gegen Gruppen. Elemental Fury verdoppelt den Crit-Bonus, Lightning Overload zaubert gratis nach.',
        priority: [
          'Totems passend zur Gruppe',
          'Flame Shock aktiv',
          'Lava Burst auf Cooldown',
          'Lightning Bolt als Füller',
          'Chain Lightning bei mehreren Gegnern',
          'Earth Shock zum Unterbrechen'
        ],
        stats: 'Hit bis zum Cap, Spell Power, Crit und Intellect/MP5.',
        tips: [
          'Elemental Focus (Clearcasting) spart Mana.',
          'Earthbound: Earthbind Totem wurzelt Gegner beim Setzen fest.'
        ]
      },
      enhancement: {
        summary: 'Nahkampf mit Zaubern zwischendurch. Mit Rockbiter Weapon und Spirit Weapons laut Guides auch als Tank denkbar – aber noch kaum erprobt.',
        playstyle: 'Windfury Weapon (oder Flametongue), Stormstrike auf Cooldown, danach ein verstärkter Shock. Maelstrom Weapon stapelt sich durch Nahkampftreffer bis 5 und macht Lightning Bolt schneller und billiger. Rage of the Farseer für Burst.',
        priority: [
          'Waffenverzauberung und Lightning Shield',
          'Stormstrike auf Cooldown',
          'Earth Shock / Flame Shock nach Stormstrike',
          'Lightning Bolt bei 5 Maelstrom-Stapeln',
          'Rage of the Farseer für Burst'
        ],
        stats: 'Hit bis zum Cap (in Forever ein gemeinsamer Wert für Nahkampf und Zauber), Strength/Agility/Attack Power und Crit (Flurry). Mental Dexterity macht Intellect zu Attack Power.',
        tips: [
          'Improved Ghost Wolf: Ghost Wolf funktioniert auch in Gebäuden.',
          'Improved Stormstrike kann den Stormstrike-Cooldown zurücksetzen.'
        ]
      },
      restoration: {
        summary: 'Gruppen-Heiler mit Totems, Chain Heal und – neu – Riptide.',
        playstyle: 'Riptide auf den Tank, dann Chain Heal über dieses Ziel (+25 %). Healing Wave für große Einzelheilungen, Nature\'s Swiftness im Notfall, Mana Tide Totem für die Gruppe. Water Shield hält Dein Mana oben.',
        priority: [
          'Water Shield aktiv',
          'Mana Spring / Healing Stream Totem (Restorative Totems)',
          'Riptide auf Cooldown',
          'Chain Heal über das Riptide-Ziel',
          'Healing Wave für große Einzelheilungen',
          'Nature\'s Swiftness + Healing Wave im Notfall'
        ],
        stats: 'Healing Power, Intellect, MP5 und Crit (Tidal Mastery).',
        tips: [
          'Healing Way und Improved Healing Wave machen Healing Wave zum starken Tank-Heal.',
          'Mana Tide Totem lädt das Mana der ganzen Gruppe auf.'
        ]
      }
    },
    sources: [
      { label: 'skycoach – Shaman Guide', url: 'https://skycoach.gg/blog/wow-forever/articles/forever-shaman-guide' },
      { label: 'wowhandbook – Shaman', url: 'https://wowhandbook.com/classes/shaman/' },
      { label: 'endgametools – Shaman Changes', url: 'https://endgametools.com/en/blog/wow-forever-shaman' },
      { label: 'classicwowforever.com – Shaman', url: 'https://classicwowforever.com/class-guide/shaman/' }
    ]
  },

  mage: {
    intro: 'Fernkampf-Caster mit viel Kontrolle. Neu: Arcane Blast (Talent), Frostfire Bolt (Lehrer ab Stufe 40), Ice Lance und Fingers of Frost – und Orcs können jetzt Magier werden.',
    leveling: 'Frost ist der bequemste Leveling-Spec: Frost Nova plus Ice Lance (300 % Schaden gegen eingefrorene Ziele) beendet Kämpfe schnell. Gruppen farmst Du mit Blizzard und Cone of Cold.',
    races: 'Mensch, Gnom, Orc (neu), Untote, Troll und Skyborne.',
    specs: {
      arcane: {
        summary: 'Burst-Spec, bei dem sich alles um Mana-Planung dreht.',
        playstyle: 'Arcane Blast stapelt sich: Jeder Cast erhöht den Schaden Deiner anderen Zauber um 10 %, aber auch seine eigenen Kosten. Missile Barrage verkürzt dann Arcane Missiles. Arcane Power und Presence of Mind für Burst – immer das Mana im Blick behalten.',
        priority: [
          'Arcane Blast 2–4× stapeln (je nach Mana)',
          'Arcane Missiles mit Missile Barrage',
          'Arcane Power + Presence of Mind im Burst',
          'Clearcasting für teure Zauber nutzen',
          'Evocation / Mana-Edelsteine, wenn das Mana knapp wird'
        ],
        stats: 'Hit bis zum Cap, Spell Power, Intellect (Arcane Mind) und Crit.',
        tips: [
          'Arcane Meditation lässt 50 % der Manaregeneration beim Zaubern weiterlaufen.',
          'Improved Counterspell silenced zusätzlich 4 Sek.'
        ]
      },
      fire: {
        summary: 'Crit-Spec mit Brandschaden über Ignite und Pyroblast.',
        playstyle: 'Fireball als Standard, Scorch für den Improved Scorch-Debuff. Heating Up: Crits mit Fireball, Frostfire Bolt, Fire Blast oder Scorch verkürzen den nächsten Pyroblast. Combustion für Burst.',
        priority: [
          'Improved Scorch-Debuff aufbauen',
          'Pyroblast nach Heating Up-Stapeln',
          'Fireball (oder Frostfire Bolt) als Füller',
          'Fire Blast in Bewegung',
          'Combustion für Burst',
          'Blast Wave / Flamestrike gegen Gruppen'
        ],
        stats: 'Hit bis zum Cap, Spell Power und Crit (Ignite, Master of Elements).',
        tips: [
          'Burning Soul senkt Deine Bedrohung und schützt vor Zauberverzögerung.',
          'Wake of Fire: Nach einem Kill hat Dein nächster Fire Blast +50 % Crit-Chance.'
        ]
      },
      frost: {
        summary: 'Kontroll-Spec mit Shatter-Combos – die beste Wahl zum Leveln.',
        playstyle: 'Frostbolt verlangsamt, Frostbite und Frost Nova frieren ein, Ice Lance macht gegen eingefrorene Ziele 300 % mehr Schaden. Fingers of Frost lässt zwei Zauber wirken, als wäre das Ziel eingefroren. Ice Barrier schützt vor Unterbrechungen.',
        priority: [
          'Ice Barrier aktiv',
          'Frostbolt als Füller',
          'Ice Lance auf eingefrorene Ziele bzw. mit Fingers of Frost',
          'Frost Nova → Abstand → Shatter',
          'Cold Snap für eine zweite Runde Cooldowns',
          'Blizzard / Cone of Cold gegen Gruppen'
        ],
        stats: 'Hit bis zum Cap, Spell Power und Crit (Shatter, Ice Shards).',
        tips: [
          'Laut Guides reicht auf Stufe 20 schon Elemental Precision, Frostbite, Ice Shards und Ice Lance.',
          'Ice Block ist Deine Lebensversicherung – Cold Snap setzt ihn zurück.'
        ]
      }
    },
    sources: [
      { label: 'classicwow.gg – Mage Overview', url: 'https://classicwow.gg/forever/guides/mage' },
      { label: 'talentsforever – Mage Changes', url: 'https://talentsforever.com/mage/changes' },
      { label: 'wowforeverbuilds – Frost Leveling (Stufe 20)', url: 'https://wowforeverbuilds.com/guide/beta-20-frost-mage-leveling' },
      { label: 'leprestore – Frost Mage', url: 'https://leprestore.com/guides/world-of-warcraft-forever/wow-forever-frost-mage-guide-best-builds-race-professions/' }
    ]
  },

  warlock: {
    intro: 'Caster mit DoTs, Dämonen und Seelensplittern. Neu: Curse of Agony und Curse of Doom heißen jetzt Bane of Agony und Bane of Doom – ein Bane und ein Curse dürfen gleichzeitig auf einem Ziel liegen. Trolle können Hexenmeister werden.',
    leveling: 'Affliction mit Voidwalker oder Demonology mit Soul Link sind die sichersten Leveling-Wege: DoTs drauf, das Pet tankt, mit Life Tap und Drain Life kommst Du fast ohne Pausen aus.',
    races: 'Mensch, Gnom, Orc, Untote und Troll (neu).',
    specs: {
      affliction: {
        summary: 'DoT-Spec – stark in langen Kämpfen und gegen mehrere Ziele.',
        playstyle: 'Corruption (Improved Corruption: sofort), Bane of Agony und ein Curse aufs Ziel, dazu Siphon Life. Wrack verstärkt Deine anderen DoTs um 10 %, die Drain-Zauber profitieren über Soul Siphon von jedem Affliction-Effekt. Nightfall (Shadow Trance) ermöglicht sofortige Shadow Bolts.',
        priority: [
          'Curse (z. B. Curse of Weakness) + Bane of Agony',
          'Corruption',
          'Siphon Life',
          'Wrack auf Cooldown',
          'Shadow Bolt bei Shadow Trance',
          'Drain Life / Drain Soul als Füller, Life Tap für Mana'
        ],
        stats: 'Hit bis zum Cap, Spell Power (Shadow) und Crit (Pandemic); Stamina hilft bei Life Tap.',
        tips: [
          'Amplify Curse verstärkt den nächsten Bane of Agony um 50 %.',
          'Soul Harvest: Kill mit Drain Soul gibt einen großen Mana-Schub.'
        ]
      },
      demonology: {
        summary: 'Pet-Spec – mit Demonic Pact bekommst Du Opfer-Buff und Pet gleichzeitig.',
        playstyle: 'Demonic Sacrifice gibt einen 2-Stunden-Buff (z. B. Imp: +15 % Schattenschaden); dank Demonic Pact bleibt er, wenn Du einen anderen Dämon beschwörst. Master Demonologist gibt je nach Dämon einen Bonus, Soul Link verteilt Schaden auf das Pet.',
        priority: [
          'Dämon wählen (Master Demonologist)',
          'Opfern + anderen Dämon beschwören (Demonic Pact)',
          'DoTs (Corruption, Bane of Agony)',
          'Shadow Bolt als Füller',
          'Soul Fire unter 35 % Leben (Decimation)'
        ],
        stats: 'Spell Power, Hit und Stamina (Demonic Embrace).',
        tips: [
          'Fel Domination: schnelles Neubeschwören, wenn das Pet stirbt.',
          'Demonic Knowledge erhöht Deinen Zauberschaden, solange ein Dämon aktiv ist.'
        ]
      },
      destruction: {
        summary: 'Direktschaden mit Feuer und Schatten.',
        playstyle: 'Immolate aufrechterhalten, Incinerate (+25 % mit Immolate) als Füller, Conflagrate verbraucht Immolate für Burst; Shadow and Flame gibt abwechselnd Schatten- und Feuer-Bonus. Bane of Havoc überträgt 15 % Deines Schadens auf ein zweites Ziel.',
        priority: [
          'Bane of Havoc auf ein Zweitziel (falls vorhanden)',
          'Immolate aktiv',
          'Conflagrate auf Cooldown → Immolate neu setzen',
          'Incinerate als Füller',
          'Shadowburn zum Abschluss (gibt einen Soul Shard)'
        ],
        stats: 'Hit bis zum Cap, Spell Power (Feuer/Schatten) und Crit (Ruin).',
        tips: [
          'Molten Skin senkt jeden erlittenen Schaden um 10 %.',
          'Improved Shadow Bolt erhöht bei Crits Deinen Schattenschaden auf dem Ziel.'
        ]
      }
    },
    sources: [
      { label: 'Mobalytics – Warlock Overview', url: 'https://mobalytics.gg/wow-forever/guides/warlock-class-overview' },
      { label: 'classicwow.gg – Warlock Overview', url: 'https://classicwow.gg/forever/guides/warlock' },
      { label: 'endgametools – Warlock Changes', url: 'https://endgametools.com/en/blog/wow-forever-warlock' },
      { label: 'leprestore – Destruction Warlock', url: 'https://leprestore.com/guides/world-of-warcraft-forever/wow-forever-destruction-warlock-guide-best-builds-rotation-race-professions/' }
    ]
  },

  druid: {
    intro: 'Gestaltwandler für jede Rolle: Bär (Tank), Katze (Nahkampf), Moonkin (Caster) und Heiler. Neu: Primal Bite, Lacerate, Berserk, Eclipse, Wild Growth und Shifting Power.',
    leveling: 'Feral (Katze) levelt am schnellsten – Travel Form, Prowl und Selbstheilung zwischen den Kämpfen. Für Dungeons die Bärform als Tank mitnehmen.',
    races: 'Nachtelf, Taure und Skyborne.',
    specs: {
      balance: {
        summary: 'Caster mit Natur- und Arkanschaden in Moonkin Form.',
        playstyle: 'Moonfire und Insect Swarm aufrechterhalten. Wrath lädt Eclipse auf, wodurch die nächsten zwei Starfire schneller werden. Nature\'s Grace beschleunigt Dich nach Crits.',
        priority: [
          'Moonkin Form',
          'Moonfire + Insect Swarm aktiv',
          'Wrath für Eclipse-Ladungen',
          'Starfire mit Eclipse',
          'Omen of Clarity-Procs für teure Zauber'
        ],
        stats: 'Hit bis zum Cap, Spell Power und Crit (Vengeance).',
        tips: [
          'Moonglow senkt die Manakosten Deiner Schadenszauber um 25 %.',
          'Improved Starfire kann das Ziel betäuben.'
        ]
      },
      feral: {
        summary: 'Katzen-Nahkampf mit Blutungen.',
        playstyle: 'Aus Prowl eröffnen, mit Rake, Shred und Claw Combo-Punkte aufbauen, Rip als Blutung, Ferocious Bite als Finisher. Rend and Tear: +10 % gegen blutende Ziele. Shifting Power wandelt Mana in Energie, Berserk ist Dein Burst. Leader of the Pack hilft der ganzen Gruppe.',
        priority: [
          'Rake aktiv',
          'Shred (von hinten) bzw. Claw zum Aufbau',
          'Rip bei 5 Punkten',
          'Ferocious Bite mit übrigen Punkten',
          'Shifting Power bei leerer Energie',
          'Berserk für Burst'
        ],
        stats: 'Agility/Strength, Attack Power, Hit und Crit.',
        tips: [
          'Predatory Strikes skaliert Deine Attack Power mit der Stufe – auch mit schwacher Ausrüstung stark.',
          'Feral Swiftness macht Dich in Katzenform 30 % schneller.'
        ]
      },
      feral_tank: {
        summary: 'Bären-Tank mit viel Rüstung und Leben.',
        playstyle: 'Bärform, Lacerate bis 5 stapeln, Primal Bite als Haupt-Wutverbraucher mit viel Bedrohung, Swipe gegen Gruppen, Maul bei Wut-Überschuss. Feral Charge unterbricht Zauber. Berserk lässt Primal Bite bis zu 3 Ziele treffen.',
        priority: [
          'Primal Bite auf Cooldown',
          'Lacerate auf 5 Stapeln halten',
          'Swipe bei mehreren Gegnern',
          'Maul bei Wut-Überschuss',
          'Demoralizing Roar',
          'Berserk für große Pulls'
        ],
        stats: 'Stamina, Armor, Dodge (Natural Reaction) und Hit für zuverlässige Bedrohung.',
        tips: [
          'Thick Hide und Heart of the Wild machen den Bären sehr robust.',
          'Natural Reaction: Ausweichen gibt Wut.'
        ]
      },
      restoration: {
        summary: 'HoT-Heiler mit starker Gruppenheilung.',
        playstyle: 'Rejuvenation und Regrowth vorlegen, Swiftmend verbraucht sie für eine sofortige große Heilung, Wild Growth heilt die ganze Gruppe über 7 Sek. Gift of the Earthmother verkürzt den globalen Cooldown dieser Zauber.',
        priority: [
          'Rejuvenation auf Tank bzw. wer Schaden nimmt',
          'Wild Growth bei Gruppen-Schaden',
          'Regrowth (Improved Regrowth: hohe Crit-Chance)',
          'Swiftmend für die schnelle Rettung',
          'Healing Touch / Nature\'s Swiftness im Notfall',
          'Innervate'
        ],
        stats: 'Healing Power, Spirit (Living Spirit), Intellect und MP5.',
        tips: [
          'Reflection lässt 50 % Deiner Manaregeneration beim Zaubern weiterlaufen.',
          'Improved Tranquility: kürzerer Cooldown und keine Bedrohung.'
        ]
      }
    },
    sources: [
      { label: 'Icy Veins – Feral Druid', url: 'https://www.icy-veins.com/wow-forever/feral-druid-melee-dps-and-tank-pve-guide' },
      { label: 'classicwow.gg – Druid Overview', url: 'https://classicwow.gg/forever/guides/druid' },
      { label: 'endgametools – Druid Changes', url: 'https://endgametools.com/en/blog/wow-forever-druid' },
      { label: 'wowforeverguides – Druid Leveling', url: 'https://wowforeverguides.com/leveling/druid' }
    ]
  }
};
