'use client'

import { useEffect, useCallback, useState } from 'react'
import {
  Keyboard,
  LayoutDashboard,
  Sun,
  CalendarDays,
  CheckSquare,
  FolderKanban,
  Target,
  Flame,
  BookOpen,
  Brain,
  GraduationCap,
  Heart,
  Wallet,
  Calendar as CalendarIcon,
  Network,
  BarChart3,
  Sparkles,
  Settings as SettingsIcon,
  Plus,
  Moon,
  X,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useRiseStore, type ModuleId } from '@/store/app-store'
import { useTheme } from 'next-themes'

/* ────────────── Shortcut Definitions ────────────── */

interface ShortcutDef {
  keys: string
  label: string
  description: string
  category: 'navigation' | 'actions' | 'view'
  icon: React.ElementType
  action?: () => void
}

const NAVIGATION_SHORTCUTS: (Omit<ShortcutDef, 'action'> & { module: ModuleId })[] = [
  { keys: 'Ctrl+1', label: 'لوحة التحكم', description: 'الانتقال إلى لوحة التحكم', category: 'navigation', icon: LayoutDashboard, module: 'dashboard' },
  { keys: 'Ctrl+2', label: 'الروتين الصباحي', description: 'الانتقال إلى الروتين الصباحي', category: 'navigation', icon: Sun, module: 'morning' },
  { keys: 'Ctrl+3', label: 'المخطط اليومي', description: 'الانتقال إلى المخطط اليومي', category: 'navigation', icon: CalendarDays, module: 'planner' },
  { keys: 'Ctrl+4', label: 'المهام', description: 'الانتقال إلى المهام', category: 'navigation', icon: CheckSquare, module: 'tasks' },
  { keys: 'Ctrl+5', label: 'المشاريع', description: 'الانتقال إلى المشاريع', category: 'navigation', icon: FolderKanban, module: 'projects' },
  { keys: 'Ctrl+6', label: 'الأهداف', description: 'الانتقال إلى الأهداف', category: 'navigation', icon: Target, module: 'goals' },
  { keys: 'Ctrl+7', label: 'العادات', description: 'الانتقال إلى العادات', category: 'navigation', icon: Flame, module: 'habits' },
  { keys: 'Ctrl+8', label: 'اليوميات', description: 'الانتقال إلى اليوميات', category: 'navigation', icon: BookOpen, module: 'journal' },
  { keys: 'Ctrl+9', label: 'العمل العميق', description: 'الانتقال إلى العمل العميق', category: 'navigation', icon: Brain, module: 'deepwork' },
  { keys: 'Ctrl+0', label: 'الإعدادات', description: 'الانتقال إلى الإعدادات', category: 'navigation', icon: SettingsIcon, module: 'settings' },
]

const ACTION_SHORTCUTS: ShortcutDef[] = [
  { keys: 'Ctrl+N', label: 'مهمة جديدة', description: 'فتح وحدة المهام لإضافة مهمة', category: 'actions', icon: Plus },
]

const VIEW_SHORTCUTS: ShortcutDef[] = [
  { keys: 'Ctrl+D', label: 'تبديل المظهر', description: 'التبديل بين الوضع الفاتح والداكن', category: 'view', icon: Moon },
  { keys: 'Ctrl+/', label: 'اختصارات لوحة المفاتيح', description: 'عرض هذه القائمة', category: 'view', icon: Keyboard },
  { keys: 'Escape', label: 'إغلاق', description: 'إغلاق أي نافذة أو قائمة مفتوحة', category: 'view', icon: X },
]

const CATEGORY_LABELS: Record<string, string> = {
  navigation: 'التنقل',
  actions: 'إجراءات',
  view: 'العرض',
}

const CATEGORY_COLORS: Record<string, string> = {
  navigation: 'border-emerald-accent/30 bg-emerald-accent/5',
  actions: 'border-gold/30 bg-gold/5',
  view: 'border-forest/30 bg-forest/5',
}

/* ────────────── Key Badge ────────────── */

function KeyBadge({ keys }: { keys: string }) {
  const parts = keys.split('+')
  return (
    <div className="flex items-center gap-1">
      {parts.map((part, i) => (
        <span key={i}>
          <kbd className={cn(
            'inline-flex items-center justify-center min-w-[24px] h-6 px-1.5',
            'rounded-md bg-muted/80 border border-border/60 shadow-[0_1px_1px_rgba(0,0,0,0.1)]',
            'text-[11px] font-mono font-medium text-foreground/80'
          )}>
            {part === 'Ctrl' ? '⌃' : part === 'Escape' ? 'Esc' : part}
          </kbd>
          {i < parts.length - 1 && (
            <span className="text-[10px] text-muted-foreground/50 mx-0.5">+</span>
          )}
        </span>
      ))}
    </div>
  )
}

/* ────────────── Help Dialog ────────────── */

