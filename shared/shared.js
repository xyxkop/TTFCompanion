/**
 * TTF Companion - Shared Module
 * Configuration, data loading, card rendering, and utilities.
 * All tool pages load this before their own script.
 */

// ============================================================
// CONFIGURATION
// ============================================================

const SPREADSHEET_BASE =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vRFrS2boMIFndbJnIDUBFfHcZvD-20nwBM-bUky6tb8euQi6eYuih4lDemnLZ3PMIwFtcOlauV_JJuR/pub?single=true&output=csv';

const SHEET_CSV_URL = SPREADSHEET_BASE + '&gid=1154431008';   // Cards tab
const SETS_CSV_URL = SPREADSHEET_BASE + '&gid=0';             // Set metadata tab
const FUSIONS_CSV_URL = SPREADSHEET_BASE + '&gid=842880450';   // Weekly fusion tab

// Set config loaded from the sets metadata sheet
let setConfigs = {};

const SKILL_TYPE_ICONS = {
  Speed: '../assets/icons/speed.png',
  Accuracy: '../assets/icons/accuracy.png',
  Control: '../assets/icons/control.png',
  Strength: '../assets/icons/strength.png',
  Leadership: '../assets/icons/leadership.png',
};

const POSITION_LABELS = {
  Goalkeeper: 'GK', Defender: 'DEF', Midfielder: 'MID', Forward: 'FWD',
};

const COLOR_PALETTE = {
  'white': '#ffffff',
  'black': '#000000',
  'dark-grey': '#444444',
  'grey': '#999999',
  'red': '#cc0000',
  'orange': '#ee7700',
  'pink': '#ff77aa',
  'navy': '#1a1a4e',
  'blue': '#2255cc',
  'light-blue': '#aaccee',
  'ice-blue': '#e8f0ff',
  'cyan': '#00cccc',
  'teal': '#33ccaa',
  'purple': '#7700aa',
  'green': '#228833',
  'light-green': '#aaffaa',
  'yellow': '#ffdd00',
  'gold': '#cc9900',
  'light-yellow': '#fffde6',
  'beige': '#f5eedc',
  'brown': '#553322',
  'magenta': '#cc00cc',
  'lime': '#33cc33',
  'lavender': '#e0d8ee',
};

// ============================================================
// COLOR & SET HELPERS
// ============================================================

function resolveColor(value) {
  if (!value) return null;
  if (value.startsWith('#')) return value;
  return COLOR_PALETTE[value.toLowerCase()] || value;
}

function getSetColor(setName) {
  if (setConfigs[setName]) {
    return { bg: setConfigs[setName].bg, text: setConfigs[setName].text };
  }
  return null;
}

function getSetBackground(setName) {
  const filename = setName.toLowerCase().replace(/['']/g, '').replace(/\s+/g, '_');
  return `../assets/backgrounds/${filename}.jpg`;
}

function getCardNumberColor(setName) {
  if (setConfigs[setName]) return setConfigs[setName].cardNumberColor;
  return '#555555';
}

// ============================================================
// DATA LOADING
// ============================================================

async function loadSetsConfig() {
  try {
    const response = await fetch(SETS_CSV_URL + '&_t=' + Date.now());
    if (!response.ok) return;
    parseSetsConfig(await response.text());
  } catch (err) {
    console.warn('Failed to load sets config:', err);
  }
}

function parseSetsConfig(text) {
  const lines = parseCSVLines(text);
  if (lines.length < 2) return;

  const header = lines[0].map(col => col.trim());
  setConfigs = {};

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i];
    if (row.length === 0 || (row.length === 1 && row[0] === '')) continue;

    const entry = {};
    for (let j = 0; j < header.length; j++) {
      entry[header[j]] = (row[j] || '').trim();
    }

    const setName = entry['Set Name'];
    if (!setName) continue;

    const config = {
      bg: resolveColor(entry['Background Color']) || '#ffffff',
      text: resolveColor(entry['Text Color']) || '#000000',
      cardNumberColor: resolveColor(entry['Card Number Color']) || '#555555',
      parallelType: entry['Parallel Type'] || 'STANDARD',
      partialParallelCards: null,
      omegaCard: entry['Omega Card']
        ? new Set(entry['Omega Card'].split(',').map(s => s.trim()).filter(Boolean))
        : null,
      // Playable defaults to true; only an explicit FALSE marks a set as
      // collectible-but-not-playable (excluded from the deck builder).
      playable: (entry['Playable'] || '').trim().toUpperCase() !== 'FALSE',
    };

    if (config.parallelType === 'PARTIAL' && entry['Partial Parallel Cards']) {
      config.partialParallelCards = new Set(
        entry['Partial Parallel Cards'].split(',').map(s => s.trim()).filter(Boolean)
      );
    }

    setConfigs[setName] = config;
  }
}

