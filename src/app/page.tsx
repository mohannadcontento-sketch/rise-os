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
  CheckCircle2, Circle, Flame, Menu, Moon, Sun, Search, Target,
  LayoutDashboard, CalendarDays, CheckSquare, FolderKanban, BookOpen,
  Brain, GraduationCap, Heart, HeartPulse, LogOut, PenLine,
  Wallet, Calendar as CalendarIcon, Network, BarChart3,
  Sparkles, Settings as SettingsIcon, Zap, ShieldCheck,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ModuleId } from '@/store/app-store'
import { apiPost, apiGet, clearAllCache } from '@/lib/api-fetch'
import { ModuleErrorBoundary } from '@/components/module-error-boundary'
import { useSupabaseRealtime } from '@/hooks/use-supabase-realtime'

// Keyboard shortcuts (uses a hook — must be eagerly imported)
import { useKeyboardShortcuts, KeyboardShortcutsDialog } from '@/components/rise/keyboard-shortcuts'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'

// Heavy components — lazy loaded to reduce initial JS bundle
const Sidebar = lazy(() => import('@/components/rise/sidebar').then(m => ({ default: m.Sidebar })))
const LoginPage = lazy(() => import('@/components/rise/login-page'))
// PWA components — lazy loaded
const PWAInstallPrompt = lazy(() => import('@/lib/pwa').then(m => ({ default: m.PWAInstallPrompt })))