export function KeyboardShortcutsDialog() {
  const [open, setOpen] = useState(false)
  const { setActiveModule } = useRiseStore()
  const { theme, setTheme } = useTheme()

  const handleOpen = useCallback(() => setOpen(true), [])
  const handleClose = useCallback(() => setOpen(false), [])

  const handleAction = useCallback((shortcut: ShortcutDef | (Omit<ShortcutDef, 'action'> & { module: ModuleId })) => {
    setOpen(false)
    if ('module' in shortcut) {
      setActiveModule(shortcut.module)
    } else if (shortcut.keys === 'Ctrl+N') {
      setActiveModule('tasks')
    } else if (shortcut.keys === 'Ctrl+D') {
      setTheme(theme === 'dark' ? 'light' : 'dark')
    }
  }, [setActiveModule, setTheme, theme])

  // Expose open/close for the hook
  useEffect(() => {
    const handler = () => setOpen(true)
    window.addEventListener('rise-open-shortcuts', handler)
    return () => window.removeEventListener('rise-open-shortcuts', handler)
  }, [])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg backdrop-blur-xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-forest/10 flex items-center justify-center">
              <Keyboard className="w-4 h-4 text-forest" />
            </div>
            اختصارات لوحة المفاتيح
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 mt-2 max-h-[60vh] overflow-y-auto pr-1">
          {/* Navigation */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground mb-2.5 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-accent" />
              {CATEGORY_LABELS.navigation}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {NAVIGATION_SHORTCUTS.map((s) => {
                const Icon = s.icon
                return (
                  <button
                    key={s.keys}
                    onClick={() => handleAction(s)}
                    className={cn(
                      'flex items-center justify-between gap-2 p-3 rounded-xl text-right',
                      'glass border transition-all duration-200',
                      CATEGORY_COLORS[s.category],
                      'hover:bg-accent/50 hover:scale-[1.02] active:scale-[0.98] cursor-pointer'
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className="w-3.5 h-3.5 text-emerald-accent shrink-0" />
                      <span className="text-xs font-medium text-foreground truncate">{s.label}</span>
                    </div>
                    <KeyBadge keys={s.keys} />
                  </button>
                )
              })}
            </div>
          </div>

          {/* Actions */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground mb-2.5 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-gold" />
              {CATEGORY_LABELS.actions}
            </h3>
            <div className="grid grid-cols-1 gap-2">
              {ACTION_SHORTCUTS.map((s) => {
                const Icon = s.icon
                return (
                  <button
                    key={s.keys}
                    onClick={() => handleAction(s)}
                    className={cn(
                      'flex items-center justify-between gap-2 p-3 rounded-xl text-right',
                      'glass border transition-all duration-200',
                      CATEGORY_COLORS[s.category],
                      'hover:bg-accent/50 hover:scale-[1.01] active:scale-[0.98] cursor-pointer'
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className="w-3.5 h-3.5 text-gold shrink-0" />
                      <div className="min-w-0">
                        <span className="text-xs font-medium text-foreground block truncate">{s.label}</span>
                        <span className="text-[10px] text-muted-foreground">{s.description}</span>
                      </div>
                    </div>
                    <KeyBadge keys={s.keys} />
                  </button>
                )
              })}
            </div>
          </div>

          {/* View */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground mb-2.5 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-forest" />
              {CATEGORY_LABELS.view}
            </h3>
            <div className="grid grid-cols-1 gap-2">
              {VIEW_SHORTCUTS.map((s) => {
                const Icon = s.icon
                return (
                  <button
                    key={s.keys}
                    onClick={() => handleAction(s)}
                    className={cn(
                      'flex items-center justify-between gap-2 p-3 rounded-xl text-right',
                      'glass border transition-all duration-200',
                      CATEGORY_COLORS[s.category],
                      s.keys === 'Ctrl+/' ? 'cursor-default' : 'hover:bg-accent/50 hover:scale-[1.01] active:scale-[0.98] cursor-pointer'
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className="w-3.5 h-3.5 text-forest shrink-0" />
                      <div className="min-w-0">
                        <span className="text-xs font-medium text-foreground block truncate">{s.label}</span>
                        <span className="text-[10px] text-muted-foreground">{s.description}</span>
                      </div>
                    </div>
                    <KeyBadge keys={s.keys} />
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ────────────── Hook ────────────── */

export function useKeyboardShortcuts() {
  const { setActiveModule } = useRiseStore()
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey
      if (!ctrl) {
        // Escape handler
        if (e.key === 'Escape') {
          // Close any open dialog by dispatching event
          const closeEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
          document.activeElement?.dispatchEvent(closeEvent)
          return
        }
        return
      }

      // Ctrl+1 through Ctrl+9 and Ctrl+0
      if (e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const modules: ModuleId[] = ['dashboard', 'morning', 'planner', 'tasks', 'projects', 'goals', 'habits', 'journal', 'deepwork']
        const idx = parseInt(e.key) - 1
        if (idx < modules.length) {
          setActiveModule(modules[idx])
        }
        return
      }

      if (e.key === '0') {
        e.preventDefault()
        setActiveModule('settings')
        return
      }

      // Ctrl+N: Quick add task
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        setActiveModule('tasks')
        return
      }

      // Ctrl+D: Toggle theme
      if (e.key === 'd' || e.key === 'D') {
        e.preventDefault()
        setTheme(theme === 'dark' ? 'light' : 'dark')
        return
      }

      // Ctrl+/: Show shortcuts help
      if (e.key === '/') {
        e.preventDefault()
        window.dispatchEvent(new Event('rise-open-shortcuts'))
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setActiveModule, setTheme, theme])
}