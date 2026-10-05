// Bewerbung: chat-style application flow, Discord notifications, recruiting
// needs editor, applications list for Officers/Admins, and the Bewerbung
// page/teaser rendering.
//
// Classic (non-module) script — shares the global scope with the other
// js/*.js files; load order is set in index.html. Code that runs at load
// time may only use files loaded before this one.

// ---- Recruiting / Bewerbung: chat-bot-style application flow --------
// Walks the applicant through APPLY_CHAT_STEPS one question at a time —
// a bot-message bubble plus an input area for that one question, same
// feel as a chat bot. Each step owns its own render()/collect() pair:
// render(container, previousValue) builds whatever input UI that
// question needs into the given container; collect(container) reads it
// back out, returning { ok:true, value, summary } on success (value is
// what gets stored in applyChatAnswers, summary is the short text shown
// in the transcript's "user" bubble) or { ok:false, error } to block
// advancing. Optional steps also provide skipValue() for the
// "Überspringen" button. The more complex steps (class picks, character
// names, profession pickers) keep their own in-progress draft in a
// dedicated applyChat*Draft variable declared just above them, mutated
// directly by their own input handlers and read by collect().
let applyChatPicksDraft = [];
let applyChatCharNamesDraft = {};
let applyChatCharProfDraft = {};
let applyChatExtraProfDraft = [];
/** @type {string[]} */
let applyChatLogsDraft = [];
const APPLY_MAX_LOGS = 5;

function applyChatPrimaryProfessions(){ return PROFESSIONS.filter(p => p.primary); }
function applyChatSecondaryProfessions(){ return PROFESSIONS.filter(p => !p.primary); }
// Until the day after WoW Forever's launch (4 Nov 2026) applicants don't
// have characters yet — the question asks what they *will* call them.
const FOREVER_LIVE_FROM = new Date('2026-11-05T00:00:00+01:00').getTime();
function applyChatForeverLive(){ return Date.now() >= FOREVER_LIVE_FROM; }
// WoW Forever names: first + last name. Known rules (Blizzard, Sept
// 2026): first name 2–12 letters, letters only (no digits / spaces);
// last name one word (no space / hyphen); never three identical letters
// in a row. Blizzard hasn't published the last name's length limit —
// FOREVER_LAST_NAME_MAX is a guess until the name reservation (27 Oct).
const FOREVER_FIRST_NAME_MAX = 12;
const FOREVER_LAST_NAME_MAX = 16;
/** Error text for a name part, or '' when it's fine. @param {string} v @param {'Vorname' | 'Nachname'} what @param {number} max */
function foreverNameError(v, what, max){
  if (v.length < 2 || v.length > max) return `${what}: ${2}–${max} Buchstaben.`;
  if (!/^\p{L}+$/u.test(v)) return `${what}: nur Buchstaben — keine Zahlen, Leerzeichen oder Bindestriche.`;
  if (/(\p{L})\1\1/iu.test(v)) return `${what}: nie drei gleiche Buchstaben hintereinander.`;
  return '';
}

// Same class-pick UI as before (dropdown + spec checkboxes, one row per
// class, already-used classes disabled in the other rows), just capped
// at 2 rows total and operating on applyChatPicksDraft/an arbitrary
// container instead of the old fixed applyClassPicks element.
function renderApplyChatPicksUI(container){
  const usedClassIds = new Set(applyChatPicksDraft.map(p => p.classId));
  const rowsHtml = applyChatPicksDraft.map((pick, i) => {
    const classOptions = CLASSES.map(c => {
      const disabled = usedClassIds.has(c.id) && c.id !== pick.classId;
      return `<option value="${c.id}" ${pick.classId === c.id ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${escapeHtml(c.label)}</option>`;
    }).join('');
    const specs = foreverSpecsForClass(pick.classId);
    const specsHtml = specs.map(s => `
      <label class="poll-checkbox-field">
        <input type="checkbox" data-pick-spec="${s.id}" ${pick.specs.includes(s.id) ? 'checked' : ''}>
        ${escapeHtml(s.label)}
      </label>`).join('');
    return `<div class="apply-class-pick-row" data-pick-index="${i}">
      <div class="apply-class-pick-head">
        <div class="poll-config-field">
          <span class="poll-config-field-label">Klasse</span>
          <select data-pick-class-index="${i}">${classOptions}</select>
        </div>
        ${applyChatPicksDraft.length > 1 ? `<button type="button" class="apply-class-pick-remove" data-remove-pick-index="${i}" title="Entfernen">✕</button>` : ''}
      </div>
      <div class="poll-config-field apply-class-pick-specs">
        <span class="poll-config-field-label">Spezialisierung(en)</span>
        <div class="apply-spec-checkboxes">${specsHtml}</div>
      </div>
    </div>`;
  }).join('');
  const addDisabled = applyChatPicksDraft.length >= 2;
  container.innerHTML = `<div class="apply-class-picks">${rowsHtml}</div>
    <button type="button" class="apply-add-class-btn" id="applyChatAddClassBtn" ${addDisabled ? 'disabled' : ''}>+ Weitere Klasse hinzufügen (max. 2)</button>`;

  container.querySelectorAll('[data-pick-class-index]').forEach(select => {
    select.addEventListener('change', () => {
      const i = Number(select.getAttribute('data-pick-class-index'));
      applyChatPicksDraft[i].classId = select.value;
      applyChatPicksDraft[i].specs = [];
      renderApplyChatPicksUI(container);
    });
  });
  container.querySelectorAll('[data-pick-spec]').forEach((/** @type {HTMLInputElement} */ cb) => {
    const i = Number(cb.closest('[data-pick-index]').getAttribute('data-pick-index'));
    cb.addEventListener('change', () => {
      const specId = cb.getAttribute('data-pick-spec');
      const pick = applyChatPicksDraft[i];
      if (cb.checked){
        if (!pick.specs.includes(specId)) pick.specs.push(specId);
      } else {
        pick.specs = pick.specs.filter(s => s !== specId);
      }
    });
  });
  container.querySelectorAll('[data-remove-pick-index]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = Number(btn.getAttribute('data-remove-pick-index'));
      applyChatPicksDraft.splice(i, 1);
      renderApplyChatPicksUI(container);
    });
  });
  const addBtn = container.querySelector('#applyChatAddClassBtn');
  if (addBtn) addBtn.addEventListener('click', () => {
    if (applyChatPicksDraft.length >= 2) return;
    const usedIds = new Set(applyChatPicksDraft.map(p => p.classId));
    const nextClass = CLASSES.find(c => !usedIds.has(c.id));
    if (!nextClass) return;
    applyChatPicksDraft.push({ classId: nextClass.id, specs: [] });
    renderApplyChatPicksUI(container);
  });
}

