/**
 * TTF Companion - Configuration & static maps (ES module).
 * Spreadsheet endpoints, icon/label maps, and the named color palette.
 */

export const SPREADSHEET_BASE =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vRFrS2boMIFndbJnIDUBFfHcZvD-20nwBM-bUky6tb8euQi6eYuih4lDemnLZ3PMIwFtcOlauV_JJuR/pub?single=true&output=csv';

export const SHEET_CSV_URL = SPREADSHEET_BASE + '&gid=1154431008';   // Cards tab
export const SETS_CSV_URL = SPREADSHEET_BASE + '&gid=0';             // Set metadata tab
export const FUSIONS_CSV_URL = SPREADSHEET_BASE + '&gid=842880450';  // Weekly fusion tab

export const SKILL_TYPE_ICONS = {
  Speed: '../assets/icons/speed.png',
  Accuracy: '../assets/icons/accuracy.png',
  Control: '../assets/icons/control.png',
  Strength: '../assets/icons/strength.png',
  Leadership: '../assets/icons/leadership.png',
};

export const POSITION_LABELS = {
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

/** Resolve a named color (or passthrough hex/other) to a hex string. */
export function resolveColor(value) {
  if (!value) return null;
  if (value.startsWith('#')) return value;
  return COLOR_PALETTE[value.toLowerCase()] || value;
}
