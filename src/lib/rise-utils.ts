import { format, startOfDay, startOfWeek, startOfMonth, subDays, eachDayOfInterval } from 'date-fns'
import { ar } from 'date-fns/locale'

export function getToday(): string {
  // FIX: Use LOCAL date (not UTC) so "today" changes at midnight local time.
  // In Egypt (UTC+2), UTC midnight is 2am local time — tasks created at 00:30
  // were being counted as "yesterday" because UTC was still the previous day.
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Local-calendar YYYY-MM-DD for an arbitrary Date — never UTC-shifted.
 * `.toISOString().split('T')[0]` returns the UTC day, which is the
 * PREVIOUS calendar day for any time between local midnight and UTC
 * midnight in positive-offset timezones (e.g. Egypt, UTC+2/+3).
 */
export function toLocalDateStr(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}


export function getWeekDays(): string[] {
  const start = startOfWeek(new Date(), { weekStartsOn: 6 }) // Saturday
  const end = new Date()
  const days = eachDayOfInterval({ start, end })
  return days.map(d => format(d, 'yyyy-MM-dd'))
}

export function getMonthDays(): string[] {
  const start = startOfMonth(new Date())
  const end = new Date()
  const days = eachDayOfInterval({ start, end })
  return days.map(d => format(d, 'yyyy-MM-dd'))
}

export function getLast30Days(): string[] {
  const end = new Date()
  const start = subDays(end, 29)
  const days = eachDayOfInterval({ start, end })
  return days.map(d => format(d, 'yyyy-MM-dd'))
}

export function formatDateAr(dateStr: string): string {
  try {
    return format(new Date(dateStr), 'dd MMMM yyyy', { locale: ar })
  } catch {
    return dateStr
  }
}

export function formatDateShort(dateStr: string): string {
  try {
    return format(new Date(dateStr), 'dd/MM', { locale: ar })
  } catch {
    return dateStr
  }
}

export function getDayName(dateStr: string): string {
  try {
    return format(new Date(dateStr), 'EEEE', { locale: ar })
  } catch {
    return ''
  }
}

export function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 6) return 'طاب مساؤك'
  if (hour < 12) return 'صباح الخير'
  if (hour < 17) return 'مساء الخير'
  if (hour < 21) return 'مساء النور'
  return 'طاب مساؤك'
}

/**
 * XP required to advance FROM `level` to level+1.
 * BALANCE FIX: 1.15 → 1.35 — الطلب كان "خليها أصعب شوية".
 * بالمعامل القديم المستخدم النشط (~300 XP/يوم) كان بيوصل مستوى 10 في أسبوع،
 * دلوقتي ~أسبوعين، والمستويات المتقدمة بتتطلب استمرارية مش يوم واحد مجنون.
 */
export function calculateXpForLevel(level: number): number {
  return Math.floor(100 * Math.pow(1.35, level - 1))
}

/* ══════════════════════════════════════════════════════════════════════
   TIMEZONE-SAFE DAY HELPERS (توقيت القاهرة)

   خلل سابق: الـ timestamps (completed_at / started_at) بتتخزن UTC، والمقارنة
   كانت `String(ts).slice(0,10) === date` — يعني بتقارن تاريخ UTC بتاريخ
   العميل المحلي. في مصر (UTC+2/+3) أي إنجاز بين 12:00 و2:00 صباحاً بالقاهرة
   كان بيتحسب على يوم الأمس، وجلسات التركيز كذلك.

   isoToCairoDate() بتحوّل أي timestamp لتاريخ القاهرة (yyyy-MM-dd) عبر Intl
   (بيدعم DST تلقائياً). الـ fallback هو التاريخ المحلي لو Intl غير متاح.
   ══════════════════════════════════════════════════════════════════════ */

const CAIRO_TIMEZONE = 'Africa/Cairo'

// Module-level formatter (cheap to reuse; Intl construction is expensive)
const cairoDayFormatter = (() => {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: CAIRO_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  } catch {
    return null // Intl/timezone unavailable (old runtime) — fallback below
  }
})()

/**
 * Convert any date/ISO-timestamp to the Cairo-local calendar day (yyyy-MM-dd).
 * This is THE canonical way to bucket a stored timestamp into a day —
 * never use `String(ts).slice(0, 10)` (that yields the UTC day).
 */
export function isoToCairoDate(value: string | Date | null | undefined): string | null {
  if (!value) return null
  try {
    const d = value instanceof Date ? value : new Date(value)
    if (isNaN(d.getTime())) return null
    if (cairoDayFormatter) return cairoDayFormatter.format(d) // en-CA → yyyy-MM-dd
    return toLocalDateStr(d)
  } catch {
    return null
  }
}

