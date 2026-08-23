/**
 * TTF Companion - Fusion Helper: synergy engine (pure functions).
 *
 * No DOM, no I/O. ES module usable in the browser and in Node (for tests).
 */
import { Parallel, DIGITAL_ORDER } from '../shared/parallels.js';

// Attribute-match synergy: step function of match count.
// count 0 => ineligible (null).
export const MATCH_SYNERGY = { 0: null, 1: 0, 2: 2, 3: 5, 4: 8, 5: 12, 6: 12 };

// Digital parallel bonus added on top of attribute-match synergy.
// Base is NOT a digital parallel; it contributes no bonus (handled separately).
export const DIGITAL_PARALLEL_BONUS = {
  [Parallel.ALPHA]: 1, [Parallel.P77]: 2, [Parallel.P66]: 3,
  [Parallel.P44]: 4, [Parallel.P11]: 5, [Parallel.OMEGA]: 7,
};

// Printable parallels have NO play styles (skill types excluded from matching).
// P99 (#/99) is omitted: it is equivalent to Base (+0).
export const PHYSICAL_PARALLEL_BONUS = {
  [Parallel.P75]: 2, [Parallel.P50]: 3, [Parallel.P35]: 4, [Parallel.P25]: 4,
  [Parallel.P10]: 5, [Parallel.P7]: 6, [Parallel.P5]: 6, [Parallel.P1]: 7,
};

// Reward tiers, ordered high -> low. Thresholds/multiplier TBD-confirmable.
export const TIERS = [
  { min: 100, label: '10x', mult: 10 },  // guaranteed reward tier
  { min: 40, label: '4x', mult: 4 },
  { min: 20, label: '2x', mult: 2 },
  { min: 0, label: '1x', mult: 1 },
];

// Digital parallels (from shared order) and physical parallels that grant synergy.
export const DIGITAL_PARALLELS = DIGITAL_ORDER.slice();
export const PHYSICAL_PARALLELS = Object.keys(PHYSICAL_PARALLEL_BONUS);

export function normalize(s) {
  return (s == null ? '' : String(s)).trim().toLowerCase();
}

export function isPhysicalParallel(parallel) {
  return Object.prototype.hasOwnProperty.call(PHYSICAL_PARALLEL_BONUS, parallel);
}

/**
 * Count how many of the 6 fusion attributes a card matches.
 * When excludeSkillTypes is true (printable parallels), skill types are ignored.
 * Returns { count, matched: [attrKey,...] }.
 */
export function countMatches(card, fusion, opts) {
  const excludeSkillTypes = !!(opts && opts.excludeSkillTypes);
  const a = fusion.attributes;
  const matched = [];

  const player = normalize((card['First Name'] || '') + ' ' + (card['Second Name'] || ''));
  if (a.player && player === normalize(a.player)) matched.push('player');
  if (a.club && normalize(card['Club']) === normalize(a.club)) matched.push('club');
  if (a.position && normalize(card['Position']) === normalize(a.position)) matched.push('position');
  if (matchesSetAttr(card, fusion)) matched.push('set');

  if (!excludeSkillTypes) {
    const st1 = normalize(card['Skill Type #1']);
    const st2 = normalize(card['Skill Type #2']);
    if (a.skillType1 && (st1 === normalize(a.skillType1) || st2 === normalize(a.skillType1))) matched.push('skillType1');
    if (a.skillType2 && (st1 === normalize(a.skillType2) || st2 === normalize(a.skillType2))) matched.push('skillType2');
  }

  return { count: matched.length, matched };
}

/** Attribute-match synergy for a match count (null when ineligible). */
export function attrSynergy(count) {
  const c = Math.min(Math.max(count, 0), 6);
  return MATCH_SYNERGY[c];
}

/** Parallel bonus for a parallel name (0 for Base; null for unset physical). */
export function parallelBonus(parallel) {
  if (!parallel || parallel === 'Base') return 0;
  if (Object.prototype.hasOwnProperty.call(DIGITAL_PARALLEL_BONUS, parallel)) {
    return DIGITAL_PARALLEL_BONUS[parallel];
  }
  if (isPhysicalParallel(parallel)) return PHYSICAL_PARALLEL_BONUS[parallel];
  return 0;
}

