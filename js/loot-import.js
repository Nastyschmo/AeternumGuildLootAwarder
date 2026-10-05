// Loot-Vergabe, step 2: import a RCLootCouncil CSV export (Loot page,
// officers / admins). Columns used: player ("Name-Realm"), date
// (YYYY/MM/DD), time, id (unique per award — stored as `ext`, so a row is
// never imported twice), item, itemID, response, class, instance, boss,
// note.
//
// The preview lets the officer check and fix before anything is written:
//  - player -> a guild character from Meine Charaktere (by name, realm
//    when ambiguous); unknown players can be assigned by hand or skipped;
//  - response ("Need", "Offspec", "Disenchant" …) -> Main-Spec / Off-Spec /
//    Sonstiges, guessed and changeable per response;
//  - day -> raid event of that day (instance match preferred), changeable.
// "Importieren" writes all rows in one multi-path update.

/** @typedef {{ ext: string, name: string, realm: string, at: number, day: string, itemId: number, itemName: string, response: string, classId: string, instance: string, boss: string, note: string }} LootImportRow */

/** @type {null | { rows: LootImportRow[], respKind: Record<string, string>, dayEvent: Record<string, string>, rowChar: Record<number, string>, msg: string }} */
let lootImport = null;
let lootImportOpen = false;

/** RFC 4180-ish CSV: quoted fields, "" escapes, CRLF. @param {string} text @returns {string[][]} */
function lootParseCsv(text){
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted){
      if (ch === '"' && text[i + 1] === '"'){ field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(f => f.trim())) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some(f => f.trim())) rows.push(row);
  return rows;
}

/** Guess Main-Spec / Off-Spec / Sonstiges from an RCLC response. @param {string} response */
function lootGuessKind(response){
  const r = response.toLowerCase();
  if (/off|greed|minor|second|transmog|pvp/.test(r)) return 'os';
  if (/main|need|bis|upgrade|major|^ms$/.test(r)) return 'ms';
  return 'other'; // Disenchant, Banking, Pass, Autopass, Free …
}

/** Guild characters by lower-case name. @returns {Map<string, { uid: string, char: Character }[]>} */
function lootCharIndex(){
  const out = new Map();
  for (const [uid, prof] of Object.entries(state.characterProfiles || {})) {
    for (const c of prof.characters) {
      const k = c.name.toLowerCase();
      if (!out.has(k)) out.set(k, []);
      out.get(k).push({ uid, char: c });
    }
  }
  return out;
}

