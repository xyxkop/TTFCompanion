/**
 * TTF Companion - Card parallel generation & small render helpers (ES module).
 */
import { Parallel, digitalParallelsFor } from './parallels.js';
import { setConfigs } from './sets.js';
import { escapeHtml } from './util.js';

// ============================================================
// PARALLEL GENERATION
// ============================================================

export function generateParallels(cards) {
  const parallels = [];

  cards.forEach(card => {
    if (!shouldGenerateParallels(card)) return;
    const isGK = card['Position'] === 'Goalkeeper';
    parallels.push(makeParallel(card, Parallel.ALPHA, isGK ? { shotblocking: 1 } : { Defence: 2 }));
    parallels.push(makeParallel(card, Parallel.P77, isGK ? { shotblocking: 1 } : { Attack: 2 }));
    parallels.push(makeParallel(card, Parallel.P66, { Energy: -1 }));
    parallels.push(makeParallel(card, Parallel.P44, isGK ? { shotblocking: 2 } : { swap: true }));
    parallels.push(makeParallel(card, Parallel.P11, isGK ? { shotblocking: 2 } : { Skill: 2 }));
  });

  // Omega parallels (only for the specific card listed in set metadata)
  cards.forEach(card => {
    if (card['Parallel'] !== 'Base') return;
    if (!shouldGenerateParallels(card)) return;
    const config = setConfigs[card['Set']];
    if (!config || !config.omegaCard) return;
    if (!config.omegaCard.has(card['Card #'])) return;
    parallels.push(makeParallel(card, Parallel.OMEGA, { Attack: 2, Defence: 2, Skill: 2, Energy: -1 }));
  });

  return parallels;
}

export function shouldGenerateParallels(card) {
  const config = setConfigs[card['Set']];
  if (!config) return false;
  // Digital parallels exist when the card gets more than just the base
  // (respects NO_DIGITAL availability and partial-set exclusions).
  return digitalParallelsFor(config, card['Card #']).length > 1;
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

/** Increase the "Defence +N" value in a Shotblocking ability text by `amount`. */
export function boostShotblocking(text, amount) {
  if (!text) return text;
  return text.replace(/Defence \+(\d+)/i, (_, n) => `Defence +${Number(n) + amount}`);
}

/**
 * A goalkeeper's shotblocking value, parsed from its "Shotblocking" ability
 * text ("Defence +N"). Returns null for non-GK cards or when not present.
 */
export function getShotblocking(card) {
  if ((card['Position'] || '') !== 'Goalkeeper') return null;
  if ((card['Ability 1 Title'] || '') !== 'Shotblocking') return null;
  const m = String(card['Ability 1 Text'] || '').match(/\+(\d+)/);
  return m ? Number(m[1]) : null;
}

// ============================================================
// SMALL RENDER HELPERS
// ============================================================

/** Build a stat chip element (e.g. defence/skill/attack/energy). */
export function buildStat(type, text) {
  const el = document.createElement('span');
  el.className = `stat stat-${type}`;
  el.innerHTML = text;
  return el;
}

/**
 * Append an ability block (title + optional text) to a container.
 * When `opts.highlightBoost` is set, any "+N" in the text is wrapped in a
 * green boost span (used to show a boosted shotblocking value).
 */
export function appendAbility(container, title, text, opts = {}) {
  if (!title || title === 'N/A') return;
  const el = document.createElement('div');
  el.className = 'card-ability';
  let body = '';
  if (text && text !== 'N/A') {
    let safe = escapeHtml(text);
    if (opts.highlightBoost) {
      safe = safe.replace(/\+\d+/, m => `<span class="boost-changed">${m}</span>`);
    }
    body = '<br><span>' + safe + '</span>';
  }
  el.innerHTML = `<strong>${escapeHtml(title)}</strong>${body}`;
  container.appendChild(el);
}
