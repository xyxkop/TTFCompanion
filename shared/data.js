/**
 * TTF Companion - Sheet data loading (ES module).
 * Fetches and parses the cards tab and the weekly fusion tab.
 */
import { SHEET_CSV_URL, FUSIONS_CSV_URL } from './config.js';
import { parseCSVLines } from './csv.js';

/**
 * Fetch text with a few retries. The published Google Sheet endpoints 307-redirect
 * to googleusercontent.com and can transiently drop a request when several fire at
 * once (loadAll fetches 3 in parallel), surfacing as "Failed to fetch".
 */
async function fetchText(url, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise(r => setTimeout(r, 300 * (i + 1)));
    }
  }
  throw lastErr;
}

export async function loadCards() {
  return parseCSV(await fetchText(SHEET_CSV_URL + '&_t=' + Date.now()));
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

/**
 * Load weekly fusion definitions from the fusion tab.
 * Columns (header-keyed, order-independent):
 *   Week, Player, Club, Position, Skill Type 1, Skill Type 2, Set, License,
 *   Row 1, Row 2, Row 3, Row 4
 * Each "Row N" cell is "count:requirement" (e.g. "3:player", "4:skilltype=Accuracy/Control").
 */
export async function loadFusions() {
  return parseFusions(await fetchText(FUSIONS_CSV_URL + '&_t=' + Date.now()));
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
