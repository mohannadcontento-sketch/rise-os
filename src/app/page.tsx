'use client'

import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useRiseStore } from '@/store/app-store'
import { Sidebar } from '@/components/rise/sidebar'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, Moon, Sun, Search } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Input } from '@/components/ui/input'
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

export default function RiseOSApp() {
  const { activeModule, setActiveModule, toggleSidebar } = useRiseStore()
  const { theme, setTheme } = useTheme()
  const [searchOpen, setSearchOpen] = useState(false)
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
      <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
        <CommandInput placeholder="ابحث عن أي شيء..." dir="rtl" />
        <CommandList>
          <CommandEmpty>لم يتم العثور على نتائج.</CommandEmpty>
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