// "Was ist neu in WoW Forever?" — compares the freshly generated data in
// data/forever/ with the last committed version and records what changed
// in data/forever/changelog.json (newest first). The page shows it on the
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
const FIELD_LABELS = { n: 'Name', q: 'Qualität', il: 'Itemlevel', rl: 'Stufe', s: 'Werte', dm: 'Schaden', ar: 'Rüstung', it: 'Slot', b: 'Bindung', set: 'Set' };

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

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** One changelog entry between two data versions, or null if nothing changed. */
function diff(oldItems, newItems, oldTalents, newTalents, date){
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
      const what = fields.filter(f => !same(old[f], it[f]));
      if (what.length) changed.push([id, it.n, it.q || 0, what.map(f => FIELD_LABELS[f])]);
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
      if (!old) talents.push({ c: cls, n: name, k: 'added', to: t.desc });
      else if (old.desc !== t.desc || old.max !== t.max) talents.push({ c: cls, n: name, k: 'changed', from: old.desc, to: t.desc, ...(old.max !== t.max ? { ranks: [old.max, t.max] } : {}) });
    }
    for (const [key] of oldTalents.talents) if (!newTalents.talents.has(key)){ const [cls, name] = key.split('|'); talents.push({ c: cls, n: name, k: 'removed' }); }
    if (talents.length) entry.talents = talents.sort((a, z) => a.c.localeCompare(z.c) || a.n.localeCompare(z.n));
  }
  return entry.items || entry.talents ? entry : null;
}

function load(){ try { return JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { return { entries: [] }; } }
function save(log){
  log.entries = log.entries.slice(0, MAX_ENTRIES);
  fs.writeFileSync(OUT, JSON.stringify(log) + '\n');
}

const today = new Date().toISOString().slice(0, 10);

if (process.argv.includes('--backfill')){
  const revs = git('log', '--reverse', '--format=%H %cs', '--', 'data/forever/items.json', 'data/forever/talents.js').trim().split('\n').filter(Boolean).map(l => l.split(' '));
  const entries = [];
  let prevItems = null, prevTalents = null;
  for (const [rev, date] of revs) {
    const items = parseItems(gitShow(rev, 'data/forever/items.json'));
    const talents = parseTalents(gitShow(rev, 'data/forever/talents.js'));
    const e = diff(prevItems, items, prevTalents, talents, date);
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
    today
  );
  if (!e){ console.log('changelog: no game data changes'); process.exit(0); }
  const log = load();
  log.entries.unshift(e);
  save(log);
  const ic = e.items ? e.items.counts : { added: 0, removed: 0, changed: 0 };
  console.log(`changelog: +${ic.added} / -${ic.removed} / ~${ic.changed} items, ${(e.talents || []).length} talents`);
}
