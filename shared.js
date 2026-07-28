/**
 * TTF Companion - Shared Module
 * Configuration, data loading, card rendering, and utilities.
 */

// ============================================================
// CONFIGURATION
// ============================================================

const SHEET_CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vRnVPbikUcch1oZ7IFsKqH4K0kDHy6cHQuET5lHZrGrCTCXfWKiWSq-F5l4YXpXf2dNrqVZSjxFnWSr/pub?gid=0&single=true&output=csv';

const SPECIAL_PARALLELS = {
  '651-PA': { parallel: '\u03B1/\u03B1', set: 'Shatterpoint', cardNum: '651' },
  '651-PO': { parallel: '\u03A9/\u03A9', set: 'Shatterpoint', cardNum: '651' },
  '686-PA': { parallel: '\u03B1/\u03B1', set: 'Storm', cardNum: '686' },
  '686-PO': { parallel: '\u03A9/\u03A9', set: 'Storm', cardNum: '686' },
};

const SKILL_TYPE_ICONS = {
  Speed: 'icons/speed.png',
  Accuracy: 'icons/accuracy.png',
  Control: 'icons/control.png',
  Strength: 'icons/strength.png',
  Leadership: 'icons/leadership.png',
};

const POSITION_LABELS = {
  Goalkeeper: 'GK', Defender: 'DEF', Midfielder: 'MID', Forward: 'FWD',
};

const SET_COLORS = {
  'Base': { bg: '#ffffff', text: '#000000' },
  'Fusion': { bg: '#cc0000', text: '#ffffff' },
  'Pro Pass': { bg: '#444444', text: '#ffffff' },
  'Season Kick-off': { bg: '#2255cc', text: '#ffffff' },
  'Vibrant Velocity': { bg: '#111111', text: '#33cc33' },
  'One to Watch': { bg: '#00cccc', text: '#7700aa' },
  'Shatterpoint': { bg: '#999999', text: '#000000' },
  'Total Performers': { bg: '#aaccee', text: '#000000' },
  'Legends': { bg: '#ffffff', text: '#996600' },
  "Collector's Reserve": { bg: '#1a1a4e', text: '#ffffff' },
  'Greatest Show': { bg: '#cc0000', text: '#ffdd00' },
  'Storm': { bg: '#999999', text: '#996600' },
  'Halloween': { bg: '#ee7700', text: '#000000' },
  'Master Magicians': { bg: '#1a1a4e', text: '#ffffaa' },
  '30th Anniversary': { bg: '#1a1a4e', text: '#ff99bb' },
  'Team of the Season': { bg: '#ff77aa', text: '#ffffff' },
  'Birthday': { bg: '#ff99cc', text: '#1a1a4e' },
  'Terraces': { bg: '#228833', text: '#ffffff' },
  'White Ice': { bg: '#e8f0ff', text: '#1a3366' },
  'Iconic Numbers': { bg: '#ffffff', text: '#000000' },
  'Standout': { bg: '#ffffff', text: '#226622' },
  'Festive': { bg: '#aaffaa', text: '#cc0000' },
  'New Year': { bg: '#1a1a4e', text: '#ffdd00' },
  'Shockwave': { bg: '#2255cc', text: '#ffffff' },
  'Classic': { bg: '#eeffee', text: '#cc0000' },
  'Reign Supreme': { bg: '#ffffff', text: '#000000' },
  'Titanium': { bg: '#444444', text: '#ffffff' },
  'First Class': { bg: '#444444', text: '#ffffff' },
  'Legacy': { bg: '#aaddee', text: '#2244aa' },
  'Clarity': { bg: '#ffffff', text: '#999999' },
  'Inferno': { bg: '#cc0000', text: '#ffdd00' },
  'Next Goal Wins': { bg: '#33ccaa', text: '#7700aa' },
  'Gallery': { bg: '#ffffff', text: '#ee7700' },
  'Pitch to Dugout': { bg: '#f5eedc', text: '#000000' },
  'Encrypted': { bg: '#cc00cc', text: '#ccddee' },
  'Neon Noir': { bg: '#1a1a4e', text: '#ffdd00' },
  "He's Him": { bg: '#ffffff', text: '#cc0000' },
  'Chromium Base': { bg: '#e0d8ee', text: '#000000' },
  'Record Breakers': { bg: '#22aa88', text: '#ffffff' },
  'Limited Edition': { bg: '#fffde6', text: '#996600' },
  'Baroque': { bg: '#553322', text: '#ffffff' },
  'Box Office': { bg: '#444444', text: '#ffffff' },
  'Glow': { bg: '#111111', text: '#88ccff' },
  'Aeternus': { bg: '#ccdde8', text: '#aa8800' },
  'Eternal Gold': { bg: '#cc9900', text: '#ffffff' },
  'Darkness': { bg: '#000000', text: '#666666' },
};

