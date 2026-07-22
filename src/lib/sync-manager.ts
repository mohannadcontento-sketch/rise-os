import { getOfflineDB } from './offline-db'
import { apiFetch } from './api-fetch'

export class SyncManager {
  private isSyncing = false
  private syncInterval: NodeJS.Timeout | null = null
  private retryCounts = new Map<string, number>()
  private MAX_RETRIES = 5

  constructor() {
    this.startAutoSync()
    window.addEventListener('online', () => this.pushUnsynced())
  }

  private startAutoSync() {
    if (this.syncInterval) return
    this.syncInterval = setInterval(() => {
      if (navigator.onLine && !this.isSyncing) {
        this.pushUnsynced()
      }
    }, 30000) // Every 30 seconds
  }

  public stopAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
      this.syncInterval = null
    }
  }

  public async pushUnsynced(): Promise<void> {
    if (this.isSyncing || !navigator.onLine) return
    this.isSyncing = true

    try {
      const unsynced = await getOfflineDB().getUnsynced()
      if (unsynced.length === 0) return

      const processedIds: number[] = []
      const failedIds: number[] = []

      for (const record of unsynced) {
        try {
          const data = await getOfflineDB().getById(record.storeName, record.recordId)
          if (!data) {
            processedIds.push(record.id!)
            continue
          }

          const url = `/api/${record.storeName}`
          const method = record.action === 'create' ? 'POST' : record.action === 'delete' ? 'DELETE' : 'PUT'

          const response = await apiFetch(url, {
            method,
            body: JSON.stringify(data),
          })

          if (response.ok) {
            processedIds.push(record.id!)
            this.retryCounts.delete(record.recordId)
            if (method !== 'DELETE') {
              const serverData = await response.json()
              if (serverData && typeof serverData === 'object') {
                await getOfflineDB().update(record.storeName, serverData)
              }
            }
          } else {
            const retries = this.retryCounts.get(record.recordId) || 0
            if (retries >= this.MAX_RETRIES) {
              processedIds.push(record.id!)
              this.retryCounts.delete(record.recordId)
              console.error(`[SyncManager] Max retries reached for ${record.storeName}/${record.recordId}`)
            } else {
              failedIds.push(record.id!)
              this.retryCounts.set(record.recordId, retries + 1)
              console.warn(`[SyncManager] Server rejected ${record.action} on ${record.storeName}/${record.recordId}: ${response.status} (Retry ${retries + 1}/${this.MAX_RETRIES})`)
            }
          }
        } catch (error) {
          failedIds.push(record.id!)
          const retries = this.retryCounts.get(record.recordId) || 0
          this.retryCounts.set(record.recordId, retries + 1)
          console.warn(`[SyncManager] Failed to push ${record.storeName}/${record.recordId}:`, error)
        }
      }

      if (processedIds.length > 0) {
        await getOfflineDB().markSynced(processedIds)
      }

      if (failedIds.length > 0) {
        console.warn(`[SyncManager] ${failedIds.length} records failed to sync and will be retried.`)
      }
    } finally {
      this.isSyncing = false
    }
  }

  public async forceSync(): Promise<void> {
    this.retryCounts.clear()
    await this.pushUnsynced()
  }
}

export const syncManager = new SyncManager()