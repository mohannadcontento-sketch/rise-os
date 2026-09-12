'use client'

// ============================================================
// use-focus-timer.ts — متحكم مؤقت «العمل العميق»
//
// يملك دورة حياة مؤقت جلسة التركيز بالكامل، معزولة عن العرض:
//   • حالة المؤقت (المدة/المتبقي/يعمل/متوقف مؤقتاً/مكتمل)
//   • استعادة الجلسة عبر انقلاب الصفحة (timestamp-based وليس عدّاد
//     setInterval — فالبقاء في خلفية التبويب لا يزيغ الوقت)
//   • ملاحظة «اكتمل أثناء الغياب» (خلال 5 دقائق من النهاية)
//   • الحفظ الدوري لحالة المؤقت في user-storage لإعادة الفتح
//
// الأصوات والاحتفال يبقيان مسؤولية العرض: مرِّر onEvent ليستقبل
// ('start'|'pause'|'resume'|'reset'|'navigate'|'complete') ويشغّل الصوت.
// حفظ الجلسة نفسه (saveSession) يبقى في المكوّن لأنه يعتمد على
// الملاحظات والـ XP وربط المهام.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { getUserStorage, setUserStorage, removeUserStorage } from '@/lib/user-storage'

const FOCUS_TIMER_STORAGE_KEY = 'rise-focus-timer-state'

export interface UseFocusTimerEvents {
  start?: () => void
  pause?: () => void
  resume?: () => void
  reset?: () => void
  navigate?: () => void
  /** المؤقت وصل للنهاية (استدعاء واحد لكل اكتمال) */
  complete?: () => void
}

