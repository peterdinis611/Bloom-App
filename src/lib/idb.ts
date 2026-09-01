/**
 * Minimal IndexedDB key-value store for Bloom client state.
 * Migrates existing localStorage entries on first access.
 */

const DB_NAME = "bloom"
const DB_VERSION = 1
const STORE = "kv"
const MIGRATED_KEY = "__bloom_local_storage_migrated__"

const LEGACY_LOCAL_KEYS = [
  "bloom-settings-v3",
  "bloom-onboarding-v1",
  "bloom-last-recording-id",
] as const

let dbPromise: Promise<IDBDatabase> | null = null
let migratePromise: Promise<void> | null = null

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE)
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"))
    })
  }
  return dbPromise
}

function idbGetRaw(key: string): Promise<string | null> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly")
        const req = tx.objectStore(STORE).get(key)
        req.onsuccess = () => resolve((req.result as string | undefined) ?? null)
        req.onerror = () => reject(req.error ?? new Error("IndexedDB read failed"))
      }),
  )
}

function idbSetRaw(key: string, value: string): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite")
        tx.objectStore(STORE).put(value, key)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed"))
      }),
  )
}

function idbDeleteRaw(key: string): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite")
        tx.objectStore(STORE).delete(key)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error ?? new Error("IndexedDB delete failed"))
      }),
  )
}

async function migrateFromLocalStorage(): Promise<void> {
  if (migratePromise) return migratePromise

  migratePromise = (async () => {
    if ((await idbGetRaw(MIGRATED_KEY)) === "1") return

    for (const key of LEGACY_LOCAL_KEYS) {
      try {
        const legacy = localStorage.getItem(key)
        if (legacy !== null) {
          await idbSetRaw(key, legacy)
          localStorage.removeItem(key)
        }
      } catch {
        // localStorage may be unavailable in some webview contexts
      }
    }

    await idbSetRaw(MIGRATED_KEY, "1")
  })()

  return migratePromise
}

export async function idbGet(key: string): Promise<string | null> {
  await migrateFromLocalStorage()
  return idbGetRaw(key)
}

export async function idbSet(key: string, value: string): Promise<void> {
  await migrateFromLocalStorage()
  await idbSetRaw(key, value)
}

export async function idbRemove(key: string): Promise<void> {
  await migrateFromLocalStorage()
  await idbDeleteRaw(key)
}
