'use client'

/* ─────────────────────────────────────────────────────────────
   Global SVG fix: Recharts internally calls setAttribute('r', undefined)
   which causes "Expected length, undefined" errors in the browser.
   This patch converts undefined/null/NaN r values to '0'.
   ───────────────────────────────────────────────────────────── */
if (typeof window !== 'undefined' && typeof SVGElement !== 'undefined') {
  const _origSetAttr = SVGElement.prototype.setAttribute
  SVGElement.prototype.setAttribute = function (name: string, value: any) {
    if (name === 'r' && (value === undefined || value === null || (typeof value === 'number' && isNaN(value)))) {
      _origSetAttr.call(this, name, '0')
    } else {
      _origSetAttr.call(this, name, value)
    }
  }
}

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useRiseStore } from '@/store/app-store'
import {
  Menu, Search, Sparkles, Plus,
  Flame, Target, BookOpen, Network,
  LogOut, Zap, Circle, CheckCircle2,
} from 'lucide-react'
import { RiseIcon, RiseGlyphIcon, MODULE_ICONS, type RiseGlyph, type RiseHue } from '@/components/rise/icons'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ModuleId } from '@/store/app-store'
import { apiPost, apiGet, clearAllCache } from '@/lib/api-fetch'
import { ModuleErrorBoundary } from '@/components/module-error-boundary'
import { ThemeToggle } from '@/components/rise/neo'
import { GlassNav } from '@/components/rise/glass-nav'

// Keyboard shortcuts hook — lightweight, can be eagerly imported
import { useKeyboardShortcuts } from '@/components/rise/keyboard-shortcuts'
import { useToday } from '@/hooks/use-today'
// Command Dialog — lazy loaded (only needed when ⌘K pressed, heavy: cmdk)
const CommandDialog = lazy(() => import('@/components/ui/command').then(m => ({ default: m.CommandDialog })))
const CommandInput = lazy(() => import('@/components/ui/command').then(m => ({ default: m.CommandInput })))
const CommandList = lazy(() => import('@/components/ui/command').then(m => ({ default: m.CommandList })))
const CommandEmpty = lazy(() => import('@/components/ui/command').then(m => ({ default: m.CommandEmpty })))
const CommandGroup = lazy(() => import('@/components/ui/command').then(m => ({ default: m.CommandGroup })))
const CommandItem = lazy(() => import('@/components/ui/command').then(m => ({ default: m.CommandItem })))
// Keyboard Shortcuts Dialog — lazy
const KeyboardShortcutsDialog = lazy(() =>
  import('@/components/rise/keyboard-shortcuts').then(m => ({ default: m.KeyboardShortcutsDialog }))
)

// Heavy components — lazy loaded to reduce initial JS bundle
const Sidebar = lazy(() => import('@/components/rise/sidebar').then(m => ({ default: m.Sidebar })))
// LoginPage: NOT lazy — it's the LCP element (first thing users see)
import LoginPage from '@/components/rise/login-page'
// PWA components — lazy loaded
const PWAInstallPrompt = lazy(() => import('@/lib/pwa').then(m => ({ default: m.PWAInstallPrompt })))

import Onboarding from '@/components/rise/onboarding'
const NotificationBell = lazy(() => import('@/components/rise/notification-bell').then(m => ({ default: m.NotificationBell })))
const ReminderEngine = lazy(() => import('@/components/rise/reminder-engine').then(m => ({ default: m.ReminderEngine })))