const Onboarding = lazy(() => import('@/components/rise/onboarding'))
const CelebrationOverlay = lazy(() => import('@/components/celebration-overlay'))
const MobileBottomNav = lazy(() => import('@/components/mobile-bottom-nav'))
const NotificationBell = lazy(() => import('@/components/rise/notification-bell').then(m => ({ default: m.NotificationBell })))

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
const AdminPanel = lazy(() => import('@/components/rise/admin-panel'))
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
  'admin-panel': ShieldCheck,
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
  'admin-panel': 'bg-gold',
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
  // Track visited modules to keep them mounted (preserves state across tab switches)
  const [visitedModules, setVisitedModules] = useState<Set<ModuleId>>(() => new Set([activeModule]))
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync visited modules with external store
    setVisitedModules(prev => prev.has(activeModule) ? prev : new Set([...prev, activeModule]))
  }, [activeModule])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{
    tasks: SearchTask[]; habits: SearchHabit[]; goals: SearchGoal[]
    journals: SearchJournal[]; books: SearchBook[]; knowledge: SearchKnowledge[]
  }>({ tasks: [], habits: [], goals: [], journals: [], books: [], knowledge: [] })
  const [fabOpen, setFabOpen] = useState(false)
  const [themeRotating, setThemeRotating] = useState(false)

  // ── Supabase Realtime: live data sync across tabs/devices ──
  useSupabaseRealtime(auth?.userId ?? null, auth?.accessToken ?? null)

  const mountedRef = useRef(false)
  const mounted = useSyncExternalStore(
    () => () => {},
    () => (mountedRef.current = true, true),
    () => false
  )

  // Auth check — OFFLINE-FIRST: trust stored session instantly, validate in background
  useEffect(() => {
    const checkAuth = () => {
      try {
        const stored = localStorage.getItem('rise-auth')
        const userInfo = localStorage.getItem('rise-user-info')
        if (!stored || !userInfo) return // No session — show login

        const session = JSON.parse(stored)
        if (!session.access_token) {
          localStorage.removeItem('rise-auth')
          localStorage.removeItem('rise-user-info')
          return
        }

        // ✅ INSTANT: Set auth from localStorage immediately (zero delay)
        const storedInfo = JSON.parse(userInfo)
        const isSupabaseSession = session.refresh_token && session.refresh_token.length > 20
        setAuth({
          isAuthenticated: true,
          userId: isSupabaseSession ? (storedInfo?.id || session.access_token) : session.access_token,
          userEmail: storedInfo?.email || '',
          userName: storedInfo?.name || '',
          isAdmin: storedInfo?.isAdmin || false,
          accessToken: session.access_token,
        })

        // 🔍 BACKGROUND: Validate session with server (non-blocking)
        // Skip if offline
        if (navigator.onLine === false) return

        // For Supabase sessions, check if token needs refresh first
        if (isSupabaseSession && session.expires_at) {
          const expiresAtMs = session.expires_at * 1000
          const fiveMin = 5 * 60 * 1000
          if (expiresAtMs - Date.now() < fiveMin) {
            fetch('/api/auth/refresh', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ refresh_token: session.refresh_token }),
            }).then(r => r.json()).then(data => {
              if (data.session) {
                localStorage.setItem('rise-auth', JSON.stringify(data.session))
                localStorage.setItem('rise-user-info', JSON.stringify(data.user))
                setAuth({
                  isAuthenticated: true,
                  userId: data.user.id,
                  userEmail: data.user.email || '',
                  userName: data.user.name || '',
                  isAdmin: data.user.isAdmin,
                  accessToken: data.session.access_token,
                })
              }
              // If refresh failed but we're already showing the UI, keep it —
              // the token might still be valid for a few more minutes
            }).catch(() => { /* offline — already showing UI */ })
            return
          }
        }

        // Validate session in background
        apiGet('/api/auth/session').then(r => r.json()).then(data => {
          if (data.user) {
            // Session valid — update with fresh server data
            const current = useRiseStore.getState().auth
            if (current) {
              setAuth({
                ...current,
                userName: data.user.name || current.userName,
                userEmail: data.user.email || current.userEmail,
                userId: data.user.id,
                isAdmin: data.user.isAdmin,
              })
            }
          } else if (isSupabaseSession) {
            // Supabase session invalid — try refresh
            fetch('/api/auth/refresh', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ refresh_token: session.refresh_token }),
            }).then(r => r.json()).then(refreshData => {
              if (refreshData.session) {
                localStorage.setItem('rise-auth', JSON.stringify(refreshData.session))
                localStorage.setItem('rise-user-info', JSON.stringify(refreshData.user))
                setAuth({
                  isAuthenticated: true,
                  userId: refreshData.user.id,
                  userEmail: refreshData.user.email || '',
                  userName: refreshData.user.name || '',
                  isAdmin: refreshData.user.isAdmin,
                  accessToken: refreshData.session.access_token,
                })
              } else {
                // Both session and refresh failed — clear
                localStorage.removeItem('rise-auth')
                localStorage.removeItem('rise-user-info')
                setAuth(null)
              }
            }).catch(() => {
              // Network error — keep showing UI with stored session
            })
          }
          // For local sessions, always trust stored data
        }).catch(() => {
          // Network error — already showing UI with stored session
        })
      } catch {
        localStorage.removeItem('rise-auth')
        localStorage.removeItem('rise-user-info')
      }
    }
    checkAuth()
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

  // Seed sample data on first login (seed route deduplicates internally)
  const seedCalledRef = useRef(false)
  useEffect(() => {
    if (auth && auth.accessToken && !seedCalledRef.current) {
      seedCalledRef.current = true
      apiPost('/api/rise/seed', { createProfileOnly: true }).catch(() => {})
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
    const handleExpired = () => {
      setAuth(null)
    }
    window.addEventListener('rise:auth-refreshed', handleRefresh as EventListener)
    window.addEventListener('rise:session-expired', handleExpired)
    return () => {
      window.removeEventListener('rise:auth-refreshed', handleRefresh as EventListener)
      window.removeEventListener('rise:session-expired', handleExpired)
    }
  }, [setAuth])

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

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (!searchOpen || searchQuery.length < 2 || !auth) {
      return
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    const q = searchQuery.toLowerCase()
    const controller = new AbortController()

    searchTimeoutRef.current = setTimeout(() => {
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
    }, 500)

    return () => { 
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
      controller.abort() 
    }
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

  const ModuleIcon = moduleIconMap[activeModule]

  // Show login if not authenticated (after all hooks)
  if (!auth) {
    return <Suspense fallback={<LoadingFallback />}><LoginPage onLogin={handleLogin as any} /></Suspense>
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Suspense fallback={<div className="w-16 lg:w-60 h-screen bg-background" />}><Sidebar /></Suspense>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex items-center gap-3 px-3 sm:px-4 md:px-6 py-2.5 bg-background/90 backdrop-blur-md header-gradient-border pt-[max(0.625rem,env(safe-area-inset-top))]">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={toggleSidebar}
            aria-label="فتح القائمة الجانبية"
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

          {/* Notifications */}
          <Suspense fallback={null}><NotificationBell /></Suspense>

          {/* Theme toggle with rotation */}
          {mounted && (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={handleThemeToggle}
              aria-label={theme === 'dark' ? 'التبديل للوضع الفاتح' : 'التبديل للوضع الداكن'}
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
                <span className="text-[10px] font-bold text-white">{String(auth.userName || 'م').charAt(0)?.toUpperCase() || 'م'}</span>
              </div>
              <span className="hidden sm:inline max-w-[100px] truncate">{auth.userName}</span>
              {auth.isAdmin && <span className="text-[9px] bg-gold/20 text-gold px-1.5 py-0.5 rounded-full font-medium">أدمن</span>}
              <LogOut className="w-3.5 h-3.5" />
            </Button>
          )}
        </header>

        {/* Content — render ALL visited modules, show only active one (preserves state) */}
        <div className="flex-1 overflow-y-auto pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">
          {(Object.keys(moduleComponents) as ModuleId[]).map((modId) => {
            if (!visitedModules.has(modId)) return null
            const Comp = moduleComponents[modId]
            const isActive = modId === activeModule
            return (
              <div
                key={modId}
                className={cn(
                  'p-4 md:p-6',
                  isActive ? 'animate-[fadeSlideIn_0.2s_ease-out]' : 'hidden'
                )}
              >
                {/* Module title with accent bar & date */}
                <div className="mb-6 flex items-stretch gap-3">
                  <div className={cn(
                    'w-1 rounded-full shrink-0',
                    moduleAccentMap[modId]
                  )} />
                  <div className="flex flex-col justify-center">
                    <h2 className="text-2xl font-bold tracking-tight">
                      {moduleNames[modId]}
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">{todayArabic}</p>
                  </div>
                </div>
                <Suspense fallback={<LoadingFallback />}>
                  <ModuleErrorBoundary moduleName={moduleNames[modId]}>
                    <Comp />
                  </ModuleErrorBoundary>
                </Suspense>
              </div>
            )
          })}
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
        {activeModule !== 'dashboard' && activeModule !== 'settings' && (
          <div className="fixed bottom-5 right-5 z-50 flex flex-col-reverse items-center gap-3">
            {/* Action items */}
              {fabOpen && (
                <div
                  className="flex flex-col gap-2 mb-2 animate-[fadeSlideUp_0.15s_ease-out]"
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

      {/* Celebration particles on completions */}
      <Suspense fallback={null}><CelebrationOverlay /></Suspense>

      {/* Mobile bottom navigation */}
      <Suspense fallback={null}><MobileBottomNav /></Suspense>

      {/* Onboarding for first-time users */}
      <Suspense fallback={null}><Onboarding /></Suspense>

    </div>
  )
}