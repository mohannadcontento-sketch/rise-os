// RiseOS — Sync Manager
// Handles bidirectional sync between IndexedDB (offline) and the server API.
// Strategy: server-wins on conflict, periodic background sync when online.

import { getOfflineDB, type StoreName } from './offline-db';
import { apiFetch } from './api-fetch';

// ─── Types ──────────────────────────────────────────────────────────────

interface SyncOptions {
  /** Interval in ms for periodic background sync (default 60 000 = 1 min) */
  intervalMs?: number;
}

// FIX: Mapping between local store names and actual API route names.
// The local store names (from IndexedDB) don't always match the API routes:
// - 'journals' (local, plural) → '/api/rise/journal' (API, singular)
// - 'settings' (local) → '/api/rise/storage' (API uses a different name)
// Without this mapping, the sync manager was hitting /api/journals (404)
// instead of /api/rise/journal (200).
const API_ROUTES: Record<StoreName, string> = {
  tasks: 'tasks',
  habits: 'habits',
  goals: 'goals',
  projects: 'projects',
  journals: 'journal', // API uses singular form
  health: 'health',
  finance: 'finance',
  books: 'books',
  knowledge: 'knowledge',
  settings: 'storage', // 'settings' store maps to 'storage' API
};

// ─── SyncManager Class ──────────────────────────────────────────────────

class SyncManager {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private intervalMs: number;
  private syncing = false;

  constructor(options: SyncOptions = {}) {
    this.intervalMs = options.intervalMs ?? 60_000;
  }

  /** Whether the browser currently reports online status. */
  get isOnline(): boolean {
    if (typeof navigator === 'undefined') return true;
    return navigator.onLine;
  }

  /**
   * Start the sync loop.
   * Immediately syncs if online, then sets up periodic sync + online listener.
   */
  startSync(): void {
    if (typeof window === 'undefined') return;

    // Initial sync if online
    if (this.isOnline) {
      void this.sync();
    }

    // Periodic background sync
    this.intervalId = setInterval(() => {
      if (this.isOnline) {
        void this.sync();
      }
    }, this.intervalMs);

    // When coming back online, push all queued changes immediately
    window.addEventListener('online', this.handleOnline);
  }

  /** Stop the sync loop. */
  stopSync(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    window.removeEventListener('online', this.handleOnline);
  }

  /** Force an immediate sync regardless of timer. */
  async forceSync(): Promise<void> {
    if (!this.isOnline) return;
    await this.sync();
  }

  // ─── Internal ────────────────────────────────────────────────────────

  private handleOnline = (): void => {
    void this.sync();
  };

  /**
   * Full sync cycle:
   *  1. Push unsynced local changes to the server (server-wins on conflict).
   *  2. Pull latest data from the server and update IndexedDB.
   */
  private async sync(): Promise<void> {
    if (this.syncing) return; // prevent concurrent syncs
    this.syncing = true;

    try {
      // 1. Push unsynced records
      await this.pushUnsynced();

      // 2. Pull fresh data from server
      await this.pullFromServer();
    } catch (error) {
      console.warn('[SyncManager] Sync failed:', error);
    } finally {
      this.syncing = false;
    }
  }

  /**
   * Push all unsynced IndexedDB records to the server API.
   * Uses server-wins: if the server rejects or returns different data, we
   * accept the server version.
   */
  private async pushUnsynced(): Promise<void> {
    const unsynced = await getOfflineDB().getUnsynced();
    if (unsynced.length === 0) return;

    const processedIds: number[] = [];

    for (const record of unsynced) {
      try {
        // Fetch the full record from its store
        const data = await getOfflineDB().getById(record.storeName, record.recordId);
        if (!data) {
          // Record was deleted locally — skip
          processedIds.push(record.id!);
          continue;
        }

        // FIX: Use the correct API route from the mapping
        const route = API_ROUTES[record.storeName] || record.storeName;
        const method =
          record.action === 'create'
            ? 'POST'
            : record.action === 'delete'
              ? 'DELETE'
              : 'PUT';

        // FIX: Build the correct URL — /api/rise/{route} (not /api/{store})
        // For PUT/DELETE, append the record ID as a search param
        // (Next.js App Router convention: ?id=xxx)
        let requestUrl = `/api/rise/${route}`;
        if (method !== 'POST' && data.id) {
          requestUrl = `${requestUrl}?id=${data.id}`;
        }

        const response = await apiFetch(requestUrl, {
          method,
          body: method !== 'DELETE' ? JSON.stringify(data) : undefined,
        });

        if (response.ok) {
          // Server accepted — mark as synced
          processedIds.push(record.id!);

          // Server-wins: if the server returned data, update local store
          if (method !== 'DELETE') {
            try {
              const serverData = await response.json();
              if (serverData && typeof serverData === 'object' && !Array.isArray(serverData)) {
                await getOfflineDB().update(record.storeName, serverData);
              }
            } catch {
              // Response might not have JSON body — that's OK
            }
          }
        } else {
          // Server rejected — server wins, still mark synced to avoid retry loop
          processedIds.push(record.id!);
          console.warn(
            `[SyncManager] Server rejected ${record.action} on ${record.storeName}/${record.recordId}: ${response.status}`
          );
        }
      } catch (error) {
        // Network error — don't mark as synced, will retry next cycle
        console.warn(
          `[SyncManager] Failed to push ${record.storeName}/${record.recordId}:`,
          error
        );
      }
    }

    // Mark processed records as synced
    if (processedIds.length > 0) {
      await getOfflineDB().markSynced(processedIds);
    }
  }

  /**
   * Pull latest data from each API endpoint and update IndexedDB.
   * Server data overwrites local data (server-wins).
   */
  private async pullFromServer(): Promise<void> {
    const stores: StoreName[] = [
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

    for (const store of stores) {
      try {
        // FIX: Use the correct API route from the mapping
        const route = API_ROUTES[store] || store;
        const response = await apiFetch(`/api/rise/${route}`);
        if (!response.ok) continue;

        const json = await response.json();

        // FIX: The API returns objects like { tasks: [] } or { habits: [] },
        // not bare arrays. Extract the array from the response object.
        let items: any[] = [];
        if (Array.isArray(json)) {
          items = json;
        } else if (json && typeof json === 'object') {
          // Find the first array-valued key in the response object
          const arrayKey = Object.keys(json).find((k) => Array.isArray(json[k]));
          if (arrayKey) {
            items = json[arrayKey];
          }
        }

        if (items.length > 0) {
          // Clear local store and repopulate from server
          await getOfflineDB().clear(store);
          for (const item of items) {
            await getOfflineDB().add(store, item);
          }
        }
      } catch {
        // If one store fails, continue with the rest
        console.warn(`[SyncManager] Failed to pull ${store}`);
      }
    }
  }
}

// ─── Lazy Singleton (safe for SSR) ─────────────────────────────────────────

let _syncManager: SyncManager | null = null;

export function getSyncManager(): SyncManager {
  if (!_syncManager) {
    _syncManager = new SyncManager();
  }
  return _syncManager;
}

/** Backwards-compatible alias */
export const syncManager = new Proxy({} as SyncManager, {
  get(_target, prop) {
    return Reflect.get(getSyncManager(), prop);
  },
});
