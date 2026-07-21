import { create } from 'zustand'
import { clearAllCache } from '@/lib/api-fetch'

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

export const useRiseStore = create<RiseStore>((set) => ({
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
    if (typeof window !== 'undefined') {
      clearAllCache() // Clear per-user cache to prevent cross-user data leaks
      localStorage.removeItem('rise-auth')
      localStorage.removeItem('rise-user-info')
      window.dispatchEvent(new CustomEvent('rise:session-expired'))
    }
    set({ auth: null, user: null, activeModule: 'dashboard' })
  },
}))