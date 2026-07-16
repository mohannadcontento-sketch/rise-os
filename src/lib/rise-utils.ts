import { format, startOfDay, startOfWeek, startOfMonth, subDays, eachDayOfInterval } from 'date-fns'
import { ar } from 'date-fns/locale'

export function getToday(): string {
  return format(startOfDay(new Date()), 'yyyy-MM-dd')
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

export function calculateXpForLevel(level: number): number {
  return Math.floor(100 * Math.pow(1.15, level - 1))
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