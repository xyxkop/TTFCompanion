/**
 * TTF Companion - Collection Tracker (ES module)
 * Track owned cards across physical and digital collections.
 */
import * as Parallels from '../shared/parallels.js';
import { escapeHtml, normalize } from '../shared/util.js';
import { loadSetsConfig, setConfigs, getSetColor } from '../shared/sets.js';
import { loadCards } from '../shared/data.js';
import { currentUser, db, onAuthStateChange } from '../shared/firebase.js';

  // Column lists per collection type (shared canonical sets).
  const DIGITAL_PARALLELS = Parallels.DIGITAL_WITH_BASE;
  const PHYSICAL_PARALLELS = Parallels.PHYSICAL_STANDARD;

  const MAX_COLLECTIONS = 3;

  // ============================================================
  // STATE
  // ============================================================

  let allCards = [];
  let userCollections = []; // Array of { id, name, type }
  let activeCollection = null; // { id, name, type, cards: { cardNum: [parallels] } }
  let filteredRows = [];

  // ============================================================
  // DOM REFS
  // ============================================================

  const authGate = document.getElementById('auth-gate');
  const collectionsView = document.getElementById('collections-view');
  const collectionsList = document.getElementById('collections-list');
  const createBtn = document.getElementById('create-collection-btn');
  const editorView = document.getElementById('collection-editor');
  const editorName = document.getElementById('collection-name');
  const editorStats = document.getElementById('collection-stats');
  const backBtn = document.getElementById('back-to-list-btn');
  const cardSearch = document.getElementById('card-search');
  const setFilter = document.getElementById('set-filter');
  const bulkOwnBtn = document.getElementById('bulk-own-btn');
  const cardRows = document.getElementById('card-rows');
  const wantListSelect = document.getElementById('want-list-select');
  const addWantListBtn = document.getElementById('add-want-list-btn');
  const deleteWantListBtn = document.getElementById('delete-want-list-btn');
  const setCompletion = document.getElementById('set-completion');
  const completionDesc = document.getElementById('completion-desc');
  const completionText = document.getElementById('completion-text');
  const completionFill = document.getElementById('completion-fill');

  // ============================================================
  // INITIALIZATION
  // ============================================================

  createBtn.addEventListener('click', showCreateModal);
  backBtn.addEventListener('click', closeEditor);
  cardSearch.addEventListener('input', renderCardRows);
  setFilter.addEventListener('change', () => { renderCardRows(); updateCompletion(); });
  bulkOwnBtn.addEventListener('click', bulkOwnBase);
  document.getElementById('highlight-wishlist-cb').addEventListener('change', renderCardRows);
  wantListSelect.addEventListener('change', () => {
    deleteWantListBtn.classList.toggle('hidden', !wantListSelect.value);
    document.getElementById('search-filters').style.display = wantListSelect.value ? 'none' : '';
    renderCardRows();
    updateCompletion();
  });
  addWantListBtn.addEventListener('click', showAddWantListModal);
  deleteWantListBtn.addEventListener('click', deleteActiveWantList);

  // Load cards then wait for auth
  let dataReady = loadData();

  async function loadData() {
    try {
      await loadSetsConfig();
      allCards = await loadCards();
    } catch (err) {
      console.error('Failed to load cards:', err);
    }
  }

  // Auth state listener
  onAuthStateChange((user) => {
    if (user) {
      authGate.classList.add('hidden');
      collectionsView.classList.remove('hidden');
      loadCollectionsList();
      // Auto-open collection from URL hash
      const hash = window.location.hash.slice(1);
      if (hash) openCollection(hash);
    } else {
      authGate.classList.remove('hidden');
      collectionsView.classList.add('hidden');
      editorView.classList.add('hidden');
      userCollections = [];
      activeCollection = null;
    }
  });

  // ============================================================
  // COLLECTIONS LIST
  // ============================================================

  async function loadCollectionsList() {
    collectionsList.innerHTML = '<p style="color:#888;font-size:0.85rem;">Loading collections...</p>';
    createBtn.style.display = 'none';
    try {
      const snapshot = await db.collection('users').doc(currentUser.uid)
        .collection('collections').get();
      userCollections = [];
      snapshot.forEach(doc => {
        userCollections.push({ id: doc.id, ...doc.data() });
      });
      renderCollectionsList();
    } catch (err) {
      console.error('Failed to load collections:', err);
      collectionsList.innerHTML = '<p style="color:#c00;font-size:0.85rem;">Failed to load collections.</p>';
      createBtn.style.display = '';
    }
  }

  function renderCollectionsList() {
    collectionsList.innerHTML = '';
    if (userCollections.length === 0) {
      collectionsList.innerHTML = '<p style="color:#888;font-size:0.85rem;">No collections yet. Create one to start tracking!</p>';
      createBtn.style.display = '';
      return;
    }
    userCollections.forEach(col => {
      const card = document.createElement('div');
      card.className = 'collection-card';

      const info = document.createElement('div');
      info.className = 'collection-card-info';
      info.innerHTML = `<div class="collection-card-name">${escapeHtml(col.name)}</div>
        <div class="collection-card-meta">${countOwnedCards(col.cards || {})} cards owned</div>`;
      info.addEventListener('click', () => openCollection(col.id));
      card.appendChild(info);

      const badge = document.createElement('span');
      badge.className = `collection-card-type ${col.type}`;
      badge.textContent = col.type;
      card.appendChild(badge);

      const delBtn = document.createElement('button');
      delBtn.className = 'collection-delete-btn';
      delBtn.textContent = '\u2715';
      delBtn.title = 'Delete collection';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteCollection(col.id, col.name);
      });
      card.appendChild(delBtn);

      collectionsList.appendChild(card);
    });

    // Hide create button if at max
    if (userCollections.length >= MAX_COLLECTIONS) {
      createBtn.style.display = 'none';
      const limitMsg = document.createElement('p');
      limitMsg.style.cssText = 'color:#888;font-size:0.8rem;margin-top:0.5rem;';
      limitMsg.textContent = `Maximum ${MAX_COLLECTIONS} collections reached.`;
      collectionsList.appendChild(limitMsg);
    } else {
      createBtn.style.display = '';
    }
  }

  function countOwnedCards(cards) {
    let count = 0;
    for (const parallels of Object.values(cards)) {
      count += parallels.length;
    }
    return count;
  }

  // ============================================================
  // CREATE COLLECTION
  // ============================================================

  function showCreateModal() {
    if (userCollections.length >= MAX_COLLECTIONS) return;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <h3>New Collection</h3>
      <label>Name</label>
      <input type="text" id="new-col-name" maxlength="32" placeholder="e.g. My Digital Cards">
      <label>Type</label>
      <select id="new-col-type">
        <option value="digital">Digital</option>
        <option value="physical">Physical</option>
      </select>
      <div class="modal-actions">
        <button class="modal-btn-secondary" id="cancel-create">Cancel</button>
        <button class="modal-btn-primary" id="confirm-create">Create</button>
      </div>`;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    modal.querySelector('#cancel-create').addEventListener('click', () => overlay.remove());
    modal.querySelector('#confirm-create').addEventListener('click', async () => {
      const name = modal.querySelector('#new-col-name').value.trim();
      const type = modal.querySelector('#new-col-type').value;
      if (!name) { modal.querySelector('#new-col-name').focus(); return; }

      const btn = modal.querySelector('#confirm-create');
      btn.disabled = true;
      btn.textContent = 'Creating...';

      try {
        await db.collection('users').doc(currentUser.uid)
          .collection('collections').add({
            name,
            type,
            cards: {},
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          });
        overlay.remove();
        await loadCollectionsList();
      } catch (err) {
        console.error('Failed to create collection:', err);
        btn.disabled = false;
        btn.textContent = 'Create';
        alert('Failed to create collection. Check that Firestore rules are updated.');
      }
    });
  }

  // ============================================================
  // OPEN / CLOSE COLLECTION
  // ============================================================

  async function openCollection(id) {
    try {
      await dataReady;
      const doc = await db.collection('users').doc(currentUser.uid)
        .collection('collections').doc(id).get();
      if (!doc.exists) return;
      activeCollection = { id, ...doc.data() };
      collectionsView.classList.add('hidden');
      editorView.classList.remove('hidden');
      editorName.textContent = activeCollection.name;
      history.replaceState(null, '', `#${id}`);

      // Show/hide type-specific UI
      const isPhysical = activeCollection.type === 'physical';
      bulkOwnBtn.style.display = isPhysical ? 'none' : '';
      document.getElementById('want-list-section').style.display = isPhysical ? '' : 'none';
      document.getElementById('highlight-wishlist-toggle').classList.toggle('hidden', !isPhysical);

      populateSetFilter();
      populateWantListSelect();
      renderCardRows();
      updateStats();
      updateCompletion();
    } catch (err) {
      console.error('Failed to open collection:', err);
    }
  }

  function closeEditor() {
    editorView.classList.add('hidden');
    collectionsView.classList.remove('hidden');
    activeCollection = null;
    history.replaceState(null, '', window.location.pathname);
    loadCollectionsList();
  }

  async function deleteCollection(id, name) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await db.collection('users').doc(currentUser.uid)
        .collection('collections').doc(id).delete();
      await loadCollectionsList();
    } catch (err) {
      console.error('Failed to delete collection:', err);
    }
  }

  // ============================================================
  // CARD LIST RENDERING
  // ============================================================

  function populateSetFilter() {
    setFilter.innerHTML = '<option value="">All Sets</option>';
    const sets = new Set();
    allCards.forEach(c => { if (c['Set']) sets.add(`${c['Set']} (${c['License'] || ''})`); });
    [...sets].sort().forEach(s => {
      setFilter.appendChild(new Option(s, s));
    });
  }

  function renderCardRows() {
    if (!activeCollection || allCards.length === 0) return;

    const searchQ = normalize(cardSearch.value);
    const setVal = setFilter.value;
    const activeWantList = getActiveWantList();
    const parallels = activeCollection.type === 'digital' ? DIGITAL_PARALLELS : PHYSICAL_PARALLELS;

    // Render header parallel columns
    const headerRow = document.getElementById('card-list-header-row');
    // Remove old parallel headers (keep first 4 children: #, Set, Player, Club)
    while (headerRow.children.length > 4) headerRow.removeChild(headerRow.lastChild);
    parallels.forEach(p => {
      const span = document.createElement('span');
      span.className = 'parallel-header';
      span.textContent = p === 'Base' ? 'Base' : p;
      headerRow.appendChild(span);
    });

    cardRows.innerHTML = '';

    allCards.forEach(card => {
      if (card['Parallel'] && card['Parallel'] !== 'Base') return;

      if (setVal) {
        const cardSetLicense = `${card['Set'] || ''} (${card['License'] || ''})`;
        if (cardSetLicense !== setVal) return;
      }

      if (searchQ) {
        const name = normalize(`${card['First Name'] || ''} ${card['Second Name'] || ''}`);
        if (!name.includes(searchQ)) return;
      }

      // Want list filter
      if (activeWantList) {
        if (!cardMatchesWantList(card, activeWantList)) return;
      }

      const cardNum = card['Card #'];
      const owned = activeCollection.cards[cardNum] || [];
      const availableParallels = getAvailableParallels(card);

      const row = document.createElement('div');
      row.className = 'card-row';

      const setName = card['Set'] || '';
      const setColor = getSetColor(setName);
      const numInner = setColor
        ? `<span style="background:${setColor.bg};color:${setColor.text};border-radius:3px;padding:0.1rem 0.3rem;display:inline-block;">${escapeHtml(cardNum)}</span>`
        : escapeHtml(cardNum);

      // Rookie / Legend tag next to player name
      const cardType = (card['Card Type'] || '').trim().toLowerCase();
      let typeTag = '';
      if (cardType === 'rookie') typeTag = '<span class="card-type-tag card-type-rookie">RC</span>';
      else if (cardType === 'legend') typeTag = '<span class="card-type-tag card-type-legend">L</span>';

      const playerName = `${card['First Name'] || ''} ${card['Second Name'] || ''}`.trim();

      row.innerHTML = `
        <span class="col-num">${numInner}</span>
        <span class="col-set">${escapeHtml(setName)}</span>
        <span class="col-name" title="${escapeHtml(playerName)}"><span class="col-name-text">${escapeHtml(playerName)}</span>${typeTag}</span>
        <span class="col-club">${escapeHtml(card['Club'] || '')}</span>
      `;

      // One cell per parallel column
      // Determine which parallels are tracked by the active want list
      const wantListParallels = activeWantList
        ? (activeWantList.parallels[0] === '*' ? null : activeWantList.parallels)
        : null;

      // When no wishlist active, check if this card+parallel is in any wishlist
      const highlightWished = document.getElementById('highlight-wishlist-cb').checked;
      const wishedParallels = (!activeWantList && highlightWished) ? getWishedParallels(card) : null;

      parallels.forEach(p => {
        const cell = document.createElement('span');
        cell.className = 'parallel-cell';

        const excluded = wantListParallels && !wantListParallels.includes(p);

        if (excluded) {
          cell.classList.add('parallel-excluded');
        } else if (availableParallels.includes(p)) {
          // Highlight if this parallel is in any wishlist
          if (wishedParallels && wishedParallels.has(p)) {
            cell.classList.add('parallel-wished');
          }
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = owned.includes(p);
          cb.addEventListener('change', () => {
            toggleOwnership(cardNum, p, cb.checked);
            updateStats();
            updateCompletion();
          });
          cell.appendChild(cb);
        } else {
          cell.classList.add('unavailable');
        }

        row.appendChild(cell);
      });

      cardRows.appendChild(row);
    });
  }

  /** Determine which parallels are available for a card based on set config */
  function getAvailableParallels(card) {
    const config = setConfigs[card['Set']];
    return activeCollection.type === 'digital'
      ? Parallels.digitalParallelsFor(config, card['Card #'])
      : Parallels.physicalParallelsFor(config, card['Card #']);
  }

  // ============================================================
  // OWNERSHIP TOGGLE & PERSISTENCE
  // ============================================================

  let saveTimer = null;

  function toggleOwnership(cardNum, parallel, owned) {
    if (!activeCollection) return;
    if (!activeCollection.cards[cardNum]) activeCollection.cards[cardNum] = [];

    const arr = activeCollection.cards[cardNum];
    if (owned && !arr.includes(parallel)) {
      arr.push(parallel);
    } else if (!owned) {
      activeCollection.cards[cardNum] = arr.filter(p => p !== parallel);
      if (activeCollection.cards[cardNum].length === 0) {
        delete activeCollection.cards[cardNum];
      }
    }

    // Debounced save
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveCollection, 2000);
  }

  async function saveCollection() {
    if (!activeCollection || !currentUser) return;
    try {
      await db.collection('users').doc(currentUser.uid)
        .collection('collections').doc(activeCollection.id)
        .update({ cards: activeCollection.cards });
    } catch (err) {
      console.error('Failed to save collection:', err);
    }
  }

  // ============================================================
  // BULK ACTIONS
  // ============================================================

  function bulkOwnBase() {
    if (!activeCollection || allCards.length === 0) return;

    const setVal = setFilter.value;
    if (!setVal) {
      alert('Select a set first to bulk-own Base cards.');
      return;
    }

    let count = 0;
    allCards.forEach(card => {
      if (card['Parallel'] && card['Parallel'] !== 'Base') return;
      const cardSetLicense = `${card['Set'] || ''} (${card['License'] || ''})`;
      if (cardSetLicense !== setVal) return;

      const cardNum = card['Card #'];
      if (!activeCollection.cards[cardNum]) activeCollection.cards[cardNum] = [];
      if (!activeCollection.cards[cardNum].includes('Base')) {
        activeCollection.cards[cardNum].push('Base');
        count++;
      }
    });

    if (count > 0) {
      renderCardRows();
      updateStats();
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(saveCollection, 2000);
    }
    alert(`Marked ${count} Base cards as owned.`);
  }

  // ============================================================
  // WISHLISTS
  // ============================================================

  const MAX_WANT_LISTS = 50;

  function getActiveWantList() {
    if (!activeCollection || !wantListSelect.value) return null;
    const wantLists = activeCollection.wantLists || [];
    return wantLists.find(w => w.name === wantListSelect.value) || null;
  }

  function cardMatchesWantList(card, wl) {
    const playerName = `${card['First Name'] || ''} ${card['Second Name'] || ''}`.trim();
    switch (wl.type) {
      case 'club': return (card['Club'] || '') === wl.value;
      case 'player': return playerName === wl.value;
      case 'set': return `${card['Set'] || ''} (${card['License'] || ''})` === wl.value;
      default: return true;
    }
  }

  /** Get set of parallels that are wished for this card across all wishlists */
  function getWishedParallels(card) {
    const wantLists = activeCollection.wantLists || [];
    if (wantLists.length === 0) return null;
    const allParallels = activeCollection.type === 'digital' ? DIGITAL_PARALLELS : PHYSICAL_PARALLELS;
    const wished = new Set();
    wantLists.forEach(wl => {
      if (!cardMatchesWantList(card, wl)) return;
      const targets = wl.parallels[0] === '*' ? allParallels : wl.parallels;
      targets.forEach(p => wished.add(p));
    });
    return wished.size > 0 ? wished : null;
  }

  function populateWantListSelect() {
    wantListSelect.innerHTML = '<option value="">None</option>';
    const wantLists = activeCollection.wantLists || [];
    wantLists.forEach(wl => {
      wantListSelect.appendChild(new Option(wl.name, wl.name));
    });
    deleteWantListBtn.classList.add('hidden');
  }

  function showAddWantListModal() {
    if (!activeCollection) return;
    const wantLists = activeCollection.wantLists || [];
    if (wantLists.length >= MAX_WANT_LISTS) {
      alert(`Maximum ${MAX_WANT_LISTS} wishlists.`);
      return;
    }

    const parallels = activeCollection.type === 'digital' ? DIGITAL_PARALLELS : PHYSICAL_PARALLELS;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <h3>New Wishlist</h3>
      <label>Type</label>
      <select id="wl-type">
        <option value="club">Club</option>
        <option value="player">Player</option>
        <option value="set">Set</option>
      </select>
      <label>Value</label>
      <div id="wl-value-wrapper" class="wl-search-dropdown">
        <button type="button" id="wl-value-btn" class="wl-value-btn">Select...</button>
        <div id="wl-value-dropdown" class="wl-value-dropdown hidden">
          <input type="text" id="wl-value-search" placeholder="Search..." autocomplete="off">
          <div id="wl-value-list" class="wl-value-list"></div>
        </div>
      </div>
      <input type="hidden" id="wl-value-selected">
      <label>Parallels</label>
      <div id="wl-parallels" style="margin-bottom:0.75rem;">
        <label style="display:inline-flex;align-items:center;gap:0.3rem;font-size:0.8rem;cursor:pointer;white-space:nowrap;margin:0;">
          <input type="checkbox" id="wl-specific-parallels" style="margin:0;"> Include only specific parallels
        </label>
      </div>
      <div id="wl-parallel-list" class="hidden" style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-top:0.3rem;"></div>
      <label>Name <span style="font-weight:400;color:#888;">(optional)</span></label>
      <input type="text" id="wl-custom-name" maxlength="32" placeholder="">
      <div class="modal-actions">
        <button class="modal-btn-secondary" id="wl-cancel">Cancel</button>
        <button class="modal-btn-primary" id="wl-confirm">Create</button>
      </div>`;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const typeSelect = modal.querySelector('#wl-type');
    const valueBtn = modal.querySelector('#wl-value-btn');
    const valueDropdown = modal.querySelector('#wl-value-dropdown');
    const valueSearch = modal.querySelector('#wl-value-search');
    const valueList = modal.querySelector('#wl-value-list');
    const valueSelected = modal.querySelector('#wl-value-selected');
    const specificCb = modal.querySelector('#wl-specific-parallels');
    const parallelList = modal.querySelector('#wl-parallel-list');
    const customNameInput = modal.querySelector('#wl-custom-name');

    // Populate parallel checkboxes
    parallels.forEach(p => {
      const lbl = document.createElement('label');
      lbl.style.cssText = 'display:inline-flex;align-items:center;gap:0.2rem;font-size:0.75rem;cursor:pointer;';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = p;
      cb.checked = true;
      lbl.appendChild(cb);
      lbl.appendChild(document.createTextNode(p));
      parallelList.appendChild(lbl);
    });

    // "Specific parallels" toggle
    specificCb.addEventListener('change', () => {
      parallelList.classList.toggle('hidden', !specificCb.checked);
      parallelList.style.display = specificCb.checked ? 'flex' : '';
    });

    function populateValues(type) {
      valueList.innerHTML = '';
      valueBtn.textContent = 'Select...';
      valueSelected.value = '';
      const values = new Set();
      allCards.forEach(c => {
        if (c['Parallel'] && c['Parallel'] !== 'Base') return;
        if (type === 'club' && c['Club']) values.add(c['Club']);
        else if (type === 'player') {
          const name = `${c['First Name'] || ''} ${c['Second Name'] || ''}`.trim();
          if (name) values.add(name);
        } else if (type === 'set' && c['Set']) {
          values.add(`${c['Set']} (${c['License'] || ''})`);
        }
      });
      [...values].sort().forEach(v => {
        const opt = document.createElement('div');
        opt.className = 'wl-value-option';
        opt.textContent = v;
        opt.addEventListener('click', () => {
          valueSelected.value = v;
          valueBtn.textContent = v;
          valueDropdown.classList.add('hidden');
          // Update name placeholder
          const typeLabels = { club: 'Club', player: 'Player', set: 'Set' };
          customNameInput.placeholder = `${typeLabels[typeSelect.value]}: ${v}`;
        });
        valueList.appendChild(opt);
      });
    }

    // Toggle dropdown on button click
    valueBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      valueDropdown.classList.toggle('hidden');
      if (!valueDropdown.classList.contains('hidden')) {
        valueSearch.value = '';
        valueList.querySelectorAll('.wl-value-option').forEach(o => o.style.display = '');
        valueSearch.focus();
      }
    });

    // Search filter
    valueSearch.addEventListener('input', () => {
      const q = normalize(valueSearch.value);
      valueList.querySelectorAll('.wl-value-option').forEach(opt => {
        opt.style.display = normalize(opt.textContent).includes(q) ? '' : 'none';
      });
    });
    valueSearch.addEventListener('click', e => e.stopPropagation());

    // Close dropdown on outside click
    overlay.addEventListener('click', (e) => {
      if (!modal.querySelector('#wl-value-wrapper').contains(e.target)) {
        valueDropdown.classList.add('hidden');
      }
    });

    populateValues(typeSelect.value);
    typeSelect.addEventListener('change', () => populateValues(typeSelect.value));

    modal.querySelector('#wl-cancel').addEventListener('click', () => overlay.remove());
    modal.querySelector('#wl-confirm').addEventListener('click', () => {
      const value = valueSelected.value;
      if (!value) { valueBtn.click(); return; }

      let selectedParallels;
      if (!specificCb.checked) {
        selectedParallels = ['*'];
      } else {
        selectedParallels = [...parallelList.querySelectorAll('input:checked')].map(cb => cb.value);
        if (selectedParallels.length === 0) { alert('Select at least one parallel.'); return; }
      }

      const typeLabels = { club: 'Club', player: 'Player', set: 'Set' };
      const defaultName = `${typeLabels[typeSelect.value]}: ${value}`;
      const name = customNameInput.value.trim() || defaultName;
      // Check duplicate
      const currentLists = activeCollection.wantLists || [];
      if (currentLists.some(w => w.name === name)) {
        alert('A wishlist with this name already exists.');
        return;
      }

      const wl = { name, type: typeSelect.value, value, parallels: selectedParallels };
      if (!activeCollection.wantLists) activeCollection.wantLists = [];
      activeCollection.wantLists.push(wl);

      // Update UI immediately
      overlay.remove();
      populateWantListSelect();
      wantListSelect.value = name;
      deleteWantListBtn.classList.remove('hidden');
      document.getElementById('search-filters').style.display = 'none';
      renderCardRows();
      updateCompletion();

      // Save in background
      db.collection('users').doc(currentUser.uid)
        .collection('collections').doc(activeCollection.id)
        .update({ wantLists: activeCollection.wantLists })
        .catch(err => console.error('Failed to save want list:', err));
    });
  }

  function deleteActiveWantList() {
    const name = wantListSelect.value;
    if (!name || !activeCollection) return;
    if (!confirm(`Delete wishlist "${name}"?`)) return;

    // Remove locally
    activeCollection.wantLists = (activeCollection.wantLists || []).filter(w => w.name !== name);

    // Update UI immediately
    populateWantListSelect();
    document.getElementById('search-filters').style.display = '';
    renderCardRows();
    updateCompletion();

    // Save in background
    db.collection('users').doc(currentUser.uid)
      .collection('collections').doc(activeCollection.id)
      .update({ wantLists: activeCollection.wantLists })
      .catch(err => console.error('Failed to delete want list:', err));
  }

  // ============================================================
  // STATS
  // ============================================================

  function updateStats() {
    if (!activeCollection) return;
    const total = countOwnedCards(activeCollection.cards);
    editorStats.textContent = `${total} owned`;
  }

  /** Update completion bar (shown when a want list is active) */
  function updateCompletion() {
    if (!activeCollection) return;
    const activeWantList = getActiveWantList();

    if (!activeWantList) {
      setCompletion.classList.add('hidden');
      return;
    }

    // Want list completion: count target parallels owned
    const allParallels = activeCollection.type === 'digital' ? DIGITAL_PARALLELS : PHYSICAL_PARALLELS;
    const targetParallels = activeWantList.parallels[0] === '*' ? allParallels : activeWantList.parallels;
    let total = 0, owned = 0;

    allCards.forEach(card => {
      if (card['Parallel'] && card['Parallel'] !== 'Base') return;
      if (!cardMatchesWantList(card, activeWantList)) return;

      const available = getAvailableParallels(card);
      const cardOwned = activeCollection.cards[card['Card #']] || [];

      targetParallels.forEach(p => {
        if (available.includes(p)) {
          total++;
          if (cardOwned.includes(p)) owned++;
        }
      });
    });

    if (total === 0) { setCompletion.classList.add('hidden'); return; }
    const pct = Math.round((owned / total) * 100);
    const typeLabels = { club: 'Club', player: 'Player', set: 'Set' };
    const desc = `${typeLabels[activeWantList.type]}: ${activeWantList.value}`;
    const parallelDesc = activeWantList.parallels[0] === '*' ? '' : ` (${activeWantList.parallels.join(' ')})`;
    completionDesc.textContent = `${desc}${parallelDesc}`;
    completionText.textContent = `${owned} / ${total} (${pct}%)`;
    completionFill.style.width = `${pct}%`;
    setCompletion.classList.remove('hidden');
  }

