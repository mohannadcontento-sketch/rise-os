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
  X,
  Flame,
  BookOpen,
  Target,
  Sparkles,
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
  startOfDay,
  endOfDay,
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

interface HabitLog {
  habitId: string
  date: string
  completed: boolean
}

interface Habit {
  id: string
  name: string
}

interface JournalEntry {
  id: string
  date: string
  content: string
  mood: number | null
  gratitude?: string | null
}

interface FocusSession {
  id: string
  startedAt: string
  completed: boolean
  actualMin: number
}

/* ────────────── Helpers ────────────── */

const priorityColors: Record<string, string> = {
  low: 'bg-emerald-500',
  medium: 'bg-amber-500',
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

const moodEmojis: Record<number, string> = {
  1: '😞',
  2: '😔',
  3: '😐',
  4: '😊',
  5: '🤩',
}

/* ────────────── Component ────────────── */

export default function CalendarView() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [tasks, setTasks] = useState<Task[]>([])
  const [habits, setHabits] = useState<Habit[]>([])
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([])
  const [journals, setJournals] = useState<JournalEntry[]>([])
  const [focusSessions, setFocusSessions] = useState<FocusSession[]>([])
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)
  const [slideDirection, setSlideDirection] = useState<1 | -1>(1)

  const fetchAllData = useCallback(async () => {
    try {
      const [tasksRes, habitsRes, journalRes, focusRes] = await Promise.all([
        fetch('/api/rise/tasks'),
        fetch('/api/rise/habits'),
        fetch('/api/rise/journal'),
        fetch('/api/rise/focus'),
      ])
      const [tasksData, habitsData, journalData, focusData] = await Promise.all([
        tasksRes.json(),
        habitsRes.json(),
        journalRes.json(),
        focusRes.json(),
      ])
      setTasks(tasksData.tasks || [])
      setHabits(habitsData.habits || [])
      setHabitLogs(habitsData.logs || [])
      setJournals(journalData.recentJournals || [])
      setFocusSessions(focusData.sessions || [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAllData()
  }, [fetchAllData])

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

  // Month stats
  const monthStats = useMemo(() => {
    const monthStr = format(currentMonth, 'yyyy-MM')
    const monthTasks = tasks.filter((t) => t.dueDate?.startsWith(monthStr))
    const completedMonthTasks = monthTasks.filter((t) => t.status === 'done')
    const monthFocus = focusSessions.filter(
      (s) => s.startedAt.startsWith(monthStr) && s.completed
    )
    const focusMin = monthFocus.reduce((sum, s) => sum + (s.actualMin || 0), 0)
    const monthJournals = journals.filter((j) => j.date?.startsWith(monthStr))
    return {
      tasksCount: monthTasks.length,
      focusSessions: monthFocus.length,
      journalDays: monthJournals.length,
    }
  }, [tasks, focusSessions, journals, currentMonth])

  // Build day indicators map
  const dayIndicators = useMemo(() => {
    const map: Record<string, { hasCompletedTasks: boolean; hasGoals: boolean; hasJournal: boolean }> = {}
    // Tasks: green dot = has completed tasks
    tasks.forEach((task) => {
      if (task.dueDate && task.status === 'done') {
        if (!map[task.dueDate]) map[task.dueDate] = { hasCompletedTasks: false, hasGoals: false, hasJournal: false }
        map[task.dueDate].hasCompletedTasks = true
      }
    })
    // Goals with deadlines: gold dot
    // We check tasks with high/urgent priority as a proxy for "goals due"
    tasks.forEach((task) => {
      if (task.dueDate && (task.priority === 'high' || task.priority === 'urgent')) {
        if (!map[task.dueDate]) map[task.dueDate] = { hasCompletedTasks: false, hasGoals: false, hasJournal: false }
        map[task.dueDate].hasGoals = true
      }
    })
    // Journal: blue dot
    journals.forEach((j) => {
      if (j.date) {
        if (!map[j.date]) map[j.date] = { hasCompletedTasks: false, hasGoals: false, hasJournal: false }
        map[j.date].hasJournal = true
      }
    })
    return map
  }, [tasks, journals])

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

  const getHabitStatusForDate = (date: Date) => {
    const key = format(date, 'yyyy-MM-dd')
    const dayLogs = habitLogs.filter((l) => l.date === key && l.completed)
    return {
      completed: dayLogs.length,
      total: habits.length,
      items: dayLogs.map((log) => {
        const habit = habits.find((h) => h.id === log.habitId)
        return { name: habit?.name || '', completed: log.completed }
      }),
    }
  }

  const getJournalForDate = (date: Date) => {
    const key = format(date, 'yyyy-MM-dd')
    return journals.find((j) => j.date === key) || null
  }

  const selectedTasks = selectedDate ? getTasksForDate(selectedDate) : []
  const selectedHabitStatus = selectedDate ? getHabitStatusForDate(selectedDate) : null
  const selectedJournal = selectedDate ? getJournalForDate(selectedDate) : null

  const todayTasks = getTasksForDate(new Date())
  const upcomingTasks = tasks
    .filter((t) => t.dueDate && !isBefore(parseISO(t.dueDate), new Date()) && t.status !== 'done')
    .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
    .slice(0, 5)

  const goToToday = () => {
    setSlideDirection(new Date() < currentMonth ? -1 : 1)
    setCurrentMonth(new Date())
  }

  const goToPrevMonth = () => {
    setSlideDirection(-1)
    setCurrentMonth((prev) => subMonths(prev, 1))
  }

  const goToNextMonth = () => {
    setSlideDirection(1)
    setCurrentMonth((prev) => addMonths(prev, 1))
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">التقويم</h2>
          <p className="text-sm text-muted-foreground mt-1">عرض مهامك وأحداثك على التقويم</p>
        </div>
      </div>

      {/* Mini Stats Bar */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4 sm:gap-6 flex-wrap text-sm"
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-muted-foreground">
            <span className="font-bold text-foreground">{monthStats.tasksCount}</span> مهام هذا الشهر
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-accent" />
          <span className="text-muted-foreground">
            <span className="font-bold text-foreground">{monthStats.focusSessions}</span> جلسات تركيز
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="text-muted-foreground">
            <span className="font-bold text-foreground">{monthStats.journalDays}</span> يوم يوميات
          </span>
        </div>
      </motion.div>

      <div className="flex gap-4 flex-col lg:flex-row">
        {/* Calendar Grid */}
        <div className="flex-1 min-w-0">
          <Card className="glass">
            <CardContent className="p-4 sm:p-5">
              {/* Month Navigation */}
              <div className="flex items-center justify-between mb-6">
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={goToPrevMonth}
                  className="p-2 rounded-xl hover:bg-muted/50 transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </motion.button>
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-bold">
                    {format(currentMonth, 'MMMM yyyy', { locale: ar })}
                  </h3>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={goToToday}
                    className="text-[11px] font-semibold px-3 py-1 rounded-full bg-emerald-accent/10 text-emerald-accent hover:bg-emerald-accent/20 transition-colors"
                  >
                    اليوم
                  </motion.button>
                </div>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={goToNextMonth}
                  className="p-2 rounded-xl hover:bg-muted/50 transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </motion.button>
              </div>

              {/* Weekday Headers */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {weekDays.map((day) => (
                  <div key={day} className="text-center text-[11px] font-semibold text-muted-foreground py-2">
                    {day}
                  </div>
                ))}
              </div>

              {/* Day Cells with slide animation */}
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={currentMonth.toISOString().slice(0, 7)}
                  initial={{ opacity: 0, x: slideDirection * 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: slideDirection * -30 }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                  className="grid grid-cols-7 gap-1"
                >
                  {calendarDays.map((day, i) => {
                    const dayKey = format(day, 'yyyy-MM-dd')
                    const dayTasks = getTasksForDate(day)
                    const isSelected = selectedDate && isSameDay(day, selectedDate)
                    const inMonth = isSameMonth(day, currentMonth)
                    const isTodayDate = isToday(day)
                    const indicators = dayIndicators[dayKey]

                    return (
                      <motion.button
                        key={i}
                        whileTap={{ scale: 0.92 }}
                        onClick={() => setSelectedDate(isSelected ? null : day)}
                        className={cn(
                          'relative aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all text-sm font-medium',
                          !inMonth && 'text-muted-foreground/25',
                          inMonth && !isTodayDate && !isSelected && 'text-foreground hover:bg-muted/40',
                          isTodayDate && !isSelected && 'ring-2 ring-emerald-accent/50 bg-emerald-accent/5 text-emerald-accent font-bold',
                          isSelected && 'bg-emerald-accent text-white shadow-lg shadow-emerald-accent/25',
                        )}
                      >
                        <span
                          className={cn(
                            'text-xs sm:text-sm leading-none',
                            isTodayDate && !isSelected && 'w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center bg-emerald-accent/15',
                          )}
                        >
                          {format(day, 'd')}
                        </span>
                        {/* Colored dots */}
                        {inMonth && indicators && (
                          <div className="flex gap-0.5 h-1.5 items-center">
                            {indicators.hasCompletedTasks && (
                              <div className={cn('w-1.5 h-1.5 rounded-full', isSelected ? 'bg-white/90' : 'bg-emerald-500')} />
                            )}
                            {indicators.hasGoals && (
                              <div className={cn('w-1.5 h-1.5 rounded-full', isSelected ? 'bg-white/90' : 'bg-amber-500')} />
                            )}
                            {indicators.hasJournal && (
                              <div className={cn('w-1.5 h-1.5 rounded-full', isSelected ? 'bg-white/90' : 'bg-blue-500')} />
                            )}
                          </div>
                        )}
                        {/* Task count badge for days with many tasks */}
                        {inMonth && dayTasks.length > 2 && (
                          <span className={cn(
                            'absolute -top-0.5 -left-0.5 text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center',
                            isSelected ? 'bg-white/30 text-white' : 'bg-emerald-accent/15 text-emerald-accent'
                          )}>
                            {dayTasks.length}
                          </span>
                        )}
                      </motion.button>
                    )
                  })}
                </motion.div>
              </AnimatePresence>

              {/* Legend */}
              <div className="flex items-center justify-center gap-4 mt-4 pt-3 border-t border-border/30">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  مهام مكتملة
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  أهداف مستحقة
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  يوميات
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Slide-in Panel (Desktop) / Below Calendar (Mobile) */}
        <div className="lg:w-80 shrink-0 space-y-4">
          <AnimatePresence mode="wait">
            {selectedDate && (
              <motion.div
                key="selected-panel"
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 40 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              >
                <Card className="glass border-r-4 border-r-emerald-accent overflow-hidden">
                  {/* Date Header */}
                  <div className="bg-gradient-to-l from-emerald-accent/8 to-transparent px-4 pt-4 pb-3">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-2xl font-bold">{format(selectedDate, 'd', { locale: ar })}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(selectedDate, 'EEEE d MMMM yyyy', { locale: ar })}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {isToday(selectedDate) && (
                          <Badge className="bg-emerald-accent/15 text-emerald-accent border-0 text-[10px]">اليوم</Badge>
                        )}
                        <motion.button
                          whileTap={{ scale: 0.9 }}
                          onClick={() => setSelectedDate(null)}
                          className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </motion.button>
                      </div>
                    </div>
                  </div>

                  <CardContent className="p-4 space-y-4">
                    {/* Tasks Section */}
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                        <Target className="w-3 h-3 text-emerald-accent" />
                        المهام ({selectedTasks.length})
                      </h4>
                      {selectedTasks.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-3 bg-muted/20 rounded-xl">لا توجد مهام</p>
                      ) : (
                        <div className="space-y-1.5 max-h-36 overflow-y-auto">
                          {selectedTasks.map((task) => (
                            <div key={task.id} className="flex items-start gap-2 p-2 rounded-lg hover:bg-muted/30 transition-colors">
                              {task.status === 'done' ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                              ) : (
                                <Circle className="w-3.5 h-3.5 text-muted-foreground/40 mt-0.5 shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className={cn('text-xs font-medium', task.status === 'done' && 'line-through text-muted-foreground')}>
                                  {task.title}
                                </p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  {task.dueTime && (
                                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                      <Clock className="w-2.5 h-2.5" />
                                      {task.dueTime}
                                    </span>
                                  )}
                                  <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">
                                    {priorityLabels[task.priority] || task.priority}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Habits Section */}
                    {selectedHabitStatus && selectedHabitStatus.total > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                          <Flame className="w-3 h-3 text-orange-500" />
                          العادات ({selectedHabitStatus.completed}/{selectedHabitStatus.total})
                        </h4>
                        <div className="grid grid-cols-2 gap-1.5">
                          {selectedHabitStatus.items.slice(0, 6).map((h, idx) => (
                            <div
                              key={idx}
                              className={cn(
                                'flex items-center gap-1.5 text-[11px] px-2 py-1.5 rounded-lg',
                                h.completed ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-muted/20 text-muted-foreground'
                              )}
                            >
                              {h.completed ? (
                                <CheckCircle2 className="w-3 h-3 shrink-0" />
                              ) : (
                                <Circle className="w-3 h-3 shrink-0 opacity-40" />
                              )}
                              <span className="truncate">{h.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Journal Snippet */}
                    {selectedJournal && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                          <BookOpen className="w-3 h-3 text-blue-500" />
                          اليوميات
                        </h4>
                        <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            {selectedJournal.mood && (
                              <span className="text-lg">{moodEmojis[selectedJournal.mood] || '😐'}</span>
                            )}
                            <span className="text-[10px] text-muted-foreground">
                              {selectedJournal.gratitude || selectedJournal.content?.slice(0, 50) || 'يوميات'}
                            </span>
                          </div>
                          {selectedJournal.content && (
                            <p className="text-[11px] text-muted-foreground line-clamp-3 leading-relaxed">
                              {selectedJournal.content}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Today's Tasks (when no date selected) */}
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
                <Sparkles className="w-4 h-4 text-amber-500" />
                المهام القادمة
              </CardTitle>
            </CardHeader>
            <CardContent>
              {upcomingTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">لا توجد مهام قادمة</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {upcomingTasks.map((task) => (
                    <motion.div
                      key={task.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-muted/30 transition-colors"
                    >
                      <div className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', priorityColors[task.priority] || 'bg-muted')} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{task.title}</p>
                        {task.dueDate && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {format(parseISO(task.dueDate), 'd MMMM', { locale: ar })}
                          </p>
                        )}
                      </div>
                    </motion.div>
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