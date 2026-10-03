// Keeps the "How to play" guide (data/howtoplay.js) honest against the
// talent data, which the daily Forever-data workflow refreshes from the
// game client (data/forever/talents.js, merged in data/talentsforever.js).
//
// data/howtoplay-baseline.json records, for every talent the guide text
// names, its rank count and max-rank text as they were when the guide was
// last reviewed. The page compares that against the live data and shows
// a notice on the card (js/how-to-play.js); this script does the same in
// CI.
//
//   node scripts/howtoplay/check.mjs             report talents that
//       changed / disappeared since the baseline (exit 0). In GitHub
//       Actions the report also goes to the job summary and, with
//       --report-file=<path>, to a markdown file (used for the issue).
//   node scripts/howtoplay/check.mjs --strict    also fail when the guide
//       and the baseline disagree (a talent named in the text is missing
//       from the baseline or the other way round) — run on every PR.
//   node scripts/howtoplay/check.mjs --baseline  rewrite the baseline
//       from the current guide + talent data (after reviewing the guide).

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BASELINE = path.join(ROOT, 'data/howtoplay-baseline.json');
const args = process.argv.slice(2);
const flag = name => args.includes(name);
const reportFile = (args.find(a => a.startsWith('--report-file=')) || '').slice('--report-file='.length);

// Load the classic scripts the way the page does (shared global scope).
const ctx = vm.createContext({ console });
ctx.window = ctx;
for (const file of ['data/forever/talents.js', 'data/talentsforever.js', 'data/howtoplay.js']) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) continue;
  vm.runInContext(fs.readFileSync(full, 'utf8'), ctx, { filename: file });
}
const TALENT_DATA = vm.runInContext('TALENT_DATA', ctx);
const HOW_TO_PLAY = vm.runInContext('HOW_TO_PLAY', ctx);
const UPDATED = vm.runInContext('HOW_TO_PLAY_UPDATED', ctx);
const build = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'data/forever/meta.json'), 'utf8')).build; } catch { return ''; } })();

const label = id => id[0].toUpperCase() + id.slice(1);
/** What the page and the baseline compare: rank count + max-rank text. */
const signature = t => ({ max: t.max, desc: Array.isArray(t.desc) ? (t.desc[t.desc.length - 1] || '') : String(t.desc || '') });
const talentsOf = classId => new Map(((TALENT_DATA[label(classId)] || {}).trees || []).flatMap(tr => tr.talents.map(t => [t.name, t])));

/** All guide text of a class (not the sources). */
function guideText(g) {
  const parts = [g.intro, g.leveling, g.races];
  for (const s of Object.values(g.specs)) parts.push(s.summary, s.playstyle, s.stats, ...s.priority, ...s.tips);
  return parts.join('\n');
}
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Talents named in the guide — same word boundaries as annotateSpellMentions. */
function mentioned(classId) {
  const text = guideText(HOW_TO_PLAY[classId]);
  return [...talentsOf(classId).keys()]
    .filter(name => new RegExp(`(^|[^A-Za-zÀ-ÖØ-öø-ÿ0-9'])${escapeRe(name)}(?![A-Za-zÀ-ÖØ-öø-ÿ0-9'])`).test(text))
    .sort();
}

if (flag('--baseline')) {
  const classes = {};
  for (const classId of Object.keys(HOW_TO_PLAY)) {
    const live = talentsOf(classId);
    classes[classId] = Object.fromEntries(mentioned(classId).map(n => [n, signature(live.get(n))]));
  }
  fs.writeFileSync(BASELINE, JSON.stringify({ updated: UPDATED, build, classes }, null, 1) + '\n');
  const n = Object.values(classes).reduce((s, c) => s + Object.keys(c).length, 0);
  console.log(`howtoplay baseline written: ${n} talents, guide ${UPDATED}, build ${build}`);
  process.exit(0);
}

const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
const lines = [];
const problems = [];
let drift = 0;
for (const classId of Object.keys(HOW_TO_PLAY)) {
  const base = baseline.classes[classId] || {};
  const live = talentsOf(classId);
  const rows = [];
  for (const [name, old] of Object.entries(base)) {
    const t = live.get(name);
    if (!t) { rows.push(`- **${name}** — nicht mehr im Talentbaum`); continue; }
    const now = signature(t);
    if (now.max !== old.max || now.desc !== old.desc) {
      rows.push(`- **${name}**${now.max !== old.max ? ` (Ränge ${old.max} → ${now.max})` : ''}\n  - vorher: ${old.desc}\n  - jetzt: ${now.desc}`);
    }
  }
  if (rows.length) { drift += rows.length; lines.push(`### ${label(classId)}`, ...rows, ''); }
  if (flag('--strict')) {
    const names = mentioned(classId), baseNames = Object.keys(base);
    const missing = names.filter(n => !baseNames.includes(n));
    const extra = baseNames.filter(n => !names.includes(n));
    if (missing.length) problems.push(`${classId}: im Text, fehlt in der Baseline: ${missing.join(', ')}`);
    if (extra.length) problems.push(`${classId}: in der Baseline, nicht mehr im Text: ${extra.join(', ')}`);
  }
}

const report = drift
  ? [`Seit dem Guide-Stand ${baseline.updated} (Build ${baseline.build}) haben sich ${drift} im How-to-play genannte Talente geändert (jetzt Build ${build}). Bitte die betroffenen Texte in \`data/howtoplay.js\` prüfen, danach \`node scripts/howtoplay/check.mjs --baseline\` ausführen und \`HOW_TO_PLAY_UPDATED\` anpassen.`, '', ...lines].join('\n')
  : '';
console.log(drift ? report : `howtoplay: no talent changes since ${baseline.updated} (build ${build}).`);
if (reportFile) fs.writeFileSync(reportFile, report);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## How to play\n\n${report || 'Keine Talent-Änderungen seit dem Guide-Stand.'}\n`);
if (problems.length) {
  console.error('Guide and baseline disagree — run `node scripts/howtoplay/check.mjs --baseline` after reviewing the guide:\n' + problems.join('\n'));
  process.exit(1);
}
