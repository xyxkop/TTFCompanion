/**
 * TTF Companion - Fusion Helper controller (ES module).
 * Loads cards + fusion definitions, wires the synergy filter and the
 * combination suggester, and renders results.
 */
import * as Parallels from '../shared/parallels.js';
import * as E from './fusion-engine.js';
import { POSITION_LABELS, SKILL_TYPE_ICONS } from '../shared/config.js';
import { escapeHtml } from '../shared/util.js';
import { loadSetsConfig, setConfigs, getSetColor, getSetBackground } from '../shared/sets.js';
import { loadCards, loadFusions } from '../shared/data.js';

const $ = (id) => document.getElementById(id);

  // ---- State ----
  let allBaseCards = [];      // base cards only (Parallel === 'Base')
  let fusions = [];           // parsed fusion weeks
  let activeFusion = null;
  let synergyResults = [];    // cardVariants(...) results for eligible cards, active fusion
  let includeParallels = false;
  let rowPredicate = null;    // active row filter predicate (null = any row)
  let activeTarget = null;

  // ---- DOM ----
  const weekSelect = $('fusion-week-select');
  const summaryEl = $('fusion-summary');
  const minSlider = $('synergy-min');
  const maxSlider = $('synergy-max');
  const rangeLabel = $('synergy-range-label');
  const rangeFill = $('synergy-range-fill');
  const parallelsCb = $('include-parallels-cb');
  const highlightCb = $('highlight-matches-cb');
  const rowSelect = $('row-filter-select');
  const cardListEl = $('fusion-card-list');
  const cardCountEl = $('fusion-card-count');
  const suggesterResults = $('suggester-results');

  // ---- Init ----
  weekSelect.addEventListener('change', () => selectFusion(weekSelect.value));
  parallelsCb.addEventListener('change', () => {
    includeParallels = parallelsCb.checked;
    recomputeSynergy();
    refreshSliderBounds();
    renderFilteredCards();
    if (activeTarget != null) runSuggester(activeTarget);
  });
  rowSelect.addEventListener('change', () => {
    const val = rowSelect.value;
    rowPredicate = val ? E.parseRequirement(val, activeFusion) : null;
    renderFilteredCards();
  });
  highlightCb.addEventListener('change', () => {
    cardListEl.classList.toggle('no-highlight', !highlightCb.checked);
  });
  minSlider.addEventListener('input', onSliderInput);
  maxSlider.addEventListener('input', onSliderInput);
  document.querySelectorAll('.synergy-quick-btn').forEach(btn => {
    btn.addEventListener('click', () => setSynergyRange(Number(btn.dataset.value)));
  });
  document.querySelectorAll('.target-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = Number(btn.dataset.target);
      document.querySelectorAll('.target-btn').forEach(b => b.classList.toggle('active', b === btn));
      activeTarget = target;
      runSuggester(target);
    });
  });

  loadAll();

  async function loadAll() {
    try {
      const [, cards, loadedFusions] = await Promise.all([
        loadSetsConfig(), loadCards(), loadFusions(),
      ]);
      allBaseCards = cards.filter(c => (c['Parallel'] || 'Base') === 'Base');
      fusions = loadedFusions;

      if (!fusions.length) {
        cardListEl.innerHTML = '<p class="placeholder">No fusion weeks found. Check the fusion sheet tab.</p>';
        return;
      }
      weekSelect.innerHTML = '';
      fusions.forEach((f, i) => {
        const player = f.attributes.player || '';
        const label = player ? `${f.week}: ${player}` : f.week;
        weekSelect.appendChild(new Option(label, String(i)));
      });
      // Default to the last (latest) week
      weekSelect.value = String(fusions.length - 1);
      selectFusion(weekSelect.value);
    } catch (err) {
      console.error('Failed to load fusion data:', err);
      cardListEl.innerHTML = `<p class="placeholder">Failed to load fusion data: ${escapeHtml(err.message)}</p>`;
    }
  }

  // ---- Fusion selection ----
  function selectFusion(indexStr) {
    activeFusion = fusions[Number(indexStr)];
    if (!activeFusion) return;
    renderSummary();
    populateRowFilter();
    rowPredicate = null;
    recomputeSynergy();
    refreshSliderBounds();
    renderFilteredCards();
    activeTarget = null;
    document.querySelectorAll('.target-btn').forEach(b => b.classList.remove('active'));
    suggesterResults.innerHTML = '<p class="placeholder-sm">Pick a target to see combinations.</p>';
  }

  /**
   * Which parallels a base card can have for the fusion (digital + printable),
   * per set config. Uses the shared set-aware helpers; #/99 is dropped since it
   * is equivalent to Base (contributes no synergy).
   */
  function availableParallels(card) {
    const config = setConfigs[card['Set']];
    const num = card['Card #'];
    const digital = Parallels.digitalParallelsFor(config, num); // includes 'Base'
    const physical = Parallels.physicalParallelsFor(config, num)
      .filter(p => p !== Parallels.Parallel.P99);
    return [...digital, ...physical];
  }

  function recomputeSynergy() {
    synergyResults = [];
    if (!activeFusion) return;
    for (const card of allBaseCards) {
      const parallels = includeParallels ? availableParallels(card) : ['Base'];
      const res = E.cardVariants(card, activeFusion, parallels);
      if (res) synergyResults.push(res);
    }
  }

  // ---- Slider ----
  function refreshSliderBounds() {
    let lo = 0, hi = 0;
    for (const res of synergyResults) {
      for (const v of res.variants) {
        if (v.value < lo) lo = v.value;
        if (v.value > hi) hi = v.value;
      }
    }
    if (!synergyResults.length) hi = 12;
    minSlider.min = String(lo); minSlider.max = String(hi);
    maxSlider.min = String(lo); maxSlider.max = String(hi);
    minSlider.value = String(lo);
    maxSlider.value = String(hi);
    updateRangeLabel();
  }

  function onSliderInput() {
    let lo = Number(minSlider.value), hi = Number(maxSlider.value);
    if (lo > hi) {
      // Clamp: push the other thumb so min never exceeds max
      if (this === minSlider) { hi = lo; maxSlider.value = String(hi); }
      else { lo = hi; minSlider.value = String(lo); }
    }
    updateRangeLabel();
    renderFilteredCards();
  }

  /** Quick-select an exact synergy value (sets min = max = value, clamped to bounds). */
  function setSynergyRange(value) {
    const lo = Number(minSlider.min), hi = Number(minSlider.max);
    const v = Math.max(lo, Math.min(value, hi));
    minSlider.value = String(v);
    maxSlider.value = String(v);
    updateRangeLabel();
    renderFilteredCards();
  }

  function updateRangeLabel() {
    const lo = Number(minSlider.value), hi = Number(maxSlider.value);
    rangeLabel.textContent = lo === hi ? `+${lo}` : `+${lo} to +${hi}`;
    // Position the blue fill between the two thumbs.
    const min = Number(minSlider.min), max = Number(minSlider.max);
    const span = (max - min) || 1;
    const loPct = ((lo - min) / span) * 100;
    const hiPct = ((hi - min) / span) * 100;
    rangeFill.style.left = loPct + '%';
    rangeFill.style.right = (100 - hiPct) + '%';
  }

  // ---- Rendering: summary ----
  function renderSummary() {
    const a = activeFusion.attributes;
    const setDisplay = a.set ? (a.license ? `${a.set} (${a.license})` : a.set) : '';
    const attrRows = [
      ['Player', a.player], ['Club', a.club], ['Position', a.position],
      ['Skill Type 1', a.skillType1], ['Skill Type 2', a.skillType2], ['Set', setDisplay],
    ].filter(([, v]) => v);
    let html = attrRows.map(([k, v]) =>
      `<div class="fs-attr"><span class="fs-key">${k}</span><span class="fs-val">${escapeHtml(v)}</span></div>`
    ).join('');
    if (activeFusion.rows.length) {
      html += '<div class="fs-rows">' + activeFusion.rows.map(r =>
        `<div class="fs-row"><span class="fs-row-count">${r.count}x</span><span>${escapeHtml(E.formatRequirement(r.requirement, activeFusion))}</span></div>`
      ).join('') + '</div>';
    }
    summaryEl.innerHTML = html;
  }

  function populateRowFilter() {
    rowSelect.innerHTML = '<option value="">Any row</option>';
    activeFusion.rows.forEach(r => {
      const label = `Row ${r.index}: ${E.formatRequirement(r.requirement, activeFusion)}`;
      rowSelect.appendChild(new Option(label, r.requirement || ''));
    });
  }

  // ---- Rendering: filtered cards ----
  function renderFilteredCards() {
    if (!activeFusion) return;
    const lo = Number(minSlider.value), hi = Number(maxSlider.value);
    cardListEl.innerHTML = '';
    let shown = 0;

    // One entry per in-range variant (so every parallel is shown, not just
    // each card's highest-value variant).
    const matches = [];
    for (const res of synergyResults) {
      if (rowPredicate && !rowPredicate(res.card)) continue;
      for (const variant of res.variants) {
        if (variant.value < lo || variant.value > hi) continue;
        matches.push({ res, variant });
      }
    }
    // Highest synergy first (Base, being lowest, sorts to the bottom).
    matches.sort((a, b) => b.variant.value - a.variant.value);
    for (const m of matches) {
      cardListEl.appendChild(buildFusionCard(m.res, m.variant));
      shown++;
    }

    cardCountEl.textContent = `${shown} result${shown === 1 ? '' : 's'} in range`;
    if (shown === 0) {
      cardListEl.innerHTML = '<p class="placeholder">No cards match the current filter.</p>';
    }
  }

  const ATTR_LABEL = {
    player: 'Player', club: 'Club', position: 'Position',
    skillType1: 'Skill 1', skillType2: 'Skill 2', set: 'Set',
  };

  function buildFusionCard(res, variant) {
    const c = res.card;
    const isPhysical = E.isPhysicalParallel(variant.parallel);
    // Physical parallels have no play styles: skill types are neither shown
    // nor counted as matched attributes for these variants.
    const matchedList = isPhysical
      ? res.matched.filter(m => m !== 'skillType1' && m !== 'skillType2')
      : res.matched;
    const matched = new Set(matchedList);
    const fa = activeFusion.attributes;
    const wrap = document.createElement('div');
    wrap.className = 'fusion-card-wrap';

    const card = document.createElement('div');
    card.className = 'fcard';

    // Set-colored background image (same treatment as the shared card).
    const setName = c['Set'] || '';
    const bg = setConfigs[setName] ? getSetBackground(setName) : null;
    if (bg) {
      card.style.backgroundImage = `linear-gradient(rgba(255,255,255,0.2), rgba(255,255,255,0.2)), url(${bg})`;
      card.style.backgroundSize = 'cover';
      card.style.backgroundPosition = 'center';
    }

    // Synergy badge (top-left)
    const synergy = document.createElement('div');
    synergy.className = 'fc-synergy';
    synergy.textContent = `+${variant.value}`;
    card.appendChild(synergy);

    // Parallel badge (top-right) when not Base
    if (variant.parallel !== 'Base') {
      const pbadge = document.createElement('div');
      pbadge.className = 'card-parallel-badge';
      pbadge.textContent = variant.parallel;
      card.appendChild(pbadge);
    }

    // Set header (reuse shared .card-set styling + set colors)
    const setEl = document.createElement('div');
    setEl.className = 'card-set';
    const setText = document.createElement('span');
    setText.className = 'fcard-set-text';
    setText.textContent = [c['License'] || '', setName].filter(Boolean).join(' | ');
    if (matched.has('set')) setText.classList.add('fc-hl-set');
    setEl.appendChild(setText);
    const setColor = getSetColor(setName);
    if (setColor) { setEl.style.background = setColor.bg; setEl.style.color = setColor.text; }
    card.appendChild(setEl);

    // Overlay: name, club, then a position + skill-types row (stacked vertically)
    const overlay = document.createElement('div');
    overlay.className = 'fcard-overlay';

    const name = `${c['First Name'] || ''} ${c['Second Name'] || ''}`.trim() || '(unnamed)';
    const nameEl = document.createElement('div');
    nameEl.className = 'fcard-name';
    nameEl.title = name;
    const nameText = document.createElement('span');
    nameText.textContent = name;
    if (matched.has('player')) nameText.classList.add('fc-hl');
    nameEl.appendChild(nameText);
    overlay.appendChild(nameEl);

    const clubEl = document.createElement('div');
    clubEl.className = 'fcard-club';
    const clubText = document.createElement('span');
    clubText.textContent = c['Club'] || '';
    if (matched.has('club')) clubText.classList.add('fc-hl');
    clubEl.appendChild(clubText);
    overlay.appendChild(clubEl);

    const bottomRow = document.createElement('div');
    bottomRow.className = 'fcard-row';
    const posEl = document.createElement('div');
    posEl.className = 'fcard-position';
    posEl.textContent = POSITION_LABELS[c['Position']] || c['Position'] || '';
    if (matched.has('position')) posEl.classList.add('fc-hl');
    bottomRow.appendChild(posEl);

    const fusionSkills = [E.normalize(fa.skillType1), E.normalize(fa.skillType2)].filter(Boolean);
    // Physical parallels have no skill types, so don't render them.
    (isPhysical ? [] : [c['Skill Type #1'], c['Skill Type #2']]).forEach(st => {
      if (st) {
        const iconWrap = document.createElement('div');
        iconWrap.className = 'fcard-skill';
        if (fusionSkills.includes(E.normalize(st))) iconWrap.classList.add('fc-hl');
        const icon = document.createElement('img');
        icon.className = 'skill-type-icon';
        icon.src = SKILL_TYPE_ICONS[st] || '';
        icon.alt = st;
        icon.title = st;
        iconWrap.appendChild(icon);
        bottomRow.appendChild(iconWrap);
      }
    });
    overlay.appendChild(bottomRow);

    card.appendChild(overlay);
    wrap.appendChild(card);

    return wrap;
  }

  // ---- Suggester ----
  function runSuggester(target) {
    if (!activeFusion) return;

    // Value domain: distinct attainable synergy values across eligible cards.
    const valueSet = new Set();
    for (const res of synergyResults) {
      for (const v of res.variants) valueSet.add(v.value);
    }
    const domain = Array.from(valueSet);

    const combos = E.enumerateCombinations(domain, 10, target, 200);

    // Availability per value: distinct eligible base cards that can produce it.
    const availByValue = {};
    for (const res of synergyResults) {
      const vals = new Set(res.variants.map(v => v.value));
      vals.forEach(v => { availByValue[v] = (availByValue[v] || 0) + 1; });
    }

    if (!combos.length) {
      suggesterResults.innerHTML = `<p class="placeholder-sm">No combination of available synergy values reaches ${target}.</p>`;
      return;
    }

    // Sort: feasible first, then by fewest cards used (fewest non-zero values).
    const annotated = combos.map(combo => {
      const feas = E.checkFeasibility(combo, availByValue);
      const nonZero = combo.filter(v => v > 0);
      const sum = nonZero.reduce((a, b) => a + b, 0);
      return { combo, nonZero, sum, feas };
    }).sort((a, b) => {
      if (a.feas.feasible !== b.feas.feasible) return a.feas.feasible ? -1 : 1;
      return a.nonZero.length - b.nonZero.length;
    });

    suggesterResults.innerHTML = annotated.map(a => {
      // Group all 10 values (including 0s) into "value x count" terms, high -> low.
      const groups = {};
      a.combo.forEach(v => { groups[v] = (groups[v] || 0) + 1; });
      const parts = Object.keys(groups).map(Number).sort((x, y) => y - x)
        .map(v => `<span class="combo-val">${v}</span> \u00D7 ${groups[v]}`)
        .join(' + ');
      return `<div class="combo">
        <span class="combo-values">${parts} <span class="combo-sum">= ${a.sum}</span></span>
      </div>`;
    }).join('');
  }