async function loadCards() {
  const response = await fetch(SHEET_CSV_URL + '&_t=' + Date.now());
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return parseCSV(await response.text());
}

/**
 * Load weekly fusion definitions from the fusion tab.
 * Columns (header-keyed, order-independent):
 *   Week, Player, Club, Position, Skill Type 1, Skill Type 2, Set, License,
 *   Row 1, Row 2, Row 3, Row 4
 * Each "Row N" cell is "count:requirement" (e.g. "3:player", "4:skilltype=Accuracy/Control").
 * Returns an array of fusion objects (see parseFusions).
 */
async function loadFusions() {
  const response = await fetch(FUSIONS_CSV_URL + '&_t=' + Date.now());
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return parseFusions(await response.text());
}

function parseFusions(text) {
  const lines = parseCSVLines(text);
  if (lines.length < 2) return [];

  const header = lines[0].map(col => col.trim());
  const fusions = [];

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i];
    if (row.length === 0 || (row.length === 1 && row[0] === '')) continue;

    const entry = {};
    for (let j = 0; j < header.length; j++) {
      entry[header[j]] = (row[j] || '').trim();
    }

    const week = entry['Week'];
    if (!week) continue;

    const rows = [];
    for (let r = 1; r <= 4; r++) {
      const cell = (entry[`Row ${r}`] || '').trim();
      if (!cell) continue; // blank row => omitted
      // Format: "count:requirement" (split on the first colon).
      const colonIdx = cell.indexOf(':');
      const count = colonIdx === -1 ? (Number(cell) || 0) : (Number(cell.slice(0, colonIdx).trim()) || 0);
      const requirement = colonIdx === -1 ? '' : cell.slice(colonIdx + 1).trim();
      rows.push({ index: r, count, requirement });
    }

    fusions.push({
      week,
      attributes: {
        player: entry['Player'] || '',
        club: entry['Club'] || '',
        position: entry['Position'] || '',
        skillType1: entry['Skill Type 1'] || '',
        skillType2: entry['Skill Type 2'] || '',
        set: entry['Set'] || '',
        license: entry['License'] || '',
      },
      rows,
    });
  }

  return fusions;
}

function parseCSV(text) {
  const lines = parseCSVLines(text);
  if (lines.length < 2) return [];

  const header = lines[0].map(col => col.trim());
  const cards = [];

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i];
    if (row.length === 0 || (row.length === 1 && row[0] === '')) continue;
    const card = {};
    for (let j = 0; j < header.length; j++) {
      card[header[j]] = (row[j] || '').trim();
    }
    card['Parallel'] = 'Base';
    cards.push(card);
  }

  return cards;
}

// ============================================================
// CSV LINE PARSER
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

// ============================================================
// PARALLEL GENERATION
// ============================================================

function generateParallels(cards) {
  const parallels = [];

  cards.forEach(card => {
    if (!shouldGenerateParallels(card)) return;
    const isGK = card['Position'] === 'Goalkeeper';
    parallels.push(makeParallel(card, Parallels.Parallel.ALPHA, isGK ? { shotblocking: 1 } : { Defence: 2 }));
    parallels.push(makeParallel(card, Parallels.Parallel.P77, isGK ? { shotblocking: 1 } : { Attack: 2 }));
    parallels.push(makeParallel(card, Parallels.Parallel.P66, { Energy: -1 }));
    parallels.push(makeParallel(card, Parallels.Parallel.P44, isGK ? { shotblocking: 2 } : { swap: true }));
    parallels.push(makeParallel(card, Parallels.Parallel.P11, isGK ? { shotblocking: 2 } : { Skill: 2 }));
  });

  // Omega parallels (only for the specific card listed in set metadata)
  cards.forEach(card => {
    if (card['Parallel'] !== 'Base') return;
    if (!shouldGenerateParallels(card)) return;
    const config = setConfigs[card['Set']];
    if (!config || !config.omegaCard) return;
    if (!config.omegaCard.has(card['Card #'])) return;
    parallels.push(makeParallel(card, Parallels.Parallel.OMEGA, { Attack: 2, Defence: 2, Skill: 2, Energy: -1 }));
  });

  return parallels;
}

