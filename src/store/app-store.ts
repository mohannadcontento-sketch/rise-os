import { create } from 'zustand'
import { clearAllCache } from '@/lib/api-fetch'

// Re-entry guard: prevents logout() from being called recursively.
// This can happen if the rise:session-expired event is dispatched
// during logout()'s set() call. The module-level flag breaks the cycle.
let _isLoggingOut = false

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
  | 'ai-coach'
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

export const useRiseStore = create<RiseStore>((set, get) => ({
  activeModule: 'dashboard',
  sidebarOpen: false,
  user: null,
  auth: null,
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
        localStorage.removeItem('rise-auth')
        localStorage.removeItem('rise-user-info')
        // PERF FIX: this used to POST /api/auth/logout directly AND call
        // supabaseClient.auth.signOut() — the signOut fires SIGNED_OUT, and
        // AuthProvider's handler POSTs /api/auth/logout again → every logout
        // sent TWO identical requests. Now: Supabase mode relies on the
        // SIGNED_OUT handler (single POST); only mock/dev mode (no Supabase
        // client, no SIGNED_OUT event) posts directly.
        import('@/lib/supabase-client').then(({ supabaseClient }) => {
          if (supabaseClient) {
            supabaseClient.auth.signOut().catch(() => {})
          } else {
            try {
              fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
            } catch { /* ignore */ }
          }
        }).catch(() => {
          try {
            fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
          } catch { /* ignore */ }
        })
      }
      set({ auth: null, user: null, activeModule: 'dashboard' })
    } finally {
      _isLoggingOut = false
    }
  },
}))