// Lazy load all modules
const Dashboard = lazy(() => import('@/components/rise/dashboard').then(m => ({ default: m.default })))
const MorningRoutine = lazy(() => import('@/components/rise/morning-routine').then(m => ({ default: m.default })))
const DailyPlanner = lazy(() => import('@/components/rise/daily-planner').then(m => ({ default: m.default })))
const Tasks = lazy(() => import('@/components/rise/tasks').then(m => ({ default: m.default })))
const Projects = lazy(() => import('@/components/rise/projects').then(m => ({ default: m.default })))
const Goals = lazy(() => import('@/components/rise/goals').then(m => ({ default: m.default })))
const Habits = lazy(() => import('@/components/rise/habits').then(m => ({ default: m.default })))
const Journal = lazy(() => import('@/components/rise/journal').then(m => ({ default: m.default })))
const DeepWork = lazy(() => import('@/components/rise/deep-work').then(m => ({ default: m.default })))
const WorkSessions = lazy(() => import('@/components/rise/work').then(m => ({ default: m.default })))
const Reading = lazy(() => import('@/components/rise/reading').then(m => ({ default: m.default })))
const Learning = lazy(() => import('@/components/rise/learning').then(m => ({ default: m.default })))
const Health = lazy(() => import('@/components/rise/health').then(m => ({ default: m.default })))
const Finance = lazy(() => import('@/components/rise/finance').then(m => ({ default: m.default })))
const Calendar = lazy(() => import('@/components/rise/calendar').then(m => ({ default: m.default })))
const SecondBrain = lazy(() => import('@/components/rise/second-brain').then(m => ({ default: m.default })))
const WeeklyReview = lazy(() => import('@/components/rise/weekly-review').then(m => ({ default: m.default })))
const MonthlyReview = lazy(() => import('@/components/rise/monthly-review').then(m => ({ default: m.default })))
const Analytics = lazy(() => import('@/components/rise/analytics').then(m => ({ default: m.default })))
const AICoach = lazy(() => import('@/components/rise/ai-coach').then(m => ({ default: m.default })))
const AdminPanel = lazy(() => import('@/components/rise/admin-panel').then(m => ({ default: m.default })))
const Settings = lazy(() => import('@/components/rise/settings').then(m => ({ default: m.default })))

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
  'work': WorkSessions,
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
  'admin-panel': AdminPanel,
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
  'work': 'الشغل',
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
  'admin-panel': 'لوحة الإدارة',
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

