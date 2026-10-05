// Raids: the Aufstellung (raid composition) of an event.
//
// Officers / Admins pick from all signed-up characters (Dabei /
// Vielleicht) who is in the raid — at most one character per player —
// against target numbers per role (tank / healer / damage, defaults by
// raid size). Stored on the event (raidEvents/<id>: size, targets,
// roster { "<uid>|<charKey>": true }, rosterPublished), so no extra rules.
// Members see it once published: the line-up by role plus the bench
// (Ersatzbank) of everyone else who signed up as Dabei.

/** Default targets per raid size. */
const RAID_COMP_DEFAULTS = { 10: { tank: 2, healer: 3, damage: 5 }, 20: { tank: 2, healer: 5, damage: 13 }, 40: { tank: 4, healer: 10, damage: 26 } };
const RAID_ROLE_LABELS = { tank: 'Tanks', healer: 'Heiler', damage: 'Damage' };
/** Events whose Aufstellung panel is open. */
const raidCompOpen = new Set();

/** Raid size of an event (set, else from the instance, else 0). @param {RaidEvent} e */
function raidEventSize(e){
  return e.size || RAID_INSTANCES[e.instance] || 0;
}
/** Target numbers per role. @param {RaidEvent} e */
function raidCompTargets(e){
  return e.targets || RAID_COMP_DEFAULTS[raidEventSize(e) || 20];
}
/** Picked sign-ups of the event (only those still signed up). @param {string} id @param {RaidEvent} e */
function raidCompPicked(id, e){
  return raidSignupList(id).filter(s => e.roster[s.key] && s.status !== 'no');
}

/** Published line-up for everyone. @param {string} id @param {RaidEvent} e */
function raidCompPublishedHtml(id, e){
  const picked = raidCompPicked(id, e);
  const pickedUids = new Set(picked.map(s => s.uid));
  const bench = raidSignupList(id).filter(s => s.status === 'yes' && !pickedUids.has(s.uid));
  // One chip per benched player: their characters joined.
  const benchByUid = new Map();
  for (const s of bench) { if (!benchByUid.has(s.uid)) benchByUid.set(s.uid, []); benchByUid.get(s.uid).push(s); }
  const col = role => {
    const list = picked.filter(s => s.role === role);
    return `<div class="raid-col"><div class="raid-col-head">${RAID_ROLE_LABELS[role]} <span>${list.length}</span></div>${list.length ? list.map(raidChipHtml).join('') : '<span class="bis-item-meta">—</span>'}</div>`;
  };
  return `<div class="raid-comp-published">
    <div class="raid-col-head">Aufstellung <span>${picked.length}${raidEventSize(e) ? `/${raidEventSize(e)}` : ''} · von den Offizieren veröffentlicht</span></div>
    <div class="raid-roster">${col('tank')}${col('healer')}${col('damage')}</div>
    ${benchByUid.size ? `<div class="raid-roster-extra"><div><span class="raid-col-head">Ersatzbank</span> ${[...benchByUid.values()].map(list => list.map(raidChipHtml).join('')).join(' ')}</div></div>` : ''}
  </div>`;
}