const APPLY_CHAT_STEPS = [
  {
    key: 'firstName', required: true,
    bot: 'Wie ist dein richtiger Vorname?',
    render(container, value){
      container.innerHTML = `<input type="text" class="apply-text-input" id="applyChatFieldInput" maxlength="60" placeholder="z.B. Max" value="${escapeHtml(value || '')}">`;
      container.querySelector('#applyChatFieldInput').focus();
    },
    collect(container){
      const v = container.querySelector('#applyChatFieldInput').value.trim().slice(0, 60);
      if (!v) return { ok: false, error: 'Bitte gib deinen Vornamen ein.' };
      return { ok: true, value: v, summary: v };
    }
  },
  {
    key: 'nickname', required: false,
    bot: 'Wie ist dein Nickname? Falls er noch nicht in deinen Einstellungen gespeichert ist, übernehmen wir ihn direkt von deiner Antwort hier.',
    render(container, value){
      const saved = (discordIdentity && state.characterProfiles[discordIdentity.id] && state.characterProfiles[discordIdentity.id].nickname) || '';
      container.innerHTML = `<input type="text" class="apply-text-input" id="applyChatFieldInput" maxlength="30" placeholder="z.B. Nasty" value="${escapeHtml(value != null ? value : saved)}">`;
      container.querySelector('#applyChatFieldInput').focus();
    },
    collect(container){
      const v = container.querySelector('#applyChatFieldInput').value.trim().slice(0, 30);
      return { ok: true, value: v, summary: v || '—' };
    },
    skipValue(){ return { value: '', summary: '—' }; }
  },
  {
    key: 'age', required: true,
    bot: 'Wie alt bist du?',
    render(container, value){
      container.innerHTML = `<input type="text" inputmode="numeric" class="apply-text-input" id="applyChatFieldInput" maxlength="3" placeholder="z.B. 24" value="${value != null ? escapeHtml(String(value)) : ''}">`;
      const input = container.querySelector('#applyChatFieldInput');
      input.addEventListener('input', () => { input.value = input.value.replace(/[^0-9]/g, ''); });
      input.focus();
    },
    collect(container){
      const raw = container.querySelector('#applyChatFieldInput').value.trim();
      if (!/^[0-9]{1,3}$/.test(raw)) return { ok: false, error: 'Bitte gib dein Alter als Zahl ein.' };
      const n = parseInt(raw, 10);
      if (n < 12 || n > 99) return { ok: false, error: 'Bitte gib ein realistisches Alter ein.' };
      return { ok: true, value: n, summary: String(n) };
    }
  },
  {
    key: 'picks', required: true,
    get bot(){
      return applyChatForeverLive()
        ? 'Für welche Klasse(n) und Spezialisierung(en) bewirbst du dich? (maximal 2 Klassen)'
        : 'Welche Klasse(n) und Spezialisierung(en) willst du in WoW Forever spielen? (maximal 2 Klassen — egal, was du gerade spielst)';
    },
    render(container, value){
      applyChatPicksDraft = (Array.isArray(value) && value.length ? value : [{ classId: CLASSES[0].id, specs: [] }])
        .map(p => ({ classId: p.classId, specs: (p.specs || []).slice() }));
      renderApplyChatPicksUI(container);
    },
    collect(){
      const picks = applyChatPicksDraft
        .filter(p => CLASS_MAP[p.classId] && p.specs.length)
        .slice(0, 2)
        .map(p => ({ classId: p.classId, specs: p.specs.slice() }));
      if (!picks.length) return { ok: false, error: 'Bitte wähle mindestens eine Klasse mit Spezialisierung aus.' };
      const summary = picks.map(p => `${CLASS_MAP[p.classId].label} (${p.specs.map(s => foreverSpecLabel(p.classId, s)).join(', ')})`).join(' · ');
      return { ok: true, value: picks, summary };
    }
  },
  {
    key: 'characters', required: true,
    get bot(){
      return applyChatForeverLive()
        ? 'Mit welchen Charakteren bewirbst du dich auf diese Klassen? (Vor- und Nachname)'
        : 'Wie wirst du deinen Charakter in WoW Forever nennen? (Vor- und Nachname — es gelten Blizzards Namensregeln)';
    },
    render(container, value){
      const picks = applyChatAnswers.picks || [];
      applyChatCharNamesDraft = {};
      picks.forEach(p => {
        const [first, ...rest] = String((value && value[p.classId]) || '').split(' ');
        applyChatCharNamesDraft[p.classId] = { first: first || '', last: rest.join('') };
      });
      container.innerHTML = picks.map(p => {
        const cls = CLASS_MAP[p.classId];
        const d = applyChatCharNamesDraft[p.classId];
        return `<div class="apply-chat-char-row">
          <label class="apply-chat-char-row-label" style="color:${cls.color}">${escapeHtml(cls.label)}</label>
          <div class="apply-chat-name-pair">
            <input type="text" class="apply-text-input" maxlength="${FOREVER_FIRST_NAME_MAX}" data-char-class="${p.classId}" data-char-part="first" placeholder="Vorname" value="${escapeHtml(d.first)}">
            <input type="text" class="apply-text-input" maxlength="${FOREVER_LAST_NAME_MAX}" data-char-class="${p.classId}" data-char-part="last" placeholder="Nachname" value="${escapeHtml(d.last)}">
          </div>
        </div>`;
      }).join('') + `<p class="apply-chat-hint">Regeln in WoW Forever: Vorname 2–${FOREVER_FIRST_NAME_MAX} Buchstaben, Nachname ein Wort; nur Buchstaben (keine Zahlen, Leerzeichen, Bindestriche), nie drei gleiche Buchstaben hintereinander, keine Namen bekannter Warcraft-Figuren. Der komplette Name muss in der Region einmalig sein.</p>`;
      container.querySelectorAll('[data-char-class]').forEach((/** @type {HTMLInputElement} */ inp, idx) => {
        inp.addEventListener('input', () => { applyChatCharNamesDraft[inp.getAttribute('data-char-class')][inp.getAttribute('data-char-part')] = inp.value; });
        if (idx === 0) inp.focus();
      });
    },
    collect(){
      const picks = applyChatAnswers.picks || [];
      const out = {};
      for (const p of picks){
        const d = applyChatCharNamesDraft[p.classId] || { first: '', last: '' };
        const first = d.first.trim(), last = d.last.trim();
        const label = CLASS_MAP[p.classId].label;
        if (!first || !last) return { ok: false, error: `Bitte gib für ${label} Vor- und Nachnamen an.` };
        const err = foreverNameError(first, 'Vorname', FOREVER_FIRST_NAME_MAX) || foreverNameError(last, 'Nachname', FOREVER_LAST_NAME_MAX);
        if (err) return { ok: false, error: `${label} — ${err}` };
        // First letter upper case, like the game shows it.
        const cap = v => v.charAt(0).toLocaleUpperCase('de-DE') + v.slice(1).toLocaleLowerCase('de-DE');
        out[p.classId] = `${cap(first)} ${cap(last)}`;
      }
      const summary = picks.map(p => `${CLASS_MAP[p.classId].label}: ${out[p.classId]}`).join(' · ');
      return { ok: true, value: out, summary };
    }
  },
  {
    key: 'charProfessions', required: true,
    bot: 'Welche zwei Hauptberufe willst du auf diesem/diesen Charakter(en) lernen? (2 Hauptberufe sind bei uns Pflicht)',
    render(container, value){
      const picks = applyChatAnswers.picks || [];
      applyChatCharProfDraft = {};
      picks.forEach(p => { applyChatCharProfDraft[p.classId] = ((value && value[p.classId]) || []).map(x => x.professionId); });
      container.innerHTML = picks.map(p => {
        const cls = CLASS_MAP[p.classId];
        const charName = (applyChatAnswers.characters || {})[p.classId] || '';
        const optsHtml = applyChatPrimaryProfessions().map(prof => `
          <label class="poll-checkbox-field">
            <input type="checkbox" data-prof-class="${p.classId}" data-prof-id="${prof.id}" ${applyChatCharProfDraft[p.classId].includes(prof.id) ? 'checked' : ''}>
            ${escapeHtml(prof.label)}
          </label>`).join('');
        return `<div class="apply-chat-prof-block">
          <div class="apply-chat-prof-head" style="color:${cls.color}">${escapeHtml(cls.label)}${charName ? ' — ' + escapeHtml(charName) : ''} <span class="apply-chat-prof-count" data-prof-count="${p.classId}">${applyChatCharProfDraft[p.classId].length}/2</span></div>
          <div class="apply-spec-checkboxes">${optsHtml}</div>
        </div>`;
      }).join('');
      container.querySelectorAll('[data-prof-class]').forEach((/** @type {HTMLInputElement} */ cb) => {
        cb.addEventListener('change', () => {
          const classId = cb.getAttribute('data-prof-class');
          const profId = cb.getAttribute('data-prof-id');
          const arr = applyChatCharProfDraft[classId];
          if (cb.checked){
            if (arr.length >= 2){ cb.checked = false; return; }
            arr.push(profId);
          } else {
            const idx = arr.indexOf(profId);
            if (idx >= 0) arr.splice(idx, 1);
          }
          const count = container.querySelector(`[data-prof-count="${classId}"]`);
          if (count) count.textContent = `${arr.length}/2`;
        });
      });
    },
    collect(){
      const picks = applyChatAnswers.picks || [];
      const out = {};
      const summaryParts = [];
      for (const p of picks){
        const arr = applyChatCharProfDraft[p.classId] || [];
        if (arr.length !== 2) return { ok: false, error: `Bitte wähle für ${CLASS_MAP[p.classId].label} genau zwei Hauptberufe.` };
        out[p.classId] = arr.map(id => ({ professionId: id }));
        summaryParts.push(`${CLASS_MAP[p.classId].label}: ${arr.map(id => PROFESSION_MAP[id].label).join(', ')}`);
      }
      return { ok: true, value: out, summary: summaryParts.join(' · ') };
    }
  },
  {
    key: 'extraProfessions', required: false,
    bot: 'Willst du zusätzlich Erste Hilfe, Kochkunst und/oder Angeln machen? (optional)',
    render(container, value){
      applyChatExtraProfDraft = (Array.isArray(value) ? value : []).map(x => ({ professionId: x.professionId }));
      container.innerHTML = `<div class="apply-spec-checkboxes">${applyChatSecondaryProfessions().map(prof => `
        <label class="poll-checkbox-field">
          <input type="checkbox" data-extra-prof="${prof.id}" ${applyChatExtraProfDraft.some(x => x.professionId === prof.id) ? 'checked' : ''}>
          ${escapeHtml(prof.label)}
        </label>`).join('')}</div>`;
      container.querySelectorAll('[data-extra-prof]').forEach((/** @type {HTMLInputElement} */ cb) => {
        cb.addEventListener('change', () => {
          const profId = cb.getAttribute('data-extra-prof');
          if (cb.checked) applyChatExtraProfDraft.push({ professionId: profId });
          else applyChatExtraProfDraft = applyChatExtraProfDraft.filter(x => x.professionId !== profId);
        });
      });
    },
    collect(){
      const arr = applyChatExtraProfDraft.slice();
      const summary = arr.length ? arr.map(x => PROFESSION_MAP[x.professionId].label).join(', ') : '—';
      return { ok: true, value: arr, summary };
    },
    skipValue(){ return { value: [], summary: '—' }; }
  },
  {
    // Logs of the applicant's best characters — any game version, any
    // class (also ones Forever doesn't have, e.g. a Retail Demon Hunter),
    // not tied to the classes applied for. At least one is required.
    key: 'logs', required: true,
    bot: 'Teile uns Links zu den Warcraftlogs deiner besten Charaktere — egal in welcher Version (Retail, Classic, SoD …) und mit welcher Klasse, auch wenn es die Klasse in Forever nicht gibt. Mindestens ein Link ist Pflicht.',
    render(container, value){
      applyChatLogsDraft = (Array.isArray(value) && value.length ? value.slice() : ['']);
      const draw = () => {
        container.innerHTML = applyChatLogsDraft.map((v, i) => `<div class="apply-chat-log-row">
            <input type="text" class="apply-text-input" maxlength="300" data-log-index="${i}" placeholder="https://www.warcraftlogs.com/character/…" value="${escapeHtml(v)}">
            ${applyChatLogsDraft.length > 1 ? `<button type="button" class="apply-class-pick-remove" data-log-remove="${i}" title="Entfernen">✕</button>` : ''}
          </div>`).join('')
          + `<button type="button" class="apply-add-class-btn" id="applyChatAddLogBtn" ${applyChatLogsDraft.length >= APPLY_MAX_LOGS ? 'disabled' : ''}>+ Weiteren Link hinzufügen (max. ${APPLY_MAX_LOGS})</button>`;
        container.querySelectorAll('[data-log-index]').forEach((/** @type {HTMLInputElement} */ inp) => {
          inp.addEventListener('input', () => { applyChatLogsDraft[Number(inp.getAttribute('data-log-index'))] = inp.value; });
        });
        container.querySelectorAll('[data-log-remove]').forEach(btn => btn.addEventListener('click', () => {
          applyChatLogsDraft.splice(Number(btn.getAttribute('data-log-remove')), 1);
          draw();
        }));
        const add = container.querySelector('#applyChatAddLogBtn');
        if (add) add.addEventListener('click', () => {
          if (applyChatLogsDraft.length >= APPLY_MAX_LOGS) return;
          applyChatLogsDraft.push('');
          draw();
          const last = /** @type {HTMLInputElement | null} */ (container.querySelector(`[data-log-index="${applyChatLogsDraft.length - 1}"]`));
          if (last) last.focus();
        });
      };
      draw();
      const first = /** @type {HTMLInputElement | null} */ (container.querySelector('[data-log-index="0"]'));
      if (first) first.focus();
    },
    collect(){
      const links = applyChatLogsDraft.map(v => v.trim().slice(0, 300)).filter(Boolean);
      if (!links.length) return { ok: false, error: 'Bitte gib mindestens einen Warcraftlogs-Link an.' };
      const bad = links.find(v => !WARCRAFTLOGS_URL_RE.test(v));
      if (bad) return { ok: false, error: `„${bad}“ sieht nicht wie ein warcraftlogs.com-Link aus.` };
      const unique = [...new Set(links)];
      return { ok: true, value: unique, summary: unique.join(' · ') };
    }
  },
  {
    key: 'remarks', required: false,
    bot: 'Möchtest Du uns sonst noch etwas über dich erzählen oder uns mitteilen?',
    render(container, value){
      container.innerHTML = `<textarea class="apply-textarea" id="applyChatFieldInput" rows="3" maxlength="1000" placeholder="Alles, was du uns sonst noch mitgeben möchtest…">${escapeHtml(value || '')}</textarea>`;
      container.querySelector('#applyChatFieldInput').focus();
    },
    collect(container){
      const v = container.querySelector('#applyChatFieldInput').value.trim().slice(0, 1000);
      return { ok: true, value: v, summary: v || '—' };
    },
    skipValue(){ return { value: '', summary: '—' }; }
  }
];

