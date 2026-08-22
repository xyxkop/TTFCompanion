/**
 * TTF Companion - Generic utilities (ES module). No app-specific logic.
 */

/** Escape a string for safe insertion as HTML text. */
export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/** Diacritic-folding, lowercase normalization for search/matching. */
export function normalize(str) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00f8/g, 'o').replace(/\u00d8/g, 'o')
    .replace(/\u00e6/g, 'ae').replace(/\u00c6/g, 'ae')
    .replace(/\u00f0/g, 'd').replace(/\u00d0/g, 'd')
    .replace(/\u00df/g, 'ss')
    .toLowerCase();
}