// ============================================================
// CSV PARSING
// ============================================================

function parseCSVLines(text) {
  const lines = [];
  let current = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') { field += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { field += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { current.push(field); field = ''; }
      else if (ch === '\r' && next === '\n') { current.push(field); field = ''; lines.push(current); current = []; i++; }
      else if (ch === '\n') { current.push(field); field = ''; lines.push(current); current = []; }
      else { field += ch; }
    }
  }
  if (field || current.length > 0) { current.push(field); lines.push(current); }
  return lines;
}

function parseCardsFromCSV(text) {
  const lines = parseCSVLines(text);
  if (lines.length < 2) return { baseCards: [], allCards: [], parallels: [] };

  const header = lines[0].map(col => col.trim());
  const baseCards = [];

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i];
    if (row.length === 0 || (row.length === 1 && row[0] === '')) continue;
    const card = {};
    for (let j = 0; j < header.length; j++) {
      card[header[j]] = (row[j] || '').trim();
    }
    card['Parallel'] = 'Base';
    baseCards.push(card);
  }

  // Reclassify special parallels
  baseCards.forEach(card => {
    const sp = SPECIAL_PARALLELS[card['Card #']];
    if (sp) { card['Parallel'] = sp.parallel; card['Set'] = sp.set; card['Card #'] = sp.cardNum; }
  });

  const parallels = generateParallels(baseCards);
  const allCards = baseCards.concat(parallels);
  return { baseCards, allCards, parallels };
}

// ============================================================
// PARALLEL GENERATION
// ============================================================

function generateParallels(baseCards) {
  const parallels = [];
  baseCards.forEach(card => {
    if (card['Parallels?'] !== 'Y') return;
    const isGK = card['Position'] === 'Goalkeeper';
    parallels.push(makeParallel(card, '\u03B1/\u03B1', isGK ? { shotblocking: 1 } : { Defence: 2 }));
    parallels.push(makeParallel(card, '#/77', isGK ? { shotblocking: 1 } : { Attack: 2 }));
    parallels.push(makeParallel(card, '#/66', { Energy: -1 }));
    parallels.push(makeParallel(card, '#/44', isGK ? { shotblocking: 2 } : { swap: true }));
    parallels.push(makeParallel(card, '#/11', isGK ? { shotblocking: 2 } : { Skill: 2 }));
  });
  baseCards.forEach(card => {
    if (card['Omega?'] !== 'Y' || card['Parallel'] !== 'Base') return;
    parallels.push(makeParallel(card, '\u03A9/\u03A9', { Attack: 2, Defence: 2, Skill: 2, Energy: -1 }));
  });
  return parallels;
}

function makeParallel(card, parallelName, mods) {
  const p = Object.assign({}, card);
  p['Parallel'] = parallelName;
  if (mods.swap) { p['Attack'] = card['Defence']; p['Defence'] = card['Attack']; }
  else if (mods.shotblocking) {
    p['Ability 1 Text'] = boostShotblocking(card['Ability 1 Text'], mods.shotblocking);
  } else {
    for (const stat of ['Energy', 'Defence', 'Skill', 'Attack']) {
      if (mods[stat] != null) p[stat] = String(Math.max(0, Math.min(Number(card[stat] || 0) + mods[stat], 99)));
    }
  }
  return p;
}

