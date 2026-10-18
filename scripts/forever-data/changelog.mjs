// "Was ist neu in WoW Forever?" — compares the freshly generated data in
// data/forever/ with the last committed version and records what changed
// in data/forever/changelog.json (newest first): items, talents and class
// abilities (spells.json; German texts only where a texts-de.json exists — this site
// keeps game texts English). The page shows it on the
// Klassen page (category "Allgemein", per class for talents) and as a news
// tile on Home (js/forever-changes.js).
//
//   node scripts/forever-data/changelog.mjs
//       working tree vs. HEAD — run by the daily workflow right after
//       update.mjs; adds one entry when something changed.
//   node scripts/forever-data/changelog.mjs --backfill
//       rebuilds the log from the git history of data/forever (every
//       commit that changed items.json / talents.js, oldest first).
//
// Only a new client build counts: a regeneration on the same build means
// our importer changed (better tooltips, new fields), not the game. Within
// a build change only game-relevant fields count (name, quality, item
// level, required level, stats, damage, armor, slot, binding, set) and only
// fields both versions know. Item sources (QuestieDB) and icons are left
// out on purpose.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'data/forever/changelog.json');
const MAX_ENTRIES = 60;
const MAX_LIST = 80;
const ITEM_FIELDS = ['n', 'q', 'il', 'rl', 's', 'dm', 'ar', 'it', 'b', 'set'];

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const gitShow = (rev, file) => { try { return execFileSync('git', ['show', `${rev}:${file}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; } };

/** @param {string | null} text */
function parseItems(text){
  if (!text) return null;
  const data = JSON.parse(text);
  return { build: data.build || '', items: new Map((data.items || []).map(it => [it.id, it])) };
}
/** Talents per class from talents.js: Map<"Class|Talent", { max, desc }>. @param {string | null} text */
function parseTalents(text){
  if (!text) return null;
  const ctx = vm.createContext({});
  ctx.window = ctx;
  vm.runInContext(text, ctx);
  const trees = ctx.FOREVER_TALENT_TREES;
  if (!trees || !trees.classes) return null;
  const out = new Map();
  for (const [cls, c] of Object.entries(trees.classes)) {
    for (const tree of c.trees || []) for (const t of tree.talents || []) {
      const desc = Array.isArray(t.desc) ? (t.desc[t.desc.length - 1] || '') : String(t.desc || '');
      out.set(`${cls}|${t.name}`, { max: t.max, desc });
    }
  }
  return { build: trees.build || '', talents: out };
}

/** German texts from texts-de.json: talents (last rank's text) and abilities. @param {string | null} text */
function parseTextsDe(text){
  if (!text) return null;
  try {
    const data = JSON.parse(text);
    const talents = new Map(Object.entries(data.talents || {}).map(([n, ranks]) => [n, Array.isArray(ranks) ? (ranks[ranks.length - 1] || '') : String(ranks || '')]));
    return { get: n => talents.get(n), spell: n => (data.spells || {})[n] || '' };
  } catch { return null; }
}
/** Class abilities from spells.json: Map<"Class|Ability", { lv, d }> (class capitalized like in talents.js). @param {string | null} text */
function parseSpells(text){
  if (!text) return null;
  try {
    const data = JSON.parse(text);
    const out = new Map();
    for (const [cls, list] of Object.entries(data.classes || {})) {
      const name = cls[0].toUpperCase() + cls.slice(1);
      for (const x of list || []) if (x && x.n) out.set(`${name}|${x.n}`, { lv: x.lv || 0, d: x.d || '' });
    }
    return out;
  } catch { return null; }
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** One changelog entry between two data versions, or null if nothing changed. German talent texts (fromDe / toDe) where texts-de.json has them. */
function diff(oldItems, newItems, oldTalents, newTalents, date, oldDe = null, newDe = null, oldSpells = null, newSpells = null){
  /** @type {any} */
  const entry = { date, build: (newItems && newItems.build) || (newTalents && newTalents.build) || '', prevBuild: (oldItems && oldItems.build) || (oldTalents && oldTalents.build) || '' };
  // Same client build = importer change, not a game change.
  if (!entry.prevBuild || entry.build === entry.prevBuild) return null;
  if (oldItems && newItems){
    // Fields the old data knows at all (a field added by the importer later isn't a game change).
    const known = new Set();
    for (const it of oldItems.items.values()) for (const k of Object.keys(it)) known.add(k);
    const fields = ITEM_FIELDS.filter(f => known.has(f));
    const added = [], removed = [], changed = [];
    for (const [id, it] of newItems.items) {
      const old = oldItems.items.get(id);
      if (!old){ added.push([id, it.n, it.q || 0]); continue; }
      // Changed fields with their old and new value: { il: [57, 60], s: [[[4, 8]], [[4, 10]]] }.
      const what = fields.filter(f => !same(old[f], it[f]));
      if (what.length) changed.push([id, it.n, it.q || 0, Object.fromEntries(what.map(f => [f, [old[f] ?? null, it[f] ?? null]]))]);
    }
    for (const [id, it] of oldItems.items) if (!newItems.items.has(id)) removed.push([id, it.n, it.q || 0]);
    // Best quality first, so the interesting ones survive the cap.
    const byQ = (a, z) => z[2] - a[2] || String(a[1]).localeCompare(String(z[1]));
    if (added.length || removed.length || changed.length){
      entry.items = {
        counts: { added: added.length, removed: removed.length, changed: changed.length },
        added: added.sort(byQ).slice(0, MAX_LIST), removed: removed.sort(byQ).slice(0, MAX_LIST), changed: changed.sort(byQ).slice(0, MAX_LIST)
      };
    }
  }
  if (oldTalents && newTalents){
    const talents = [];
    for (const [key, t] of newTalents.talents) {
      const [cls, name] = key.split('|');
      const old = oldTalents.talents.get(key);
      const toDe = newDe && newDe.get(name) ? { toDe: newDe.get(name) } : {};
      if (!old) talents.push({ c: cls, n: name, k: 'added', to: t.desc, ...toDe });
      else if (old.desc !== t.desc || old.max !== t.max) {
        const de = { ...(oldDe && oldDe.get(name) && toDe.toDe ? { fromDe: oldDe.get(name) } : {}), ...toDe };
        talents.push({ c: cls, n: name, k: 'changed', from: old.desc, to: t.desc, ...de, ...(old.max !== t.max ? { ranks: [old.max, t.max] } : {}) });
      }
    }
    for (const [key] of oldTalents.talents) if (!newTalents.talents.has(key)){ const [cls, name] = key.split('|'); talents.push({ c: cls, n: name, k: 'removed' }); }
    if (talents.length) entry.talents = talents.sort((a, z) => a.c.localeCompare(z.c) || a.n.localeCompare(z.n));
  }
  // Class abilities (spells.json): new, removed, changed text or level. Talents are left
  // out (they have their own list); German texts where texts-de.json has them.
  if (oldSpells && newSpells){
    const talentNames = new Set([...(newTalents ? newTalents.talents.keys() : []), ...(oldTalents ? oldTalents.talents.keys() : [])]);
    const abilities = [];
    for (const [key, x] of newSpells) {
      if (talentNames.has(key)) continue;
      const [cls, name] = key.split('|');
      const old = oldSpells.get(key);
      const toDe = newDe && newDe.spell(name) ? { toDe: newDe.spell(name) } : {};
      if (!old) abilities.push({ c: cls, n: name, k: 'added', to: x.d, lv: [null, x.lv], ...toDe });
      // A text that only lost a resolved number to a raw "$w1" variable is our importer, not the game.
      else if ((old.d !== x.d && !(/\$\w/.test(x.d) && !/\$\w/.test(old.d))) || old.lv !== x.lv) {
        const de = { ...(oldDe && oldDe.spell(name) && toDe.toDe ? { fromDe: oldDe.spell(name) } : {}), ...toDe };
        const textChanged = old.d !== x.d && !(/\$\w/.test(x.d) && !/\$\w/.test(old.d));
        abilities.push({ c: cls, n: name, k: 'changed', ...(textChanged ? { from: old.d, to: x.d, ...de } : {}), ...(old.lv !== x.lv ? { lv: [old.lv, x.lv] } : {}) });
      }
    }
    for (const [key] of oldSpells) if (!newSpells.has(key) && !talentNames.has(key)){ const [cls, name] = key.split('|'); abilities.push({ c: cls, n: name, k: 'removed' }); }
    if (abilities.length) entry.abilities = abilities.sort((a, z) => a.c.localeCompare(z.c) || a.n.localeCompare(z.n));
  }
  return entry.items || entry.talents || entry.abilities ? entry : null;
}

function load(){ try { return JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { return { entries: [] }; } }
function save(log){
  log.entries = log.entries.slice(0, MAX_ENTRIES);
  fs.writeFileSync(OUT, JSON.stringify(log) + '\n');
}

/** A data file, or null when it doesn't exist (yet). @param {string} file */
const readOpt = file => { try { return fs.readFileSync(path.join(ROOT, file), 'utf8'); } catch { return null; } };

const today = new Date().toISOString().slice(0, 10);

// --merge-abilities=<changelog.json>: one-time, takes the "abilities" of builds this log
// has but without them from another changelog of the same game data (nasty-gaming's,
// whose history has spells.json) — rude's history only has spells.json from now on.
const mergeArg = process.argv.find(a => a.startsWith('--merge-abilities='));
if (mergeArg){
  const other = JSON.parse(fs.readFileSync(mergeArg.slice('--merge-abilities='.length), 'utf8'));
  const log = load();
  let n = 0;
  for (const e of log.entries) {
    if (e.abilities) continue;
    const o = (other.entries || []).find(x => x.build === e.build && x.prevBuild === e.prevBuild);
    // Game texts stay English on this site: no German fields.
    if (o && o.abilities) { e.abilities = o.abilities.map(({ fromDe, toDe, ...x }) => x); n++; }
  }
  save(log);
  console.log(`changelog: abilities merged into ${n} entries`);
  process.exit(0);
}

if (process.argv.includes('--backfill')){
  const revs = git('log', '--reverse', '--format=%H %cs', '--', 'data/forever/items.json', 'data/forever/talents.js').trim().split('\n').filter(Boolean).map(l => l.split(' '));
  const entries = [];
  let prevItems = null, prevTalents = null;
  for (const [rev, date] of revs) {
    const items = parseItems(gitShow(rev, 'data/forever/items.json'));
    const talents = parseTalents(gitShow(rev, 'data/forever/talents.js'));
    // German texts: the file right before this commit (it can change without items / talents changing).
    const de = parseTextsDe(gitShow(rev, 'data/forever/texts-de.json'));
    const e = diff(prevItems, items, prevTalents, talents, date, parseTextsDe(gitShow(`${rev}^`, 'data/forever/texts-de.json')), de,
      parseSpells(gitShow(`${rev}^`, 'data/forever/spells.json')), parseSpells(gitShow(rev, 'data/forever/spells.json')));
    if (e) entries.unshift(e);
    if (items) prevItems = items;
    if (talents) prevTalents = talents;
  }
  save({ entries });
  console.log(`changelog: backfilled ${entries.length} entries from ${revs.length} commits`);
} else {
  const e = diff(
    parseItems(gitShow('HEAD', 'data/forever/items.json')), parseItems(fs.readFileSync(path.join(ROOT, 'data/forever/items.json'), 'utf8')),
    parseTalents(gitShow('HEAD', 'data/forever/talents.js')), parseTalents(fs.readFileSync(path.join(ROOT, 'data/forever/talents.js'), 'utf8')),
    today,
    parseTextsDe(gitShow('HEAD', 'data/forever/texts-de.json')), parseTextsDe(readOpt('data/forever/texts-de.json')),
    parseSpells(gitShow('HEAD', 'data/forever/spells.json')), parseSpells(readOpt('data/forever/spells.json'))
  );
  if (!e){ console.log('changelog: no game data changes'); process.exit(0); }
  const log = load();
  log.entries.unshift(e);
  save(log);
  const ic = e.items ? e.items.counts : { added: 0, removed: 0, changed: 0 };
  console.log(`changelog: +${ic.added} / -${ic.removed} / ~${ic.changed} items, ${(e.talents || []).length} talents, ${(e.abilities || []).length} abilities`);
}
