/**
 * Saves the current scene in IndexedDB. Built campuses are several megabytes,
 * more than localStorage holds, so localStorage is only read to migrate
 * scenes saved by earlier versions.
 */
const DB_NAME = "walk-free";
const STORE = "projects";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = action(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(request.result);
        };
        tx.onerror = tx.onabort = () => {
          db.close();
          reject(tx.error ?? request.error);
        };
      }),
  );
}

export async function loadProject(key: string): Promise<unknown | null> {
  const stored = await run("readonly", (s) => s.get(key));
  if (stored != null) return stored;
  try {
    const legacy = localStorage.getItem(key);
    return legacy ? JSON.parse(legacy) : null;
  } catch {
    return null;
  }
}

export async function saveProject(key: string, project: unknown) {
  await run("readwrite", (s) => s.put(project, key));
  try {
    // The scene now lives in IndexedDB; free the small localStorage quota.
    localStorage.removeItem(key);
  } catch {
    /* Storage can be unavailable in private windows. */
  }
}