function boostShotblocking(text, amount) {
  if (!text) return text;
  return text.replace(/Defence \+(\d+)/i, (_, n) => `Defence +${Number(n) + amount}`);
}

// ============================================================
// CARD RENDERING
// ============================================================

function buildCardElement(card, skipInteractions) {
  const div = document.createElement('div');
  div.className = 'card';

  const parallel = card['Parallel'] || 'Base';
  if (parallel !== 'Base') {
    const badge = document.createElement('div');
    badge.className = 'card-parallel-badge';
    badge.textContent = parallel;
    div.appendChild(badge);
  }

  const setEl = document.createElement('div');
  setEl.className = 'card-set';
  const setName = card['Set'] || '';
  const license = card['License'] || '';
  setEl.textContent = [license, setName].filter(Boolean).join(' | ');
  const setColor = SET_COLORS[setName];
  if (setColor) { setEl.style.background = setColor.bg; setEl.style.color = setColor.text; }
  div.appendChild(setEl);

  const nameEl = document.createElement('div');
  nameEl.className = 'card-name';
  nameEl.textContent = `${card['First Name'] || ''} ${card['Second Name'] || ''}`.trim() || '(unnamed)';
  div.appendChild(nameEl);

  if (card['Club']) {
    const clubEl = document.createElement('div');
    clubEl.className = 'card-club';
    clubEl.textContent = card['Club'];
    div.appendChild(clubEl);
  }

  const bottomEl = document.createElement('div');
  bottomEl.className = 'card-bottom';

  const statsCol = document.createElement('div');
  statsCol.className = 'card-stats-col';
  statsCol.appendChild(buildStat('defence', card['Defence'] || '0'));
  statsCol.appendChild(buildStat('skill', card['Skill'] || '0'));
  statsCol.appendChild(buildStat('attack', card['Attack'] || '0'));
  bottomEl.appendChild(statsCol);

  const infoCol = document.createElement('div');
  infoCol.className = 'card-info-col';
  const posEl = document.createElement('div');
  posEl.className = 'card-position';
  posEl.textContent = POSITION_LABELS[card['Position']] || card['Position'];
  infoCol.appendChild(posEl);
  infoCol.appendChild(buildStat('energy', `\u26A1 ${card['Energy'] || '0'}`));
  const skillTypesEl = document.createElement('div');
  skillTypesEl.className = 'card-skill-types';
  [card['Skill Type #1'], card['Skill Type #2']].forEach(st => {
    if (st) {
      const icon = document.createElement('img');
      icon.className = 'skill-type-icon';
      icon.src = SKILL_TYPE_ICONS[st] || '';
      icon.alt = st;
      skillTypesEl.appendChild(icon);
    }
  });
  infoCol.appendChild(skillTypesEl);
  bottomEl.appendChild(infoCol);

  const abilitiesEl = document.createElement('div');
  abilitiesEl.className = 'card-abilities';
  appendAbility(abilitiesEl, card['Ability 1 Title'], card['Ability 1 Text']);
  appendAbility(abilitiesEl, card['Ability 2 Title'], card['Ability 2 Text']);
  bottomEl.appendChild(abilitiesEl);

  div.appendChild(bottomEl);

  const cardNumEl = document.createElement('div');
  cardNumEl.className = 'card-number';
  cardNumEl.textContent = card['Card #'] || '';
  div.appendChild(cardNumEl);

  return div;
}

function buildStat(type, text) {
  const el = document.createElement('span');
  el.className = `stat stat-${type}`;
  el.innerHTML = text;
  return el;
}

function appendAbility(container, title, text) {
  if (!title || title === 'N/A') return;
  const el = document.createElement('div');
  el.className = 'card-ability';
  el.innerHTML = `<strong>${escapeHtml(title)}</strong>${text && text !== 'N/A' ? ' <span>' + escapeHtml(text) + '</span>' : ''}`;
  container.appendChild(el);
}

