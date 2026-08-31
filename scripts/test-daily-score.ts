/* Unit tests for the unified daily score (Task 19-b) — run: bun scripts/test-daily-score.ts */
import { computeDailyScore, habitDueOn, DAILY_FOCUS_TARGET_MIN } from '../src/lib/daily-score'

let pass = 0, fail = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { pass++; console.log(`PASS — ${name}`) }
  else { fail++; console.log(`FAIL — ${name} | ${JSON.stringify(detail)}`) }
}

const base = { tasksCompleted: 0, tasksTotal: 0, habitsCompleted: 0, habitsTotal: 0, focusMin: 0, morningScore: 0, streak: 0 }

// 1) يوم مثالي + سلسلة 30 → 100
let r = computeDailyScore({ ...base, tasksCompleted: 2, tasksTotal: 2, habitsCompleted: 3, habitsTotal: 3, focusMin: 60, morningScore: 100, streak: 30 })
check('perfect day + 30d streak = 100', r.score === 100, r)

// 2) يوم مثالي بلا سلسلة → 90 (أصعب: الاستمرارية لها ثمن 10%)
r = computeDailyScore({ ...base, tasksCompleted: 2, tasksTotal: 2, habitsCompleted: 3, habitsTotal: 3, focusMin: 60, morningScore: 100, streak: 0 })
check('perfect day, streak 0 = 90', r.score === 90, r)

// 3) يوم مثالي + سلسلة 1 → 90 (النشاط 100 × 0.9 + 3.3×0.1)
r = computeDailyScore({ ...base, tasksCompleted: 1, tasksTotal: 1, habitsCompleted: 1, habitsTotal: 1, focusMin: 60, morningScore: 100, streak: 1 })
check('new user perfect day (streak 1) = 90', r.score === 90, r)

// 4) كل شيء صفر → 0
r = computeDailyScore({ ...base })
check('empty day = 0', r.score === 0, r)

// 5) صباح فقط 100 + بلا سلسلة → 90 (إعادة تسوية الأوزان)
r = computeDailyScore({ ...base, morningScore: 100 })
check('morning-only day = 90 (renormalized)', r.score === 90, r)

// 6) مهام 1/2 فقط → 45 (0.9 × 50)
r = computeDailyScore({ ...base, tasksCompleted: 1, tasksTotal: 2 })
check('half tasks only = 45', r.score === 45, r)

// 7) سقف التركيز: 90 دقيقة = 100% (الهدف 60 دقيقة)
r = computeDailyScore({ ...base, focusMin: 90 })
check(`focus capped at ${DAILY_FOCUS_TARGET_MIN}min → focus bar 100`, r.breakdown.focus === 100, r)

// 8) مزيج: مهام 100 + عادات 50 + سلسلة 6 → round(79.17×0.9 + 20×0.1) = 73
r = computeDailyScore({ ...base, tasksCompleted: 2, tasksTotal: 2, habitsCompleted: 1, habitsTotal: 2, streak: 6 })
check('mixed day tasks100/habits50/streak6 = 73', r.score === 73, r)

// 9) clamp: إكمال أكثر من المطلوب يُقص عند 100 (كان 5/2 = 250٪ قبل الحماية)
r = computeDailyScore({ ...base, tasksCompleted: 5, tasksTotal: 2 })
check('tasks clamped to total (5/2 → 100%)', r.breakdown.tasks === 100 && r.score === 90, r)

// 10) صباح 150 → يُقص عند 100
r = computeDailyScore({ ...base, morningScore: 150 })
check('morning clamped to 100', r.breakdown.morning === 100, r)

// ── habitDueOn ──
// 2024-01-05 = Friday, 2024-01-06 = Saturday, 2024-01-08 = Monday (تواريخ معلومة)
check('weekends due on Friday', habitDueOn({ frequency: 'weekends' }, '2024-01-05') === true)
check('weekends NOT due on Monday', habitDueOn({ frequency: 'weekends' }, '2024-01-08') === false)
check('weekdays due on Monday', habitDueOn({ frequency: 'weekdays' }, '2024-01-08') === true)
check('weekdays NOT due on Friday', habitDueOn({ frequency: 'weekdays' }, '2024-01-05') === false)
check('weekdays due on Sunday (Egypt work week)', habitDueOn({ frequency: 'weekdays' }, '2024-01-07') === true)
check('daily due every day', habitDueOn({ frequency: 'daily' }, '2024-01-05') && habitDueOn({ frequency: 'daily' }, '2024-01-06'))
check('custom treated as due (no schedule stored)', habitDueOn({ frequency: 'custom' }, '2024-01-05'))
check('missing frequency defaults to due', habitDueOn(null, '2024-01-05'))

console.log(`\n=== ${pass}/${pass + fail} logic checks passed ===`)
process.exit(fail > 0 ? 1 : 0)
