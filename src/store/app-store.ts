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

interface RiseStore {
  activeModule: ModuleId
  sidebarOpen: boolean
  setActiveModule: (module: ModuleId) => void
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
}

export const useRiseStore = create<RiseStore>((set) => ({
  activeModule: 'dashboard',
  sidebarOpen: false,
  setActiveModule: (module) => set({ activeModule: module, sidebarOpen: false }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}))