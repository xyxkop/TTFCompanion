/**
 * TTF Companion - Card parallel generation & small render helpers (ES module).
 */
import { Parallel } from './parallels.js';
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
  const setName = card['Set'];
  const config = setConfigs[setName];
  if (!config) return false;
  if (config.parallelType === 'NO_DIGITAL') return false;
  if (config.parallelType === 'PARTIAL') {
    return config.partialParallelCards && config.partialParallelCards.has(card['Card #']);
  }
  return true;
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

function boostShotblocking(text, amount) {
  if (!text) return text;
  return text.replace(/Defence \+(\d+)/i, (_, n) => `Defence +${Number(n) + amount}`);
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

/** Append an ability block (title + optional text) to a container. */
export function appendAbility(container, title, text) {
  if (!title || title === 'N/A') return;
  const el = document.createElement('div');
  el.className = 'card-ability';
  el.innerHTML = `<strong>${escapeHtml(title)}</strong>${text && text !== 'N/A' ? '<br><span>' + escapeHtml(text) + '</span>' : ''}`;
  container.appendChild(el);
}