let applyChatSummaries = {};

function resetApplyChat(){
  applyChatStepIndex = 0;
  applyChatAnswers = {};
  applyChatSummaries = {};
  els.applyChatDoneArea.classList.add('hidden');
  els.applyChatComposer.classList.remove('hidden');
  els.applySubmitStatus.textContent = '';
  els.applySubmitStatus.className = 'armory-status';
  renderApplyChatTranscript();
  renderApplyChatCurrentStep();
}

function renderApplyChatTranscript(){
  els.applyChatLog.innerHTML = APPLY_CHAT_STEPS.slice(0, applyChatStepIndex).map((step, i) => `
    <div class="apply-chat-bubble apply-chat-bubble-bot">${escapeHtml(step.bot)}</div>
    <button type="button" class="apply-chat-bubble apply-chat-bubble-user apply-chat-edit" data-apply-edit="${i}" title="Antwort ändern">${escapeHtml(applyChatSummaries[step.key] != null ? applyChatSummaries[step.key] : '—')} <span class="apply-chat-edit-icon" aria-hidden="true">✎</span></button>
  `).join('');
  // Clicking an earlier answer jumps back to that question.
  els.applyChatLog.querySelectorAll('[data-apply-edit]').forEach(btn => btn.addEventListener('click', () => {
    applyChatStepIndex = Number(btn.getAttribute('data-apply-edit'));
    renderApplyChatTranscript();
    renderApplyChatCurrentStep();
  }));
  els.applyChatLog.scrollTop = els.applyChatLog.scrollHeight;
}