/* Module identity via the Neo duotone icon system */
const HUE_GRADIENT: Record<string, string> = {
  lime: 'linear-gradient(135deg, #A8CC22, #D6FF3D)',
  blue: 'linear-gradient(135deg, #007AFF, #4DA2FF)',
  violet: 'linear-gradient(135deg, #8B5CF6, #C4B5FD)',
  rose: 'linear-gradient(135deg, #FF5A76, #FFA3B2)',
  amber: 'linear-gradient(135deg, #F59E0B, #FCD34D)',
  forest: 'linear-gradient(135deg, #1B342B, #34D399)',
  cyan: 'linear-gradient(135deg, #06B6D4, #67E8F9)',
}
const moduleMeta = (id: ModuleId) =>
  MODULE_ICONS[id as string] ?? { glyph: 'dashboard' as RiseGlyph, hue: 'lime' as RiseHue }

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
  const mountedRef = useRef(false)

  // ─── Day-rollover detection ───────────────────────────────────────────
  // When midnight passes (or the tab regains focus after being inactive
  // overnight), this hook clears the API cache and dispatches global events
  // so every module re-fetches fresh "today" data — no logout/login needed.
  useToday()
  const mounted = useSyncExternalStore(
    () => () => {},
    () => (mountedRef.current = true, true),
    () => false
  )

  // Auth check — simplified. The AuthProvider (in layout.tsx) handles:
  //   • Supabase onAuthStateChange (SIGNED_IN, TOKEN_REFRESHED, SIGNED_OUT)
  //   • autoRefreshToken (refreshes JWT ~60s before expiry)
  //   • syncing refreshed token to the httpOnly cookie
  //   • restoring session from cookie/localStorage on mount
  //   • listening for 'rise:session-expired' events (from api-fetch 401 handler)
  //
  // Here we only need to handle the INITIAL state — if the user has a
  // stored session in localStorage, set it immediately (offline-first,
  // zero delay) so the UI doesn't flash the login page.
  useEffect(() => {
    try {
      const stored = localStorage.getItem('rise-auth')
      const userInfo = localStorage.getItem('rise-user-info')
      if (stored && userInfo) {
        const session = JSON.parse(stored)
        const info = JSON.parse(userInfo)
        if (session.access_token && !useRiseStore.getState().auth) {
          setAuth({
            isAuthenticated: true,
            userId: info.id || '',
            userEmail: info.email || '',
            userName: info.name || '',
            isAdmin: info.isAdmin || false,
            accessToken: session.access_token,
          })
        }
      }
    } catch { /* ignore */ }
  }, [setAuth])

  const handleLogin = useCallback((data: { user: { id: string; email: string; name: string; isAdmin: boolean }; session: { access_token: string; refresh_token: string; expires_at: number } }) => {
    // Clear any leftover cache from previous user to prevent cross-user data leaks
    clearAllCache()
    // Store full session (including refresh_token for Supabase)
    localStorage.setItem('rise-auth', JSON.stringify(data.session))
    localStorage.setItem('rise-user-info', JSON.stringify(data.user))
    setAuth({
      isAuthenticated: true,
      userId: data.user.id,
      userEmail: data.user.email,
      userName: data.user.name || data.user.email?.split('@')[0] || '',
      isAdmin: data.user.isAdmin,
      accessToken: data.session.access_token,
    })
  }, [setAuth])

  // Keyboard shortcuts (must be before conditional return)
  useKeyboardShortcuts()

  // NOTE: Auto-seed removed — new accounts start empty (no fake data).
  // Users can manually seed via Settings if they want demo data.

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

  // Listen for user-updated events to refresh user data from session
  useEffect(() => {
    const handler = async () => {
      try {
        const res = await apiGet('/api/auth/session')
        if (res.ok) {
          const data = await res.json()
          if (data.user) {
            const storedInfo = localStorage.getItem('rise-user-info')
            const parsed = storedInfo ? JSON.parse(storedInfo) : {}
            const current = useRiseStore.getState().auth
            if (current) {
              setAuth({
                ...current,
                userName: data.user.name || parsed?.name || current.userName,
                userEmail: data.user.email || current.userEmail,
              })
            }
            // Also update localStorage
            localStorage.setItem('rise-user-info', JSON.stringify({
              ...parsed,
              name: data.user.name || parsed?.name,
              email: data.user.email || parsed?.email,
            }))
          }
        }
      } catch {
        // silent
      }
    }
    window.addEventListener('rise:user-updated', handler)
    return () => window.removeEventListener('rise:user-updated', handler)
  }, [setAuth])

  // Listen for token refresh events from api-fetch
  // NOTE: 'rise:session-expired' is handled by AuthProvider (in layout.tsx)
  // which calls logout() — no need for a duplicate listener here.
  useEffect(() => {
    const handleRefresh = (e: CustomEvent) => {
      const { user, session } = e.detail || {}
      if (user && session) {
        setAuth({
          isAuthenticated: true,
          userId: user.id,
          userEmail: user.email || '',
          userName: user.name || '',
          isAdmin: user.isAdmin,
          accessToken: session.access_token,
        })
      }
    }
    window.addEventListener('rise:auth-refreshed', handleRefresh as EventListener)
    return () => {
      window.removeEventListener('rise:auth-refreshed', handleRefresh as EventListener)
    }
  }, [setAuth])

  // Notification clicks & reminder CTAs dispatch 'rise:navigate' with a
  // module id (or /app/<id>) — jump to that module.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      const target = String(detail || '').replace(/^\/app\/?/, '').replace(/^\//, '')
      if ((moduleNames as Record<string, string>)[target]) {
        setActiveModule(target as ModuleId)
      }
    }
    window.addEventListener('rise:navigate', handler)
    return () => window.removeEventListener('rise:navigate', handler)
  }, [setActiveModule])

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
        apiGet('/api/rise/tasks').then(r => r.json()).catch(() => ({ tasks: [] })),
        apiGet('/api/rise/habits').then(r => r.json()).catch(() => ({ habits: [] })),
        apiGet('/api/rise/goals').then(r => r.json()).catch(() => ({ goals: [] })),
        apiGet('/api/rise/journal').then(r => r.json()).catch(() => ({ journals: [] })),
        apiGet('/api/rise/books').then(r => r.json()).catch(() => ({ books: [] })),
        apiGet('/api/rise/knowledge').then(r => r.json()).catch(() => ({ items: [] })),
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

  const ActiveComponent = moduleComponents[activeModule]
  const activeMeta = moduleMeta(activeModule)

  // Show login if not authenticated (after all hooks)
  if (!auth) {
    return <Suspense fallback={<LoadingFallback />}><LoginPage onLogin={handleLogin as any} /></Suspense>
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Suspense fallback={null}><Sidebar /></Suspense>

      {/* Global reminder dispatcher — habit/wake/sleep reminders on every page */}
      <Suspense fallback={null}><ReminderEngine /></Suspense>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex items-center gap-3 px-3 sm:px-4 md:px-6 py-2.5 bg-background/90 backdrop-blur-md header-gradient-border">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={toggleSidebar}
            aria-label="فتح القائمة الجانبية"
          >
            <Menu className="w-5 h-5" />
          </Button>

          {/* Module identity — hue well with the Neo glyph */}
          <RiseIcon
            glyph={activeMeta.glyph}
            hue={activeMeta.hue}
            size="sm"
            lift
            key={activeModule}
          />

          <div className="flex-1" />

          {/* Search trigger — desktop */}
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

          {/* Search trigger — mobile (icon only) */}
          <Button
            variant="ghost"
            size="icon"
            className="sm:hidden h-9 w-9"
            onClick={() => setSearchOpen(true)}
            aria-label="بحث"
          >
            <Search className="w-4 h-4" />
          </Button>

          {/* Notifications */}
          <Suspense fallback={null}><NotificationBell /></Suspense>

          {/* Animated day/night theme toggle (Neo) */}
          {mounted && <ThemeToggle />}

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
                <span className="text-[10px] font-bold text-white">{String(auth.userName || 'م').charAt(0)?.toUpperCase() || 'م'}</span>
              </div>
              <span className="hidden sm:inline max-w-[100px] truncate">{auth.userName}</span>
              {auth.isAdmin && <span className="text-[9px] bg-gold/20 text-gold px-1.5 py-0.5 rounded-full font-medium">أدمن</span>}
              <LogOut className="w-3.5 h-3.5" />
            </Button>
          )}
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto" style={{ containIntrinsicSize: 'auto' }}>
            <div
              key={activeModule}
              className="p-3 sm:p-4 md:p-6 pb-28 lg:pb-6 min-h-[calc(100vh-60px)] animate-[fadeSlideIn_0.2s_ease-out]"
            >
              {/* Module title with hue gradient bar & date */}
              <div className="mb-4 sm:mb-6 flex items-stretch gap-2 sm:gap-3 module-title-animate" key={`title-${activeModule}`}>
                <div
                  className="w-1.5 rounded-full shrink-0"
                  style={{ background: HUE_GRADIENT[activeMeta.hue] }}
                  aria-hidden="true"
                />
                <div className="flex flex-col justify-center">
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
                    {moduleNames[activeModule]}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">{todayArabic}</p>
                </div>
              </div>
              <Suspense fallback={<LoadingFallback />}>
                <ModuleErrorBoundary moduleName={moduleNames[activeModule]}>
                  <ActiveComponent />
                </ModuleErrorBoundary>
              </Suspense>
            </div>
        </div>
      </main>

      {/* Mobile glass bottom navigation (Neo) */}
      <GlassNav />

      {/* Command palette — lazy loaded */}
      <Suspense fallback={null}>
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
      </Suspense>

      {/* Keyboard Shortcuts Dialog */}
      <Suspense fallback={null}>
      <KeyboardShortcutsDialog />
      </Suspense>

      {/* ══════════ FAB - Quick Add ══════════ */}
        {activeModule !== 'dashboard' && activeModule !== 'settings' && (
          <div className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] right-4 z-50 flex flex-col-reverse items-center gap-3 lg:bottom-5 lg:right-5">
            {/* Action items */}
              {fabOpen && (
                <div
                  className="flex flex-col gap-2 mb-2 animate-[fadeSlideUp_0.15s_ease-out]"
                >
                  {([
                    { label: 'مهمة جديدة', glyph: 'tasks', module: 'tasks' as ModuleId },
                    { label: 'عادة جديدة', glyph: 'habits', module: 'habits' as ModuleId },
                    { label: 'يومية جديدة', glyph: 'journal', module: 'journal' as ModuleId },
                    { label: 'تسجيل صحي', glyph: 'health', module: 'health' as ModuleId },
                  ] as const).map((action) => {
                    const meta = MODULE_ICONS[action.glyph]
                    return (
                      <button
                        key={action.label}
                        onClick={() => {
                          setFabOpen(false)
                          setActiveModule(action.module)
                        }}
                        className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl glass border border-white/10 dark:border-white/5 shadow-lg hover:shadow-xl transition-shadow group"
                      >
                        <RiseIcon glyph={meta.glyph} hue={meta.hue} size="sm" className="!rounded-lg" />
                        <span className="text-sm font-medium text-foreground whitespace-nowrap">{action.label}</span>
                      </button>
                    )
                  })}
                </div>
              )}

            {/* Main FAB button */}
            <button
              onClick={() => setFabOpen(!fabOpen)}
              aria-label={fabOpen ? 'إغلاق القائمة السريعة' : 'فتح القائمة السريعة'}
              className={cn(
                'w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center shadow-xl transition-all active:scale-93',
                'bg-gradient-to-br from-emerald-accent to-forest',
                'hover:shadow-emerald-accent/30 hover:shadow-2xl'
              )}
            >
              <span
                className={cn('transition-transform duration-200', fabOpen && 'rotate-45')}
              >
                <Zap className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </span>
            </button>
          </div>
        )}

      {/* PWA: install prompt */}
      <Suspense fallback={null}><PWAInstallPrompt /></Suspense>

      {/* Onboarding for first-time users — wrapped in ErrorBoundary so
          a crash in Onboarding never takes down the main app */}
      <Suspense fallback={null}>
        <ModuleErrorBoundary moduleName="Onboarding">
          <Onboarding />
        </ModuleErrorBoundary>
      </Suspense>

    </div>
  )
}