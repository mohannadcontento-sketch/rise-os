'use client'

import { lazy, Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useRiseStore } from '@/store/app-store'
import { Sidebar } from '@/components/rise/sidebar'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, Circle, Flame, Menu, Moon, Sun, Search, Target } from 'lucide-react'
import { useTheme } from 'next-themes'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ModuleId } from '@/store/app-store'

// Lazy load all modules
const Dashboard = lazy(() => import('@/components/rise/dashboard'))
const MorningRoutine = lazy(() => import('@/components/rise/morning-routine'))
const DailyPlanner = lazy(() => import('@/components/rise/daily-planner'))
const Tasks = lazy(() => import('@/components/rise/tasks'))
const Projects = lazy(() => import('@/components/rise/projects'))
const Goals = lazy(() => import('@/components/rise/goals'))
const Habits = lazy(() => import('@/components/rise/habits'))
const Journal = lazy(() => import('@/components/rise/journal'))
const DeepWork = lazy(() => import('@/components/rise/deep-work'))
const Reading = lazy(() => import('@/components/rise/reading'))
const Learning = lazy(() => import('@/components/rise/learning'))
const Health = lazy(() => import('@/components/rise/health'))
const Finance = lazy(() => import('@/components/rise/finance'))
const Calendar = lazy(() => import('@/components/rise/calendar'))
const SecondBrain = lazy(() => import('@/components/rise/second-brain'))
const WeeklyReview = lazy(() => import('@/components/rise/weekly-review'))
const MonthlyReview = lazy(() => import('@/components/rise/monthly-review'))
const Analytics = lazy(() => import('@/components/rise/analytics'))
const AICoach = lazy(() => import('@/components/rise/ai-coach'))
const Settings = lazy(() => import('@/components/rise/settings'))

const moduleComponents: Record<ModuleId, React.LazyExoticComponent<React.ComponentType>> = {
  'dashboard': Dashboard,
  'morning': MorningRoutine,
  'planner': DailyPlanner,
  'tasks': Tasks,
  'projects': Projects,
  'goals': Goals,
  'habits': Habits,
  'journal': Journal,
  'deepwork': DeepWork,
  'reading': Reading,
  'learning': Learning,
  'health': Health,
  'finance': Finance,
  'calendar': Calendar,
  'brain': SecondBrain,
  'weekly-review': WeeklyReview,
  'monthly-review': MonthlyReview,
  'analytics': Analytics,
  'ai-coach': AICoach,
  'settings': Settings,
}

const moduleNames: Record<ModuleId, string> = {
  'dashboard': 'لوحة التحكم',
  'morning': 'الروتين الصباحي',
  'planner': 'المخطط اليومي',
  'tasks': 'المهام',
  'projects': 'المشاريع',
  'goals': 'الأهداف',
  'habits': 'تتبع العادات',
  'journal': 'اليوميات',
  'deepwork': 'العمل العميق',
  'reading': 'القراءة',
  'learning': 'التعلم',
  'health': 'الصحة',
  'finance': 'المالية',
  'calendar': 'التقويم',
  'brain': 'الدماغ الثاني',
  'weekly-review': 'مراجعة أسبوعية',
  'monthly-review': 'مراجعة شهرية',
  'analytics': 'التحليلات',
  'ai-coach': 'المدرب الذكي',
  'settings': 'الإعدادات',
}

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-emerald-accent/30 border-t-emerald-accent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">جاري التحميل...</p>
      </div>
    </div>
  )
}

interface SearchTask { id: string; title: string; status: string; xpReward: number }
interface SearchHabit { id: string; name: string; icon: string; color: string }
interface SearchGoal { id: string; title: string; type: string; progress: number }

