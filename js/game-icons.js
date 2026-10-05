// Game icons for headings, roles and class / spec mentions — the original
// WoW icons from Wowhead's icon CDN (talentIconUrl, js/talent-builder.js),
// the same source the talent and item icons use. Every name below occurs
// in our own game data (data/forever/), so the CDN has it. Swap one here
// to change it everywhere.

const GAME_ICONS = {
  talents: 'ability_marksmanship',
  spells: 'inv_misc_book_09',
  items: 'inv_chest_chain_05',
  patch: 'inv_scroll_03',
  announce: 'inv_scroll_08',
  auto: 'ability_townwatch',
  tank: 'ability_warrior_defensivestance',
  healer: 'spell_holy_flashheal',
  damage: 'ability_dualwield',
  raid: 'inv_misc_head_dragon_01',
  loot: 'inv_misc_bag_10',
  votes: 'inv_misc_ticket_tarot_crusade',
  character: 'inv_helmet_01',
  todo: 'inv_misc_pocketwatch_01',
  guild: 'inv_banner_01',
  apply: 'inv_scroll_07',
  explore: 'inv_misc_map_01'
};

/** <img> of a game icon. @param {string} name GAME_ICONS key or a raw icon name @param {number} [size] px @param {string} [title] */
function gameIconHtml(name, size, title){
  const px = size || 18;
  const icon = GAME_ICONS[name] || name;
  return `<img class="game-icon" src="${escapeHtml(talentIconUrl(icon, px > 36 ? 'large' : 'medium'))}" alt="" width="${px}" height="${px}" loading="lazy"${title ? ` title="${escapeHtml(title)}"` : ''} onerror="this.style.display='none'">`;
}
/** Role icon (tank / healer / damage). @param {string} role @param {number} [size] */
function roleIconHtml(role, size){
  return gameIconHtml(role, size, FOREVER_ROLE_LABELS[role] || role);
}

// ---------------------------------------------------------------- class / spec mentions
/** Class names in texts (English + German, singular / plural) -> class id. */
const GAME_CLASS_WORDS = {
  warrior: ['Warriors', 'Warrior', 'Kriegern', 'Krieger'],
  paladin: ['Paladins', 'Paladinen', 'Paladine', 'Paladin'],
  hunter: ['Hunters', 'Hunter', 'Jägern', 'Jäger'],
  rogue: ['Rogues', 'Rogue', 'Schurken', 'Schurke'],
  priest: ['Priests', 'Priest', 'Priestern', 'Priester'],
  shaman: ['Shamans', 'Shaman', 'Schamanen', 'Schamane'],
  mage: ['Mages', 'Mage', 'Magiern', 'Magier'],
  warlock: ['Warlocks', 'Warlock', 'Hexenmeistern', 'Hexenmeister'],
  druid: ['Druids', 'Druid', 'Druiden', 'Druide']
};
/** Spec names (English + German) per class -> spec id — only matched next to a class ("Schutz-Paladine", "Holy Priest"). */
const GAME_SPEC_WORDS = {
  warrior: { arms: ['Arms', 'Waffen'], fury: ['Fury', 'Furor'], protection: ['Protection', 'Schutz'] },
  paladin: { holy: ['Holy', 'Heilig'], protection: ['Protection', 'Schutz'], retribution: ['Retribution', 'Vergeltung', 'Vergelter'] },
  hunter: { beast_mastery: ['Beast Mastery', 'Tierherrschaft'], marksmanship: ['Marksmanship', 'Treffsicherheit'], survival: ['Survival', 'Überleben'] },
  rogue: { assassination: ['Assassination', 'Meucheln'], combat: ['Combat', 'Kampf'], subtlety: ['Subtlety', 'Täuschung'] },
  priest: { discipline: ['Discipline', 'Disziplin'], holy: ['Holy', 'Heilig'], shadow: ['Shadow', 'Schatten'] },
  shaman: { elemental: ['Elemental', 'Elementar'], enhancement: ['Enhancement', 'Verstärkung'], restoration: ['Restoration', 'Resto', 'Wiederherstellung'] },
  mage: { arcane: ['Arcane', 'Arkan'], fire: ['Fire', 'Feuer'], frost: ['Frost'] },
  warlock: { affliction: ['Affliction', 'Gebrechen'], demonology: ['Demonology', 'Dämonologie'], destruction: ['Destruction', 'Zerstörung'] },
  druid: { balance: ['Balance', 'Gleichgewicht', 'Moonkin', 'Eulen'], feral: ['Feral', 'Wilder Kampf', 'Wilder-Kampf', 'Katzen'], feral_tank: ['Bären'], restoration: ['Restoration', 'Resto', 'Wiederherstellung'] }
};
const gameRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let gameMentionRegex = null;
/** @type {Map<string, { classId: string, specId: string }>} */
let gameMentionIndex = null;
function gameMentionSetup(){
  if (gameMentionRegex) return;
  gameMentionIndex = new Map();
  const alts = [];
  for (const [classId, words] of Object.entries(GAME_CLASS_WORDS)) {
    for (const w of words) {
      gameMentionIndex.set(w.toLowerCase(), { classId, specId: '' });
      alts.push(w);
      for (const [specId, specWords] of Object.entries(GAME_SPEC_WORDS[classId] || {})) {
        for (const sw of specWords) for (const joiner of ['-', ' ']) {
          // "Schutz-Paladine", "Holy Priest" (spec first) …
          const key = `${sw}${joiner}${w}`;
          gameMentionIndex.set(key.toLowerCase(), { classId, specId });
          alts.push(key);
        }
      }
    }
  }
  // Longest first, so "Schutz-Paladine" wins over "Paladine".
  alts.sort((a, z) => z.length - a.length);
  gameMentionRegex = new RegExp(`(^|[^A-Za-zÀ-ÖØ-öø-ÿ])(${alts.map(gameRe).join('|')})(?![A-Za-zÀ-ÖØ-öø-ÿ])`, 'g');
}

