// Live family sync over Cloud Firestore.
// Exposes window.MenuSync for app.js. Loaded as a module after app.js; app.js
// listens for the 'menusync-ready' event.
import { firebaseConfig } from './firebase-config.js';

const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
const CLIENT_ID = Math.random().toString(36).slice(2) + Date.now().toString(36);

function ready(api) {
  window.MenuSync = api;
  window.dispatchEvent(new Event('menusync-ready'));
}

async function start() {
  if (!firebaseConfig.apiKey) {
    ready({ available: false, reason: 'not-configured' });
    return;
  }
  let fs;
  try {
    const appMod = await import(FB + 'firebase-app.js');
    fs = await import(FB + 'firebase-firestore.js');
    const app = appMod.initializeApp(firebaseConfig);
    let db;
    try {
      db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
    } catch (e) {
      db = fs.getFirestore(app); // e.g. private browsing without IndexedDB
    }
    let unsubscribe = null;
    const ref = (code) => fs.doc(db, 'families', code);

    ready({
      available: true,
      /** Listen to a family document. onRemote(state) fires for changes made elsewhere. */
      listen(code, { onRemote, onStatus }) {
        if (unsubscribe) unsubscribe();
        unsubscribe = fs.onSnapshot(ref(code), { includeMetadataChanges: true }, (snap) => {
          if (!snap.exists()) { onStatus('missing'); return; }
          onStatus(snap.metadata.hasPendingWrites ? 'saving' : snap.metadata.fromCache ? 'offline' : 'synced');
          const d = snap.data();
          if (d.clientId === CLIENT_ID) return; // our own write echoing back
          try { onRemote(JSON.parse(d.state), d.updatedAt); } catch (e) { /* ignore malformed */ }
        }, (err) => onStatus('error', err));
      },
      stop() { if (unsubscribe) unsubscribe(); unsubscribe = null; },
      async push(code, state) {
        await fs.setDoc(ref(code), { state: JSON.stringify(state), updatedAt: state.updatedAt || Date.now(), clientId: CLIENT_ID });
      },
      /** Returns the remote state, or null if the family code does not exist. */
      async fetch(code) {
        const snap = await fs.getDoc(ref(code));
        return snap.exists() ? JSON.parse(snap.data().state) : null;
      }
    });
  } catch (e) {
    ready({ available: false, reason: 'load-failed', error: String(e) });
  }
}

start();
