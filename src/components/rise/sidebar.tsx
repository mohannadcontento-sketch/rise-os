'use client'

import { useRiseStore, type ModuleId } from '@/store/app-store'
import { cn } from '@/lib/utils'
import { playSound } from '@/lib/sounds'
import { apiFetch } from '@/lib/api-fetch'
import { X, ChevronLeft, ChevronDown, Pencil, Flame, Sunrise, Zap, Sprout, Wallet, Settings2, ChevronsDownUp, ChevronsUpDown } from 'lucide-react'
import { MODULE_ICONS, RiseGlyphIcon, RiseIcon, type RiseGlyph, type RiseHue } from './icons'
import { useEffect, useState, useRef, useCallback } from 'react'
import { AVATARS } from '@/lib/avatars'

interface NavItem {
  id: ModuleId
  label: string
  glyph: RiseGlyph
  hue: RiseHue
}

interface NavGroup {
  id: string
  title: string
  icon: React.ComponentType<{ className?: string }>
  items: NavItem[]
}

function mi(id: string): { glyph: RiseGlyph; hue: RiseHue } {
  return MODULE_ICONS[id] ?? { glyph: 'dashboard', hue: 'lime' }
}

/**
 * REGROUPED + COLLAPSIBLE nav — 22 module buttons used to stack in one long
 * list; now they live in 4 tidy collapsible sections (persisted open-state).
 * The dashboard stays pinned on top, and settings lives by the user card.
 */
const navGroups: NavGroup[] = [
  {
    id: 'today',
    title: 'يومك',
    icon: Sunrise,
    items: [
      { id: 'morning', label: 'الروتين الصباحي', ...mi('morning') },
      { id: 'planner', label: 'المخطط اليومي', ...mi('planner') },
      { id: 'habits', label: 'تتبع العادات', ...mi('habits') },
      { id: 'journal', label: 'اليوميات', ...mi('journal') },
    ],
  },
  {
    id: 'execute',
    title: 'التنفيذ',
    icon: Zap,
    items: [
      { id: 'tasks', label: 'المهام', ...mi('tasks') },
      { id: 'projects', label: 'المشاريع', ...mi('projects') },
      { id: 'goals', label: 'الأهداف', ...mi('goals') },
      { id: 'deepwork', label: 'العمل العميق', ...mi('deepwork') },
      { id: 'work', label: 'الشغل', ...mi('work') },
      { id: 'calendar', label: 'التقويم', ...mi('calendar') },
    ],
  },
  {
    id: 'growth',
    title: 'النمو والمعرفة',
    icon: Sprout,
    items: [
      { id: 'health', label: 'الصحة', ...mi('health') },
      { id: 'reading', label: 'القراءة', ...mi('reading') },
      { id: 'learning', label: 'التعلم', ...mi('learning') },
      { id: 'brain', label: 'الدماغ الثاني', ...mi('brain') },
    ],
  },
  {
    id: 'life',
    title: 'المال والمراجعة',
    icon: Wallet,
    items: [
      { id: 'finance', label: 'المالية', ...mi('finance') },
      { id: 'weekly-review', label: 'مراجعة أسبوعية', ...mi('weekly-review') },
      { id: 'monthly-review', label: 'مراجعة شهرية', ...mi('monthly-review') },
      { id: 'analytics', label: 'التحليلات', ...mi('analytics') },
      { id: 'ai-coach', label: 'المدرب الذكي', ...mi('ai-coach') },
    ],
  },
]

const ADMIN_GROUP: NavGroup = {
  id: 'admin',
  title: 'الإدارة',
  icon: Settings2,
  items: [{ id: 'admin-panel', label: 'لوحة الإدارة', ...mi('admin-panel') }],
}

