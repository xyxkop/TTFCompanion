/**
 * TTF Companion - Firebase Module
 * Authentication (Google Sign-In) and Firestore helpers.
 * Loaded after shared.js via CDN scripts (no bundler needed).
 */

// ============================================================
// FIREBASE CONFIG & INIT
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyDh639YIRjwi89kJ9kEV4AAQpk_VJ6ZrDo",
  authDomain: "ttfcompanion.firebaseapp.com",
  projectId: "ttfcompanion",
  storageBucket: "ttfcompanion.firebasestorage.app",
  messagingSenderId: "235653566294",
  appId: "1:235653566294:web:d165c24bf8030e39d210f7",
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

// ============================================================
// AUTH STATE
// ============================================================

let currentUser = null;
const authStateListeners = [];

/**
 * Register a callback to be notified when auth state changes.
 * Callback receives (user) where user is null if signed out.
 */
function onAuthStateChange(callback) {
  authStateListeners.push(callback);
  // Immediately call with current state if already resolved
  if (currentUser !== undefined) callback(currentUser);
}

auth.onAuthStateChanged((user) => {
  currentUser = user || null;
  authStateListeners.forEach(cb => cb(currentUser));
  renderAuthUI();
});

// ============================================================
// SIGN IN / SIGN OUT
// ============================================================

async function signInWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    await auth.signInWithPopup(provider);
  } catch (err) {
    if (err.code !== 'auth/popup-closed-by-user') {
      console.error('Sign-in error:', err);
    }
  }
}

async function signOut() {
  try {
    clearDecksCache();
    await auth.signOut();
  } catch (err) {
    console.error('Sign-out error:', err);
  }
}

// ============================================================
// AUTH UI RENDERING
// ============================================================

function renderAuthUI() {
  const container = document.getElementById('auth-container');
  if (!container) return;

  if (currentUser) {
    const photo = currentUser.photoURL
      ? `<img class="auth-avatar" src="${currentUser.photoURL}" alt="" referrerpolicy="no-referrer">`
      : '';
    const name = currentUser.displayName || currentUser.email || 'User';
    container.innerHTML = `
      <div class="auth-signed-in">
        ${photo}
        <span class="auth-name">${escapeHtml(name)}</span>
        <button class="auth-btn auth-btn-out" id="sign-out-btn">Sign Out</button>
      </div>
    `;
    document.getElementById('sign-out-btn').addEventListener('click', signOut);
  } else {
    container.innerHTML = `
      <button class="auth-btn auth-btn-in" id="sign-in-btn">
        <svg class="auth-google-icon" viewBox="0 0 24 24" width="16" height="16">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Sign In
      </button>
    `;
    document.getElementById('sign-in-btn').addEventListener('click', signInWithGoogle);
  }
}

// ============================================================
// FIRESTORE: USER COLLECTION DATA
// ============================================================

/**
 * Load the current user's card collection from Firestore.
 * Returns an object like: { "CARD#": ["Base", "#/77", ...], ... }
 * Returns null if not signed in or no data exists.
 */
async function loadUserCollection() {
  if (!currentUser) return null;
  try {
    const doc = await db.collection('users').doc(currentUser.uid).get();
    if (doc.exists) {
      return doc.data().collection || {};
    }
    return {};
  } catch (err) {
    console.error('Failed to load collection:', err);
    return null;
  }
}

/**
 * Load all of the current user's collections from the
 * users/{uid}/collections subcollection.
 * Returns an array of { id, name, type, cards, wantLists, ... }.
 * Returns [] if not signed in or on error.
 */
async function loadUserCollections() {
  if (!currentUser) return [];
  try {
    const snapshot = await db.collection('users').doc(currentUser.uid)
      .collection('collections').get();
    const cols = [];
    snapshot.forEach(doc => cols.push({ id: doc.id, ...doc.data() }));
    return cols;
  } catch (err) {
    console.error('Failed to load collections:', err);
    return [];
  }
}

