/**
 * TTF Companion - Canonical parallel identifiers (shared).
 *
 * Single source of truth for WHICH parallels exist and their display order.
 * Feature-specific metadata (synergy bonuses, deck-share codes, display labels,
 * digital/physical handling) lives in the module that uses it, not here.
 *
 * Dependency-free (no DOM, no fetch) and UMD-wrapped: available as a browser
 * global (window.Parallels) and require()-able in Node for tests.
 *
 * The values are the literal strings used in the Google Sheet's "Parallel" column.
 * 'Base' (the un-paralleled card) is intentionally NOT a parallel and is not listed.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Parallels = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Enum of parallel identifiers. Named keys map to the sheet's literal strings.
   * Access as Parallel.ALPHA, Parallel.P77, Parallel.P75, etc.
   */
  const Parallel = Object.freeze({
    ALPHA: '\u03B1/\u03B1',
    P77: '#/77',
    P66: '#/66',
    P44: '#/44',
    P11: '#/11',
    OMEGA: '\u03A9/\u03A9',
    P99: '#/99',
    P75: '#/75',
    P50: '#/50',
    P35: '#/35',
    P25: '#/25',
    P10: '#/10',
    P7: '#/7',
    P5: '#/5',
    P1: '1/1',
  });

  // Display order (also the full supported list) for each parallel type.
  const DIGITAL_ORDER = Object.freeze([
    Parallel.ALPHA, Parallel.P77, Parallel.P66, Parallel.P44, Parallel.P11, Parallel.OMEGA,
  ]);
  const PHYSICAL_ORDER = Object.freeze([
    Parallel.P99, Parallel.P75, Parallel.P50, Parallel.P35, Parallel.P25,
    Parallel.P10, Parallel.P7, Parallel.P5, Parallel.P1,
  ]);

  return { Parallel, DIGITAL_ORDER, PHYSICAL_ORDER };
});
