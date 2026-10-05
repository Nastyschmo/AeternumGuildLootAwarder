// Loot-Runde: import a RCLootCouncil CSV export into a running Loot-Runde
// (js/loot-session.js, officers / admins). Columns used: player
// ("Name-Realm"), date (YYYY/MM/DD), time, id (unique per row — kept as
// `ext`, so a row is never imported twice into the same raid), item,
// itemID, response, instance, boss, note.
//
// Every row becomes an item of the Loot-Runde (what dropped); the player
// and response from RCLC are kept as a hint (the item's "RCLC" line and a
// tag on that character in the voting pop-up). The preview pre-selects the
// rows from the raid's evening that aren't in this raid yet.

/** @typedef {{ ext: string, name: string, realm: string, at: number, day: string, itemId: number, itemName: string, response: string, instance: string, boss: string, note: string }} LootImportRow */

/** Import preview of one Loot-Runde. @type {null | { eventId: string, sid: string, rows: LootImportRow[] | null, pick: Set<number>, msg: string }} */
let lootImport = null;

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

/** Local day key "2026-09-20" of a timestamp. @param {number} ms */
function lootDayKey(ms){
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Read the CSV into rows. @param {string} text @returns {{ rows: LootImportRow[], error?: undefined } | { error: string, rows?: undefined }} */
function lootImportParse(text){
  const table = lootParseCsv(text);
  if (table.length < 2) return { error: 'Keine Daten gefunden — den kompletten CSV-Export einfügen (mit Kopfzeile).' };
  const head = table[0].map(h => h.trim());
  const col = name => head.indexOf(name);
  for (const need of ['player', 'date', 'itemID']) if (col(need) < 0) return { error: `Spalte „${need}“ fehlt — ist das ein RCLootCouncil-CSV-Export?` };
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
      name: (name || '').trim().slice(0, 40), realm: (realm || '').trim(), at, day: lootDayKey(at),
      itemId, itemName: get(r, 'item').replace(/^\[|\]$/g, '').slice(0, 100),
      response: (nil(get(r, 'response')) || '').slice(0, 40),
      instance: get(r, 'instance').replace(/-\d+ Player$/, ''),
      boss: (get(r, 'boss') === 'Unknown' ? '' : nil(get(r, 'boss'))).slice(0, 60), note: nil(get(r, 'note')).slice(0, 120)
    });
  }
  if (!rows.length) return { error: 'Keine gültigen Zeilen gefunden.' };
  return { rows };
}

/** RCLC row ids already in this raid (any Loot-Runde, or the history). @param {string} eventId */
function lootImportedExts(eventId){
  const out = new Set(Object.values(lootAwards).filter(a => a.eventId === eventId && a.ext).map(a => a.ext));
  for (const s of Object.values(lootSessions[eventId] || {})) for (const it of Object.values(s.items)) if (it.ext) out.add(it.ext);
  return out;
}

