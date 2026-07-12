'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronRight,
  ChevronLeft,
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock,
  AlertCircle,
  X,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
  isToday,
  parseISO,
  isBefore,
} from 'date-fns'
import { ar } from 'date-fns/locale/ar'

/* ────────────── Types ────────────── */

interface Task {
  id: string
  title: string
  status: string
  priority: string
  dueDate: string | null
  dueTime: string | null
  projectName?: string
  projectColor?: string
}

/* ────────────── Helpers ────────────── */

const priorityColors: Record<string, string> = {
  low: 'bg-emerald-accent',
  medium: 'bg-gold',
  high: 'bg-orange-500',
  urgent: 'bg-rose-500',
}

const priorityLabels: Record<string, string> = {
  low: 'منخفض',
  medium: 'متوسط',
  high: 'عالي',
  urgent: 'عاجل',
}

const weekDays = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

/* ────────────── Component ────────────── */

export default function CalendarView() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [tasks, setTasks] = useState<Task[]>([])
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/rise/tasks')
      const data = await res.json()
      setTasks(data.tasks || [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  // Calendar grid
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(monthStart)
    const calStart = startOfWeek(monthStart, { weekStartsOn: 0 })
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })

    const days: Date[] = []
    let day = calStart
    while (day <= calEnd) {
      days.push(day)
      day = addDays(day, 1)
    }
    return days
  }, [currentMonth])

  // Tasks grouped by date
  const tasksByDate = useMemo(() => {
    const map: Record<string, Task[]> = {}
    tasks.forEach((task) => {
      if (task.dueDate) {
        if (!map[task.dueDate]) map[task.dueDate] = []
        map[task.dueDate].push(task)
      }
    })
    return map
  }, [tasks])

  const getTasksForDate = (date: Date) => {
    const key = format(date, 'yyyy-MM-dd')
    return tasksByDate[key] || []
  }

  const selectedTasks = selectedDate ? getTasksForDate(selectedDate) : []

  const todayTasks = getTasksForDate(new Date())
  const upcomingTasks = tasks
    .filter((t) => t.dueDate && !isBefore(parseISO(t.dueDate), new Date()) && t.status !== 'done')
    .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
    .slice(0, 5)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">التقويم</h2>
        <p className="text-sm text-muted-foreground mt-1">عرض مهامك وأحداثك على التقويم</p>
      </div>

      <div className="flex gap-4 flex-col lg:flex-row">
        {/* Calendar Grid */}
        <div className="flex-1 min-w-0">
          <Card className="glass">
            <CardContent className="p-4 sm:p-5">
              {/* Month Navigation */}
              <div className="flex items-center justify-between mb-6">
                <button
                  onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                  className="p-2 rounded-xl hover:bg-muted/50 transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
                <h3 className="text-lg font-bold">
                  {format(currentMonth, 'MMMM yyyy', { locale: ar })}
                </h3>
                <button
                  onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                  className="p-2 rounded-xl hover:bg-muted/50 transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              </div>

              {/* Weekday Headers */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {weekDays.map((day) => (
                  <div key={day} className="text-center text-[11px] font-semibold text-muted-foreground py-2">
                    {day}
                  </div>
                ))}
              </div>

              {/* Day Cells */}
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((day, i) => {
                  const dayTasks = getTasksForDate(day)
                  const isSelected = selectedDate && isSameDay(day, selectedDate)
                  const inMonth = isSameMonth(day, currentMonth)
                  const isTodayDate = isToday(day)
                  const hasTasks = dayTasks.length > 0

                  return (
                    <motion.button
                      key={i}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setSelectedDate(isSelected ? null : day)}
                      className={cn(
                        'relative aspect-square rounded-xl flex flex-col items-center justify-center gap-1 transition-all text-sm font-medium',
                        !inMonth && 'text-muted-foreground/30',
                        inMonth && !isTodayDate && !isSelected && 'text-foreground hover:bg-muted/50',
                        isTodayDate && !isSelected && 'bg-emerald-accent/10 text-emerald-accent font-bold',
                        isSelected && 'bg-emerald-accent text-white shadow-lg shadow-emerald-accent/25',
                      )}
                    >
                      <span className={cn('text-xs sm:text-sm', isTodayDate && 'w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center', isTodayDate && !isSelected && 'bg-emerald-accent/15')}>
                        {format(day, 'd')}
                      </span>
                      {hasTasks && (
                        <div className="flex gap-0.5">
                          {dayTasks.slice(0, 3).map((t, ti) => (
                            <div
                              key={ti}
                              className={cn(
                                'w-1.5 h-1.5 rounded-full',
                                isSelected ? 'bg-white/80' : priorityColors[t.priority] || 'bg-muted-foreground/40'
                              )}
                            />
                          ))}
                        </div>
                      )}
                    </motion.button>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="lg:w-72 shrink-0 space-y-4">
          {/* Selected Day Tasks */}
          <AnimatePresence mode="wait">
            {selectedDate && (
              <motion.div
                key="selected"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <Card className="glass">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <CalendarDays className="w-4 h-4 text-emerald-accent" />
                        مهام اليوم
                      </CardTitle>
                      <button onClick={() => setSelectedDate(null)} className="p-1 rounded-lg hover:bg-muted/50 text-muted-foreground">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {format(selectedDate, 'EEEE d MMMM yyyy', { locale: ar })}
                    </p>
                  </CardHeader>
                  <CardContent>
                    {selectedTasks.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">لا توجد مهام في هذا اليوم</p>
                    ) : (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {selectedTasks.map((task) => (
                          <div key={task.id} className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-muted/30 transition-colors">
                            {task.status === 'done' ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-accent mt-0.5 shrink-0" />
                            ) : (
                              <Circle className="w-4 h-4 text-muted-foreground/40 mt-0.5 shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className={cn('text-xs font-medium', task.status === 'done' && 'line-through text-muted-foreground')}>
                                {task.title}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                {task.dueTime && (
                                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                    <Clock className="w-2.5 h-2.5" />
                                    {task.dueTime}
                                  </span>
                                )}
                                <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                                  {priorityLabels[task.priority] || task.priority}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Today's Tasks */}
          {!selectedDate && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Card className="glass">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-emerald-accent" />
                    مهام اليوم
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {todayTasks.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">لا توجد مهام لهذا اليوم</p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {todayTasks.map((task) => (
                        <div key={task.id} className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-muted/30 transition-colors">
                          {task.status === 'done' ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-accent mt-0.5 shrink-0" />
                          ) : (
                            <Circle className="w-4 h-4 text-muted-foreground/40 mt-0.5 shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className={cn('text-xs font-medium', task.status === 'done' && 'line-through text-muted-foreground')}>
                              {task.title}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              {task.dueTime && (
                                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                  <Clock className="w-2.5 h-2.5" />
                                  {task.dueTime}
                                </span>
                              )}
                              <div className={cn('w-2 h-2 rounded-full', priorityColors[task.priority] || 'bg-muted')} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Upcoming Tasks */}
          <Card className="glass">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-gold" />
                المهام القادمة
              </CardTitle>
            </CardHeader>
            <CardContent>
              {upcomingTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">لا توجد مهام قادمة</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {upcomingTasks.map((task) => (
                    <div key={task.id} className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-muted/30 transition-colors">
                      <div className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', priorityColors[task.priority] || 'bg-muted')} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{task.title}</p>
                        {task.dueDate && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {format(parseISO(task.dueDate), 'd MMMM', { locale: ar })}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}