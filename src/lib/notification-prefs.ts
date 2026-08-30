/**
 * Notification preferences — single source of truth.
 *
 * The Settings page stores prefs under `rise-settings.notifications`.
 * Until now those toggles were decorative (nothing read them); every
 * notify* helper and the global ReminderEngine now gates through here.
 */

export interface NotificationPrefs {
  /** Wake-up reminder (uses settings.wakeUpTime) */
  morning: boolean
  /** Wind-down reminder (uses settings.sleepTime) */
  sleep: boolean
  /** Per-habit reminder times (from each habit's reminderTime) */
  habits: boolean
  /** Celebration when a task is completed */
  taskDone: boolean
  /** Celebration when a habit is completed */
  habitDone: boolean
  /** Celebration when a focus/work session completes */
  focusDone: boolean
}

export type NotificationPrefKey = keyof NotificationPrefs

export const NOTIFICATION_PREF_DEFAULTS: NotificationPrefs = {
  morning: true,
  sleep: true,
  habits: true,
  taskDone: true,
  habitDone: true,
  focusDone: true,
}

const STORAGE_KEY = 'rise-settings'

export function getNotificationPrefs(): NotificationPrefs {
  if (typeof window === 'undefined') return NOTIFICATION_PREF_DEFAULTS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return NOTIFICATION_PREF_DEFAULTS
    const parsed = JSON.parse(raw)
    return { ...NOTIFICATION_PREF_DEFAULTS, ...(parsed?.notifications || {}) }
  } catch {
    return NOTIFICATION_PREF_DEFAULTS
  }
}

export function isNotificationEnabled(key: NotificationPrefKey): boolean {
  try {
    return getNotificationPrefs()[key]
  } catch {
    return true
  }
}

/* ── Browser notification permission helpers ── */

export type BrowserPermissionState = 'granted' | 'denied' | 'default' | 'unsupported'

export function getBrowserPermissionState(): BrowserPermissionState {
  if (typeof window === 'undefined') return 'unsupported'
  if (!('Notification' in window)) return 'unsupported'
  return Notification.permission as BrowserPermissionState
}

export async function requestBrowserPermission(): Promise<BrowserPermissionState> {
  if (getBrowserPermissionState() === 'unsupported') return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  try {
    const result = await Notification.requestPermission()
    return result as BrowserPermissionState
  } catch {
    return 'denied'
  }
}

/**
 * Fire a browser notification. Shows even when the tab IS focused when
 * `force` is true (used by the Settings test button); otherwise only when
 * the tab is hidden/unfocused so the user isn't notified twice.
 */
export function showBrowserNotification(
  title: string,
  options?: NotificationOptions & { force?: boolean }
): boolean {
  try {
    if (typeof window === 'undefined' || !('Notification' in window)) return false
    if (Notification.permission !== 'granted') return false
    if (!options?.force && document.hasFocus()) return false
    const { force: _force, ...opts } = options || {}
    new Notification(title, {
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      dir: 'rtl',
      ...opts,
    })
    return true
  } catch {
    return false
  }
}
