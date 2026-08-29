'use client'

import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RiseIcon } from './icons'
import { BellToggle } from './kit-v2'

interface Habit {
  id: string
  name: string
  icon: string
  color: string
  reminderTime?: string | null
}

interface HabitRemindersProps {
  habits: Habit[]
  onToggleReminder: (habitId: string, time: string | null) => void
}

/* ────────────── Component ────────────── */

export function HabitReminders({ habits, onToggleReminder }: HabitRemindersProps) {
  const [currentTime, setCurrentTime] = useState<string | null>(null)

  /* ── Keep a live clock for the "upcoming" banner ──
     NOTE: the actual reminder firing moved to the global ReminderEngine
     (mounted in the app shell) so reminders work on every page and are
     delivered as toast + browser notification + bell inbox. This component
     only renders the upcoming-reminders banner — no duplicate toasts. */
  useEffect(() => {
    const update = () => {
      const now = new Date()
      setCurrentTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`)
    }
    update()
    const interval = setInterval(update, 60000)
    return () => clearInterval(interval)
  }, [])

  const habitsWithReminders = useMemo(
    () => habits.filter((h) => h.reminderTime),
    [habits]
  )

  const upcomingReminders = useMemo(() => {
    if (!currentTime) return []
    const [h, m] = currentTime.split(':').map(Number)
    const nowMin = h * 60 + m
    return habitsWithReminders
      .map((habit) => {
        if (!habit.reminderTime) return null
        const [rh, rm] = habit.reminderTime.split(':').map(Number)
        const habitMin = rh * 60 + rm
        const diff = habitMin - nowMin
        if (diff > 0 && diff <= 120) {
          return { habit, minutesLeft: diff }
        }
        return null
      })
      .filter(Boolean) as { habit: Habit; minutesLeft: number }[]
  }, [habitsWithReminders, currentTime])

  const formatMinutesLeft = (min: number): string => {
    if (min < 60) return `خلال ${min} دقيقة`
    const h = Math.floor(min / 60)
    const m = min % 60
    return m > 0 ? `خلال ${h} ساعة و${m} دقيقة` : `خلال ${h} ساعة`
  }

  return (
    <div className="space-y-3">
      {/* Upcoming Reminders Banner */}
      {upcomingReminders.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="neo-card card-lift rounded-2xl p-4 border-s-4 border-s-gold/50"
        >
          <div className="flex items-center gap-2 mb-3">
            <RiseIcon glyph="bell" hue="amber" size="sm" />
            <h3 className="text-sm font-bold">التذكيرات القادمة</h3>
          </div>
          <div className="space-y-2">
            {upcomingReminders.map(({ habit, minutesLeft }) => (
              <motion.div
                key={habit.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3 }}
                className="flex items-center gap-3 px-3 py-2 rounded-xl bg-card border border-border"
              >
                <span className="text-lg">{habit.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{habit.name}</p>
                  <p className="text-[10px] text-muted-foreground num" dir="ltr">{habit.reminderTime}</p>
                </div>
                <span className="text-[10px] font-medium text-gold whitespace-nowrap">
                  {formatMinutesLeft(minutesLeft)}
                </span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  )
}

/* ────────────── Bell Toggle Button ────────────── */

interface ReminderBellProps {
  habit: Habit
  onToggle: (habitId: string, time: string | null) => void
}

export function ReminderBell({ habit, onToggle }: ReminderBellProps) {
  const [settingTime, setSettingTime] = useState(false)
  const [timeInput, setTimeInput] = useState(habit.reminderTime || '')

  const handleToggle = () => {
    if (habit.reminderTime) {
      onToggle(habit.id, null)
      setSettingTime(false)
    } else {
      setSettingTime(true)
    }
  }

  const handleSave = () => {
    if (timeInput) {
      onToggle(habit.id, timeInput)
      setSettingTime(false)
    }
  }

  const handleCancel = () => {
    setTimeInput(habit.reminderTime || '')
    setSettingTime(false)
  }

  return (
    <div className="relative">
      <BellToggle
        enabled={!!habit.reminderTime}
        onToggle={() => handleToggle()}
        className="h-8 w-8 rounded-lg"
      />

      {/* Time input popover */}
      {settingTime && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="absolute top-full mt-1 left-0 z-30 bg-popover text-popover-foreground rounded-2xl p-3 shadow-lift border border-border min-w-[180px]"
        >
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-3.5 h-3.5 text-gold" />
            <span className="text-xs font-semibold">وقت التذكير</span>
          </div>
          <Input
            type="time"
            value={timeInput}
            onChange={(e) => setTimeInput(e.target.value)}
            className="rounded-lg h-8 text-xs text-center mb-2 num"
            dir="ltr"
          />
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={handleCancel}
              className="flex-1 h-7 text-[10px] rounded-lg border-border bg-card hover:bg-secondary"
            >
              إلغاء
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!timeInput}
              className="flex-1 h-7 text-[10px] rounded-lg bg-forest text-paper-soft hover:bg-forest/90 dark:bg-lime dark:text-ink dark:hover:bg-lime/90"
            >
              حفظ
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  )
}