/** Local day key "2026-09-20" of a timestamp. @param {number} ms */
function lootDayKey(ms){
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Read the CSV into rows and fill the default mappings. @param {string} text */
function lootImportParse(text){
  const table = lootParseCsv(text);
  if (table.length < 2) return { error: 'Keine Daten gefunden — den kompletten CSV-Export einfügen (mit Kopfzeile).' };
  const head = table[0].map(h => h.trim());
  const col = name => head.indexOf(name);
  for (const need of ['player', 'date', 'itemID', 'response']) if (col(need) < 0) return { error: `Spalte „${need}“ fehlt — ist das ein RCLootCouncil-CSV-Export?` };
  const get = (r, name) => (col(name) >= 0 ? String(r[col(name)] || '').trim() : '');
  /** @type {LootImportRow[]} */
  const rows = [];
  for (const r of table.slice(1)) {
    const itemId = Number(get(r, 'itemID'));
    const [y, m, d] = get(r, 'date').split('/').map(Number);
    if (!(itemId > 0) || !y || !m || !d) continue;
    const [hh, mm, ss] = (get(r, 'time') || '0:0:0').split(':').map(Number);
    const at = new Date(y, m - 1, d, hh || 0, mm || 0, ss || 0).getTime();
    const [name, realm] = get(r, 'player').split('-');
    const nil = v => (v === 'nil' ? '' : v);
    rows.push({
      ext: get(r, 'id').replace(/[.#$/[\]]/g, '_').slice(0, 60),
      name: (name || '').trim(), realm: (realm || '').trim(), at, day: lootDayKey(at),
      itemId, itemName: get(r, 'item').replace(/^\[|\]$/g, '').slice(0, 100),
      response: nil(get(r, 'response')) || 'Unbekannt',
      classId: get(r, 'class').toLowerCase(),
      instance: get(r, 'instance').replace(/-\d+ Player$/, ''),
      boss: (get(r, 'boss') === 'Unknown' ? '' : nil(get(r, 'boss'))).slice(0, 60), note: nil(get(r, 'note')).slice(0, 120)
    });
  }
  if (!rows.length) return { error: 'Keine gültigen Zeilen gefunden.' };
  /** @type {Record<string, string>} */
  const respKind = {};
  for (const row of rows) if (!respKind[row.response]) respKind[row.response] = lootGuessKind(row.response);
  // Day -> the raid event that day, the one with the matching instance first.
  /** @type {Record<string, string>} */
  const dayEvent = {};
  for (const day of new Set(rows.map(row => row.day))) {
    const inst = rows.find(row => row.day === day).instance.toLowerCase();
    const same = Object.entries(raidEvents).filter(([, e]) => lootDayKey(e.start) === day);
    const best = same.find(([, e]) => e.instance && inst.includes(e.instance.toLowerCase())) || same[0];
    dayEvent[day] = best ? best[0] : '';
  }
  // Player -> guild character (realm decides when the name is ambiguous).
  const idx = lootCharIndex();
  /** @type {Record<number, string>} */
  const rowChar = {};
  rows.forEach((row, i) => {
    const hits = idx.get(row.name.toLowerCase()) || [];
    const hit = hits.length > 1 ? (hits.find(h => h.char.realmSlug === row.realm.toLowerCase()) || hits[0]) : hits[0];
    rowChar[i] = hit ? `${hit.uid}|${hit.char.name}` : '';
  });
  return { rows, respKind, dayEvent, rowChar };
}

/** Rows that would be written (assigned, not imported before). */
function lootImportReady(){
  if (!lootImport) return [];
  const done = new Set(Object.values(lootAwards).map(a => a.ext).filter(Boolean));
  return lootImport.rows.map((row, i) => ({ row, i })).filter(({ row, i }) => lootImport.rowChar[i] && !(row.ext && done.has(row.ext)));
}

function lootImportHtml(){
  if (!isOfficerOrAdmin()) return '';
  if (!lootImportOpen) return '<div class="forever-actions"><button type="button" class="btn btn-ghost btn-sm" id="lootImportOpen">Import (RCLootCouncil CSV)</button></div>';
  let body;
  if (!lootImport || !lootImport.rows){
    body = `<p class="bis-hint">RCLootCouncil → Loot History → Export als CSV, den Text hier einfügen oder die Datei wählen.</p>
      <textarea id="lootImportText" class="apply-text-input" rows="6" placeholder="player,date,time,id,item,itemID,…"></textarea>
      <div class="forever-actions">
        <input type="file" id="lootImportFile" accept=".csv,.txt,text/csv">
        <button type="button" class="btn btn-teal btn-sm" id="lootImportRead">Einlesen</button>
      </div>
      ${lootImport && lootImport.msg ? `<p class="bis-hint raid-error">${escapeHtml(lootImport.msg)}</p>` : ''}`;
  } else {
    const imp = lootImport;
    const done = new Set(Object.values(lootAwards).map(a => a.ext).filter(Boolean));
    const ready = lootImportReady();
    const kindSel = (resp) => `<select data-loot-imp-kind="${escapeHtml(resp)}">${Object.entries(LOOT_KIND_LABELS).map(([k, l]) => `<option value="${k}" ${imp.respKind[resp] === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    const days = [...new Set(imp.rows.map(r => r.day))];
    const events = Object.entries(raidEvents).sort((a, z) => z[1].start - a[1].start);
    const chars = [...lootCharIndex().values()].flat().sort((a, z) => a.char.name.localeCompare(z.char.name, 'de'));
    const charSel = i => `<select data-loot-imp-char="${i}"><option value="">— überspringen —</option>${chars.map(h => `<option value="${escapeHtml(h.uid + '|' + h.char.name)}" ${imp.rowChar[i] === h.uid + '|' + h.char.name ? 'selected' : ''}>${escapeHtml(h.char.name)}</option>`).join('')}</select>`;
    const date = ms => new Date(ms).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    body = `<div class="loot-imp-map">
        <div><div class="raid-col-head">Antworten → Art</div>${Object.keys(imp.respKind).map(resp => `<label class="loot-imp-line">${escapeHtml(resp)} ${kindSel(resp)}</label>`).join('')}</div>
        <div><div class="raid-col-head">Tag → Raid-Termin</div>${days.map(day => `<label class="loot-imp-line">${escapeHtml(day.split('-').reverse().join('.'))}
          <select data-loot-imp-day="${day}"><option value="">— ohne Termin —</option>${events.map(([id, e]) => `<option value="${escapeHtml(id)}" ${imp.dayEvent[day] === id ? 'selected' : ''}>${escapeHtml(e.title)} · ${escapeHtml(raidDateLabel(e.start))}</option>`).join('')}</select></label>`).join('')}</div>
      </div>
      <table class="loot-table">
        <thead><tr><th>Zeit</th><th>Item</th><th>Spieler (Export)</th><th>Charakter</th><th>Antwort</th></tr></thead>
        <tbody>${imp.rows.map((r, i) => {
          const dup = r.ext && done.has(r.ext);
          return `<tr class="${dup ? 'loot-imp-dup' : !imp.rowChar[i] ? 'loot-imp-missing' : ''}">
            <td>${date(r.at)}</td><td>${lootItemHtml(r.itemId, r.itemName)}${r.boss ? `<span class="bis-item-meta">${escapeHtml(r.boss)}</span>` : ''}</td>
            <td>${escapeHtml(r.name)}${r.realm ? `<span class="bis-item-meta">${escapeHtml(r.realm)}</span>` : ''}</td>
            <td>${dup ? '<span class="bis-item-meta">schon importiert</span>' : charSel(i)}</td>
            <td>${escapeHtml(r.response)} <span class="bis-item-meta">${LOOT_KIND_LABELS[imp.respKind[r.response]]}</span></td>
          </tr>`;
        }).join('')}</tbody>
      </table>
      <div class="forever-actions">
        <button type="button" class="btn btn-teal btn-sm" id="lootImportWrite" ${ready.length ? '' : 'disabled'}>${ready.length} ${ready.length === 1 ? 'Eintrag' : 'Einträge'} importieren</button>
        <button type="button" class="btn btn-ghost btn-sm" id="lootImportReset">Anderen Export einlesen</button>
        ${imp.msg ? `<span class="bis-hint">${escapeHtml(imp.msg)}</span>` : ''}
      </div>
      <p class="bis-hint">Rot = Spieler nicht unter „Meine Charaktere“ gefunden — Charakter wählen oder überspringen. Ausgegraut = schon importiert.</p>`;
  }
  return `<div class="tac-card loot-import">
    <div class="loot-picked-head"><h3 class="bis-card-title">Import: RCLootCouncil CSV</h3><button type="button" class="btn btn-ghost btn-sm" id="lootImportClose">Schließen</button></div>
    ${body}
  </div>`;
}

/** @param {HTMLElement} root */
function lootImportWire(root){
  const on = (sel, fn) => { const el = root.querySelector(sel); if (el) el.addEventListener('click', fn); };
  on('#lootImportOpen', () => { lootImportOpen = true; renderLootPage(); });
  on('#lootImportClose', () => { lootImportOpen = false; lootImport = null; renderLootPage(); });
  on('#lootImportReset', () => { lootImport = null; renderLootPage(); });
  const read = text => {
    const res = lootImportParse(text);
    lootImport = res.error
      ? { rows: null, respKind: {}, dayEvent: {}, rowChar: {}, msg: res.error }
      : { rows: res.rows, respKind: res.respKind, dayEvent: res.dayEvent, rowChar: res.rowChar, msg: '' };
    renderLootPage();
  };
  on('#lootImportRead', () => read(/** @type {HTMLTextAreaElement} */ (root.querySelector('#lootImportText')).value));
  const file = /** @type {HTMLInputElement | null} */ (root.querySelector('#lootImportFile'));
  if (file) file.addEventListener('change', () => { if (file.files && file.files[0]) file.files[0].text().then(read); });
  root.querySelectorAll('[data-loot-imp-kind]').forEach((/** @type {HTMLSelectElement} */ sel) => sel.addEventListener('change', () => {
    lootImport.respKind[sel.getAttribute('data-loot-imp-kind')] = sel.value; renderLootPage();
  }));
  root.querySelectorAll('[data-loot-imp-day]').forEach((/** @type {HTMLSelectElement} */ sel) => sel.addEventListener('change', () => {
    lootImport.dayEvent[sel.getAttribute('data-loot-imp-day')] = sel.value; renderLootPage();
  }));
  root.querySelectorAll('[data-loot-imp-char]').forEach((/** @type {HTMLSelectElement} */ sel) => sel.addEventListener('change', () => {
    lootImport.rowChar[Number(sel.getAttribute('data-loot-imp-char'))] = sel.value; renderLootPage();
  }));
  on('#lootImportWrite', lootImportWrite);
}

async function lootImportWrite(){
  const ready = lootImportReady();
  if (!ready.length) return;
  const updates = {};
  const idx = lootCharIndex();
  for (const { row, i } of ready) {
    const [uid, charName] = lootImport.rowChar[i].split('|');
    const hit = (idx.get(charName.toLowerCase()) || []).find(h => h.uid === uid);
    const id = newPushId('lootAwards');
    if (!id) return;
    updates[`lootAwards/${id}`] = {
      eventId: lootImport.dayEvent[row.day] || '', itemId: row.itemId, itemName: row.itemName, uid, charName,
      classId: (hit && hit.char.classId) || (CLASS_MAP[row.classId] ? row.classId : ''), specId: (hit && hit.char.specId) || '',
      kind: lootImport.respKind[row.response] || 'other', note: [row.response, row.note].filter(Boolean).join(' · ').slice(0, 120),
      boss: row.boss, ext: row.ext, by: discordIdentity.id, at: row.at
    };
  }
  try {
    await db.ref(DB_PATH).update(updates);
    lootImport.msg = `${ready.length} importiert.`;
  } catch (err){ lootImport.msg = 'Import fehlgeschlagen — Firebase-Regeln aktualisiert?'; }
  renderLootPage();
}