/** Officer panel to build the line-up. @param {string} id @param {RaidEvent} e */
function raidCompPanelHtml(id, e){
  const open = raidCompOpen.has(id);
  const picked = raidCompPicked(id, e);
  const t = raidCompTargets(e);
  const count = role => picked.filter(s => s.role === role).length;
  const summary = `${picked.length}${raidEventSize(e) ? `/${raidEventSize(e)}` : ''} · ${['tank', 'healer', 'damage'].map(r => `${RAID_ROLE_LABELS[r]} ${count(r)}/${t[r]}`).join(' · ')}`;
  if (!open){
    return `<div class="raid-comp-bar"><span class="raid-col-head">Aufstellung <span>${summary}${e.rosterPublished ? ' · veröffentlicht' : picked.length ? ' · Entwurf' : ''}</span></span>
      <button type="button" class="btn btn-ghost btn-sm" data-raid-comp-toggle="${escapeHtml(id)}">Aufstellung bearbeiten</button></div>`;
  }
  const signups = raidSignupList(id).filter(s => s.status !== 'no');
  const pickedByUid = new Map(picked.map(s => [s.uid, s.key]));
  const row = s => {
    const char = raidSignupChar(s.uid, s.charKey, s.charName);
    const prof = state.characterProfiles[s.uid];
    const other = pickedByUid.has(s.uid) && pickedByUid.get(s.uid) !== s.key;
    const isPicked = Boolean(e.roster[s.key]);
    return `<label class="raid-comp-row${isPicked ? ' picked' : ''}${other ? ' other' : ''}">
      <input type="checkbox" data-raid-comp-pick="${escapeHtml(id)}" value="${escapeHtml(s.key)}" ${isPicked ? 'checked' : ''}>
      ${raidChipHtml(s)}
      <span class="bis-item-meta">${escapeHtml(foreverSpecLabel(s.classId, s.specId))}${prof && prof.nickname ? ` · ${escapeHtml(prof.nickname)}` : ''}${char && !characterIsRaider(char) ? ' · Twink' : ''}${s.status === 'maybe' ? ' · vielleicht' : ''}${other ? ' · anderer Char gewählt' : ''}</span>
    </label>`;
  };
  const roleCol = role => {
    const list = signups.filter(s => s.role === role)
      .sort((a, z) => Number(Boolean(e.roster[z.key])) - Number(Boolean(e.roster[a.key])) || Number(a.status === 'maybe') - Number(z.status === 'maybe') || (a.charName || '').localeCompare(z.charName || '', 'de'));
    const n = count(role), goal = t[role];
    return `<div class="raid-comp-col">
      <div class="raid-col-head">${RAID_ROLE_LABELS[role]} <span class="${n < goal ? 'raid-comp-short' : n > goal ? 'raid-comp-over' : 'raid-comp-ok'}">${n}/${goal}</span>
        <input type="number" min="0" max="40" class="raid-comp-target" data-raid-comp-target="${escapeHtml(id)}|${role}" value="${goal}" title="Ziel ${RAID_ROLE_LABELS[role]}"></div>
      ${list.length ? list.map(row).join('') : '<span class="bis-item-meta">Keine Anmeldungen.</span>'}
    </div>`;
  };
  return `<div class="raid-comp-panel">
    <div class="raid-comp-bar"><span class="raid-col-head">Aufstellung <span>${summary}</span></span>
      <button type="button" class="btn btn-ghost btn-sm" data-raid-comp-toggle="${escapeHtml(id)}">Schließen</button></div>
    <p class="bis-hint">Pro Spieler höchstens ein Charakter — wer einen anderen Char wählt, ersetzt den bisherigen. Zielzahlen rechts neben den Rollen anpassbar.</p>
    <div class="raid-comp-cols">${roleCol('tank')}${roleCol('healer')}${roleCol('damage')}</div>
    <div class="forever-actions">
      ${e.rosterPublished
        ? `<button type="button" class="btn btn-ghost btn-sm" data-raid-comp-publish="${escapeHtml(id)}|0">Veröffentlichung zurückziehen</button><span class="bis-hint">Veröffentlicht — Änderungen sind sofort sichtbar.</span>`
        : `<button type="button" class="btn btn-teal btn-sm" data-raid-comp-publish="${escapeHtml(id)}|1" ${picked.length ? '' : 'disabled'}>Aufstellung veröffentlichen</button><span class="bis-hint">Entwurf — nur Offiziere sehen ihn.</span>`}
    </div>
  </div>`;
}

/** @param {HTMLElement} root */
function raidCompWire(root){
  const ref = id => db.ref(`${DB_PATH}/raidEvents/${id}`);
  const fail = () => { raidStatusMsg = 'Aufstellung konnte nicht gespeichert werden.'; renderRaidsPage(); };
  root.querySelectorAll('[data-raid-comp-toggle]').forEach(btn => btn.addEventListener('click', () => {
    const id = btn.getAttribute('data-raid-comp-toggle');
    if (raidCompOpen.has(id)) raidCompOpen.delete(id); else raidCompOpen.add(id);
    renderRaidsPage();
  }));
  root.querySelectorAll('[data-raid-comp-pick]').forEach((/** @type {HTMLInputElement} */ box) => box.addEventListener('change', () => {
    const id = box.getAttribute('data-raid-comp-pick');
    const e = raidEvents[id];
    if (!e) return;
    const key = box.value;
    const uid = key.split('|')[0];
    /** @type {Record<string, true | null>} */
    const updates = {};
    // One character per player: picking another one replaces the old pick.
    for (const k of Object.keys(e.roster)) if (k.split('|')[0] === uid) updates[k] = null;
    if (box.checked) updates[key] = true;
    // First pick: store the targets too, so they stay with the event.
    const extra = e.targets ? {} : { targets: raidCompTargets(e), size: raidEventSize(e) || 20 };
    ref(id).update({ ...Object.fromEntries(Object.entries(updates).map(([k, v]) => [`roster/${k}`, v])), ...extra }).catch(fail);
  }));
  root.querySelectorAll('[data-raid-comp-target]').forEach((/** @type {HTMLInputElement} */ input) => input.addEventListener('change', () => {
    const [id, role] = input.getAttribute('data-raid-comp-target').split('|');
    const e = raidEvents[id];
    if (!e) return;
    const targets = { ...raidCompTargets(e), [role]: Math.max(0, Math.min(40, Math.trunc(Number(input.value)) || 0)) };
    ref(id).update({ targets }).catch(fail);
  }));
  root.querySelectorAll('[data-raid-comp-publish]').forEach(btn => btn.addEventListener('click', () => {
    const [id, on] = btn.getAttribute('data-raid-comp-publish').split('|');
    ref(id).update({ rosterPublished: on === '1' }).catch(fail);
  }));
}
