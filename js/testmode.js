// Testmodus: the whole site on made-up guild data, only in this browser.
//
// Loaded right after the Firebase SDK and before js/core.js. When the
// flag in localStorage (TESTMODE_KEY) is set, window.firebase is replaced
// by a small in-memory stand-in (ref / on / off / set / update / remove /
// push / orderByChild / equalTo, auth that is "logged in" as the chosen
// test person) — nothing reaches the real database, the Discord bot or
// the Worker. The test data is a scenario (testSeed) built relative to
// "now"; changes made while testing are kept in localStorage
// (TESTMODE_DB_KEY) until "Szenario neu laden" or "Beenden".
// A bar at the top switches the person you look through (admin, officer,
// members, an applicant) — the page reloads as that person.
// Entry: User Settings → "Testmodus starten" (testModeStart) — Admins, and
// whoever an Admin unlocked in Manage access (discordRoles/<uid>/testMode,
// canUseTestMode in js/auth.js).

/* eslint-disable no-var */
var TESTMODE_KEY = 'rude-testmode-v1';
var TESTMODE_DB_KEY = 'rude-testmode-db-v1';
var TESTMODE_REAL_ID_KEY = 'rude-testmode-real-identity';
var TESTMODE_ID_KEY = 'guild-loot-discord-identity'; // = DISCORD_IDENTITY_KEY (js/core.js loads later)

/** @type {{ uid: string } | null} */
var RUDE_TESTMODE = (function(){
  try { const v = JSON.parse(localStorage.getItem(TESTMODE_KEY) || 'null'); return v && v.uid ? v : null; } catch (e){ return null; }
})();

/** The test people: uid -> [display name, role]. */
var TESTMODE_PEOPLE = {
  test_you: ['Du (Admin)', 'admin'],
  test_offi: ['Offi Olaf', 'officer'],
  test_m1: ['Tank-Toni', 'member'], test_m2: ['Bärbel', 'member'], test_m3: ['Lichtblick', 'member'],
  test_m4: ['Wasserfall', 'member'], test_m5: ['Blattgrün', 'member'], test_m6: ['Feuerfee', 'member'],
  test_m7: ['Frostbeule', 'member'], test_m8: ['Schattenwort', 'member'], test_m9: ['Seelenbrand', 'member'],
  test_m10: ['Pfeilhagel', 'member'], test_m11: ['Messerwerk', 'member'], test_m12: ['Wutbürger', 'member'],
  test_m13: ['Blitzschlag', 'member'], test_m14: ['Mondstrahl', 'member'], test_m15: ['Doppelmain-Doris', 'member'],
  test_bewerber: ['Neuling Nils (Bewerber)', 'community'],
  test_gast: ['Gast Gerda (Extern)', 'community']
};

