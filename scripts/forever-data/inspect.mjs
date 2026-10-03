// One-off discovery run for the Forever data pipeline: prints what
// wago.tools and QuestieDB actually return (latest build, CSV headers,
// sample rows for a few well-known items) so the real importer can be
// written against the actual column names. Runs in GitHub Actions, since
// wago.tools isn't reachable from every dev environment.
import { parseCsv } from './csv.mjs';

const WAGO = 'https://wago.tools';
const PRODUCT = 'wow_classic_beta';
const SAMPLE_IDS = new Set(['12640', '15063', '19019', '13340', '16707']); // Lionheart Helm, Devilsaur Gauntlets, Thunderfury, Cape of the Black Baron, Shadowcraft Cap

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'rude-guild-page data importer (github.com/Nastyschmo/AeternumGuildLootAwarder)' } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}

const buildsRaw = await get(`${WAGO}/api/builds`);
let builds;
try { builds = JSON.parse(buildsRaw); } catch (e) { console.log('builds not JSON:', buildsRaw.slice(0, 500)); throw e; }
console.log('builds top-level type:', Array.isArray(builds) ? 'array' : typeof builds, 'keys:', Array.isArray(builds) ? '' : Object.keys(builds).slice(0, 40).join(','));
const list = Array.isArray(builds) ? builds.filter(b => (b.product || b.Product) === PRODUCT) : builds[PRODUCT];
console.log(`${PRODUCT} entries:`, JSON.stringify((list || []).slice(0, 5), null, 1));
const latest = (list || [])[0];
const build = latest && (latest.version || latest.Version || latest.build || latest);
console.log('using build:', build);

for (const table of ['ItemSparse', 'Item', 'RandPropPoints', 'AreaTable', 'ItemSet']) {
  try {
    const csv = await get(`${WAGO}/db2/${table}/csv?build=${encodeURIComponent(build)}`);
    const rows = parseCsv(csv);
    const header = rows[0];
    console.log(`\n=== ${table}: ${rows.length - 1} rows, ${header.length} columns`);
    console.log(header.join(' | '));
    const idCol = header.indexOf('ID');
    const samples = table === 'RandPropPoints' ? rows.slice(55, 66) : rows.filter(r => SAMPLE_IDS.has(r[idCol]));
    for (const r of samples.slice(0, 6)) console.log(JSON.stringify(Object.fromEntries(header.map((h, i) => [h, r[i]]).filter(([, v]) => v !== '' && v !== '0'))));
  } catch (e) {
    console.log(`\n=== ${table}: FAILED ${e.message}`);
  }
}

const QDB = 'https://raw.githubusercontent.com/Questie/QuestieDB/main/data/Forever';
for (const f of ['foreverItemDB.lua', 'foreverNpcDB.lua', 'foreverQuestDB.lua']) {
  try {
    const txt = await get(`${QDB}/${f}`);
    console.log(`\n=== QuestieDB ${f}: ${txt.length} bytes, ${txt.split('\n').filter(l => /^\[\d+\] = /.test(l)).length} records`);
  } catch (e) {
    console.log(`\n=== QuestieDB ${f}: FAILED ${e.message}`);
  }
}
