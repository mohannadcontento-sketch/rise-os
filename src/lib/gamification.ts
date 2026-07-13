/* ────────────── XP & Level System ────────────── */

export function calculateLevel(xp: number): {
  level: number
  currentXp: number
  xpToNext: number
  progress: number
} {
  let level = 1
  let remainingXp = xp
  while (remainingXp >= xpForLevel(level)) {
    remainingXp -= xpForLevel(level)
    level++
  }
  const needed = xpForLevel(level)
  return {
    level,
    currentXp: remainingXp,
    xpToNext: needed,
    progress: (remainingXp / needed) * 100,
  }
}

function xpForLevel(level: number): number {
  return Math.floor(100 * Math.pow(1.2, level - 1))
}

/* ────────────── Badges ────────────── */

export interface BadgeDef {
  id: string
  name: string
  icon: string
  desc: string
  condition: (stats: BadgeStats) => boolean
}

export interface BadgeStats {
  totalTasks: number
  streak: number
  totalFocusMin: number
  booksCompleted: number
  totalHabits: number
  journalStreak: number
}

export const BADGES: BadgeDef[] = [
  { id: 'first_task', name: 'البداية', icon: '🌱', desc: 'أكمل أول مهمة', condition: (stats) => stats.totalTasks >= 1 },
  { id: 'task_10', name: 'منتج', icon: '⚡', desc: 'أكمل 10 مهام', condition: (stats) => stats.totalTasks >= 10 },
  { id: 'task_50', name: 'محترف', icon: '🏆', desc: 'أكمل 50 مهمة', condition: (stats) => stats.totalTasks >= 50 },
  { id: 'task_100', name: 'أسطوري', icon: '👑', desc: 'أكمل 100 مهمة', condition: (stats) => stats.totalTasks >= 100 },
  { id: 'streak_3', name: 'ثلاثة أيام', icon: '🔥', desc: 'سلسلة 3 أيام', condition: (stats) => stats.streak >= 3 },
  { id: 'streak_7', name: 'أسبوع كامل', icon: '⭐', desc: 'سلسلة 7 أيام', condition: (stats) => stats.streak >= 7 },
  { id: 'streak_21', name: 'عادة متجذرة', icon: '💎', desc: 'سلسلة 21 يوم', condition: (stats) => stats.streak >= 21 },
  { id: 'streak_30', name: 'بطل الشهر', icon: '🥇', desc: 'سلسلة 30 يوم', condition: (stats) => stats.streak >= 30 },
  { id: 'focus_60', name: 'ساعة تركيز', icon: '🧠', desc: '60 دقيقة تركيز إجمالي', condition: (stats) => stats.totalFocusMin >= 60 },
  { id: 'focus_300', name: 'خبير التركيز', icon: '🎯', desc: '5 ساعات تركيز', condition: (stats) => stats.totalFocusMin >= 300 },
  { id: 'focus_1000', name: 'سيد التركيز', icon: '🧘', desc: '1000 دقيقة تركيز', condition: (stats) => stats.totalFocusMin >= 1000 },
  { id: 'books_1', name: 'قارئ', icon: '📖', desc: 'أنهي أول كتاب', condition: (stats) => stats.booksCompleted >= 1 },
  { id: 'books_12', name: 'قارئ نهم', icon: '📚', desc: 'أنهي 12 كتاب', condition: (stats) => stats.booksCompleted >= 12 },
  { id: 'habits_5', name: 'متعتاد', icon: '✅', desc: '5 عادات يومية', condition: (stats) => stats.totalHabits >= 5 },
  { id: 'journal_7', name: 'كاتب', icon: '✍️', desc: '7 أياميات متتالية', condition: (stats) => stats.journalStreak >= 7 },
]