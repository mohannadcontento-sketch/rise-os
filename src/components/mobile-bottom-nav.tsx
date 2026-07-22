'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  CheckSquare,
  Flame,
  Brain,
  MoreHorizontal,
  Target,
  CalendarDays,
  Wallet,
  Network,
} from 'lucide-react'
import { useRiseStore, type ModuleId } from '@/store/app-store'

interface NavItem {
  id: ModuleId
  label: string
  icon: React.ElementType
}

interface MoreItem {
  id: ModuleId
  label: string
  icon: React.ElementType
}

const mainNavItems: NavItem[] = [
  { id: 'dashboard', label: 'لوحة التحكم', icon: LayoutDashboard },
  { id: 'tasks', label: 'المهام', icon: CheckSquare },
  { id: 'habits', label: 'العادات', icon: Flame },
  { id: 'deepwork', label: 'العمل العميق', icon: Brain },
]

const moreItems: MoreItem[] = [
  { id: 'goals', label: 'الأهداف', icon: Target },
  { id: 'calendar', label: 'التقويم', icon: CalendarDays },
  { id: 'finance', label: 'المالية', icon: Wallet },
  { id: 'brain', label: 'الدماغ الثاني', icon: Network },
]

export default function MobileBottomNav() {
  const { activeModule, setActiveModule } = useRiseStore()
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)

  const closeMore = useCallback(() => setMoreOpen(false), [])

  // Close more menu when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        closeMore()
      }
    }
    if (moreOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [moreOpen, closeMore])

  function handleNav(id: ModuleId) {
    setActiveModule(id)
    setMoreOpen(false)
  }

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-background/80 backdrop-blur-xl border-t border-border"
      dir="rtl"
    >
      <div className="flex items-center justify-around h-16 px-2 pb-[env(safe-area-inset-bottom)]">
        {mainNavItems.map((item) => {
          const isActive = activeModule === item.id
          const Icon = item.icon
          return (
            <button
              key={item.id}
              onClick={() => handleNav(item.id)}
              className={cn(
                'relative flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors min-w-0',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isActive
                  ? 'text-white'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
            >
              {isActive && (
                <motion.div
                  layoutId="mobile-nav-active"
                  className="absolute inset-0 bg-forest rounded-xl"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <Icon className="relative z-10 h-5 w-5 shrink-0" />
              <span className="relative z-10 text-[10px] font-medium leading-tight truncate max-w-[64px]">
                {item.label}
              </span>
            </button>
          )
        })}

        {/* More button */}
        <div ref={moreRef} className="relative">
          <button
            onClick={() => setMoreOpen((prev) => !prev)}
            className={cn(
              'relative flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'text-muted-foreground hover:text-foreground'
            )}
            aria-label="المزيد"
            aria-expanded={moreOpen}
            aria-haspopup="true"
          >
            <MoreHorizontal className="h-5 w-5 shrink-0" />
            <span className="text-[10px] font-medium leading-tight">المزيد</span>
          </button>

          <AnimatePresence>
            {moreOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className="absolute bottom-full right-0 mb-2 w-48 rounded-xl bg-background/95 backdrop-blur-xl border border-border shadow-xl p-1.5"
                dir="rtl"
              >
                {moreItems.map((item) => {
                  const isActive = activeModule === item.id
                  const Icon = item.icon
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNav(item.id)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        isActive
                          ? 'bg-forest text-white'
                          : 'text-foreground hover:bg-accent'
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  )
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </nav>
  )
}