/** Scenario data relative to now. @param {number} now */
function testSeed(now){
  const day = 86400000;
  const at = (days, hour) => { const d = new Date(now + days * day); d.setHours(hour, 0, 0, 0); return d.getTime(); };
  // Start of the current raid ID: last Wednesday 07:00 (local time is close enough for test data).
  const idStart = (() => { const d = new Date(now); d.setHours(7, 0, 0, 0); while (d.getDay() !== 3 || d.getTime() > now) d.setDate(d.getDate() - 1); return d.getTime(); })();
  const P = TESTMODE_PEOPLE;
  /** [uid, charId, name, classId, specId, raidRole, professions] @type {[string, string, string, string, string, string, [string, number][]][]} */
  const chars = [
    ['test_you', 'kraxl', 'Kraxl', 'warrior', 'arms', 'main', [['blacksmithing', 300], ['mining', 300]]],
    ['test_you', 'heali', 'Heali', 'priest', 'holy', 'main', [['tailoring', 285], ['enchanting', 260]]],
    ['test_you', 'twinkus', 'Twinkus', 'mage', 'fire', 'twink', [['alchemy', 150], ['herbalism', 160]]],
    ['test_offi', 'olafson', 'Olafson', 'paladin', 'holy', 'main', [['alchemy', 300], ['herbalism', 300]]],
    ['test_m1', 'tanky', 'Tanky', 'warrior', 'protection', 'main', [['blacksmithing', 300], ['mining', 300]]],
    ['test_m2', 'baerbel', 'Bärbel', 'druid', 'feral_tank', 'main', [['leatherworking', 300], ['skinning', 300]]],
    ['test_m3', 'lichtblick', 'Lichtblick', 'priest', 'holy', 'main', [['tailoring', 300], ['enchanting', 300]]],
    ['test_m4', 'wasserfall', 'Wasserfall', 'shaman', 'restoration', 'main', [['alchemy', 280], ['herbalism', 300]]],
    ['test_m5', 'blattgruen', 'Blattgrün', 'druid', 'restoration', 'main', [['herbalism', 300], ['alchemy', 300]]],
    ['test_m6', 'feuerfee', 'Feuerfee', 'mage', 'fire', 'main', [['tailoring', 300], ['enchanting', 290]]],
    ['test_m7', 'frostbeule', 'Frostbeule', 'mage', 'frost', 'main', [['engineering', 300], ['mining', 300]]],
    ['test_m8', 'schattenwort', 'Schattenwort', 'priest', 'shadow', 'main', [['tailoring', 300], ['enchanting', 300]]],
    ['test_m9', 'seelenbrand', 'Seelenbrand', 'warlock', 'destruction', 'main', [['tailoring', 300], ['enchanting', 300]]],
    ['test_m10', 'pfeilhagel', 'Pfeilhagel', 'hunter', 'marksmanship', 'main', [['leatherworking', 300], ['skinning', 300]]],
    ['test_m11', 'messerwerk', 'Messerwerk', 'rogue', 'combat', 'main', [['engineering', 300], ['mining', 280]]],
    ['test_m12', 'wutbuerger', 'Wutbürger', 'warrior', 'fury', 'main', [['blacksmithing', 300], ['mining', 300]]],
    ['test_m12', 'wutzwerg', 'Wutzwerg', 'hunter', 'beast_mastery', 'twink', [['skinning', 200], ['leatherworking', 190]]],
    ['test_m13', 'blitzschlag', 'Blitzschlag', 'shaman', 'elemental', 'main', [['engineering', 300], ['mining', 300]]],
    ['test_m14', 'mondstrahl', 'Mondstrahl', 'druid', 'balance', 'main', [['alchemy', 300], ['herbalism', 300]]],
    ['test_m15', 'dorisheal', 'Dorisheal', 'paladin', 'holy', 'main', [['blacksmithing', 300], ['mining', 300]]],
    ['test_m15', 'dorisdps', 'Dorisdps', 'rogue', 'combat', 'main', [['leatherworking', 280], ['skinning', 300]]]
  ];
  // Public BiS sets (the loot decision aid reads them).
  const sets = {
    tset_kraxl: ['test_you', 'Kraxl Raid', 'warrior', 'arms', { head: 12640, waist: 19137, finger1: 17063, mainhand: 17076, neck: 18814 }],
    tset_heali: ['test_you', 'Heali Heal', 'priest', 'holy', { chest: 19145, head: 16921, waist: 19136, neck: 17109, mainhand: 18842 }],
    tset_tanky: ['test_m1', 'Tanky Prot', 'warrior', 'protection', { head: 16866, waist: 19137, finger1: 17063 }],
    tset_lichtblick: ['test_m3', 'Lichtblick Holy', 'priest', 'holy', { chest: 19145, head: 16921, hands: 16812, waist: 16817 }],
    tset_feuerfee: ['test_m6', 'Feuerfee Fire', 'mage', 'fire', { chest: 19145, feet: 16800, finger1: 19147, trinket1: 18820, mainhand: 18842 }],
    tset_seelenbrand: ['test_m9', 'Seelenbrand Destro', 'warlock', 'destruction', { chest: 19145, waist: 19136, finger1: 19147, finger2: 17110, neck: 18814 }],
    tset_messerwerk: ['test_m11', 'Messerwerk Combat', 'rogue', 'combat', { legs: 16822, finger1: 17063, back: 13340 }],
    tset_mondstrahl: ['test_m14', 'Mondstrahl Balance', 'druid', 'balance', { head: 16900, chest: 19145, mainhand: 18842 }]
  };
  const setOf = { kraxl: 'tset_kraxl', heali: 'tset_heali', tanky: 'tset_tanky', lichtblick: 'tset_lichtblick', feuerfee: 'tset_feuerfee', seelenbrand: 'tset_seelenbrand', messerwerk: 'tset_messerwerk', mondstrahl: 'tset_mondstrahl' };

  const discordRoles = {};
  for (const [uid, [name, role]] of Object.entries(P)) discordRoles[uid] = { role, username: name, avatar: null };
  const characterProfiles = {};
  for (const [uid, id, name, classId, specId, raidRole, profs] of chars) {
    if (!characterProfiles[uid]) characterProfiles[uid] = { nickname: P[uid][0].replace(/ \(.*\)$/, ''), characters: [] };
    const list = characterProfiles[uid].characters;
    list.push({
      id, name, realmSlug: 'spineshatter', isMain: !list.length, classId, specId, raidRole,
      professions: profs.map(([pid, skill]) => ({ id: pid, skill })),
      ...(setOf[id] ? { bisSets: { [specId]: setOf[id] } } : {})
    });
  }
  // A few special recipes.
  characterProfiles.test_m1.characters[0].professions[0].recipes = [12640];
  characterProfiles.test_m3.characters[0].professions[0].recipes = [16815];
  const bisPublic = {};
  for (const [id, [uid, name, classId, specId, slots]] of Object.entries(sets)) {
    bisPublic[id] = { name, classId, specId, raceId: '1', level: 60, slots, ownerId: uid, ownerName: characterProfiles[uid].nickname, createdAt: now - 20 * day, updatedAt: now - 20 * day };
  }
  const bisOwned = { test_m6: { 16800: true }, test_m9: { 17110: true }, test_you: { 17063: true } };

  const charById = Object.fromEntries(chars.map(c => [c[1], c]));
  const signup = (charId, status, note) => {
    const [uid, , name, classId, specId] = charById[charId];
    return [uid, charId, { status, name: characterProfiles[uid].nickname, charName: name, classId, specId, note: note || '', updatedAt: now - day }];
  };
  const signups = (list) => {
    const out = {};
    for (const [uid, key, s] of list) { (out[uid] = out[uid] || {})[key] = s; }
    return out;
  };
  const everyone = Object.keys(charById).filter(k => charById[k][5] === 'main');
  // Tonight's raid started 90 minutes ago; one character per player in the line-up.
  const today = Math.floor((now - 90 * 60000) / 60000) * 60000;
  const todayRoster = ['kraxl', 'olafson', 'tanky', 'baerbel', 'lichtblick', 'wasserfall', 'blattgruen', 'feuerfee', 'frostbeule', 'schattenwort', 'seelenbrand', 'pfeilhagel', 'messerwerk', 'wutbuerger', 'blitzschlag', 'mondstrahl'];

  // Planned Hyjal raid (next raid ID): line-up published, Taktik partly filled.
  const planRoster = everyone.filter((k, i) => everyone.findIndex(x => charById[x][0] === charById[k][0]) === i);
  const raidEvents = {
    t_ony_past: { title: 'Onyxia — letzte Woche', instance: "Onyxia's Lair", start: at(-7, 20), note: 'Testszenario: Vergangener Raid mit Aufstellung und vergebenem Loot.', createdBy: 'test_offi', createdAt: now - 10 * day, updatedAt: now - 8 * day,
      roster: Object.fromEntries(everyone.slice(0, 16).map(k => [`${charById[k][0]}|${k}`, true])), rosterPublished: true },
    t_bd_1: { title: 'Barrow Deeps — Run 1', instance: 'Barrow Deeps', start: idStart + 13 * 3600000, note: 'Testszenario: Diese Raid-ID schon gelaufen — Kraxl und Tanky sind für Run 2 gesperrt (🔒).', createdBy: 'test_offi', createdAt: now - 6 * day, updatedAt: now - 6 * day,
      roster: { 'test_you|kraxl': true, 'test_m1|tanky': true, 'test_m3|lichtblick': true, 'test_m6|feuerfee': true }, rosterPublished: true },
    t_bd_2: { title: 'Barrow Deeps — Run 2', instance: 'Barrow Deeps', start: idStart + 6 * day + 13 * 3600000, note: 'Testszenario: Gleiche Raid-ID wie Run 1 — stell eine 10er-Aufstellung zusammen.', createdBy: 'test_offi', createdAt: now - 2 * day, updatedAt: now - 2 * day, signupState: 'open' },
    t_hyjal: { title: 'Hyjal Summit', instance: 'Hyjal Summit', start: at(4, 20), note: 'Testszenario: Anmeldung offen (22 Chars für 20 Plätze), Soft-Reserve mit 2 Items und einer Hard-Reserve (Staff of Dominance). Ohne Aufstellung sind in der Loot-Vergabe alle Angemeldeten Kandidaten.', createdBy: 'test_offi', createdAt: now - day, updatedAt: now - day, srMax: 2, hr: { 18842: true } },
    t_ony_today: { title: 'Onyxia — heute', instance: "Onyxia's Lair", start: today, note: 'Testszenario: Läuft gerade. Anmeldung geschlossen, Aufstellung veröffentlicht, Loot-Runde 1 abgeschlossen, Runde 2 offen mit Stimmen.', createdBy: 'test_offi', createdAt: now - 5 * day, updatedAt: now - day, signupState: 'closed',
      roster: Object.fromEntries(todayRoster.map(k => [`${charById[k][0]}|${k}`, true])), rosterPublished: true },
    t_hyjal_plan: { title: 'Hyjal — Taktik', instance: 'Hyjal Summit', start: at(11, 20), note: 'Testszenario: Aufstellung veröffentlicht — Tab „Taktik“: Einteilung pro Boss (Seelensteine, Anregen, Flüche, Segen), Raidgruppen und Aufstellung am Boss.', createdBy: 'test_offi', createdAt: now - day, updatedAt: now - day, signupState: 'closed',
      roster: Object.fromEntries(planRoster.map(k => [`${charById[k][0]}|${k}`, true])), rosterUids: Object.fromEntries(planRoster.map(k => [charById[k][0], true])), rosterPublished: true }
  };
  const ck = k => `${charById[k][0]}|${k}`;
  // Board token of a player (same as raidPlayerTok in js/raid-tactics.js, which loads after this file).
  const ptok = k => `p_${ck(k).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40)}`;
  const raidPlans = {
    t_hyjal_plan: {
      groups: Object.fromEntries(planRoster.map((k, i) => [ck(k), (i % 4) + 1])),
      bosses: {
        all: { a: { [`soulstone~${ck('seelenbrand')}`]: { t: ck('lichtblick') }, [`blessing~${ck('olafson')}`]: { t: 'Blessing of Kings' }, [`blessing~${ck('dorisheal')}`]: { t: 'Blessing of Might', n: 'Krieger & Schurken' } },
          note: 'Flasks und Buff-Food für alle. Weltbuffs vor dem Raid abholen.' },
        bandalar: { a: { [`tank~${ck('tanky')}`]: { t: 'Boss' }, [`tank~${ck('baerbel')}`]: { t: 'Adds links' }, [`heal~${ck('lichtblick')}`]: { t: ck('tanky') }, [`heal~${ck('olafson')}`]: { t: ck('baerbel') },
          [`innervate~${ck('blattgruen')}`]: { t: ck('lichtblick') }, [`curse~${ck('seelenbrand')}`]: { t: 'Curse of Recklessness' }, [`decurse_mage~${ck('feuerfee')}`]: { t: 2 }, [`sunder~${ck('kraxl')}`]: { t: true } },
          note: 'Boss mittig tanken, Adds links sammeln. Fernkampf hinten verteilt.',
          kicks: { tk1: { spell: 'Shadow Bolt Volley', order: [ck('messerwerk'), ck('kraxl'), ck('feuerfee')] } },
          map: { tok: { [ptok('tanky')]: { x: 50, y: 33 }, [ptok('seelenbrand')]: { x: 85, y: 70 }, boss: { x: 50, y: 40 }, g1: { x: 50, y: 60 }, g2: { x: 30, y: 75 }, g3: { x: 70, y: 75 }, g4: { x: 50, y: 85 }, m8: { x: 50, y: 30 }, m7: { x: 20, y: 40 } } } }
      }
    }
  };
  const raidSignups = {
    t_ony_past: signups(everyone.map(k => signup(k, 'yes'))),
    t_bd_1: signups(['kraxl', 'tanky', 'lichtblick', 'feuerfee'].map(k => signup(k, 'yes'))),
    t_bd_2: signups([signup('kraxl', 'yes'), signup('heali', 'yes', 'Kraxl ist diese ID schon weg'), signup('tanky', 'yes'), signup('baerbel', 'yes'),
      signup('wasserfall', 'yes'), signup('blattgruen', 'maybe'), signup('frostbeule', 'yes'), signup('schattenwort', 'yes'), signup('seelenbrand', 'yes'),
      signup('pfeilhagel', 'yes'), signup('messerwerk', 'yes'), signup('wutbuerger', 'yes'), signup('wutzwerg', 'yes'), signup('blitzschlag', 'maybe'), signup('mondstrahl', 'no')]),
    t_hyjal: signups([...everyone.filter(k => k !== 'mondstrahl').map(k => signup(k, 'yes')), signup('mondstrahl', 'maybe', 'komme evtl. später'), signup('twinkus', 'yes'), signup('wutzwerg', 'maybe')]),
    // (the accepted guest's sign-up is added below)
    t_ony_today: signups(everyone.map(k => signup(k, 'yes'))),
    t_hyjal_plan: signups(planRoster.map(k => signup(k, 'yes')))
  };
  raidSignups.t_hyjal.test_gast = { x_c1: { status: 'yes', name: 'Gast Gerda (Extern)', charName: 'Gerdabear', classId: 'druid', specId: 'feral_tank', note: 'Gast', ext: true, updatedAt: now - day } };
  const raidReserves = {
    t_hyjal: {
      test_m6: { items: { s1: 19145, s2: 19147 }, name: 'Feuerfee', charName: 'Feuerfee', classId: 'mage', updatedAt: now - day },
      test_m9: { items: { s1: 19145 }, name: 'Seelenbrand', charName: 'Seelenbrand', classId: 'warlock', updatedAt: now - day },
      test_m3: { items: { s1: 16921 }, name: 'Lichtblick', charName: 'Lichtblick', classId: 'priest', updatedAt: now - day }
    }
  };
  const award = (eventId, itemId, itemName, charId, kind, daysAgo, note) => {
    const [uid, , name, classId, specId] = charById[charId];
    return { eventId, itemId, itemName, uid, charName: name, classId, specId, kind, note: note || '', by: 'test_offi', at: now - daysAgo * day };
  };
  const lootAwards = {
    tl1: award('t_ony_past', 18814, 'Choker of the Fire Lord', 'seelenbrand', 'ms', 7, 'BiS'),
    tl2: award('t_ony_past', 17063, 'Band of Accuria', 'messerwerk', 'ms', 7),
    tl3: award('t_ony_past', 16800, 'Arcanist Boots', 'feuerfee', 'ms', 7),
    tl4: award('t_ony_past', 19137, 'Onslaught Girdle', 'wutbuerger', 'os', 7, 'Off-Spec, kein Tank da'),
    tl5: award('t_bd_1', 16921, 'Halo of Transcendence', 'lichtblick', 'ms', 1),
    tl6: Object.assign(award('t_ony_today', 17064, 'Shard of the Scale', 'blattgruen', 'ms', 0), { at: now - 55 * 60000, boss: 'Onyxia', sessionId: 'ts1' })
  };
  // Loot-Runden of tonight's raid: Runde 1 done, Runde 2 open (votes by Offi Olaf).
  const min = 60000;
  const lootSessions = {
    t_ony_today: {
      ts1: { startedAt: now - 75 * min, startedBy: 'test_offi', closedAt: now - 50 * min, items: {
        ti1: { itemId: 17064, itemName: 'Shard of the Scale', at: now - 80 * min, boss: 'Onyxia', done: 'award', awardId: 'tl6' },
        ti2: { itemId: 18205, itemName: "Eskhandar's Collar", at: now - 80 * min, boss: 'Onyxia', done: 'free', doneNote: 'Entzaubert / Bank' }
      } },
      ts2: { startedAt: now - 20 * min, startedBy: 'test_offi', items: {
        ti3: { itemId: 17068, itemName: 'Deathbringer', at: now - 100 * min, boss: 'Onyxia', ext: 'tx1', rclcName: 'Wutbürger', rclcResponse: 'Need', votes: { test_offi: 'test_m12|wutbuerger' } },
        ti4: { itemId: 16921, itemName: 'Halo of Transcendence', at: now - 15 * min, boss: 'Onyxia', ext: 'tx2', rclcName: 'Lichtblick', rclcResponse: 'Need', votes: { test_offi: 'test_m3|lichtblick' } },
        ti5: { itemId: 19145, itemName: 'Robe of Volatile Power', at: now - 15 * min, boss: 'Onyxia', ext: 'tx3' },
        ti6: { itemId: 16900, itemName: 'Stormrage Cover', at: now - 10 * min, boss: 'Onyxia' },
        ti7: { itemId: 18814, itemName: 'Choker of the Fire Lord', at: now - 10 * min, boss: 'Onyxia' }
      } }
    }
  };
  const app = (applicantId, firstName, age, picks, characters, profs, logs, status, daysAgo, extra) => Object.assign({
    version: 2, firstName, nickname: '', age, picks, characters, charProfessions: profs, extraProfessions: [{ professionId: 'cooking' }],
    charLogs: {}, logs, remarks: '', applicantName: firstName, applicantId, createdAt: now - daysAgo * day, status
  }, extra || {});
  const applications = {
    tapp1: app('test_bewerber', 'Nils', 27, [{ classId: 'warlock', specs: ['destruction', 'affliction'] }], { warlock: 'Nilsor Dunkelherz' },
      { warlock: [{ professionId: 'tailoring' }, { professionId: 'enchanting' }] }, ['https://www.warcraftlogs.com/character/eu/blackrock/nilsdh'], 'open', 0.2),
    tapp2: app('test_apply2', 'Lena', 31, [{ classId: 'priest', specs: ['holy'] }], { priest: 'Lena Morgenlicht' },
      { priest: [{ professionId: 'herbalism' }, { professionId: 'alchemy' }] }, ['https://classic.warcraftlogs.com/character/eu/x/lena'], 'claimed', 3,
      { claimedBy: 'test_offi', claimedByName: 'Offi Olaf' }),
    tapp3: app('test_apply3', 'Tom', 24, [{ classId: 'rogue', specs: ['combat'] }], { rogue: 'Tom Schattenfuß' },
      { rogue: [{ professionId: 'engineering' }, { professionId: 'mining' }] }, ['https://www.warcraftlogs.com/character/eu/x/tom'], 'accepted', 9)
  };
  // Hand-written Patch-Updates on the day of the newest test build — the
  // automatic changes get merged into them without repeating what they say.
  const yesterday = new Date(now - day).toISOString().slice(0, 10);
  const classDeepDives = {
    general: { summary: '', updates: [{ id: 'tdd1', date: yesterday, title: '', createdAt: now - day,
      text: '<p>WoW: Forever – Update vom Vortag</p><p>Blizzard hat die Beta aktualisiert.</p><p>⚙️ Allgemein</p><p>🐉 Raids 🤷 bald</p><p>🛡️ Paladin</p><ul><li><b>Schutz</b><ul><li>Redoubt: Blockchance gesenkt.</li></ul></li><li><b>Vergeltung</b><ul><li>Champion of the Light entfernt.</li></ul></li></ul><p>🗡️ Krieger</p><ul><li><b>Waffen</b><ul><li>Spearing Strike braucht keine Zweihandwaffe mehr.</li></ul></li><li><b>Furor</b><ul><li>Bloodthirst: Angriffskraft-Anteil 35 % → 45 %.</li></ul></li></ul><p>Besonders hart trifft es Wilder-Kampf-Druiden und Schutz-Paladine; Holy Priest und Magier bekommen kleine Buffs, Krieger bleiben unverändert.</p><h2>Items</h2><p>Destiny wurde verbessert (mehr Itemlevel und Schaden).</p>' }] },
    druid: { summary: '', updates: [{ id: 'tdd2', date: yesterday, title: '', createdAt: now - day,
      text: '<p>📅 Wie geht es weiter? ✅ erledigt</p><p>Druiden-Änderungen</p><ul><li><b>Gleichgewicht</b><ul><li>Moonkin Form wird stärker.</li></ul></li><li><b>Wilder Kampf</b><ul><li>Furor gibt mehr Wut.</li></ul></li></ul><p>Moonkin Form: Reichweite der Aura 30 → 40 Meter, Krit-Bonus 3 % → 5 %.</p>' }] }
  };
  const announcements = {
    tan1: { title: 'Raidzeiten ab Dezember', text: '<p>Ab dem Raid-Release am 9. Dezember raiden wir <b>Donnerstag und Sonntag ab 20:00</b>. Meldet euch bitte immer bis 24 h vorher im Raid-Kalender an.</p>',
      authorName: 'Offi Olaf', authorId: 'test_offi', createdAt: now - 2 * 3600000, editedAt: 0 }
  };
  // Guest applications for the SR raid Hyjal (js/raid-externals.js): Gerda accepted, Nils open with a screenshot.
  const shot = (() => {
    try {
      const c = document.createElement('canvas'); c.width = 480; c.height = 270;
      const x = c.getContext('2d');
      x.fillStyle = '#0b1e2c'; x.fillRect(0, 0, 480, 270);
      x.fillStyle = '#c9a227'; x.font = 'bold 22px sans-serif'; x.fillText('Gear-Screenshot (Test)', 24, 44);
      x.fillStyle = '#e6eef2'; x.font = '16px sans-serif';
      ['Kopf: Nemesis Skullcap', 'Brust: Robe of Volatile Power', 'Waffe: Staff of Dominance'].forEach((t, i) => x.fillText(t, 24, 90 + i * 30));
      return c.toDataURL('image/jpeg', 0.8);
    } catch (e){ return ''; }
  })();
  const raidApplications = { t_hyjal: {
    test_bewerber: { app: { name: 'Neuling Nils (Bewerber)', note: 'Trage gerade noch PvP-Gear, PvE-Set ist im Screenshot. Raid-Erfahrung: MC/BWL auf Classic.', shots: shot ? 1 : 0, at: now - 5 * 3600000, upd: now - 5 * 3600000,
      chars: { c1: { n: 'Nilsor', cls: 'warlock', spec: 'destruction', armory: 'https://worldofwarcraft.blizzard.com/de-de/character/eu/spineshatter/nilsor' }, c2: { n: 'Nilsheal', cls: 'priest', spec: 'holy', armory: 'https://worldofwarcraft.blizzard.com/de-de/character/eu/spineshatter/nilsheal' } } },
      msgs: { tm1: { by: 'test_bewerber', name: 'Neuling Nils (Bewerber)', text: 'Kann auch als Heiler mit, falls ihr Heiler braucht!', at: now - 4 * 3600000 } } },
    test_gast: { app: { name: 'Gast Gerda (Extern)', note: '', shots: 0, at: now - 2 * day, upd: now - 2 * day,
      chars: { c1: { n: 'Gerdabear', cls: 'druid', spec: 'feral_tank', armory: 'https://worldofwarcraft.blizzard.com/de-de/character/eu/spineshatter/gerdabear' } } },
      status: 'accepted', char: 'c1', decidedBy: 'Offi Olaf', decidedAt: now - day,
      msgs: { tm2: { by: 'test_offi', name: 'Offi Olaf', text: 'Willkommen! Treffpunkt 19:45 am Instanzeingang.', at: now - day } } }
  } };
  const raidApplicationShots = shot ? { t_hyjal: { test_bewerber: { s1: shot } } } : {};
  // Two "Problem melden" reports (js/support.js): one open from a phone, one answered.
  const supportReports = {
    tsr1: { uid: 'test_m6', name: 'Feuerfee', role: 'member', cat: 'display', text: 'Auf dem Handy ist die Raid-Karte zu breit, ich muss seitlich scrollen um die Anmeldung zu sehen.', page: 'raids', hash: '#raids',
      vw: 390, vh: 844, dpr: 3, mobile: true, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      errors: ['TypeError: Cannot read properties of undefined (reading \'classId\') (raids.js:412)'], shot: 0, at: now - 3 * 3600000, status: 'open' },
    tsr2: { uid: 'test_m9', name: 'Seelenbrand', role: 'member', cat: 'info', text: 'Bei Hyjal steht ein falscher Bossname.', page: 'bosses', hash: '#bosses', vw: 1920, vh: 1080, dpr: 1, mobile: false,
      ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36', errors: [], shot: 0, at: now - 2 * day,
      status: 'done', reply: 'Danke, ist korrigiert!', handledBy: 'Offi Olaf', handledAt: now - day }
  };
  // A Boss-Guide written by officers (Hyjal Summit, first boss).
  const bossGuides = { hyjal_summit: { bandalar: { text: '<h2>Ablauf</h2><p>Bandalar wird mittig getankt. Bei <b>Furcht</b> rennen alle Richtung Wand — Fear Ward auf den Main-Tank.</p><ul><li>Adds links einsammeln</li><li>Fernkampf verteilt hinten</li></ul>',
    roles: { tank: 'Boss mittig, Add-Tank links.', healer: 'Tanks priorisieren, Flüche sofort entfernen.', damage: 'Adds zuerst, dann Boss.' },
    classes: { warlock: 'Curse of Recklessness auf den Boss' }, mech: { fear: true, curse: true, adds: true }, updatedAt: now - day, updatedBy: 'Offi Olaf' } } };
  return { 'guild-loot-data': { announcements, classDeepDives, discordRoles, characterProfiles, bisPublic, bisOwned, raidEvents, raidSignups, raidReserves, lootAwards, lootSessions, raidPlans, bossGuides, raidApplications, raidApplicationShots, supportReports, applications } };
}

