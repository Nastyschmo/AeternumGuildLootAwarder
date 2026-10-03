// Parses QuestieDB's generated Lua data files, which hold one record per
// line in the form `[123] = {'Name',{1,2},nil,{[5]={{1.5,2}}},...},`.
// Only the literal subset those files use is supported: strings ('…' or
// "…" with backslash escapes), numbers, nil, true/false, and tables with
// positional or `[key]=` entries. Returns Map<id, any[]> (1-based Lua
// positions become 0-based JS indexes; nil stays null).
export function parseLuaRecords(text) {
  const out = new Map();
  for (const line of text.split('\n')) {
    const m = /^\[(\d+)\] = (\{.*\}),?\s*(--.*)?$/.exec(line);
    if (!m) continue;
    const p = { s: m[2], i: 0 };
    out.set(Number(m[1]), toArray(parseValue(p)));
  }
  return out;
}

function toArray(t) {
  if (!t || !t.__lua) return t;
  const arr = [];
  for (let k = 1; k <= t.max; k++) arr.push(k in t.pos ? t.pos[k] : null);
  return arr;
}

function skipWs(p) { while (p.i < p.s.length && /\s/.test(p.s[p.i])) p.i++; }

function parseValue(p) {
  skipWs(p);
  const c = p.s[p.i];
  if (c === '{') return parseTable(p);
  if (c === "'" || c === '"') return parseString(p);
  const m = /^(nil|true|false|-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/i.exec(p.s.slice(p.i));
  if (!m) throw new Error('Unexpected Lua token at ' + p.i + ': ' + p.s.slice(p.i, p.i + 20));
  p.i += m[0].length;
  if (m[0] === 'nil') return null;
  if (m[0] === 'true') return true;
  if (m[0] === 'false') return false;
  return Number(m[0]);
}

function parseString(p) {
  const q = p.s[p.i++];
  let out = '';
  while (p.i < p.s.length && p.s[p.i] !== q) {
    if (p.s[p.i] === '\\') { p.i++; const e = p.s[p.i++]; out += e === 'n' ? '\n' : e; continue; }
    out += p.s[p.i++];
  }
  p.i++;
  return out;
}

// A table becomes { __lua, pos: {1: v, …}, max, keyed: {k: v} } and is
// then flattened: purely positional tables -> arrays, keyed tables ->
// plain objects (positional entries, if any, stay under numeric keys).
function parseTable(p) {
  p.i++; // {
  const pos = {}, keyed = {};
  let n = 0, hasKeyed = false;
  for (;;) {
    skipWs(p);
    if (p.s[p.i] === '}') { p.i++; break; }
    if (p.s[p.i] === '[') {
      p.i++;
      const key = parseValue(p);
      skipWs(p); p.i++; // ]
      skipWs(p); p.i++; // =
      keyed[key] = flatten(parseValue(p));
      hasKeyed = true;
    } else {
      pos[++n] = flatten(parseValue(p));
    }
    skipWs(p);
    if (p.s[p.i] === ',' || p.s[p.i] === ';') p.i++;
  }
  if (hasKeyed) { for (const k in pos) keyed[k] = pos[k]; return keyed; }
  return { __lua: true, pos, max: n };
}

function flatten(v) { return v && v.__lua ? toArray(v) : v; }
