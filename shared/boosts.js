/**
 * TTF Companion - Boost catalog (ES module).
 *
 * A boost is a consumable modifier applied to one deck card. It can change
 * stats and/or add a skill type; it never grants an ability. Boosts apply only
 * to the card instance in the deck (card search / pool are unaffected).
 *
 * Each boost has:
 *   id           - internal id (same as the object key)
 *   code         - short STABLE token used in deck share codes (never reuse)
 *   name         - display label
 *   tier         - 'bronze' | 'silver' | 'gold'
 *   kind         - 'attack'|'defence'|'skill'|'flip'|'energy'|'shotblock'|'skilltype'
 *   delta        - stat deltas applied to the effective card (optional)
 *   addSkillType - a skill type added to the effective card (optional)
 *   eligibility  - 'outfield' | 'gk' | 'any' (which cards may take it)
 *
 * NOTE (first version): 'flip' and 'shotblock' boosts are stored and shown but
 * apply no numeric change yet (skill-flip has no display; shotblocking is not a
 * card stat column) — these get a numeric effect in a later iteration.
 */

const TIER = { BRONZE: 'bronze', SILVER: 'silver', GOLD: 'gold' };

export const BOOSTS = {
  // Attack (outfield only)
  'atk-b': { code: 'a1', name: 'Attack +1', badge: '+1', tier: TIER.BRONZE, kind: 'attack', delta: { Attack: 1 }, eligibility: 'outfield' },
  'atk-s': { code: 'a2', name: 'Attack +2', badge: '+2', tier: TIER.SILVER, kind: 'attack', delta: { Attack: 2 }, eligibility: 'outfield' },
  'atk-g': { code: 'a3', name: 'Attack +3', badge: '+3', tier: TIER.GOLD, kind: 'attack', delta: { Attack: 3 }, eligibility: 'outfield' },

  // Defence (outfield only)
  'def-b': { code: 'd1', name: 'Defence +1', badge: '+1', tier: TIER.BRONZE, kind: 'defence', delta: { Defence: 1 }, eligibility: 'outfield' },
  'def-s': { code: 'd2', name: 'Defence +2', badge: '+2', tier: TIER.SILVER, kind: 'defence', delta: { Defence: 2 }, eligibility: 'outfield' },
  'def-g': { code: 'd3', name: 'Defence +3', badge: '+3', tier: TIER.GOLD, kind: 'defence', delta: { Defence: 3 }, eligibility: 'outfield' },

  // Skill (outfield only)
  'skl-b': { code: 's1', name: 'Skill +1', badge: '+1', tier: TIER.BRONZE, kind: 'skill', delta: { Skill: 1 }, eligibility: 'outfield' },
  'skl-s': { code: 's2', name: 'Skill +2', badge: '+2', tier: TIER.SILVER, kind: 'skill', delta: { Skill: 2 }, eligibility: 'outfield' },
  'skl-g': { code: 's3', name: 'Skill +3', badge: '+3', tier: TIER.GOLD, kind: 'skill', delta: { Skill: 3 }, eligibility: 'outfield' },

  // Skill flip (no numeric effect yet)
  'flip-b': { code: 'f1', name: 'Skill Flip +1', badge: '+1', tier: TIER.BRONZE, kind: 'flip', eligibility: 'any' },
  'flip-s': { code: 'f2', name: 'Skill Flip +2', badge: '+2', tier: TIER.SILVER, kind: 'flip', eligibility: 'any' },
  'flip-g': { code: 'f3', name: 'Skill Flip +3', badge: '+3', tier: TIER.GOLD, kind: 'flip', eligibility: 'any' },

  // Energy discount (no bronze)
  'nrg-s': { code: 'e1', name: 'Energy -1', badge: '-1', tier: TIER.SILVER, kind: 'energy', delta: { Energy: -1 }, eligibility: 'any' },
  'nrg-g': { code: 'e2', name: 'Energy -2', badge: '-2', tier: TIER.GOLD, kind: 'energy', delta: { Energy: -2 }, eligibility: 'any' },

  // Shotblocker (GK only): adds to the GK's shotblocking value (in ability text)
  'sb-b': { code: 'b1', name: 'Shotblocker +1', badge: '+1', tier: TIER.BRONZE, kind: 'shotblock', shotblock: 1, eligibility: 'gk' },
  'sb-s': { code: 'b2', name: 'Shotblocker +2', badge: '+2', tier: TIER.SILVER, kind: 'shotblock', shotblock: 2, eligibility: 'gk' },
  'sb-g': { code: 'b3', name: 'Shotblocker +3', badge: '+3', tier: TIER.GOLD, kind: 'shotblock', shotblock: 3, eligibility: 'gk' },

  // Skill type (gold, any position): each adds one skill type (badge = the type).
  // A card can't take a skill-type boost for a type it already has (see isBoostEligible).
  'type-speed':      { code: 'ty', name: 'Add Speed', badge: 'Speed', tier: TIER.GOLD, kind: 'skilltype', addSkillType: 'Speed', eligibility: 'any' },
  'type-accuracy':   { code: 'tc', name: 'Add Accuracy', badge: 'Accuracy', tier: TIER.GOLD, kind: 'skilltype', addSkillType: 'Accuracy', eligibility: 'any' },
  'type-control':    { code: 'to', name: 'Add Control', badge: 'Control', tier: TIER.GOLD, kind: 'skilltype', addSkillType: 'Control', eligibility: 'any' },
  'type-strength':   { code: 'tr', name: 'Add Strength', badge: 'Strength', tier: TIER.GOLD, kind: 'skilltype', addSkillType: 'Strength', eligibility: 'any' },
  'type-leadership': { code: 'tl', name: 'Add Leadership', badge: 'Leadership', tier: TIER.GOLD, kind: 'skilltype', addSkillType: 'Leadership', eligibility: 'any' },
};

// Attach id to each entry for convenience.
Object.keys(BOOSTS).forEach(id => { BOOSTS[id].id = id; });

// Ordered list for the picker (grouped by kind, then tier).
export const BOOST_ORDER = Object.keys(BOOSTS);

// code <-> id maps for deck-code encoding.
export const CODE_TO_BOOST = {};
Object.keys(BOOSTS).forEach(id => { CODE_TO_BOOST[BOOSTS[id].code] = id; });
export function boostCode(id) { return BOOSTS[id] ? BOOSTS[id].code : null; }
export function boostById(id) { return BOOSTS[id] || null; }

/** Whether a boost is eligible for a card (position + skill-type rules). */
export function isBoostEligible(boost, card) {
  if (!boost) return false;

  // A skill-type boost can't add a type the card already has.
  if (boost.kind === 'skilltype') {
    const have = [card['Skill Type #1'], card['Skill Type #2']];
    if (have.includes(boost.addSkillType)) return false;
  }

  const isGK = (card['Position'] || '') === 'Goalkeeper';
  if (boost.eligibility === 'any') return true;
  if (boost.eligibility === 'gk') return isGK;
  if (boost.eligibility === 'outfield') return !isGK;
  return false;
}

/** List boosts (ids) eligible for a given card, in display order. */
export function eligibleBoosts(card) {
  return BOOST_ORDER.filter(id => isBoostEligible(BOOSTS[id], card));
}
