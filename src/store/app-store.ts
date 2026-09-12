import { create } from 'zustand'
import { clearAllCache } from '@/lib/api-fetch'

// ============================================================
// app-store.ts — الحالة العامة للتطبيق (Zustand)
//
// المتجر الوحيد لحالة التنقل والجلسة: الوحدة النشطة والمستخدم،
// مع logout محصّن ضد الاستدعاء المتكرر عبر علم على مستوى الوحدة.
//
// المسؤوليات:
//   1) إدارة activeModule و sidebarOpen للتنقل بين الوحدات.
//   2) تعقّب الجلسة (auth/user) ومطابقتها مع أحداث rise:*.
//   3) logout: تنظيف الكاش + بث rise:logout + إبطال كوكيز httpOnly.
// ============================================================

// Re-entry guard: prevents logout() from being called recursively.
// This can happen if the rise:session-expired event is dispatched
// during logout()'s set() call. The module-level flag breaks the cycle.
let _isLoggingOut = false

// ── القسم: أنواع الوحدات والجلسة والمتجر ──────────────────────────────────

export type ModuleId =
  | 'dashboard'
  | 'morning'
  | 'planner'
  | 'tasks'
  | 'projects'
  | 'goals'
  | 'habits'
  | 'journal'
  | 'deepwork'
  | 'work'
  | 'reading'
  | 'learning'
  | 'health'
  | 'finance'
  | 'calendar'
  | 'brain'
  | 'weekly-review'
  | 'monthly-review'
  | 'analytics'
  | 'community'
  | 'admin-panel'
  | 'settings'

export interface UserInfo {
  id: string
  email: string
  name?: string
  level: number
  currentXp: number
  xpToNext: number
  progress: number
  streak: number
  isAdmin: boolean
}

interface AuthState {
  isAuthenticated: boolean
  userId: string
  userEmail: string
  userName: string
  isAdmin: boolean
  accessToken: string
}

interface RiseStore {
  activeModule: ModuleId
  sidebarOpen: boolean
  user: UserInfo | null
  auth: AuthState | null
  setActiveModule: (module: ModuleId) => void
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  setUser: (user: UserInfo) => void
  setAuth: (auth: AuthState | null) => void
  logout: () => void
}

// ── القسم: إنشاء المتجر والإجراءات ──────────────────────────────────

export const useRiseStore = create<RiseStore>((set, get) => ({
  activeModule: 'dashboard',
  sidebarOpen: false,
  user: null,
  auth: null,
  // الانتقال لوحدة جديدة يطوي الشريط الجانبي تلقائياً (سلوك الجوال)
  setActiveModule: (module) => set({ activeModule: module, sidebarOpen: false }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setUser: (user) => set({ user }),
  setAuth: (auth) => set({ auth }),
  logout: () => {
    // Re-entry guard: prevent recursive logout calls.
    if (_isLoggingOut) return
    // State guard: skip if already logged out.
    if (!get().auth) return

    _isLoggingOut = true
    try {
      if (typeof window !== 'undefined') {
        clearAllCache()
        const oldUserId = (() => { try { return JSON.parse(localStorage.getItem('rise-user-info') || '{}').id || '' } catch { return '' } })()
        // Keep the user's encrypted offline mutations. They are user-bound and
        // cannot be replayed by another account; deleting them here would lose
        // work if the same user signs out before reconnecting.
        // نمرّر معرّف المستخدم القديم ليتمكن المستمعون من تنظيف تخزينه المعزول فقط
        window.dispatchEvent(new CustomEvent('rise:logout', { detail: { userId: oldUserId } }))
        localStorage.removeItem('rise-auth')
        localStorage.removeItem('rise-user-info')
        // Server-owned BFF authentication: clear the httpOnly cookies directly.
        void fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {})
      }
      // إعادة الوحدة إلى dashboard: المستخدم التالي لا يفتح قسم سابقه الخاص
      set({ auth: null, user: null, activeModule: 'dashboard' })
    } finally {
      _isLoggingOut = false
    }
  },
}))