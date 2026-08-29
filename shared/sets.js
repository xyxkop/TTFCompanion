/**
 * TTF Companion - Set metadata (ES module).
 * Loads per-set config from the sets tab and exposes set-derived helpers.
 */
import { SETS_CSV_URL, resolveColor } from './config.js';
import { parseCSVLines } from './csv.js';
import { DEFAULT_PHYSICAL_NUMBERING } from './parallels.js';

// Loaded from the sets metadata sheet. Reassigned by parseSetsConfig();
// importers get a live binding.
export let setConfigs = {};

export async function loadSetsConfig() {
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

    // Availability enum. Legacy 'PARTIAL' is treated as STANDARD availability;
    // partiality is now driven solely by the Partial Parallel Cards column.
    let parallelType = (entry['Parallel Type'] || 'STANDARD').trim().toUpperCase();
    if (parallelType === 'PARTIAL') parallelType = 'STANDARD';
    if (!['STANDARD', 'NO_DIGITAL', 'NO_PHYSICAL'].includes(parallelType)) {
      parallelType = 'STANDARD';
    }

    const config = {
      bg: resolveColor(entry['Background Color']) || '#ffffff',
      text: resolveColor(entry['Text Color']) || '#000000',
      cardNumberColor: resolveColor(entry['Card Number Color']) || '#555555',
      parallelType,
      // Non-empty ⇒ set is partial and only these cards get parallels (both
      // digital and physical). Empty/null ⇒ full set.
      partialParallelCards: entry['Partial Parallel Cards']
        ? new Set(entry['Partial Parallel Cards'].split(',').map(s => s.trim()).filter(Boolean))
        : null,
      // Named physical numbering scheme (STANDARD, STANDARD_WITH_P60, ...).
      physicalNumbering: (entry['Physical Numbering'] || DEFAULT_PHYSICAL_NUMBERING).trim() || DEFAULT_PHYSICAL_NUMBERING,
      omegaCard: entry['Omega Card']
        ? new Set(entry['Omega Card'].split(',').map(s => s.trim()).filter(Boolean))
        : null,
      // Playable defaults to true; only an explicit FALSE marks a set as
      // collectible-but-not-playable (excluded from the deck builder).
      playable: (entry['Playable'] || '').trim().toUpperCase() !== 'FALSE',
    };

    setConfigs[setName] = config;
  }
}

/**
 * Whether a set is playable (usable in the deck builder).
 * Sets without metadata default to playable; only an explicit
 * Playable=FALSE marks a set as collectible-only.
 */
export function isSetPlayable(setName) {
  const config = setConfigs[setName];
  return !config || config.playable !== false;
}

export function getSetColor(setName) {
  if (setConfigs[setName]) {
    return { bg: setConfigs[setName].bg, text: setConfigs[setName].text };
  }
  return null;
}

export function getSetBackground(setName) {
  const filename = setName.toLowerCase().replace(/['']/g, '').replace(/\s+/g, '_');
  return `../assets/backgrounds/${filename}.jpg`;
}

export function getCardNumberColor(setName) {
  if (setConfigs[setName]) return setConfigs[setName].cardNumberColor;
  return '#555555';
}
