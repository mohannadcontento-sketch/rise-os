'use client'

import { useRiseStore, type ModuleId } from '@/store/app-store'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/api-fetch'
import {
  LayoutDashboard,
  Sun,
  CalendarDays,
  CheckSquare,
  FolderKanban,
  Target,
  Flame,
  BookOpen,
  Brain,
  Clock,
  GraduationCap,
  Heart,
  Wallet,
  Calendar,
  Network,
  BarChart3,
  Sparkles,
  Settings,
  X,
  ChevronLeft,
  ChevronDown,
  Zap,
  TrendingUp,
  Pencil,
} from 'lucide-react'
import { useEffect, useState, useRef } from 'react'

interface NavItem {
  id: ModuleId
  label: string
  icon: React.ElementType
}

interface NavGroup {
  title: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    title: '',
    items: [{ id: 'dashboard', label: 'لوحة التحكم', icon: LayoutDashboard }],
  },
  {
    title: 'الصباح',
    items: [
      { id: 'morning', label: 'الروتين الصباحي', icon: Sun },
      { id: 'planner', label: 'المخطط اليومي', icon: CalendarDays },
    ],
  },
  {
    title: 'الإنتاجية',
    items: [
      { id: 'tasks', label: 'المهام', icon: CheckSquare },
      { id: 'projects', label: 'المشاريع', icon: FolderKanban },
      { id: 'goals', label: 'الأهداف', icon: Target },
    ],
  },
  {
    title: 'التطوير',
    items: [
      { id: 'habits', label: 'تتبع العادات', icon: Flame },
      { id: 'journal', label: 'اليوميات', icon: BookOpen },
      { id: 'deepwork', label: 'العمل العميق', icon: Brain },
    ],
  },
  {
    title: 'النمو',
    items: [
      { id: 'reading', label: 'القراءة', icon: BookOpen },
      { id: 'learning', label: 'التعلم', icon: GraduationCap },
      { id: 'brain', label: 'الدماغ الثاني', icon: Network },
    ],
  },
  {
    title: 'الحياة',
    items: [
      { id: 'health', label: 'الصحة', icon: Heart },
      { id: 'finance', label: 'المالية', icon: Wallet },
      { id: 'calendar', label: 'التقويم', icon: Calendar },
    ],
  },
  {
    title: 'الرؤية',
    items: [
      { id: 'weekly-review', label: 'مراجعة أسبوعية', icon: TrendingUp },
      { id: 'monthly-review', label: 'مراجعة شهرية', icon: BarChart3 },
      { id: 'analytics', label: 'التحليلات', icon: BarChart3 },
      { id: 'ai-coach', label: 'المدرب الذكي', icon: Sparkles },
    ],
  },
  {
    title: '',
    items: [{ id: 'settings', label: 'الإعدادات', icon: Settings }],
  },
]

function toArabicNum(n: number): string {
  return n.toString().replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[parseInt(d)])
}