export default function RiseOSApp() {
  const { activeModule, setActiveModule, toggleSidebar } = useRiseStore()
  const { theme, setTheme } = useTheme()
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ tasks: SearchTask[]; habits: SearchHabit[]; goals: SearchGoal[] }>({ tasks: [], habits: [], goals: [] })
  const mountedRef = useRef(false)
  const mounted = useSyncExternalStore(
    () => () => {},
    () => (mountedRef.current = true, true),
    () => false
  )

  useEffect(() => {
    // Seed demo data on first load
    fetch('/api/rise/seed', { method: 'POST' }).catch(() => {})
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  /* ── Global search ── */
  const handleSearchQuery = useCallback((query: string) => {
    setSearchQuery(query)
  }, [])

  const handleSearchOpenChange = useCallback((open: boolean) => {
    setSearchOpen(open)
    if (!open) {
      setSearchQuery('')
      setSearchResults({ tasks: [], habits: [], goals: [] })
    }
  }, [])

  useEffect(() => {
    if (!searchOpen || searchQuery.length < 2) {
      return
    }
    const q = searchQuery.toLowerCase()
    const controller = new AbortController()
    Promise.all([
      fetch('/api/rise/tasks', { signal: controller.signal }).then(r => r.json()).catch(() => ({ tasks: [] })),
      fetch('/api/rise/habits', { signal: controller.signal }).then(r => r.json()).catch(() => ({ habits: [] })),
      fetch('/api/rise/goals', { signal: controller.signal }).then(r => r.json()).catch(() => ({ goals: [] })),
    ]).then(([tasksData, habitsData, goalsData]) => {
      if (controller.signal.aborted) return
      setSearchResults({
        tasks: (tasksData.tasks || []).filter((t: SearchTask) => t.title.toLowerCase().includes(q)).slice(0, 5),
        habits: (habitsData.habits || []).filter((h: SearchHabit) => h.name.toLowerCase().includes(q)).slice(0, 5),
        goals: (goalsData.goals || []).filter((g: SearchGoal) => g.title.toLowerCase().includes(q)).slice(0, 5),
      })
    })
    return () => controller.abort()
  }, [searchQuery, searchOpen])

  const ActiveComponent = moduleComponents[activeModule]

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex items-center gap-3 px-4 md:px-6 py-3 border-b border-border bg-background/80 backdrop-blur-xl">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={toggleSidebar}
          >
            <Menu className="w-5 h-5" />
          </Button>

          <div className="flex-1" />

          {/* Search trigger */}
          <Button
            variant="outline"
            className="hidden sm:flex items-center gap-2 text-muted-foreground h-9 px-3 text-sm font-normal border-dashed"
            onClick={() => setSearchOpen(true)}
          >
            <Search className="w-4 h-4" />
            <span>بحث...</span>
            <kbd className="pointer-events-none ml-1 inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              ⌘K
            </kbd>
          </Button>

          {/* Theme toggle */}
          {mounted && (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </Button>
          )}
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeModule}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="p-4 md:p-6"
            >
              {/* Module title */}
              <div className="mb-6">
                <h2 className="text-2xl font-bold tracking-tight">
                  {moduleNames[activeModule]}
                </h2>
              </div>
              <Suspense fallback={<LoadingFallback />}>
                <ActiveComponent />
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Command palette */}
      <CommandDialog open={searchOpen} onOpenChange={handleSearchOpenChange}>
        <CommandInput placeholder="ابحث عن أي شيء..." dir="rtl" onInput={(e) => handleSearchQuery((e.target as HTMLInputElement).value)} />
        <CommandList>
          <CommandEmpty>لم يتم العثور على نتائج.</CommandEmpty>

          {searchQuery.length >= 2 && searchResults.tasks.length > 0 && (
            <CommandGroup heading="المهام">
              {searchResults.tasks.map((task) => (
                <CommandItem
                  key={task.id}
                  onSelect={() => {
                    setActiveModule('tasks')
                    setSearchOpen(false)
                  }}
                  className="flex-row-reverse justify-end gap-2"
                >
                  {task.status === 'done'
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-accent shrink-0" />
                    : <Circle className="w-4 h-4 text-muted-foreground shrink-0" />
                  }
                  <span className="flex-1 text-right truncate">{task.title}</span>
                  <span className="text-[10px] text-gold font-medium shrink-0">+{task.xpReward} XP</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {searchQuery.length >= 2 && searchResults.habits.length > 0 && (
            <CommandGroup heading="العادات">
              {searchResults.habits.map((habit) => (
                <CommandItem
                  key={habit.id}
                  onSelect={() => {
                    setActiveModule('habits')
                    setSearchOpen(false)
                  }}
                  className="flex-row-reverse justify-end gap-2"
                >
                  <Flame className="w-4 h-4 text-orange-500 shrink-0" />
                  <span className="flex-1 text-right truncate">{habit.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {searchQuery.length >= 2 && searchResults.goals.length > 0 && (
            <CommandGroup heading="الأهداف">
              {searchResults.goals.map((goal) => (
                <CommandItem
                  key={goal.id}
                  onSelect={() => {
                    setActiveModule('goals')
                    setSearchOpen(false)
                  }}
                  className="flex-row-reverse justify-end gap-2"
                >
                  <Target className="w-4 h-4 text-forest shrink-0" />
                  <span className="flex-1 text-right truncate">{goal.title}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">{goal.progress}%</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          <CommandGroup heading="الوحدات">
            {(Object.keys(moduleNames) as ModuleId[]).map((id) => (
              <CommandItem
                key={id}
                onSelect={() => {
                  setActiveModule(id)
                  setSearchOpen(false)
                }}
                className={cn(
                  'flex-row-reverse justify-end gap-2',
                  activeModule === id && 'bg-accent'
                )}
              >
                {moduleNames[id]}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  )
}