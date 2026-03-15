const DB_NAME = "ggolf-local";
const DB_VERSION = 2;
const SETTINGS_STORE = "settings";
const FAVORITES_STORE = "favorites";
const VISITED_STORE = "visited";

let dbPromise = null;

function openDb() {
  if (!("indexedDB" in window)) {
    return Promise.reject(new Error("IndexedDB not supported"));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
          db.createObjectStore(SETTINGS_STORE, { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains(FAVORITES_STORE)) {
          db.createObjectStore(FAVORITES_STORE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(VISITED_STORE)) {
          db.createObjectStore(VISITED_STORE, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Failed to open IndexedDB"));
    });
  }
  return dbPromise;
}

async function withStore(storeName, mode, handler) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const result = handler(store);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed"));
  });
}

export async function getSetting(key) {
  return withStore(SETTINGS_STORE, "readonly", (store) => {
    const req = store.get(key);
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
      req.onerror = () => reject(req.error || new Error("Failed to read setting"));
    });
  });
}

export async function setSetting(key, value) {
  return withStore(SETTINGS_STORE, "readwrite", (store) => {
    store.put({ key, value });
  });
}

export async function listFavorites() {
  return withStore(FAVORITES_STORE, "readonly", (store) => {
    const req = store.getAllKeys();
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(new Set(req.result || []));
      req.onerror = () => reject(req.error || new Error("Failed to list favorites"));
    });
  });
}

export async function toggleFavorite(id) {
  return withStore(FAVORITES_STORE, "readwrite", (store) => {
    const req = store.get(id);
    return new Promise((resolve, reject) => {
      req.onsuccess = () => {
        if (req.result) {
          store.delete(id);
          resolve(false);
          return;
        }
        store.put({ id, createdAt: Date.now() });
        resolve(true);
      };
      req.onerror = () => reject(req.error || new Error("Failed to toggle favorite"));
    });
  });
}

export async function listVisited() {
  return withStore(VISITED_STORE, "readonly", (store) => {
    const req = store.getAllKeys();
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(new Set(req.result || []));
      req.onerror = () => reject(req.error || new Error("Failed to list visited venues"));
    });
  });
}

export async function toggleVisited(id) {
  return withStore(VISITED_STORE, "readwrite", (store) => {
    const req = store.get(id);
    return new Promise((resolve, reject) => {
      req.onsuccess = () => {
        if (req.result) {
          store.delete(id);
          resolve(false);
          return;
        }
        store.put({ id, createdAt: Date.now() });
        resolve(true);
      };
      req.onerror = () => reject(req.error || new Error("Failed to toggle visited venue"));
    });
  });
}
