import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch, apiPut, isFromCache } from '@/lib/api-fetch'
import { useDataRefresh } from '@/hooks/use-data-refresh'
import { useToday } from '@/hooks/use-today'

// ============================================================
// use-dashboard-data.ts — متحكم بيانات لوحة التحكم
//
// يجلب /api/rise/dashboard بتاريخ اليوم عبر كاش apiFetch، ويتلقى
// تحديثات فورية لعدّادات اليوم عبر rise:instant-update بلا إعادة جلب.
//
// المسؤوليات:
//   1) جلب متزامن واحد (fetchingRef) مع طلب معلّق واحد كحد أقصى.
//   2) مزامنة عدّادات اليوم لحظياً من طفرات الوحدات الأخرى.
//   3) نقل المهام المتأخرة إلى اليوم (PUT متتابعة + عدّ الفشل).
// ============================================================

export interface DashboardData {
  productivityScore?: number
  journalStreak?: number
  scoreBreakdown?: { tasks: number; habits: number; focus: number; morning: number; streak: number }
  user: { name: string; level: number; xp: number; xpToNextLevel?: number; streak: number; longestStreak: number; totalFocusMin: number; totalTasksDone: number }
  today: { tasksCompleted: number; tasksTotal: number; habitsCompleted: number; habitsTotal: number; focusMin: number; morningScore: number; overdueCount?: number }
  overdueTasks?: { id: string; title: string; dueDate?: string; priority?: string }[]
  tasks: { id: string; title: string; priority: string; done: boolean; projectName?: string; projectColor?: string }[]
  habits: { id: string; name: string; icon: string; color: string; todayCompleted: boolean; todayCount: number; targetCount: number; xpReward: number }[]
  recentFocus: { duration: number; actualMin: number; type: string; completed: boolean; startedAt: string }[]
  health: { sleepHours: number; waterGlasses: number; steps: number; mood: string; energy: string } | null
  morning: { score: number; totalItems: number } | null
  achievements: { badgeIcon: string; badgeName: string; badgeDesc?: string }[]
  dailyScores: { date: string; score?: number; morningScore?: number; taskScore?: number; habitScore?: number; focusScore?: number }[]
  goals: any[]
  books: any[]
  projects: any[]
}

// ── القسم: الـ hook — الحالة والجلب ──────────────────────────────────

export function useDashboardData() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fromCache, setFromCache] = useState(false)
  // حارس تزامن: منع جلبين متوازيين — الطلب الثاني يسجّل معلقاً وينفّذ بعد الأول
  const fetchingRef = useRef(false)
  const pendingRefreshRef = useRef(false)
  const todayDate = useToday()

  const fetchDashboard = useCallback(async () => {
    if (fetchingRef.current) {
      pendingRefreshRef.current = true
      return
    }
    fetchingRef.current = true
    try {
      setLoading(true)
      setError(null)
      const res = await apiFetch(`/api/rise/dashboard?date=${todayDate}`)
      if (!res.ok) throw new Error('فشل في تحميل البيانات')
      const json = await res.json()
      setFromCache(isFromCache(res))
      setData(json)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'حدث خطأ غير متوقع')
    } finally {
      setLoading(false)
      fetchingRef.current = false
      // حدث تحديث وصل أثناء الجلب؟ نفّذه الآن بعد انتهاء الجلب الحالي
      if (pendingRefreshRef.current) {
        pendingRefreshRef.current = false
        void fetchDashboard()
      }
    }
  }, [todayDate])

  // ── القسم: محفزات إعادة الجلب (data-changed / day-changed) ──────────────────────────────────

  const { refreshKey } = useDataRefresh()

  // الجلب عند الوصول وعند كل عدّ تحديث — اليوم الجديد يغيّر todayDate
  // فيولّد fetchDashboard جديداً ويجلب تاريخ اليوم الصحيح تلقائياً
  useEffect(() => {
    void fetchDashboard()
  }, [fetchDashboard, refreshKey])

  useEffect(() => {
    const handler = () => void fetchDashboard()
    window.addEventListener('rise:day-changed', handler)
    return () => window.removeEventListener('rise:day-changed', handler)
  }, [fetchDashboard])

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail ?? {}
      // تسوية تفاؤلية للعدّادات فقط — Math.max(0,..) يمنع النزول تحت الصفر عند سباق أحداث
      setData((prev) => {
        if (!prev?.today) return prev
        const today = { ...prev.today }
        if (detail.type === 'task') {
          if (typeof detail.deltaCompleted === 'number') today.tasksCompleted = Math.max(0, today.tasksCompleted + detail.deltaCompleted)
          if (typeof detail.deltaTotal === 'number') today.tasksTotal = Math.max(0, today.tasksTotal + detail.deltaTotal)
          if (typeof detail.overdueDelta === 'number') today.overdueCount = Math.max(0, (today.overdueCount || 0) + detail.overdueDelta)
        }
        if (detail.type === 'habit' && typeof detail.deltaCompleted === 'number') {
          today.habitsCompleted = Math.max(0, today.habitsCompleted + detail.deltaCompleted)
        }
        return { ...prev, today }
      })
    }
    window.addEventListener('rise:instant-update', handler)
    return () => window.removeEventListener('rise:instant-update', handler)
  }, [])

  // ── القسم: نقل المهام المتأخرة إلى اليوم ──────────────────────────────────

  const [movingId, setMovingId] = useState<string | null>(null)
  const moveOverdueToToday = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return
    setMovingId(ids.join(','))
    let failed = 0
    // PUT متتابعة (لا دفعية) لعدّ الإخفاقات بدقة — ثم جلب نهائي موحّد
    for (const id of ids) {
      try {
        const res = await apiPut('/api/rise/tasks', { id, dueDate: todayDate })
        if (!res.ok) failed++
      } catch {
        failed++
      }
    }
    setMovingId(null)
    await fetchDashboard()
    return failed
  }, [todayDate, fetchDashboard])

  return { data, setData, loading, error, fromCache, todayDate, fetchDashboard, movingId, moveOverdueToToday }
}