// ---------------------------------------------------------------- in-memory Firebase
if (RUDE_TESTMODE) (function(){
  /** @type {any} */
  let DB;
  try { DB = JSON.parse(localStorage.getItem(TESTMODE_DB_KEY) || 'null'); } catch (e){ DB = null; }
  if (!DB){ DB = testSeed(Date.now()); try { localStorage.setItem(TESTMODE_DB_KEY, JSON.stringify(DB)); } catch (e){ /* full */ } }
  const UID = RUDE_TESTMODE.uid;
  const listeners = [];
  const get = (path) => path.split('/').filter(Boolean).reduce((o, k) => (o == null ? undefined : o[k]), DB);
  const resolve = (v) => {
    if (v && typeof v === 'object'){
      if (v['.sv'] === 'timestamp') return Date.now();
      const o = Array.isArray(v) ? [] : {};
      for (const [k, x] of Object.entries(v)) o[k] = resolve(x);
      return o;
    }
    return v;
  };
  let saveTimer = 0;
  const persist = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { localStorage.setItem(TESTMODE_DB_KEY, JSON.stringify(DB)); } catch (e){ /* full */ } }, 200); };
  function put(path, v){
    const parts = path.split('/').filter(Boolean);
    let o = DB;
    for (let i = 0; i < parts.length - 1; i++){ if (o[parts[i]] == null || typeof o[parts[i]] !== 'object') o[parts[i]] = {}; o = o[parts[i]]; }
    const last = parts[parts.length - 1];
    if (v === null || v === undefined) delete o[last]; else o[last] = resolve(v);
  }
  const refire = () => { for (const l of listeners) if (l.active) l.fire(); persist(); };
  function makeRef(path, q){
    return {
      key: path.split('/').pop(),
      orderByChild(c){ return makeRef(path, Object.assign({}, q, { child: c })); },
      equalTo(v){ return makeRef(path, Object.assign({}, q, { eq: v })); },
      child(c){ return makeRef(path + '/' + c); },
      // push(value) stores it under a new key; the result is a promise with .key (like Firebase's ThenableReference).
      push(v){
        const key = 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const p = v === undefined ? Promise.resolve() : (put(path + '/' + key, v), setTimeout(refire, 1), Promise.resolve());
        return Object.assign(p, { key });
      },
      once(){ const v = get(path); return Promise.resolve({ val: () => (v === undefined ? null : JSON.parse(JSON.stringify(v))) }); },
      on(ev, cb){
        const l = { path, active: true, fire: () => {
          if (!l.active) return;
          let v = get(path);
          if (q && q.child){ const o = {}; for (const [k, x] of Object.entries(v || {})) if (x && x[q.child] === q.eq) o[k] = x; v = Object.keys(o).length ? o : null; }
          cb({ val: () => (v === undefined ? null : JSON.parse(JSON.stringify(v))) });
        } };
        listeners.push(l);
        setTimeout(l.fire, 5);
      },
      off(){ listeners.filter(l => l.path === path).forEach(l => { l.active = false; }); },
      async set(v){ put(path, v); setTimeout(refire, 1); },
      async update(v){ for (const [k, x] of Object.entries(v)) put(path + '/' + k, x); setTimeout(refire, 1); },
      async remove(){ put(path, null); setTimeout(refire, 1); }
    };
  }
  const user = { uid: UID };
  const auth = { currentUser: user, onAuthStateChanged(cb){ setTimeout(() => cb(user), 0); }, signInWithCustomToken: async () => {}, signOut: async () => {} };
  const database = Object.assign(() => ({ ref: (p) => makeRef(p || '') }), { ServerValue: { TIMESTAMP: { '.sv': 'timestamp' } } });
  /** @type {any} */ (window).firebase = { initializeApp(){}, database, auth(){ return auth; } };
  // The page logs in as the chosen test person.
  try { localStorage.setItem(TESTMODE_ID_KEY, JSON.stringify({ id: UID, username: (TESTMODE_PEOPLE[UID] || [UID])[0], avatar: null })); } catch (e){ /* ignore */ }
  document.addEventListener('DOMContentLoaded', testModeBar);
})();