/**
 * Whether a set is playable (usable in the deck builder).
 * Sets without metadata default to playable; only an explicit
 * Playable=FALSE in set metadata marks a set as collectible-only.
 */
function isSetPlayable(setName) {
  const config = setConfigs[setName];
  return !config || config.playable !== false;
}

function shouldGenerateParallels(card) {
  const setName = card['Set'];
  const config = setConfigs[setName];
  if (!config) return false;
  if (config.parallelType === 'NO_DIGITAL') return false;
  if (config.parallelType === 'PARTIAL') {
    return config.partialParallelCards && config.partialParallelCards.has(card['Card #']);
  }
  return true;
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

function buildCardElement(card) {
  const div = document.createElement('div');
  div.className = 'card';

  const cardSetName = card['Set'] || '';
  const bgImage = setConfigs[cardSetName] ? getSetBackground(cardSetName) : null;
  if (bgImage) {
    div.style.backgroundImage = `linear-gradient(rgba(255,255,255,0.2), rgba(255,255,255,0.2)), url(${bgImage})`;
    div.style.backgroundSize = 'cover';
    div.style.backgroundPosition = 'center';
  }

  // Parallel badge
  const parallel = card['Parallel'] || 'Base';
  if (parallel !== 'Base') {
    const badge = document.createElement('div');
    badge.className = 'card-parallel-badge';
    badge.textContent = parallel;
    div.appendChild(badge);
  }

  // Set header
  const setEl = document.createElement('div');
  setEl.className = 'card-set';
  const setName = card['Set'] || '';
  const license = card['License'] || '';
  setEl.textContent = [license, setName].filter(Boolean).join(' | ');
  const setColor = getSetColor(setName);
  if (setColor) { setEl.style.background = setColor.bg; setEl.style.color = setColor.text; }
  div.appendChild(setEl);

  // Player info
  const playerInfo = document.createElement('div');
  playerInfo.className = 'card-player-info';
  const nameEl = document.createElement('div');
  nameEl.className = 'card-name';
  nameEl.textContent = `${card['First Name'] || ''} ${card['Second Name'] || ''}`.trim() || '(unnamed)';
  playerInfo.appendChild(nameEl);
  if (card['Club']) {
    const clubEl = document.createElement('div');
    clubEl.className = 'card-club';
    clubEl.textContent = card['Club'];
    playerInfo.appendChild(clubEl);
  }
  div.appendChild(playerInfo);

  // Bottom section
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

  // Card number
  const cardNumEl = document.createElement('div');
  cardNumEl.className = 'card-number';
  cardNumEl.textContent = card['Card #'] || '';
  if (bgImage) cardNumEl.style.color = getCardNumberColor(cardSetName);
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
  el.innerHTML = `<strong>${escapeHtml(title)}</strong>${text && text !== 'N/A' ? '<br><span>' + escapeHtml(text) + '</span>' : ''}`;
  container.appendChild(el);
}

// ============================================================
// HOVER PREVIEW
// ============================================================

let _previewEl = null;

function showPreview(card, rowEl) {
  hidePreview();
  _previewEl = buildCardElement(card);
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

function buildDeckRow(card) {
  const row = document.createElement('div');
  row.className = 'deck-row';

  const setName = card['Set'] || '';
  const setColor = getSetColor(setName);
  if (setColor) row.style.borderLeft = `4px solid ${setColor.bg}`;
  const bgImage = setConfigs[setName] ? getSetBackground(setName) : null;
  if (bgImage) {
    row.style.backgroundImage = `linear-gradient(rgba(255,255,255,0.2), rgba(255,255,255,0.2)), url(${bgImage})`;
    row.style.backgroundSize = 'cover';
    row.style.backgroundPosition = 'center';
  }

  // Content wrapper
  const contentWrapper = document.createElement('div');
  contentWrapper.className = 'deck-content';

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
  contentWrapper.appendChild(leftCol);

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
  contentWrapper.appendChild(rightCol);
  row.appendChild(contentWrapper);

  // Parallel badge
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
