// Where the model lives in light mode.
//
// Three implementations, one interface. `autoStore()` picks the best one available.
//
// Why IndexedDB by default rather than localStorage: localStorage caps out around 5 MB, and
// above all it is **synchronous** — every write blocks the main thread, in the middle of a
// sorting session. A kNN corpus of fifteen hundred cards plus a crossed vocabulary goes well
// past the limit. localStorage remains perfect for a Bayes model on its own.

export interface Store {
  load<T>(key: string): Promise<T | null>;
  save(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

export function memoryStore(): Store {
  const map = new Map<string, string>();
  return {
    async load<T>(key: string) {
      const raw = map.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    },
    async save(key, value) {
      map.set(key, JSON.stringify(value));
    },
    async remove(key) {
      map.delete(key);
    },
  };
}

export function localStore(prefix = 'trieur:'): Store {
  return {
    async load<T>(key: string) {
      const raw = localStorage.getItem(prefix + key);
      return raw ? (JSON.parse(raw) as T) : null;
    },
    async save(key, value) {
      localStorage.setItem(prefix + key, JSON.stringify(value));
    },
    async remove(key) {
      localStorage.removeItem(prefix + key);
    },
  };
}

export function idbStore(dbName = 'trieur', storeName = 'models'): Store {
  let opening: Promise<IDBDatabase> | null = null;
  const db = () =>
    (opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(storeName);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));

  const run = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> => {
    const d = await db();
    return new Promise<T>((resolve, reject) => {
      const tx = d.transaction(storeName, mode);
      const req = fn(tx.objectStore(storeName));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    });
  };

  return {
    async load<T>(key: string) {
      return (await run<T | undefined>('readonly', (s) => s.get(key))) ?? null;
    },
    async save(key, value) {
      // IndexedDB stores the structure as-is (structured clone): no JSON.stringify, so no
      // multi-megabyte text copy on every save
      await run('readwrite', (s) => s.put(value, key));
    },
    async remove(key) {
      await run('readwrite', (s) => s.delete(key));
    },
  };
}

/** IndexedDB when available, otherwise localStorage, otherwise memory. */
export function autoStore(): Store {
  try {
    if (typeof indexedDB !== 'undefined') return idbStore();
    if (typeof localStorage !== 'undefined') return localStore();
  } catch {
    // private browsing, opaque origin, extension without permission…
  }
  return memoryStore();
}