/**
 * Save the user's card collection to Firestore.
 * Uses merge to avoid overwriting other user fields.
 * Debounced externally - call this after your debounce timer fires.
 */
async function saveUserCollection(collectionData) {
  if (!currentUser) return false;
  try {
    await db.collection('users').doc(currentUser.uid).set(
      { collection: collectionData, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
    return true;
  } catch (err) {
    console.error('Failed to save collection:', err);
    return false;
  }
}

// ============================================================
// DEBOUNCE HELPER FOR WRITES
// ============================================================

let _saveTimer = null;
let _pendingCollection = null;

/**
 * Queue a collection save. Debounces writes to Firestore (2s delay).
 * Call this every time the user toggles a card's ownership.
 */
function queueCollectionSave(collectionData) {
  _pendingCollection = collectionData;
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    _saveTimer = null;
    if (_pendingCollection) {
      const data = _pendingCollection;
      _pendingCollection = null;
      await saveUserCollection(data);
    }
  }, 2000);
}

// ============================================================
// FIRESTORE: SAVED DECKS (with localStorage cache)
// ============================================================

const DECKS_CACHE_KEY = 'ttf_saved_decks';

/** Get cached decks from localStorage */
function getCachedDecks() {
  try {
    const raw = localStorage.getItem(DECKS_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

/** Write decks to localStorage cache */
function setCachedDecks(decks) {
  try {
    localStorage.setItem(DECKS_CACHE_KEY, JSON.stringify(decks));
  } catch (e) { /* quota exceeded, ignore */ }
}

/** Clear cache on sign-out */
function clearDecksCache() {
  localStorage.removeItem(DECKS_CACHE_KEY);
}

/**
 * Load all saved decks for the current user.
 * Returns cached data immediately, syncs from Firestore in background.
 */
async function loadSavedDecks() {
  if (!currentUser) return [];

  // Return cache immediately if available
  const cached = getCachedDecks();

  // Fetch from Firestore in background to keep cache fresh
  try {
    const doc = await db.collection('users').doc(currentUser.uid).get();
    const decks = (doc.exists && doc.data().savedDecks) ? doc.data().savedDecks : [];
    setCachedDecks(decks);
    return decks;
  } catch (err) {
    console.error('Failed to load saved decks:', err);
    // Fall back to cache if network fails
    return cached || [];
  }
}

/**
 * Load saved decks synchronously from cache (no network).
 * Use this for immediate UI rendering.
 */
function loadSavedDecksFromCache() {
  return getCachedDecks() || [];
}

/**
 * Save a deck. Updates local cache immediately, writes to Firestore in background.
 */
async function saveDeckToFirestore(name, code, deckId) {
  if (!currentUser) return false;

  // Update local cache first for instant UI
  let decks = getCachedDecks() || [];

  if (deckId) {
    const idx = decks.findIndex(d => d.id === deckId);
    if (idx !== -1) {
      decks[idx] = { id: deckId, name, code, savedAt: Date.now() };
    }
  } else {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    decks.push({ id, name, code, savedAt: Date.now() });
  }

  setCachedDecks(decks);

  // Write to Firestore in background
  try {
    await db.collection('users').doc(currentUser.uid).set(
      { savedDecks: decks },
      { merge: true }
    );
    return true;
  } catch (err) {
    console.error('Failed to save deck:', err);
    return false;
  }
}

/**
 * Delete a saved deck by its ID. Updates cache immediately.
 */
async function deleteDeckFromFirestore(deckId) {
  if (!currentUser) return false;

  // Update local cache first
  let decks = getCachedDecks() || [];
  decks = decks.filter(d => d.id !== deckId);
  setCachedDecks(decks);

  // Write to Firestore in background
  try {
    await db.collection('users').doc(currentUser.uid).set(
      { savedDecks: decks },
      { merge: true }
    );
    return true;
  } catch (err) {
    console.error('Failed to delete deck:', err);
    return false;
  }
}
