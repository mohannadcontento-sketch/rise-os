'use client'

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useRiseStore } from '@/store/app-store'
import { Sidebar } from '@/components/rise/sidebar'
import LoginPage from '@/components/rise/login-page'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CheckCircle2, Circle, Flame, Menu, Moon, Sun, Search, Target,
  LayoutDashboard, CalendarDays, CheckSquare, FolderKanban, BookOpen,
  Brain, GraduationCap, Heart, Wallet, Calendar as CalendarIcon, Network, BarChart3,
  Sparkles, Settings as SettingsIcon, Zap,
  HeartPulse, PenLine,
} from 'lucide-react'
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
import { useKeyboardShortcuts, KeyboardShortcutsDialog } from '@/components/rise/keyboard-shortcuts'
import { PWAInstallPrompt, ConnectionStatus, BluetoothSharePanel, OfflineBanner } from '@/lib/pwa'
import { LogOut, Bluetooth } from 'lucide-react'

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
      <div className="relative flex items-center justify-center w-20 h-20">
        {/* Outer orbiting dots */}
        {[0, 1, 2].map((i) => (
          <span
            key={`outer-${i}`}
            className="orbit-dot-outer absolute w-2 h-2 rounded-full bg-emerald-accent/70"
            style={{ animationDelay: `${-i * 0.6}s` }}
          />
        ))}
        {/* Inner orbiting dots */}
        {[0, 1, 2].map((i) => (
          <span
            key={`inner-${i}`}
            className="orbit-dot-inner absolute w-1.5 h-1.5 rounded-full bg-gold/60"
            style={{ animationDelay: `${-i * 0.5}s` }}
          />
        ))}
        {/* Center Zap icon */}
        <Zap className="w-5 h-5 text-forest relative z-10" />
        <p className="absolute -bottom-8 text-sm text-muted-foreground">جاري التحميل...</p>
      </div>
    </div>
  )
}

/* Module icon map for top bar indicator */
const moduleIconMap: Record<ModuleId, React.ElementType> = {
  'dashboard': LayoutDashboard,
  'morning': Sun,
  'planner': CalendarDays,
  'tasks': CheckSquare,
  'projects': FolderKanban,
  'goals': Target,
  'habits': Flame,
  'journal': BookOpen,
  'deepwork': Brain,
  'reading': BookOpen,
  'learning': GraduationCap,
  'health': Heart,
  'finance': Wallet,
  'calendar': CalendarIcon,
  'brain': Network,
  'weekly-review': BarChart3,
  'monthly-review': BarChart3,
  'analytics': BarChart3,
  'ai-coach': Sparkles,
  'settings': SettingsIcon,
}

/* Module accent color map */
const moduleAccentMap: Record<ModuleId, string> = {
  'dashboard': 'bg-emerald-accent',
  'morning': 'bg-gold',
  'planner': 'bg-emerald-accent',
  'tasks': 'bg-emerald-accent',
  'projects': 'bg-forest',
  'goals': 'bg-gold',
  'habits': 'bg-gold',
  'journal': 'bg-forest',
  'deepwork': 'bg-emerald-accent',
  'reading': 'bg-gold',
  'learning': 'bg-emerald-accent',
  'health': 'bg-emerald-accent',
  'finance': 'bg-gold',
  'calendar': 'bg-forest',
  'brain': 'bg-emerald-accent',
  'weekly-review': 'bg-forest',
  'monthly-review': 'bg-forest',
  'analytics': 'bg-emerald-accent',
  'ai-coach': 'bg-gold',
  'settings': 'bg-foreground/30',
}

interface SearchTask { id: string; title: string; status: string; xpReward: number }
interface SearchHabit { id: string; name: string; icon: string; color: string }
interface SearchGoal { id: string; title: string; type: string; progress: number }
interface SearchJournal { id: string; date: string; content: string; mood: number | null }
interface SearchBook { id: string; title: string; author: string | null; status: string }
interface SearchKnowledge { id: string; title: string; type: string; folder: string | null }

