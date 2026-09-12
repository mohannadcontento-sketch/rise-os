'use client'

// ============================================================
// secure-offline-db.ts — المخزن المشفّر دون اتصال
//
// طبقة IndexedDB + WebCrypto لبيانات العمل دون اتصال، مقيدة بمعرّف
// المستخدم: مفتاح AES-GCM 256 غير قابل للتصدير يحفظه المتصفح في
// متجر keys، والنص المشفّر في متجر data. تستهلكها offline-persist
// (ذاكرة React Query) وapi-fetch (طابور الطفرات دون اتصال) وشاشة
// الإعدادات عند تسجيل الخروج (clearSecureUserData).
//
// المسؤوليات:
//   1) إنشاء مفتاح لكل مستخدم مرة واحدة ثم إعادة استخدامه.
//   2) put/get/remove لنوعين: queue وquery-cache، بمعرّف مركّب
//      وفهرس فريد (userId, kind) يمنع تكرار السجلات.
//   3) حذف السجل عند فشل فك التشفير (تلف/تلاعب) بدل كشفه، ومسح
//      كل بيانات المستخدم دفعة واحدة عند الطلب.
//
// حدود أمنية: حماية الساكن من الفحص العابر للملفات فقط — ليست
// دفاعاً ضد XSS (JS من نفس الأصل يستطيع استخدام المفتاح).
// ============================================================

/**
 * Small IndexedDB + WebCrypto persistence layer for user-scoped offline data.
 * Secrets/data are encrypted with a non-extractable CryptoKey stored by the
 * browser in IndexedDB. This protects data at rest from casual filesystem
 * inspection; it is not a defense against XSS because same-origin JS can use
 * the key.
 */

const DB_NAME = 'riseos-secure-storage-v2'
const DB_VERSION = 1
const KEY_STORE = 'keys'
const DATA_STORE = 'data'

interface KeyRecord {
  id: string
  key: CryptoKey
}

interface DataRecord {
  id: string
  userId: string
  kind: 'queue' | 'query-cache'
  ciphertext: ArrayBuffer
  iv: ArrayBuffer
  updatedAt: number
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.reject(new Error('INDEXEDDB_UNAVAILABLE'))
  }
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(KEY_STORE)) db.createObjectStore(KEY_STORE, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(DATA_STORE)) {
        const store = db.createObjectStore(DATA_STORE, { keyPath: 'id' })
        store.createIndex('by-user-kind', ['userId', 'kind'], { unique: true })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('INDEXEDDB_OPEN_FAILED'))
  })
  return dbPromise
}

async function getOrCreateKey(userId: string): Promise<CryptoKey> {
  if (!globalThis.crypto?.subtle) throw new Error('WEBCRYPTO_UNAVAILABLE')
  const id = `key:${userId}`
  const db = await openDb()
  const existing = await new Promise<KeyRecord | undefined>((resolve, reject) => {
    const tx = db.transaction(KEY_STORE, 'readonly')
    const req = tx.objectStore(KEY_STORE).get(id)
    req.onsuccess = () => resolve(req.result as KeyRecord | undefined)
    req.onerror = () => reject(req.error)
  })
  if (existing?.key) return existing.key

  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(KEY_STORE, 'readwrite')
    tx.objectStore(KEY_STORE).put({ id, key } satisfies KeyRecord)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error('INDEXEDDB_KEY_WRITE_FAILED'))
  })
  return key
}

async function encryptJson(userId: string, value: unknown): Promise<{ ciphertext: ArrayBuffer; iv: ArrayBuffer }> {
  const key = await getOrCreateKey(userId)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(JSON.stringify(value))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
  return { ciphertext, iv: iv.buffer }
}

async function decryptJson<T>(userId: string, record: DataRecord): Promise<T> {
  const key = await getOrCreateKey(userId)
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: record.iv }, key, record.ciphertext)
  return JSON.parse(new TextDecoder().decode(plaintext)) as T
}

async function put(userId: string, kind: DataRecord['kind'], value: unknown): Promise<void> {
  const db = await openDb()
  const encrypted = await encryptJson(userId, value)
  const id = `${kind}:${userId}`
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DATA_STORE, 'readwrite')
    tx.objectStore(DATA_STORE).put({
      id,
      userId,
      kind,
      ...encrypted,
      updatedAt: Date.now(),
    } satisfies DataRecord)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error('INDEXEDDB_WRITE_FAILED'))
  })
}

async function get<T>(userId: string, kind: DataRecord['kind']): Promise<T | null> {
  const db = await openDb()
  const record = await new Promise<DataRecord | undefined>((resolve, reject) => {
    const tx = db.transaction(DATA_STORE, 'readonly')
    const req = tx.objectStore(DATA_STORE).get(`${kind}:${userId}`)
    req.onsuccess = () => resolve(req.result as DataRecord | undefined)
    req.onerror = () => reject(req.error)
  })
  if (!record || record.userId !== userId || record.kind !== kind) return null
  try {
    return await decryptJson<T>(userId, record)
  } catch {
    // Tampered/corrupt ciphertext is deleted rather than exposed.
    await remove(userId, kind)
    return null
  }
}

async function remove(userId: string, kind: DataRecord['kind']): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DATA_STORE, 'readwrite')
    tx.objectStore(DATA_STORE).delete(`${kind}:${userId}`)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error('INDEXEDDB_DELETE_FAILED'))
  })
}

export async function loadOfflineQueue<T>(userId: string): Promise<T | null> {
  return get<T>(userId, 'queue')
}

export async function saveOfflineQueue<T>(userId: string, value: T): Promise<void> {
  return put(userId, 'queue', value)
}

export async function clearOfflineQueueStore(userId: string): Promise<void> {
  return remove(userId, 'queue')
}

export async function loadQueryCache<T>(userId: string): Promise<T | null> {
  return get<T>(userId, 'query-cache')
}

export async function saveQueryCache<T>(userId: string, value: T): Promise<void> {
  return put(userId, 'query-cache', value)
}

export async function clearQueryCacheStore(userId: string): Promise<void> {
  return remove(userId, 'query-cache')
}

export async function clearSecureUserData(userId: string): Promise<void> {
  await Promise.all([clearOfflineQueueStore(userId), clearQueryCacheStore(userId)])
}