/**
 * Compute synergy variants for a base card against a fusion.
 * availableParallels: list of parallel names available for this card,
 *   where 'Base' denotes the un-paralleled card (not a digital parallel);
 *   determined by caller from set config.
 * Returns null if the card is ineligible (base match count 0),
 * otherwise { card, baseMatchCount, baseSynergy, matched, variants[] }.
 * Physical parallels with an unset (null) bonus are skipped.
 */
export function cardVariants(card, fusion, availableParallels) {
  const base = countMatches(card, fusion, { excludeSkillTypes: false });
  if (base.count === 0) return null; // ineligible

  const baseSynergy = attrSynergy(base.count);
  const physical = countMatches(card, fusion, { excludeSkillTypes: true });
  const physSynergy = attrSynergy(physical.count) || 0;

  const parallels = availableParallels && availableParallels.length ? availableParallels : ['Base'];
  const variants = [];
  for (const p of parallels) {
    if (isPhysicalParallel(p)) {
      const bonus = PHYSICAL_PARALLEL_BONUS[p];
      if (bonus == null) continue; // TBD -> skip until confirmed
      // Physical parallels have no skill types. If the card's only matches were
      // skill types, a physical version matches nothing -> ineligible, skip it.
      if (physical.count === 0) continue;
      variants.push({ parallel: p, matchCount: physical.count, attrSynergy: physSynergy, bonus, value: physSynergy + bonus });
    } else {
      const bonus = parallelBonus(p) || 0;
      variants.push({ parallel: p, matchCount: base.count, attrSynergy: baseSynergy, bonus, value: baseSynergy + bonus });
    }
  }

  return {
    card,
    baseMatchCount: base.count,
    baseSynergy,
    matched: base.matched,
    variants,
  };
}

/** Which tier a total synergy reaches (exactly one, well-ordered). */
export function tierFor(total) {
  for (const t of TIERS) {
    if (total >= t.min) return t;
  }
  return TIERS[TIERS.length - 1];
}

/**
 * Row requirement parser. Grammar:
 *   "attr"          -> match the card against the FUSION's own value(s) for attr
 *   "attr=v1/v2..." -> match against the explicit value(s) ('/' means OR)
 * attr in {player, club, position, skilltype, set}. skilltype matches either
 * of the card's skill types. Blank/unknown -> always true. Never throws.
 * Returns a predicate (card) => boolean. Needs `fusion` to resolve omitted values.
 */
export function parseRequirement(str, fusion) {
  const raw = (str || '').trim();
  if (!raw) return function () { return true; };

  const eqIdx = raw.indexOf('=');
  const attr = (eqIdx === -1 ? raw : raw.slice(0, eqIdx)).trim().toLowerCase();

  // Omitted "set" resolves to the fusion's Set + License pair.
  if (attr === 'set' && eqIdx === -1) {
    return function (card) { return matchesSetAttr(card, fusion); };
  }

  let values;
  if (eqIdx === -1) {
    // Value omitted -> use the fusion's own value(s) for this attribute.
    values = fusionValuesFor(attr, fusion).map(normalize).filter(Boolean);
  } else {
    values = raw.slice(eqIdx + 1).split('/').map(normalize).filter(Boolean);
  }

  if (!values.length) return function () { return true; };
  return function (card) { return cardMatchesAttr(card, attr, values); };
}

// Formal display labels per attribute.
const ATTR_LABEL = {
  player: 'Player', club: 'Club', position: 'Position', skilltype: 'Skill Type', set: 'Set',
};

/**
 * Human-facing label for a row requirement, e.g. "Club: Liverpool FC" or
 * "Skill Type: Control, Accuracy". Values are shown in their original casing;
 * omitted values resolve against the fusion. Blank/unknown -> "Any".
 */
