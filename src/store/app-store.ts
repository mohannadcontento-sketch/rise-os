import { create } from 'zustand'

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
  | 'settings'

export interface UserInfo {
  name: string
  level: number
  currentXp: number
  xpToNext: number
  progress: number
  streak: number
}

interface RiseStore {
  activeModule: ModuleId
  sidebarOpen: boolean
  user: UserInfo | null
  setActiveModule: (module: ModuleId) => void
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  setUser: (user: UserInfo) => void
}

export const useRiseStore = create<RiseStore>((set) => ({
  activeModule: 'dashboard',
  sidebarOpen: false,
  user: null,
  setActiveModule: (module) => set({ activeModule: module, sidebarOpen: false }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setUser: (user) => set({ user }),
}))