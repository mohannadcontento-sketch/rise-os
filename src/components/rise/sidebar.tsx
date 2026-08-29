'use client'

import { useRiseStore, type ModuleId } from '@/store/app-store'
import { cn } from '@/lib/utils'
import { playSound } from '@/lib/sounds'
import { apiFetch } from '@/lib/api-fetch'
import { X, ChevronDown, Pencil, Flame, Zap, Settings2, ChevronsDownUp, ChevronsUpDown, Sparkles } from 'lucide-react'
import { MODULE_ICONS, RiseGlyphIcon, RiseIcon, type RiseGlyph, type RiseHue } from './icons'
import { useEffect, useState, useRef, useCallback, useSyncExternalStore } from 'react'
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
  hint: string
  dot: string
  items: NavItem[]
}

function mi(id: string): { glyph: RiseGlyph; hue: RiseHue } {
  return MODULE_ICONS[id] ?? { glyph: 'dashboard', hue: 'lime' }
}

/**
 * SIDEBAR v3 — regrouped, collapsible, and visually calm.
 * 22 modules live in 4 tidy accordion cards + pinned dashboard + settings.
 * Each group has a color identity dot, item count, and a smooth
 * grid-rows accordion animation. The user card opens Settings.
 */
const navGroups: NavGroup[] = [
  {
    id: 'today',
    title: 'يومك',
    hint: 'روتين · مخطط · عادات · يوميات',
    dot: 'bg-gold',
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
    hint: 'مهام · مشاريع · أهداف · تركيز',
    dot: 'bg-emerald-accent',
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
    hint: 'صحة · قراءة · تعلم · معرفة',
    dot: 'bg-violet-accent',
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
    hint: 'مالية · مراجعات · تحليلات',
    dot: 'bg-glass',
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
  hint: 'أدوات الأدمن',
  dot: 'bg-rose-accent',
  items: [{ id: 'admin-panel', label: 'لوحة الإدارة', ...mi('admin-panel') }],
}

const NAV_OPEN_KEY = 'rise-nav-open-groups'

/**
 * External store for the persisted open-groups — read via useSyncExternalStore
 * (hydration-safe: server snapshot opens 'today' only) and written imperatively,
 * which avoids setState-in-effect lint errors entirely.
 * Closure-based (no `this`) so methods can be passed as bare callbacks.
 */
let navOpenCache: string[] | null = null
const navOpenListeners = new Set<() => void>()

function navOpenRead(): string[] {
  if (navOpenCache === null) {
    let next: string[] = ['today']
    try {
      const raw = localStorage.getItem(NAV_OPEN_KEY)
      if (raw) next = JSON.parse(raw)
    } catch { /* keep default */ }
    navOpenCache = next
  }
  return navOpenCache
}

function navOpenWrite(next: string[]) {
  navOpenCache = next
  try { localStorage.setItem(NAV_OPEN_KEY, JSON.stringify(next)) } catch { /* ignore */ }
  navOpenListeners.forEach((l) => l())
}

function navOpenSubscribe(l: () => void) {
  navOpenListeners.add(l)
  return () => { navOpenListeners.delete(l) }
}

const DEFAULT_OPEN_GROUPS = ['today']

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
        'group/row relative w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-xl text-[13px]',
        'transition-colors duration-150 active:scale-[0.98]',
        active
          ? 'bg-sidebar-primary/10 text-sidebar-primary font-bold'
          : 'font-medium text-sidebar-foreground/65 hover:text-sidebar-foreground hover:bg-sidebar-accent/70'
      )}
    >
      {active ? (
        /* active = full hue well — the module's color identity */
        <RiseIcon glyph={item.glyph} hue={item.hue} size="sm" className="!rounded-lg" />
      ) : (
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-sidebar-accent/60 text-sidebar-foreground/45 transition-colors group-hover/row:text-sidebar-foreground/80">
          <RiseGlyphIcon glyph={item.glyph} size={15} />
        </span>
      )}
      <span className="flex-1 text-right truncate">{item.label}</span>
      {/* active marker: lime bar hugging the sidebar edge */}
      {active && (
        <span className="absolute start-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-full bg-emerald-accent shadow-[0_0_8px_var(--color-emerald-accent)]" />
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

  // ── Collapsible nav groups (persisted, external store) ──
  const openGroups = useSyncExternalStore(
    navOpenSubscribe,
    () => navOpenRead(),
    () => DEFAULT_OPEN_GROUPS
  )
  const toggleGroup = useCallback((id: string) => {
    playSound('navigate')
    const cur = navOpenRead()
    navOpenWrite(cur.includes(id) ? cur.filter((g) => g !== id) : [...cur, id])
  }, [])
  const allOpen = navGroups.every((g) => openGroups.includes(g.id))
  const toggleAll = useCallback(() => {
    navOpenWrite(allOpen ? [] : navGroups.map((g) => g.id))
  }, [allOpen])
  // Auto-open the group containing the active module (e.g. after ⌘K jump).
  // Writes go to the external store (not setState), so this is lint-clean.
  useEffect(() => {
    const owner = navGroups.find((g) => g.items.some((i) => i.id === activeModule))
    if (owner && !navOpenRead().includes(owner.id)) {
      navOpenWrite([...navOpenRead(), owner.id])
    }
  }, [activeModule])

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

  // Fetch on mount + on rise:user-updated only (no polling — avoids 429s)
  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  useEffect(() => {
    const handler = () => { fetchUser() }
    window.addEventListener('rise:user-updated', handler)
    return () => window.removeEventListener('rise:user-updated', handler)
  }, [fetchUser])

  const go = useCallback((id: ModuleId) => {
    playSound('navigate')
    setActiveModule(id)
  }, [setActiveModule])

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/45 backdrop-blur-sm z-[55] lg:hidden animate-[fadeSlideIn_0.2s_ease-out]"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 right-0 z-[60] h-full w-[17.5rem] sm:w-72 bg-sidebar border-l border-sidebar-border',
          'flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
          'lg:static lg:z-auto lg:transition-none',
          'shadow-2xl lg:shadow-none',
          'sidebar-glow',
          !sidebarOpen && 'max-lg:[transform:translateX(100%)]',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 pb-3 relative shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center shadow-md ring-1 ring-black/5">
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
        <nav className="flex-1 overflow-y-auto sidebar-scroll px-3 pb-4 pt-1 space-y-1.5">
          {/* Pinned: dashboard — always visible */}
          <NavButton
            item={{ id: 'dashboard', label: 'لوحة التحكم', ...mi('dashboard') }}
            active={activeModule === 'dashboard'}
            onSelect={() => go('dashboard')}
          />

          {/* Group utility row */}
          <div className="flex items-center justify-between pt-2 pb-0.5 px-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-sidebar-foreground/35">الأقسام</span>
            <button
              onClick={toggleAll}
              className="p-1 rounded-md text-sidebar-foreground/40 hover:text-sidebar-foreground/80 hover:bg-sidebar-accent/60 transition-colors"
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
              <div key={group.id} className={cn('nav-group', isOpen && 'open', containsActive && !isOpen && 'has-active')}>
                {/* Group header */}
                <button
                  onClick={() => toggleGroup(group.id)}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-2xl text-start"
                  aria-expanded={isOpen}
                >
                  <span className={cn('w-2 h-2 rounded-full shrink-0 transition-shadow', group.dot, isOpen && 'shadow-[0_0_6px_currentcolor]')} />
                  <span className="flex-1 min-w-0">
                    <span className={cn(
                      'block text-xs font-bold tracking-wide transition-colors',
                      containsActive || isOpen ? 'text-sidebar-foreground' : 'text-sidebar-foreground/60'
                    )}>
                      {group.title}
                    </span>
                    {isOpen && (
                      <span className="block text-[9px] text-sidebar-foreground/40 truncate">
                        {group.hint}
                      </span>
                    )}
                  </span>
                  <span className="num text-[9px] font-semibold text-sidebar-foreground/35 tabular-nums">
                    {toArabicNum(group.items.length)}
                  </span>
                  <ChevronDown
                    className={cn(
                      'w-3.5 h-3.5 text-sidebar-foreground/40 transition-transform duration-300',
                      isOpen && 'rotate-180 text-emerald-accent'
                    )}
                  />
                </button>

                {/* Accordion body — smooth grid-rows animation */}
                <div className={cn('acc-body', isOpen && 'open')}>
                  <div>
                    <div className="space-y-0.5 px-1.5 pb-1.5 pt-0.5">
                      {group.items.map((item) => (
                        <NavButton
                          key={item.id}
                          item={item}
                          active={activeModule === item.id}
                          onSelect={() => go(item.id)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}

          {/* Settings — always visible, calm row at the bottom */}
          <div className="pt-2">
            <NavButton
              item={{ id: 'settings', label: 'الإعدادات', ...mi('settings') }}
              active={activeModule === 'settings'}
              onSelect={() => go('settings')}
            />
          </div>
        </nav>

        {/* Quick Notes Section */}
        <div className="px-3 pb-2 shrink-0">
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

        {/* Footer - User Card → opens Settings */}
        <div
          className="p-3 pt-0 border-t border-sidebar-border relative shrink-0 cursor-pointer group/user"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0.75rem))' }}
          onClick={() => go('settings')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') go('settings') }}
          aria-label="فتح الإعدادات وملفك الشخصي"
        >
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-l from-transparent via-sidebar-border to-transparent" />
          <div className="glass rounded-xl p-2.5 border border-white/10 dark:border-white/5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] transition-colors group-hover/user:bg-white/[0.04]">
            <div className="flex items-center gap-2.5">
              {selectedAvatar && AVATARS.find(a => a.id === selectedAvatar) ? (
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center shadow-md shadow-gold/20 overflow-hidden shrink-0"
                  style={AVATARS.find(a => a.id === selectedAvatar)!.style}
                >
                  <span className="scale-75">{AVATARS.find(a => a.id === selectedAvatar)!.svg}</span>
                </div>
              ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gold to-gold-light flex items-center justify-center text-sm font-bold text-forest-dark shadow-md shadow-gold/20 shrink-0">
                  {String(user?.name || 'م').charAt(0) || 'م'}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-sidebar-foreground truncate">
                  {user?.name || 'مستخدم RiseOS'}
                </p>
                <p className="text-[10px] text-sidebar-foreground/50 flex items-center gap-1.5">
                  <span>المستوى {user ? toArabicNum(user.level) : '١'}</span>
                  {user && user.streak > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-orange-500">
                      <Flame className="w-2.5 h-2.5" />
                      {toArabicNum(user.streak)}
                    </span>
                  )}
                </p>
              </div>
              <Settings2 className="w-3.5 h-3.5 text-sidebar-foreground/30 transition-colors group-hover/user:text-emerald-accent" />
            </div>
            <div className="mt-2">
              <div className="flex justify-between text-[10px] text-sidebar-foreground/50 mb-1">
                <span className="flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5 text-gold/70" />
                  الخبرة
                </span>
                <span>
                  {user ? `${toArabicNum(user.currentXp)} / ${toArabicNum(user.xpToNext)}` : '٠ / ١٠٠'}
                </span>
              </div>
              <div className="relative">
                <div className="h-1.5 rounded-full bg-sidebar-accent overflow-hidden shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]">
                  <div
                    className="h-full rounded-full bg-gradient-to-l from-gold via-gold to-gold-light transition-all duration-700 ease-out xp-shimmer"
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
