/**
 * TTF Companion - Canonical parallel identifiers (shared).
 *
 * Single source of truth for WHICH parallels exist and their display order.
 * Feature-specific metadata (synergy bonuses, deck-share codes, digital/physical
 * handling) lives in the module that uses it, not here.
 *
 * Dependency-free (no DOM, no fetch) ES module.
 *
 * The values are the literal strings used in the Google Sheet's "Parallel" column.
 * 'Base' (the un-paralleled card) is intentionally NOT a parallel and is not listed.
 */

/**
 * Enum of parallel identifiers. Named keys map to the sheet's literal strings.
 * Access as Parallel.ALPHA, Parallel.P77, Parallel.P75, etc.
 */
export const Parallel = Object.freeze({
  ALPHA: '\u03B1/\u03B1',
  P77: '#/77',
  P66: '#/66',
  P44: '#/44',
  P11: '#/11',
  OMEGA: '\u03A9/\u03A9',
  P99: '#/99',
  P75: '#/75',
  P60: '#/60',
  P50: '#/50',
  P35: '#/35',
  P25: '#/25',
  P10: '#/10',
  P7: '#/7',
  P5: '#/5',
  P1: '1/1',
});

// The un-paralleled card. Not a parallel, but used in the digital "column" set.
export const BASE = 'Base';

// Display order (also the full supported list) for each parallel type.
export const DIGITAL_ORDER = Object.freeze([
  Parallel.ALPHA, Parallel.P77, Parallel.P66, Parallel.P44, Parallel.P11, Parallel.OMEGA,
]);
export const PHYSICAL_ORDER = Object.freeze([
  Parallel.P99, Parallel.P75, Parallel.P60, Parallel.P50, Parallel.P35, Parallel.P25,
  Parallel.P10, Parallel.P7, Parallel.P5, Parallel.P1,
]);

// Base + all digital parallels (the digital "column" set for the collection tracker).
export const DIGITAL_WITH_BASE = Object.freeze([BASE, ...DIGITAL_ORDER]);

// Printable parallels that current sets actually issue (standard numbering).
// /60, /35 and /7 exist in PHYSICAL_ORDER but the standard scheme omits them;
// sets that issue /60 use the STANDARD_WITH_P60 scheme below.
export const PHYSICAL_STANDARD = Object.freeze([
  Parallel.P99, Parallel.P75, Parallel.P50, Parallel.P25, Parallel.P10, Parallel.P5, Parallel.P1,
]);

// ============================================================
// PHYSICAL NUMBERING SCHEMES
// A set's metadata names one of these schemes; it decides which /N tiers the
// set prints. Add a new named scheme here when a set introduces a new mix.
// Each list is kept in canonical PHYSICAL_ORDER.
// ============================================================
export const PHYSICAL_NUMBERING = Object.freeze({
  STANDARD: PHYSICAL_STANDARD,
  STANDARD_WITH_P60: Object.freeze([
    Parallel.P99, Parallel.P75, Parallel.P60, Parallel.P50, Parallel.P25,
    Parallel.P10, Parallel.P5, Parallel.P1,
  ]),
});

export const DEFAULT_PHYSICAL_NUMBERING = 'STANDARD';

// Union of every physical numbering scheme, in canonical PHYSICAL_ORDER. Used
// for the collection tracker's physical column headers so any parallel a set
// might issue (e.g. /60) has a column; per-card availability gates each cell.
export const PHYSICAL_ALL = Object.freeze(
  PHYSICAL_ORDER.filter(p => Object.values(PHYSICAL_NUMBERING).some(list => list.includes(p)))
);

/** Resolve a scheme name to its ordered parallel list (falls back to STANDARD). */
export function physicalNumberingScheme(name) {
  return PHYSICAL_NUMBERING[name] || PHYSICAL_STANDARD;
}

// ============================================================
// SET-AWARE AVAILABILITY
// Which parallels a card can have, based on its set config. `config` is the
// set's metadata object (from setConfigs) or undefined; `cardNumber` is Card #.
//
// Model:
//  - config.parallelType: 'STANDARD' (both), 'NO_DIGITAL' (physical-only),
//    or 'NO_PHYSICAL' (digital-only).
//  - config.partialParallelCards: a Set of card numbers. When non-empty, the
//    set is PARTIAL and ONLY these cards get parallels (both digital and
//    physical); every other card gets base only. Empty/null means full.
//  - config.physicalNumbering: named scheme deciding which /N tiers print.
// ============================================================

/** True when the set is partial and this card is not in its parallel list. */
function partialExcludes(config, cardNumber) {
  const cards = config.partialParallelCards;
  return !!(cards && cards.size > 0 && !cards.has(cardNumber));
}

/** Digital parallels available to a card (includes Base). */
export function digitalParallelsFor(config, cardNumber) {
  if (!config || config.parallelType === 'NO_DIGITAL') return [BASE];
  if (partialExcludes(config, cardNumber)) return [BASE];
  const list = [BASE, ...DIGITAL_ORDER.filter(p => p !== Parallel.OMEGA)];
  if (config.omegaCard && config.omegaCard.has(cardNumber)) list.push(Parallel.OMEGA);
  return list;
}

/** Printable (physical) parallels available to a card (includes the base /99). */
export function physicalParallelsFor(config, cardNumber) {
  if (!config) return [Parallel.P99];
  if (config.parallelType === 'NO_PHYSICAL') return [];
  const scheme = physicalNumberingScheme(config.physicalNumbering);
  if (partialExcludes(config, cardNumber)) return [scheme[0]];
  return scheme.slice();
}