export function Sidebar() {
  const { activeModule, setActiveModule, sidebarOpen, setSidebarOpen, user, setUser, auth } = useRiseStore()
  const [notesExpanded, setNotesExpanded] = useState(false)
  const [quickNotes, setQuickNotes] = useState('')
  const notesRef = useRef<HTMLTextAreaElement>(null)
  const [notesLoaded, setNotesLoaded] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setSidebarOpen])

  // Load quick notes from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('rise-quick-notes')
      if (stored) setQuickNotes(stored)
    } catch { /* ignore */ }
    setNotesLoaded(true)
  }, [])

  // Auto-save quick notes
  useEffect(() => {
    if (!notesLoaded) return
    const timer = setTimeout(() => {
      localStorage.setItem('rise-quick-notes', quickNotes)
    }, 500)
    return () => clearTimeout(timer)
  }, [quickNotes, notesLoaded])

  // Fetch user data for XP display
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await apiFetch('/api/rise/dashboard')
        if (res.ok) {
          const data = await res.json()
          if (data.user) {
            const { calculateLevel } = await import('@/lib/gamification')
            const levelInfo = calculateLevel(data.user.xp)
            setUser({
              id: auth?.userId || '',
              email: auth?.userEmail || '',
              isAdmin: auth?.isAdmin || false,
              name: data.user.name,
              level: levelInfo.level,
              currentXp: levelInfo.currentXp,
              xpToNext: levelInfo.xpToNext,
              progress: levelInfo.progress,
              streak: data.user.streak,
            })
          }
        }
      } catch {
        // silently ignore
      }
    }
    fetchUser()
    // Refresh every 30 seconds
    const interval = setInterval(fetchUser, 30000)
    return () => clearInterval(interval)
  }, [setUser])

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden animate-[fadeSlideIn_0.2s_ease-out]"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 right-0 z-50 h-full w-64 sm:w-72 bg-sidebar border-l border-sidebar-border',
          'flex flex-col duration-200 ease-out',
          'lg:static lg:z-auto',
          'shadow-[inset_-1px_0_0_rgba(0,0,0,0.03)] dark:shadow-[inset_-1px_0_0_rgba(255,255,255,0.02),inset_1px_0_0_rgba(0,0,0,0.1)]',
          'sidebar-glow',
          !sidebarOpen && 'max-lg:[transform:translateX(100%)]',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 pb-3 relative">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-accent to-forest flex items-center justify-center shadow-md shadow-emerald-accent/20">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-sidebar-foreground">
                RiseOS
              </h1>
              <p className="text-[9px] text-sidebar-foreground/50 -mt-0.5 font-medium hidden sm:block">
                امتلك صباحك. امتلك حياتك.
              </p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1.5 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/60"
            aria-label="إغلاق القائمة"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-l from-transparent via-emerald-accent/40 to-gold/30" />
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2.5 pb-4">
          {navGroups.map((group, gi) => (
            <div key={gi} className={cn(group.title && 'mt-4')}>
              {group.title && (
                <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-sidebar-foreground/35 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-accent/40 inline-block" />
                  {group.title}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon
                  const isActive = activeModule === item.id
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveModule(item.id)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium',
                        'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60',
                        'active:scale-[0.97]',
                        isActive && 'bg-sidebar-primary/10 text-sidebar-primary font-semibold shadow-sm'
                      )}
                    >
                      <div
                        className={cn(
                          'w-7 h-7 rounded-lg flex items-center justify-center',
                          isActive
                            ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-md'
                            : 'bg-sidebar-accent/50 text-sidebar-foreground/50'
                        )}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <span className="flex-1 text-right">{item.label}</span>
                      {isActive && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-emerald-accent" />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Quick Notes Section */}
        <div className="px-2.5 pb-2">
          <div className="rounded-xl border border-gradient p-0.5">
            <div className="glass rounded-[10px] overflow-hidden">
              {/* Collapsed Header */}
              <button
                onClick={() => setNotesExpanded(!notesExpanded)}
                aria-label={notesExpanded ? 'طي الملاحظات السريعة' : 'توسيع الملاحظات السريعة'}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-primary/[0.02]"
              >
                <div className="w-6 h-6 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
                  <Pencil className="w-3 h-3 text-gold" />
                </div>
                {!notesExpanded && (
                  <span className="text-xs text-muted-foreground truncate flex-1 text-right">
                    {quickNotes ? quickNotes.slice(0, 20) + (quickNotes.length > 20 ? '...' : '') : 'ملاحظات سريعة'}
                  </span>
                )}
                {notesExpanded && (
                  <span className="text-xs font-medium text-foreground flex-1 text-right">ملاحظات سريعة</span>
                )}
                <ChevronDown className={cn('w-3 h-3 text-muted-foreground/50 transition-transform duration-200', notesExpanded && 'rotate-180')} />
              </button>

              {/* Expanded Textarea */}
              {notesExpanded && (
                  <div className="overflow-hidden animate-[fadeSlideIn_0.2s_ease-out]">
                    <div className="px-3 pb-3 pt-1">
                      <textarea
                        ref={notesRef}
                        value={quickNotes}
                        onChange={(e) => setQuickNotes(e.target.value)}
                        placeholder="اكتب ملاحظتك هنا..."
                        rows={3}
                        dir="rtl"
                        className={cn(
                          'w-full bg-white/5 dark:bg-white/[0.03]',
                          'border border-white/10 dark:border-white/5',
                          'rounded-lg px-3 py-2 text-xs text-foreground leading-relaxed',
                          'resize-none focus:outline-none focus:ring-1 focus:ring-emerald-accent/30 focus:border-emerald-accent/20',
                          'placeholder:text-muted-foreground/40',
                          'max-h-[72px] overflow-y-auto'
                        )}
                        style={{ scrollbarWidth: 'thin' }}
                      />
                      <div className="flex items-center justify-between mt-1.5 px-0.5">
                        <span className="text-[9px] text-muted-foreground/40">
                          {quickNotes.length > 0 ? `${toArabicNum(quickNotes.length)} حرف` : 'يحفظ تلقائياً'}
                        </span>
                        {quickNotes.length > 0 && (
                          <button
                            onClick={() => setQuickNotes('')}
                            className="text-[9px] text-muted-foreground/40 hover:text-destructive"
                          >
                            مسح
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
            </div>
          </div>
        </div>

        {/* Footer - User Card */}
        <div className="p-3 border-t border-sidebar-border relative">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-l from-transparent via-sidebar-border to-transparent" />
          <div className="glass rounded-xl p-2.5 border border-white/10 dark:border-white/5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gold to-gold-light flex items-center justify-center text-sm font-bold text-forest-dark shadow-md shadow-gold/20">
                {user?.name?.charAt(0) || 'م'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-sidebar-foreground truncate">
                  {user?.name || 'مستخدم RiseOS'}
                </p>
                <p className="text-[10px] text-sidebar-foreground/50">
                  المستوى {user ? toArabicNum(user.level) : '١'}
                  {user && user.streak > 0 && (
                    <span className="inline-flex items-center gap-0.5 mr-2 text-orange-500">
                      <Flame className="w-2.5 h-2.5" />
                      {toArabicNum(user.streak)}
                    </span>
                  )}
                </p>
              </div>
              <ChevronLeft className="w-3.5 h-3.5 text-sidebar-foreground/30 rotate-180" />
            </div>
            <div className="mt-2">
              <div className="flex justify-between text-[10px] text-sidebar-foreground/50 mb-1">
                <span>الخبرة</span>
                <span>
                  {user ? `${toArabicNum(user.currentXp)} / ${toArabicNum(user.xpToNext)}` : '٠ / ١٠٠'}
                </span>
              </div>
              <div className="relative">
                <div className="h-1.5 rounded-full bg-sidebar-accent overflow-hidden shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]">
                  <div
                    className="h-full rounded-full bg-gradient-to-l from-gold via-gold to-gold-light transition-all duration-700 ease-out"
                    style={{ width: user ? `${Math.min(user.progress, 100)}%` : '0%' }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}