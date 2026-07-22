'use client'

import { useState, useEffect, useMemo } from 'react'

type TimePeriod = 'dawn' | 'morning' | 'afternoon' | 'evening' | 'night'

interface TimeOfDayConfig {
  greeting: string
  icon: string
  accent: string
  glowFrom: string
  glowTo: string
  label: string
  isNight: boolean
}

const TIME_PERIOD_CONFIGS: Record<TimePeriod, TimeOfDayConfig> = {
  dawn: {
    greeting: 'صباح الخير ☀️',
    icon: '🌅',
    accent: '#f59e0b',
    glowFrom: '#fbbf24',
    glowTo: '#f97316',
    label: 'الفجر',
    isNight: false,
  },
  morning: {
    greeting: 'صباح النور 🌤️',
    icon: '☀️',
    accent: '#059669',
    glowFrom: '#10b981',
    glowTo: '#34d399',
    label: 'الصباح',
    isNight: false,
  },
  afternoon: {
    greeting: 'مساء النهار 🌞',
    icon: '🌤️',
    accent: '#d97706',
    glowFrom: '#f59e0b',
    glowTo: '#d97706',
    label: 'بعد الظهر',
    isNight: false,
  },
  evening: {
    greeting: 'مساء الخير 🌆',
    icon: '🌇',
    accent: '#92400e',
    glowFrom: '#f59e0b',
    glowTo: '#92400e',
    label: 'المساء',
    isNight: false,
  },
  night: {
    greeting: 'طابت ليلتك 🌙',
    icon: '🌙',
    accent: '#064e3b',
    glowFrom: '#065f46',
    glowTo: '#022c22',
    label: 'الليل',
    isNight: true,
  },
}

function getCairoHour(): number | null {
  if (typeof window === 'undefined') return null
  try {
    const utcHour = new Date().getUTCHours()
    return (utcHour + 2) % 24
  } catch {
    return null
  }
}

function getTimePeriod(hour: number): TimePeriod {
  if (hour >= 5 && hour < 7) return 'dawn'
  if (hour >= 7 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 21) return 'evening'
  return 'night'
}

const DEFAULT_CONFIG = TIME_PERIOD_CONFIGS.morning

export function useTimeOfDay() {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now())
    }, 60_000)
    return () => clearInterval(interval)
  }, [])

  const result = useMemo(() => {
    const hour = getCairoHour()

    if (hour === null) {
      return {
        greeting: DEFAULT_CONFIG.greeting,
        icon: DEFAULT_CONFIG.icon,
        accent: DEFAULT_CONFIG.accent,
        glowFrom: DEFAULT_CONFIG.glowFrom,
        glowTo: DEFAULT_CONFIG.glowTo,
        label: DEFAULT_CONFIG.label,
        isNight: DEFAULT_CONFIG.isNight,
        period: 'morning' as TimePeriod,
      }
    }

    const period = getTimePeriod(hour)
    const config = TIME_PERIOD_CONFIGS[period]

    return {
      greeting: config.greeting,
      icon: config.icon,
      accent: config.accent,
      glowFrom: config.glowFrom,
      glowTo: config.glowTo,
      label: config.label,
      isNight: config.isNight,
      period,
    }
  }, [now])

  return result
}