const NAV_OPEN_KEY = 'rise-nav-open-groups'
function loadOpenGroups(): string[] {
  try {
    const raw = localStorage.getItem(NAV_OPEN_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return ['today'] // calm default: one section open
}

function toArabicNum(n: number | null | undefined | string | object): string {
  if (n == null || n === undefined || typeof n === 'object') return '٠'
  const num = typeof n === 'string' ? parseFloat(n) : n
  if (isNaN(num)) return '٠'
  return num.toString().replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[parseInt(d)])
}

/* One nav row — shared by pinned dashboard, groups and settings */
function NavButton({
  item,
  active,
  onSelect,
}: {
  item: NavItem
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'relative w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium',
        'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60',
        'active:scale-[0.97]',
        active && 'bg-sidebar-primary/10 text-sidebar-primary font-semibold shadow-sm'
      )}
    >
      {active ? (
        /* active = full hue well + glow — the module's color identity */
        <RiseIcon glyph={item.glyph} hue={item.hue} size="sm" className="!rounded-lg" />
      ) : (
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-sidebar-accent/50 text-sidebar-foreground/50">
          <RiseGlyphIcon glyph={item.glyph} size={16} />
        </div>
      )}
      <span className="flex-1 text-right">{item.label}</span>
      {active && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-emerald-accent" />
      )}
    </button>
  )
}