function renderApplyChatCurrentStep(){
  els.applyChatError.classList.add('hidden');
  els.applyChatError.textContent = '';
  if (applyChatStepIndex >= APPLY_CHAT_STEPS.length){
    els.applyChatComposer.classList.add('hidden');
    els.applyChatDoneArea.classList.remove('hidden');
    return;
  }
  els.applyChatComposer.classList.remove('hidden');
  els.applyChatDoneArea.classList.add('hidden');
  const step = APPLY_CHAT_STEPS[applyChatStepIndex];
  els.applyChatQuestionBubble.textContent = step.bot;
  step.render(els.applyChatInputArea, applyChatAnswers[step.key]);
  els.applyChatSkipBtn.classList.toggle('hidden', !!step.required);
  els.applyChatBackBtn.classList.toggle('hidden', applyChatStepIndex === 0);
}

function applyChatGoNext(){
  const step = APPLY_CHAT_STEPS[applyChatStepIndex];
  if (!step) return;
  const result = step.collect(els.applyChatInputArea);
  if (!result.ok){
    els.applyChatError.textContent = result.error || 'Bitte prüfe deine Eingabe.';
    els.applyChatError.classList.remove('hidden');
    return;
  }
  applyChatAnswers[step.key] = result.value;
  applyChatSummaries[step.key] = result.summary;
  applyChatStepIndex++;
  renderApplyChatTranscript();
  renderApplyChatCurrentStep();
}

// Back one question; the answer given there is kept and shown again.
function applyChatGoBack(){
  if (applyChatStepIndex <= 0) return;
  applyChatStepIndex--;
  renderApplyChatTranscript();
  renderApplyChatCurrentStep();
}

function applyChatSkipStep(){
  const step = APPLY_CHAT_STEPS[applyChatStepIndex];
  if (!step || step.required) return;
  const skip = step.skipValue ? step.skipValue() : { value: '', summary: '—' };
  applyChatAnswers[step.key] = skip.value;
  applyChatSummaries[step.key] = skip.summary;
  applyChatStepIndex++;
  renderApplyChatTranscript();
  renderApplyChatCurrentStep();
}

els.applyChatNextBtn.addEventListener('click', applyChatGoNext);
els.applyChatSkipBtn.addEventListener('click', applyChatSkipStep);
els.applyChatBackBtn.addEventListener('click', applyChatGoBack);
els.applyChatRestartBtn.addEventListener('click', resetApplyChat);
// Enter submits the current step for simple single-line fields — but not
// inside the remarks textarea, where Enter should just insert a newline.
els.applyChatInputArea.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target && /** @type {Element} */ (e.target).tagName !== 'TEXTAREA'){
    e.preventDefault();
    applyChatGoNext();
  }
});

// If this applicant hasn't saved a nickname yet (Q2), their chat answer
// becomes their saved nickname too — same Firebase field User Settings
// itself writes to, never overwriting one that's already set.
async function applyChatSaveNicknameIfNeeded(nickname){
  if (!discordIdentity || !nickname) return;
  if (!state.characterProfiles) state.characterProfiles = {};
  const existing = state.characterProfiles[discordIdentity.id];
  if (existing && existing.nickname) return;
  state.characterProfiles[discordIdentity.id] = normalizeCharacterProfile(Object.assign({}, existing, { nickname }));
  renderAll();
  await saveData('characterProfiles/' + discordIdentity.id);
}

// Shared send: POSTs to the Worker's /notify-application endpoint and
// logs the outcome (not silent — see the Discord-DM debugging session
// this was added for). Only the application id and the kind of nudge
// are sent: the Worker builds the DM text and picks the recipients
// (every Officer/Admin opted into "Bewerbungen melden" in Manage access,
// minus the applicant) itself from Firebase, and enforces the 10-minute
// window / one-DM-per-application / reminder cooldown server-side — see
// discord-auth-worker.js's handleNotifyApplication. Returns the parsed
// Worker response on success, or null.
async function sendDiscordNotification(applicationId, kind){
  if (!isWorkerConfigured()){
    console.warn('[notify-application] skipped: Worker URL is not configured (still has the YOUR-WORKER-SUBDOMAIN placeholder).');
    return null;
  }
  try{
    const res = await fetch(NOTIFY_APPLICATION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationId, kind })
    });
    let body = null;
    try{ body = await res.json(); }catch(e){}
    if (!res.ok){
      console.warn('[notify-application] Worker responded with an error:', res.status, body);
      return null;
    }
    if (body && body.reason === 'no_recipients'){
      console.warn('[notify-application] no recipients. Either nobody has "Bewerbungen melden" checked in Manage Access, or the only person who does is the applicant themself (self-notifications are intentionally excluded).');
    } else if (body && Array.isArray(body.results)){
      // Per-recipient outcome from Discord itself (e.g. "not a guild
      // member", "could not open DM channel" — the latter usually means
      // that person's Discord privacy settings block DMs from server
      // members/bots they haven't interacted with).
      const failed = body.results.filter(r => !r.ok);
      if (failed.length) console.warn('[notify-application] Some DMs failed:', failed);
      else console.log('[notify-application] DMs sent to', body.results.length, 'recipient(s).');
    }
    return body || {};
  }catch(e){
    // Network/CORS-level failure — most likely the Worker isn't deployed
    // with the /notify-application route yet, or NOTIFY_APPLICATION_URL
    // is unreachable. Logged (not silent) so this is diagnosable from
    // the browser console instead of looking identical to "nothing
    // happened".
    console.warn('[notify-application] fetch failed:', e);
    return null;
  }
}
// Pings every opted-in Officer/Admin via Discord DM when a new
// application comes in. Best-effort only — the in-site quest bell
// (questPendingApplicationsCount, above) is the notification that
// always works regardless of Discord/Worker availability; this is just
// the extra "even if you're not on the page" nudge on top of it.
async function notifyOfficersOfNewApplication(applicationId){
  await sendDiscordNotification(applicationId, 'new');
}
// The applicant's own "Erinnerung senden" button (see
// recruitApplyGateState) — same DM mechanism as a new application, just
// worded as a nudge and gated by APPLICATION_REMINDER_COOLDOWN_DAYS so
// it can't be used to spam the recruiting team. The Worker enforces the
// cooldown and stamps lastReminderAt itself; the local copy is only
// updated here so the button switches to its cooldown state right away.
async function sendApplicationReminder(id){
  if (!discordIdentity || !state.applications || !state.applications[id]) return;
  const application = state.applications[id];
  if (application.applicantId !== discordIdentity.id) return;
  if (application.status === 'accepted' || application.status === 'rejected') return;
  els.recruitApplyNoticeActions.querySelectorAll('[data-send-reminder]').forEach((/** @type {HTMLButtonElement} */ b) => { b.disabled = true; b.textContent = 'Wird gesendet…'; });
  const result = await sendDiscordNotification(id, 'reminder');
  if (result){
    const lastReminderAt = Date.now();
    state.applications[id] = Object.assign({}, application, { lastReminderAt, reminderSentAt: lastReminderAt });
  }
  renderRecruitApplyGate();
}

