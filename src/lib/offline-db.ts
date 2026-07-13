// RiseOS — Offline IndexedDB Wrapper
// Stores all app data locally for full offline support.

// ─── Types ──────────────────────────────────────────────────────────────

export type StoreName =
  | 'tasks'
  | 'habits'
  | 'goals'
  | 'projects'
  | 'journals'
  | 'health'
  | 'finance'
  | 'books'
  | 'knowledge'
  | 'settings';

export type SyncAction = 'create' | 'update' | 'delete';

export interface SyncStatusRecord {
  id?: number;
  storeName: StoreName;
  recordId: string;
  action: SyncAction;
  timestamp: number;
  synced: boolean;
}

export interface BluetoothShareRecord {
  id?: number;
  senderName: string;
  data: string; // JSON stringified
  type: string;
  receivedAt: number;
}

const DB_NAME = 'riseos-offline';
const DB_VERSION = 1;

const STORE_NAMES: StoreName[] = [
  'tasks',
  'habits',
  'goals',
  'projects',
  'journals',
  'health',
  'finance',
  'books',
  'knowledge',
  'settings',
];

const META_STORES = ['syncStatus', 'bluetoothShares'] as const;

const ALL_STORES = [...STORE_NAMES, ...META_STORES];

// ─── OfflineDB Class ────────────────────────────────────────────────────

export class OfflineDB {
  private _db: IDBDatabase | null = null;
  private dbReady: Promise<IDBDatabase>;

  constructor() {
    this.dbReady = this.open();
  }

  /** Opens (or creates) the IndexedDB database. */
  private open(): Promise<IDBDatabase> {
    if (this._db) return Promise.resolve(this._db);

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;

        // Data stores — use record id as key
        for (const store of STORE_NAMES) {
          if (!db.objectStoreNames.contains(store)) {
            db.createObjectStore(store, { keyPath: 'id' });
          }
        }

        // Sync status store
        if (!db.objectStoreNames.contains('syncStatus')) {
          const ss = db.createObjectStore('syncStatus', {
            keyPath: 'id',
            autoIncrement: true,
          });
          ss.createIndex('synced', 'synced', { unique: false });
          ss.createIndex('storeName', 'storeName', { unique: false });
        }

        // Bluetooth shares store
        if (!db.objectStoreNames.contains('bluetoothShares')) {
          const bs = db.createObjectStore('bluetoothShares', {
            keyPath: 'id',
            autoIncrement: true,
          });
          bs.createIndex('receivedAt', 'receivedAt', { unique: false });
        }
      };

      request.onsuccess = () => {
        this._db = request.result;
        resolve(this._db);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /** Get the DB instance, ensuring it's open. */
  private async getDB(): Promise<IDBDatabase> {
    return this.dbReady;
  }

  // ─── Generic CRUD ────────────────────────────────────────────────────

  async getAll<T = Record<string, unknown>>(
    storeName: StoreName | 'syncStatus' | 'bluetoothShares'
  ): Promise<T[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result as T[]);
      request.onerror = () => reject(request.error);
    });
  }

  async getById<T = Record<string, unknown>>(
    storeName: StoreName | 'syncStatus' | 'bluetoothShares',
    id: string | number
  ): Promise<T | undefined> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => reject(request.error);
    });
  }

  async add<T = Record<string, unknown>>(
    storeName: StoreName | 'syncStatus' | 'bluetoothShares',
    data: T
  ): Promise<T> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.add(data);
      request.onsuccess = () => resolve(data);
      request.onerror = () => reject(request.error);
    });
  }

  async update<T = Record<string, unknown>>(
    storeName: StoreName | 'syncStatus' | 'bluetoothShares',
    data: T
  ): Promise<T> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.put(data);
      request.onsuccess = () => resolve(data);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(
    storeName: StoreName | 'syncStatus' | 'bluetoothShares',
    id: string | number
  ): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clear(
    storeName: StoreName | 'syncStatus' | 'bluetoothShares'
  ): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // ─── Sync-Aware Save ────────────────────────────────────────────────

  /**
   * Save data to a store and automatically create a sync status record
   * so the sync manager knows it needs to be pushed to the server.
   */
  async saveData(
    storeName: StoreName,
    data: Record<string, unknown>
  ): Promise<void> {
    const recordId = String(data.id ?? crypto.randomUUID());

    // If the record already exists, treat as update; otherwise create
    const existing = await this.getById(storeName, recordId);
    const action: SyncAction = existing ? 'update' : 'create';

    const recordToSave = { ...data, id: recordId };
    await this.update(storeName, recordToSave);

    // Record the sync need
    const syncRecord: Omit<SyncStatusRecord, 'id'> = {
      storeName,
      recordId,
      action,
      timestamp: Date.now(),
      synced: false,
    };
    await this.add('syncStatus', syncRecord);
  }

  // ─── Sync Status Queries ────────────────────────────────────────────

  async getUnsynced(): Promise<SyncStatusRecord[]> {
    const all = await this.getAll<SyncStatusRecord>('syncStatus');
    return all.filter((r) => !r.synced);
  }

  async markSynced(ids: number[]): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction('syncStatus', 'readwrite');
    const store = tx.objectStore('syncStatus');

    for (const id of ids) {
      const getReq = store.get(id);
      await new Promise<void>((resolve, reject) => {
        getReq.onsuccess = () => {
          const record = getReq.result;
          if (record) {
            record.synced = true;
            store.put(record);
          }
          resolve();
        };
        getReq.onerror = () => reject(getReq.error);
      });
    }
  }
}

// ─── Lazy Singleton (safe for SSR) ─────────────────────────────────────────

let _offlineDB: OfflineDB | null = null;

export function getOfflineDB(): OfflineDB {
  if (!_offlineDB) {
    _offlineDB = new OfflineDB();
  }
  return _offlineDB;
}

/** Backwards-compatible alias */
export const offlineDB = new Proxy({} as OfflineDB, {
  get(_target, prop) {
    return Reflect.get(getOfflineDB(), prop);
  },
});