export function Sidebar() {
  const { activeModule, setActiveModule, sidebarOpen, setSidebarOpen, user, setUser, auth } = useRiseStore()
  const [notesExpanded, setNotesExpanded] = useState(false)
  const [quickNotes, setQuickNotes] = useState(() => {
    if (typeof window === 'undefined') return ''
    try { return localStorage.getItem('rise-quick-notes') || '' } catch { return '' }
  })
  const notesRef = useRef<HTMLTextAreaElement>(null)
  const [selectedAvatar, setSelectedAvatar] = useState<string>(() => {
    if (typeof window === 'undefined') return ''
    try { return localStorage.getItem('rise-user-avatar') || '' } catch { return '' }
  })

  // ── Collapsible nav groups (persisted) ──
  const [openGroups, setOpenGroups] = useState<string[]>([])
  useEffect(() => {
    setOpenGroups(loadOpenGroups())
  }, [])
  const persistOpen = useCallback((next: string[]) => {
    setOpenGroups(next)
    try { localStorage.setItem(NAV_OPEN_KEY, JSON.stringify(next)) } catch { /* ignore */ }
  }, [])
  const toggleGroup = useCallback((id: string) => {
    playSound('navigate')
    persistOpen(openGroups.includes(id) ? openGroups.filter((g) => g !== id) : [...openGroups, id])
  }, [openGroups, persistOpen])
  const allOpen = navGroups.every((g) => openGroups.includes(g.id))
  const toggleAll = useCallback(() => {
    persistOpen(allOpen ? [] : navGroups.map((g) => g.id))
  }, [allOpen, persistOpen])
  // Auto-open the group containing the active module (e.g. after ⌘K jump)
  useEffect(() => {
    const owner = navGroups.find((g) => g.items.some((i) => i.id === activeModule))
    if (owner && !openGroups.includes(owner.id)) {
      persistOpen([...openGroups, owner.id])
    }
  }, [activeModule]) // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for avatar changes
  useEffect(() => {
    const handler = () => {
      try {
        const stored = localStorage.getItem('rise-user-avatar')
        if (stored) setSelectedAvatar(stored)
      } catch { /* ignore */ }
    }
    window.addEventListener('rise:avatar-changed', handler)
    return () => window.removeEventListener('rise:avatar-changed', handler)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setSidebarOpen])

  // Auto-save quick notes
  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem('rise-quick-notes', quickNotes)
    }, 500)
    return () => clearTimeout(timer)
  }, [quickNotes])

  // Fetch user data for XP display
  const fetchUser = useCallback(async () => {
    try {
      const res = await apiFetch('/api/rise/dashboard')
      if (res.ok) {
        const data = await res.json()
        if (data.user) {
          // FIX: Use level from DB (authoritative), not recalculated from XP
          const xp = data.user.xp || 0
          const xpToNext = data.user.xpToNextLevel || 100
          setUser({
            id: auth?.userId || '',
            email: auth?.userEmail || '',
            isAdmin: auth?.isAdmin || false,
            name: data.user.name,
            level: data.user.level || 1,
            currentXp: xp,
            xpToNext: xpToNext,
            progress: xpToNext > 0 ? Math.min(100, Math.round((xp / xpToNext) * 100)) : 0,
            streak: data.user.streak || 0,
          })
        }
      }
    } catch {
      // silently ignore
    }
  }, [auth, setUser])

  // FIX: Fetch on mount + on rise:user-updated only.
  // Removed the 30s setInterval polling — it was one of the main causes
  // of the /api/rise/dashboard 429 rate-limit errors. The sidebar doesn't
  // need real-time XP updates; it only needs to refresh when the user
  // earns XP (dispatched via rise:user-updated) or on mount.
  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  // Re-fetch when user updates name in settings or earns XP
  useEffect(() => {
    const handler = () => { fetchUser() }
    window.addEventListener('rise:user-updated', handler)
    return () => window.removeEventListener('rise:user-updated', handler)
  }, [fetchUser])

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
            <div className="w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center shadow-md">
              <img src="/icon-192.png" alt="RiseOS" className="w-full h-full object-cover" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-sidebar-foreground font-display">
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
          {/* Pinned: dashboard — always visible */}
          <div className="space-y-0.5">
            <NavButton
              item={{ id: 'dashboard', label: 'لوحة التحكم', ...mi('dashboard') }}
              active={activeModule === 'dashboard'}
              onSelect={() => { playSound('navigate'); setActiveModule('dashboard') }}
            />
          </div>

          {/* Collapsible groups */}
          <div className="flex items-center justify-between mt-3 mb-1 px-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-sidebar-foreground/35">الأقسام</span>
            <button
              onClick={toggleAll}
              className="p-1 rounded-md text-sidebar-foreground/40 hover:text-sidebar-foreground/80 hover:bg-sidebar-accent/50 transition-colors"
              aria-label={allOpen ? 'طي كل الأقسام' : 'فتح كل الأقسام'}
              title={allOpen ? 'طي كل الأقسام' : 'فتح كل الأقسام'}
            >
              {allOpen ? <ChevronsDownUp className="w-3.5 h-3.5" /> : <ChevronsUpDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {[...navGroups, ...(auth?.isAdmin ? [ADMIN_GROUP] : [])].map((group) => {
            const isOpen = openGroups.includes(group.id)
            const containsActive = group.items.some((i) => i.id === activeModule)
            return (
              <div key={group.id} className="mt-1">
                <button
                  onClick={() => toggleGroup(group.id)}
                  className={cn(
                    'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] font-bold transition-colors',
                    'text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-sidebar-accent/50',
                    containsActive && !isOpen && 'text-sidebar-foreground'
                  )}
                  aria-expanded={isOpen}
                >
                  <group.icon className={cn('w-3.5 h-3.5', containsActive && isOpen && 'text-emerald-accent')} />
                  <span className="flex-1 text-right tracking-wide">{group.title}</span>
                  <span className="num text-[9px] font-semibold text-sidebar-foreground/35">
                    {toArabicNum(group.items.length)}
                  </span>
                  <ChevronDown
                    className={cn(
                      'w-3 h-3 text-sidebar-foreground/40 transition-transform duration-200',
                      isOpen && 'rotate-180'
                    )}
                  />
                </button>
                {isOpen && (
                  <div className="space-y-0.5 mt-0.5 animate-[fadeSlideIn_0.15s_ease-out]">
                    {group.items.map((item) => (
                      <NavButton
                        key={item.id}
                        item={item}
                        active={activeModule === item.id}
                        onSelect={() => { playSound('navigate'); setActiveModule(item.id) }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {/* Settings — always visible, one calm row */}
          <div className="mt-3 pt-2 border-t border-sidebar-border/60 space-y-0.5">
            <NavButton
              item={{ id: 'settings', label: 'الإعدادات', ...mi('settings') }}
              active={activeModule === 'settings'}
              onSelect={() => { playSound('navigate'); setActiveModule('settings') }}
            />
          </div>
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
              {selectedAvatar && AVATARS.find(a => a.id === selectedAvatar) ? (
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center shadow-md shadow-gold/20 overflow-hidden"
                  style={AVATARS.find(a => a.id === selectedAvatar)!.style}
                >
                  <span className="scale-75">{AVATARS.find(a => a.id === selectedAvatar)!.svg}</span>
                </div>
              ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gold to-gold-light flex items-center justify-center text-sm font-bold text-forest-dark shadow-md shadow-gold/20">
                  {String(user?.name || 'م').charAt(0) || 'م'}
                </div>
              )}
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