// Saves a brand-new application together with the applicant's
// applicationLocks/<uid> timestamp in ONE multi-path update. The Firebase
// rules (README.md § 6f) only accept a new application from a non-Officer
// if their previous lock is older than 24 hours AND the same update sets
// the lock to the server's current time — that's the server-side rate
// limit on submissions; the "already applied" gate in the UI is just the
// friendly front of it.
async function saveNewApplication(id){
  setStatus('Saving…', false);
  if (!db){ setStatus('Not connected to Firebase — see setup instructions', true); return false; }
  try{
    await db.ref(DB_PATH).update({
      ['applications/' + id]: state.applications[id],
      ['applicationLocks/' + discordIdentity.id]: firebase.database.ServerValue.TIMESTAMP
    });
    return true;
  }catch(e){
    setStatus('Could not save — check your Firebase rules and connection', true);
    return false;
  }
}

async function submitApplication(){
  if (!discordIdentity || applyChatStepIndex < APPLY_CHAT_STEPS.length) return;
  const a = applyChatAnswers;

  let id = null;
  try{ id = db ? db.ref(DB_PATH + '/applications').push().key : null; }catch(e){}
  if (!id) id = Date.now() + '_' + Math.random().toString(36).slice(2, 8);

  if (!state.applications) state.applications = {};
  state.applications[id] = /** @type {Application} */ ({
    version: 2,
    firstName: a.firstName || '',
    nickname: a.nickname || '',
    age: a.age || null,
    picks: a.picks || [],
    characters: a.characters || {},
    charProfessions: a.charProfessions || {},
    extraProfessions: a.extraProfessions || [],
    charLogs: {},
    logs: a.logs || [],
    remarks: a.remarks || '',
    applicantName: discordIdentity.username,
    applicantId: discordIdentity.id,
    createdAt: Date.now(),
    status: 'open'
  });
  els.applySubmitStatus.textContent = 'Wird gesendet…';
  els.applySubmitStatus.className = 'armory-status';
  renderAll();
  const ok = await saveNewApplication(id);
  if (ok){
    const nicknameToSave = a.nickname;
    resetApplyChat();
    els.applySubmitStatus.textContent = 'Bewerbung gesendet — wir melden uns bei dir!';
    els.applySubmitStatus.className = 'armory-status armory-status-ok';
    applyChatSaveNicknameIfNeeded(nicknameToSave);
    notifyOfficersOfNewApplication(id).catch(() => {});
  } else {
    delete state.applications[id];
    els.applySubmitStatus.textContent = 'Konnte nicht gesendet werden — bitte später erneut versuchen.';
    els.applySubmitStatus.className = 'armory-status armory-status-error';
    renderAll();
  }
}
// Builds the first question's UI once at load — the chat composer sits
// inside the (initially hidden) #recruitLoggedIn block, so this doesn't
// show anything until someone actually logs in and opens Bewerbung, but
// it needs to run once regardless so the first question is ready the
// moment that block unhides. Not called again on every renderAll() (that
// would wipe an applicant's in-progress answers on every Firebase sync)
// — only an explicit restart (or a fresh page load) resets the chat.
resetApplyChat();

function ensureRecruitingNeedsDraftLoaded(){
  if (!recruitingNeedsDraft) recruitingNeedsDraft = JSON.parse(JSON.stringify(state.recruitingNeeds || {}));
}

function renderRecruitNeedsEditor(){
  ensureRecruitingNeedsDraftLoaded();
  els.recruitNeedsEditorGrid.innerHTML = CLASSES.map(c => {
    const specs = foreverSpecsForClass(c.id);
    const checked = recruitingNeedsDraft[c.id] || [];
    return `<div class="recruit-needs-row">
      <span class="recruit-needs-class" style="color:${c.color}">${escapeHtml(c.label)}</span>
      <div class="recruit-needs-specs">
        ${specs.map(s => `<label class="poll-checkbox-field"><input type="checkbox" data-need-class="${c.id}" data-need-spec="${s.id}" ${checked.includes(s.id) ? 'checked' : ''}> ${escapeHtml(s.label)}</label>`).join('')}
      </div>
    </div>`;
  }).join('');
  els.recruitNeedsEditorGrid.querySelectorAll('[data-need-class]').forEach((/** @type {HTMLInputElement} */ cb) => {
    cb.addEventListener('change', () => {
      const cls = cb.getAttribute('data-need-class');
      const spec = cb.getAttribute('data-need-spec');
      if (!recruitingNeedsDraft[cls]) recruitingNeedsDraft[cls] = [];
      if (cb.checked){
        if (!recruitingNeedsDraft[cls].includes(spec)) recruitingNeedsDraft[cls].push(spec);
      } else {
        recruitingNeedsDraft[cls] = recruitingNeedsDraft[cls].filter(s => s !== spec);
        if (!recruitingNeedsDraft[cls].length) delete recruitingNeedsDraft[cls];
      }
    });
  });
}

async function saveRecruitingNeeds(){
  if (!discordIdentity || !isOfficerOrAdmin()) return;
  ensureRecruitingNeedsDraftLoaded();
  state.recruitingNeeds = normalizeRecruitingNeeds(recruitingNeedsDraft);
  els.recruitNeedsSaveStatus.textContent = 'Speichern…';
  els.recruitNeedsSaveStatus.className = 'armory-status';
  renderAll();
  const ok = await saveData('recruitingNeeds');
  els.recruitNeedsSaveStatus.textContent = ok ? 'Gespeichert!' : 'Konnte nicht gespeichert werden.';
  els.recruitNeedsSaveStatus.className = 'armory-status ' + (ok ? 'armory-status-ok' : 'armory-status-error');
}

async function deleteApplication(id){
  if (!discordIdentity || !isOfficerOrAdmin() || !state.applications || !state.applications[id]) return;
  const backup = state.applications[id];
  delete state.applications[id];
  renderAll();
  const ok = await saveData('applications/' + id);
  if (!ok){ state.applications[id] = backup; renderAll(); }
}