export function useFocusTimer(events: UseFocusTimerEvents = {}) {
  const [selectedDuration, setSelectedDuration] = useState(25)
  const [customDuration, setCustomDuration] = useState('')
  const [timeRemaining, setTimeRemaining] = useState(25 * 60)
  const [isRunning, setIsRunning] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [sessionCompleted, setSessionCompleted] = useState(false)
  const [sessionStartTime, setSessionStartTime] = useState<string | null>(null)
  // مفتاح الاحتفال: يتزايد عند كل اكتمال ليُعيد تشغيل أنيميشن الرسم
  const [celebrateKey, setCelebrateKey] = useState(0)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const endTimeRef = useRef<number | null>(null)

  /* ── استعادة حالة المؤقت عند التحميل ── */
  useEffect(() => {
    try {
      const stored = getUserStorage(FOCUS_TIMER_STORAGE_KEY)
      if (stored) {
        const state = JSON.parse(stored)
        if (state.endTime && state.endTime > Date.now()) {
          // Timer still running
          const remaining = Math.max(0, Math.floor((state.endTime - Date.now()) / 1000))
          setSelectedDuration(state.duration)
          setTimeRemaining(remaining)
          setSessionStartTime(state.startedAt)
          setIsRunning(true)
          setIsPaused(false)
          endTimeRef.current = state.endTime
        } else if (state.endTime && state.endTime <= Date.now() && (Date.now() - state.endTime) < 5 * 60 * 1000) {
          // Completed while away
          setTimeRemaining(0)
          setSessionCompleted(true)
          setSessionStartTime(state.startedAt)
          setSelectedDuration(state.duration)
          removeUserStorage(FOCUS_TIMER_STORAGE_KEY)
        }
      }
    } catch { /* ignore */ }
  }, [])

  /* ── منطق المؤقت (timestamp-based) ── */
  useEffect(() => {
    if (isRunning && !isPaused) {
      if (!endTimeRef.current) {
        endTimeRef.current = Date.now() + timeRemaining * 1000
      }

      // Save state to localStorage
      try {
        setUserStorage(FOCUS_TIMER_STORAGE_KEY, JSON.stringify({
          endTime: endTimeRef.current,
          duration: selectedDuration,
          startedAt: sessionStartTime,
        }))
      } catch { /* ignore */ }

      intervalRef.current = setInterval(() => {
        const remaining = Math.max(0, Math.floor((endTimeRef.current! - Date.now()) / 1000))
        setTimeRemaining(remaining)

        if (remaining <= 0) {
          clearInterval(intervalRef.current!)
          intervalRef.current = null
          endTimeRef.current = null
          setIsRunning(false)
          setIsPaused(false)
          setSessionCompleted(true)
          setCelebrateKey((k) => k + 1)
          try { removeUserStorage(FOCUS_TIMER_STORAGE_KEY) } catch { /* ignore */ }
          events.complete?.()
        }
      }, 200)
    } else {
      if (!isRunning && !sessionCompleted) {
        try { removeUserStorage(FOCUS_TIMER_STORAGE_KEY) } catch { /* ignore */ }
      }
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
     
  }, [isRunning, isPaused, selectedDuration, sessionStartTime])

  /* ── أدوات التحكم ── */

  const start = useCallback(() => {
    if (!sessionStartTime) {
      setSessionStartTime(new Date().toISOString())
    }
    endTimeRef.current = null // Will be recalculated in the effect
    setIsRunning(true)
    setIsPaused(false)
    setSessionCompleted(false)
    events.start?.()
     
  }, [sessionStartTime])

  const pause = useCallback(() => {
    endTimeRef.current = Date.now() + timeRemaining * 1000
    setIsPaused(true)
    events.pause?.()
     
  }, [timeRemaining])

  const resume = useCallback(() => {
    endTimeRef.current = Date.now() + timeRemaining * 1000
    setIsPaused(false)
    events.resume?.()
     
  }, [timeRemaining])

  const reset = useCallback(() => {
    setIsRunning(false)
    setIsPaused(false)
    setSessionCompleted(false)
    setTimeRemaining(selectedDuration * 60)
    setSessionStartTime(null)
    endTimeRef.current = null
    try { removeUserStorage(FOCUS_TIMER_STORAGE_KEY) } catch { /* ignore */ }
    events.reset?.()
     
  }, [selectedDuration])

  /** إيقاف كامل (وليس إيقافاً مؤقتاً) — يُصفّر المؤقت وجلسة البداية */
  const stop = useCallback(() => {
    setIsRunning(false)
    setIsPaused(false)
    endTimeRef.current = null
    try { removeUserStorage(FOCUS_TIMER_STORAGE_KEY) } catch { /* ignore */ }
    setTimeRemaining(selectedDuration * 60)
    setSessionStartTime(null)
     
  }, [selectedDuration])

  /** اختيار مدة جاهزة — 0 يعني «مدة مخصصة» (يفتح حقل الإدخال) */
  const durationSelect = useCallback((min: number) => {
    if (isRunning) return
    if (min === 0) {
      // Custom duration — show input
      setSelectedDuration(0)
      return
    }
    setSelectedDuration(min)
    setTimeRemaining(min * 60)
    setSessionCompleted(false)
    setSessionStartTime(null)
    endTimeRef.current = null
    try { removeUserStorage(FOCUS_TIMER_STORAGE_KEY) } catch { /* ignore */ }
    events.navigate?.()
     
  }, [isRunning])

  /** تثبيت المدة المخصصة (1–480 دقيقة) */
  const customDurationSet = useCallback(() => {
    const min = parseInt(customDuration, 10)
    if (min && min > 0 && min <= 480) {
      setSelectedDuration(min)
      setTimeRemaining(min * 60)
      setSessionCompleted(false)
      setSessionStartTime(null)
      setCustomDuration('')
      events.navigate?.()
    }
     
  }, [customDuration])

  /** الدقائق المنقضية فعلياً في الجلسة الحالية (تُحسب قبل الإيقاف) */
  const elapsedMin = useCallback(
    () => Math.round((selectedDuration * 60 - timeRemaining) / 60),
    [selectedDuration, timeRemaining],
  )

  return {
    // الحالة
    selectedDuration,
    customDuration,
    timeRemaining,
    isRunning,
    isPaused,
    sessionCompleted,
    sessionStartTime,
    celebrateKey,
    // أدوات إضافية يحتاجها المكوّن
    setCustomDuration,
    setSessionCompleted,
    setSessionStartTime,
    setTimeRemaining,
    // التحكم
    start,
    pause,
    resume,
    reset,
    stop,
    durationSelect,
    customDurationSet,
    elapsedMin,
  }
}
