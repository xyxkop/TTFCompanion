/**
 * TTF Companion
 * A lightweight companion tool for the Topps Total Football mobile game.
 * Card browser, deck builder, and more.
 */
(function () {
  'use strict';

  // ============================================================
  // FILTER DEFINITIONS
  // Declarative config for each filter control in the sidebar.
  // Options are populated dynamically from card data after load.
  // ============================================================

  const FILTERS = [
    { column: 'License', type: 'pills', group: 'Set', options: null },
    { column: 'SetLicense', type: 'multiselect', searchable: true, group: 'Set', label: 'Set', options: null },
    { column: 'First Name', type: 'text', label: 'Player Name', group: 'Player Info',
      multi: ['First Name', 'Second Name'] },
    { column: 'Club', type: 'multiselect', searchable: true, group: 'Player Info', options: null },
    { column: 'Position', type: 'pills', group: 'Player Info', options: null,
      labels: null },
    { column: 'Skill Type #1', type: 'tristate', label: 'Skill Type', group: 'Player Info',
      multi: ['Skill Type #1', 'Skill Type #2'], options: null },
    { column: 'Energy', type: 'compare', group: 'Stats', min: 0, max: 5 },
    { column: 'Defence', type: 'compare', group: 'Stats', min: 0, max: 10 },
    { column: 'Skill', type: 'compare', group: 'Stats', min: 0, max: 7 },
    { column: 'Attack', type: 'compare', group: 'Stats', min: 0, max: 10 },
    { column: 'Ability 1 Title', type: 'select', label: 'Ability', group: 'Abilities',
      multi: ['Ability 1 Title', 'Ability 2 Title'], options: null },
    { column: 'Ability 1 Text', type: 'text', label: 'Ability Text', group: 'Abilities',
      multi: ['Ability 1 Text', 'Ability 2 Text'] },
  ];

  // Parallel types (used in Parallels filter section): Base + digital parallels
  const PARALLELS_DEF = { column: 'Parallel',
    options: ['Base', ...Parallels.DIGITAL_ORDER] };

  // ============================================================
  // STATE
  // ============================================================

  let allCards = [];
  let filteredCards = [];
  let activeFilters = {};
  let sortField = 'Card #';
  let sortAsc = true;
  let clickThroughFilter = null; // { type: 'player'|'club'|'set', value: string }
  let savedScrollPosition = 0;
  let deck = []; // Array of card objects in the deck (max 20, exactly 1 GK)
  let deckCardNums = new Set(); // Card numbers currently in deck (for fast lookup)
  let loadedDeckId = null; // ID of currently loaded saved deck (for overwrite)
  let loadedDeckName = ''; // Name of currently loaded saved deck
  let savedDecksList = []; // Cached list of user's saved decks

  // Card Pool state
  // Each filter: { m: 'i'|'x', v: [...] } (include/exclude + values)
  // Skill types: { i: [...], x: [...] } (both can coexist)
  let cardPool = {
    sets: null,        // null = no restriction, { m: 'i'|'x', v: [...] }
    skillTypes: null,  // null = no restriction, { i: [...], x: [...] }
    clubs: null,       // null = no restriction, { m: 'i'|'x', v: [...] }
    abilities: null,   // null = no restriction, { m: 'i'|'x', v: [...] }
  };
  let poolActive = false; // Whether pool filtering is currently applied
  let poolDescription = ''; // Human-readable pool description (from quick load)
  let activeRules = []; // Deck validation rules currently in effect

  // Owned-cards filter (Advanced Options)
  let ownedOnly = false;             // Whether "show owned cards only" is enabled
  let ownedCollectionId = null;      // Selected digital collection id
  let userDigitalCollections = [];   // Loaded digital collections [{ id, name, cards, ... }]

  // ============================================================
  // DOM REFERENCES
  // ============================================================

  const $ = (id) => document.getElementById(id);

  const cardCountEl       = $('card-count');
  const ctBar             = $('click-through-bar');
  const ctBackBtn         = $('ct-back-btn');
  const ctLabel           = $('ct-label');
  const sortFieldBtn      = $('sort-field-btn');
  const sortDirBtn        = $('sort-dir-btn');
  const filtersContainer  = $('filters-container');
  const cardListEl        = $('card-list');
  const clearFiltersBtn   = $('clear-filters-btn');
  const deckPanel         = $('deck-panel');
  const deckCountEl       = $('deck-count');
  const deckListEl        = $('deck-list');
  const clearDeckBtn      = $('clear-deck-btn');
  const shareDeckBtn      = $('share-deck-btn');
  const importDeckBtn     = $('import-deck-btn');
  const saveDeckBtn       = $('save-deck-btn');
  const myDecksBtn        = $('my-decks-btn');
  const deckCollapseBtn   = $('deck-collapse-btn');
  const deckExpandStrip   = $('deck-expand-strip');
  const deckStatsPanel    = $('deck-stats-panel');
  const deckStatsToggle   = $('deck-stats-toggle');
  const deckStatsContent  = $('deck-stats-content');

  // ============================================================
  // INITIALIZATION
  // ============================================================

  let deckPanelVisible = true;

  // Event listeners
  deckCollapseBtn.addEventListener('click', collapseDeckPanel);
  deckExpandStrip.addEventListener('click', expandDeckPanel);
  ctBackBtn.addEventListener('click', exitClickThrough);
  sortFieldBtn.addEventListener('click', cycleSortField);
  sortDirBtn.addEventListener('click', toggleSortDir);
  clearFiltersBtn.addEventListener('click', clearAllFilters);
  clearDeckBtn.addEventListener('click', clearDeck);
  shareDeckBtn.addEventListener('click', shareDeck);
  importDeckBtn.addEventListener('click', showImportModal);
  saveDeckBtn.addEventListener('click', showSaveDeckModal);
  myDecksBtn.addEventListener('click', showMyDecksModal);
  deckStatsToggle.addEventListener('click', () => {
    deckStatsContent.classList.toggle('collapsed');
    deckStatsToggle.textContent = deckStatsContent.classList.contains('collapsed') ? '\u25B6' : '\u25BC';
  });
  document.querySelectorAll('.chart-selector').forEach(sel => {
    sel.addEventListener('change', renderDeckStats);
  });

  // Close open multiselect dropdowns on outside click
  document.addEventListener('click', (e) => {
    filtersContainer.querySelectorAll('.multiselect-wrapper.open').forEach(w => {
      if (!w.contains(e.target)) w.classList.remove('open');
    });
  });

  // Build UI and load data
  renderDeck();
  loadSheet();

  // ============================================================
  // DECK PANEL TOGGLE
  // ============================================================

  function collapseDeckPanel() {
    deckPanelVisible = false;
    deckPanel.classList.add('hidden');
    deckStatsPanel.classList.add('hidden');
    deckExpandStrip.classList.remove('hidden');
  }

  function expandDeckPanel() {
    deckPanelVisible = true;
    deckPanel.classList.remove('hidden');
    deckStatsPanel.classList.remove('hidden');
    deckExpandStrip.classList.add('hidden');
  }

  // ============================================================
  // DATA LOADING (uses shared.js functions)
  // ============================================================

  async function loadSheet() {
    cardListEl.innerHTML = '<p class="placeholder">Loading cards...</p>';
    try {
      // Fetch both in parallel
      const [_, loadedCards] = await Promise.all([loadSetsConfig(), loadCards()]);
      // Exclude collectible-but-not-playable sets from the deck builder
      const baseCards = loadedCards.filter(c => isSetPlayable(c['Set']));
      const parallels = generateParallels(baseCards);
      allCards = baseCards.concat(parallels);
      populateFilterOptions(baseCards);
      buildFilterUI();
      buildParallelsSection();
      buildAdvancedSection();
      initRuleUI();
      restoreSessionState();
      updateRuleBanner();
      applyFilters();
      loadDeckFromHash();
    } catch (err) {
      console.error('Failed to load sheet:', err);
      cardListEl.innerHTML = `<p class="placeholder">Failed to load card data: ${err.message}</p>`;
    }
  }

  /** Populate filter options from loaded card data */
  function populateFilterOptions(cards) {
    const POSITION_ORDER = ['Goalkeeper', 'Defender', 'Midfielder', 'Forward'];
    const POSITION_LABEL_MAP = { Goalkeeper: 'GK', Defender: 'DEF', Midfielder: 'MID', Forward: 'FWD' };

    FILTERS.forEach(def => {
      if (def.options !== null) return;
      if (def.type === 'text' || def.type === 'compare' || def.type === 'range') return;

      // Special handling for combined Set + License filter
      if (def.column === 'SetLicense') {
        const combos = new Set();
        cards.forEach(card => {
          const set = card['Set'] || '';
          const license = card['License'] || '';
          if (set) combos.add(`${set} (${license})`);
        });
        def.options = [...combos].sort();
        return;
      }

      // Collect unique values from the relevant column(s)
      const cols = def.multi || [def.column];
      const values = new Set();
      cards.forEach(card => {
        cols.forEach(col => {
          const v = card[col];
          if (v && v !== 'N/A') values.add(v);
        });
      });

      def.options = [...values].sort();

      // Special handling for Position (preserve game order + labels)
      if (def.column === 'Position') {
        def.options = POSITION_ORDER.filter(p => values.has(p));
        def.labels = def.options.map(p => POSITION_LABEL_MAP[p] || p);
      }
    });
  }

  // ============================================================
  // FILTER UI BUILDER
  // Constructs the sidebar filter controls from FILTERS config.
  // ============================================================

  function buildFilterUI() {
    filtersContainer.innerHTML = '';

    // Group filters by section
    const groups = {};
    const groupOrder = [];
    FILTERS.forEach(def => {
      const g = def.group || 'Other';
      if (!groups[g]) { groups[g] = []; groupOrder.push(g); }
      groups[g].push(def);
    });

    groupOrder.forEach(groupName => {
      const section = document.createElement('div');
      section.className = 'filter-section';

      // Collapsible header
      const header = document.createElement('div');
      header.className = 'filter-section-header';
      header.innerHTML = `<span class="filter-section-arrow">&#9662;</span> <span class="filter-section-title">${groupName}</span><span class="filter-section-badge"></span><button class="filter-section-reset" title="Clear group filters">&times;</button>`;
      header.querySelector('.filter-section-title').addEventListener('click', () => section.classList.toggle('collapsed'));
      header.querySelector('.filter-section-arrow').addEventListener('click', () => section.classList.toggle('collapsed'));
      header.querySelector('.filter-section-reset').addEventListener('click', (e) => {
        e.stopPropagation();
        clearGroupFilters(groupName, section);
      });
      section.appendChild(header);

      // Content
      const content = document.createElement('div');
      content.className = 'filter-section-content';

      groups[groupName].forEach(def => {
        content.appendChild(buildFilterControl(def));
      });

      section.appendChild(content);
      if (groupName === 'Abilities' || groupName === 'Stats') section.classList.add('collapsed');
      filtersContainer.appendChild(section);
    });
  }

  /** Build a single filter control element based on its definition */
  function buildFilterControl(def) {
    const group = document.createElement('div');
    group.className = 'filter-group';

    // Skip label for parallels-toggle (the checkbox has its own label)
    if (def.type !== 'parallels-toggle') {
      const label = document.createElement('label');
      label.textContent = def.label || def.column;
      group.appendChild(label);
    }

    switch (def.type) {
      case 'select':     group.appendChild(buildSelect(def)); break;
      case 'multiselect': group.appendChild(buildMultiselect(def)); break;
      case 'tristate':   group.appendChild(buildTristate(def)); break;
      case 'pills':      group.appendChild(buildPills(def)); break;
      case 'text':       group.appendChild(buildTextInput(def)); break;
      case 'range':      group.appendChild(buildRangeInput(def)); break;
      case 'compare':    group.appendChild(buildCompareInput(def)); break;
    }

    return group;
  }

  function buildSelect(def) {
    const select = document.createElement('select');
    select.dataset.column = def.column;
    select.dataset.filterType = 'select';
    select.addEventListener('change', onFilterChange);

    select.appendChild(new Option('All', ''));
    def.options.forEach(val => select.appendChild(new Option(val, val)));
    return select;
  }

  function buildMultiselect(def) {
    const wrapper = document.createElement('div');
    wrapper.className = 'multiselect-wrapper';
    wrapper.dataset.column = def.column;

    const toggle = document.createElement('button');
    toggle.className = 'multiselect-toggle';
    toggle.textContent = 'All';
    toggle.type = 'button';
    toggle.addEventListener('click', () => {
      wrapper.classList.toggle('open');
      if (wrapper.classList.contains('open') && def.searchable) {
        wrapper.querySelector('.multiselect-search').focus();
      }
    });
    wrapper.appendChild(toggle);

    const dropdown = document.createElement('div');
    dropdown.className = 'multiselect-dropdown';

    if (def.searchable) {
      const search = document.createElement('input');
      search.type = 'text';
      search.className = 'multiselect-search';
      search.placeholder = 'Type to filter...';
      search.addEventListener('input', () => {
        const q = normalize(search.value);
        dropdown.querySelectorAll('.multiselect-option').forEach(opt => {
          opt.style.display = normalize(opt.textContent).includes(q) ? '' : 'none';
        });
      });
      search.addEventListener('click', e => e.stopPropagation());
      dropdown.appendChild(search);
    }

    // Select All / Clear buttons
    const actionsBar = document.createElement('div');
    actionsBar.className = 'multiselect-actions';
    const selectAllBtn = document.createElement('button');
    selectAllBtn.type = 'button';
    selectAllBtn.textContent = 'Select All';
    selectAllBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.querySelectorAll('.multiselect-option input[type="checkbox"]').forEach(cb => {
        if (cb.closest('.multiselect-option').style.display !== 'none') cb.checked = true;
      });
      onMultiselectChange(def.column, wrapper);
    });
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.textContent = 'Clear';
    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.querySelectorAll('.multiselect-option input[type="checkbox"]').forEach(cb => cb.checked = false);
      onMultiselectChange(def.column, wrapper);
    });
    actionsBar.appendChild(selectAllBtn);
    actionsBar.appendChild(clearBtn);
    dropdown.appendChild(actionsBar);

    def.options.forEach(val => {
      const labelEl = document.createElement('label');
      labelEl.className = 'multiselect-option';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = val;
      cb.dataset.column = def.column;
      cb.addEventListener('change', () => onMultiselectChange(def.column, wrapper));
      labelEl.appendChild(cb);
      const span = document.createElement('span');
      span.textContent = val;
      labelEl.appendChild(span);
      dropdown.appendChild(labelEl);
    });

    wrapper.appendChild(dropdown);
    return wrapper;
  }

  function buildTristate(def) {
    const div = document.createElement('div');
    div.className = 'tristate-wrapper';
    div.dataset.column = def.column;

    def.options.forEach(val => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'tristate-item';
      item.dataset.value = val;
      item.dataset.state = 'none';
      item.textContent = val;
      item.addEventListener('click', () => {
        const s = item.dataset.state;
        item.dataset.state = s === 'none' ? 'include' : s === 'include' ? 'exclude' : 'none';
        onTristateChange(def.column, div);
      });
      div.appendChild(item);
    });
    return div;
  }

  function buildPills(def) {
    const div = document.createElement('div');
    div.className = 'tristate-wrapper';
    div.dataset.column = def.column;

    def.options.forEach((val, idx) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'tristate-item';
      item.dataset.value = val;
      item.dataset.state = 'none';
      item.textContent = (def.labels && def.labels[idx]) || val;
      item.addEventListener('click', () => {
        item.dataset.state = item.dataset.state === 'none' ? 'include' : 'none';
        onPillsChange(def.column, div);
      });
      div.appendChild(item);
    });
    return div;
  }

  function buildTextInput(def) {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = `Search ${def.label || def.column}...`;
    input.dataset.column = def.column;
    input.dataset.filterType = 'text';
    input.addEventListener('input', onFilterChange);
    return input;
  }

  function buildRangeInput(def) {
    const div = document.createElement('div');
    div.className = 'range-inputs';

    const minInput = document.createElement('input');
    minInput.type = 'number';
    minInput.placeholder = 'Min';
    if (def.min != null) minInput.min = def.min;
    if (def.max != null) minInput.max = def.max;
    minInput.dataset.column = def.column;
    minInput.dataset.filterType = 'range-min';
    minInput.addEventListener('input', onFilterChange);

    const sep = document.createElement('span');
    sep.textContent = '\u2013';

    const maxInput = document.createElement('input');
    maxInput.type = 'number';
    maxInput.placeholder = 'Max';
    if (def.min != null) maxInput.min = def.min;
    if (def.max != null) maxInput.max = def.max;
    maxInput.dataset.column = def.column;
    maxInput.dataset.filterType = 'range-max';
    maxInput.addEventListener('input', onFilterChange);

    div.appendChild(minInput);
    div.appendChild(sep);
    div.appendChild(maxInput);
    return div;
  }

  function buildCompareInput(def) {
    const div = document.createElement('div');
    div.className = 'compare-inputs';

    const opSelect = document.createElement('select');
    opSelect.dataset.column = def.column;
    opSelect.dataset.filterType = 'compare-op';
    ['', '=', '>=', '<='].forEach(op => opSelect.appendChild(new Option(op || 'Any', op)));
    opSelect.addEventListener('change', onCompareChange);

    const numInput = document.createElement('input');
    numInput.type = 'number';
    numInput.placeholder = '#';
    if (def.min != null) numInput.min = def.min;
    if (def.max != null) numInput.max = def.max;
    numInput.dataset.column = def.column;
    numInput.dataset.filterType = 'compare-val';
    numInput.addEventListener('input', onCompareChange);

    div.appendChild(opSelect);
    div.appendChild(numInput);
    return div;
  }

  function buildParallelsSection() {
    const section = document.createElement('div');
    section.className = 'filter-section collapsed';

    const header = document.createElement('div');
    header.className = 'filter-section-header';
    header.innerHTML = `<span class="filter-section-arrow">&#9662;</span> <span class="filter-section-title">Parallels</span><span class="filter-section-badge"></span><button class="filter-section-reset" title="Clear group filters">&times;</button>`;
    header.querySelector('.filter-section-title').addEventListener('click', () => section.classList.toggle('collapsed'));
    header.querySelector('.filter-section-arrow').addEventListener('click', () => section.classList.toggle('collapsed'));
    section.appendChild(header);

    const content = document.createElement('div');
    content.className = 'filter-section-content';

    const pillsDiv = document.createElement('div');
    pillsDiv.className = 'tristate-wrapper';
    pillsDiv.dataset.column = 'Parallel';

    PARALLELS_DEF.options.forEach(val => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'tristate-item';
      item.dataset.value = val;
      item.dataset.state = 'include';
      item.textContent = val;
      item.addEventListener('click', () => {
        item.dataset.state = item.dataset.state === 'include' ? 'none' : 'include';
        onParallelsChange(pillsDiv);
      });
      pillsDiv.appendChild(item);
    });

    // Reset button: re-select all parallels
    header.querySelector('.filter-section-reset').addEventListener('click', (e) => {
      e.stopPropagation();
      pillsDiv.querySelectorAll('.tristate-item').forEach(i => { i.dataset.state = 'include'; });
      onParallelsChange(pillsDiv);
    });

    content.appendChild(pillsDiv);
    section.appendChild(content);
    filtersContainer.appendChild(section);

    // Set initial filter state (all selected)
    activeFilters['Parallel'] = { type: 'multiselect', values: [...PARALLELS_DEF.options] };
  }

  /**
   * Advanced Options filter section.
   * Contains "Show owned cards only" toggle + digital collection picker.
   */
  function buildAdvancedSection() {
    const section = document.createElement('div');
    section.className = 'filter-section collapsed';

    const header = document.createElement('div');
    header.className = 'filter-section-header';
    header.innerHTML = `<span class="filter-section-arrow">&#9662;</span> <span class="filter-section-title">Advanced Options</span><span class="filter-section-badge"></span>`;
    header.querySelector('.filter-section-title').addEventListener('click', () => section.classList.toggle('collapsed'));
    header.querySelector('.filter-section-arrow').addEventListener('click', () => section.classList.toggle('collapsed'));
    section.appendChild(header);

    const content = document.createElement('div');
    content.className = 'filter-section-content';

    // "Show owned cards only" checkbox
    const optionRow = document.createElement('label');
    optionRow.className = 'advanced-option-row';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'owned-only-checkbox';
    const optionText = document.createElement('span');
    optionText.textContent = 'Show owned cards only';
    optionRow.appendChild(checkbox);
    optionRow.appendChild(optionText);
    content.appendChild(optionRow);

    // Collection picker (hidden until checkbox is on)
    const picker = document.createElement('div');
    picker.className = 'owned-collection-picker';
    picker.id = 'owned-collection-picker';
    picker.style.display = 'none';
    const pickerLabel = document.createElement('label');
    pickerLabel.textContent = 'Show owned cards from collection:';
    const select = document.createElement('select');
    select.id = 'owned-collection-select';
    picker.appendChild(pickerLabel);
    picker.appendChild(select);
    content.appendChild(picker);

    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        if (userDigitalCollections.length === 0) {
          // No digital collections available — warn and revert
          checkbox.checked = false;
          showNoDigitalCollectionsWarning();
          return;
        }
        ownedOnly = true;
        // Default to first collection if none selected
        if (!ownedCollectionId || !userDigitalCollections.some(c => c.id === ownedCollectionId)) {
          ownedCollectionId = userDigitalCollections[0].id;
        }
      } else {
        ownedOnly = false;
      }
      updateOwnedUI();
      applyFilters();
    });

    select.addEventListener('change', () => {
      ownedCollectionId = select.value || null;
      applyFilters();
    });

    section.appendChild(content);
    filtersContainer.appendChild(section);

    populateOwnedCollectionDropdown();
    updateOwnedUI();
  }

  /** Fill the digital-collection dropdown from userDigitalCollections. */
  function populateOwnedCollectionDropdown() {
    const select = document.getElementById('owned-collection-select');
    if (!select) return;
    select.innerHTML = '';
    userDigitalCollections.forEach(col => {
      select.appendChild(new Option(col.name, col.id));
    });
    // Preserve the selected collection if still present
    if (ownedCollectionId && userDigitalCollections.some(c => c.id === ownedCollectionId)) {
      select.value = ownedCollectionId;
    } else if (userDigitalCollections.length > 0) {
      ownedCollectionId = select.value || userDigitalCollections[0].id;
      select.value = ownedCollectionId;
    }
  }

  /** Sync the Advanced Options UI (checkbox + picker visibility) with state. */
  function updateOwnedUI() {
    const checkbox = document.getElementById('owned-only-checkbox');
    const picker = document.getElementById('owned-collection-picker');
    if (!checkbox || !picker) return;
    // If enabled but no collections available (e.g. after sign-out), disable
    if (ownedOnly && userDigitalCollections.length === 0) {
      ownedOnly = false;
    }
    checkbox.checked = ownedOnly;
    picker.style.display = ownedOnly ? '' : 'none';
  }

  /**
   * Warn the user they have no digital collections to filter by.
   * Offers Cancel and Go to Collection Tracker (disabled if signed out).
   */
  function showNoDigitalCollectionsWarning() {
    const existing = document.querySelector('.share-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'share-modal-overlay';
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    const signedIn = !!currentUser;
    const modal = document.createElement('div');
    modal.className = 'share-modal';
    modal.innerHTML = `
      <h3>No Digital Collections</h3>
      <p class="warning-modal-text">You don't have any digital collections yet. Create one in the Collection Tracker to filter by owned cards${signedIn ? '' : ' (requires sign-in)'}.</p>
      <div class="warning-modal-actions">
        <button class="share-close-btn warning-cancel-btn">Cancel</button>
        <button class="share-copy-btn warning-goto-btn"${signedIn ? '' : ' disabled'}>Go to Collection Tracker</button>
      </div>
    `;

    modal.querySelector('.warning-cancel-btn').addEventListener('click', () => overlay.remove());
    const gotoBtn = modal.querySelector('.warning-goto-btn');
    if (signedIn) {
      gotoBtn.addEventListener('click', () => { window.location.href = '../collection/'; });
    }

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }

  function onParallelsChange(pillsDiv) {
    const selected = [];
    pillsDiv.querySelectorAll('.tristate-item').forEach(item => {
      if (item.dataset.state === 'include') selected.push(item.dataset.value);
    });

    if (selected.length === 0) {
      delete activeFilters['Parallel'];
    } else {
      activeFilters['Parallel'] = { type: 'multiselect', values: selected };
    }
    applyFilters();
  }

  // ============================================================
  // FILTER EVENT HANDLERS
  // ============================================================

  function onFilterChange(e) {
    const col = e.target.dataset.column;
    const type = e.target.dataset.filterType;
    const val = e.target.value.trim();

    if (type === 'select') {
      val ? (activeFilters[col] = { type: 'exact', value: val }) : delete activeFilters[col];
    } else if (type === 'text') {
      val ? (activeFilters[col] = { type: 'text', value: normalize(val) }) : delete activeFilters[col];
    } else if (type === 'range-min' || type === 'range-max') {
      if (!activeFilters[col] || activeFilters[col].type !== 'range') {
        activeFilters[col] = { type: 'range', min: null, max: null };
      }
      activeFilters[col][type === 'range-min' ? 'min' : 'max'] = val !== '' ? Number(val) : null;
      if (activeFilters[col].min == null && activeFilters[col].max == null) delete activeFilters[col];
    }
    applyFilters();
  }

  function onCompareChange(e) {
    const col = e.target.dataset.column;
    const wrapper = e.target.parentElement;
    const op = wrapper.querySelector('[data-filter-type="compare-op"]').value;
    const val = wrapper.querySelector('[data-filter-type="compare-val"]').value.trim();

    if (op && val !== '') {
      activeFilters[col] = { type: 'compare', op, value: Number(val) };
    } else {
      delete activeFilters[col];
    }
    applyFilters();
  }

  function onTristateChange(col, wrapper) {
    const include = [], exclude = [];
    wrapper.querySelectorAll('.tristate-item').forEach(item => {
      if (item.dataset.state === 'include') include.push(item.dataset.value);
      else if (item.dataset.state === 'exclude') exclude.push(item.dataset.value);
    });

    if (include.length === 0 && exclude.length === 0) delete activeFilters[col];
    else activeFilters[col] = { type: 'tristate', include, exclude };
    applyFilters();
  }

  function onPillsChange(col, wrapper) {
    const selected = [];
    wrapper.querySelectorAll('.tristate-item').forEach(item => {
      if (item.dataset.state === 'include') selected.push(item.dataset.value);
    });

    selected.length === 0 ? delete activeFilters[col] : (activeFilters[col] = { type: 'multiselect', values: selected });
    applyFilters();
  }

  function onMultiselectChange(col, wrapper) {
    const selected = [];
    wrapper.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      if (cb.checked) selected.push(cb.value);
    });

    const toggle = wrapper.querySelector('.multiselect-toggle');
    if (selected.length === 0) {
      toggle.textContent = 'All';
      delete activeFilters[col];
    } else {
      toggle.textContent = selected.length <= 2 ? selected.join(', ') : `${selected.length} selected`;
      activeFilters[col] = { type: 'multiselect', values: selected };
    }
    applyFilters();
  }

  // ============================================================
  // FILTER ENGINE
  // Core filtering logic: applies pool + sidebar filters + click-through.
  // ============================================================

  function applyFilters() {
    if (clickThroughFilter) {
      // Click-through mode: bypass sidebar filters, only respect parallel filter + pool
      filteredCards = allCards.filter(card => {
        if (poolActive && !matchesPool(card)) return false;
        if (!matchesOwned(card)) return false;
        if (activeFilters['Parallel']) {
          if (!activeFilters['Parallel'].values.includes(card['Parallel'])) return false;
        }
        return matchesClickThrough(card);
      });
    } else {
      // Normal mode: apply pool + all sidebar filters
      filteredCards = allCards.filter(card => {
        if (poolActive && !matchesPool(card)) return false;
        if (!matchesOwned(card)) return false;

        for (const col of Object.keys(activeFilters)) {
          const filter = activeFilters[col];
          if (!filter) continue;

          const def = FILTERS.find(f => f.column === col);

          // Special handling for SetLicense virtual column
          if (col === 'SetLicense') {
            const cardSetLicense = `${card['Set'] || ''} (${card['License'] || ''})`;
            if (!filter.values.includes(cardSetLicense)) return false;
            continue;
          }

          const cols = (def && def.multi) ? def.multi : [col];

          if (!matchesFilter(card, filter, cols, def)) return false;
        }
        return true;
      });
    }

    sortCards();
    renderCards();
    updateFilterBadges();
    updateClickThroughBar();
    saveSessionState();
  }

  function updateClickThroughBar() {
    if (clickThroughFilter) {
      ctBar.classList.remove('hidden');
      const ct = clickThroughFilter;
      if (ct.type === 'player') {
        ctLabel.textContent = `Showing results for player: ${ct.value}`;
      } else if (ct.type === 'club') {
        ctLabel.textContent = `Showing results for club: ${ct.value}`;
      } else if (ct.type === 'set') {
        ctLabel.textContent = `Showing results for set: ${[ct.value.license, ct.value.set].filter(Boolean).join(' ')}`;
      }
    } else {
      ctBar.classList.add('hidden');
      ctLabel.textContent = '';
    }
  }

  /** Match a card against the active click-through filter */
  function matchesClickThrough(card) {
    const ct = clickThroughFilter;
    if (ct.type === 'player') {
      const name = `${card['First Name'] || ''} ${card['Second Name'] || ''}`.trim();
      return name === ct.value;
    } else if (ct.type === 'club') {
      return (card['Club'] || '') === ct.value;
    } else if (ct.type === 'set') {
      return (card['License'] || '') === ct.value.license && (card['Set'] || '') === ct.value.set;
    }
    return true;
  }

  /** Activate click-through mode */
  function activateClickThrough(type, value) {
    // Save scroll position before navigating
    savedScrollPosition = cardListEl.scrollTop;
    clickThroughFilter = { type, value };
    applyFilters();
    // Scroll to top for the new view
    cardListEl.scrollTop = 0;
  }

  /** Exit click-through mode, return to normal filtered view */
  function exitClickThrough() {
    clickThroughFilter = null;
    applyFilters();
    // Restore previous scroll position
    cardListEl.scrollTop = savedScrollPosition;
  }

  /** Check if a card matches a single filter */
  function matchesFilter(card, filter, cols, def) {
    switch (filter.type) {
      case 'exact':
        return cols.some(c => (card[c] || '') === filter.value);

      case 'multiselect':
        if (def && def.filterMode === 'exclude') {
          return !cols.some(c => filter.values.includes(card[c] || ''));
        }
        return cols.some(c => filter.values.includes(card[c] || ''));

      case 'tristate':
        if (filter.include.length > 0 && !cols.some(c => filter.include.includes(card[c] || ''))) return false;
        if (filter.exclude.length > 0 && cols.some(c => filter.exclude.includes(card[c] || ''))) return false;
        return true;

      case 'compare': {
        const num = Number(card[cols[0]] || '');
        if (isNaN(num)) return false;
        if (filter.op === '=' && num !== filter.value) return false;
        if (filter.op === '>=' && num < filter.value) return false;
        if (filter.op === '<=' && num > filter.value) return false;
        return true;
      }

      case 'text': {
        if (def && def.multi && filter.value.includes(' ')) {
          const words = filter.value.split(/\s+/).filter(w => w);
          return words.every(word => cols.some(c => normalize(card[c] || '').includes(word)));
        }
        return cols.some(c => normalize(card[c] || '').includes(filter.value));
      }

      case 'range': {
        const num = Number(card[cols[0]] || '');
        if (isNaN(num)) return false;
        if (filter.min != null && num < filter.min) return false;
        if (filter.max != null && num > filter.max) return false;
        return true;
      }

      default:
        return true;
    }
  }

  // ============================================================
  // SORTING
  // ============================================================

  const SORT_OPTIONS = [
    { field: 'Card #', label: '#' },
    { field: 'Name', label: 'A-Z' },
    { field: 'Energy', label: '\u26A1' },
    { field: 'Defence', label: 'DEF' },
    { field: 'Skill', label: 'SKL' },
    { field: 'Attack', label: 'ATK' },
  ];
  let sortIndex = 0; // Default: Card #

  function cycleSortField() {
    sortIndex = (sortIndex + 1) % SORT_OPTIONS.length;
    sortField = SORT_OPTIONS[sortIndex].field;
    sortFieldBtn.textContent = SORT_OPTIONS[sortIndex].label;
    applyFilters();
  }

  function toggleSortDir() {
    sortAsc = !sortAsc;
    sortDirBtn.textContent = sortAsc ? '\u2191' : '\u2193';
    sortDirBtn.title = sortAsc ? 'Ascending' : 'Descending';
    applyFilters();
  }

  function sortCards() {
    if (!sortField) return;

    filteredCards.sort((a, b) => {
      let valA, valB;

      if (sortField === 'Name') {
        valA = `${a['First Name'] || ''} ${a['Second Name'] || ''}`.trim().toLowerCase();
        valB = `${b['First Name'] || ''} ${b['Second Name'] || ''}`.trim().toLowerCase();
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }

      if (sortField === 'Card #') {
        valA = parseInt(a['Card #']) || 0;
        valB = parseInt(b['Card #']) || 0;
      } else {
        valA = Number(a[sortField] || 0);
        valB = Number(b[sortField] || 0);
      }

      return sortAsc ? valA - valB : valB - valA;
    });
  }

  // ============================================================
  // FILTER UTILITIES
  // ============================================================

  function clearAllFilters() {
    activeFilters = {};
    filtersContainer.querySelectorAll('select').forEach(el => el.value = '');
    filtersContainer.querySelectorAll('input').forEach(el => {
      if (el.type === 'checkbox') el.checked = false;
      else el.value = '';
    });
    filtersContainer.querySelectorAll('.multiselect-toggle').forEach(el => el.textContent = 'All');
    filtersContainer.querySelectorAll('.multiselect-wrapper').forEach(el => el.classList.remove('open'));
    filtersContainer.querySelectorAll('.tristate-item').forEach(el => el.dataset.state = 'none');
    applyFilters();
  }

  function clearGroupFilters(groupName, section) {
    // Remove active filters for all columns in this group
    FILTERS.forEach(def => {
      if ((def.group || 'Other') === groupName) {
        delete activeFilters[def.column];
      }
    });

    // Reset UI elements within this section
    section.querySelectorAll('select').forEach(el => el.value = '');
    section.querySelectorAll('input').forEach(el => {
      if (el.type === 'checkbox') el.checked = false;
      else el.value = '';
    });
    section.querySelectorAll('.multiselect-toggle').forEach(el => el.textContent = 'All');
    section.querySelectorAll('.multiselect-wrapper').forEach(el => el.classList.remove('open'));
    section.querySelectorAll('.tristate-item').forEach(el => el.dataset.state = 'none');

    applyFilters();
  }

  function updateFilterBadges() {
    const groupCounts = {};
    FILTERS.forEach(def => {
      const g = def.group || 'Other';
      if (activeFilters[def.column]) groupCounts[g] = (groupCounts[g] || 0) + 1;
    });

    filtersContainer.querySelectorAll('.filter-section').forEach(section => {
      const title = section.querySelector('.filter-section-title').textContent;
      const badge = section.querySelector('.filter-section-badge');
      const count = groupCounts[title] || 0;
      badge.textContent = count > 0 ? `(${count} set)` : '';
    });
  }

  // ============================================================
  // CARD RENDERING
  // Renders the filtered card list and individual card elements.
  // ============================================================

  function renderCards() {
    cardCountEl.textContent = `${filteredCards.length} / ${allCards.length} cards`;

    if (filteredCards.length === 0) {
      cardListEl.innerHTML = '<p class="placeholder">No cards match the current filters.</p>';
      return;
    }

    cardListEl.innerHTML = '';
    filteredCards.forEach(card => cardListEl.appendChild(buildCardElement(card)));
  }

  function buildCardElement(card, skipDeckCheck) {
    const div = document.createElement('div');
    div.className = 'card';

    // Set background image if available
    const cardSetName = card['Set'] || '';
    const bgImage = setConfigs[cardSetName] ? getSetBackground(cardSetName) : null;
    if (bgImage) {
      div.style.backgroundImage = `linear-gradient(rgba(255,255,255,0.2), rgba(255,255,255,0.2)), url(${bgImage})`;
      div.style.backgroundSize = 'cover';
      div.style.backgroundPosition = 'center';
    }

    const unavailable = !skipDeckCheck && isCardUnavailable(card);
    if (unavailable) {
      div.classList.add('card-unavailable');
    }

    div.addEventListener('click', (e) => {
      if (e.target.closest('.clickable')) return;
      if (!unavailable) addToDeck(card);
    });

    // Parallel badge (top-right)
    const parallel = card['Parallel'] || 'Base';
    if (parallel !== 'Base') {
      const badge = document.createElement('div');
      badge.className = 'card-parallel-badge';
      badge.textContent = parallel;
      div.appendChild(badge);
    }

    // Set + License header (colored, text clickable)
    const setEl = document.createElement('div');
    setEl.className = 'card-set';
    const setName = card['Set'] || '';
    const license = card['License'] || '';
    const setColor = getSetColor(setName);
    if (setColor) { setEl.style.background = setColor.bg; setEl.style.color = setColor.text; }

    const setTextSpan = document.createElement('span');
    setTextSpan.className = 'clickable';
    setTextSpan.textContent = [license, setName].filter(Boolean).join(' | ');
    setTextSpan.addEventListener('click', () => activateClickThrough('set', { license, set: setName }));
    setEl.appendChild(setTextSpan);
    div.appendChild(setEl);

    // Player info section (name + club with translucent layer)
    const playerInfo = document.createElement('div');
    playerInfo.className = 'card-player-info';

    const nameEl = document.createElement('div');
    nameEl.className = 'card-name';
    const fullName = `${card['First Name'] || ''} ${card['Second Name'] || ''}`.trim() || '(unnamed)';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'clickable';
    nameSpan.textContent = fullName;
    nameSpan.addEventListener('click', () => activateClickThrough('player', fullName));
    nameEl.appendChild(nameSpan);
    playerInfo.appendChild(nameEl);

    // Club (text clickable)
    if (card['Club']) {
      const clubEl = document.createElement('div');
      clubEl.className = 'card-club';
      const clubSpan = document.createElement('span');
      clubSpan.className = 'clickable';
      clubSpan.textContent = card['Club'];
      clubSpan.addEventListener('click', () => activateClickThrough('club', card['Club']));
      clubEl.appendChild(clubSpan);
      playerInfo.appendChild(clubEl);
    }

    div.appendChild(playerInfo);

    // Bottom section: 3-column layout (stats | info | abilities)
    const bottomEl = document.createElement('div');
    bottomEl.className = 'card-bottom';

    // Left column: Defence, Skill, Attack (stacked vertically)
    const statsCol = document.createElement('div');
    statsCol.className = 'card-stats-col';
    statsCol.appendChild(buildStat('defence', card['Defence'] || '0'));
    statsCol.appendChild(buildStat('skill', card['Skill'] || '0'));
    statsCol.appendChild(buildStat('attack', card['Attack'] || '0'));
    bottomEl.appendChild(statsCol);

    // Middle column: Position, Energy, Skill Types (stacked vertically)
    const infoCol = document.createElement('div');
    infoCol.className = 'card-info-col';

    const posEl = document.createElement('div');
    posEl.className = 'card-position';
    posEl.textContent = POSITION_LABELS[card['Position']] || card['Position'];
    infoCol.appendChild(posEl);

    const energyEl = buildStat('energy', `\u26A1 ${card['Energy'] || '0'}`);
    infoCol.appendChild(energyEl);

    const skillTypesEl = document.createElement('div');
    skillTypesEl.className = 'card-skill-types';
    [card['Skill Type #1'], card['Skill Type #2']].forEach(st => {
      if (st) {
        const icon = document.createElement('img');
        icon.className = 'skill-type-icon';
        icon.src = SKILL_TYPE_ICONS[st] || '';
        icon.alt = st;
        skillTypesEl.appendChild(icon);
      }
    });
    infoCol.appendChild(skillTypesEl);
    bottomEl.appendChild(infoCol);

    // Right column: Abilities
    const abilitiesEl = document.createElement('div');
    abilitiesEl.className = 'card-abilities';
    appendAbility(abilitiesEl, card['Ability 1 Title'], card['Ability 1 Text']);
    appendAbility(abilitiesEl, card['Ability 2 Title'], card['Ability 2 Text']);
    bottomEl.appendChild(abilitiesEl);

    div.appendChild(bottomEl);

    // Card number (footer)
    const cardNumEl = document.createElement('div');
    cardNumEl.className = 'card-number';
    cardNumEl.textContent = card['Card #'] || '';
    if (bgImage) {
      cardNumEl.style.color = getCardNumberColor(card['Set']);
    }
    div.appendChild(cardNumEl);

    return div;
  }


  // ============================================================
  // DECK SHARING (encode/decode, share modal, import modal)
  // Deck codes: base64 of "cardNum,cardNum.parallelCode,..." format.
  // ============================================================

  const PARALLEL_TO_CODE = {
    'Base': null,
    [Parallels.Parallel.ALPHA]: '125',
    [Parallels.Parallel.P77]: '77',
    [Parallels.Parallel.P66]: '66',
    [Parallels.Parallel.P44]: '44',
    [Parallels.Parallel.P11]: '11',
    [Parallels.Parallel.OMEGA]: '1',
  };
  const CODE_TO_PARALLEL = Object.fromEntries(
    Object.entries(PARALLEL_TO_CODE).filter(([, v]) => v != null).map(([k, v]) => [v, k])
  );

  /** Encode the current deck into a compact base64 string */
  function encodeDeck() {
    if (deck.length === 0) return '';
    // Format: "cardNum" for base, "cardNum.parallelCode" for parallels
    const entries = deck.map(card => {
      const num = card['Card #'] || '0';
      const code = PARALLEL_TO_CODE[card['Parallel'] || 'Base'];
      return code ? `${num}.${code}` : num;
    });
    return btoa(entries.join(','));
  }

  /** Decode a base64 deck string into an array of { cardNum, parallel } */
  function decodeDeck(encoded) {
    try {
      const str = atob(encoded);
      return str.split(',').map(entry => {
        const dotIdx = entry.indexOf('.');
        if (dotIdx === -1) {
          return { cardNum: entry, parallel: 'Base' };
        }
        const cardNum = entry.slice(0, dotIdx);
        const code = entry.slice(dotIdx + 1);
        const parallel = CODE_TO_PARALLEL[code] || 'Base';
        return { cardNum, parallel };
      });
    } catch (e) {
      console.error('Failed to decode deck:', e);
      return null;
    }
  }

  /** Generate a shareable URL for the current deck */
  function getShareURL() {
    const encoded = encodeDeck();
    if (!encoded) return null;
    const url = new URL(window.location.href.split('#')[0]);
    url.hash = `deck=${encoded}`;
    return url.toString();
  }

  /** Copy the deck share URL to clipboard and show feedback */
  function shareDeck() {
    if (deck.length !== 20) return;
    const url = getShareURL();
    const code = encodeDeck();
    if (!url || !code) return;
    showShareModal(url, code);
  }

  /** Show a modal with share link and deck code */
  function showShareModal(url, code) {
    // Remove existing modal if any
    const existing = document.querySelector('.share-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'share-modal-overlay';
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    const modal = document.createElement('div');
    modal.className = 'share-modal';
    modal.innerHTML = `
      <h3>Share Deck</h3>
      <div class="share-field">
        <label>Deck Link</label>
        <div class="share-input-row">
          <input type="text" class="share-input" value="${escapeHtml(url)}" readonly>
          <button class="share-copy-btn" data-target="link">Copy</button>
        </div>
      </div>
      <div class="share-field">
        <label>Deck Code</label>
        <div class="share-input-row">
          <input type="text" class="share-input" value="${escapeHtml(code)}" readonly>
          <button class="share-copy-btn" data-target="code">Copy</button>
        </div>
      </div>
      <button class="share-close-btn">Close</button>
    `;

    modal.querySelector('.share-close-btn').addEventListener('click', () => overlay.remove());

    modal.querySelectorAll('.share-copy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = btn.parentElement.querySelector('.share-input');
        navigator.clipboard.writeText(input.value).then(() => {
          btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
        }).catch(() => {
          input.select();
        });
      });
    });

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }

  /** Show the import deck modal */
  function showImportModal() {
    const existing = document.querySelector('.share-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'share-modal-overlay';
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    const modal = document.createElement('div');
    modal.className = 'share-modal';
    modal.innerHTML = `
      <h3>Import Deck</h3>
      <div class="share-field">
        <label>Paste a deck code or deck link</label>
        <div class="share-input-row">
          <input type="text" class="share-input import-code-input" placeholder="Deck code or URL...">
          <button class="share-copy-btn import-btn">Import</button>
        </div>
      </div>
      <button class="share-close-btn">Close</button>
    `;

    const input = modal.querySelector('.import-code-input');
    const importBtn = modal.querySelector('.import-btn');

    function doImport() {
      let code = input.value.trim();
      if (!code) return;
      // If it's a URL, extract the deck code from the hash
      if (code.includes('#deck=')) {
        code = code.split('#deck=')[1];
      }
      const success = importDeckFromCode(code);
      if (success) {
        overlay.remove();
        showToast('Deck imported!');
      }
    }

    importBtn.addEventListener('click', doImport);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doImport(); });

    modal.querySelector('.share-close-btn').addEventListener('click', () => overlay.remove());

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    // Auto-focus the input
    requestAnimationFrame(() => input.focus());
  }

  // ============================================================
  // SAVED DECKS (Firebase, requires sign-in)
  // Save/load/delete decks, overwrite confirmation, auth gating.
  // ============================================================

  /** Show the Save Deck modal — save as new or overwrite existing */
  function showSaveDeckModal() {
    if (deck.length !== 20) return;
    if (!currentUser) return;

    const existing = document.querySelector('.share-modal-overlay');
    if (existing) existing.remove();

    const code = encodeDeck();
    const overlay = document.createElement('div');
    overlay.className = 'share-modal-overlay';
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    const modal = document.createElement('div');
    modal.className = 'share-modal';
    modal.innerHTML = `<h3>Save Deck</h3>
      <div class="share-field">
        <label>Deck Name</label>
        <div class="share-input-row">
          <input type="text" class="share-input save-deck-name" placeholder="Enter deck name..." maxlength="32" value="${escapeHtml(loadedDeckName)}">
          <button class="share-copy-btn save-deck-confirm-btn">Save</button>
        </div>
      </div>
      <button class="share-close-btn">Cancel</button>`;

    const nameInput = modal.querySelector('.save-deck-name');
    const saveBtn = modal.querySelector('.save-deck-confirm-btn');

    async function doSave(name, deckId) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
      const success = await saveDeckToFirestore(name, code, deckId);
      if (success) {
        loadedDeckName = name;
        savedDecksList = loadSavedDecksFromCache();
        const match = savedDecksList.find(d => d.name === name);
        if (match) loadedDeckId = match.id;
        overlay.remove();
        showToast(`Deck "${name}" saved!`);
        updateSaveDeckBtn();
      } else {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
        showToast('Failed to save deck.');
      }
    }

    saveBtn.addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (!name) { nameInput.focus(); return; }
      if (name.length > 32) {
        showToast('Deck name must be 32 characters or less.');
        nameInput.focus();
        return;
      }

      // Check deck limit
      const existingDeck = savedDecksList.find(d => d.name === name);
      if (!existingDeck && savedDecksList.length >= 10) {
        showToast('Maximum 10 saved decks reached. Delete one first.');
        return;
      }

      // Check if a deck with this name already exists
      const duplicate = savedDecksList.find(d => d.name === name);
      if (duplicate) {
        // Same code — nothing changed
        if (duplicate.code === code) {
          overlay.remove();
          showToast('No changes to save.');
          return;
        }
        // Different code — ask for overwrite confirmation
        modal.innerHTML = `<h3>Overwrite Deck?</h3>
          <p style="font-size:0.85rem;color:#555;margin-bottom:1rem;">A deck named "<strong>${escapeHtml(name)}</strong>" already exists. Overwrite it?</p>
          <div class="save-deck-actions">
            <button class="save-deck-overwrite-btn">Overwrite</button>
            <button class="save-deck-new-btn">Cancel</button>
          </div>`;
        modal.querySelector('.save-deck-overwrite-btn').addEventListener('click', function() {
          this.disabled = true;
          this.textContent = 'Saving...';
          doSave(name, duplicate.id);
        });
        modal.querySelector('.save-deck-new-btn').addEventListener('click', () => overlay.remove());
      } else {
        // New deck
        doSave(name, null);
      }
    });

    modal.querySelector('.share-close-btn').addEventListener('click', () => overlay.remove());
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveBtn.click(); });

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => nameInput.focus());
  }

  /** Show the My Decks modal — list, load, delete */
  async function showMyDecksModal() {
    if (!currentUser) return;

    const existing = document.querySelector('.share-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'share-modal-overlay';
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    const modal = document.createElement('div');
    modal.className = 'share-modal';
    modal.innerHTML = `<h3>My Decks</h3><div class="my-decks-list"></div><button class="share-close-btn">Close</button>`;

    modal.querySelector('.share-close-btn').addEventListener('click', () => overlay.remove());

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Show cached data immediately
    savedDecksList = loadSavedDecksFromCache();
    renderMyDecksList(modal.querySelector('.my-decks-list'), overlay);

    // Sync from Firestore in background
    loadSavedDecks().then(decks => {
      savedDecksList = decks;
      const listEl = modal.querySelector('.my-decks-list');
      if (listEl) renderMyDecksList(listEl, overlay);
    });
  }

  function renderMyDecksList(container, overlay) {
    if (savedDecksList.length === 0) {
      container.innerHTML = '<p class="my-decks-empty">No saved decks yet.</p>';
      return;
    }

    container.innerHTML = '';
    savedDecksList.forEach(d => {
      const row = document.createElement('div');
      row.className = 'my-decks-row';

      const nameEl = document.createElement('span');
      nameEl.className = 'my-decks-name';
      nameEl.textContent = d.name;
      nameEl.title = 'Click to load';
      nameEl.addEventListener('click', () => {
        importDeckFromCode(d.code);
        loadedDeckId = d.id;
        loadedDeckName = d.name;
        updateSaveDeckBtn();
        overlay.remove();
        showToast(`Loaded "${d.name}"`);
      });
      row.appendChild(nameEl);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'my-decks-delete';
      deleteBtn.textContent = '\u2715';
      deleteBtn.title = 'Delete deck';
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm(`Delete "${d.name}"?`)) return;
        deleteBtn.disabled = true;
        const success = await deleteDeckFromFirestore(d.id);
        if (success) {
          savedDecksList = savedDecksList.filter(x => x.id !== d.id);
          if (loadedDeckId === d.id) { loadedDeckId = null; loadedDeckName = ''; updateSaveDeckBtn(); }
          renderMyDecksList(container, overlay);
          showToast(`Deleted "${d.name}"`);
        } else {
          deleteBtn.disabled = false;
          showToast('Failed to delete deck.');
        }
      });
      row.appendChild(deleteBtn);

      container.appendChild(row);
    });
  }

  /** Update Save button label based on loaded deck state */
  function updateSaveDeckBtn() {
    if (loadedDeckId && loadedDeckName) {
      saveDeckBtn.textContent = `Save`;
      saveDeckBtn.title = `Saving to: ${loadedDeckName}`;
    } else {
      saveDeckBtn.textContent = 'Save';
      saveDeckBtn.title = '';
    }
  }

  /** Toggle auth-only buttons based on sign-in state */
  function updateAuthUI() {
    const show = !!currentUser;
    document.querySelectorAll('.auth-only').forEach(el => {
      el.classList.toggle('hidden', !show);
    });
    // Refresh save button disabled state
    saveDeckBtn.disabled = deck.length !== 20 || !currentUser;
    if (show) {
      // Load from cache immediately, then sync from Firestore
      savedDecksList = loadSavedDecksFromCache();
      loadSavedDecks().then(decks => { savedDecksList = decks; });
      // Load the user's digital collections for the owned-cards filter
      loadUserCollections().then(cols => {
        userDigitalCollections = cols.filter(c => c.type === 'digital');
        populateOwnedCollectionDropdown();
        updateOwnedUI();
        if (ownedOnly) applyFilters();
      });
    } else {
      savedDecksList = [];
      loadedDeckId = null;
      loadedDeckName = '';
      updateSaveDeckBtn();
      // Clear collection-backed owned filter on sign-out
      userDigitalCollections = [];
      populateOwnedCollectionDropdown();
      const wasOwned = ownedOnly;
      updateOwnedUI();
      if (wasOwned) applyFilters();
    }
  }

  // Register auth listener
  onAuthStateChange(updateAuthUI);

  // ============================================================
  // CARD POOL & RULE ENGINE
  // Pool: pre-filter restricting visible cards (set, skill type, club, ability).
  // Rules: deck composition constraints validated after building.
  // ============================================================

  /**
   * Check if a card is owned in the selected digital collection.
   * Returns true (no filtering) when the owned filter is off or the
   * selected collection can't be found (e.g. stale/deleted id).
   */
  function matchesOwned(card) {
    if (!ownedOnly || !ownedCollectionId) return true;
    const col = userDigitalCollections.find(c => c.id === ownedCollectionId);
    if (!col) return true;
    const owned = (col.cards && col.cards[card['Card #']]) || [];
    return owned.includes(card['Parallel']);
  }

  /** Check if a card passes the active card pool restrictions */
  function matchesPool(card) {
    // Sets: include or exclude (using "Set (License)" format)
    if (cardPool.sets) {
      const setLicense = `${card['Set'] || ''} (${card['License'] || ''})`;
      if (cardPool.sets.m === 'i' && !cardPool.sets.v.includes(setLicense)) return false;
      if (cardPool.sets.m === 'x' && cardPool.sets.v.includes(setLicense)) return false;
    }

    // Skill types: include and/or exclude (card has 2 skill types)
    if (cardPool.skillTypes) {
      const st1 = card['Skill Type #1'] || '';
      const st2 = card['Skill Type #2'] || '';
      if (cardPool.skillTypes.i && cardPool.skillTypes.i.length > 0) {
        if (!cardPool.skillTypes.i.includes(st1) && !cardPool.skillTypes.i.includes(st2)) return false;
      }
      if (cardPool.skillTypes.x && cardPool.skillTypes.x.length > 0) {
        if (cardPool.skillTypes.x.includes(st1) || cardPool.skillTypes.x.includes(st2)) return false;
      }
    }

    // Clubs: include or exclude
    if (cardPool.clubs) {
      const club = card['Club'] || '';
      if (cardPool.clubs.m === 'i' && !cardPool.clubs.v.includes(club)) return false;
      if (cardPool.clubs.m === 'x' && cardPool.clubs.v.includes(club)) return false;
    }

    // Abilities: include or exclude
    if (cardPool.abilities) {
      const a1 = card['Ability 1 Title'] || 'N/A';
      const a2 = card['Ability 2 Title'] || 'N/A';
      if (cardPool.abilities.m === 'i') {
        if (!cardPool.abilities.v.includes(a1) || !cardPool.abilities.v.includes(a2)) return false;
      }
      if (cardPool.abilities.m === 'x') {
        if (cardPool.abilities.v.includes(a1) || cardPool.abilities.v.includes(a2)) return false;
      }
    }

    return true;
  }

  // --- Rule Encoding/Decoding ---
  // Combined format: { pool: {...}, rules: [...] }

  /** Encode a combined rule (pool + validation rules) into base64 */
  function encodeRule(pool, rules) {
    const obj = {};
    if (pool) obj.pool = pool;
    if (rules && rules.length > 0) obj.rules = rules;
    return btoa(JSON.stringify(obj));
  }

  /** Decode a base64 rule string into { pool, rules } */
  function decodeRule(encoded) {
    try {
      const obj = JSON.parse(atob(encoded));
      // Support legacy pool-only codes (no "pool" wrapper)
      if (!obj.pool && !obj.rules) {
        // Treat entire object as a pool config
        return {
          pool: { sets: obj.s || null, skillTypes: obj.t || null, clubs: obj.c || null, abilities: obj.a || null },
          rules: [],
        };
      }
      return {
        pool: obj.pool ? {
          sets: obj.pool.s || null,
          skillTypes: obj.pool.t || null,
          clubs: obj.pool.c || null,
          abilities: obj.pool.a || null,
        } : null,
        rules: obj.rules || [],
      };
    } catch (e) {
      console.error('Failed to decode rule:', e);
      return null;
    }
  }

  // --- Deck Validation ---

  /**
   * Validate a deck against pool restrictions and composition rules.
   * @param {Array} deckCards - the current deck array
   * @param {Object|null} pool - pool config (same shape as cardPool)
   * @param {Array} rules - array of rule objects { col, op, n, v }
   * @returns {{ cardViolations: Map<number, string[]>, deckViolations: string[] }}
   */
  function validateDeck(deckCards, pool, rules) {
    const cardViolations = new Map(); // index → [messages]
    const deckViolations = []; // deck-wide messages

    // Helper: get or create violations array for a card index
    function addCardViolation(idx, msg) {
      if (!cardViolations.has(idx)) cardViolations.set(idx, []);
      cardViolations.get(idx).push(msg);
    }

    // --- Pool violations ---
    if (pool) {
      deckCards.forEach((card, idx) => {
        const msgs = getPoolViolations(card, pool);
        msgs.forEach(msg => addCardViolation(idx, msg));
      });
    }

    // --- Rule violations ---
    if (rules && rules.length > 0) {
      rules.forEach(rule => {
        const count = countMatching(deckCards, rule);
        const violated = isRuleViolated(rule, count);
        if (!violated) return;

        const msg = ruleToMessage(rule, count);

        if (rule.op === 'le') {
          // Flag individual cards that match (the excess ones)
          deckCards.forEach((card, idx) => {
            if (cardMatchesRule(card, rule)) {
              addCardViolation(idx, msg);
            }
          });
        } else {
          // min/eq are deck-wide (can't blame a specific card)
          deckViolations.push(msg);
        }
      });
    }

    return { cardViolations, deckViolations };
  }

  /** Check if a card violates pool restrictions. Returns array of messages. */
  function getPoolViolations(card, pool) {
    const msgs = [];

    if (pool.sets) {
      const setLicense = `${card['Set'] || ''} (${card['License'] || ''})`;
      if (pool.sets.m === 'i' && !pool.sets.v.includes(setLicense)) {
        msgs.push(`Set ${setLicense} not allowed`);
      }
      if (pool.sets.m === 'x' && pool.sets.v.includes(setLicense)) {
        msgs.push(`Set ${setLicense} not allowed`);
      }
    }

    if (pool.skillTypes) {
      const st1 = card['Skill Type #1'] || '';
      const st2 = card['Skill Type #2'] || '';
      if (pool.skillTypes.i && pool.skillTypes.i.length > 0) {
        if (!pool.skillTypes.i.includes(st1) && !pool.skillTypes.i.includes(st2)) {
          msgs.push(`Skill type ${st1}${st2 ? '/' + st2 : ''} not allowed`);
        }
      }
      if (pool.skillTypes.x && pool.skillTypes.x.length > 0) {
        if (pool.skillTypes.x.includes(st1)) msgs.push(`Skill type ${st1} not allowed`);
        if (pool.skillTypes.x.includes(st2)) msgs.push(`Skill type ${st2} not allowed`);
      }
    }

    if (pool.clubs) {
      const club = card['Club'] || '';
      if (pool.clubs.m === 'i' && !pool.clubs.v.includes(club)) {
        msgs.push(`Club ${club} not allowed`);
      }
      if (pool.clubs.m === 'x' && pool.clubs.v.includes(club)) {
        msgs.push(`Club ${club} not allowed`);
      }
    }

    if (pool.abilities) {
      const a1 = card['Ability 1 Title'] || 'N/A';
      const a2 = card['Ability 2 Title'] || 'N/A';
      if (pool.abilities.m === 'i') {
        if (!pool.abilities.v.includes(a1)) msgs.push(`Ability ${a1} not allowed`);
        if (a2 !== a1 && !pool.abilities.v.includes(a2)) msgs.push(`Ability ${a2} not allowed`);
      }
      if (pool.abilities.m === 'x') {
        if (pool.abilities.v.includes(a1)) msgs.push(`Ability ${a1} not allowed`);
        if (pool.abilities.v.includes(a2)) msgs.push(`Ability ${a2} not allowed`);
      }
    }

    return msgs;
  }

  /** Count how many cards in the deck match a rule's values */
  function countMatching(deckCards, rule) {
    return deckCards.filter(card => cardMatchesRule(card, rule)).length;
  }

  /** Check if a single card matches a rule's col + v criteria */
  function cardMatchesRule(card, rule) {
    const values = rule.v;
    switch (rule.col) {
      case 's': {
        const setLicense = `${card['Set'] || ''} (${card['License'] || ''})`;
        return values.includes(setLicense);
      }
      case 't': {
        const st1 = card['Skill Type #1'] || '';
        const st2 = card['Skill Type #2'] || '';
        return values.includes(st1) || values.includes(st2);
      }
      case 'c':
        return values.includes(card['Club'] || '');
      case 'a': {
        const a1 = card['Ability 1 Title'] || 'N/A';
        const a2 = card['Ability 2 Title'] || 'N/A';
        return values.includes(a1) || values.includes(a2);
      }
      case 'p': {
        const parallel = card['Parallel'] || 'Base';
        if (values[0] === '*') return parallel !== 'Base';
        return values.includes(parallel);
      }
      default:
        return false;
    }
  }

  /** Check if a rule is violated given the count of matching cards */
  function isRuleViolated(rule, count) {
    switch (rule.op) {
      case 'le': return count > rule.n;
      case 'ge': return count < rule.n;
      case 'eq': return count !== rule.n;
      default: return false;
    }
  }

  /** Generate a human-readable violation message from a rule */
  function ruleToMessage(rule, count) {
    const colLabels = { s: 'set', t: 'skill type', c: 'club', a: 'ability', p: 'parallel' };
    const colLabel = colLabels[rule.col] || rule.col;
    const valuesStr = rule.v[0] === '*' ? 'parallel' : `${colLabel} ${rule.v.join(', ')}`;

    switch (rule.op) {
      case 'le': return `Max ${rule.n} cards from ${valuesStr} (have ${count})`;
      case 'ge': return `Need at least ${rule.n} cards from ${valuesStr} (have ${count})`;
      case 'eq': return `Need exactly ${rule.n} cards from ${valuesStr} (have ${count})`;
      default: return '';
    }
  }

  /** Apply pool config and refresh */
  function applyPool(config) {
    cardPool = config;
    poolActive = !!(cardPool.sets || cardPool.skillTypes || cardPool.clubs || cardPool.abilities);
    updateRuleBanner();
    applyFilters();
  }

  function clearPool() {
    cardPool = { sets: null, skillTypes: null, clubs: null, abilities: null };
    poolActive = false;
    poolDescription = '';
    ruleDetails = '';
    activeRules = [];
    updateRuleBanner();
    applyFilters();
    renderDeck();
  }

  // --- Rule UI (banner, kebab menu, edit modal, presets) ---

  let rulePresets = []; // Cached presets from spreadsheet { week, desc, details, code }
  let ruleDetails = ''; // Current rule details text (multi-line)

  function initRuleUI() {
    const kebabBtn = document.getElementById('rule-kebab-btn');
    const kebabMenu = document.getElementById('rule-kebab-menu');

    kebabBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      buildRuleMenu();
      kebabMenu.classList.toggle('hidden');
    });
    document.addEventListener('click', () => kebabMenu.classList.add('hidden'));

    // Details button
    document.getElementById('rule-details-btn').addEventListener('click', showRuleDetailsModal);

    // Pre-fetch rule presets from spreadsheet
    fetchRulePresets();
  }

  async function fetchRulePresets() {
    try {
      const poolGid = '1742493275';
      const response = await fetch(SPREADSHEET_BASE + '&gid=' + poolGid + '&_t=' + Date.now());
      if (!response.ok) return;
      const text = await response.text();
      const lines = parseCSVLines(text);
      if (lines.length < 2) return;

      const header = lines[0].map(c => c.trim());
      const weekIdx = header.indexOf('Week');
      const descIdx = header.indexOf('Description');
      const detailsIdx = header.indexOf('Details');
      const codeIdx = header.indexOf('Code');

      if (weekIdx === -1 || codeIdx === -1) return;

      rulePresets = [];
      for (let i = 1; i < lines.length; i++) {
        const row = lines[i];
        const week = (row[weekIdx] || '').trim();
        const desc = descIdx !== -1 ? (row[descIdx] || '').trim() : '';
        const details = detailsIdx !== -1 ? (row[detailsIdx] || '').trim() : '';
        const code = (row[codeIdx] || '').trim();
        if (!week || !code) continue;
        rulePresets.push({ week, desc, details, code });
      }
    } catch (err) {
      console.error('Failed to fetch rule presets:', err);
    }
  }

  function buildRuleMenu() {
    const menu = document.getElementById('rule-kebab-menu');
    menu.innerHTML = '';

    // Latest week (if available)
    if (rulePresets.length > 0) {
      const latest = rulePresets[rulePresets.length - 1];
      const latestBtn = document.createElement('button');
      latestBtn.textContent = `Week ${latest.week} (Latest)`;
      latestBtn.addEventListener('click', () => loadRulePreset(latest));
      menu.appendChild(latestBtn);
    }

    // Second latest (if available)
    if (rulePresets.length > 1) {
      const prev = rulePresets[rulePresets.length - 2];
      const prevBtn = document.createElement('button');
      prevBtn.textContent = `Week ${prev.week}`;
      prevBtn.addEventListener('click', () => loadRulePreset(prev));
      menu.appendChild(prevBtn);
    }

    // No rules
    const noRuleBtn = document.createElement('button');
    noRuleBtn.textContent = 'No Rules';
    noRuleBtn.addEventListener('click', () => {
      clearPool();
      activeRules = [];
      poolDescription = '';
      updateRuleBanner();
    });
    menu.appendChild(noRuleBtn);

    // Custom
    const customBtn = document.createElement('button');
    customBtn.textContent = 'Custom...';
    customBtn.addEventListener('click', showRuleEditModal);
    menu.appendChild(customBtn);
  }

  function loadRulePreset(preset) {
    const decoded = decodeRule(preset.code);
    if (decoded) {
      if (decoded.pool) {
        cardPool = decoded.pool;
        poolActive = !!(cardPool.sets || cardPool.skillTypes || cardPool.clubs || cardPool.abilities);
      } else {
        cardPool = { sets: null, skillTypes: null, clubs: null, abilities: null };
        poolActive = false;
      }
      activeRules = decoded.rules || [];
    } else {
      showToast('Invalid rule code in preset.');
      return;
    }
    poolDescription = preset.desc || `Week ${preset.week}`;
    ruleDetails = preset.details || '';
    updateRuleBanner();
    applyFilters();
    renderDeck();
  }

  function updateRuleBanner() {
    const textEl = document.getElementById('rule-banner-text');
    const detailsBtn = document.getElementById('rule-details-btn');
    if (poolActive || activeRules.length > 0) {
      textEl.textContent = `Dynamic Rule: ${poolDescription || 'Custom'}`;
      textEl.classList.remove('rule-unset');
      textEl.classList.add('rule-active');
    } else {
      textEl.textContent = 'Dynamic Rule: Not Set';
      textEl.classList.remove('rule-active');
      textEl.classList.add('rule-unset');
    }
    detailsBtn.classList.toggle('hidden', !ruleDetails);
  }

  function showRuleDetailsModal() {
    const existing = document.querySelector('.share-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'share-modal-overlay';
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    const modal = document.createElement('div');
    modal.className = 'share-modal';
    modal.innerHTML = `<h3>Rule Details</h3><div class="rule-details-content"></div><button class="share-close-btn">Close</button>`;

    const content = modal.querySelector('.rule-details-content');
    content.textContent = ruleDetails;
    content.style.whiteSpace = 'pre-wrap';
    content.style.fontSize = '0.85rem';
    content.style.color = '#333';
    content.style.marginBottom = '1rem';
    content.style.lineHeight = '1.5';

    modal.querySelector('.share-close-btn').addEventListener('click', () => overlay.remove());

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }

  /** Show the rule edit modal with pool controls + import/export */
  function showRuleEditModal() {
    const existing = document.querySelector('.share-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'share-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'share-modal pool-edit-modal';
    modal.innerHTML = `
      <button class="pool-modal-close" title="Close">&times;</button>
      <h3>Dynamic Rules Editor</h3>
      <div class="rule-editor-section">
        <h4>Card Pool</h4>
        <div id="pool-controls">
        <div class="pool-field">
          <div class="pool-field-header">
            <label>Sets</label>
            <button type="button" class="pool-tristate-btn" data-target="pool-sets-select" data-state="none"></button>
          </div>
          <div id="pool-sets-select" class="pool-select-area hidden">
            <div class="multiselect-wrapper pool-multiselect" data-column="pool-sets">
              <button type="button" class="multiselect-toggle">Select sets...</button>
              <div class="multiselect-dropdown">
                <input type="text" class="multiselect-search" placeholder="Type to filter...">
                <div id="pool-sets-options" class="pool-ms-options"></div>
              </div>
            </div>
          </div>
        </div>
        <div class="pool-field">
          <div class="pool-field-header">
            <label>Skill Types</label>
          </div>
          <div id="pool-skill-types" class="pool-tristate-pills"></div>
        </div>
        <div class="pool-field">
          <div class="pool-field-header">
            <label>Clubs</label>
            <button type="button" class="pool-tristate-btn" data-target="pool-clubs-select" data-state="none"></button>
          </div>
          <div id="pool-clubs-select" class="pool-select-area hidden">
            <div id="pool-clubs-wrapper" class="multiselect-wrapper pool-multiselect" data-column="pool-clubs">
              <button type="button" class="multiselect-toggle">Select clubs...</button>
              <div class="multiselect-dropdown">
                <input type="text" class="multiselect-search" placeholder="Type to filter...">
                <div id="pool-clubs-options" class="pool-ms-options"></div>
              </div>
            </div>
          </div>
        </div>
        <div class="pool-field">
          <div class="pool-field-header">
            <label>Abilities</label>
            <button type="button" class="pool-tristate-btn" data-target="pool-abilities-select" data-state="none"></button>
          </div>
          <div id="pool-abilities-select" class="pool-select-area hidden">
            <div class="multiselect-wrapper pool-multiselect" data-column="pool-abilities">
              <button type="button" class="multiselect-toggle">Select abilities...</button>
              <div class="multiselect-dropdown">
                <input type="text" class="multiselect-search" placeholder="Type to filter...">
                <div id="pool-abilities-options" class="pool-ms-options"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
      <div class="rule-editor-section">
        <h4>Rules <button type="button" id="rule-add-btn" class="rule-add-btn">+</button></h4>
        <div id="rules-list"></div>
      </div>
      <div id="rule-import-section" class="rule-import-section collapsed">
        <div class="rule-import-header" id="rule-import-toggle">&#9662; Import</div>
        <div class="rule-import-content">
          <div class="share-input-row">
            <input type="text" class="share-input rule-import-input" placeholder="Paste rule code...">
            <button class="share-copy-btn rule-import-btn">Import</button>
          </div>
        </div>
      </div>
      <div id="pool-actions">
        <button id="pool-export-btn">Export</button>
        <button id="pool-clear-btn">Clear</button>
        <button id="pool-apply-btn">Apply</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Populate options
    populatePoolModalOptions(modal);

    // Set current pool state into the modal
    if (poolActive) setPoolUI(cardPool, modal);

    // Populate existing rules
    const rulesList = modal.querySelector('#rules-list');
    activeRules.forEach(rule => rulesList.appendChild(buildRuleRow(rule)));

    // Add rule button
    modal.querySelector('#rule-add-btn').addEventListener('click', () => {
      if (rulesList.querySelectorAll('.rule-row').length >= 5) {
        showToast('Maximum 5 rules.');
        return;
      }
      rulesList.appendChild(buildRuleRow(null));
    });

    // Wire tristate buttons (sets, clubs, abilities)
    modal.querySelectorAll('.pool-tristate-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const states = ['none', 'include', 'exclude'];
        const curr = states.indexOf(btn.dataset.state);
        btn.dataset.state = states[(curr + 1) % 3];
        const target = modal.querySelector('#' + btn.dataset.target);
        target.classList.toggle('hidden', btn.dataset.state === 'none');
      });
    });

    // Wire skill type tristate pills
    modal.querySelectorAll('#pool-skill-types .tristate-item').forEach(item => {
      item.addEventListener('click', () => {
        const s = item.dataset.state;
        item.dataset.state = s === 'none' ? 'include' : s === 'include' ? 'exclude' : 'none';
      });
    });

    // Wire multiselect toggles
    modal.querySelectorAll('.pool-multiselect').forEach(wrapper => {
      const toggle = wrapper.querySelector('.multiselect-toggle');
      const dropdown = wrapper.querySelector('.multiselect-dropdown');
      const search = wrapper.querySelector('.multiselect-search');
      toggle.addEventListener('click', () => {
        const wasOpen = wrapper.classList.contains('open');
        // Close all other dropdowns first
        modal.querySelectorAll('.pool-multiselect.open').forEach(w => w.classList.remove('open'));
        if (!wasOpen) {
          wrapper.classList.add('open');
          // Position the fixed dropdown below the toggle
          const rect = toggle.getBoundingClientRect();
          dropdown.style.top = `${rect.bottom + 2}px`;
          dropdown.style.left = `${rect.left}px`;
          dropdown.style.width = `${Math.max(rect.width, 280)}px`;
          if (search) search.focus();
        }
      });
      if (search) {
        search.addEventListener('input', () => {
          const q = normalize(search.value);
          wrapper.querySelectorAll('.multiselect-option').forEach(opt => {
            opt.style.display = normalize(opt.textContent).includes(q) ? '' : 'none';
          });
        });
        search.addEventListener('click', e => e.stopPropagation());
      }
    });

    // Close dropdowns on outside click
    modal.addEventListener('click', (e) => {
      modal.querySelectorAll('.pool-multiselect.open').forEach(w => {
        if (!w.contains(e.target)) w.classList.remove('open');
      });
    });

    // Action buttons
    modal.querySelector('#pool-clear-btn').addEventListener('click', () => {
      // Reset all controls in the modal without closing it
      modal.querySelectorAll('.pool-tristate-btn').forEach(btn => {
        btn.dataset.state = 'none';
        const target = modal.querySelector('#' + btn.dataset.target);
        if (target) target.classList.add('hidden');
      });
      modal.querySelectorAll('#pool-skill-types .tristate-item').forEach(item => {
        item.dataset.state = 'none';
      });
      modal.querySelectorAll('.pool-ms-options input').forEach(cb => { cb.checked = false; });
      modal.querySelectorAll('.pool-multiselect .multiselect-toggle').forEach(t => {
        t.textContent = t.closest('.pool-multiselect').dataset.column === 'pool-sets' ? 'Select sets...'
          : t.closest('.pool-multiselect').dataset.column === 'pool-clubs' ? 'Select clubs...'
          : 'Select abilities...';
      });
      rulesList.innerHTML = '';
    });

    // Import section toggle
    modal.querySelector('#rule-import-toggle').addEventListener('click', () => {
      modal.querySelector('#rule-import-section').classList.toggle('collapsed');
    });

    // Import action
    modal.querySelector('.rule-import-btn').addEventListener('click', () => {
      const code = modal.querySelector('.rule-import-input').value.trim();
      if (!code) return;
      const decoded = decodeRule(code);
      if (!decoded) { showToast('Invalid rule code.'); return; }
      // Apply to modal state
      if (decoded.pool) {
        cardPool = decoded.pool;
        poolActive = !!(cardPool.sets || cardPool.skillTypes || cardPool.clubs || cardPool.abilities);
        setPoolUI(cardPool, modal);
      }
      activeRules = decoded.rules || [];
      const rulesList = modal.querySelector('#rules-list');
      rulesList.innerHTML = '';
      activeRules.forEach(rule => rulesList.appendChild(buildRuleRow(rule)));
      showToast('Rule imported into editor.');
    });

    // Export button
    modal.querySelector('#pool-export-btn').addEventListener('click', () => {
      readPoolFromUI(modal);
      const rulesFromUI = readRulesFromUI(modal);
      if (!poolActive && rulesFromUI.length === 0) { showToast('No rules to export.'); return; }
      const poolObj = poolActive
        ? { s: cardPool.sets, t: cardPool.skillTypes, c: cardPool.clubs, a: cardPool.abilities }
        : null;
      const code = encodeRule(poolObj, rulesFromUI);
      navigator.clipboard.writeText(code).then(() => {
        showToast('Rule code copied!');
      }).catch(() => {
        prompt('Copy this rule code:', code);
      });
    });

    // Apply button
    modal.querySelector('#pool-apply-btn').addEventListener('click', () => {
      readPoolFromUI(modal);
      activeRules = readRulesFromUI(modal);
      poolDescription = 'Custom';
      ruleDetails = '';
      updateRuleBanner();
      applyFilters();
      renderDeck();
      overlay.remove();
    });

    // Close (X) button
    modal.querySelector('.pool-modal-close').addEventListener('click', () => overlay.remove());
  }

  /** Build a single rule row for the editor */
  function buildRuleRow(rule) {
    const row = document.createElement('div');
    row.className = 'rule-row';

    const typeSelect = document.createElement('select');
    typeSelect.className = 'rule-select rule-type';
    [['s','Set'],['t','Skill Type'],['c','Club'],['a','Ability'],['p','Parallel']].forEach(([v,l]) => typeSelect.appendChild(new Option(l,v)));
    if (rule) typeSelect.value = rule.col;
    row.appendChild(typeSelect);

    // Value container — will hold either a searchable dropdown or plain select
    const valueContainer = document.createElement('div');
    valueContainer.className = 'rule-value-container';
    row.appendChild(valueContainer);

    let selectedValue = rule ? rule.v[0] : '';

    function buildValueControl(col) {
      valueContainer.innerHTML = '';
      const needsSearch = (col === 's' || col === 'c');
      const options = getRuleValueOptions(col);

      if (needsSearch) {
        // Searchable dropdown
        const wrapper = document.createElement('div');
        wrapper.className = 'rule-value-wrapper';

        const display = document.createElement('button');
        display.type = 'button';
        display.className = 'rule-value-display';

        const dropdown = document.createElement('div');
        dropdown.className = 'rule-value-dropdown hidden';

        const search = document.createElement('input');
        search.type = 'text';
        search.className = 'rule-value-search';
        search.placeholder = 'Search...';
        dropdown.appendChild(search);

        const list = document.createElement('div');
        list.className = 'rule-value-list';
        options.forEach(({ label, value }) => {
          const opt = document.createElement('div');
          opt.className = 'rule-value-option';
          opt.textContent = label;
          opt.dataset.value = value;
          if (value === selectedValue) opt.classList.add('selected');
          opt.addEventListener('mousedown', (e) => {
            e.preventDefault(); // Prevent blur
            selectedValue = value;
            display.textContent = label;
            dropdown.classList.add('hidden');
            list.querySelectorAll('.rule-value-option').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
          });
          list.appendChild(opt);
        });
        dropdown.appendChild(list);

        // Set initial text
        const match = options.find(o => o.value === selectedValue);
        display.textContent = match ? match.label : (options.length > 0 ? (selectedValue = options[0].value, options[0].label) : 'Select...');

        display.addEventListener('click', (e) => {
          e.stopPropagation();
          dropdown.classList.toggle('hidden');
          if (!dropdown.classList.contains('hidden')) {
            search.value = '';
            list.querySelectorAll('.rule-value-option').forEach(o => o.style.display = '');
            search.focus();
          }
        });

        search.addEventListener('input', () => {
          const q = normalize(search.value);
          list.querySelectorAll('.rule-value-option').forEach(o => {
            o.style.display = normalize(o.textContent).includes(q) ? '' : 'none';
          });
        });
        search.addEventListener('mousedown', e => e.stopPropagation());

        // Close on outside click
        document.addEventListener('click', (e) => {
          if (!wrapper.contains(e.target)) dropdown.classList.add('hidden');
        });

        wrapper.appendChild(display);
        wrapper.appendChild(dropdown);
        valueContainer.appendChild(wrapper);
      } else {
        // Plain select for short lists
        const sel = document.createElement('select');
        sel.className = 'rule-select rule-value';
        options.forEach(({ label, value }) => sel.appendChild(new Option(label, value)));
        if (selectedValue) sel.value = selectedValue;
        else if (options.length > 0) { selectedValue = options[0].value; sel.value = selectedValue; }
        sel.addEventListener('change', () => { selectedValue = sel.value; });
        valueContainer.appendChild(sel);
      }
    }

    buildValueControl(typeSelect.value);
    typeSelect.addEventListener('change', () => { selectedValue = ''; buildValueControl(typeSelect.value); });

    const opSelect = document.createElement('select');
    opSelect.className = 'rule-select rule-op';
    [['ge','\u2265'],['le','\u2264'],['eq','=']].forEach(([v,l]) => opSelect.appendChild(new Option(l,v)));
    if (rule) opSelect.value = rule.op;
    row.appendChild(opSelect);

    const numInput = document.createElement('input');
    numInput.type = 'number';
    numInput.className = 'rule-num';
    numInput.min = 0;
    numInput.max = 20;
    numInput.value = rule ? rule.n : '';
    numInput.placeholder = '#';
    row.appendChild(numInput);

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'rule-delete-btn';
    delBtn.textContent = '\u2715';
    delBtn.title = 'Remove';
    delBtn.addEventListener('click', () => row.remove());
    row.appendChild(delBtn);

    row._getValue = () => selectedValue;
    return row;
  }

  /** Get value options for a rule type */
  function getRuleValueOptions(col) {
    switch (col) {
      case 's': {
        const combos = new Set();
        allCards.forEach(c => { if (c['Set']) combos.add(`${c['Set']} (${c['License']||''})`); });
        return [...combos].sort().map(v => ({ label: v, value: v }));
      }
      case 't':
        return ['Speed','Accuracy','Control','Strength','Leadership'].map(v => ({ label: v, value: v }));
      case 'c': {
        const clubs = new Set();
        allCards.forEach(c => { if (c['Club'] && c['Parallel']==='Base') clubs.add(c['Club']); });
        return [...clubs].sort().map(v => ({ label: v, value: v }));
      }
      case 'a': {
        const opts = [{ label: 'No Ability', value: 'N/A' }];
        const abs = new Set();
        allCards.forEach(c => { if (c['Parallel']!=='Base') return; [c['Ability 1 Title'],c['Ability 2 Title']].forEach(a => { if (a&&a!=='N/A') abs.add(a); }); });
        [...abs].sort().forEach(v => opts.push({ label: v, value: v }));
        return opts;
      }
      case 'p': {
        const opts = [{ label: 'Any parallel', value: '*' }];
        ['\u03B1/\u03B1','#/77','#/66','#/44','#/11','\u03A9/\u03A9'].forEach(v => opts.push({ label: v, value: v }));
        return opts;
      }
      default: return [];
    }
  }

  /** Read rules from the editor UI rows */
  function readRulesFromUI(modal) {
    const rules = [];
    modal.querySelectorAll('.rule-row').forEach(row => {
      const col = row.querySelector('.rule-type').value;
      const op = row.querySelector('.rule-op').value;
      const n = parseInt(row.querySelector('.rule-num').value);
      const v = row._getValue();
      if (!isNaN(n) && v) rules.push({ col, op, n, v: [v] });
    });
    return rules;
  }

  function populatePoolModalOptions(modal) {
    // Helper: update toggle text based on checked count
    function wireMultiselectCount(wrapper) {
      const toggle = wrapper.querySelector('.multiselect-toggle');
      const defaultText = toggle.textContent;
      wrapper.addEventListener('change', () => {
        const checked = wrapper.querySelectorAll('.pool-ms-options input:checked');
        if (checked.length === 0) toggle.textContent = defaultText;
        else if (checked.length === 1) toggle.textContent = checked[0].value === 'N/A' ? 'No Ability' : checked[0].nextElementSibling ? checked[0].nextElementSibling.textContent : checked[0].value;
        else toggle.textContent = `${checked.length} selected`;
      });
    }

    // Sets
    const setsWrapper = modal.querySelector('#pool-sets-select .pool-multiselect');
    const setsContainer = modal.querySelector('#pool-sets-options');
    // Use Set (License) combos same as the filter
    const setCombos = new Set();
    allCards.forEach(card => {
      const set = card['Set'] || '';
      const license = card['License'] || '';
      if (set) setCombos.add(`${set} (${license})`);
    });
    [...setCombos].sort().forEach(combo => {
      const label = document.createElement('label');
      label.className = 'multiselect-option';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = combo;
      label.appendChild(cb);
      const span = document.createElement('span');
      span.textContent = combo;
      label.appendChild(span);
      setsContainer.appendChild(label);
    });
    wireMultiselectCount(setsWrapper);

    // Skill types (tristate pills)
    const stContainer = modal.querySelector('#pool-skill-types');
    ['Speed', 'Accuracy', 'Control', 'Strength', 'Leadership'].forEach(st => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'tristate-item';
      item.dataset.value = st;
      item.dataset.state = 'none';
      item.textContent = st;
      stContainer.appendChild(item);
    });

    // Clubs
    const clubsWrapper = modal.querySelector('#pool-clubs-select .pool-multiselect');
    const clubsContainer = modal.querySelector('#pool-clubs-options');
    const clubs = new Set();
    allCards.forEach(c => { if (c['Club'] && c['Parallel'] === 'Base') clubs.add(c['Club']); });
    [...clubs].sort().forEach(club => {
      const label = document.createElement('label');
      label.className = 'multiselect-option';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = club;
      label.appendChild(cb);
      const span = document.createElement('span');
      span.textContent = club;
      label.appendChild(span);
      clubsContainer.appendChild(label);
    });
    wireMultiselectCount(clubsWrapper);

    // Abilities
    const abilitiesWrapper = modal.querySelector('#pool-abilities-select .pool-multiselect');
    const abilityContainer = modal.querySelector('#pool-abilities-options');
    const naLabel = document.createElement('label');
    naLabel.className = 'multiselect-option';
    const naCb = document.createElement('input');
    naCb.type = 'checkbox';
    naCb.value = 'N/A';
    naLabel.appendChild(naCb);
    const naSpan = document.createElement('span');
    naSpan.textContent = 'No Ability';
    naLabel.appendChild(naSpan);
    abilityContainer.appendChild(naLabel);

    const abilities = new Set();
    allCards.forEach(c => {
      if (c['Parallel'] !== 'Base') return;
      [c['Ability 1 Title'], c['Ability 2 Title']].forEach(a => {
        if (a && a !== 'N/A') abilities.add(a);
      });
    });
    [...abilities].sort().forEach(ab => {
      const label = document.createElement('label');
      label.className = 'multiselect-option';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = ab;
      label.appendChild(cb);
      const span = document.createElement('span');
      span.textContent = ab;
      label.appendChild(span);
      abilityContainer.appendChild(label);
    });
    wireMultiselectCount(abilitiesWrapper);
  }

  /** Read pool config from the modal UI controls */
  function readPoolFromUI(modal) {
    // Sets
    const setsBtn = modal.querySelector('.pool-tristate-btn[data-target="pool-sets-select"]');
    if (setsBtn.dataset.state !== 'none') {
      const values = [...modal.querySelectorAll('#pool-sets-options input:checked')].map(cb => cb.value);
      cardPool.sets = values.length > 0 ? { m: setsBtn.dataset.state === 'include' ? 'i' : 'x', v: values } : null;
    } else {
      cardPool.sets = null;
    }

    // Skill types (tristate pills: include + exclude)
    const stInc = [], stExc = [];
    modal.querySelectorAll('#pool-skill-types .tristate-item').forEach(item => {
      if (item.dataset.state === 'include') stInc.push(item.dataset.value);
      else if (item.dataset.state === 'exclude') stExc.push(item.dataset.value);
    });
    cardPool.skillTypes = (stInc.length > 0 || stExc.length > 0)
      ? { i: stInc.length > 0 ? stInc : undefined, x: stExc.length > 0 ? stExc : undefined }
      : null;

    // Clubs
    const clubsBtn = modal.querySelector('.pool-tristate-btn[data-target="pool-clubs-select"]');
    if (clubsBtn.dataset.state !== 'none') {
      const values = [...modal.querySelectorAll('#pool-clubs-options input:checked')].map(cb => cb.value);
      cardPool.clubs = values.length > 0 ? { m: clubsBtn.dataset.state === 'include' ? 'i' : 'x', v: values } : null;
    } else {
      cardPool.clubs = null;
    }

    // Abilities
    const abilitiesBtn = modal.querySelector('.pool-tristate-btn[data-target="pool-abilities-select"]');
    if (abilitiesBtn.dataset.state !== 'none') {
      const values = [...modal.querySelectorAll('#pool-abilities-options input:checked')].map(cb => cb.value);
      cardPool.abilities = values.length > 0 ? { m: abilitiesBtn.dataset.state === 'include' ? 'i' : 'x', v: values } : null;
    } else {
      cardPool.abilities = null;
    }

    poolActive = !!(cardPool.sets || cardPool.skillTypes || cardPool.clubs || cardPool.abilities);
    applyFilters();
  }

  /** Set pool UI controls in the modal to match a given pool config */
  function setPoolUI(config, modal) {
    // Sets
    if (config.sets) {
      const btn = modal.querySelector('.pool-tristate-btn[data-target="pool-sets-select"]');
      btn.dataset.state = config.sets.m === 'i' ? 'include' : 'exclude';
      modal.querySelector('#pool-sets-select').classList.remove('hidden');
      modal.querySelectorAll('#pool-sets-options input').forEach(cb => {
        if (config.sets.v.includes(cb.value)) cb.checked = true;
      });
    }

    // Skill types
    if (config.skillTypes) {
      modal.querySelectorAll('#pool-skill-types .tristate-item').forEach(item => {
        if (config.skillTypes.i && config.skillTypes.i.includes(item.dataset.value)) {
          item.dataset.state = 'include';
        } else if (config.skillTypes.x && config.skillTypes.x.includes(item.dataset.value)) {
          item.dataset.state = 'exclude';
        }
      });
    }

    // Clubs
    if (config.clubs) {
      const btn = modal.querySelector('.pool-tristate-btn[data-target="pool-clubs-select"]');
      btn.dataset.state = config.clubs.m === 'i' ? 'include' : 'exclude';
      modal.querySelector('#pool-clubs-select').classList.remove('hidden');
      modal.querySelectorAll('#pool-clubs-options input').forEach(cb => {
        if (config.clubs.v.includes(cb.value)) cb.checked = true;
      });
    }

    // Abilities
    if (config.abilities) {
      const btn = modal.querySelector('.pool-tristate-btn[data-target="pool-abilities-select"]');
      btn.dataset.state = config.abilities.m === 'i' ? 'include' : 'exclude';
      modal.querySelector('#pool-abilities-select').classList.remove('hidden');
      modal.querySelectorAll('#pool-abilities-options input').forEach(cb => {
        if (config.abilities.v.includes(cb.value)) cb.checked = true;
      });
    }
  }

  /** Load a deck from URL hash if present. Called after cards are loaded. */
  function loadDeckFromHash() {
    const hash = window.location.hash;
    if (!hash.startsWith('#deck=')) return;
    const encoded = hash.slice(6); // remove '#deck='
    importDeckFromCode(encoded);
    // Clear the hash so it doesn't interfere with future navigation
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  /** Import a deck from an encoded string. Works regardless of parallels toggle. */
  function importDeckFromCode(encoded) {
    const entries = decodeDeck(encoded);
    if (!entries || entries.length === 0) {
      showToast('Invalid deck code.');
      return false;
    }

    // Clear current deck
    deck = [];
    deckCardNums.clear();

    // Find matching cards — search allCards which always includes parallels
    entries.forEach(({ cardNum, parallel }) => {
      const card = allCards.find(c => c['Card #'] === cardNum && c['Parallel'] === parallel);
      if (card && !deckCardNums.has(card['Card #'])) {
        deck.push(card);
        deckCardNums.add(card['Card #']);
      }
    });

    if (deck.length === 0) {
      showToast('No matching cards found.');
      return false;
    }

    if (deck.length < entries.length) {
      showToast(`Imported ${deck.length}/${entries.length} cards (some not found).`);
    }

    renderDeck();
    renderCards();
    return true;
  }

  /** Show a brief toast notification */
  function showToast(msg) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    // Trigger animation
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  // ============================================================
  // DECK BUILDING
  // Add/remove cards, deck validation, deck panel rendering.
  // ============================================================

  function addToDeck(card) {
    if (deck.length >= 20) return;
    if (deckCardNums.has(card['Card #'])) return;

    const isGK = card['Position'] === 'Goalkeeper';
    const hasGK = deck.some(c => c['Position'] === 'Goalkeeper');

    if (isGK && hasGK) return;
    if (!isGK && !hasGK && deck.length >= 19) return;

    deck.push(card);
    deckCardNums.add(card['Card #']);
    renderDeck();
    renderCards();
    saveSessionState();
  }

  function removeFromDeck(index) {
    const removed = deck.splice(index, 1)[0];
    deckCardNums.delete(removed['Card #']);
    hideDeckPreview();
    renderDeck();
    renderCards();
    saveSessionState();
  }

  function clearDeck() {
    deck = [];
    deckCardNums.clear();
    loadedDeckId = null;
    loadedDeckName = '';
    updateSaveDeckBtn();
    renderDeck();
    renderCards();
    saveSessionState();
  }

  /** Check if a card should be greyed out (unavailable for deck) */
  function isCardUnavailable(card) {
    if (deck.length >= 20) return true;
    if (deckCardNums.has(card['Card #'])) return true;
    const isGK = card['Position'] === 'Goalkeeper';
    const hasGK = deck.some(c => c['Position'] === 'Goalkeeper');
    if (isGK && hasGK) return true;
    return false;
  }

  function renderDeck() {
    deckCountEl.textContent = `${deck.length} / 20`;
    shareDeckBtn.disabled = deck.length !== 20;
    saveDeckBtn.disabled = deck.length !== 20 || !currentUser;
    deckListEl.innerHTML = '';

    // Run deck validation
    const { cardViolations, deckViolations } = validateDeck(deck, poolActive ? cardPool : null, activeRules);

    // Render deck-wide warnings
    const warningsEl = document.getElementById('deck-warnings');
    warningsEl.innerHTML = '';
    if (deckViolations.length > 0) {
      deckViolations.forEach(msg => {
        const w = document.createElement('div');
        w.className = 'deck-warning';
        w.textContent = `\u26A0 ${msg}`;
        warningsEl.appendChild(w);
      });
    }

    // Separate GK from outfield and sort outfield by energy ascending
    const gk = deck.find(c => c['Position'] === 'Goalkeeper') || null;
    const outfield = deck.filter(c => c['Position'] !== 'Goalkeeper')
      .sort((a, b) => Number(a['Energy'] || 0) - Number(b['Energy'] || 0));

    // GK slot
    if (gk) {
      const gkIdx = deck.indexOf(gk);
      deckListEl.appendChild(buildDeckRow(gk, gkIdx, cardViolations.get(gkIdx)));
    } else {
      deckListEl.appendChild(buildEmptySlot('GK'));
    }

    // Separator
    const sep = document.createElement('div');
    sep.className = 'deck-separator';
    deckListEl.appendChild(sep);

    // Outfield slots (19)
    outfield.forEach(card => {
      const idx = deck.indexOf(card);
      deckListEl.appendChild(buildDeckRow(card, idx, cardViolations.get(idx)));
    });
    const emptyOutfield = 19 - outfield.length;
    for (let i = 0; i < emptyOutfield; i++) {
      deckListEl.appendChild(buildEmptySlot());
    }

    renderDeckStats();
  }

  function buildEmptySlot(label) {
    const row = document.createElement('div');
    row.className = 'deck-row deck-row-empty';
    const text = document.createElement('span');
    text.className = 'deck-empty-label';
    text.textContent = label || '';
    row.appendChild(text);
    return row;
  }

  function buildDeckRow(card, i, violations) {
      const row = document.createElement('div');
      row.className = 'deck-row';

      // Violation styling
      if (violations && violations.length > 0) {
        row.classList.add('deck-row-violation');
        row.title = violations.join('\n');
      }

      // Apply set color as left border and background image
      const setName = card['Set'] || '';
      const setColor = getSetColor(setName);
      if (setColor) {
        row.style.borderLeft = `4px solid ${setColor.bg}`;
      }
      const bgImage = setConfigs[setName] ? getSetBackground(setName) : null;
      if (bgImage) {
        row.style.backgroundImage = `linear-gradient(rgba(255,255,255,0.2), rgba(255,255,255,0.2)), url(${bgImage})`;
        row.style.backgroundSize = 'cover';
        row.style.backgroundPosition = 'center';
      }

      // Content wrapper (white layer over background)
      const contentWrapper = document.createElement('div');
      contentWrapper.className = 'deck-content';

      // Left side: Energy + Skill type icons (spans 2 lines)
      const leftCol = document.createElement('div');
      leftCol.className = 'deck-left';

      const nrgEl = document.createElement('span');
      nrgEl.className = 'deck-energy';
      nrgEl.innerHTML = `\u26A1${card['Energy'] || '0'}`;
      leftCol.appendChild(nrgEl);

      const stBox = document.createElement('span');
      stBox.className = 'deck-skill-types';
      [card['Skill Type #1'], card['Skill Type #2']].forEach(st => {
        if (st) {
          const icon = document.createElement('img');
          icon.src = SKILL_TYPE_ICONS[st] || '';
          icon.alt = st;
          icon.className = 'deck-st-icon';
          stBox.appendChild(icon);
        }
      });
      leftCol.appendChild(stBox);
      contentWrapper.appendChild(leftCol);

      // Right side: two lines
      const rightCol = document.createElement('div');
      rightCol.className = 'deck-right';

      // Top line: Player name
      const nameEl = document.createElement('div');
      nameEl.className = 'deck-name';
      nameEl.textContent = `${card['First Name'] || ''} ${card['Second Name'] || ''}`.trim();
      rightCol.appendChild(nameEl);

      // Bottom line: Position + DEF/SKL/ATK
      const bottomLine = document.createElement('div');
      bottomLine.className = 'deck-bottom-line';

      const posEl = document.createElement('span');
      posEl.className = 'deck-pos';
      posEl.textContent = POSITION_LABELS[card['Position']] || '?';
      bottomLine.appendChild(posEl);

      const statsEl = document.createElement('span');
      statsEl.className = 'deck-stats-compact';
      statsEl.innerHTML = `<span class="ds-def">${card['Defence'] || '0'}</span><span class="ds-skl">${card['Skill'] || '0'}</span><span class="ds-atk">${card['Attack'] || '0'}</span>`;
      bottomLine.appendChild(statsEl);

      rightCol.appendChild(bottomLine);
      contentWrapper.appendChild(rightCol);
      row.appendChild(contentWrapper);

      // Warning icon for violations
      if (violations && violations.length > 0) {
        const warn = document.createElement('span');
        warn.className = 'deck-violation-icon';
        warn.textContent = '\u26A0';
        row.appendChild(warn);
      }

      // Parallel badge (right side)
      const parallel = card['Parallel'] || 'Base';
      if (parallel !== 'Base') {
        const badge = document.createElement('span');
        badge.className = 'deck-parallel';
        badge.textContent = parallel;
        row.appendChild(badge);
      }

      // Click to remove
      row.addEventListener('click', () => removeFromDeck(i));

      // Hover preview
      row.addEventListener('mouseenter', () => showDeckPreview(card, row));
      row.addEventListener('mouseleave', hideDeckPreview);

      return row;
  }

  // --- Deck hover preview ---

  let previewEl = null;

  function showDeckPreview(card, rowEl) {
    hideDeckPreview();
    previewEl = buildCardElement(card, true);
    previewEl.classList.add('deck-preview');

    // Position to the left of the deck panel
    document.body.appendChild(previewEl);
    const rowRect = rowEl.getBoundingClientRect();
    const previewRect = previewEl.getBoundingClientRect();
    previewEl.style.top = `${Math.max(8, Math.min(rowRect.top, window.innerHeight - previewRect.height - 8))}px`;
    previewEl.style.left = `${rowRect.left - previewRect.width - 8}px`;
  }

  function hideDeckPreview() {
    if (previewEl) {
      previewEl.remove();
      previewEl = null;
    }
  }

  // ============================================================
  // DECK STATS
  // Bar charts and stat lists rendered below the card list.
  // ============================================================

  function renderDeckStats() {

    const CHART_TITLES = {
      'energy': 'Energy',
      'skill-flip': 'Skill Flip',
      'skill-type': 'Skill Types',
      'attack': 'Attack',
      'defence': 'Defence',
      'position': 'Position',
      'player-stack': 'Player Stack (Top 5)',
      'set': 'Set (Top 5)',
      'club': 'Club (Top 5)',
      'ability': 'Ability (Top 5)',
      'parallels': 'Parallels',
    };

    document.querySelectorAll('.deck-chart').forEach(chartEl => {
      const selector = chartEl.querySelector('.chart-selector');
      const container = chartEl.querySelector('.bar-chart');
      const title = chartEl.querySelector('h4');
      const chartType = selector.value;

      title.textContent = CHART_TITLES[chartType] || chartType;

      switch (chartType) {
        case 'energy': {
          const counts = {};
          for (let i = 0; i <= 5; i++) counts[i] = 0;
          deck.forEach(c => { counts[Number(c['Energy'] || 0)]++; });
          renderBarChart(container, counts, '#b8860b');
          break;
        }
        case 'skill-type': {
          const counts = { Speed: 0, Accuracy: 0, Control: 0, Leadership: 0, Strength: 0 };
          deck.forEach(c => {
            if (c['Skill Type #1'] && counts[c['Skill Type #1']] != null) counts[c['Skill Type #1']]++;
            if (c['Skill Type #2'] && counts[c['Skill Type #2']] != null) counts[c['Skill Type #2']]++;
          });
          renderBarChart(container, counts, null, {
            Speed: '#e94560', Accuracy: '#40916c', Control: '#4a90d9', Strength: '#f0c040', Leadership: '#9b59b6'
          });
          break;
        }
        case 'skill-flip': {
          const counts = {};
          for (let i = 0; i <= 7; i++) counts[i] = 0;
          deck.forEach(c => { counts[Number(c['Skill'] || 0)]++; });
          renderBarChart(container, counts, '#d4a843');
          break;
        }
        case 'attack': {
          const counts = {};
          for (let i = 0; i <= 10; i++) counts[i] = 0;
          deck.forEach(c => { counts[Number(c['Attack'] || 0)]++; });
          renderBarChart(container, counts, '#c0392b');
          break;
        }
        case 'defence': {
          const counts = {};
          for (let i = 0; i <= 10; i++) counts[i] = 0;
          deck.forEach(c => { counts[Number(c['Defence'] || 0)]++; });
          renderBarChart(container, counts, '#2a6db5');
          break;
        }
        case 'position': {
          const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
          const posMap = { Goalkeeper: 'GK', Defender: 'DEF', Midfielder: 'MID', Forward: 'FWD' };
          deck.forEach(c => { const p = posMap[c['Position']]; if (p) counts[p]++; });
          renderBarChart(container, counts, '#555');
          break;
        }
        case 'player-stack': {
          const counts = {};
          deck.forEach(c => {
            const name = `${c['First Name'] || ''} ${c['Second Name'] || ''}`.trim();
            counts[name] = (counts[name] || 0) + 1;
          });
          const filtered = Object.entries(counts).filter(([, v]) => v >= 2).sort((a, b) => b[1] - a[1]).slice(0, 5);
          renderListStat(container, filtered, 'No player stacks.');
          break;
        }
        case 'set': {
          const counts = {};
          deck.forEach(c => {
            const key = [c['License'], c['Set']].filter(Boolean).join(' ');
            counts[key] = (counts[key] || 0) + 1;
          });
          const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
          renderListStat(container, sorted);
          break;
        }
        case 'club': {
          const counts = {};
          deck.forEach(c => { const club = c['Club']; if (club) counts[club] = (counts[club] || 0) + 1; });
          const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
          renderListStat(container, sorted);
          break;
        }
        case 'ability': {
          const counts = {};
          deck.forEach(c => {
            [c['Ability 1 Title'], c['Ability 2 Title']].forEach(a => {
              if (a && a !== 'N/A') counts[a] = (counts[a] || 0) + 1;
            });
          });
          const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
          renderListStat(container, sorted);
          break;
        }
        case 'parallels': {
          const counts = { 'Base': 0, '\u03B1/\u03B1': 0, '#/77': 0, '#/66': 0, '#/44': 0, '#/11': 0, '\u03A9/\u03A9': 0 };
          deck.forEach(c => { const p = c['Parallel'] || 'Base'; if (counts[p] != null) counts[p]++; });
          renderBarChart(container, counts, '#e94560');
          break;
        }
      }
    });
  }

  function renderListStat(container, entries, emptyMsg) {
    container.innerHTML = '';
    container.style.height = 'auto';
    container.style.borderLeft = 'none';
    container.style.borderBottom = 'none';

    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'stat-list-empty';
      empty.textContent = emptyMsg || 'No data.';
      container.appendChild(empty);
      return;
    }

    const list = document.createElement('div');
    list.className = 'stat-list';
    entries.forEach(([label, count]) => {
      const row = document.createElement('div');
      row.className = 'stat-list-row';
      row.innerHTML = `<span class="stat-list-label">${escapeHtml(label)}</span><span class="stat-list-count">${count}</span>`;
      list.appendChild(row);
    });
    container.appendChild(list);
  }

  function renderBarChart(container, data, defaultColor, colorMap) {
    container.innerHTML = '';
    container.style.height = '';
    container.style.borderLeft = '';
    container.style.borderBottom = '';
    const entries = Object.entries(data);
    const maxVal = Math.max(...entries.map(([, v]) => v), 1);

    entries.forEach(([label, count]) => {
      const bar = document.createElement('div');
      bar.className = 'bar-item';

      const val = document.createElement('span');
      val.className = 'bar-value';
      val.textContent = count || '';
      bar.appendChild(val);

      const fill = document.createElement('div');
      fill.className = 'bar-fill';
      fill.style.height = `${(count / maxVal) * 100}%`;
      fill.style.background = (colorMap && colorMap[label]) || defaultColor || '#4a90d9';
      bar.appendChild(fill);

      const lbl = document.createElement('span');
      lbl.className = 'bar-label';
      lbl.textContent = label;
      bar.appendChild(lbl);

      container.appendChild(bar);
    });
  }


  // ============================================================
  // SESSION STATE PERSISTENCE
  // Saves deck, filters, and rule to sessionStorage on change.
  // Restores on page load (after cards are loaded).
  // ============================================================

  const SESSION_KEY = 'ttf_deckbuilder_state';

  function saveSessionState() {
    try {
      const state = {
        deck: encodeDeck(),
        filters: activeFilters,
        rule: (poolActive || activeRules.length > 0)
          ? { pool: { s: cardPool.sets, t: cardPool.skillTypes, c: cardPool.clubs, a: cardPool.abilities }, rules: activeRules }
          : null,
        ruleDesc: poolDescription,
        ruleDetails: ruleDetails,
        ownedOnly: ownedOnly,
        ownedCollectionId: ownedCollectionId,
      };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
    } catch (e) { /* ignore quota errors */ }
  }

  function restoreSessionState() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const state = JSON.parse(raw);

      // Restore rule/pool
      if (state.rule) {
        const decoded = state.rule;
        if (decoded.pool) {
          cardPool = {
            sets: decoded.pool.s || null,
            skillTypes: decoded.pool.t || null,
            clubs: decoded.pool.c || null,
            abilities: decoded.pool.a || null,
          };
          poolActive = !!(cardPool.sets || cardPool.skillTypes || cardPool.clubs || cardPool.abilities);
        }
        activeRules = decoded.rules || [];
        poolDescription = state.ruleDesc || '';
        ruleDetails = state.ruleDetails || '';
        updateRuleBanner();
      }

      // Restore filters
      if (state.filters) {
        activeFilters = state.filters;
        // Update filter UI to match restored state
        restoreFilterUI();
      }

      // Restore owned-cards filter (collections load async via auth listener;
      // updateOwnedUI/populateOwnedCollectionDropdown reconcile once loaded)
      ownedOnly = !!state.ownedOnly;
      ownedCollectionId = state.ownedCollectionId || null;
      populateOwnedCollectionDropdown();
      updateOwnedUI();

      // Restore deck
      if (state.deck) {
        importDeckFromCode(state.deck);
      }
    } catch (e) {
      console.warn('Failed to restore session state:', e);
    }
  }

  /** Restore filter UI controls to match activeFilters state */
  function restoreFilterUI() {
    // Restore multiselect/pills/tristate controls
    for (const col of Object.keys(activeFilters)) {
      const filter = activeFilters[col];
      if (!filter) continue;

      if (col === 'Parallel') {
        // Restore parallel pills
        filtersContainer.querySelectorAll('.tristate-item').forEach(item => {
          if (item.closest('.filter-section')?.querySelector('.filter-section-title')?.textContent === 'Parallels') {
            item.dataset.state = filter.values && filter.values.includes(item.dataset.value) ? 'include' : 'none';
          }
        });
        continue;
      }

      const def = FILTERS.find(f => f.column === col);
      if (!def) continue;

      if (filter.type === 'multiselect' && (def.type === 'multiselect' || def.type === 'pills')) {
        const wrapper = filtersContainer.querySelector(`[data-column="${col}"]`);
        if (wrapper && def.type === 'multiselect') {
          wrapper.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.checked = filter.values.includes(cb.value);
          });
          const toggle = wrapper.querySelector('.multiselect-toggle');
          if (toggle) {
            toggle.textContent = filter.values.length <= 2 ? filter.values.join(', ') : `${filter.values.length} selected`;
          }
        } else if (wrapper && def.type === 'pills') {
          wrapper.querySelectorAll('.tristate-item').forEach(item => {
            item.dataset.state = filter.values.includes(item.dataset.value) ? 'include' : 'none';
          });
        }
      } else if (filter.type === 'tristate') {
        const wrapper = filtersContainer.querySelector(`[data-column="${col}"]`);
        if (wrapper) {
          wrapper.querySelectorAll('.tristate-item').forEach(item => {
            if (filter.include && filter.include.includes(item.dataset.value)) item.dataset.state = 'include';
            else if (filter.exclude && filter.exclude.includes(item.dataset.value)) item.dataset.state = 'exclude';
            else item.dataset.state = 'none';
          });
        }
      } else if (filter.type === 'text') {
        const input = filtersContainer.querySelector(`input[data-column="${col}"]`);
        if (input) input.value = filter.value || '';
      } else if (filter.type === 'exact') {
        const select = filtersContainer.querySelector(`select[data-column="${col}"]`);
        if (select) select.value = filter.value || '';
      } else if (filter.type === 'compare') {
        const wrapper = filtersContainer.querySelector(`select[data-column="${col}"][data-filter-type="compare-op"]`);
        if (wrapper) {
          wrapper.value = filter.op || '';
          const numInput = wrapper.parentElement.querySelector('[data-filter-type="compare-val"]');
          if (numInput) numInput.value = filter.value ?? '';
        }
      }
    }
  }

})();