// Sets an application's review status. "claimed" additionally stamps
// who flagged it as being worked — the signed-in Officer/Admin doing
// the flagging, not something you pick for someone else — so the card
// can show "wird bearbeitet von <Name>" without a separate assignment
// UI. Switching away from "interview" doesn't clear the stored date, so
// switching back to it (e.g. after re-scheduling) remembers the last
// one instead of starting blank.
async function setApplicationStatus(id, status){
  if (!discordIdentity || !isOfficerOrAdmin() || !state.applications || !state.applications[id] || !APPLICATION_STATUSES[status]) return;
  const backup = state.applications[id];
  state.applications[id] = Object.assign({}, backup, {
    status,
    claimedBy: status === 'claimed' ? discordIdentity.id : backup.claimedBy,
    claimedByName: status === 'claimed' ? discordIdentity.username : backup.claimedByName
  });
  renderApplicationsList();
  refreshQuestUI();
  const ok = await saveData('applications/' + id);
  if (!ok){ state.applications[id] = backup; renderApplicationsList(); refreshQuestUI(); }
}
async function setApplicationInterviewDate(id, dateStr){
  if (!discordIdentity || !isOfficerOrAdmin() || !state.applications || !state.applications[id]) return;
  const backup = state.applications[id];
  state.applications[id] = Object.assign({}, backup, { interviewAt: /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : '' });
  const ok = await saveData('applications/' + id);
  if (!ok){ state.applications[id] = backup; renderApplicationsList(); }
}
// Recruiting-team-only notes — saved on blur (not per keystroke), and
// deliberately doesn't re-render the list on success (would steal focus
// / reset cursor position while someone might still be typing in
// another field); only rolls back + re-renders on an actual save failure.
async function setApplicationNotes(id, notes){
  if (!discordIdentity || !isOfficerOrAdmin() || !state.applications || !state.applications[id]) return;
  const backup = state.applications[id];
  const trimmed = (notes || '').slice(0, 2000);
  if (trimmed === (backup.notes || '')) return;
  state.applications[id] = Object.assign({}, backup, { notes: trimmed });
  const ok = await saveData('applications/' + id);
  if (!ok){ state.applications[id] = backup; renderApplicationsList(); }
}

