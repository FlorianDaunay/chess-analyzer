/** Minimal promise wrapper over IndexedDB: one database, a few key/value stores. */

const DB_NAME = "chesslab";
const VERSION = 1;
export type StoreName = "games" | "analysis" | "meta";

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      for (const name of ["games", "analysis", "meta"]) if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

export const idbGet = <T>(store: StoreName, key: string) => run<T | undefined>(store, "readonly", (s) => s.get(key) as IDBRequest<T | undefined>).catch(() => undefined);
export const idbSet = (store: StoreName, key: string, value: unknown) => run(store, "readwrite", (s) => s.put(value, key)).catch(() => undefined);
export const idbDelete = (store: StoreName, key: string) => run(store, "readwrite", (s) => s.delete(key)).catch(() => undefined);
export const idbKeys = (store: StoreName) => run<IDBValidKey[]>(store, "readonly", (s) => s.getAllKeys()).catch(() => [] as IDBValidKey[]);

export async function idbGetMany<T>(store: StoreName, keys: string[]): Promise<Map<string, T>> {
  const db = await open().catch(() => null);
  const out = new Map<string, T>();
  if (!db) return out;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(store, "readonly");
    const s = tx.objectStore(store);
    for (const k of keys) {
      const req = s.get(k);
      req.onsuccess = () => {
        if (req.result !== undefined) out.set(k, req.result as T);
      };
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  return out;
}