export function formatRequirement(str, fusion) {
  const raw = (str || '').trim();
  if (!raw) return 'Any';

  const eqIdx = raw.indexOf('=');
  const attr = (eqIdx === -1 ? raw : raw.slice(0, eqIdx)).trim().toLowerCase();
  const label = ATTR_LABEL[attr];
  if (!label) return raw; // unknown attr -> show as-is

  let values;
  if (eqIdx === -1) {
    // Omitted "set" shows the Set + License pair, e.g. "Set: Base (PL)".
    if (attr === 'set') {
      const a = (fusion && fusion.attributes) || {};
      const s = (a.set || '').trim();
      const lic = (a.license || '').trim();
      if (!s) return label;
      return `${label}: ${lic ? `${s} (${lic})` : s}`;
    }
    values = fusionValuesFor(attr, fusion).map(v => (v || '').trim()).filter(Boolean);
  } else {
    values = raw.slice(eqIdx + 1).split('/').map(v => v.trim()).filter(Boolean);
  }
  return values.length ? `${label}: ${values.join(', ')}` : label;
}

/**
 * The "set" attribute is a Set + License pair. A card matches when its Set
 * equals the fusion's Set and (if the fusion specifies one) its License too.
 */
function matchesSetAttr(card, fusion) {
  const a = (fusion && fusion.attributes) || {};
  if (!a.set) return false;
  if (normalize(card['Set']) !== normalize(a.set)) return false;
  if (a.license && normalize(card['License']) !== normalize(a.license)) return false;
  return true;
}

/** The fusion's own value(s) for an attribute (used when a requirement omits '='). */
function fusionValuesFor(attr, fusion) {
  const a = (fusion && fusion.attributes) || {};
  switch (attr) {
    case 'player': return [a.player];
    case 'club': return [a.club];
    case 'position': return [a.position];
    case 'set': return [a.set];
    case 'skilltype': return [a.skillType1, a.skillType2];
    default: return [];
  }
}

/** Whether a card's attribute is (one of) the given normalized values. */
function cardMatchesAttr(card, attr, values) {
  switch (attr) {
    case 'player': return values.includes(normalize((card['First Name'] || '') + ' ' + (card['Second Name'] || '')));
    case 'club': return values.includes(normalize(card['Club']));
    case 'position': return values.includes(normalize(card['Position']));
    case 'set': return values.includes(normalize(card['Set']));
    case 'skilltype':
      return values.includes(normalize(card['Skill Type #1'])) || values.includes(normalize(card['Skill Type #2']));
    default: return false;
  }
}

/**
 * Enumerate MINIMAL combinations of non-zero synergy values (from `domain`)
 * that reach `target`, using at most `slots` cards, then pad each to `slots`
 * with zeros. "Minimal" = the sum reaches target and every card is necessary
 * (the partial sum before the last card was below target). This yields the
 * useful set (e.g. 5+5+5+5 for 20) instead of every overshooting multiset.
 *
 * Values are chosen non-increasing, so each multiset appears once.
 * Caps the number of results. Returns array of arrays (each length `slots`).
 */
export function enumerateCombinations(domain, slots, target, cap) {
  const dom = domain.filter(v => v > 0).sort((a, b) => b - a); // non-zero, desc
  const maxVal = dom.length ? dom[0] : 0;
  const results = [];
  const limit = cap || 200;

  function pad(chosen) {
    const out = chosen.slice();
    while (out.length < slots) out.push(0);
    return out;
  }

  function recurse(startIdx, sum, chosen) {
    if (results.length >= limit) return;
    // Prune: even filling all remaining slots with the largest value can't reach target.
    const remaining = slots - chosen.length;
    if (sum + remaining * maxVal < target) return;
    for (let i = startIdx; i < dom.length; i++) {
      const v = dom[i];
      const newSum = sum + v;
      chosen.push(v);
      if (newSum >= target) {
        results.push(pad(chosen)); // minimal: previous partial sum was < target
      } else if (chosen.length < slots) {
        recurse(i, newSum, chosen);
      }
      chosen.pop();
      if (results.length >= limit) return;
    }
  }

  recurse(0, 0, []);
  return results;
}

/**
 * Feasibility check for a combination given availability per value.
 * availabilityByValue: { value: distinctCardCount }.
 * Returns { feasible, limitingValue, need, have }.
 */
export function checkFeasibility(combo, availabilityByValue) {
  const need = {};
  for (const v of combo) need[v] = (need[v] || 0) + 1;
  for (const v of Object.keys(need)) {
    const have = availabilityByValue[v] || 0;
    if (have < need[v]) {
      return { feasible: false, limitingValue: Number(v), need: need[v], have };
    }
  }
  return { feasible: true };
}
