/**
 * daily-score — المعادلة الموحدة لدرجة الإنتاجية اليومية.
 *
 * المشكلة التي تحلها: كان فيه 3 معادلات مختلفة لنفس "تقدم اليوم":
 *  1) dashboard API:       مهام .35 / عادات .25 / صباح .20 / تركيز .20 (مرجّحة، تركيز ÷50)
 *  2) productivity-score:  مهام .25 / عادات .25 / تركيز .20 / صباح .20 / سلسلة .10 (بدون ترجيح شرطي، تركيز ÷120)
 *  3) HorizonDial (الهيدر): (مهام+عادات+min(تركيز,60)) / (المجموع+60)
 * فكان الرقم في الهيدر ≠ الكارت الكبير ≠ شاشات المراجعة.
 *
 * المعادلة الوحيدة الآن (كل الشاشات تستهلكها):
 *  • أجزاء النشاط: المهام 0.35 / العادات 0.25 / الروتين الصباحي 0.20 / التركيز 0.20
 *    — تُرجَّح ثم تُعاد تسويتها (renormalize) على الأجزاء الموجودة فعلاً اليوم
 *    (يوم بلا مهام مجدولة لا يُعاقَب على المهام، وهكذا).
 *  • السلسلة تدخل 10% من الدرجة (سلسلة 30 يوم = الحد الأقصى) — استمرارية لها ثمن.
 *    الدرجة النهائية = 0.9 × (النشاط المرجّح المعاد تسويته) + 0.1 × (السلسلة/30).
 *  • العادات: العدّاد على العادات المستحقة اليوم فقط (daily كل يوم، weekdays
 *    الأحد–الخميس، weekends الجمعة–السبت) — عادة "نهاية الأسبوع" لا تجرّ درجة الاثنين.
 *  • هدف التركيز اليومي: 60 دقيقة تركيز مكتمل = 100%.
 */

export const DAILY_FOCUS_TARGET_MIN = 60
export const DAILY_STREAK_TARGET_DAYS = 30

/** هل العادة مستحقة في تاريخ معين (YYYY-MM-DD)؟ */
export function habitDueOn(habit: { frequency?: string | null } | null | undefined, date: string): boolean {
  const f = habit?.frequency || 'daily'
  // noon anchor = آمن ضد انزياح المنطقة الزمنية في new Date("YYYY-MM-DD")
  const dow = new Date(`${date}T12:00:00`).getDay() // 0=الأحد … 6=السبت
  if (f === 'weekdays') return dow >= 0 && dow <= 4 // الأحد–الخميس (أسبوع العمل في مصر)
  if (f === 'weekends') return dow === 5 || dow === 6 // الجمعة + السبت
  return true // daily + custom (بلا جدول مخزّن → مستحقة يومياً كما كانت)
}

export interface DailyScoreInput {
  tasksCompleted: number
  tasksTotal: number // المجدولة اليوم (+ مكافآت اليوم بلا ميعاد)
  habitsCompleted: number // من العادات المستحقة اليوم
  habitsTotal: number // عدد العادات المستحقة اليوم
  focusMin: number // دقائق تركيز مكتملة اليوم
  morningScore: number // 0-100 من سجل الروتين الصباحي
  streak: number // السلسلة الحية (أيام نشاط متتالية بفترة سماح)
}

export interface DailyScoreBreakdown {
  tasks: number
  habits: number
  focus: number
  morning: number
  streak: number
}

function clampPct(v: number): number {
  return Math.max(0, Math.min(100, v))
}

/**
 * الدرجة اليومية الموحدة — تُستخدم في dashboard API و productivity-score API
 * (وبتالي الكارت الكبير والهيدر والمراجعات الأسبوعية/الشهرية كلها رقم واحد).
 */
export function computeDailyScore(input: DailyScoreInput): { score: number; breakdown: DailyScoreBreakdown } {
  const tasksTotal = Math.max(0, input.tasksTotal || 0)
  const habitsTotal = Math.max(0, input.habitsTotal || 0)
  const tasksCompleted = Math.min(Math.max(0, input.tasksCompleted || 0), Math.max(tasksTotal, 0))
  const habitsCompleted = Math.min(Math.max(0, input.habitsCompleted || 0), Math.max(habitsTotal, 0))
  const focusMin = Math.max(0, input.focusMin || 0)
  const morningRaw = clampPct(input.morningScore || 0)
  const streak = Math.max(0, input.streak || 0)

  const tasksPct = tasksTotal > 0 ? (tasksCompleted / tasksTotal) * 100 : 0
  const habitsPct = habitsTotal > 0 ? (habitsCompleted / habitsTotal) * 100 : 0
  const focusPct = Math.min(100, (focusMin / DAILY_FOCUS_TARGET_MIN) * 100)
  const morningPct = morningRaw
  const streakPct = Math.min(100, (streak / DAILY_STREAK_TARGET_DAYS) * 100)

  // أجزاء النشاط المرجّحة — فقط ما له بيانات فعلية اليوم، ثم إعادة تسوية الأوزان
  const parts: Array<[number, number]> = []
  if (tasksTotal > 0) parts.push([tasksPct, 0.35])
  if (habitsTotal > 0) parts.push([habitsPct, 0.25])
  if (morningRaw > 0) parts.push([morningPct, 0.20])
  if (focusMin > 0) parts.push([focusPct, 0.20])

  const activityScore = parts.length > 0
    ? parts.reduce((s, [v, w]) => s + v * w, 0) / parts.reduce((s, [, w]) => s + w, 0)
    : 0

  const score = Math.round(clampPct(activityScore * 0.9 + streakPct * 0.1))

  return {
    score,
    breakdown: {
      tasks: Math.round(tasksPct),
      habits: Math.round(habitsPct),
      focus: Math.round(focusPct),
      morning: Math.round(morningPct),
      streak: Math.round(streakPct),
    },
  }
}