export default function RiseOSApp() {
  const { activeModule, setActiveModule, toggleSidebar, auth, setAuth, logout } = useRiseStore()
  const { theme, setTheme } = useTheme()
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{
    tasks: SearchTask[]; habits: SearchHabit[]; goals: SearchGoal[]
    journals: SearchJournal[]; books: SearchBook[]; knowledge: SearchKnowledge[]
  }>({ tasks: [], habits: [], goals: [], journals: [], books: [], knowledge: [] })
  const [fabOpen, setFabOpen] = useState(false)
  const [btPanelOpen, setBtPanelOpen] = useState(false)
  const [themeRotating, setThemeRotating] = useState(false)
  const mountedRef = useRef(false)
  const mounted = useSyncExternalStore(
    () => () => {},
    () => (mountedRef.current = true, true),
    () => false
  )

  // Auth check
  useEffect(() => {
    const checkAuth = () => {
      try {
        const stored = localStorage.getItem('rise-auth')
        const userInfo = localStorage.getItem('rise-user-info')
        if (stored && userInfo) {
          const session = JSON.parse(stored)
          const user = JSON.parse(userInfo)
          if (session.access_token && session.access_token !== 'guest') {
            // Validate session
            fetch('/api/auth/session', {
              headers: { 'Authorization': `Bearer ${session.access_token}` }
            }).then(r => r.json()).then(data => {
              if (data.user) {
                setAuth({
                  isAuthenticated: true,
                  userId: data.user.id,
                  userEmail: data.user.email || '',
                  userName: data.user.email?.split('@')[0] || '',
                  isAdmin: data.user.isAdmin,
                  accessToken: session.access_token,
                })
              } else {
                localStorage.removeItem('rise-auth')
                localStorage.removeItem('rise-user-info')
              }
            }).catch(() => {
              // Session invalid, but keep local data accessible
            })
          } else if (session.access_token === 'guest') {
            setAuth({
              isAuthenticated: true,
              userId: 'guest',
              userEmail: 'ضيف',
              userName: 'ضيف',
              isAdmin: false,
              accessToken: 'guest',
            })
          }
        }
      } catch { /* ignore */ }
    }
    checkAuth()
  }, [setAuth])

  const handleLogin = useCallback((data: { user: { id: string; email: string; isAdmin: boolean }; session: { access_token: string; refresh_token: string; expires_at: number } }) => {
    setAuth({
      isAuthenticated: true,
      userId: data.user.id,
      userEmail: data.user.email,
      userName: data.user.email?.split('@')[0] || '',
      isAdmin: data.user.isAdmin,
      accessToken: data.session.access_token,
    })
  }, [setAuth])

  // Keyboard shortcuts (must be before conditional return)
  useKeyboardShortcuts()

  useEffect(() => {
    if (auth) {
      fetch('/api/rise/seed', { method: 'POST' }).catch(() => {})
    }
  }, [auth])

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
      setSearchResults({ tasks: [], habits: [], goals: [], journals: [], books: [], knowledge: [] })
    }
  }, [])

  useEffect(() => {
    if (!searchOpen || searchQuery.length < 2 || !auth) {
      return
    }
    const q = searchQuery.toLowerCase()
    const controller = new AbortController()
    const timer = setTimeout(() => {
      Promise.all([
        fetch('/api/rise/tasks', { signal: controller.signal }).then(r => r.json()).catch(() => ({ tasks: [] })),
        fetch('/api/rise/habits', { signal: controller.signal }).then(r => r.json()).catch(() => ({ habits: [] })),
        fetch('/api/rise/goals', { signal: controller.signal }).then(r => r.json()).catch(() => ({ goals: [] })),
        fetch('/api/rise/journal', { signal: controller.signal }).then(r => r.json()).catch(() => ({ journals: [] })),
        fetch('/api/rise/books', { signal: controller.signal }).then(r => r.json()).catch(() => ({ books: [] })),
        fetch('/api/rise/knowledge', { signal: controller.signal }).then(r => r.json()).catch(() => ({ items: [] })),
      ]).then(([tasksData, habitsData, goalsData, journalsData, booksData, knowledgeData]) => {
        if (controller.signal.aborted) return
        setSearchResults({
          tasks: (tasksData.tasks || []).filter((t: SearchTask) => t.title.toLowerCase().includes(q)).slice(0, 5),
          habits: (habitsData.habits || []).filter((h: SearchHabit) => h.name.toLowerCase().includes(q)).slice(0, 5),
          goals: (goalsData.goals || []).filter((g: SearchGoal) => g.title.toLowerCase().includes(q)).slice(0, 5),
          journals: (journalsData.journals || []).filter((j: SearchJournal) => j.content.toLowerCase().includes(q)).slice(0, 5),
          books: (booksData.books || []).filter((b: SearchBook) => b.title.toLowerCase().includes(q) || (b.author || '').toLowerCase().includes(q)).slice(0, 5),
          knowledge: ((knowledgeData as any).items || []).filter((k: SearchKnowledge) => k.title.toLowerCase().includes(q)).slice(0, 5),
        })
      })
    }, 300)
    return () => { clearTimeout(timer); controller.abort() }
  }, [searchQuery, searchOpen, auth])

  /* Today's date in Arabic */
  const todayArabic = useMemo(() => {
    const now = new Date()
    const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
    const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
    return `${days[now.getDay()]}، ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`
  }, [])

  /* Theme toggle with rotation */
  const handleThemeToggle = useCallback(() => {
    setThemeRotating(true)
    setTheme(theme === 'dark' ? 'light' : 'dark')
    setTimeout(() => setThemeRotating(false), 500)
  }, [theme, setTheme])

  const ActiveComponent = moduleComponents[activeModule]
  const ModuleIcon = moduleIconMap[activeModule]

  // Show login if not authenticated (after all hooks)
  if (!auth) {
    return <LoginPage onLogin={handleLogin} />
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex items-center gap-3 px-3 sm:px-4 md:px-6 py-2.5 bg-background/90 backdrop-blur-md header-gradient-border">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={toggleSidebar}
          >
            <Menu className="w-5 h-5" />
          </Button>

          {/* Module indicator dot */}
          <div className={cn(
            'relative flex items-center justify-center w-7 h-7 rounded-lg shrink-0',
            'bg-muted/50'
          )}>
            <ModuleIcon className="w-3.5 h-3.5 text-foreground/70" />
            <span className={cn(
              'absolute -bottom-0.5 -left-0.5 w-2 h-2 rounded-full',
              moduleAccentMap[activeModule]
            )} />
          </div>

          <div className="flex-1" />

          {/* Search trigger */}
          <Button
            variant="outline"
            className="hidden sm:flex items-center gap-2 text-muted-foreground h-9 px-3 text-sm font-normal border-dashed search-glass-btn"
            onClick={() => setSearchOpen(true)}
          >
            <Search className="w-4 h-4" />
            <span>بحث...</span>
            <kbd className="pointer-events-none ml-1 inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              ⌘K
            </kbd>
          </Button>

          {/* Connection Status */}
          <ConnectionStatus />

          {/* Bluetooth Share */}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground hover:text-blue-500"
            onClick={() => setBtPanelOpen(true)}
            title="مشاركة بلوتوث"
          >
            <Bluetooth className="w-4 h-4" />
          </Button>

          {/* Theme toggle with rotation */}
          {mounted && (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={handleThemeToggle}
            >
              <span className={cn(themeRotating && 'theme-rotate', 'inline-flex')}>
                {theme === 'dark' ? (
                  <Sun className="w-4 h-4" />
                ) : (
                  <Moon className="w-4 h-4" />
                )}
              </span>
            </Button>
          )}

          {/* User avatar / logout */}
          {mounted && auth && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 gap-2 text-xs text-muted-foreground hover:text-destructive"
              onClick={logout}
              title={auth.userEmail}
            >
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-accent to-forest flex items-center justify-center">
                <span className="text-[10px] font-bold text-white">{auth.userName.charAt(0).toUpperCase()}</span>
              </div>
              <span className="hidden sm:inline max-w-[100px] truncate">{auth.userName}</span>
              {auth.isAdmin && <span className="text-[9px] bg-gold/20 text-gold px-1.5 py-0.5 rounded-full font-medium">أدمن</span>}
              <LogOut className="w-3.5 h-3.5" />
            </Button>
          )}
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeModule}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="p-4 md:p-6"
            >
              {/* Module title with accent bar & date */}
              <div className="mb-6 flex items-stretch gap-3 module-title-animate" key={`title-${activeModule}`}>
                <div className={cn(
                  'w-1 rounded-full shrink-0',
                  moduleAccentMap[activeModule]
                )} />
                <div className="flex flex-col justify-center">
                  <h2 className="text-2xl font-bold tracking-tight">
                    {moduleNames[activeModule]}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">{todayArabic}</p>
                </div>
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
            <CommandGroup heading={`المهام (${searchResults.tasks.length})`}>
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
            <CommandGroup heading={`العادات (${searchResults.habits.length})`}>
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
            <CommandGroup heading={`الأهداف (${searchResults.goals.length})`}>
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

          {searchQuery.length >= 2 && searchResults.journals.length > 0 && (
            <CommandGroup heading={`اليوميات (${searchResults.journals.length})`}>
              {searchResults.journals.map((journal) => (
                <CommandItem
                  key={journal.id}
                  onSelect={() => {
                    setActiveModule('journal')
                    setSearchOpen(false)
                  }}
                  className="flex-row-reverse justify-end gap-2"
                >
                  <BookOpen className="w-4 h-4 text-forest shrink-0" />
                  <span className="flex-1 text-right truncate">{journal.content.slice(0, 60)}...</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">{journal.date}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {searchQuery.length >= 2 && searchResults.books.length > 0 && (
            <CommandGroup heading={`الكتب (${searchResults.books.length})`}>
              {searchResults.books.map((book) => (
                <CommandItem
                  key={book.id}
                  onSelect={() => {
                    setActiveModule('reading')
                    setSearchOpen(false)
                  }}
                  className="flex-row-reverse justify-end gap-2"
                >
                  <BookOpen className="w-4 h-4 text-gold shrink-0" />
                  <span className="flex-1 text-right truncate">{book.title}</span>
                  {book.author && <span className="text-[10px] text-muted-foreground shrink-0">{book.author}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {searchQuery.length >= 2 && searchResults.knowledge.length > 0 && (
            <CommandGroup heading={`الملفات (${searchResults.knowledge.length})`}>
              {searchResults.knowledge.map((item) => (
                <CommandItem
                  key={item.id}
                  onSelect={() => {
                    setActiveModule('brain')
                    setSearchOpen(false)
                  }}
                  className="flex-row-reverse justify-end gap-2"
                >
                  <Network className="w-4 h-4 text-emerald-accent shrink-0" />
                  <span className="flex-1 text-right truncate">{item.title}</span>
                  {item.folder && <span className="text-[10px] text-muted-foreground shrink-0">{item.folder}</span>}
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

      {/* Keyboard Shortcuts Dialog */}
      <KeyboardShortcutsDialog />

      {/* ══════════ FAB - Quick Add ══════════ */}
      <AnimatePresence>
        {activeModule !== 'dashboard' && activeModule !== 'settings' && (
          <div className="fixed bottom-5 right-5 z-50 flex flex-col-reverse items-center gap-3">
            {/* Action items */}
            <AnimatePresence>
              {fabOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.15 }}
                  className="flex flex-col gap-2 mb-2"
                >
                  {([
                    { label: 'مهمة جديدة', icon: CheckSquare, module: 'tasks' as ModuleId, color: 'text-emerald-accent' },
                    { label: 'عادة جديدة', icon: Flame, module: 'habits' as ModuleId, color: 'text-orange-500' },
                    { label: 'يومية جديدة', icon: PenLine, module: 'journal' as ModuleId, color: 'text-forest' },
                    { label: 'تسجيل صحي', icon: HeartPulse, module: 'health' as ModuleId, color: 'text-rose-500' },
                  ] as const).map((action) => {
                    const ActionIcon = action.icon
                    return (
                      <button
                        key={action.label}
                        onClick={() => {
                          setFabOpen(false)
                          setActiveModule(action.module)
                        }}
                        className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl glass border border-white/10 dark:border-white/5 shadow-lg hover:shadow-xl transition-shadow group"
                      >
                        <div className="w-7 h-7 rounded-lg bg-muted/60 flex items-center justify-center">
                          <ActionIcon className={cn('w-3.5 h-3.5', action.color)} />
                        </div>
                        <span className="text-sm font-medium text-foreground whitespace-nowrap">{action.label}</span>
                      </button>
                    )
                  })}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Main FAB button */}
            <motion.button
              layout
              onClick={() => setFabOpen(!fabOpen)}
              className={cn(
                'w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center shadow-xl transition-shadow',
                'bg-gradient-to-br from-emerald-accent to-forest',
                'hover:shadow-emerald-accent/30 hover:shadow-2xl'
              )}
              whileTap={{ scale: 0.93 }}
            >
              <motion.span
                animate={{ rotate: fabOpen ? 45 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <Zap className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </motion.span>
            </motion.button>
          </div>
        )}
      </AnimatePresence>

      {/* PWA: install prompt, connection status, offline banner */}
      <PWAInstallPrompt />
      <OfflineBanner />

      {/* Bluetooth Share Panel */}
      <BluetoothSharePanel isOpen={btPanelOpen} onClose={() => setBtPanelOpen(false)} />
    </div>
  )
}