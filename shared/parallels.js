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

// Sentinel for a per-card parallel list (omegaCard, p35Cards) that applies to
// EVERY card in the set. Stored in place of a Set; use cardSetHas() to test.
export const ALL_CARDS = Symbol('ALL_CARDS');

/** Membership test for a per-card parallel set that may be null, a Set, or ALL_CARDS. */
export function cardSetHas(cardSet, cardNumber) {
  if (!cardSet) return false;
  if (cardSet === ALL_CARDS) return true;
  return cardSet.has(cardNumber);
}

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

// Physical parallels that any set might issue, beyond the named schemes. These
// are per-card add-ons (e.g. /35) that still need a collection-tracker column.
const PHYSICAL_EXTRA = Object.freeze([Parallel.P35]);

// Union of every physical numbering scheme plus per-card extras, in canonical
// PHYSICAL_ORDER. Used for the collection tracker's physical column headers so
// any parallel a set might issue (e.g. /60, /35) has a column; per-card
// availability gates each cell.
export const PHYSICAL_ALL = Object.freeze(
  PHYSICAL_ORDER.filter(p =>
    Object.values(PHYSICAL_NUMBERING).some(list => list.includes(p)) || PHYSICAL_EXTRA.includes(p)
  )
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

/** Digital parallels available to a card (includes Base unless the set has no base). */
export function digitalParallelsFor(config, cardNumber) {
  if (!config || config.parallelType === 'NO_DIGITAL') return config && config.hasBase === false ? [] : [BASE];
  const base = config.hasBase === false ? [] : [BASE];
  if (partialExcludes(config, cardNumber)) return base;
  const list = [...base, ...DIGITAL_ORDER.filter(p => p !== Parallel.OMEGA)];
  if (cardSetHas(config.omegaCard, cardNumber)) list.push(Parallel.OMEGA);
  return list;
}

/** Printable (physical) parallels available to a card (includes the base /99). */
export function physicalParallelsFor(config, cardNumber) {
  if (!config) return [Parallel.P99];
  if (config.parallelType === 'NO_PHYSICAL') return [];
  const noBase = config.hasBase === false;
  // The physical base is /99 (always the first tier of every scheme). Drop it
  // when the set has no base cards, so it is printed only in numbered parallels.
  const scheme = noBase
    ? physicalNumberingScheme(config.physicalNumbering).filter(p => p !== Parallel.P99)
    : physicalNumberingScheme(config.physicalNumbering);
  // /35 is a per-card add-on, independent of the numbering scheme AND of the
  // partial-set exclusion: a listed card always has a /35 even if the set is
  // partial and it's otherwise base-only.
  const hasP35 = cardSetHas(config.p35Cards, cardNumber);
  // Partial set: excluded cards only exist as the base /99 (none if no base),
  // plus /35 if that card is listed.
  if (partialExcludes(config, cardNumber)) {
    const excl = noBase ? [] : [Parallel.P99];
    if (hasP35) excl.push(Parallel.P35);
    return excl;
  }
  const list = scheme.slice();
  if (hasP35 && !list.includes(Parallel.P35)) {
    list.push(Parallel.P35);
    list.sort((a, b) => PHYSICAL_ORDER.indexOf(a) - PHYSICAL_ORDER.indexOf(b));
  }
  return list;
}