/**
 * Server-safe "today in Cairo" — used as a FALLBACK when the client doesn't
 * send its own ?date= (the client date stays authoritative when present).
 * On Vercel the server clock is UTC, so getToday() alone shifts the day.
 */
export function getTodayCairo(): string {
  return isoToCairoDate(new Date()) || getToday()
}

/**
 * Task completion day — prefers the bucket date of completedAt converted to
 * Cairo. Returns null for tasks that were never completed.
 */
export function taskCompletedDay(t: { completedAt?: string | Date | null }): string | null {
  if (!t?.completedAt) return null
  return isoToCairoDate(t.completedAt)
}

/**
 * LIVE STREAK — consecutive active days ending today (or yesterday, with a
 * one-day grace period: the user is "still on streak" until the day ends).
 *
 * خلل سابق: profiles.streak كان بيتحدث في mock mode فقط — في الإنتاج
 * (Supabase) ظل صفر للأبد. دلوقتي السلسلة بتتحسب من النشاط الفعلي:
 * عادة مكتملة / مهمة منجزة / سجل صباحي / جلسة تركيز مكتملة.
 *
 * @param activeDays set of yyyy-MM-dd strings with at least one completion
 * @param today      the client's local today (yyyy-MM-dd)
 */
export function computeStreakFromActivity(activeDays: Set<string>, today: string): number {
  if (activeDays.size === 0) return 0

  // Walk back day-by-day from `today` using noon-time Date arithmetic
  // (noon avoids DST edge cases when subtracting days).
  const dayAtOffset = (base: string, offsetDays: number): string => {
    const [y, m, d] = base.split('-').map(Number)
    const dt = new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0)
    dt.setDate(dt.getDate() + offsetDays)
    return toLocalDateStr(dt)
  }

  let streak = 0
  // Grace: if today has no activity yet, start counting from yesterday —
  // the streak isn't broken until the whole day passes without action.
  let cursor = activeDays.has(today) ? today : dayAtOffset(today, -1)
  if (activeDays.has(cursor)) {
    while (activeDays.has(cursor)) {
      streak++
      cursor = dayAtOffset(cursor, -1)
      if (streak > 3650) break // sanity bound (~10 years)
    }
  }
  return streak
}

export function getHeatLevel(value: number, max: number = 4): number {
  if (max === 0) return 0
  const ratio = value / max
  if (ratio === 0) return 0
  if (ratio <= 0.25) return 1
  if (ratio <= 0.5) return 2
  if (ratio <= 0.75) return 3
  return 4
}

export const priorityColors: Record<string, string> = {
  low: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  medium: 'bg-gold/10 text-yellow-700 dark:text-gold',
  high: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  urgent: 'bg-red-500/10 text-red-600 dark:text-red-400',
}

export const priorityLabels: Record<string, string> = {
  low: 'منخفض',
  medium: 'متوسط',
  high: 'مرتفع',
  urgent: 'عاجل',
}

export const statusLabels: Record<string, string> = {
  todo: 'للتنفيذ',
  in_progress: 'قيد التنفيذ',
  done: 'مكتمل',
  cancelled: 'ملغى',
}

export const goalTypeLabels: Record<string, string> = {
  annual: 'سنوي',
  quarterly: 'ربع سنوي',
  monthly: 'شهري',
  weekly: 'أسبوعي',
  daily: 'يومي',
}

/**
 * Safely coerce any value to a number. Returns 0 for non-numeric inputs.
 * Prevents React #130 when API returns objects instead of numbers.
 */
export function safeNum(v: unknown): number {
  if (typeof v === 'number' && !isNaN(v)) return v
  if (typeof v === 'string') {
    const n = parseFloat(v)
    return isNaN(n) ? 0 : n
  }
  return 0
}

/**
 * Safely coerce any value to a string. Returns '' for objects/null/undefined.
 * Prevents React #130 when API returns objects instead of strings.
 */
export function safeStr(v: unknown): string {
  if (typeof v === 'string') return v
  if (v == null) return ''
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return ''
}

/**
 * Convert a number to Arabic numerals. Handles objects, null, undefined, NaN.
 */
export function toArabicNum(n: unknown): string {
  if (n == null || typeof n === 'object') return '٠'
  const num = typeof n === 'string' ? parseFloat(n) : typeof n === 'number' ? n : 0
  if (isNaN(num)) return '٠'
  return num.toString().replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[parseInt(d)])
}

/**
 * Safely get the first character of a string. Returns fallback for null/undefined/non-strings.
 */
export function safeCharAt(value: unknown, index = 0, fallback = 'م'): string {
  if (typeof value === 'string' && value.length > 0) {
    return value.charAt(index) || fallback
  }
  return fallback
}