/**
 * A made-up "new build" for the game-data changelog (js/forever-changes.js),
 * since the real data/forever/changelog.json only fills with new builds.
 * Real item ids / talent names, invented changes.
 */
function testModeChangelog(){
  const iso = days => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  return { entries: [
    {
      date: iso(1), build: '1.60.2.71000', prevBuild: '1.60.1.70800',
      items: {
        counts: { added: 2, removed: 1, changed: 3 },
        added: [[19145, 'Robe of Volatile Power', 4], [18842, 'Staff of Dominance', 4]],
        removed: [[18205, "Eskhandar's Collar", 4]],
        changed: [
          [17064, 'Shard of the Scale', 4, { s: [[[43, 16]], [[43, 18], [5, 8]]] }],
          [647, 'Destiny', 4, { il: [57, 60], dm: [{ min: 112, max: 168, dps: 53.8 }, { min: 118, max: 177, dps: 56.7 }] }],
          [16921, 'Halo of Transcendence', 4, { s: [[[5, 27], [7, 22]], [[5, 30], [7, 22]]], ar: [137, 145] }]
        ]
      },
      talents: [
        { c: 'Druid', n: 'Moonkin Form', k: 'changed', from: 'Shapeshift into Moonkin Form, increasing Armor contribution from items by 360%, and all party members within 30 yards have their Critical Strike chance increased by 3%.', to: 'Shapeshift into Moonkin Form, increasing Armor contribution from items by 360%, and all party members within 40 yards have their Critical Strike chance increased by 5%.' },
        { c: 'Druid', n: 'Furor', k: 'changed', ranks: [5, 3], from: 'Gives you a 100% chance to gain 10 Rage when you shapeshift into Bear Form or Dire Bear Form.', to: 'Gives you a 100% chance to gain 15 Rage when you shapeshift into Bear Form or Dire Bear Form.' },
        { c: 'Mage', n: 'Arcane Power', k: 'changed', from: 'For the next 15 sec, your spells deal 30% more damage while costing 30% more mana to cast.', to: 'For the next 20 sec, your spells deal 25% more damage while costing 25% more mana to cast.' }
      ]
    },
    {
      date: iso(8), build: '1.60.1.70800', prevBuild: '1.60.1.70205',
      items: { counts: { added: 0, removed: 0, changed: 1 }, added: [], removed: [], changed: [[17068, 'Deathbringer', 4, { rl: [60, 58] }]] },
      talents: [{ c: 'Warrior', n: 'Improved Heroic Strike', k: 'changed', from: 'Reduces the cost of your Heroic Strike ability by 3 Rage.', to: 'Reduces the cost of your Heroic Strike ability by 4 Rage.' }]
    }
  ] };
}