/** Import box of a Loot-Runde. @param {string} eventId @param {string} sid */
function lootImportHtml(eventId, sid){
  const imp = lootImport && lootImport.eventId === eventId && lootImport.sid === sid ? lootImport : null;
  if (!imp || !imp.rows){
    return `<div class="loot-import" data-loot-imp="${escapeHtml(eventId)}|${escapeHtml(sid)}">
      <p class="bis-hint">RCLootCouncil → Loot History → Export als CSV: den Text einfügen oder die Datei wählen.</p>
      <textarea class="apply-text-input" data-loot-imp-text rows="4" placeholder="player,date,time,id,item,itemID,…"></textarea>
      <div class="forever-actions">
        <input type="file" data-loot-imp-file accept=".csv,.txt,text/csv">
        <button type="button" class="btn btn-teal btn-sm" data-loot-imp-read>Einlesen</button>
      </div>
      ${imp && imp.msg ? `<p class="bis-hint raid-error">${escapeHtml(imp.msg)}</p>` : ''}
    </div>`;
  }
  const done = lootImportedExts(eventId);
  const date = ms => new Date(ms).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return `<div class="loot-import" data-loot-imp="${escapeHtml(eventId)}|${escapeHtml(sid)}">
    <table class="loot-table">
      <thead><tr><th></th><th>Zeit</th><th>Item</th><th>RCLC</th></tr></thead>
      <tbody>${imp.rows.map((r, i) => {
        const dup = Boolean(r.ext && done.has(r.ext));
        return `<tr class="${dup ? 'loot-imp-dup' : ''}">
          <td><input type="checkbox" data-loot-imp-pick="${i}" ${imp.pick.has(i) && !dup ? 'checked' : ''} ${dup ? 'disabled title="Schon in diesem Raid"' : ''}></td>
          <td>${date(r.at)}</td>
          <td>${lootItemHtml(r.itemId, r.itemName)}${r.boss ? `<span class="bis-item-meta">${escapeHtml(r.boss)}</span>` : ''}</td>
          <td>${escapeHtml(r.name)}${r.response ? `<span class="bis-item-meta">${escapeHtml(r.response)}</span>` : ''}${dup ? '<span class="bis-item-meta">schon übernommen</span>' : ''}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>
    <div class="forever-actions">
      <button type="button" class="btn btn-teal btn-sm" data-loot-imp-write ${imp.pick.size ? '' : 'disabled'}>${imp.pick.size} ${imp.pick.size === 1 ? 'Item' : 'Items'} in die Runde übernehmen</button>
      <button type="button" class="btn btn-ghost btn-sm" data-loot-imp-reset>Anderen Export</button>
      ${imp.msg ? `<span class="bis-hint">${escapeHtml(imp.msg)}</span>` : ''}
    </div>
    <p class="bis-hint">Vorausgewählt: Zeilen vom Raid-Abend, die noch nicht in diesem Raid sind. Ausgegraut = schon übernommen.</p>
  </div>`;
}

/** @param {HTMLElement} root */
function lootImportWire(root){
  root.querySelectorAll('[data-loot-imp]').forEach((/** @type {HTMLElement} */ box) => {
    const [eventId, sid] = box.getAttribute('data-loot-imp').split('|');
    const on = (sel, fn) => { const el = box.querySelector(sel); if (el) el.addEventListener('click', fn); };
    const read = text => {
      const res = lootImportParse(text);
      if (res.error){ lootImport = { eventId, sid, rows: null, pick: new Set(), msg: res.error }; renderRaidsPage(); return; }
      const e = raidEvents[eventId];
      const done = lootImportedExts(eventId);
      const fresh = res.rows.map((r, i) => ({ r, i })).filter(({ r }) => !(r.ext && done.has(r.ext)));
      // The raid's evening: from 2 h before the start to the end of the raid day.
      const tonight = e ? fresh.filter(({ r }) => r.at >= e.start - 2 * 3600000 && r.at < raidDayEnd(e)) : [];
      lootImport = { eventId, sid, rows: res.rows, pick: new Set((tonight.length ? tonight : fresh).map(x => x.i)), msg: '' };
      renderRaidsPage();
    };
    on('[data-loot-imp-read]', () => read(/** @type {HTMLTextAreaElement} */ (box.querySelector('[data-loot-imp-text]')).value));
    const file = /** @type {HTMLInputElement | null} */ (box.querySelector('[data-loot-imp-file]'));
    if (file) file.addEventListener('change', () => { if (file.files && file.files[0]) file.files[0].text().then(read); });
    on('[data-loot-imp-reset]', () => { lootImport = null; renderRaidsPage(); });
    box.querySelectorAll('[data-loot-imp-pick]').forEach((/** @type {HTMLInputElement} */ cb) => cb.addEventListener('change', () => {
      const i = Number(cb.getAttribute('data-loot-imp-pick'));
      if (cb.checked) lootImport.pick.add(i); else lootImport.pick.delete(i);
      renderRaidsPage();
    }));
    on('[data-loot-imp-write]', () => lootImportWrite(eventId, sid));
  });
}

/** Write the picked rows as items of the Loot-Runde. @param {string} eventId @param {string} sid */
async function lootImportWrite(eventId, sid){
  if (!lootImport || !lootImport.rows) return;
  const done = lootImportedExts(eventId);
  /** @type {Record<string, any>} */
  const updates = {};
  let n = 0;
  for (const i of lootImport.pick) {
    const row = lootImport.rows[i];
    if (!row || (row.ext && done.has(row.ext))) continue;
    const key = newPushId(`lootSessions/${eventId}/${sid}/items`);
    if (!key) return;
    updates[`lootSessions/${eventId}/${sid}/items/${key}`] = {
      itemId: row.itemId, itemName: row.itemName, at: row.at,
      ...(row.boss ? { boss: row.boss } : {}), ...(row.ext ? { ext: row.ext } : {}),
      ...(row.name ? { rclcName: row.name } : {}), ...(row.response ? { rclcResponse: row.response } : {})
    };
    n++;
  }
  if (!n) return;
  try {
    await db.ref(DB_PATH).update(updates);
    lootImport = null;
    lootSessOpenImport = '';
    raidStatusMsg = '';
  } catch (err){ lootImport.msg = 'Import fehlgeschlagen — Firebase-Regeln aktualisiert?'; }
  renderRaidsPage();
}