function renderApplicationsList(){
  // Offen first, then in progress, then closed — newest first within each.
  const rank = a => { const st = a.status || 'open'; return st === 'open' ? 0 : (st === 'accepted' || st === 'rejected') ? 2 : 1; };
  const apps = sortedApplications().sort((a, z) => rank(a) - rank(z) || z.createdAt - a.createdAt);
  if (!apps.length){
    els.applicationsList.innerHTML = `<div class="lootlib-note">Noch keine Bewerbungen.</div>`;
    return;
  }
  // applicationCardCommonHtml holds the bits identical between the old
  // flat-form applications (v1) and the new chat-form ones (v2) — the
  // head row (name/date/contact/delete) and the "already has a saved
  // User Settings profile" block — while each version formats its own
  // body below that.
  const applicationCardCommonParts = (a) => {
    const dateStr = a.createdAt ? new Date(a.createdAt).toLocaleDateString('de-DE') : '';
    const applicantProfile = a.applicantId ? (state.characterProfiles || {})[a.applicantId] : null;
    const hasApplicantCharacters = !!(applicantProfile && applicantProfile.characters && applicantProfile.characters.length);
    const applicantCharactersHtml = hasApplicantCharacters
      ? `<div class="application-characters">
          <strong>Charaktere (User Settings):</strong>
          <div class="character-chips">${applicantProfile.characters.map(characterChipHtml).join('')}</div>
          <button type="button" class="btn btn-ghost btn-sm access-member-armory-refresh" data-refresh-armory="${a.applicantId}">Aktualisieren</button>
        </div>`
      : '';
    const contactBtnHtml = a.applicantId
      ? `<a class="btn btn-discord btn-sm" href="https://discord.com/users/${encodeURIComponent(a.applicantId)}" target="_blank" rel="noopener" title="Öffnet das Discord-Profil von ${escapeHtml(a.applicantName)} — von dort direkt 'Nachricht senden'">Auf Discord kontaktieren</a>`
      : '';
    const status = a.status || 'open';
    const statusOptionsHtml = Object.keys(APPLICATION_STATUSES)
      .map(key => `<option value="${key}" ${status === key ? 'selected' : ''}>${APPLICATION_STATUSES[key].label}</option>`).join('');
    // "Wird bearbeitet von <Name>" only once someone's actually claimed
    // it; the interview-date field only shows once that status is
    // picked, so the row doesn't clutter every card with an empty date
    // input nobody asked for.
    const claimedMetaHtml = (status === 'claimed' && a.claimedByName)
      ? `<span class="application-status-meta">von ${escapeHtml(a.claimedByName)}</span>` : '';
    const interviewDateHtml = status === 'interview'
      ? `<input type="date" class="application-status-date" data-interview-app="${a.id}" value="${escapeHtml(a.interviewAt || '')}" title="Termin für das Bewerbungsgespräch">`
      : '';
    const statusRowHtml = `<div class="application-status-row">
        <span class="application-status-badge application-status-${status}">${APPLICATION_STATUSES[status].label}</span>
        <select class="application-status-select" data-status-app="${a.id}" aria-label="Bewerbungsstatus">${statusOptionsHtml}</select>
        ${claimedMetaHtml}
        ${interviewDateHtml}
      </div>`;
    // Recruiting-team-only — never shown to the applicant (see
    // normalizeApplicationStatusFields / applyChatCard visibility).
    // Saves on blur rather than per keystroke, same as other free-text
    // fields on this page.
    const notesHtml = `<div class="application-notes-row">
        <label class="application-notes-label" for="notes-${a.id}">Notizen (nur fürs Recruitment-Team)</label>
        <textarea class="application-notes-input" id="notes-${a.id}" data-notes-app="${a.id}" rows="2" maxlength="2000" placeholder="z.B. Eindrücke vom Gespräch, offene Fragen, Kontaktversuche …">${escapeHtml(a.notes || '')}</textarea>
      </div>`;
    const headHtml = `<div class="application-card-head">
        <span class="application-applicant">${escapeHtml(a.applicantName)}${applicantProfile && applicantProfile.nickname ? ` <span class="access-member-nickname">"${escapeHtml(applicantProfile.nickname)}"</span>` : ''}</span>
        <span class="application-date">${escapeHtml(dateStr)}</span>
        ${contactBtnHtml}
        <button type="button" class="btn btn-ghost btn-sm" data-delete-application="${a.id}">Löschen</button>
      </div>
      ${statusRowHtml}
      ${notesHtml}`;
    return { headHtml, applicantCharactersHtml };
  };
  const profListText = (list) => (Array.isArray(list) && list.length)
    ? list.map(x => `${PROFESSION_MAP[x.professionId] ? PROFESSION_MAP[x.professionId].label : x.professionId}${x.level ? ` (${x.level === 'max' ? 'Max' : x.level})` : ''}`).join(', ')
    : '—';
  // Wraps a card's inner content with the right outer shell for its
  // status: Offen stays exactly as before (full-strength card, nothing
  // extra to do); an in-progress one (claimed/interview/candidate) gets
  // dimmed so it reads as "someone's on this" rather than "needs you
  // too"; a closed one (Angenommen/Abgelehnt) collapses to a one-line
  // toggle — applicant + character names only — so a growing pile of
  // finished applications doesn't bury the ones still open.
  const wrapApplicationCard = (a, innerHtml) => {
    const status = a.status || 'open';
    const isClosed = status === 'accepted' || status === 'rejected';
    if (!isClosed){
      // Offen = nobody has picked it up yet: highlighted; in progress: muted.
      const inProgressClass = (status === 'claimed' || status === 'interview' || status === 'candidate') ? ' application-card-inprogress' : ' application-card-open';
      return `<div class="application-card${inProgressClass}" data-application-id="${a.id}">${innerHtml}</div>`;
    }
    const expanded = expandedClosedApplications.has(a.id);
    return `<div class="application-card application-card-closed${expanded ? ' is-expanded' : ''}" data-application-id="${a.id}">
      <button type="button" class="application-card-toggle" data-toggle-application="${a.id}">
        <span class="application-status-badge application-status-${status}">${APPLICATION_STATUSES[status].label}</span>
        <span class="application-card-toggle-title">${escapeHtml(applicationCollapsedTitle(a))}</span>
        <span class="application-card-toggle-arrow" aria-hidden="true">${expanded ? '▲' : '▼'}</span>
      </button>
      <div class="application-card-body">${innerHtml}</div>
    </div>`;
  };

  els.applicationsList.innerHTML = apps.map(a => {
    const { headHtml, applicantCharactersHtml } = applicationCardCommonParts(a);
    if (a.version === 2){
      // Current chat-form shape. Two layers: a quick-glance summary bar
      // (the handful of facts an officer scans for first — age, classes,
      // characters, whether logs/professions were even given) so the
      // card can be judged in a second or two, then the full per-class
      // detail blocks below it for anyone who wants to read everything.
      const charLogs = a.charLogs || {};
      const picks = a.picks || [];
      const classChipsHtml = picks.map(p => {
        const cls = CLASS_MAP[p.classId];
        const iconUrl = foreverClassIconUrl(p.classId);
        return `<span class="application-summary-classchip">
          ${iconUrl ? `<img class="forever-pick-icon wow-icon-frame" src="${iconUrl}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
          <span style="color:${cls ? cls.color : 'inherit'}">${escapeHtml(cls ? cls.label : p.classId)}</span>
        </span>`;
      }).join('');
      const profsGivenCount = picks.filter(p => ((a.charProfessions || {})[p.classId] || []).length).length;
      const logsGivenCount = (a.logs || []).length || picks.filter(p => charLogs[p.classId]).length;
      const summaryStatsHtml = [
        { label: 'Alter', value: String(a.age) },
        { label: 'Charakter(e)', value: picks.map(p => (a.characters || {})[p.classId]).filter(Boolean).join(', ') || '—' },
        { label: 'Hauptberufe', value: profsGivenCount ? `${profsGivenCount}/${picks.length} angegeben` : 'keine Angabe' },
        { label: 'Logs', value: logsGivenCount ? `${logsGivenCount} verlinkt` : 'keine Angabe' }
      ].map(s => `<div class="application-stat"><span class="application-stat-label">${escapeHtml(s.label)}</span><span class="application-stat-value">${escapeHtml(s.value)}</span></div>`).join('');
      const classBlocksHtml = picks.map(p => {
        const cls = CLASS_MAP[p.classId];
        const iconUrl = foreverClassIconUrl(p.classId);
        const specLabels = (p.specs || []).map(s => foreverSpecLabel(p.classId, s)).filter(Boolean).join(', ') || '—';
        const charName = (a.characters || {})[p.classId] || '—';
        const profText = profListText((a.charProfessions || {})[p.classId]);
        const logUrl = charLogs[p.classId];
        return `<div class="application-class-block">
          <span class="application-class-pick">
            ${iconUrl ? `<img class="forever-pick-icon wow-icon-frame" src="${iconUrl}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
            <span class="application-class" style="color:${cls ? cls.color : 'inherit'}">${escapeHtml(cls ? cls.label : p.classId)}</span>
            <span class="application-specs">${escapeHtml(specLabels)}</span>
          </span>
          <p class="application-namage"><strong>Charakter:</strong> ${escapeHtml(charName)}</p>
          <p class="application-professions"><strong>Hauptberufe:</strong> ${escapeHtml(profText)}</p>
          ${(a.logs || []).length ? '' : `<p class="application-logs"><strong>Warcraftlogs:</strong> ${logUrl ? linkifyEscaped(logUrl) : '—'}</p>`}
        </div>`;
      }).join('');
      return wrapApplicationCard(a, `
        ${headHtml}
        <p class="application-namage"><strong>Vorname:</strong> ${escapeHtml(a.firstName)}${a.nickname ? ` <span class="access-member-nickname">Nickname: "${escapeHtml(a.nickname)}"</span>` : ''}</p>
        <div class="application-summary-row">
          ${summaryStatsHtml}
          <div class="application-summary-classchips">${classChipsHtml}</div>
        </div>
        <div class="application-class-picks application-class-picks-v2">${classBlocksHtml}</div>
        <p class="application-professions"><strong>Zusätzliche Berufe:</strong> ${escapeHtml(profListText(a.extraProfessions))}</p>
        ${(a.logs || []).length ? `<div class="application-logs"><strong>Warcraftlogs (beste Charaktere):</strong><ul class="application-log-list">${a.logs.map(u => `<li>${linkifyEscaped(u)}</li>`).join('')}</ul></div>` : ''}
        ${a.remarks ? `<p class="application-remarks"><strong>Sonstiges:</strong> ${linkifyEscaped(a.remarks)}</p>` : ''}
        ${applicantCharactersHtml}
      `);
    }
    // Legacy (v1) flat-form application — unchanged formatting, for
    // anything submitted before the chat-form rebuild.
    const picksHtml = (a.picks || []).map(p => {
      const cls = CLASS_MAP[p.classId];
      const specLabels = (p.specs || []).map(s => foreverSpecLabel(p.classId, s)).filter(Boolean).join(', ') || '—';
      return `<span class="application-class-pick">
        <span class="application-class" style="color:${cls ? cls.color : 'inherit'}">${escapeHtml(cls ? cls.label : p.classId)}</span>
        <span class="application-specs">${escapeHtml(specLabels)}</span>
      </span>`;
    }).join('');
    // Professions is either an array of known PROFESSIONS ids (current
    // form) or a legacy free-text string (applications submitted before
    // the checkbox list existed) — display either correctly.
    const professionsText = Array.isArray(a.professions)
      ? a.professions.map(id => (PROFESSION_MAP[id] ? PROFESSION_MAP[id].label : id)).join(', ')
      : a.professions;
    return wrapApplicationCard(a, `
      ${headHtml}
      <div class="application-class-picks">${picksHtml}</div>
      ${a.nameAge ? `<p class="application-namage"><strong>Name &amp; Alter:</strong> ${escapeHtml(a.nameAge)}</p>` : ''}
      <p class="application-experience"><strong>Erfahrung:</strong> ${linkifyEscaped(a.experience)}</p>
      ${a.logs ? `<p class="application-logs"><strong>Logs:</strong> ${linkifyEscaped(a.logs)}</p>` : ''}
      <p class="application-professions"><strong>Berufe (Forever):</strong> ${escapeHtml(professionsText)}</p>
      ${a.remarks ? `<p class="application-remarks"><strong>Sonstiges:</strong> ${linkifyEscaped(a.remarks)}</p>` : ''}
      ${applicantCharactersHtml}
    `);
  }).join('');
  els.applicationsList.querySelectorAll('[data-delete-application]').forEach(btn => {
    btn.addEventListener('click', () => deleteApplication(btn.getAttribute('data-delete-application')));
  });
  els.applicationsList.querySelectorAll('[data-toggle-application]').forEach(btn => {
    btn.addEventListener('click', () => toggleApplicationExpanded(btn.getAttribute('data-toggle-application')));
  });
  els.applicationsList.querySelectorAll('[data-status-app]').forEach((/** @type {HTMLSelectElement} */ sel) => {
    sel.addEventListener('change', () => setApplicationStatus(sel.getAttribute('data-status-app'), sel.value));
  });
  els.applicationsList.querySelectorAll('[data-interview-app]').forEach((/** @type {HTMLInputElement} */ inp) => {
    inp.addEventListener('change', () => setApplicationInterviewDate(inp.getAttribute('data-interview-app'), inp.value));
  });
  els.applicationsList.querySelectorAll('[data-notes-app]').forEach((/** @type {HTMLInputElement | HTMLTextAreaElement} */ inp) => {
    inp.addEventListener('blur', () => setApplicationNotes(inp.getAttribute('data-notes-app'), inp.value));
  });
  els.applicationsList.querySelectorAll('[data-refresh-armory]').forEach((/** @type {HTMLButtonElement} */ btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Lädt…';
      await refreshMemberArmoryData(btn.getAttribute('data-refresh-armory'));
      renderApplicationsList();
    });
  });
  applyPendingApplicationDeepLink();
}