/** Start: remember the real login, become the test admin. */
function testModeStart(){
  try {
    if (!localStorage.getItem(TESTMODE_REAL_ID_KEY)) localStorage.setItem(TESTMODE_REAL_ID_KEY, localStorage.getItem(TESTMODE_ID_KEY) || '');
    localStorage.removeItem(TESTMODE_DB_KEY);
    localStorage.setItem(TESTMODE_KEY, JSON.stringify({ uid: 'test_you' }));
  } catch (e){ return; }
  window.location.hash = '#raids';
  window.location.reload();
}
function testModeStop(){
  try {
    const real = localStorage.getItem(TESTMODE_REAL_ID_KEY);
    if (real) localStorage.setItem(TESTMODE_ID_KEY, real); else localStorage.removeItem(TESTMODE_ID_KEY);
    localStorage.removeItem(TESTMODE_REAL_ID_KEY);
    localStorage.removeItem(TESTMODE_KEY);
    localStorage.removeItem(TESTMODE_DB_KEY);
  } catch (e){ /* ignore */ }
  window.location.reload();
}

/** The bar at the top: who you are, scenario guide, reset, exit. */
function testModeBar(){
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const roleLabel = { admin: 'Admin', officer: 'Officer', member: 'Mitglied', community: 'Community' };
  const bar = document.createElement('div');
  bar.className = 'testmode-bar';
  bar.innerHTML = `<strong>🧪 Testmodus</strong>
    <span class="testmode-note">Erfundene Gilde, nur in diesem Browser — nichts geht in die echte Datenbank oder an Discord.</span>
    <label>Ansicht als <select id="testModeWho">${Object.entries(TESTMODE_PEOPLE).map(([uid, [name, role]]) => `<option value="${uid}" ${uid === RUDE_TESTMODE.uid ? 'selected' : ''}>${esc(name)} · ${roleLabel[role]}</option>`).join('')}</select></label>
    <button type="button" id="testModeGuideBtn">Was testen?</button>
    <button type="button" id="testModeReset">Szenario neu laden</button>
    <button type="button" id="testModeExit">Testmodus beenden</button>
    <div class="testmode-guide hidden" id="testModeGuide">
      <ol>
        <li><b>Raids</b>: Jede Karte öffnet das Raid-Fenster mit den Schritten <b>1 Anmeldung · 2 Aufstellung · 3 Loot</b>.</li>
        <li><b>Onyxia — heute</b> (als Admin/Officer): Tab „Loot“ — Runde 1 ist abgeschlossen, Runde 2 offen. „Abstimmung öffnen“: Offi Olaf hat schon abgestimmt, gib Deine Stimme ab und vergib MS/OS. Deathbringer ist fast nicht mehr handelbar. Danach „Neue Loot-Runde starten“ und eine RCLC-CSV importieren oder Items einzeln hinzufügen.</li>
        <li><b>Ansicht als „Offi Olaf“</b>: gleiche Runde, seine Stimme ist ★ — Stimmen beider Council-Mitglieder sieht jeder im Council sofort.</li>
        <li><b>Barrow Deeps Run 2</b>: Tab „Aufstellung“ — Kraxl und Tanky sind 🔒 (schon in Run 1 dieser ID). Stell 10 Leute zusammen (2/3/5), veröffentliche.</li>
        <li><b>Hyjal</b>: Soft-Reserve-Raid mit Hard-Reserve (Staff of Dominance, nicht reservierbar). Als Officer im Tab „Anmeldung“ weitere HR setzen, „Anmeldung schließen → Aufstellung“ ausprobieren.</li>
        <li><b>Problem melden</b>: Button unten rechts (für alle) — Meldung mit Screenshot abschicken, danach „Deine Meldungen“. Als Admin/Officer: Seite „Meldungen“ (Gilde) mit einer offenen Handy-Meldung inkl. Fehlermeldung; Status setzen und antworten.</li>
        <li><b>Gast-Bewerbungen</b>: Als <b>Neuling Nils</b> oder <b>Gast Gerda</b> (ohne Gildenrolle) zeigt „Raids“ die SR-Raids — Bewerbung mit Armory-Link, Screenshot und Nachricht; Gerda ist angenommen und kann Soft-Reserves setzen. Als Officer im Hyjal-Raid, Tab „Anmeldung“ unten: Gast-Bewerbungen annehmen / ablehnen und antworten.</li>
        <li><b>Boss-Guides</b> (Raid &amp; Loot): Hyjal Summit → Bandalar hat einen Beispiel-Guide (Mechaniken Furcht/Flüche/Adds → hilfreiche Klassen). Als Officer „Bearbeiten“; im Raid „Hyjal — Taktik“ stehen beim Boss die empfohlenen Fähigkeiten oben.</li>
        <li><b>Hyjal — Taktik</b>: Tab „Taktik“ — als Officer pro Boss Seelenstein, Anregen, Flüche, Segen usw. zuweisen, Raidgruppen „Automatisch verteilen“, bei Bandalar Marker auf das Feld ziehen, „MRT-Notiz kopieren“. Als Mitglied (z. B. Seelenbrand) oben „Deine Aufgaben“; Neuling Nils sieht den Tab nicht.</li>
        <li><b>Ansicht als Mitglied</b> (z. B. Feuerfee): Liste zeigt „Angemeldet“ / „In der Aufstellung“; bei Hyjal einen zweiten Charakter anmelden, Soft-Reserve setzen; Loot-Tab zeigt nur die Vergaben.</li>
        <li><b>Loot-Seite</b>: Historie nach Raid / pro Spieler.</li>
        <li><b>Klassen → Allgemein / Druid / Mage / Warrior</b>: Patch-Updates mit automatisch erkannten Änderungen aus zwei erfundenen Builds. Gestern gibt es schon einen handgeschriebenen Beitrag — der automatische Teil hängt dort an und wiederholt nicht, was der Beitrag schon nennt (Destiny, Moonkin Form). Auf Home gibt's dazu eine Neuigkeits-Kachel.</li>
        <li><b>Bewerbung</b>: als „Neuling Nils“ sieht man den Status der eigenen Bewerbung; als Officer die Liste (offen hervorgehoben, Lena in Bearbeitung, Tom angenommen).</li>
        <li><b>Meine Charaktere / Berufe / BiS-Planer</b>: Charaktere bearbeiten (Main/Twink, Berufe, BiS-Set je Spec), Berufe-Verzeichnis durchsuchen („Lionheart“).</li>
      </ol>
    </div>`;
  document.body.prepend(bar);
  document.body.classList.add('testmode-on');
  const who = /** @type {HTMLSelectElement} */ (bar.querySelector('#testModeWho'));
  who.addEventListener('change', () => {
    try { localStorage.setItem(TESTMODE_KEY, JSON.stringify({ uid: who.value })); } catch (e){ /* ignore */ }
    window.location.reload();
  });
  bar.querySelector('#testModeGuideBtn').addEventListener('click', () => bar.querySelector('#testModeGuide').classList.toggle('hidden'));
  bar.querySelector('#testModeReset').addEventListener('click', () => {
    try { localStorage.removeItem(TESTMODE_DB_KEY); } catch (e){ /* ignore */ }
    window.location.reload();
  });
  bar.querySelector('#testModeExit').addEventListener('click', testModeStop);
}