/**
 * Puts the class (or, with a spec next to it, the spec) icon in front of
 * every class mention in the text of rootEl. Run before
 * annotateSpellMentions (which skips these).
 * @param {HTMLElement} rootEl
 */
function annotateClassMentions(rootEl){
  if (!rootEl) return;
  gameMentionSetup();
  const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, {
    acceptNode: n => (n.parentElement && n.parentElement.closest('.game-mention, button, a') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)
  });
  const nodes = [];
  let node;
  while ((node = walker.nextNode())) nodes.push(node);
  for (const textNode of nodes) {
    const text = textNode.nodeValue;
    gameMentionRegex.lastIndex = 0;
    let m, last = 0, any = false;
    const frag = document.createDocumentFragment();
    while ((m = gameMentionRegex.exec(text))) {
      const start = m.index + m[1].length, word = m[2];
      const hit = gameMentionIndex.get(word.toLowerCase());
      if (!hit) continue;
      any = true;
      if (start > last) frag.appendChild(document.createTextNode(text.slice(last, start)));
      const url = hit.specId ? foreverSpecIconUrl(hit.classId, hit.specId) : foreverClassIconUrl(hit.classId);
      const span = document.createElement('span');
      span.className = 'game-mention';
      span.style.setProperty('--class-color', CLASS_MAP[hit.classId] ? CLASS_MAP[hit.classId].color : 'inherit');
      if (url){
        const img = document.createElement('img');
        img.className = 'game-icon';
        img.src = url;
        img.alt = '';
        img.loading = 'lazy';
        img.onerror = () => { img.style.display = 'none'; };
        span.appendChild(img);
      }
      span.appendChild(document.createTextNode(word));
      span.title = hit.specId ? `${foreverSpecLabel(hit.classId, hit.specId)} · ${CLASS_MAP[hit.classId].label}` : CLASS_MAP[hit.classId].label;
      frag.appendChild(span);
      last = start + word.length;
    }
    if (!any) continue;
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    textNode.parentNode.replaceChild(frag, textNode);
  }
}

/** "17 Spieler dabei · [Tank] 2 · [Heal] 6 · [DD] 11" (HTML). @param {{ players: number, tank: any[], healer: any[], damage: any[] }} r */
function roleCountsHtml(r){
  return `${r.players} Spieler dabei <span class="role-counts">${['tank', 'healer', 'damage'].map(role => `<span class="role-count">${roleIconHtml(role, 16)}${r[role].length}</span>`).join('')}</span>`;
}