// Resolves a #recruit?app=<id> deep link (from a Discord notification —
// see notifyOfficersOfNewApplication) into actually scrolling to and
// highlighting that one application, once the applications list has
// something to scroll to. If it's a closed (collapsed) application, that
// takes a re-render to open first — this calls itself once more via
// renderApplicationsList() in that case, then settles on the second pass.
function applyPendingApplicationDeepLink(){
  if (!pendingDeepLinkApplicationId) return;
  const id = pendingDeepLinkApplicationId;
  if (!state.applications || !state.applications[id]){ pendingDeepLinkApplicationId = null; return; }
  const status = state.applications[id].status || 'open';
  if ((status === 'accepted' || status === 'rejected') && !expandedClosedApplications.has(id)){
    expandedClosedApplications.add(id);
    renderApplicationsList();
    return;
  }
  pendingDeepLinkApplicationId = null;
  const el = els.applicationsList.querySelector(`[data-application-id="${CSS.escape(id)}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('application-card-highlight');
  setTimeout(() => el.classList.remove('application-card-highlight'), 2600);
}

function renderRecruitView(){
  const loggedIn = !!discordIdentity;
  els.recruitLoggedOut.classList.toggle('hidden', loggedIn);
  els.recruitLoggedIn.classList.toggle('hidden', !loggedIn);
  const badges = recruitingNeedsBadges(state.recruitingNeeds || {});
  els.recruitNeedsOverviewBadges.innerHTML = badges || '<span class="recruit-need-badges-empty">Aktuell nichts Bestimmtes — jede Bewerbung ist willkommen!</span>';
  if (!loggedIn) return;
  renderRecruitApplyGate();
  const canManage = isOfficerOrAdmin();
  els.recruitNeedsEditor.classList.toggle('hidden', !canManage);
  els.applicationsCard.classList.toggle('hidden', !canManage);
  if (canManage){
    renderRecruitNeedsEditor();
    renderApplicationsList();
  }
}

// Decides whether the signed-in person can fill out a new application
// right now, and renders the right thing in its place when they can't:
// already a guild member (no need to apply), an existing application
// that's already been decided (no re-applying), or an existing
// application still in flight (shows its status + a reminder button
// once APPLICATION_REMINDER_COOLDOWN_DAYS has passed).
//
// Deliberate exception: an Admin always sees the apply chat, regardless
// of being a guild member or already having an application on file — so
// an Admin can run through the Bewerbung flow end-to-end for testing
// without needing a second Discord account. Officers and regular Guild
// Members still go through the normal gate below.
function renderRecruitApplyGate(){
  if (currentRole === 'admin'){
    els.applyChatCard.classList.remove('hidden');
    els.recruitApplyNotice.classList.add('hidden');
    return;
  }
  const existing = myLatestApplication();
  const alreadyMember = isMemberOrHigher();
  const blocked = alreadyMember || !!existing;
  els.applyChatCard.classList.toggle('hidden', blocked);
  els.recruitApplyNotice.classList.toggle('hidden', !blocked);
  if (!blocked) return;

  let title = '';
  let body = '';
  let actionsHtml = '';
  if (alreadyMember){
    title = 'Du bist schon dabei!';
    body = 'Du bist bereits Mitglied der Gilde — eine Bewerbung brauchst du nicht mehr ;)';
  } else if (existing.status === 'accepted'){
    title = 'Deine Bewerbung wurde angenommen!';
    body = 'Willkommen bei uns — wir haben uns schon bei dir auf Discord gemeldet. Eine erneute Bewerbung ist nicht nötig.';
  } else if (existing.status === 'rejected'){
    title = 'Deine Bewerbung wurde bereits entschieden';
    body = 'Deine letzte Bewerbung wurde leider abgelehnt. Eine erneute Bewerbung ist über diese Seite aktuell nicht möglich — bei Fragen meldet euch gerne direkt auf Discord.';
  } else {
    // Still open/claimed/interview/candidate.
    const dateStr = existing.createdAt ? new Date(existing.createdAt).toLocaleDateString('de-DE') : '';
    title = 'Du hast dich schon beworben';
    body = `Eingegangen am ${escapeHtml(dateStr)} — aktueller Status: <strong>${APPLICATION_STATUSES[existing.status].label}</strong>. Wir melden uns, sobald es etwas Neues gibt.`;
    const cooldownStart = Math.max(existing.createdAt || 0, existing.lastReminderAt || 0);
    const daysSince = (Date.now() - cooldownStart) / 86400000;
    if (daysSince >= APPLICATION_REMINDER_COOLDOWN_DAYS){
      actionsHtml = `<button type="button" class="btn btn-ghost btn-sm" data-send-reminder="${existing.id}">Erinnerung senden</button>`;
    } else {
      const daysLeft = Math.ceil(APPLICATION_REMINDER_COOLDOWN_DAYS - daysSince);
      actionsHtml = `<span class="armory-status">Erinnerung ist in ${daysLeft} Tag${daysLeft === 1 ? '' : 'en'} möglich.</span>`;
    }
  }
  els.recruitApplyNoticeTitle.textContent = title;
  els.recruitApplyNoticeBody.innerHTML = body;
  els.recruitApplyNoticeActions.innerHTML = actionsHtml;
  els.recruitApplyNoticeActions.querySelectorAll('[data-send-reminder]').forEach(btn => {
    btn.addEventListener('click', () => sendApplicationReminder(btn.getAttribute('data-send-reminder')));
  });
}

// Home-page teaser — driven by the same state.recruitingNeeds as the
// recruiting page's own overview, so the two never say different things.
function renderRecruitTeaser(){
  const badges = recruitingNeedsBadges(state.recruitingNeeds || {});
  els.recruitTeaserNeeds.innerHTML = badges
    ? `<p class="recruit-need-label">Aktuell besonders gesucht:</p><div class="recruit-need-badges">${badges}</div>`
    : '';
}