// ============================================================
// HOVER PREVIEW
// ============================================================

let _previewEl = null;

function showPreview(card, rowEl) {
  hidePreview();
  _previewEl = buildCardElement(card, true);
  _previewEl.classList.add('deck-preview');
  document.body.appendChild(_previewEl);
  const rowRect = rowEl.getBoundingClientRect();
  const previewRect = _previewEl.getBoundingClientRect();
  _previewEl.style.top = `${Math.max(8, Math.min(rowRect.top, window.innerHeight - previewRect.height - 8))}px`;
  _previewEl.style.left = `${rowRect.left - previewRect.width - 8}px`;
}

function hidePreview() {
  if (_previewEl) { _previewEl.remove(); _previewEl = null; }
}

// ============================================================
// DECK ROW RENDERING
// ============================================================

function buildSharedDeckRow(card) {
  const row = document.createElement('div');
  row.className = 'deck-row';

  const setName = card['Set'] || '';
  const setColor = SET_COLORS[setName];
  if (setColor) row.style.borderLeft = `4px solid ${setColor.bg}`;

  const leftCol = document.createElement('div');
  leftCol.className = 'deck-left';
  const nrgEl = document.createElement('span');
  nrgEl.className = 'deck-energy';
  nrgEl.innerHTML = `\u26A1${card['Energy'] || '0'}`;
  leftCol.appendChild(nrgEl);
  const stBox = document.createElement('span');
  stBox.className = 'deck-skill-types';
  [card['Skill Type #1'], card['Skill Type #2']].forEach(st => {
    if (st) {
      const icon = document.createElement('img');
      icon.src = SKILL_TYPE_ICONS[st] || '';
      icon.className = 'deck-st-icon';
      stBox.appendChild(icon);
    }
  });
  leftCol.appendChild(stBox);
  row.appendChild(leftCol);

  const rightCol = document.createElement('div');
  rightCol.className = 'deck-right';
  const nameEl = document.createElement('div');
  nameEl.className = 'deck-name';
  nameEl.textContent = `${card['First Name'] || ''} ${card['Second Name'] || ''}`.trim();
  rightCol.appendChild(nameEl);
  const bottomLine = document.createElement('div');
  bottomLine.className = 'deck-bottom-line';
  const posEl = document.createElement('span');
  posEl.className = 'deck-pos';
  posEl.textContent = POSITION_LABELS[card['Position']] || '?';
  bottomLine.appendChild(posEl);
  const statsEl = document.createElement('span');
  statsEl.className = 'deck-stats-compact';
  statsEl.innerHTML = `<span class="ds-def">${card['Defence'] || '0'}</span><span class="ds-skl">${card['Skill'] || '0'}</span><span class="ds-atk">${card['Attack'] || '0'}</span>`;
  bottomLine.appendChild(statsEl);
  rightCol.appendChild(bottomLine);
  row.appendChild(rightCol);

  const parallel = card['Parallel'] || 'Base';
  if (parallel !== 'Base') {
    const badge = document.createElement('span');
    badge.className = 'deck-parallel';
    badge.textContent = parallel;
    row.appendChild(badge);
  }

  row.addEventListener('mouseenter', () => showPreview(card, row));
  row.addEventListener('mouseleave', hidePreview);

  return row;
}

function buildEmptySlot(label) {
  const row = document.createElement('div');
  row.className = 'deck-row deck-row-empty';
  const text = document.createElement('span');
  text.className = 'deck-empty-label';
  text.textContent = label || '';
  row.appendChild(text);
  return row;
}

// ============================================================
// UTILITIES
// ============================================================

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function normalize(str) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00f8/g, 'o').replace(/\u00d8/g, 'o')
    .replace(/\u00e6/g, 'ae').replace(/\u00c6/g, 'ae')
    .replace(/\u00f0/g, 'd').replace(/\u00d0/g, 'd')
    .replace(/\u00df/g, 'ss')
    .toLowerCase();
}
