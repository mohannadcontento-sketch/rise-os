'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useRiseStore, type ModuleId } from '@/store/app-store'
import { cn } from '@/lib/utils'
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
  Zap,
  TrendingUp,
} from 'lucide-react'
import { useEffect } from 'react'

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

export function Sidebar() {
  const { activeModule, setActiveModule, sidebarOpen, setSidebarOpen } = useRiseStore()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setSidebarOpen])

  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 right-0 z-50 h-full w-72 bg-sidebar border-l border-sidebar-border',
          'flex flex-col transition-transform duration-300 ease-out',
          'lg:translate-x-0 lg:static lg:z-auto',
          sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-accent to-forest flex items-center justify-center shadow-lg">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-sidebar-foreground">
                RiseOS
              </h1>
              <p className="text-[10px] text-sidebar-foreground/50 -mt-0.5 font-medium">
                امتلك صباحك. امتلك حياتك.
              </p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1.5 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/60"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {navGroups.map((group, gi) => (
            <div key={gi} className={cn(group.title && 'mt-5')}>
              {group.title && (
                <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/35">
                  {group.title}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon
                  const isActive = activeModule === item.id
                  return (
                    <motion.button
                      key={item.id}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setActiveModule(item.id)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200',
                        'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60',
                        isActive && 'bg-sidebar-primary/10 text-sidebar-primary font-semibold shadow-sm'
                      )}
                    >
                      <div
                        className={cn(
                          'w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200',
                          isActive
                            ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-md'
                            : 'bg-sidebar-accent/50 text-sidebar-foreground/50'
                        )}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className="flex-1 text-right">{item.label}</span>
                      {isActive && (
                        <motion.div
                          layoutId="activeIndicator"
                          className="w-1.5 h-1.5 rounded-full bg-sidebar-primary"
                        />
                      )}
                    </motion.button>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-sidebar-border">
          <div className="glass rounded-xl p-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gold to-gold-light flex items-center justify-center text-sm font-bold text-forest-dark">
                م
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-sidebar-foreground truncate">مستخدم</p>
                <p className="text-[10px] text-sidebar-foreground/50">المستوى ١</p>
              </div>
              <ChevronLeft className="w-4 h-4 text-sidebar-foreground/30 rotate-180" />
            </div>
            <div className="mt-2">
              <div className="flex justify-between text-[10px] text-sidebar-foreground/50 mb-1">
                <span>الخبرة</span>
                <span>٠ / ١٠٠</span>
              </div>
              <div className="h-1.5 rounded-full bg-sidebar-accent overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-l from-gold to-gold-light"
                  initial={{ width: 0 }}
                  animate={{ width: '0%' }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                />
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}