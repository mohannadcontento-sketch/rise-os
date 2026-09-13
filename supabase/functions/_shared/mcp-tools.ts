// ============================================================
// mcp-tools.ts — سجل أدوات MCP لخادم Supabase Edge (v3.1 — 82 أداة)
//
// النسخة الأصيلة (Deno) الثمانية محفوظة حرفيًا كما هي، وأضيفت
// عليها أدوات تغطي الموقع كاملًا — كلها على مخطط قاعدة البيانات
// الإنتاجي الفعلي (tasks/journals/goals/habits/habit_logs/
// notifications/community_*/user_subscriptions/usage_daily/
// profiles/user_api_keys + v3.0: books/knowledge_items/
// finance_records/health_logs/morning_logs/focus_sessions/
// work_sessions/planner_items/user_achievements/user_settings
// + v3.1: daily_scores/xp_awards):
//   • كل استعلام يفرض ملكية user_id صراحة (العميل يعمل بمفتاح
//     service_role الذي يتجاوز RLS — الملكية مسؤولية ندائنا)
//   • الكتابة الذرية عبر نفس دوال التطبيق: create/update_
//     task_with_subtasks و create_goal_with_milestones
//   • التعلم (learning-*) والدماغ الثاني يتشاركان جدول
//     knowledge_items — نفس عزل الأنواع الذي يفرضه مسار الموقع
//     (BRAIN_TYPES للدماغ، بادئة learning- لوحدة التعلم)
//   • السجلات اليومية (صحة/صباح) upsert على (user_id, date)
//     — نفس قيد التفرد المفروض في هجرة 005
//   • v3.1: المراجعتان الأسبوعية/الشهرية محسوبتان من نفس مصادر
//     وحدتي المراجعة بالموقع (إجاباتهما في localStorage لا تُقرأ
//     من الخادم) + سجل نقاط الخبرة (xp_awards)
//   • الحذف متاح صراحةً لمالك المفتاح لكنه يتطلب confirm:true
//   • Validation يدوي strict (بلا zod — بيئة Deno بلا تبعيات):
//     أي حقل غير معروف يُرفض، نفس صيغة خطأ المسار «path: رسالة»
//
// فرق مقصود واحد عن مسار Vercel: «اليوم» هنا بتقويم القاهرة
// (Africa/Cairo) وليس بتقويم خادم UTC — منطق rise-utils يعتبر
// getTodayCairo المرجع الصحيح لمستخدمي أوج في مصر.
// ============================================================

import { Postgrest, inList } from './postgrest.ts'

// ── القسم: الأنواع ─────────────────────

export interface McpTool {
  /** اسم الأداة (أسماء بروتوكول MCP — حروف/شرطات سفلية فقط) */
  name: string
  /** العرض العربي (لواجهة الإعدادات) */
  title: string
  /** read = قراءة فقط، write = يغيّر حالة — يحدد التدقيق والحدود */
  kind: 'read' | 'write'
  /** وصف عربي للعميل الخارجي — يظهر له في tools/list */
  description: string
  /** JSON Schema للمدخلات (بروتوكول MCP — تُعلن كما هي) */
  inputSchema: Record<string, unknown>
  /** تحقق يدوي strict — يعيد الوسائط النظيفة أو رسالة خطأ */
  validate: (args: unknown) => { ok: true; value: any } | { ok: false; error: string }
  /** التنفيذ — userId من المفتاح، args بعد التحقق */
  execute: (db: Postgrest, userId: string, args: any) => Promise<unknown>
}

// ── القسم: أدوات التحقق اليدوية (تكافؤ zod strict) ─────────────────────

type V = { ok: true; value: any } | { ok: false; error: string }
const ok = (value: any): V => ({ ok: true, value })
const bad = (error: string): V => ({ ok: false, error })
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/

/** «اليوم» بتقويم القاهرة — منطق rise-utils getTodayCairo */
export function todayCairo(): string {
  // en-CA يعيد YYYY-MM-DD مباشرة — صيغة ISO القياسية للتقويم
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** توليد آخر N أيام (بما فيها اليوم) كسلاسل تاريخ */
function lastNDates(today: string, n: number): string[] {
  const out: string[] = []
  // ظهيرة UTC: حساب آمن بلا انزياح حدود اليوم
  const base = new Date(`${today}T12:00:00Z`)
  for (let i = 0; i < n; i++) {
    const d = new Date(base.getTime() - i * 86400000)
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

/** حساب streak: أطول سلسلة أيام مكتملة تنتهي اليوم (أو أمس) */
function habitStreak(logs: { date: string; completed: boolean }[], today: string): number {
  const done = new Set(logs.filter((l) => l.completed).map((l) => l.date))
  // السلسلة تبدأ من اليوم؛ لو اليوم لم يُسجَّل بعد نبدأ من أمس
  let cursor = done.has(today) ? today : lastNDates(today, 2)[1]
  if (!done.has(cursor)) return 0
  let streak = 0
  while (done.has(cursor)) {
    streak += 1
    cursor = lastNDates(cursor, 2)[1]
  }
  return streak
}

/** أنواع «الدماغ الثاني» (مطابقة BRAIN_TYPES في مسار knowledge) —
 * knowledge_items جدول مشترك: وحدة التعلم تخزن learning-* والمالية
 * تخزن config خاصًا بها؛ هذه القائمة تعزل صفوف الدماغ وحدها */
const BRAIN_TYPES = [
  'note', 'project', 'knowledge', 'idea', 'resource',
  'bookmark', 'inspiration', 'research', 'design_ref',
]

/** قراءة عمود tags ككائن JSON بأمان (وحدة التعلم تخزن حالتها فيه) */
function safeTags(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'string' || !raw.trim()) return {}
  try {
    const v: unknown = JSON.parse(raw)
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** تقريب رقم إلى خانة عشرية واحدة (نسب التقدم والمجاميع) */
function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** يوم القاهرة لطابع ISO زمني — نفس bucketing مسار الموقع (isoToCairoDate) */
function cairoDayOf(iso: unknown): string | null {
  if (iso === null || iso === undefined || iso === '') return null
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(String(iso)))
  } catch {
    return null
  }
}

/** نافذة تواريخ تصاعدية (من الأقدم للأحدث) تنتهي عند end وتغطي days يومًا */
function windowDates(end: string, days: number): string[] {
  const base = new Date(`${end}T12:00:00Z`)
  const out: string[] = []
  for (let i = days - 1; i >= 0; i--) {
    out.push(new Date(base.getTime() - i * 86400000).toISOString().slice(0, 10))
  }
  return out
}

/** تاريخ صالح تقويميًا: الصيغة YYYY-MM-DD ويومًا موجودًا فعلًا
 * (يمنع «2026-13-45» الذي يعبر DATE_RE ثم يفجّر Date بخطأ Invalid time) */
function isValidDay(s: string): boolean {
  if (!DATE_RE.test(s)) return false
  const d = new Date(`${s}T12:00:00Z`)
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/** شكل اليوم في نتيجة المراجعة */
interface ReviewDay {
  date: string
  tasksDone: number
  focusMin: number
  habitCheckIns: number
  journaled: boolean
  morningLogged: boolean
  score: number | null
}

/** إحصاءات نافذة مراجعة من نفس مصادر وحدتي المراجعة بالموقع
 * (المهام المكتملة + جلسات التركيز + تسجيلات العادات + اليوميات
 * + روتين الصباح + daily_scores) — التجميع بتقويم القاهرة، والعزل
 * على user_id في كل استعلام ثم إعادة فلترة بالنطاق في الكود
 * (العميل الخارجي لا يثق بفلاتر in.() عبر mock/PostgREST معًا). */
async function collectReviewStats(db: Postgrest, userId: string, dates: string[]) {
  const inRange = new Set(dates)
  const idx = new Map(dates.map((d, i) => [d, i]))
  const byDay: ReviewDay[] = dates.map((d) => ({
    date: d, tasksDone: 0, focusMin: 0, habitCheckIns: 0,
    journaled: false, morningLogged: false, score: null,
  }))

  const from = dates[0]
  // الطوابع الزمنية UTC: نوسّع البداية يومًا للخلف لأن 00:30 صباحًا بتقويم
  // القاهرة تقع في نهاية يوم UTC السابق — ثم نعيد التجميع بالتقويم المحلي
  const fromMinus1 = new Date(new Date(`${from}T00:00:00Z`).getTime() - 86400000).toISOString()

  const [tasksRaw, focusRaw, habitRows, journalsRaw, morningRaw, scoresRaw] = await Promise.all([
    db.select('tasks', {
      select: 'status,completed_at',
      filters: { user_id: `eq.${userId}`, status: 'eq.done', completed_at: `gte.${fromMinus1}` },
      limit: 1000,
    }),
    db.select('focus_sessions', {
      select: 'actual_min,started_at,completed',
      filters: { user_id: `eq.${userId}`, completed: 'eq.true', started_at: `gte.${fromMinus1}` },
      limit: 1000,
    }),
    db.select('habits', { select: 'id', filters: { user_id: `eq.${userId}` }, limit: 200 }),
    db.select('journals', {
      select: 'date',
      filters: { user_id: `eq.${userId}`, date: `gte.${from}` },
      limit: 2000,
    }),
    db.select('morning_logs', {
      select: 'date',
      filters: { user_id: `eq.${userId}`, date: `gte.${from}` },
      limit: 1000,
    }),
    db.select('daily_scores', {
      select: 'date,score',
      filters: { user_id: `eq.${userId}`, date: `gte.${from}` },
      limit: 2000,
    }),
  ])

  const habitIdSet = new Set(((habitRows ?? []) as any[]).map((h) => String(h.id)))
  // habit_logs بلا user_id (تُعزل عبر habit_id) — الفلترة بالطقم في الكود
  const logsRaw = habitIdSet.size
    ? await db.select('habit_logs', {
        select: 'habit_id,date,completed',
        filters: { date: `gte.${from}`, habit_id: inList([...habitIdSet]) },
        limit: 5000,
      })
    : []

  for (const t of (tasksRaw ?? []) as any[]) {
    const d = cairoDayOf(t.completed_at)
    if (d && inRange.has(d)) byDay[idx.get(d) as number].tasksDone += 1
  }
  for (const s of (focusRaw ?? []) as any[]) {
    const d = cairoDayOf(s.started_at)
    if (d && inRange.has(d)) byDay[idx.get(d) as number].focusMin += Number(s.actual_min ?? 0)
  }
  for (const l of (logsRaw ?? []) as any[]) {
    const d = String(l.date ?? '').slice(0, 10)
    if (d && inRange.has(d) && habitIdSet.has(String(l.habit_id)) && l.completed === true) {
      byDay[idx.get(d) as number].habitCheckIns += 1
    }
  }
  for (const j of (journalsRaw ?? []) as any[]) {
    const d = String(j.date ?? '').slice(0, 10)
    if (d && inRange.has(d)) byDay[idx.get(d) as number].journaled = true
  }
  for (const m of (morningRaw ?? []) as any[]) {
    const d = String(m.date ?? '').slice(0, 10)
    if (d && inRange.has(d)) byDay[idx.get(d) as number].morningLogged = true
  }
  for (const s of (scoresRaw ?? []) as any[]) {
    const d = String(s.date ?? '').slice(0, 10)
    if (d && inRange.has(d)) byDay[idx.get(d) as number].score = round1(Number(s.score ?? 0))
  }

  const completedTasks = byDay.reduce((n, x) => n + x.tasksDone, 0)
  const focusMin = byDay.reduce((n, x) => n + x.focusMin, 0)
  const habitCheckIns = byDay.reduce((n, x) => n + x.habitCheckIns, 0)
  const journalEntries = byDay.filter((x) => x.journaled).length
  const morningLogsCount = byDay.filter((x) => x.morningLogged).length
  const scored = byDay.filter((x) => x.score !== null)
  const averageScore = scored.length
    ? round1(scored.reduce((a, b) => a + (b.score ?? 0), 0) / scored.length)
    : null
  const activeDays = byDay.filter(
    (x) => x.tasksDone > 0 || x.focusMin > 0 || x.habitCheckIns > 0 || x.journaled || x.morningLogged,
  ).length

  return {
    completedTasks, focusMin, habitCheckIns, journalEntries, morningLogsCount,
    averageScore, activeDays, byDay,
  }
}

/** أسماء مصادر نقاط الخبرة بالعربية (نفس بادئات مسار earn-xp) */
const XP_REASON_AR: Record<string, string> = {
  task: 'مهمة', habit: 'عادة', work: 'شغل', morning: 'روتين الصباح',
  deepwork: 'شغل عميق', focus: 'تركيز', journal: 'يومية',
  reading: 'قراءة', goal: 'هدف', 'morning-routine-complete': 'روتين الصباح كامل',
}

function xpReasonLabel(reason: string): string {
  if (reason === 'morning-routine-complete') return XP_REASON_AR[reason]
  return XP_REASON_AR[reason.split(':')[0]] ?? reason
}

/** فحص كائن الوسائط strict: يرفض أي مفتاح غير معروف */
function rejectUnknown(args: unknown, known: string[]): V | null {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    return bad('الوسائط يجب أن تكون كائن JSON')
  }
  const obj = args as Record<string, unknown>
  for (const key of Object.keys(obj)) {
    if (!known.includes(key)) {
      return bad(`${key}: حقل غير معروف — الحقول المسموحة: ${known.join(', ')}`)
    }
  }
  return null
}

// ── القسم: السجل (8 أدوات) ─────────────────────

export const MCP_TOOLS: McpTool[] = [
  // 1) ── list_tasks ─────────────────────────────
  {
    name: 'list_tasks',
    title: 'عرض المهام',
    kind: 'read',
    description:
      'يعرض مهام المستخدم (مع العناوين الفرعية والمشروع والموعد). استدعِها أولًا للحصول على معرّفات المهام قبل complete_task، ولمعرفة ما هو مؤجل أو قيد التنفيذ.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['todo', 'in_progress', 'done'],
          description: 'تصفية اختيارية بحالة المهمة',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'أقصى عدد مهام يُعاد (افتراضي 50)',
        },
      },
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['status', 'limit'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (a.status !== undefined && !['todo', 'in_progress', 'done'].includes(String(a.status))) {
        return bad('status: قيمة غير صالحة — المتاح: todo, in_progress, done')
      }
      if (a.limit !== undefined) {
        if (!Number.isInteger(a.limit) || (a.limit as number) < 1 || (a.limit as number) > 100) {
          return bad('limit: عدد صحيح بين 1 و100')
        }
      }
      return ok({ status: a.status as string | undefined, limit: a.limit as number | undefined })
    },
    async execute(db, userId, args) {
      // الملكية مصرّحة في كل استعلام (service_role يتجاوز RLS)
      const taskList = ((await db.select('tasks', {
        filters: { user_id: `eq.${userId}` },
        order: ['order.asc'],
      })) ?? []) as any[]

      // جلبان متوازيان: المشاريع + الفرعيات (نمط المستودع نفسه)
      const taskIds = taskIdsOf(taskList)
      const [projectsList, subtasksList] = await Promise.all([
        db.select('projects', {
          select: 'id,name',
          filters: { user_id: `eq.${userId}` },
        }) as Promise<any[]>,
        taskIds.length
          ? (db.select('subtasks', {
              filters: { task_id: inList(taskIds) },
              order: ['order.asc'],
            }) as Promise<any[]>)
          : Promise.resolve([] as any[]),
      ])

      const projectMap = new Map<string, string>()
      for (const p of (projectsList ?? []) as any[]) projectMap.set(String(p.id), p.name)

      const subMap = new Map<string, any[]>()
      for (const st of (subtasksList ?? []) as any[]) {
        const tid = String(st.task_id)
        if (!subMap.has(tid)) subMap.set(tid, [])
        subMap.get(tid)!.push(st)
      }

      const filtered = args.status ? taskList.filter((t) => t.status === args.status) : taskList
      const sliced = filtered.slice(0, args.limit ?? 50)
      return {
        summary: `عُرضت ${sliced.length} مهمة من أصل ${taskList.length}${args.status ? ` (حالة: ${args.status})` : ''}`,
        tasks: sliced.map((t) => {
          const sts = subMap.get(String(t.id)) ?? []
          return {
            id: t.id,
            title: t.title,
            status: t.status,
            priority: t.priority ?? null,
            dueDate: t.due_date ?? null,
            project: t.project_id ? projectMap.get(String(t.project_id)) ?? null : null,
            subtasksTotal: sts.length,
            subtasksDone: sts.filter((s) => s.completed).length,
          }
        }),
      }
    },
  },

  // 2) ── create_task ─────────────────────────────
  {
    name: 'create_task',
    title: 'إنشاء مهمة',
    kind: 'write',
    description:
      'تنشئ مهمة جديدة في قائمة مهام المستخدم (مع عناوين فرعية اختيارية). مثال: «سجّل عليّ مهمة الاتصال بمهندس الشبكة غدًا بأولوية عالية».',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 200, description: 'عنوان المهمة (مطلوب)' },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'urgent'],
          description: 'الأولوية (افتراضي medium)',
        },
        dueDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'موعد التسليم YYYY-MM-DD' },
        dueTime: { type: 'string', description: 'وقت التسليم HH:MM' },
        description: { type: 'string', maxLength: 2000, description: 'تفاصيل اختيارية' },
        estimatedMin: { type: 'integer', minimum: 0, maximum: 600, description: 'المدة التقديرية بالدقائق' },
        subtasks: {
          type: 'array',
          maxItems: 10,
          items: { type: 'object', properties: { title: { type: 'string', minLength: 1, maxLength: 100 } }, required: ['title'], additionalProperties: false },
          description: 'عناوين فرعية (حد أقصى 10)',
        },
      },
      required: ['title'],
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['title', 'priority', 'dueDate', 'dueTime', 'description', 'estimatedMin', 'subtasks'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (typeof a.title !== 'string' || a.title.length < 1 || a.title.length > 200) {
        return bad('title: العنوان مطلوب (1–200 محرفًا)')
      }
      if (a.priority !== undefined && !['low', 'medium', 'high', 'urgent'].includes(String(a.priority))) {
        return bad('priority: قيمة غير صالحة — المتاح: low, medium, high, urgent')
      }
      if (a.dueDate !== undefined && !DATE_RE.test(String(a.dueDate))) {
        return bad('dueDate: التاريخ يجب أن يكون بصيغة YYYY-MM-DD')
      }
      if (a.dueTime !== undefined && !TIME_RE.test(String(a.dueTime))) {
        return bad('dueTime: الوقت يجب أن يكون HH:MM')
      }
      if (a.description !== undefined && (typeof a.description !== 'string' || a.description.length > 2000)) {
        return bad('description: نص اختياري حتى 2000 محرف')
      }
      if (a.estimatedMin !== undefined) {
        if (!Number.isInteger(a.estimatedMin) || (a.estimatedMin as number) < 0 || (a.estimatedMin as number) > 600) {
          return bad('estimatedMin: عدد صحيح بين 0 و600')
        }
      }
      if (a.subtasks !== undefined) {
        if (!Array.isArray(a.subtasks) || (a.subtasks as unknown[]).length > 10) {
          return bad('subtasks: مصفوفة حتى 10 عناصر')
        }
        for (const s of a.subtasks as unknown[]) {
          if (typeof s !== 'object' || s === null || Array.isArray(s)) return bad('subtasks: كل عنصر كائن')
          const keys = Object.keys(s)
          if (keys.some((k) => k !== 'title')) return bad('subtasks.?: حقل غير معروف — المتاح: title')
          const t = (s as Record<string, unknown>).title
          if (typeof t !== 'string' || t.length < 1 || t.length > 100) {
            return bad('subtasks.title: نص مطلوب (1–100 محرفًا)')
          }
        }
      }
      return ok({
        title: a.title,
        priority: a.priority as string | undefined,
        dueDate: a.dueDate as string | undefined,
        dueTime: a.dueTime as string | undefined,
        description: a.description as string | undefined,
        estimatedMin: a.estimatedMin as number | undefined,
        subtasks: (a.subtasks ?? []) as { title: string }[],
      })
    },
    async execute(db, userId, args) {
      // نفس دالة التطبيق الذرية: المهمة وفرعياتها معًا أو لا شيء
      const result = (await db.rpc('create_task_with_subtasks', {
        p_user_id: userId,
        p_task: {
          title: args.title,
          priority: args.priority ?? 'medium',
          due_date: args.dueDate ?? null,
          due_time: args.dueTime ?? null,
          description: args.description ?? null,
          estimated_min: args.estimatedMin ?? null,
        },
        p_subtasks: (args.subtasks ?? []).map((s: { title: string }, i: number) => ({
          title: s.title,
          order: i,
        })),
      })) as { task?: any; subtasks?: any[] } | null

      const task = result?.task
      return {
        summary: `أُنشئت المهمة «${task?.title ?? args.title}»${(args.subtasks ?? []).length ? ` مع ${args.subtasks.length} عنوان فرعي` : ''}`,
        created: true,
        task: {
          id: task?.id ?? null,
          title: task?.title ?? args.title,
          priority: args.priority ?? 'medium',
          dueDate: args.dueDate ?? null,
        },
      }
    },
  },

  // 3) ── complete_task ─────────────────────────────
  {
    name: 'complete_task',
    title: 'إكمال مهمة',
    kind: 'write',
    description:
      'تضع علامة «منجزة» على مهمة بالمعرّف (خُذ المعرّف من list_tasks). العناوين الفرعية تظل كما هي — هذه العملية لا تحذف شيئًا ويمكن التراجع عنها من التطبيق.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', minLength: 1, description: 'معرّف المهمة (من list_tasks)' },
      },
      required: ['taskId'],
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['taskId'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (typeof a.taskId !== 'string' || a.taskId.length < 1) return bad('taskId: taskId مطلوب')
      return ok({ taskId: a.taskId })
    },
    async execute(db, userId, args) {
      // الدالة ترفض المهمة الغريبة بذاتها (task not found or owned)
      // وتختم completed_at تلقائيًا عند status=done — نوحّد رسالة
      // الرفض عربيًا كمسار التطبيق
      let result: { task?: any } | null
      try {
        result = (await db.rpc('update_task_with_subtasks', {
          p_user_id: userId,
          p_task_id: args.taskId,
          p_task: { status: 'done' },
          p_subtasks: null,
        })) as { task?: any } | null
      } catch {
        throw new Error('المهمة غير موجودة أو لا تملكها')
      }

      const task = result?.task
      if (!task?.id) throw new Error('المهمة غير موجودة أو لا تملكها')
      return {
        summary: `أُنجزت المهمة «${task.title}»`,
        completed: true,
        taskId: task.id,
        title: task.title,
        completedAt: task.completed_at ?? new Date().toISOString(),
      }
    },
  },

  // 4) ── list_habits ─────────────────────────────
  {
    name: 'list_habits',
    title: 'عرض العادات',
    kind: 'read',
    description:
      'يعرض عادات المستخدم مع سلسلة الأيام المتصلة (streak) وحالة اليوم — ليعرف العميل الخارجي ما يحتاج تشجيعًا أو تسجيلًا.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    validate(args) {
      const r = rejectUnknown(args, [])
      if (r) return r
      return ok({})
    },
    async execute(db, userId) {
      const today = todayCairo()
      const habitList = ((await db.select('habits', {
        filters: { user_id: `eq.${userId}` },
      })) ?? []) as any[]

      const habitIds = habitList.map((h) => String(h.id))
      let logRows: any[] = []
      if (habitIds.length > 0) {
        const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
        logRows = ((await db.select('habit_logs', {
          filters: { habit_id: inList(habitIds), date: `gte.${thirtyAgo}` },
        })) ?? []) as any[]
      }

      const logMap = new Map<string, any[]>()
      for (const log of logRows) {
        const hid = String(log.habit_id)
        if (!logMap.has(hid)) logMap.set(hid, [])
        logMap.get(hid)!.push(log)
      }

      return {
        summary: `${habitList.length} عادة${habitList.length ? '' : ' — لا عادات بعد'}`,
        habits: habitList.map((h) => {
          const logs = (logMap.get(String(h.id)) ?? []).map((l) => ({
            date: String(l.date),
            completed: l.completed === true,
          }))
          return {
            id: h.id,
            name: h.name,
            frequency: h.frequency ?? null,
            targetCount: h.target_count ?? 1,
            todayCompleted: logs.some((l) => l.date === today && l.completed),
            streak: habitStreak(logs, today),
          }
        }),
      }
    },
  },

  // 5) ── check_in_habit ─────────────────────────────
  {
    name: 'check_in_habit',
    title: 'تسجيل عادة',
    kind: 'write',
    description:
      'تسجيل ممارسة عادة لليوم (أو تاريخ محدد) — مثل «سجّللي عادة القراءة النهاردة». خُذ habitId من list_habits.',
    inputSchema: {
      type: 'object',
      properties: {
        habitId: { type: 'string', minLength: 1, description: 'معرّف العادة (من list_habits)' },
        date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'التاريخ (افتراضي اليوم)' },
        completed: { type: 'boolean', description: 'true للتسجيل / false للإلغاء (افتراضي true)' },
      },
      required: ['habitId'],
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['habitId', 'date', 'completed'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (typeof a.habitId !== 'string' || a.habitId.length < 1) return bad('habitId: habitId مطلوب')
      if (a.date !== undefined && !DATE_RE.test(String(a.date))) {
        return bad('date: التاريخ يجب أن يكون بصيغة YYYY-MM-DD')
      }
      if (a.completed !== undefined && typeof a.completed !== 'boolean') {
        return bad('completed: قيمة منطقية (true/false)')
      }
      return ok({
        habitId: a.habitId,
        date: a.date as string | undefined,
        completed: a.completed as boolean | undefined,
      })
    },
    async execute(db, userId, args) {
      const date = args.date ?? todayCairo()
      const completed = args.completed ?? true

      // تحقق الملكية قبل الكتابة (نفس تكافؤ toggleLog في التطبيق)
      const owned = await db.maybeSingle('habits', {
        select: 'id',
        filters: { id: `eq.${args.habitId}`, user_id: `eq.${userId}` },
      })
      if (!owned) throw new Error('Habit not found or not owned by user')

      // upsert ذري على (habit_id, date)
      const log = (await db.upsert(
        'habit_logs',
        { habit_id: args.habitId, date, completed, count: 1 },
        'habit_id,date',
      )) as any
      return {
        summary: `${completed ? 'سُجّلت' : 'أُلغي تسجيل'} العادة بتاريخ ${date}`,
        habitId: args.habitId,
        date,
        completed,
        log: log ? { date: log.date ?? date, completed: log.completed ?? completed } : null,
      }
    },
  },

  // 6) ── get_today_plan ─────────────────────────────
  {
    name: 'get_today_plan',
    title: 'مخطط اليوم',
    kind: 'read',
    description:
      'يعرض بنود مخطط اليوم (صباح/ظهر/مساء) مع حالة كل بند — أساس أي مساعدة تخطيط أو إعادة ترتيب من العميل الخارجي.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'التاريخ (افتراضي اليوم)' },
      },
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['date'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (a.date !== undefined && !DATE_RE.test(String(a.date))) {
        return bad('date: التاريخ يجب أن يكون بصيغة YYYY-MM-DD')
      }
      return ok({ date: a.date as string | undefined })
    },
    async execute(db, userId, args) {
      const date = args.date ?? todayCairo()
      const items = ((await db.select('planner_items', {
        filters: { user_id: `eq.${userId}`, date: `eq.${date}` },
        order: ['section.asc', 'order.asc'],
      })) ?? []) as any[]

      const sections: Record<string, any[]> = {}
      for (const it of items) {
        const sec = it.section ?? 'other'
        if (!sections[sec]) sections[sec] = []
        sections[sec].push({
          id: it.id,
          title: it.title,
          time: it.time ?? null,
          completed: it.completed === true,
        })
      }
      const total = items.length
      const done = items.filter((i) => i.completed).length
      return {
        summary: `مخطط ${date}: ${done}/${total} بندًا منجزًا`,
        date,
        sections,
        totalPlanned: total,
        totalDone: done,
      }
    },
  },

  // 7) ── get_productivity_score ─────────────────────────────
  {
    name: 'get_productivity_score',
    title: 'درجة الإنتاجية',
    kind: 'read',
    description:
      'درجة الإنتاجية اليومية (0–100) لآخر N أيام مع المتوسط — يعرف بها العميل اتجاه المستخدم ويبني عليه.',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'integer', minimum: 1, maximum: 14, description: 'عدد الأيام (افتراضي 7)' },
      },
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['days'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (a.days !== undefined && (!Number.isInteger(a.days) || (a.days as number) < 1 || (a.days as number) > 14)) {
        return bad('days: عدد صحيح بين 1 و14')
      }
      return ok({ days: a.days as number | undefined })
    },
    async execute(db, userId, args) {
      const n = args.days ?? 7
      const dates = lastNDates(todayCairo(), n)
      const rows = ((await db.select('daily_scores', {
        filters: { user_id: `eq.${userId}`, date: inList(dates) },
        order: ['date.asc'],
      })) ?? []) as any[]
      const byDate = new Map(rows.map((r) => [String(r.date), r]))
      const days = dates.map((d) => {
        const row = byDate.get(d)
        return { date: d, score: row ? Math.round((row.score ?? 0) * 10) / 10 : null }
      })
      const scored = days.filter((d) => d.score !== null)
      const avg = scored.length
        ? Math.round((scored.reduce((a, b) => a + (b.score ?? 0), 0) / scored.length) * 10) / 10
        : null
      return {
        summary: avg !== null ? `متوسط آخر ${n} أيام: ${avg}` : `لا درجات مسجلة في آخر ${n} أيام`,
        days,
        average: avg,
      }
    },
  },

  // 8) ── create_journal_entry ─────────────────────────────
  {
    name: 'create_journal_entry',
    title: 'كتابة اليوميات',
    kind: 'write',
    description:
      'تكتب مدخل اليوميات لليوم (المحتوى/الانتصارات/التحديات/الأفكار/خطة الغد/الامتنان/المزاج والطاقة). لو يوجد مدخل لنفس اليوم بالفعل تُرفض الكتابة فوقه إلا مع overwrite: true (حماية من الاستبدال الصامت).',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'التاريخ (افتراضي اليوم)' },
        content: { type: 'string', maxLength: 20000, description: 'نص اليوميات' },
        wins: { type: 'string', maxLength: 5000, description: 'انتصارات اليوم' },
        challenges: { type: 'string', maxLength: 5000, description: 'التحديات' },
        ideas: { type: 'string', maxLength: 5000, description: 'أفكار' },
        tomorrowPlan: { type: 'string', maxLength: 5000, description: 'خطة الغد' },
        gratitude: { type: 'string', maxLength: 5000, description: 'الامتنان' },
        mood: { type: 'integer', minimum: 1, maximum: 5, description: 'المزاج 1–5' },
        energy: { type: 'integer', minimum: 1, maximum: 5, description: 'الطاقة 1–5' },
        overwrite: { type: 'boolean', description: 'السماح باستبدال مدخل موجود لنفس اليوم (افتراضي false)' },
      },
      additionalProperties: false,
    },
    validate(args) {
      const known = ['date', 'content', 'wins', 'challenges', 'ideas', 'tomorrowPlan', 'gratitude', 'mood', 'energy', 'overwrite']
      const r = rejectUnknown(args, known)
      if (r) return r
      const a = args as Record<string, unknown>
      if (a.date !== undefined && !DATE_RE.test(String(a.date))) {
        return bad('date: التاريخ يجب أن يكون بصيغة YYYY-MM-DD')
      }
      for (const [field, max] of [
        ['content', 20000],
        ['wins', 5000],
        ['challenges', 5000],
        ['ideas', 5000],
        ['tomorrowPlan', 5000],
        ['gratitude', 5000],
      ] as [string, number][]) {
        if (a[field] !== undefined && (typeof a[field] !== 'string' || (a[field] as string).length > max)) {
          return bad(`${field}: نص اختياري حتى ${max} محرف`)
        }
      }
      for (const field of ['mood', 'energy']) {
        if (a[field] !== undefined && (!Number.isInteger(a[field]) || (a[field] as number) < 1 || (a[field] as number) > 5)) {
          return bad(`${field}: عدد صحيح بين 1 و5`)
        }
      }
      if (a.overwrite !== undefined && typeof a.overwrite !== 'boolean') {
        return bad('overwrite: قيمة منطقية (true/false)')
      }
      const { overwrite, ...fields } = a
      const hasContent = Object.entries(fields).some(
        ([, v]) => v !== undefined && v !== '' && v !== null,
      )
      if (!hasContent) {
        return bad('مطلوب حقل واحد على الأقل من محتوى اليومية (content/wins/…)')
      }
      return ok(a)
    },
    async execute(db, userId, args) {
      const date = args.date ?? todayCairo()
      const { overwrite, date: _d, ...fields } = args as Record<string, unknown>
      // snake_case لحقول الجدول (tomorrowPlan → tomorrow_plan)
      const snake: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(fields)) {
        if (k === 'tomorrowPlan') snake.tomorrow_plan = v
        else snake[k] = v
      }

      // حماية الاستبدال: لا نكتب فوق مدخل قائم إلا بتصريح صريح
      const existing = await db.maybeSingle('journals', {
        filters: { user_id: `eq.${userId}`, date: `eq.${date}` },
      })
      if (existing && !overwrite) {
        throw new Error(
          `يوجد مدخل يوميات بتاريخ ${date} بالفعل — لن أستبدله. مرّر overwrite: true لو تريد ذلك صراحةً.`,
        )
      }

      const saved = (await db.upsert(
        'journals',
        { user_id: userId, date, ...snake },
        'user_id,date',
      )) as any
      return {
        summary: `${existing ? 'حُدّث' : 'حُفظ'} مدخل يوميات ${date} (${Object.keys(fields).join(', ')})`,
        saved: true,
        date,
        fields: Object.keys(fields),
        id: saved?.id ?? null,
      }
    },
  },

  // ═══════════ v2.0 — توسعة المهام ═══════════

  // 9) ── get_task ─────────────────────────────
  {
    name: 'get_task',
    title: 'تفاصيل مهمة',
    kind: 'read',
    description:
      'تفاصيل مهمة واحدة بالمعرّف (العنوان، الوصف، الحالة، الأولوية، الموعد، المشروع، العناوين الفرعية). خُذ المعرّف من list_tasks.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', minLength: 1, description: 'معرّف المهمة (من list_tasks)' },
      },
      required: ['taskId'],
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['taskId'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (typeof a.taskId !== 'string' || a.taskId.length < 1) return bad('taskId: المعرّف مطلوب')
      return ok({ taskId: a.taskId })
    },
    async execute(db, userId, args) {
      const task = (await db.maybeSingle('tasks', {
        filters: { id: `eq.${args.taskId}`, user_id: `eq.${userId}` },
      })) as any
      if (!task) throw new Error('المهمة غير موجودة أو لا تملكها')
      const [subtasks, project] = await Promise.all([
        (db.select('subtasks', {
          filters: { task_id: `eq.${args.taskId}` },
          order: ['order.asc'],
        }) as Promise<any[]>),
        task.project_id
          ? (db.maybeSingle('projects', { select: 'name', filters: { id: `eq.${task.project_id}` } }) as Promise<any>)
          : Promise.resolve(null),
      ])
      return {
        summary: `مهمة «${task.title}» — ${task.status}`,
        task: {
          id: task.id,
          title: task.title,
          description: task.description ?? null,
          status: task.status,
          priority: task.priority ?? null,
          dueDate: task.due_date ?? null,
          dueTime: task.due_time ?? null,
          estimatedMin: task.estimated_min ?? null,
          project: (project as any)?.name ?? null,
          completedAt: task.completed_at ?? null,
          subtasks: ((subtasks ?? []) as any[]).map((s) => ({
            id: s.id,
            title: s.title,
            completed: s.completed === true,
          })),
        },
      }
    },
  },

  // 10) ── update_task ─────────────────────────────
  {
    name: 'update_task',
    title: 'تعديل مهمة',
    kind: 'write',
    description:
      'تعديل مهمة قائمة (العنوان/الوصف/الأولوية/الموعد/المدة/الحالة). مثال: «أجّل مهمة الاتصال بمهندس الشبكة لبكرة». لا يمس العناوين الفرعية.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', minLength: 1, description: 'معرّف المهمة' },
        title: { type: 'string', minLength: 1, maxLength: 200, description: 'عنوان جديد' },
        description: { type: 'string', maxLength: 2000, description: 'وصف جديد' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: 'أولوية' },
        dueDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'موعد التسليم YYYY-MM-DD' },
        dueTime: { type: 'string', description: 'وقت التسليم HH:MM' },
        estimatedMin: { type: 'integer', minimum: 0, maximum: 600, description: 'المدة التقديرية بالدقائق' },
      },
      required: ['taskId'],
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['taskId', 'title', 'description', 'priority', 'dueDate', 'dueTime', 'estimatedMin'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (typeof a.taskId !== 'string' || a.taskId.length < 1) return bad('taskId: المعرّف مطلوب')
      if (a.title !== undefined && (typeof a.title !== 'string' || a.title.length < 1 || a.title.length > 200)) {
        return bad('title: نص 1–200 محرف')
      }
      if (a.description !== undefined && (typeof a.description !== 'string' || a.description.length > 2000)) {
        return bad('description: نص حتى 2000 محرف')
      }
      if (a.priority !== undefined && !['low', 'medium', 'high', 'urgent'].includes(String(a.priority))) {
        return bad('priority: المتاح: low, medium, high, urgent')
      }
      if (a.dueDate !== undefined && !DATE_RE.test(String(a.dueDate))) return bad('dueDate: YYYY-MM-DD')
      if (a.dueTime !== undefined && !TIME_RE.test(String(a.dueTime))) return bad('dueTime: HH:MM')
      if (a.estimatedMin !== undefined && (!Number.isInteger(a.estimatedMin) || (a.estimatedMin as number) < 0 || (a.estimatedMin as number) > 600)) {
        return bad('estimatedMin: عدد صحيح بين 0 و600')
      }
      const hasChange = ['title', 'description', 'priority', 'dueDate', 'dueTime', 'estimatedMin'].some((k) => a[k] !== undefined)
      if (!hasChange) return bad('مطلوب حقل واحد على الأقل لتعديله (title/description/priority/dueDate/…)')
      return ok(a)
    },
    async execute(db, userId, args) {
      const p_task: Record<string, unknown> = {}
      if (args.title !== undefined) p_task.title = args.title
      if (args.description !== undefined) p_task.description = args.description
      if (args.priority !== undefined) p_task.priority = args.priority
      if (args.dueDate !== undefined) p_task.due_date = args.dueDate
      if (args.dueTime !== undefined) p_task.due_time = args.dueTime
      if (args.estimatedMin !== undefined) p_task.estimated_min = args.estimatedMin
      const result = (await db.rpc('update_task_with_subtasks', {
        p_user_id: userId,
        p_task_id: args.taskId,
        p_task: p_task as any,
        p_subtasks: null,
      })) as { task?: any } | null
      const task = result?.task
      return {
        summary: `حُدّثت المهمة «${task?.title ?? args.taskId}»`,
        updated: true,
        task: task
          ? { id: task.id, title: task.title, status: task.status, priority: task.priority ?? null, dueDate: task.due_date ?? null }
          : null,
      }
    },
  },

  // 11) ── reopen_task ─────────────────────────────
  {
    name: 'reopen_task',
    title: 'إعادة فتح مهمة',
    kind: 'write',
    description:
      'إعادة مهمة منجزة إلى حالة «todo» (عكس complete_task) — مثل «رجّع المهمة الي خلصتها بالغلط مفتوحة».',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', minLength: 1, description: 'معرّف المهمة' },
      },
      required: ['taskId'],
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['taskId'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (typeof a.taskId !== 'string' || a.taskId.length < 1) return bad('taskId: المعرّف مطلوب')
      return ok({ taskId: a.taskId })
    },
    async execute(db, userId, args) {
      const result = (await db.rpc('update_task_with_subtasks', {
        p_user_id: userId,
        p_task_id: args.taskId,
        p_task: { status: 'todo' } as any,
        p_subtasks: null,
      })) as { task?: any } | null
      const task = result?.task
      if (!task) throw new Error('المهمة غير موجودة أو لا تملكها')
      return {
        summary: `أُعيد فتح المهمة «${task.title}»`,
        reopened: true,
        task: { id: task.id, title: task.title, status: task.status },
      }
    },
  },

  // 12) ── delete_task ─────────────────────────────
  {
    name: 'delete_task',
    title: 'حذف مهمة',
    kind: 'write',
    description:
      'حذف مهمة نهائيًا مع عناوينها الفرعية. يتطلب confirm:true صراحةً — مثل: «امسحلي مهمة كذا، متأكد». يُفضَّل complete_task بدل الحذف.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', minLength: 1, description: 'معرّف المهمة' },
        confirm: { type: 'boolean', description: 'يجب أن يكون true لتأكيد الحذف النهائي' },
      },
      required: ['taskId', 'confirm'],
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['taskId', 'confirm'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (typeof a.taskId !== 'string' || a.taskId.length < 1) return bad('taskId: المعرّف مطلوب')
      if (a.confirm !== true) return bad('confirm: الحذف النهائي يتطلب confirm:true صراحةً')
      return ok({ taskId: a.taskId, confirm: true })
    },
    async execute(db, userId, args) {
      const owned = await db.maybeSingle('tasks', {
        select: 'id,title',
        filters: { id: `eq.${args.taskId}`, user_id: `eq.${userId}` },
      })
      if (!owned) throw new Error('المهمة غير موجودة أو لا تملكها')
      await db.delete('tasks', { id: `eq.${args.taskId}`, user_id: `eq.${userId}` })
      return { summary: `حُذفت المهمة «${(owned as any).title}» نهائيًا مع عناوينها الفرعية`, deleted: true }
    },
  },

  // 13) ── list_projects ─────────────────────────────
  {
    name: 'list_projects',
    title: 'عرض المشاريع',
    kind: 'read',
    description: 'يعرض مشاريع المستخدم (الاسم، التقدم، الحالة) — مفيد قبل ربط المهام بمشروع.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    validate(args) {
      const r = rejectUnknown(args, [])
      if (r) return r
      return ok({})
    },
    async execute(db, userId) {
      const projects = ((await db.select('projects', {
        select: 'id,name,description,progress,status,created_at',
        filters: { user_id: `eq.${userId}` },
        order: ['created_at.desc'],
      })) ?? []) as any[]
      return {
        summary: `${projects.length} مشروع${projects.length ? '' : ' — لا مشاريع بعد'}`,
        projects: projects.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description ?? null,
          progress: Math.round((p.progress ?? 0) * 100) / 100,
          status: p.status ?? null,
        })),
      }
    },
  },

  // ═══════════ v2.0 — اليوميات (قراءة) ═══════════

  // 14) ── list_journal_entries ─────────────────────────────
  {
    name: 'list_journal_entries',
    title: 'عرض اليوميات',
    kind: 'read',
    description:
      'يعرض مدخلات اليوميات مرتبة من الأحدث (التاريخ، مقتطف المحتوى، المزاج والطاقة). استخدم get_journal_entry للنص الكامل.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 30, description: 'أقصى عدد مدخلات (افتراضي 10)' },
        fromDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'من تاريخ (اختياري)' },
        toDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'إلى تاريخ (اختياري)' },
      },
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['limit', 'fromDate', 'toDate'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (a.limit !== undefined && (!Number.isInteger(a.limit) || (a.limit as number) < 1 || (a.limit as number) > 30)) {
        return bad('limit: عدد صحيح بين 1 و30')
      }
      if (a.fromDate !== undefined && !DATE_RE.test(String(a.fromDate))) return bad('fromDate: YYYY-MM-DD')
      if (a.toDate !== undefined && !DATE_RE.test(String(a.toDate))) return bad('toDate: YYYY-MM-DD')
      return ok({ limit: a.limit, fromDate: a.fromDate, toDate: a.toDate })
    },
    async execute(db, userId, args) {
      // فترات التاريخ: نستعلم بحد واحد (gte) ثم نفلتر الحد الآخر في
      // الكود — خريطة الفلاتر لا تقبل مفتاح date مرتين في استعلام واحد
      const filters: Record<string, string> = { user_id: `eq.${userId}` }
      if (args.fromDate) filters.date = `gte.${args.fromDate}`
      else if (args.toDate) filters.date = `lte.${args.toDate}`
      const rows = ((await db.select('journals', {
        select: 'id,date,content,mood,energy,created_at',
        filters,
        order: ['date.desc'],
        limit: 200,
      })) ?? []) as any[]
      const inRange = rows.filter(
        (j) =>
          (!args.fromDate || String(j.date) >= args.fromDate) &&
          (!args.toDate || String(j.date) <= args.toDate),
      )
      const sliced = inRange.slice(0, args.limit ?? 10)
      return {
        summary: `${sliced.length} مدخل يوميات`,
        entries: sliced.map((j) => ({
          date: String(j.date),
          id: j.id,
          excerpt: (j.content ?? '').slice(0, 140),
          mood: j.mood ?? null,
          energy: j.energy ?? null,
        })),
      }
    },
  },

  // 15) ── get_journal_entry ─────────────────────────────
  {
    name: 'get_journal_entry',
    title: 'قراءة يومية',
    kind: 'read',
    description: 'النص الكامل لمدخل يوميات بتاريخ محدد (الافتراضي اليوم) — الانتصارات، التحديات، الامتنان، خطة الغد.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'التاريخ (افتراضي اليوم)' },
      },
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['date'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (a.date !== undefined && !DATE_RE.test(String(a.date))) return bad('date: YYYY-MM-DD')
      return ok({ date: a.date as string | undefined })
    },
    async execute(db, userId, args) {
      const date = args.date ?? todayCairo()
      const entry = (await db.maybeSingle('journals', {
        filters: { user_id: `eq.${userId}`, date: `eq.${date}` },
      })) as any
      if (!entry) return { summary: `لا مدخل يوميات بتاريخ ${date}`, entry: null }
      return {
        summary: `يومية ${date}`,
        entry: {
          date: String(entry.date),
          content: entry.content ?? '',
          wins: entry.wins ?? null,
          challenges: entry.challenges ?? null,
          ideas: entry.ideas ?? null,
          tomorrowPlan: entry.tomorrow_plan ?? null,
          gratitude: entry.gratitude ?? null,
          mood: entry.mood ?? null,
          energy: entry.energy ?? null,
        },
      }
    },
  },

  // ═══════════ v2.0 — الأهداف ═══════════

  // 16) ── list_goals ─────────────────────────────
  {
    name: 'list_goals',
    title: 'عرض الأهداف',
    kind: 'read',
    description:
      'يعرض أهداف المستخدم (العنوان، النوع، التقدم، الموعد النهائي، عدد المعالم). استخدم get_goal لتفاصيل معالم الهدف.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['active', 'completed', 'paused'], description: 'تصفية اختيارية بالحالة' },
      },
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['status'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (a.status !== undefined && !['active', 'completed', 'paused'].includes(String(a.status))) {
        return bad('status: المتاح: active, completed, paused')
      }
      return ok({ status: a.status as string | undefined })
    },
    async execute(db, userId, args) {
      const filters: Record<string, string> = { user_id: `eq.${userId}` }
      if (args.status) filters.status = `eq.${args.status}`
      const goals = ((await db.select('goals', {
        select: 'id,title,type,progress,status,deadline,created_at',
        filters,
        order: ['created_at.desc'],
      })) ?? []) as any[]
      return {
        summary: `${goals.length} هدف${args.status ? ` (حالة: ${args.status})` : ''}`,
        goals: goals.map((g) => ({
          id: g.id,
          title: g.title,
          type: g.type ?? null,
          progress: Math.round((g.progress ?? 0) * 100) / 100,
          status: g.status ?? null,
          deadline: g.deadline ?? null,
        })),
      }
    },
  },

  // 17) ── create_goal ─────────────────────────────
  {
    name: 'create_goal',
    title: 'إنشاء هدف',
    kind: 'write',
    description:
      'ينشئ هدفًا جديدًا (مع معالم اختيارية). مثال: «سجّللي هدف أقرا 12 كتاب السنة دي مع معلم كل شهر». الكتابة عبر دالة التطبيق الذرية create_goal_with_milestones.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 200, description: 'عنوان الهدف (مطلوب)' },
        vision: { type: 'string', maxLength: 3000, description: 'الرؤية — لماذا هذا الهدف' },
        why: { type: 'string', maxLength: 3000, description: 'الدافع الأعمق' },
        type: { type: 'string', enum: ['quarterly', 'yearly', 'monthly', 'custom'], description: 'نوع الهدف (افتراضي quarterly)' },
        deadline: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'الموعد النهائي YYYY-MM-DD' },
        milestones: {
          type: 'array',
          maxItems: 20,
          items: { type: 'object', properties: { title: { type: 'string', minLength: 1, maxLength: 150 } }, required: ['title'], additionalProperties: false },
          description: 'معالم الهدف (حد أقصى 20)',
        },
      },
      required: ['title'],
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['title', 'vision', 'why', 'type', 'deadline', 'milestones'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (typeof a.title !== 'string' || a.title.length < 1 || a.title.length > 200) {
        return bad('title: العنوان مطلوب (1–200 محرف)')
      }
      for (const f of ['vision', 'why'] as const) {
        if (a[f] !== undefined && (typeof a[f] !== 'string' || (a[f] as string).length > 3000)) {
          return bad(`${f}: نص اختياري حتى 3000 محرف`)
        }
      }
      if (a.type !== undefined && !['quarterly', 'yearly', 'monthly', 'custom'].includes(String(a.type))) {
        return bad('type: المتاح: quarterly, yearly, monthly, custom')
      }
      if (a.deadline !== undefined && !DATE_RE.test(String(a.deadline))) return bad('deadline: YYYY-MM-DD')
      if (a.milestones !== undefined) {
        if (!Array.isArray(a.milestones) || (a.milestones as unknown[]).length > 20) {
          return bad('milestones: مصفوفة حتى 20 معلمًا')
        }
        for (const m of a.milestones as unknown[]) {
          if (typeof m !== 'object' || m === null || Array.isArray(m)) return bad('milestones: كل عنصر كائن {title}')
          const t = (m as Record<string, unknown>).title
          if (typeof t !== 'string' || t.length < 1 || t.length > 150) {
            return bad('milestones.title: نص مطلوب (1–150 محرفًا)')
          }
        }
      }
      return ok(a)
    },
    async execute(db, userId, args) {
      const p_goal: Record<string, unknown> = { title: args.title }
      if (args.vision !== undefined) p_goal.vision = args.vision
      if (args.why !== undefined) p_goal.why = args.why
      if (args.type !== undefined) p_goal.type = args.type
      if (args.deadline !== undefined) p_goal.deadline = args.deadline
      const result = (await db.rpc('create_goal_with_milestones', {
        p_user_id: userId,
        p_goal: p_goal as any,
        p_milestones: (args.milestones ?? []).map((m: { title: string }, i: number) => ({ title: m.title, order: i })),
      })) as { goal?: any; milestones?: any[] } | null
      const goal = result?.goal
      return {
        summary: `أُنشئ الهدف «${goal?.title ?? args.title}»${(args.milestones ?? []).length ? ` مع ${args.milestones.length} معلم` : ''}`,
        created: true,
        goal: {
          id: goal?.id ?? null,
          title: goal?.title ?? args.title,
          type: goal?.type ?? 'quarterly',
          deadline: goal?.deadline ?? args.deadline ?? null,
          milestonesCount: (result?.milestones ?? []).length,
        },
      }
    },
  },

  // 18) ── get_goal ─────────────────────────────
  {
    name: 'get_goal',
    title: 'تفاصيل هدف',
    kind: 'read',
    description: 'تفاصيل هدف واحد بالمعرّف مع معالمه وحالة كل معلم. خُذ المعرّف من list_goals.',
    inputSchema: {
      type: 'object',
      properties: {
        goalId: { type: 'string', minLength: 1, description: 'معرّف الهدف' },
      },
      required: ['goalId'],
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['goalId'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (typeof a.goalId !== 'string' || a.goalId.length < 1) return bad('goalId: المعرّف مطلوب')
      return ok({ goalId: a.goalId })
    },
    async execute(db, userId, args) {
      const goal = (await db.maybeSingle('goals', {
        filters: { id: `eq.${args.goalId}`, user_id: `eq.${userId}` },
      })) as any
      if (!goal) throw new Error('الهدف غير موجود أو لا تملكه')
      const milestones = ((await db.select('milestones', {
        filters: { goal_id: `eq.${args.goalId}` },
        order: ['order.asc'],
      })) ?? []) as any[]
      return {
        summary: `هدف «${goal.title}» — تقدم ${Math.round((goal.progress ?? 0) * 100)}%`,
        goal: {
          id: goal.id,
          title: goal.title,
          vision: goal.vision ?? null,
          why: goal.why ?? null,
          type: goal.type ?? null,
          progress: goal.progress ?? 0,
          status: goal.status ?? null,
          deadline: goal.deadline ?? null,
          milestones: milestones.map((m) => ({ id: m.id, title: m.title, completed: m.completed === true })),
        },
      }
    },
  },

  // 19) ── update_goal ─────────────────────────────
  {
    name: 'update_goal',
    title: 'تعديل هدف',
    kind: 'write',
    description: 'تعديل هدف قائم (العنوان/الرؤية/الدافع/الموعد/الحالة/التقدم اليدوي). المعالم تُدار من التطبيق.',
    inputSchema: {
      type: 'object',
      properties: {
        goalId: { type: 'string', minLength: 1, description: 'معرّف الهدف' },
        title: { type: 'string', minLength: 1, maxLength: 200, description: 'عنوان جديد' },
        vision: { type: 'string', maxLength: 3000, description: 'رؤية جديدة' },
        why: { type: 'string', maxLength: 3000, description: 'دافع جديد' },
        deadline: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'موعد نهائي جديد' },
        status: { type: 'string', enum: ['active', 'completed', 'paused'], description: 'حالة جديدة' },
      },
      required: ['goalId'],
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['goalId', 'title', 'vision', 'why', 'deadline', 'status'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (typeof a.goalId !== 'string' || a.goalId.length < 1) return bad('goalId: المعرّف مطلوب')
      if (a.title !== undefined && (typeof a.title !== 'string' || a.title.length < 1 || a.title.length > 200)) {
        return bad('title: نص 1–200 محرف')
      }
      if (a.deadline !== undefined && !DATE_RE.test(String(a.deadline))) return bad('deadline: YYYY-MM-DD')
      if (a.status !== undefined && !['active', 'completed', 'paused'].includes(String(a.status))) {
        return bad('status: المتاح: active, completed, paused')
      }
      const hasChange = ['title', 'vision', 'why', 'deadline', 'status'].some((k) => a[k] !== undefined)
      if (!hasChange) return bad('مطلوب حقل واحد على الأقل لتعديله')
      return ok(a)
    },
    async execute(db, userId, args) {
      const changes: Record<string, unknown> = {}
      if (args.title !== undefined) changes.title = args.title
      if (args.vision !== undefined) changes.vision = args.vision
      if (args.why !== undefined) changes.why = args.why
      if (args.deadline !== undefined) changes.deadline = args.deadline
      if (args.status !== undefined) {
        changes.status = args.status
        if (args.status === 'completed') changes.progress = 100
      }
      await db.patch('goals', { id: `eq.${args.goalId}`, user_id: `eq.${userId}` }, changes)
      const goal = (await db.maybeSingle('goals', {
        select: 'id,title,status,progress',
        filters: { id: `eq.${args.goalId}`, user_id: `eq.${userId}` },
      })) as any
      if (!goal) throw new Error('الهدف غير موجود أو لا تملكه')
      return {
        summary: `حُدّث الهدف «${goal.title}»${args.status ? ` (الحالة: ${goal.status})` : ''}`,
        updated: true,
        goal: { id: goal.id, title: goal.title, status: goal.status, progress: goal.progress },
      }
    },
  },

  // 20) ── complete_goal ─────────────────────────────
  {
    name: 'complete_goal',
    title: 'إكمال هدف',
    kind: 'write',
    description: 'وضع علامة «مكتمل» على هدف (التقدم 100% + الحالة completed). قابل للتراجع عبر update_goal.',
    inputSchema: {
      type: 'object',
      properties: {
        goalId: { type: 'string', minLength: 1, description: 'معرّف الهدف' },
      },
      required: ['goalId'],
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['goalId'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (typeof a.goalId !== 'string' || a.goalId.length < 1) return bad('goalId: المعرّف مطلوب')
      return ok({ goalId: a.goalId })
    },
    async execute(db, userId, args) {
      const owned = await db.maybeSingle('goals', {
        select: 'id,title',
        filters: { id: `eq.${args.goalId}`, user_id: `eq.${userId}` },
      })
      if (!owned) throw new Error('الهدف غير موجود أو لا تملكه')
      await db.patch('goals', { id: `eq.${args.goalId}`, user_id: `eq.${userId}` }, { status: 'completed', progress: 100 })
      return {
        summary: `أُكمل الهدف «${(owned as any).title}» 🎯`,
        completed: true,
        goal: { id: args.goalId, title: (owned as any).title },
      }
    },
  },

  // 21) ── delete_goal ─────────────────────────────
  {
    name: 'delete_goal',
    title: 'حذف هدف',
    kind: 'write',
    description: 'حذف هدف نهائيًا مع معالمه. يتطلب confirm:true صراحةً. يُفضَّل complete_goal بدل الحذف.',
    inputSchema: {
      type: 'object',
      properties: {
        goalId: { type: 'string', minLength: 1, description: 'معرّف الهدف' },
        confirm: { type: 'boolean', description: 'يجب أن يكون true لتأكيد الحذف النهائي' },
      },
      required: ['goalId', 'confirm'],
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['goalId', 'confirm'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (typeof a.goalId !== 'string' || a.goalId.length < 1) return bad('goalId: المعرّف مطلوب')
      if (a.confirm !== true) return bad('confirm: الحذف النهائي يتطلب confirm:true صراحةً')
      return ok({ goalId: a.goalId, confirm: true })
    },
    async execute(db, userId, args) {
      const owned = await db.maybeSingle('goals', {
        select: 'id,title',
        filters: { id: `eq.${args.goalId}`, user_id: `eq.${userId}` },
      })
      if (!owned) throw new Error('الهدف غير موجود أو لا تملكه')
      await db.delete('goals', { id: `eq.${args.goalId}`, user_id: `eq.${userId}` })
      return { summary: `حُذف الهدف «${(owned as any).title}» نهائيًا مع معالمه`, deleted: true }
    },
  },

  // ═══════════ v2.0 — العادات (إدارة) ═══════════

  // 22) ── get_habit ─────────────────────────────
  {
    name: 'get_habit',
    title: 'تفاصيل عادة',
    kind: 'read',
    description: 'تفاصيل عادة بالمعرّف مع آخر 30 يومًا من السجل والسلسلة المتصلة. خُذ المعرّف من list_habits.',
    inputSchema: {
      type: 'object',
      properties: {
        habitId: { type: 'string', minLength: 1, description: 'معرّف العادة' },
      },
      required: ['habitId'],
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['habitId'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (typeof a.habitId !== 'string' || a.habitId.length < 1) return bad('habitId: المعرّف مطلوب')
      return ok({ habitId: a.habitId })
    },
    async execute(db, userId, args) {
      const habit = (await db.maybeSingle('habits', {
        filters: { id: `eq.${args.habitId}`, user_id: `eq.${userId}` },
      })) as any
      if (!habit) throw new Error('العادة غير موجودة أو لا تملكها')
      const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
      const logs = ((await db.select('habit_logs', {
        filters: { habit_id: `eq.${args.habitId}`, date: `gte.${thirtyAgo}` },
        order: ['date.desc'],
      })) ?? []) as any[]
      const today = todayCairo()
      const logList = logs.map((l) => ({ date: String(l.date), completed: l.completed === true, count: l.count ?? 1 }))
      return {
        summary: `عادة «${habit.name}» — سلسلة ${habitStreak(logList, today)} يوم`,
        habit: {
          id: habit.id,
          name: habit.name,
          description: habit.description ?? null,
          frequency: habit.frequency ?? null,
          targetCount: habit.target_count ?? 1,
          reminderTime: habit.reminder_time ?? null,
          streak: habitStreak(logList, today),
          todayCompleted: logList.some((l) => l.date === today && l.completed),
          recentLogs: logList.slice(0, 14),
        },
      }
    },
  },

  // 23) ── create_habit ─────────────────────────────
  {
    name: 'create_habit',
    title: 'إنشاء عادة',
    kind: 'write',
    description: 'تنشئ عادة جديدة. مثال: «ضيفلي عادة قراءة نصف ساعة يوميًا بهدف 1 مرة».',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 150, description: 'اسم العادة (مطلوب)' },
        description: { type: 'string', maxLength: 2000, description: 'وصف اختياري' },
        frequency: { type: 'string', enum: ['daily', 'weekly', 'custom'], description: 'التكرار (افتراضي daily)' },
        targetCount: { type: 'integer', minimum: 1, maximum: 50, description: 'الهدف اليومي بعدد المرات (افتراضي 1)' },
        reminderTime: { type: 'string', description: 'وقت التذكير HH:MM (اختياري)' },
      },
      required: ['name'],
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['name', 'description', 'frequency', 'targetCount', 'reminderTime'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (typeof a.name !== 'string' || a.name.length < 1 || a.name.length > 150) {
        return bad('name: الاسم مطلوب (1–150 محرفًا)')
      }
      if (a.description !== undefined && (typeof a.description !== 'string' || a.description.length > 2000)) {
        return bad('description: نص حتى 2000 محرف')
      }
      if (a.frequency !== undefined && !['daily', 'weekly', 'custom'].includes(String(a.frequency))) {
        return bad('frequency: المتاح: daily, weekly, custom')
      }
      if (a.targetCount !== undefined && (!Number.isInteger(a.targetCount) || (a.targetCount as number) < 1 || (a.targetCount as number) > 50)) {
        return bad('targetCount: عدد صحيح بين 1 و50')
      }
      if (a.reminderTime !== undefined && !TIME_RE.test(String(a.reminderTime))) return bad('reminderTime: HH:MM')
      return ok(a)
    },
    async execute(db, userId, args) {
      await db.insert('habits', {
        user_id: userId,
        name: args.name,
        description: args.description ?? null,
        frequency: args.frequency ?? 'daily',
        target_count: args.targetCount ?? 1,
        reminder_time: args.reminderTime ?? null,
      })
      const habit = (await db.maybeSingle('habits', {
        select: 'id,name,frequency,target_count',
        filters: { user_id: `eq.${userId}`, name: `eq.${args.name}` },
      })) as any
      return {
        summary: `أُنشئت العادة «${habit?.name ?? args.name}»`,
        created: true,
        habit: habit ? { id: habit.id, name: habit.name, frequency: habit.frequency, targetCount: habit.target_count } : null,
      }
    },
  },

  // 24) ── update_habit ─────────────────────────────
  {
    name: 'update_habit',
    title: 'تعديل عادة',
    kind: 'write',
    description: 'تعديل عادة قائمة (الاسم/الوصف/التكرار/الهدف/وقت التذكير).',
    inputSchema: {
      type: 'object',
      properties: {
        habitId: { type: 'string', minLength: 1, description: 'معرّف العادة' },
        name: { type: 'string', minLength: 1, maxLength: 150, description: 'اسم جديد' },
        description: { type: 'string', maxLength: 2000, description: 'وصف جديد' },
        frequency: { type: 'string', enum: ['daily', 'weekly', 'custom'], description: 'تكرار جديد' },
        targetCount: { type: 'integer', minimum: 1, maximum: 50, description: 'هدف جديد' },
        reminderTime: { type: 'string', description: 'وقت تذكير جديد HH:MM' },
      },
      required: ['habitId'],
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['habitId', 'name', 'description', 'frequency', 'targetCount', 'reminderTime'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (typeof a.habitId !== 'string' || a.habitId.length < 1) return bad('habitId: المعرّف مطلوب')
      if (a.name !== undefined && (typeof a.name !== 'string' || a.name.length < 1 || a.name.length > 150)) {
        return bad('name: نص 1–150 محرف')
      }
      if (a.frequency !== undefined && !['daily', 'weekly', 'custom'].includes(String(a.frequency))) {
        return bad('frequency: المتاح: daily, weekly, custom')
      }
      if (a.targetCount !== undefined && (!Number.isInteger(a.targetCount) || (a.targetCount as number) < 1 || (a.targetCount as number) > 50)) {
        return bad('targetCount: عدد صحيح بين 1 و50')
      }
      if (a.reminderTime !== undefined && !TIME_RE.test(String(a.reminderTime))) return bad('reminderTime: HH:MM')
      const hasChange = ['name', 'description', 'frequency', 'targetCount', 'reminderTime'].some((k) => a[k] !== undefined)
      if (!hasChange) return bad('مطلوب حقل واحد على الأقل لتعديله')
      return ok(a)
    },
    async execute(db, userId, args) {
      const changes: Record<string, unknown> = {}
      if (args.name !== undefined) changes.name = args.name
      if (args.description !== undefined) changes.description = args.description
      if (args.frequency !== undefined) changes.frequency = args.frequency
      if (args.targetCount !== undefined) changes.target_count = args.targetCount
      if (args.reminderTime !== undefined) changes.reminder_time = args.reminderTime
      await db.patch('habits', { id: `eq.${args.habitId}`, user_id: `eq.${userId}` }, changes)
      const habit = (await db.maybeSingle('habits', {
        select: 'id,name,frequency,target_count',
        filters: { id: `eq.${args.habitId}`, user_id: `eq.${userId}` },
      })) as any
      if (!habit) throw new Error('العادة غير موجودة أو لا تملكها')
      return {
        summary: `حُدّثت العادة «${habit.name}»`,
        updated: true,
        habit: { id: habit.id, name: habit.name, frequency: habit.frequency, targetCount: habit.target_count },
      }
    },
  },

  // 25) ── delete_habit ─────────────────────────────
  {
    name: 'delete_habit',
    title: 'حذف عادة',
    kind: 'write',
    description: 'حذف عادة نهائيًا مع سجلها. يتطلب confirm:true صراحةً.',
    inputSchema: {
      type: 'object',
      properties: {
        habitId: { type: 'string', minLength: 1, description: 'معرّف العادة' },
        confirm: { type: 'boolean', description: 'يجب أن يكون true لتأكيد الحذف النهائي' },
      },
      required: ['habitId', 'confirm'],
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['habitId', 'confirm'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (typeof a.habitId !== 'string' || a.habitId.length < 1) return bad('habitId: المعرّف مطلوب')
      if (a.confirm !== true) return bad('confirm: الحذف النهائي يتطلب confirm:true صراحةً')
      return ok({ habitId: a.habitId, confirm: true })
    },
    async execute(db, userId, args) {
      const owned = await db.maybeSingle('habits', {
        select: 'id,name',
        filters: { id: `eq.${args.habitId}`, user_id: `eq.${userId}` },
      })
      if (!owned) throw new Error('العادة غير موجودة أو لا تملكها')
      await db.delete('habits', { id: `eq.${args.habitId}`, user_id: `eq.${userId}` })
      return { summary: `حُذفت العادة «${(owned as any).name}» نهائيًا مع سجلها`, deleted: true }
    },
  },

  // ═══════════ v2.0 — الإشعارات ═══════════

  // 26) ── list_notifications ─────────────────────────────
  {
    name: 'list_notifications',
    title: 'عرض الإشعارات',
    kind: 'read',
    description: 'يعرض إشعارات المستخدم (العنوان، النوع، الأولوية، المقروء/غير المقروء) من الأحدث.',
    inputSchema: {
      type: 'object',
      properties: {
        unreadOnly: { type: 'boolean', description: 'إظهار غير المقروءة فقط (افتراضي false)' },
        limit: { type: 'integer', minimum: 1, maximum: 50, description: 'أقصى عدد إشعارات (افتراضي 15)' },
      },
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['unreadOnly', 'limit'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (a.unreadOnly !== undefined && typeof a.unreadOnly !== 'boolean') return bad('unreadOnly: قيمة منطقية')
      if (a.limit !== undefined && (!Number.isInteger(a.limit) || (a.limit as number) < 1 || (a.limit as number) > 50)) {
        return bad('limit: عدد صحيح بين 1 و50')
      }
      return ok({ unreadOnly: a.unreadOnly as boolean | undefined, limit: a.limit as number | undefined })
    },
    async execute(db, userId, args) {
      const filters: Record<string, string> = { user_id: `eq.${userId}` }
      if (args.unreadOnly) filters.read = 'eq.false'
      const rows = ((await db.select('notifications', {
        select: 'id,title,body,type,priority,read,read_at,action_url,created_at',
        filters,
        order: ['created_at.desc'],
        limit: args.limit ?? 15,
      })) ?? []) as any[]
      return {
        summary: `${rows.length} إشعار${args.unreadOnly ? ' (غير مقروءة)' : ''}`,
        notifications: rows.map((n) => ({
          id: n.id,
          title: n.title,
          body: n.body ?? null,
          type: n.type ?? null,
          priority: n.priority ?? 'normal',
          read: n.read === true,
          actionUrl: n.action_url ?? null,
          createdAt: n.created_at,
        })),
      }
    },
  },

  // 27) ── unread_notifications_count ─────────────────────────────
  {
    name: 'unread_notifications_count',
    title: 'عدد غير المقروء',
    kind: 'read',
    description: 'عدد الإشعارات غير المقروءة — مناسب لسؤال «عندي حاجة جديدة؟».',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    validate(args) {
      const r = rejectUnknown(args, [])
      if (r) return r
      return ok({})
    },
    async execute(db, userId) {
      const rows = ((await db.select('notifications', {
        select: 'id',
        filters: { user_id: `eq.${userId}`, read: 'eq.false' },
        limit: 100,
      })) ?? []) as any[]
      return { summary: `${rows.length} إشعار غير مقروء`, unreadCount: rows.length }
    },
  },

  // 28) ── mark_notification_read ─────────────────────────────
  {
    name: 'mark_notification_read',
    title: 'قراءة إشعار',
    kind: 'write',
    description: 'وضع علامة «مقروء» على إشعار بالمعرّف (read_at يُضبط تلقائيًا).',
    inputSchema: {
      type: 'object',
      properties: {
        notificationId: { type: 'string', minLength: 1, description: 'معرّف الإشعار (من list_notifications)' },
      },
      required: ['notificationId'],
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['notificationId'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (typeof a.notificationId !== 'string' || a.notificationId.length < 1) return bad('notificationId: المعرّف مطلوب')
      return ok({ notificationId: a.notificationId })
    },
    async execute(db, userId, args) {
      const owned = await db.maybeSingle('notifications', {
        select: 'id',
        filters: { id: `eq.${args.notificationId}`, user_id: `eq.${userId}` },
      })
      if (!owned) throw new Error('الإشعار غير موجود أو لا تملكه')
      await db.patch('notifications', { id: `eq.${args.notificationId}`, user_id: `eq.${userId}` }, { read: true })
      return { summary: 'وُسم الإشعار كمقروء', marked: true, notificationId: args.notificationId }
    },
  },

  // 29) ── mark_all_notifications_read ─────────────────────────────
  {
    name: 'mark_all_notifications_read',
    title: 'قراءة الكل',
    kind: 'write',
    description: 'وضع علامة «مقروء» على كل إشعارات المستخدم غير المقروءة — مثل «اقرا كل الإشعارات».',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    validate(args) {
      const r = rejectUnknown(args, [])
      if (r) return r
      return ok({})
    },
    async execute(db, userId) {
      await db.patch('notifications', { user_id: `eq.${userId}`, read: 'eq.false' }, { read: true })
      const remaining = ((await db.select('notifications', {
        select: 'id',
        filters: { user_id: `eq.${userId}`, read: 'eq.false' },
        limit: 5,
      })) ?? []) as any[]
      return {
        summary: 'وُسمت كل الإشعارات كمقروءة',
        markedAll: true,
        remainingUnread: remaining.length,
      }
    },
  },

  // ═══════════ v2.0 — المجتمع ═══════════

  // 30) ── community_feed ─────────────────────────────
  {
    name: 'community_feed',
    title: 'خلاصة المجتمع',
    kind: 'read',
    description: 'يعرض منشورات مجتمع أوج المنشورة (العنوان، مقتطف، الإعجابات، الردود) من الأحدث نشاطًا.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 30, description: 'أقصى عدد منشورات (افتراضي 15)' },
      },
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['limit'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (a.limit !== undefined && (!Number.isInteger(a.limit) || (a.limit as number) < 1 || (a.limit as number) > 30)) {
        return bad('limit: عدد صحيح بين 1 و30')
      }
      return ok({ limit: a.limit as number | undefined })
    },
    async execute(db, _userId, args) {
      const posts = ((await db.select('community_posts', {
        select: 'id,title,body,like_count,reply_count,last_activity_at,created_at',
        filters: { status: 'eq.published' },
        order: ['last_activity_at.desc'],
        limit: args.limit ?? 15,
      })) ?? []) as any[]
      return {
        summary: `${posts.length} منشورًا في المجتمع`,
        posts: posts.map((p) => ({
          id: p.id,
          title: p.title,
          excerpt: (p.body ?? '').slice(0, 160),
          likes: p.like_count ?? 0,
          replies: p.reply_count ?? 0,
          lastActivityAt: p.last_activity_at,
        })),
      }
    },
  },

  // 31) ── get_community_post ─────────────────────────────
  {
    name: 'get_community_post',
    title: 'قراءة منشور',
    kind: 'read',
    description: 'النص الكامل لمنشور بالمعرّف مع تعليقاته. خُذ المعرّف من community_feed.',
    inputSchema: {
      type: 'object',
      properties: {
        postId: { type: 'string', minLength: 1, description: 'معرّف المنشور' },
      },
      required: ['postId'],
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['postId'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (typeof a.postId !== 'string' || a.postId.length < 1) return bad('postId: المعرّف مطلوب')
      return ok({ postId: a.postId })
    },
    async execute(db, _userId, args) {
      const post = (await db.maybeSingle('community_posts', {
        filters: { id: `eq.${args.postId}`, status: 'eq.published' },
      })) as any
      if (!post) throw new Error('المنشور غير موجود')
      const comments = ((await db.select('community_comments', {
        select: 'id,body,like_count,created_at',
        filters: { post_id: `eq.${args.postId}`, status: 'eq.published' },
        order: ['created_at.asc'],
        limit: 50,
      })) ?? []) as any[]
      return {
        summary: `منشور «${post.title}» — ${post.like_count ?? 0} إعجابًا و${comments.length} تعليقًا`,
        post: {
          id: post.id,
          title: post.title,
          body: post.body,
          likes: post.like_count ?? 0,
          replies: post.reply_count ?? 0,
          createdAt: post.created_at,
          comments: comments.map((c) => ({ id: c.id, body: c.body, likes: c.like_count ?? 0, createdAt: c.created_at })),
        },
      }
    },
  },

  // 32) ── create_community_post ─────────────────────────────
  {
    name: 'create_community_post',
    title: 'نشر في المجتمع',
    kind: 'write',
    description: 'ينشر منشورًا باسم المستخدم في مجتمع أوج. مثال: «انشر في المجتمع سؤال عن أفضل تقنية للتركيز».',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', minLength: 3, maxLength: 200, description: 'عنوان المنشور (مطلوب)' },
        body: { type: 'string', minLength: 1, maxLength: 10000, description: 'نص المنشور (مطلوب)' },
      },
      required: ['title', 'body'],
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['title', 'body'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (typeof a.title !== 'string' || a.title.trim().length < 3 || a.title.length > 200) {
        return bad('title: العنوان مطلوب (3–200 محرف)')
      }
      if (typeof a.body !== 'string' || a.body.trim().length < 1 || a.body.length > 10000) {
        return bad('body: النص مطلوب (حتى 10000 محرف)')
      }
      return ok({ title: a.title, body: a.body })
    },
    async execute(db, userId, args) {
      await db.insert('community_posts', {
        user_id: userId,
        title: args.title,
        body: args.body,
        status: 'published',
      })
      // insert بلا إعادة تمثيل — نجلب الصف المنشأ لتعرّفه للعميل
      const rows = ((await db.select('community_posts', {
        select: 'id,title,created_at',
        filters: { user_id: `eq.${userId}`, title: `eq.${args.title}` },
        order: ['created_at.desc'],
        limit: 1,
      })) ?? []) as any[]
      const post = rows[0]
      return {
        summary: `نُشر «${args.title}» في المجتمع`,
        published: true,
        post: { id: post?.id ?? null, title: args.title },
      }
    },
  },

  // 33) ── comment_community_post ─────────────────────────────
  {
    name: 'comment_community_post',
    title: 'تعليق على منشور',
    kind: 'write',
    description: 'يضيف تعليقًا للمستخدم على منشور في المجتمع.',
    inputSchema: {
      type: 'object',
      properties: {
        postId: { type: 'string', minLength: 1, description: 'معرّف المنشور (من community_feed)' },
        body: { type: 'string', minLength: 1, maxLength: 5000, description: 'نص التعليق (مطلوب)' },
      },
      required: ['postId', 'body'],
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['postId', 'body'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (typeof a.postId !== 'string' || a.postId.length < 1) return bad('postId: المعرّف مطلوب')
      if (typeof a.body !== 'string' || a.body.trim().length < 1 || a.body.length > 5000) {
        return bad('body: نص التعليق مطلوب (حتى 5000 محرف)')
      }
      return ok({ postId: a.postId, body: a.body })
    },
    async execute(db, userId, args) {
      const post = await db.maybeSingle('community_posts', {
        select: 'id',
        filters: { id: `eq.${args.postId}`, status: 'eq.published' },
      })
      if (!post) throw new Error('المنشور غير موجود')
      await db.insert('community_comments', {
        post_id: args.postId,
        user_id: userId,
        body: args.body,
        status: 'published',
      })
      // insert بلا إعادة تمثيل — نجلب التعليق المنشأ
      const rows = ((await db.select('community_comments', {
        select: 'id,post_id,created_at',
        filters: { post_id: `eq.${args.postId}`, user_id: `eq.${userId}` },
        order: ['created_at.desc'],
        limit: 1,
      })) ?? []) as any[]
      const saved = rows[0]
      return {
        summary: 'أُضيف تعليقك',
        commented: true,
        comment: { id: saved?.id ?? null, postId: args.postId },
      }
    },
  },

  // 34) ── toggle_post_like ─────────────────────────────
  {
    name: 'toggle_post_like',
    title: 'إعجاب بمنشور',
    kind: 'write',
    description: 'يبدّل إعجاب المستخدم بمنشور (إعجاب إن لم يكن معجبًا، وإلغاؤه إن كان). العدادات تُحدَّث تلقائيًا.',
    inputSchema: {
      type: 'object',
      properties: {
        postId: { type: 'string', minLength: 1, description: 'معرّف المنشور' },
      },
      required: ['postId'],
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['postId'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (typeof a.postId !== 'string' || a.postId.length < 1) return bad('postId: المعرّف مطلوب')
      return ok({ postId: a.postId })
    },
    async execute(db, userId, args) {
      const post = await db.maybeSingle('community_posts', {
        select: 'id',
        filters: { id: `eq.${args.postId}`, status: 'eq.published' },
      })
      if (!post) throw new Error('المنشور غير موجود')
      const existing = await db.maybeSingle('community_reactions', {
        select: 'id',
        filters: { user_id: `eq.${userId}`, target_type: 'eq.post', target_id: `eq.${args.postId}` },
      })
      if (existing) {
        await db.delete('community_reactions', {
          user_id: `eq.${userId}`,
          target_type: 'eq.post',
          target_id: `eq.${args.postId}`,
        })
        return { summary: 'أُلغي إعجابك بالمنشور', liked: false, postId: args.postId }
      }
      await db.insert('community_reactions', {
        user_id: userId,
        target_type: 'post',
        target_id: args.postId,
        reaction: 'like',
      })
      return { summary: 'أُعجبت بالمنشور', liked: true, postId: args.postId }
    },
  },

  // 35) ── report_community_post ─────────────────────────────
  {
    name: 'report_community_post',
    title: 'الإبلاغ عن منشور',
    kind: 'write',
    description: 'يبلّغ عن منشور مخالف (سبب إلزامي: spam/abuse/offensive/off_topic/other).',
    inputSchema: {
      type: 'object',
      properties: {
        postId: { type: 'string', minLength: 1, description: 'معرّف المنشور' },
        reason: { type: 'string', enum: ['spam', 'abuse', 'offensive', 'off_topic', 'other'], description: 'سبب الإبلاغ' },
        details: { type: 'string', maxLength: 2000, description: 'تفاصيل اختيارية' },
      },
      required: ['postId', 'reason'],
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['postId', 'reason', 'details'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (typeof a.postId !== 'string' || a.postId.length < 1) return bad('postId: المعرّف مطلوب')
      if (!['spam', 'abuse', 'offensive', 'off_topic', 'other'].includes(String(a.reason))) {
        return bad('reason: المتاح: spam, abuse, offensive, off_topic, other')
      }
      if (a.details !== undefined && (typeof a.details !== 'string' || a.details.length > 2000)) {
        return bad('details: نص حتى 2000 محرف')
      }
      return ok({ postId: a.postId, reason: a.reason, details: a.details })
    },
    async execute(db, userId, args) {
      await db.insert('community_reports', {
        reporter_id: userId,
        target_type: 'post',
        target_id: args.postId,
        reason: args.reason,
        details: args.details ?? null,
        status: 'open',
      })
      return { summary: 'سُجّل بلاغك وسيراجعه المشرفون', reported: true, postId: args.postId }
    },
  },

  // ═══════════ v2.0 — الحساب ═══════════

  // 36) ── get_profile ─────────────────────────────
  {
    name: 'get_profile',
    title: 'ملفي',
    kind: 'read',
    description: 'ملف المستخدم (الاسم، المعرجم handle، المستوى، نقاط الخبرة، السلاسل، إحصاءات الإنجاز).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    validate(args) {
      const r = rejectUnknown(args, [])
      if (r) return r
      return ok({})
    },
    async execute(db, userId) {
      const p = (await db.maybeSingle('profiles', {
        select: 'name,email,avatar,handle,level,xp,xp_to_next_level,streak,longest_streak,total_focus_min,total_tasks_done,created_at',
        filters: { id: `eq.${userId}` },
      })) as any
      if (!p) return { summary: 'لا ملف لهذا المستخدم', profile: null }
      return {
        summary: `${p.name} — مستوى ${p.level} · ${p.xp} XP · سلسلة ${p.streak} يوم`,
        profile: {
          name: p.name,
          handle: p.handle ?? null,
          avatar: p.avatar ?? null,
          level: p.level ?? 1,
          xp: p.xp ?? 0,
          xpToNextLevel: p.xp_to_next_level ?? 100,
          streak: p.streak ?? 0,
          longestStreak: p.longest_streak ?? 0,
          totalFocusMinutes: p.total_focus_min ?? 0,
          totalTasksDone: p.total_tasks_done ?? 0,
        },
      }
    },
  },

  // 37) ── update_profile ─────────────────────────────
  {
    name: 'update_profile',
    title: 'تعديل الملف',
    kind: 'write',
    description: 'تعديل اسم المستخدم العلني أو رابط الصورة الرمزية.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 60, description: 'اسم عرض جديد' },
        avatar: { type: 'string', maxLength: 500, description: 'رابط صورة رمزية جديد' },
      },
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['name', 'avatar'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (a.name !== undefined && (typeof a.name !== 'string' || a.name.trim().length < 1 || a.name.length > 60)) {
        return bad('name: نص 1–60 محرف')
      }
      if (a.avatar !== undefined && (typeof a.avatar !== 'string' || a.avatar.length > 500)) {
        return bad('avatar: رابط حتى 500 محرف')
      }
      const hasChange = a.name !== undefined || a.avatar !== undefined
      if (!hasChange) return bad('مطلوب حقل واحد على الأقل (name/avatar)')
      return ok(a)
    },
    async execute(db, userId, args) {
      const changes: Record<string, unknown> = {}
      if (args.name !== undefined) changes.name = args.name
      if (args.avatar !== undefined) changes.avatar = args.avatar
      await db.patch('profiles', { id: `eq.${userId}` }, changes)
      return { summary: 'حُدّث ملفك الشخصي', updated: true, fields: Object.keys(changes) }
    },
  },

  // 38) ── get_subscription ─────────────────────────────
  {
    name: 'get_subscription',
    title: 'اشتراكي',
    kind: 'read',
    description: 'حالة اشتراك المستخدم (الخطة، الحالة، تاريخ الانتهاء) — مثل «اشتراكي شنوة حالته؟».',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    validate(args) {
      const r = rejectUnknown(args, [])
      if (r) return r
      return ok({})
    },
    async execute(db, userId) {
      const sub = (await db.maybeSingle('user_subscriptions', {
        select: 'plan,status,started_at,expires_at,updated_at',
        filters: { user_id: `eq.${userId}` },
      })) as any
      if (!sub) return { summary: 'خطة مجانية (لا اشتراك مدفوع)', subscription: { plan: 'free', status: 'none' } }
      return {
        summary: `خطة ${sub.plan} — ${sub.status}${sub.expires_at ? ` حتى ${String(sub.expires_at).slice(0, 10)}` : ''}`,
        subscription: {
          plan: sub.plan ?? 'free',
          status: sub.status ?? null,
          startedAt: sub.started_at ?? null,
          expiresAt: sub.expires_at ?? null,
        },
      }
    },
  },

  // 39) ── get_usage_today ─────────────────────────────
  {
    name: 'get_usage_today',
    title: 'استخدام اليوم',
    kind: 'read',
    description: 'استخدام المستخدم اليوم (بتقويم القاهرة) لكل ميزة — مثل «استخدمت قداش من عملي اليوم؟».',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    validate(args) {
      const r = rejectUnknown(args, [])
      if (r) return r
      return ok({})
    },
    async execute(db, userId) {
      const today = todayCairo()
      const rows = ((await db.select('usage_daily', {
        select: 'feature_key,count,day',
        filters: { user_id: `eq.${userId}`, day: `eq.${today}` },
      })) ?? []) as any[]
      const total = rows.reduce((s, r) => s + (r.count ?? 0), 0)
      return {
        summary: `${total} عملية موزعة على ${rows.length} ميزة اليوم`,
        day: today,
        total,
        features: rows.map((r) => ({ feature: r.feature_key, count: r.count })),
      }
    },
  },

  // ═══════════ v2.0 — البحث الموحّد ═══════════

  // 40) ── search_everything ─────────────────────────────
  {
    name: 'search_everything',
    title: 'بحث شامل',
    kind: 'read',
    description: 'بحث واحد في كل بياناتك: المهام والأهداف والعادات واليوميات والكتب وملاحظات المعرفة والمخطط والحركة المالية — مثل «دوّر على كلمة تقرير».',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 2, maxLength: 100, description: 'نص البحث (مطلوب)' },
        limit: { type: 'integer', minimum: 1, maximum: 20, description: 'أقصى نتائج لكل نوع (افتراضي 5)' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['query', 'limit'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (typeof a.query !== 'string' || a.query.trim().length < 2 || a.query.length > 100) {
        return bad('query: نص البحث مطلوب (2–100 محرف)')
      }
      if (a.limit !== undefined && (!Number.isInteger(a.limit) || (a.limit as number) < 1 || (a.limit as number) > 20)) {
        return bad('limit: عدد صحيح بين 1 و20')
      }
      return ok({ query: a.query.trim(), limit: (a.limit ?? 5) as number })
    },
    async execute(db, userId, args) {
      const q = args.query
      const like = `ilike.%${q}%`
      const [tasks, goals, habits, journals, books, knowledge, planner, finance] = await Promise.all([
        (db.select('tasks', {
          select: 'id,title,description,status',
          filters: { user_id: `eq.${userId}`, title: like },
          limit: args.limit,
        }) as Promise<any[]>).catch(() => []),
        (db.select('goals', {
          select: 'id,title,status,progress',
          filters: { user_id: `eq.${userId}`, title: like },
          limit: args.limit,
        }) as Promise<any[]>).catch(() => []),
        (db.select('habits', {
          select: 'id,name,frequency',
          filters: { user_id: `eq.${userId}`, name: like },
          limit: args.limit,
        }) as Promise<any[]>).catch(() => []),
        (db.select('journals', {
          select: 'id,date,content',
          filters: { user_id: `eq.${userId}`, content: like },
          limit: args.limit,
        }) as Promise<any[]>).catch(() => []),
        (db.select('books', {
          select: 'id,title,author,status',
          filters: { user_id: `eq.${userId}`, title: like },
          limit: args.limit,
        }) as Promise<any[]>).catch(() => []),
        (db.select('knowledge_items', {
          select: 'id,type,title',
          filters: { user_id: `eq.${userId}`, title: like },
          limit: args.limit,
        }) as Promise<any[]>).catch(() => []),
        (db.select('planner_items', {
          select: 'id,date,section,title',
          filters: { user_id: `eq.${userId}`, title: like },
          limit: args.limit,
        }) as Promise<any[]>).catch(() => []),
        (db.select('finance_records', {
          select: 'id,type,description,amount,date',
          filters: { user_id: `eq.${userId}`, description: like },
          limit: args.limit,
        }) as Promise<any[]>).catch(() => []),
      ])
      const total =
        tasks.length + goals.length + habits.length + journals.length +
        books.length + knowledge.length + planner.length + finance.length
      return {
        summary: total ? `وُجدت ${total} نتيجة لكلمة «${q}»` : `لا نتائج لكلمة «${q}»`,
        tasks: (tasks as any[]).map((t) => ({ id: t.id, title: t.title, status: t.status })),
        goals: (goals as any[]).map((g) => ({ id: g.id, title: g.title, status: g.status })),
        habits: (habits as any[]).map((h) => ({ id: h.id, name: h.name, frequency: h.frequency })),
        journalEntries: (journals as any[]).map((j) => ({
          date: String(j.date),
          excerpt: (j.content ?? '').slice(0, 120),
        })),
        books: (books as any[]).map((b) => ({ id: b.id, title: b.title, author: b.author ?? null, status: b.status })),
        knowledgeItems: (knowledge as any[]).map((k) => ({ id: k.id, title: k.title, type: k.type })),
        plannerItems: (planner as any[]).map((p) => ({ id: p.id, title: p.title, date: String(p.date), section: p.section })),
        financeRecords: (finance as any[]).map((f) => ({ id: f.id, description: f.description, amount: f.amount, type: f.type, date: String(f.date) })),
      }
    },
  },

  // ═══════════ v3.0 — القراءة (books) ═══════════

  // 41) ── list_books ─────────────────────────────
  {
    name: 'list_books',
    title: 'عرض مكتبة القراءة',
    kind: 'read',
    description:
      'يعرض مكتبة قراءة المستخدم (كتب/مقالات/دورات/فيديوهات) مع الحالة والتقدم — مثل «إيه الكتب اللي قاريها دلوقتي؟». استخدم get_book للتفاصيل الكاملة.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['reading', 'completed', 'want_to_read', 'paused'],
          description: 'تصفية اختيارية بالحالة (قيد القراءة/مكتمل/أريد قراءته/متوقف)',
        },
        type: {
          type: 'string',
          enum: ['book', 'article', 'course', 'video'],
          description: 'تصفية اختيارية بالنوع',
        },
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'أقصى عدد عناصر يُعاد (افتراضي 50)' },
      },
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['status', 'type', 'limit'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (a.status !== undefined && !['reading', 'completed', 'want_to_read', 'paused'].includes(String(a.status))) {
        return bad('status: قيمة غير صالحة — المتاح: reading, completed, want_to_read, paused')
      }
      if (a.type !== undefined && !['book', 'article', 'course', 'video'].includes(String(a.type))) {
        return bad('type: قيمة غير صالحة — المتاح: book, article, course, video')
      }
      if (a.limit !== undefined && (!Number.isInteger(a.limit) || (a.limit as number) < 1 || (a.limit as number) > 100)) {
        return bad('limit: عدد صحيح بين 1 و100')
      }
      return ok({ status: a.status as string | undefined, type: a.type as string | undefined, limit: a.limit as number | undefined })
    },
    async execute(db, userId, args) {
      const all = ((await db.select('books', {
        filters: { user_id: `eq.${userId}` },
        order: ['updated_at.desc'],
        limit: 200,
      })) ?? []) as any[]
      const counts: Record<string, number> = { reading: 0, completed: 0, want_to_read: 0, paused: 0 }
      for (const b of all) if (counts[b.status] !== undefined) counts[b.status]++
      const filtered = all.filter(
        (b) => (!args.status || b.status === args.status) && (!args.type || b.type === args.type),
      )
      const sliced = filtered.slice(0, args.limit ?? 50)
      return {
        summary: `مكتبتك: ${all.length} عنصرًا (قيد القراءة ${counts.reading}، مكتمل ${counts.completed}، للقراءة لاحقًا ${counts.want_to_read})${args.status ? ` — مرشح: ${args.status}` : ''}`,
        counts,
        books: sliced.map((b) => ({
          id: b.id,
          title: b.title,
          author: b.author ?? null,
          type: b.type ?? 'book',
          status: b.status ?? 'reading',
          progress: round1(b.progress ?? 0),
          currentPage: b.current_page ?? 0,
          totalPages: b.total_pages ?? null,
          rating: b.rating ?? null,
        })),
      }
    },
  },

  // 42) ── get_book ─────────────────────────────
  {
    name: 'get_book',
    title: 'تفاصيل عنصر قراءة',
    kind: 'read',
    description: 'التفاصيل الكاملة لعنصر قراءة (الملاحظات، الاقتباسات المميزة، الاقتباس المفضل، التقييم، تواريخ البدء والإتمام).',
    inputSchema: {
      type: 'object',
      properties: {
        bookId: { type: 'string', minLength: 1, description: 'معرّف العنصر (من list_books)' },
      },
      required: ['bookId'],
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['bookId'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (typeof a.bookId !== 'string' || a.bookId.length < 1) return bad('bookId: المعرّف مطلوب')
      return ok({ bookId: a.bookId })
    },
    async execute(db, userId, args) {
      const b = (await db.maybeSingle('books', {
        filters: { id: `eq.${args.bookId}`, user_id: `eq.${userId}` },
      })) as any
      if (!b) throw new Error('الكتاب غير موجود أو لا تملكه')
      return {
        summary: `«${b.title}» — ${b.status ?? 'reading'} (${round1(b.progress ?? 0)}%)`,
        book: {
          id: b.id,
          title: b.title,
          author: b.author ?? null,
          type: b.type ?? 'book',
          status: b.status ?? 'reading',
          progress: round1(b.progress ?? 0),
          currentPage: b.current_page ?? 0,
          totalPages: b.total_pages ?? null,
          rating: b.rating ?? null,
          notes: b.notes ?? null,
          highlights: b.highlights ?? null,
          favoriteQuote: b.favorite_quote ?? null,
          coverUrl: b.cover_url ?? null,
          startDate: b.start_date ?? null,
          endDate: b.end_date ?? null,
        },
      }
    },
  },

  // 43) ── create_book ─────────────────────────────
  {
    name: 'create_book',
    title: 'إضافة عنصر قراءة',
    kind: 'write',
    description: 'يضيف عنصرًا لمكتبة القراءة — مثل «ضيف كتاب العادات الذرية 320 صفحة لقايمة اللي هقراها». التقدم يُحسب تلقائيًا من الصفحات.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 300, description: 'العنوان (مطلوب)' },
        author: { type: 'string', maxLength: 200, description: 'المؤلف' },
        type: { type: 'string', enum: ['book', 'article', 'course', 'video'], description: 'النوع (افتراضي book)' },
        status: {
          type: 'string',
          enum: ['reading', 'completed', 'want_to_read', 'want-to-read', 'paused'],
          description: 'الحالة (افتراضي reading)',
        },
        totalPages: { type: 'integer', minimum: 1, maximum: 1000000, description: 'إجمالي الصفحات/الدقائق' },
        currentPage: { type: 'integer', minimum: 0, maximum: 1000000, description: 'الصفحة الحالية' },
        rating: { type: 'integer', minimum: 0, maximum: 5, description: 'التقييم 0–5' },
        notes: { type: 'string', maxLength: 20000, description: 'ملاحظات' },
        favoriteQuote: { type: 'string', maxLength: 5000, description: 'اقتباس مفضل' },
        highlights: { type: 'string', maxLength: 50000, description: 'اقتباسات مميزة' },
      },
      required: ['title'],
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['title', 'author', 'type', 'status', 'totalPages', 'currentPage', 'rating', 'notes', 'favoriteQuote', 'highlights'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (typeof a.title !== 'string' || a.title.trim().length < 1 || a.title.length > 300) {
        return bad('title: العنوان مطلوب (1–300 محرف)')
      }
      if (a.author !== undefined && (typeof a.author !== 'string' || a.author.length > 200)) {
        return bad('author: حتى 200 محرف')
      }
      if (a.type !== undefined && !['book', 'article', 'course', 'video'].includes(String(a.type))) {
        return bad('type: قيمة غير صالحة — المتاح: book, article, course, video')
      }
      const STATUSES = ['reading', 'completed', 'want_to_read', 'want-to-read', 'paused']
      if (a.status !== undefined && !STATUSES.includes(String(a.status))) {
        return bad('status: قيمة غير صالحة — المتاح: reading, completed, want_to_read, paused')
      }
      for (const [f, min, max] of [['totalPages', 1, 1000000], ['currentPage', 0, 1000000], ['rating', 0, 5]] as [string, number, number][]) {
        if (a[f] !== undefined && (!Number.isInteger(a[f]) || (a[f] as number) < min || (a[f] as number) > max)) {
          return bad(`${f}: عدد صحيح بين ${min} و${max}`)
        }
      }
      if (a.currentPage !== undefined && a.totalPages !== undefined && (a.currentPage as number) > (a.totalPages as number)) {
        return bad('currentPage: لا يمكن أن تتجاوز totalPages')
      }
      for (const [f, max] of [['notes', 20000], ['favoriteQuote', 5000], ['highlights', 50000]] as [string, number][]) {
        if (a[f] !== undefined && (typeof a[f] !== 'string' || (a[f] as string).length > max)) {
          return bad(`${f}: نص حتى ${max} محرف`)
        }
      }
      return ok(a)
    },
    async execute(db, userId, args) {
      // «want-to-read» صيغة واجهة قديمة — المخزن الدائم want_to_read
      const status = args.status === 'want-to-read' ? 'want_to_read' : (args.status ?? 'reading')
      const today = todayCairo()
      let progress = 0
      if (args.totalPages && args.currentPage) {
        progress = round1((args.currentPage / args.totalPages) * 100)
      }
      const row: Record<string, unknown> = {
        id: crypto.randomUUID(),
        user_id: userId,
        title: args.title,
        author: args.author ?? null,
        type: args.type ?? 'book',
        status,
        current_page: args.currentPage ?? 0,
        total_pages: args.totalPages ?? null,
        notes: args.notes ?? null,
        highlights: args.highlights ?? null,
        favorite_quote: args.favoriteQuote ?? null,
        rating: args.rating ?? null,
        progress,
      }
      // البدء اليوم افتراضيًا عند القراءة/الإتمام (نفس عرف واجهة الموقع)
      if (status === 'reading' || status === 'completed') row.start_date = today
      if (status === 'completed') {
        row.end_date = today
        row.progress = 100
      }
      const book = (await db.upsert('books', row, 'id')) as any
      return {
        summary: `أُضيف «${args.title}» لمكتبة القراءة (${status === 'want_to_read' ? 'أريد قراءته' : status === 'reading' ? 'قيد القراءة' : status === 'completed' ? 'مكتمل' : 'متوقف'})`,
        created: true,
        book: {
          id: book?.id ?? row.id,
          title: args.title,
          status,
          progress: row.progress as number,
          totalPages: args.totalPages ?? null,
        },
      }
    },
  },

  // 44) ── update_book ─────────────────────────────
  {
    name: 'update_book',
    title: 'تحديث عنصر قراءة',
    kind: 'write',
    description: 'تحديث عنصر قراءة (الصفحة الحالية/الحالة/التقييم/الملاحظات/الاقتباسات). التقدم يُحسب تلقائيًا من الصفحات، وإتمام الحالة يختم تاريخ الإتمام اليوم — مثل «وصلت صفحة 120 في العادات الذرية».',
    inputSchema: {
      type: 'object',
      properties: {
        bookId: { type: 'string', minLength: 1, description: 'معرّف العنصر (مطلوب)' },
        status: {
          type: 'string',
          enum: ['reading', 'completed', 'want_to_read', 'want-to-read', 'paused'],
          description: 'الحالة الجديدة',
        },
        currentPage: { type: 'integer', minimum: 0, maximum: 1000000, description: 'الصفحة الحالية' },
        totalPages: { type: 'integer', minimum: 1, maximum: 1000000, description: 'إجمالي الصفحات' },
        rating: { type: 'integer', minimum: 0, maximum: 5, description: 'التقييم 0–5' },
        progress: { type: 'number', minimum: 0, maximum: 100, description: 'نسبة التقدم (تُحسب تلقائيًا عند غيابها)' },
        notes: { type: 'string', maxLength: 20000, description: 'ملاحظات' },
        highlights: { type: 'string', maxLength: 50000, description: 'اقتباسات مميزة' },
        favoriteQuote: { type: 'string', maxLength: 5000, description: 'اقتباس مفضل' },
      },
      required: ['bookId'],
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['bookId', 'status', 'currentPage', 'totalPages', 'rating', 'progress', 'notes', 'highlights', 'favoriteQuote'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (typeof a.bookId !== 'string' || a.bookId.length < 1) return bad('bookId: المعرّف مطلوب')
      const STATUSES = ['reading', 'completed', 'want_to_read', 'want-to-read', 'paused']
      if (a.status !== undefined && !STATUSES.includes(String(a.status))) {
        return bad('status: قيمة غير صالحة — المتاح: reading, completed, want_to_read, paused')
      }
      for (const [f, min, max] of [['currentPage', 0, 1000000], ['totalPages', 1, 1000000], ['rating', 0, 5]] as [string, number, number][]) {
        if (a[f] !== undefined && (!Number.isInteger(a[f]) || (a[f] as number) < min || (a[f] as number) > max)) {
          return bad(`${f}: عدد صحيح بين ${min} و${max}`)
        }
      }
      if (a.progress !== undefined && (typeof a.progress !== 'number' || (a.progress as number) < 0 || (a.progress as number) > 100)) {
        return bad('progress: رقم بين 0 و100')
      }
      for (const [f, max] of [['notes', 20000], ['highlights', 50000], ['favoriteQuote', 5000]] as [string, number][]) {
        if (a[f] !== undefined && (typeof a[f] !== 'string' || (a[f] as string).length > max)) {
          return bad(`${f}: نص حتى ${max} محرف`)
        }
      }
      return ok(a)
    },
    async execute(db, userId, args) {
      const current = (await db.maybeSingle('books', {
        select: 'id,title,status,current_page,total_pages,progress,start_date,end_date',
        filters: { id: `eq.${args.bookId}`, user_id: `eq.${userId}` },
      })) as any
      if (!current) throw new Error('الكتاب غير موجود أو لا تملكه')

      const patch: Record<string, unknown> = {}
      if (args.status !== undefined) patch.status = args.status === 'want-to-read' ? 'want_to_read' : args.status
      if (args.currentPage !== undefined) patch.current_page = args.currentPage
      if (args.totalPages !== undefined) patch.total_pages = args.totalPages
      if (args.rating !== undefined) patch.rating = args.rating
      if (args.progress !== undefined) patch.progress = args.progress
      if (args.notes !== undefined) patch.notes = args.notes
      if (args.highlights !== undefined) patch.highlights = args.highlights
      if (args.favoriteQuote !== undefined) patch.favorite_quote = args.favoriteQuote

      // التقدم الذكي من الصفحات عند غياب نسبة صريحة
      const nextPage = args.currentPage ?? current.current_page ?? 0
      const nextTotal = args.totalPages ?? current.total_pages ?? null
      if (args.progress === undefined && nextTotal && Number(nextTotal) > 0) {
        patch.progress = round1(Math.min(100, (Number(nextPage) / Number(nextTotal)) * 100))
      }
      const nextStatus = (patch.status as string) ?? current.status ?? 'reading'
      if (nextStatus === 'completed') {
        if (!current.end_date) patch.end_date = todayCairo()
        if (args.progress === undefined && patch.progress === undefined) patch.progress = 100
      }
      if (nextStatus === 'reading' && !current.start_date) patch.start_date = todayCairo()

      if (Object.keys(patch).length === 0) {
        throw new Error('لا حقول للتحديث — مرر حقلًا واحدًا على الأقل (status/currentPage/rating/…)')
      }
      await db.patch('books', { id: `eq.${args.bookId}`, user_id: `eq.${userId}` }, patch)
      const updated = (await db.maybeSingle('books', {
        filters: { id: `eq.${args.bookId}`, user_id: `eq.${userId}` },
      })) as any
      return {
        summary: `حُدّث «${updated?.title ?? current.title}» — ${nextStatus} (${round1(updated?.progress ?? 0)}%)`,
        updated: true,
        book: {
          id: args.bookId,
          status: nextStatus,
          progress: round1(updated?.progress ?? 0),
          currentPage: updated?.current_page ?? null,
          totalPages: updated?.total_pages ?? null,
        },
      }
    },
  },

  // 45) ── delete_book ─────────────────────────────
  {
    name: 'delete_book',
    title: 'حذف عنصر قراءة',
    kind: 'write',
    description: 'حذف عنصر نهائيًا من مكتبة القراءة. يتطلب confirm:true صراحةً — مثل: «امسحلي الكتاب ده خالص، متأكد».',
    inputSchema: {
      type: 'object',
      properties: {
        bookId: { type: 'string', minLength: 1, description: 'معرّف العنصر' },
        confirm: { type: 'boolean', description: 'يجب أن يكون true لتأكيد الحذف النهائي' },
      },
      required: ['bookId', 'confirm'],
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['bookId', 'confirm'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (typeof a.bookId !== 'string' || a.bookId.length < 1) return bad('bookId: المعرّف مطلوب')
      if (a.confirm !== true) return bad('confirm: الحذف النهائي يتطلب confirm:true صراحةً')
      return ok({ bookId: a.bookId, confirm: true })
    },
    async execute(db, userId, args) {
      const owned = await db.maybeSingle('books', {
        select: 'id,title',
        filters: { id: `eq.${args.bookId}`, user_id: `eq.${userId}` },
      })
      if (!owned) throw new Error('الكتاب غير موجود أو لا تملكه')
      await db.delete('books', { id: `eq.${args.bookId}`, user_id: `eq.${userId}` })
      return { summary: `حُذف «${(owned as any).title}» من المكتبة نهائيًا`, deleted: true }
    },
  },

  // 46) ── reading_summary ─────────────────────────────
  {
    name: 'reading_summary',
    title: 'ملخص القراءة',
    kind: 'read',
    description: 'إحصائيات مكتبة القراءة: المكتمل، الجاري، الصفحات المقروءة، متوسط التقييم، ما أُتم هذا العام — مثل «إيه أخبار قراءتي؟».',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    validate(args) {
      const r = rejectUnknown(args, [])
      if (r) return r
      return ok({})
    },
    async execute(db, userId) {
      const all = ((await db.select('books', {
        filters: { user_id: `eq.${userId}` },
        limit: 500,
      })) ?? []) as any[]
      const year = todayCairo().slice(0, 4)
      const completed = all.filter((b) => b.status === 'completed')
      const reading = all.filter((b) => b.status === 'reading')
      const rated = all.filter((b) => typeof b.rating === 'number' && b.rating > 0)
      const pagesRead = all.reduce((s, b) => s + Number(b.current_page ?? 0), 0)
      return {
        summary: `قرأت ${completed.length} عنصرًا كاملًا وتقرأ حاليًا ${reading.length}${pagesRead ? ` (${pagesRead} صفحة إجمالًا)` : ''}`,
        totalItems: all.length,
        completed: completed.length,
        completedThisYear: completed.filter((b) => String(b.end_date ?? '').startsWith(year)).length,
        reading: reading.length,
        wantToRead: all.filter((b) => b.status === 'want_to_read').length,
        paused: all.filter((b) => b.status === 'paused').length,
        pagesRead,
        averageRating: rated.length ? round1(rated.reduce((s, b) => s + Number(b.rating ?? 0), 0) / rated.length) : null,
        currentlyReading: reading.slice(0, 5).map((b) => ({
          id: b.id,
          title: b.title,
          progress: round1(b.progress ?? 0),
        })),
      }
    },
  },

  // ═══════════ v3.0 — التعلم (knowledge_items: learning-*) ═══════════
  // وحدة التعلم بالموقع تخزن أهدافها ودوراتها ومهاراتها وسجلها في
  // جدول knowledge_items المشترك: type يبدأ بـ learning- والحالة في
  // عمود tags كـ JSON — هذه الأدوات تتبع نفس العقد حرفيًا.

  // 47) ── list_learning ─────────────────────────────
  {
    name: 'list_learning',
    title: 'لوحة التعلم',
    kind: 'read',
    description: 'يعرض أهداف التعلم والدورات والمهارات وسجل جلسات التعلم مع دقائق التعلم — مثل «فين واصل في التعلم؟».',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    validate(args) {
      const r = rejectUnknown(args, [])
      if (r) return r
      return ok({})
    },
    async execute(db, userId) {
      const rows = ((await db.select('knowledge_items', {
        select: 'id,type,title,content,tags,created_at,updated_at',
        filters: { user_id: `eq.${userId}`, type: 'ilike.learning-%' },
        order: ['created_at.desc'],
        limit: 300,
      })) ?? []) as any[]
      const goals: any[] = []
      const courses: any[] = []
      const skills: any[] = []
      const logs: any[] = []
      for (const row of rows) {
        const meta = safeTags(row.tags)
        if (row.type === 'learning-goal') {
          goals.push({
            id: row.id,
            title: row.title,
            description: (row.content ?? '') || null,
            progress: typeof meta.progress === 'number' ? meta.progress : 0,
            status: typeof meta.status === 'string' ? meta.status : 'active',
          })
        } else if (row.type === 'learning-course') {
          courses.push({
            id: row.id,
            name: row.title,
            platform: typeof meta.platform === 'string' && meta.platform ? meta.platform : null,
            progress: typeof meta.progress === 'number' ? meta.progress : 0,
            status: typeof meta.status === 'string' ? meta.status : 'not_started',
            certificate: meta.certificate === true,
          })
        } else if (row.type === 'learning-skill') {
          skills.push({
            id: row.id,
            name: row.title,
            level: typeof meta.level === 'number' ? meta.level : 1,
          })
        } else if (row.type === 'learning-log') {
          logs.push({
            id: row.id,
            date: typeof meta.date === 'string' ? meta.date : String(row.created_at).slice(0, 10),
            minutes: typeof meta.minutes === 'number' ? meta.minutes : 0,
            excerpt: (row.content ?? '').slice(0, 140),
          })
        }
      }
      const weekAgo = lastNDates(todayCairo(), 8)[7]
      const totalMinutes = logs.reduce((s, l) => s + Number(l.minutes), 0)
      const weekMinutes = logs.filter((l) => l.date >= weekAgo).reduce((s, l) => s + Number(l.minutes), 0)
      const activeGoals = goals.filter((g) => g.status === 'active').length
      const activeCourses = courses.filter((c) => c.status !== 'completed').length
      return {
        summary: `التعلم: ${activeGoals} هدفًا نشطًا، ${activeCourses} دورة جارية، ${totalMinutes} دقيقة إجمالًا (${weekMinutes} هذا الأسبوع)`,
        goals,
        courses,
        skills,
        logs: logs.slice(0, 10),
        stats: { totalMinutes, weekMinutes, activeGoals, activeCourses },
      }
    },
  },

  // 48) ── create_learning_goal ─────────────────────────────
  {
    name: 'create_learning_goal',
    title: 'هدف تعلم جديد',
    kind: 'write',
    description: 'ينشئ هدف تعلم — مثل «سجللي هدف تعلم إتقان الإنجليزية بمستوى C1».',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 150, description: 'اسم الهدف (مطلوب)' },
        description: { type: 'string', maxLength: 2000, description: 'وصف الهدف' },
      },
      required: ['title'],
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['title', 'description'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (typeof a.title !== 'string' || a.title.trim().length < 1 || a.title.length > 150) {
        return bad('title: الاسم مطلوب (1–150 محرفًا)')
      }
      if (a.description !== undefined && (typeof a.description !== 'string' || a.description.length > 2000)) {
        return bad('description: حتى 2000 محرف')
      }
      return ok({ title: a.title, description: a.description as string | undefined })
    },
    async execute(db, userId, args) {
      const item = (await db.upsert('knowledge_items', {
        id: crypto.randomUUID(),
        user_id: userId,
        type: 'learning-goal',
        title: args.title,
        content: args.description ?? '',
        tags: JSON.stringify({ progress: 0, status: 'active' }),
      }, 'id')) as any
      return {
        summary: `أُنشئ هدف التعلم «${args.title}»`,
        created: true,
        goal: { id: item?.id ?? null, title: args.title, progress: 0, status: 'active' },
      }
    },
  },

  // 49) ── create_learning_course ─────────────────────────────
  {
    name: 'create_learning_course',
    title: 'دورة تعلم جديدة',
    kind: 'write',
    description: 'يضيف دورة/مصدر تعلم — مثل «ضيف دورة Deno من Udemmy».',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 150, description: 'اسم الدورة (مطلوب)' },
        platform: { type: 'string', maxLength: 100, description: 'المنصة (Udemy/Coursera/YouTube…)' },
      },
      required: ['name'],
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['name', 'platform'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (typeof a.name !== 'string' || a.name.trim().length < 1 || a.name.length > 150) {
        return bad('name: الاسم مطلوب (1–150 محرفًا)')
      }
      if (a.platform !== undefined && (typeof a.platform !== 'string' || a.platform.length > 100)) {
        return bad('platform: حتى 100 محرف')
      }
      return ok({ name: a.name, platform: a.platform as string | undefined })
    },
    async execute(db, userId, args) {
      const item = (await db.upsert('knowledge_items', {
        id: crypto.randomUUID(),
        user_id: userId,
        type: 'learning-course',
        title: args.name,
        content: '',
        tags: JSON.stringify({ platform: args.platform ?? '', progress: 0, status: 'not_started', certificate: false }),
      }, 'id')) as any
      return {
        summary: `أُضيفت الدورة «${args.name}»${args.platform ? ` (${args.platform})` : ''}`,
        created: true,
        course: { id: item?.id ?? null, name: args.name, platform: args.platform ?? null, progress: 0, status: 'not_started' },
      }
    },
  },

  // 50) ── create_learning_skill ─────────────────────────────
  {
    name: 'create_learning_skill',
    title: 'مهارة جديدة',
    kind: 'write',
    description: 'يضيف مهارة يتدرب عليها المستخدم بمستوى مبدئي — مثل «ضيف مهارة الكتابة الإبداعية مستوى 2».',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 100, description: 'اسم المهارة (مطلوب)' },
        level: { type: 'integer', minimum: 1, maximum: 10, description: 'المستوى المبدئي 1–10 (افتراضي 1)' },
      },
      required: ['name'],
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['name', 'level'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (typeof a.name !== 'string' || a.name.trim().length < 1 || a.name.length > 100) {
        return bad('name: الاسم مطلوب (1–100 محرف)')
      }
      if (a.level !== undefined && (!Number.isInteger(a.level) || (a.level as number) < 1 || (a.level as number) > 10)) {
        return bad('level: عدد صحيح بين 1 و10')
      }
      return ok({ name: a.name, level: (a.level ?? 1) as number })
    },
    async execute(db, userId, args) {
      const item = (await db.upsert('knowledge_items', {
        id: crypto.randomUUID(),
        user_id: userId,
        type: 'learning-skill',
        title: args.name,
        content: '',
        tags: JSON.stringify({ level: args.level, colorIdx: Math.floor(Math.random() * 8) }),
      }, 'id')) as any
      return {
        summary: `أُضيفت المهارة «${args.name}» (مستوى ${args.level})`,
        created: true,
        skill: { id: item?.id ?? null, name: args.name, level: args.level },
      }
    },
  },

  // 51) ── update_learning_progress ─────────────────────────────
  {
    name: 'update_learning_progress',
    title: 'تحديث تقدم التعلم',
    kind: 'write',
    description: 'يحدّث نسبة تقدم هدف تعلم أو دورة (0–100) — الحالة تُضبط تلقائيًا (not_started→in_progress→completed). مثل «وصلت 80% في دورة Deno».',
    inputSchema: {
      type: 'object',
      properties: {
        itemId: { type: 'string', minLength: 1, description: 'معرّف الهدف أو الدورة (من list_learning)' },
        progress: { type: 'integer', minimum: 0, maximum: 100, description: 'نسبة التقدم الجديدة (مطلوب)' },
      },
      required: ['itemId', 'progress'],
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['itemId', 'progress'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (typeof a.itemId !== 'string' || a.itemId.length < 1) return bad('itemId: المعرّف مطلوب')
      if (!Number.isInteger(a.progress) || (a.progress as number) < 0 || (a.progress as number) > 100) {
        return bad('progress: عدد صحيح بين 0 و100')
      }
      return ok({ itemId: a.itemId, progress: a.progress as number })
    },
    async execute(db, userId, args) {
      const row = (await db.maybeSingle('knowledge_items', {
        select: 'id,type,title,tags',
        filters: { id: `eq.${args.itemId}`, user_id: `eq.${userId}` },
      })) as any
      if (!row) throw new Error('العنصر غير موجود أو لا تملكه')
      if (row.type !== 'learning-goal' && row.type !== 'learning-course') {
        throw new Error('هذا العنصر ليس هدفًا أو دورة تعلم — استخدم update_knowledge_note للملاحظات')
      }
      const meta = safeTags(row.tags)
      const status =
        row.type === 'learning-goal'
          ? args.progress >= 100 ? 'completed' : 'active'
          : args.progress >= 100 ? 'completed' : args.progress > 0 ? 'in_progress' : 'not_started'
      // نحافظ على باقي مفاتيح الحالة (platform/certificate/…) كما هي
      const nextTags = JSON.stringify({ ...meta, progress: args.progress, status })
      await db.patch('knowledge_items', { id: `eq.${args.itemId}`, user_id: `eq.${userId}` }, { tags: nextTags })
      return {
        summary: `«${row.title}» — التقدم ${typeof meta.progress === 'number' ? meta.progress : 0} ← ${args.progress} (${status})`,
        updated: true,
        itemId: args.itemId,
        progress: args.progress,
        status,
      }
    },
  },

  // 52) ── log_learning_session ─────────────────────────────
  {
    name: 'log_learning_session',
    title: 'تسجيل جلسة تعلم',
    kind: 'write',
    description: 'يسجل ما تعلمه اليوم ومدته — مثل «سجللي جلسة تعلم 45 دقيقة راجعت فيها درس المتغيرات».',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', minLength: 1, maxLength: 2000, description: 'ما تعلمته (مطلوب)' },
        minutes: { type: 'integer', minimum: 0, maximum: 600, description: 'مدة الجلسة بالدقائق' },
        date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'التاريخ (افتراضي اليوم)' },
      },
      required: ['content'],
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['content', 'minutes', 'date'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (typeof a.content !== 'string' || a.content.trim().length < 1 || a.content.length > 2000) {
        return bad('content: ما تعلمته مطلوب (حتى 2000 محرف)')
      }
      if (a.minutes !== undefined && (!Number.isInteger(a.minutes) || (a.minutes as number) < 0 || (a.minutes as number) > 600)) {
        return bad('minutes: عدد صحيح بين 0 و600')
      }
      if (a.date !== undefined && !DATE_RE.test(String(a.date))) return bad('date: التاريخ يجب أن يكون YYYY-MM-DD')
      return ok({ content: a.content, minutes: a.minutes as number | undefined, date: a.date as string | undefined })
    },
    async execute(db, userId, args) {
      const date = args.date ?? todayCairo()
      const minutes = args.minutes ?? 0
      const item = (await db.upsert('knowledge_items', {
        id: crypto.randomUUID(),
        user_id: userId,
        type: 'learning-log',
        title: 'سجل تعلم',
        content: args.content,
        tags: JSON.stringify({ minutes, date }),
      }, 'id')) as any
      return {
        summary: `سُجلت جلسة تعلم بتاريخ ${date}${minutes ? ` (${minutes} دقيقة)` : ''}`,
        saved: true,
        log: { id: item?.id ?? null, date, minutes },
      }
    },
  },

  // 53) ── delete_learning_item ─────────────────────────────
  {
    name: 'delete_learning_item',
    title: 'حذف عنصر تعلم',
    kind: 'write',
    description: 'حذف هدف/دورة/مهارة/سجل تعلم نهائيًا. يتطلب confirm:true صراحةً — مثل: «امسحلي الدورة دي، متأكد».',
    inputSchema: {
      type: 'object',
      properties: {
        itemId: { type: 'string', minLength: 1, description: 'معرّف عنصر التعلم (من list_learning)' },
        confirm: { type: 'boolean', description: 'يجب أن يكون true لتأكيد الحذف النهائي' },
      },
      required: ['itemId', 'confirm'],
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['itemId', 'confirm'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (typeof a.itemId !== 'string' || a.itemId.length < 1) return bad('itemId: المعرّف مطلوب')
      if (a.confirm !== true) return bad('confirm: الحذف النهائي يتطلب confirm:true صراحةً')
      return ok({ itemId: a.itemId, confirm: true })
    },
    async execute(db, userId, args) {
      const row = (await db.maybeSingle('knowledge_items', {
        select: 'id,type,title',
        filters: { id: `eq.${args.itemId}`, user_id: `eq.${userId}` },
      })) as any
      if (!row) throw new Error('العنصر غير موجود أو لا تملكه')
      if (!String(row.type ?? '').startsWith('learning-')) {
        throw new Error('هذا العنصر ليس من وحدة التعلم — استخدم delete_knowledge_item لملاحظات الدماغ')
      }
      await db.delete('knowledge_items', { id: `eq.${args.itemId}`, user_id: `eq.${userId}` })
      return { summary: `حُذف «${row.title}» من وحدة التعلم نهائيًا`, deleted: true }
    },
  },

  // ═══════════ v3.0 — الدماغ الثاني (knowledge_items) ═══════════
  // «الدماغ الثاني»: ملاحظات وأفكار وموارد المستخدم. الجدول مشترك
  // مع وحدة التعلم والمالية — الأدوات هنا تلتزم قائمة BRAIN_TYPES
  // حصرًا (نفس عزل مسار /api/rise/knowledge بالموقع).

  // 54) ── list_knowledge ─────────────────────────────
  {
    name: 'list_knowledge',
    title: 'عرض الدماغ الثاني',
    kind: 'read',
    description: 'يعرض عناصر «الدماغ الثاني» (ملاحظات/أفكار/موارد/إشارات مرجعية/ملهمات) مع فلترة بالنوع أو المجلد أو المفضلة أو البحث في العناوين.',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['note', 'project', 'knowledge', 'idea', 'resource', 'bookmark', 'inspiration', 'research', 'design_ref'],
          description: 'تصفية بالنوع',
        },
        folder: { type: 'string', maxLength: 100, description: 'تصفية بالمجلد' },
        favorite: { type: 'boolean', description: 'المفضلة فقط' },
        query: { type: 'string', minLength: 2, maxLength: 100, description: 'بحث في العنوان' },
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'أقصى عدد (افتراضي 50)' },
      },
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['type', 'folder', 'favorite', 'query', 'limit'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (a.type !== undefined && !BRAIN_TYPES.includes(String(a.type) as never)) {
        return bad(`type: قيمة غير صالحة — المتاح: ${BRAIN_TYPES.join(', ')}`)
      }
      if (a.folder !== undefined && (typeof a.folder !== 'string' || a.folder.length > 100)) {
        return bad('folder: حتى 100 محرف')
      }
      if (a.favorite !== undefined && typeof a.favorite !== 'boolean') {
        return bad('favorite: قيمة منطقية (true/false)')
      }
      if (a.query !== undefined && (typeof a.query !== 'string' || a.query.trim().length < 2 || a.query.length > 100)) {
        return bad('query: نص البحث (2–100 محرف)')
      }
      if (a.limit !== undefined && (!Number.isInteger(a.limit) || (a.limit as number) < 1 || (a.limit as number) > 100)) {
        return bad('limit: عدد صحيح بين 1 و100')
      }
      return ok(a)
    },
    async execute(db, userId, args) {
      const filters: Record<string, string> = { user_id: `eq.${userId}` }
      if (args.folder) filters.folder = `eq.${args.folder}`
      if (args.favorite) filters.is_favorite = 'eq.true'
      if (args.query) filters.title = `ilike.%${args.query}%`
      const rows = ((await db.select('knowledge_items', {
        select: 'id,type,title,content,folder,tags,is_favorite,updated_at',
        filters,
        order: ['updated_at.desc'],
        limit: 200,
      })) ?? []) as any[]
      // عزل أنواع الدماغ عن صفوف وحدات أخرى (نفس منطق مسار الموقع)
      const brainSet = new Set<string>(BRAIN_TYPES)
      const filtered = rows.filter((r) => (args.type ? r.type === args.type : brainSet.has(String(r.type ?? ''))))
      const sliced = filtered.slice(0, args.limit ?? 50)
      return {
        summary: `${sliced.length} عنصر معرفة${args.folder ? ` (مجلد: ${args.folder})` : ''}${args.query ? ` — بحث: «${args.query}»` : ''}`,
        items: sliced.map((r) => ({
          id: r.id,
          type: r.type,
          title: r.title,
          excerpt: (r.content ?? '').slice(0, 140),
          folder: r.folder ?? null,
          tags: r.tags ?? null,
          isFavorite: r.is_favorite === true,
        })),
      }
    },
  },

  // 55) ── create_knowledge_note ─────────────────────────────
  {
    name: 'create_knowledge_note',
    title: 'حفظ ملاحظة',
    kind: 'write',
    description: 'يحفظ عنصرًا في الدماغ الثاني — مثل «احفظلي ملاحظة: فكرة تطبيق لتتبع القراءة، في مجلد الأفكار».',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 300, description: 'العنوان (مطلوب)' },
        content: { type: 'string', maxLength: 50000, description: 'المحتوى' },
        type: {
          type: 'string',
          enum: ['note', 'project', 'knowledge', 'idea', 'resource', 'bookmark', 'inspiration', 'research', 'design_ref'],
          description: 'النوع (افتراضي note)',
        },
        folder: { type: 'string', maxLength: 100, description: 'المجلد' },
        tags: { type: 'string', maxLength: 500, description: 'وسوم نصية' },
        source: { type: 'string', maxLength: 500, description: 'المصدر (رابط/كتاب…)' },
      },
      required: ['title'],
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['title', 'content', 'type', 'folder', 'tags', 'source'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (typeof a.title !== 'string' || a.title.trim().length < 1 || a.title.length > 300) {
        return bad('title: العنوان مطلوب (1–300 محرف)')
      }
      if (a.content !== undefined && (typeof a.content !== 'string' || a.content.length > 50000)) {
        return bad('content: حتى 50000 محرف')
      }
      if (a.type !== undefined && !BRAIN_TYPES.includes(String(a.type) as never)) {
        return bad(`type: قيمة غير صالحة — المتاح: ${BRAIN_TYPES.join(', ')}`)
      }
      for (const [f, max] of [['folder', 100], ['tags', 500], ['source', 500]] as [string, number][]) {
        if (a[f] !== undefined && (typeof a[f] !== 'string' || (a[f] as string).length > max)) {
          return bad(`${f}: حتى ${max} محرف`)
        }
      }
      return ok(a)
    },
    async execute(db, userId, args) {
      const item = (await db.upsert('knowledge_items', {
        id: crypto.randomUUID(),
        user_id: userId,
        type: args.type ?? 'note',
        title: args.title,
        content: args.content ?? '',
        folder: args.folder ?? null,
        tags: args.tags ?? null,
        source: args.source ?? null,
        is_favorite: false,
      }, 'id')) as any
      return {
        summary: `حُفظ «${args.title}» في الدماغ الثاني${args.folder ? ` (مجلد ${args.folder})` : ''}`,
        created: true,
        item: { id: item?.id ?? null, title: args.title, type: args.type ?? 'note' },
      }
    },
  },

  // 56) ── update_knowledge_note ─────────────────────────────
  {
    name: 'update_knowledge_note',
    title: 'تحديث ملاحظة',
    kind: 'write',
    description: 'تحديث عنصر في الدماغ الثاني (العنوان/المحتوى/المجلد/الوسوم/المصدر/المفضلة) — مثل «خلي الملاحظة دي مفضلة».',
    inputSchema: {
      type: 'object',
      properties: {
        itemId: { type: 'string', minLength: 1, description: 'معرّف العنصر (من list_knowledge)' },
        title: { type: 'string', minLength: 1, maxLength: 300, description: 'العنوان' },
        content: { type: 'string', maxLength: 50000, description: 'المحتوى' },
        folder: { type: 'string', maxLength: 100, description: 'المجلد' },
        tags: { type: 'string', maxLength: 500, description: 'وسوم نصية' },
        source: { type: 'string', maxLength: 500, description: 'المصدر' },
        isFavorite: { type: 'boolean', description: 'إضافة/إزالة من المفضلة' },
      },
      required: ['itemId'],
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['itemId', 'title', 'content', 'folder', 'tags', 'source', 'isFavorite'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (typeof a.itemId !== 'string' || a.itemId.length < 1) return bad('itemId: المعرّف مطلوب')
      if (a.title !== undefined && (typeof a.title !== 'string' || a.title.trim().length < 1 || a.title.length > 300)) {
        return bad('title: العنوان (1–300 محرف)')
      }
      if (a.content !== undefined && (typeof a.content !== 'string' || a.content.length > 50000)) {
        return bad('content: حتى 50000 محرف')
      }
      if (a.isFavorite !== undefined && typeof a.isFavorite !== 'boolean') {
        return bad('isFavorite: قيمة منطقية (true/false)')
      }
      for (const [f, max] of [['folder', 100], ['tags', 500], ['source', 500]] as [string, number][]) {
        if (a[f] !== undefined && (typeof a[f] !== 'string' || (a[f] as string).length > max)) {
          return bad(`${f}: حتى ${max} محرف`)
        }
      }
      return ok(a)
    },
    async execute(db, userId, args) {
      const row = (await db.maybeSingle('knowledge_items', {
        select: 'id,type,title',
        filters: { id: `eq.${args.itemId}`, user_id: `eq.${userId}` },
      })) as any
      if (!row) throw new Error('العنصر غير موجود أو لا تملكه')
      if (!BRAIN_TYPES.includes(String(row.type) as never)) {
        throw new Error('هذا العنصر من وحدة أخرى (تعلم/مالية) — استخدم أدوات وحدته')
      }
      const patch: Record<string, unknown> = {}
      if (args.title !== undefined) patch.title = args.title
      if (args.content !== undefined) patch.content = args.content
      if (args.folder !== undefined) patch.folder = args.folder
      if (args.tags !== undefined) patch.tags = args.tags
      if (args.source !== undefined) patch.source = args.source
      if (args.isFavorite !== undefined) patch.is_favorite = args.isFavorite
      if (Object.keys(patch).length === 0) {
        throw new Error('لا حقول للتحديث — مرر حقلًا واحدًا على الأقل')
      }
      await db.patch('knowledge_items', { id: `eq.${args.itemId}`, user_id: `eq.${userId}` }, patch)
      return {
        summary: `حُدّث «${args.title ?? row.title}» في الدماغ الثاني (${Object.keys(patch).join(', ')})`,
        updated: true,
        itemId: args.itemId,
      }
    },
  },

  // 57) ── delete_knowledge_item ─────────────────────────────
  {
    name: 'delete_knowledge_item',
    title: 'حذف ملاحظة',
    kind: 'write',
    description: 'حذف عنصر من الدماغ الثاني نهائيًا. يتطلب confirm:true صراحةً — مثل: «امسحلي الملاحظة دي خالص».',
    inputSchema: {
      type: 'object',
      properties: {
        itemId: { type: 'string', minLength: 1, description: 'معرّف العنصر (من list_knowledge)' },
        confirm: { type: 'boolean', description: 'يجب أن يكون true لتأكيد الحذف النهائي' },
      },
      required: ['itemId', 'confirm'],
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['itemId', 'confirm'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (typeof a.itemId !== 'string' || a.itemId.length < 1) return bad('itemId: المعرّف مطلوب')
      if (a.confirm !== true) return bad('confirm: الحذف النهائي يتطلب confirm:true صراحةً')
      return ok({ itemId: a.itemId, confirm: true })
    },
    async execute(db, userId, args) {
      const row = (await db.maybeSingle('knowledge_items', {
        select: 'id,type,title',
        filters: { id: `eq.${args.itemId}`, user_id: `eq.${userId}` },
      })) as any
      if (!row) throw new Error('العنصر غير موجود أو لا تملكه')
      if (!BRAIN_TYPES.includes(String(row.type) as never)) {
        throw new Error('هذا العنصر من وحدة أخرى (تعلم/مالية) — استخدم أدوات وحدته')
      }
      await db.delete('knowledge_items', { id: `eq.${args.itemId}`, user_id: `eq.${userId}` })
      return { summary: `حُذف «${row.title}» من الدماغ الثاني نهائيًا`, deleted: true }
    },
  },

  // ═══════════ v3.0 — المالية (finance_records) ═══════════
  // نفس عقد مسار الموقع: النوع يُخزن كما أرسله التطبيق — income/
  // expense/ادخار (وقد توجد قيم عربية قديمة دخل/مصروف نغطيها في
  // الفلترة والتجميع).

  // 58) ── list_finance_records ─────────────────────────────
  {
    name: 'list_finance_records',
    title: 'عرض الحركة المالية',
    kind: 'read',
    description: 'يعرض سجلات الدخل والمصروف والادخار مع مجاميعها — مثل «وريلي مصاريفي آخر أسبوع».',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['income', 'expense', 'savings'], description: 'تصفية بالنوع' },
        fromDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'من تاريخ (اختياري)' },
        toDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'إلى تاريخ (اختياري)' },
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'أقصى عدد (افتراضي 50)' },
      },
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['type', 'fromDate', 'toDate', 'limit'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (a.type !== undefined && !['income', 'expense', 'savings'].includes(String(a.type))) {
        return bad('type: قيمة غير صالحة — المتاح: income, expense, savings')
      }
      if (a.fromDate !== undefined && !DATE_RE.test(String(a.fromDate))) return bad('fromDate: YYYY-MM-DD')
      if (a.toDate !== undefined && !DATE_RE.test(String(a.toDate))) return bad('toDate: YYYY-MM-DD')
      if (a.limit !== undefined && (!Number.isInteger(a.limit) || (a.limit as number) < 1 || (a.limit as number) > 100)) {
        return bad('limit: عدد صحيح بين 1 و100')
      }
      return ok(a)
    },
    async execute(db, userId, args) {
      const filters: Record<string, string> = { user_id: `eq.${userId}` }
      // حد واحد في الاستعلام (gte أو lte) والحد الآخر يُفلتر في الكود
      if (args.fromDate) filters.date = `gte.${args.fromDate}`
      else if (args.toDate) filters.date = `lte.${args.toDate}`
      // النوع قد يكون مخزنًا عربيًا أو إنجليزيًا — or() تغطي القيمتين
      if (args.type === 'income') filters.or = '(type.eq.income,type.eq.دخل)'
      else if (args.type === 'expense') filters.or = '(type.eq.expense,type.eq.مصروف)'
      else if (args.type === 'savings') filters.type = 'eq.ادخار'
      const rows = ((await db.select('finance_records', {
        filters,
        order: ['date.desc'],
        limit: 200,
      })) ?? []) as any[]
      const inRange = rows.filter(
        (r) =>
          (!args.fromDate || String(r.date) >= args.fromDate) &&
          (!args.toDate || String(r.date) <= args.toDate),
      )
      const isIncome = (t: unknown) => t === 'income' || t === 'دخل'
      const isExpense = (t: unknown) => t === 'expense' || t === 'مصروف'
      const sum = (pred: (t: unknown) => boolean) =>
        round1(inRange.filter((r) => pred(r.type)).reduce((s, r) => s + Number(r.amount ?? 0), 0))
      const income = sum(isIncome)
      const expense = sum(isExpense)
      const savings = sum((t) => t === 'ادخار')
      const sliced = inRange.slice(0, args.limit ?? 50)
      return {
        summary: `${inRange.length} سجلًا — دخل ${income}، مصروف ${expense}${savings ? `، ادخار ${savings}` : ''}`,
        totals: { income, expense, savings },
        records: sliced.map((r) => ({
          id: r.id,
          type: isIncome(r.type) ? 'income' : isExpense(r.type) ? 'expense' : 'savings',
          category: r.category ?? null,
          description: r.description,
          amount: r.amount,
          date: String(r.date),
          recurring: r.recurring === true,
        })),
      }
    },
  },

  // 59) ── create_finance_record ─────────────────────────────
  {
    name: 'create_finance_record',
    title: 'تسجيل حركة مالية',
    kind: 'write',
    description: 'يسجل دخلًا أو مصروفًا أو ادخارًا — مثل «سجللي مصروف 150 جنيه تسوق النهاردة».',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['income', 'expense', 'savings', 'دخل', 'مصروف', 'ادخار'],
          description: 'النوع (مطلوب) — savings = ادخار',
        },
        amount: { type: 'number', exclusiveMinimum: 0, maximum: 999999999, description: 'المبلغ (مطلوب)' },
        description: { type: 'string', minLength: 1, maxLength: 500, description: 'الوصف (مطلوب)' },
        category: { type: 'string', maxLength: 100, description: 'التصنيف (تسوق/طعام/مواصلات…)' },
        date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'التاريخ (افتراضي اليوم)' },
        recurring: { type: 'boolean', description: 'حركة متكررة؟' },
      },
      required: ['type', 'amount', 'description'],
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['type', 'amount', 'description', 'category', 'date', 'recurring'])
      if (r) return r
      const a = args as Record<string, unknown>
      const TYPES = ['income', 'expense', 'savings', 'دخل', 'مصروف', 'ادخار']
      if (a.type === undefined || !TYPES.includes(String(a.type))) {
        return bad('type: النوع مطلوب — المتاح: income, expense, savings (أو دخل/مصروف/ادخار)')
      }
      if (typeof a.amount !== 'number' || !(a.amount > 0) || a.amount > 999999999) {
        return bad('amount: المبلغ مطلوب (رقم موجب حتى 999999999)')
      }
      if (typeof a.description !== 'string' || a.description.trim().length < 1 || a.description.length > 500) {
        return bad('description: الوصف مطلوب (حتى 500 محرف)')
      }
      if (a.category !== undefined && (typeof a.category !== 'string' || a.category.length > 100)) {
        return bad('category: حتى 100 محرف')
      }
      if (a.date !== undefined && !DATE_RE.test(String(a.date))) return bad('date: التاريخ يجب أن يكون YYYY-MM-DD')
      if (a.recurring !== undefined && typeof a.recurring !== 'boolean') {
        return bad('recurring: قيمة منطقية (true/false)')
      }
      return ok(a)
    },
    async execute(db, userId, args) {
      const date = args.date ?? todayCairo()
      // توحيد الكتابة العربية مع المخزن الإنجليزي (ادخار يبقى كما هو — عرف الموقع)
      const type =
        args.type === 'دخل' ? 'income' : args.type === 'مصروف' ? 'expense' : args.type === 'savings' ? 'ادخار' : args.type
      const record = (await db.upsert('finance_records', {
        id: crypto.randomUUID(),
        user_id: userId,
        type,
        category: args.category ?? null,
        description: args.description,
        amount: args.amount,
        date,
        recurring: args.recurring ?? false,
      }, 'id')) as any
      const label = type === 'income' ? 'دخل' : type === 'expense' ? 'مصروف' : 'ادخار'
      return {
        summary: `سُجل ${label} بمبلغ ${args.amount} — ${args.description} (${date})`,
        saved: true,
        record: { id: record?.id ?? null, type, amount: args.amount, date, description: args.description },
      }
    },
  },

  // 60) ── delete_finance_record ─────────────────────────────
  {
    name: 'delete_finance_record',
    title: 'حذف حركة مالية',
    kind: 'write',
    description: 'حذف سجل مالي نهائيًا. يتطلب confirm:true صراحةً — مثل: «امسحلي الحركة دي، متأكد».',
    inputSchema: {
      type: 'object',
      properties: {
        recordId: { type: 'string', minLength: 1, description: 'معرّف السجل (من list_finance_records)' },
        confirm: { type: 'boolean', description: 'يجب أن يكون true لتأكيد الحذف النهائي' },
      },
      required: ['recordId', 'confirm'],
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['recordId', 'confirm'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (typeof a.recordId !== 'string' || a.recordId.length < 1) return bad('recordId: المعرّف مطلوب')
      if (a.confirm !== true) return bad('confirm: الحذف النهائي يتطلب confirm:true صراحةً')
      return ok({ recordId: a.recordId, confirm: true })
    },
    async execute(db, userId, args) {
      const owned = await db.maybeSingle('finance_records', {
        select: 'id,description,amount',
        filters: { id: `eq.${args.recordId}`, user_id: `eq.${userId}` },
      })
      if (!owned) throw new Error('السجل غير موجود أو لا تملكه')
      await db.delete('finance_records', { id: `eq.${args.recordId}`, user_id: `eq.${userId}` })
      const rec = owned as any
      return { summary: `حُذف السجل «${rec.description}» (${rec.amount}) نهائيًا`, deleted: true }
    },
  },

  // 61) ── finance_summary ─────────────────────────────
  {
    name: 'finance_summary',
    title: 'ملخص مالي',
    kind: 'read',
    description: 'ملخص شهر كامل: الدخل والمصروف والادخار والصافي وأعلى تصنيفات المصروف — مثل «إيه وضعي المالي الشهر ده؟».',
    inputSchema: {
      type: 'object',
      properties: {
        month: { type: 'string', pattern: '^\\d{4}-\\d{2}$', description: 'الشهر YYYY-MM (افتراضي الشهر الحالي)' },
      },
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['month'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (a.month !== undefined && !/^\d{4}-\d{2}$/.test(String(a.month))) {
        return bad('month: الشهر بصيغة YYYY-MM')
      }
      return ok({ month: a.month as string | undefined })
    },
    async execute(db, userId, args) {
      const month = args.month ?? todayCairo().slice(0, 7)
      const [y, m] = month.split('-').map(Number)
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
      const endBound = `${month}-${String(lastDay).padStart(2, '0')}`
      const rows = ((await db.select('finance_records', {
        filters: { user_id: `eq.${userId}`, date: `gte.${month}-01` },
        order: ['date.asc'],
        limit: 500,
      })) ?? []) as any[]
      const inMonth = rows.filter((r) => String(r.date) <= endBound)
      const isIncome = (t: unknown) => t === 'income' || t === 'دخل'
      const isExpense = (t: unknown) => t === 'expense' || t === 'مصروف'
      const income = round1(inMonth.filter((r) => isIncome(r.type)).reduce((s, r) => s + Number(r.amount ?? 0), 0))
      const expense = round1(inMonth.filter((r) => isExpense(r.type)).reduce((s, r) => s + Number(r.amount ?? 0), 0))
      const savings = round1(inMonth.filter((r) => r.type === 'ادخار').reduce((s, r) => s + Number(r.amount ?? 0), 0))
      const byCategory: Record<string, number> = {}
      for (const r of inMonth) {
        if (isExpense(r.type) && r.category) {
          byCategory[r.category] = round1((byCategory[r.category] ?? 0) + Number(r.amount ?? 0))
        }
      }
      const topCategories = Object.entries(byCategory)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, total]) => ({ name, total }))
      return {
        summary: `${month}: دخل ${income} / مصروف ${expense}${savings ? ` / ادخار ${savings}` : ''} — الصافي ${round1(income - expense - savings)}`,
        month,
        totals: { income, expense, savings, net: round1(income - expense - savings) },
        recordsCount: inMonth.length,
        topExpenseCategories: topCategories,
      }
    },
  },

  // ═══════════ v3.0 — الصحة (health_logs) ═══════════
  // سجل يومي واحد لكل تاريخ (upsert على user_id,date — قيد التفرد
  // في هجرة 005). نفس حقول مسار الصحة بالموقع.

  // 62) ── get_health_log ─────────────────────────────
  {
    name: 'get_health_log',
    title: 'سجل صحة يوم',
    kind: 'read',
    description: 'قياسات يوم واحد (نوم/ماء/خطوات/سعرات/وزن/مزاج/طاقة/تمرين) — مثل «نمت قد إيه النهاردة؟».',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'التاريخ (افتراضي اليوم)' },
      },
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['date'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (a.date !== undefined && !DATE_RE.test(String(a.date))) return bad('date: التاريخ يجب أن يكون YYYY-MM-DD')
      return ok({ date: a.date as string | undefined })
    },
    async execute(db, userId, args) {
      const date = args.date ?? todayCairo()
      const row = (await db.maybeSingle('health_logs', {
        filters: { user_id: `eq.${userId}`, date: `eq.${date}` },
      })) as any
      if (!row) return { summary: `لا سجل صحي بتاريخ ${date}`, date, log: null }
      return {
        summary: `صحة ${date}: نوم ${row.sleep_hours ?? '—'} س، ماء ${row.water_glasses ?? '—'} كوب، خطوات ${row.steps ?? '—'}`,
        date,
        log: {
          sleepHours: row.sleep_hours ?? null,
          sleepQuality: row.sleep_quality ?? null,
          waterGlasses: row.water_glasses ?? null,
          steps: row.steps ?? null,
          calories: row.calories ?? null,
          weight: row.weight ?? null,
          mood: row.mood ?? null,
          energy: row.energy ?? null,
          exerciseType: row.exercise_type ?? null,
          exerciseMin: row.exercise_min ?? null,
          exerciseNote: row.exercise_note ?? null,
        },
      }
    },
  },

  // 63) ── log_health ─────────────────────────────
  {
    name: 'log_health',
    title: 'تسجيل قياسات صحية',
    kind: 'write',
    description: 'يسجل/يحدّث قياسات يوم (سجل واحد لكل يوم — التحديث يدمج الحقول المرسلة فقط) — مثل «سجللي إني شربت 6 كواب ومشيت 8000 خطوة النهاردة».',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'التاريخ (افتراضي اليوم)' },
        sleepHours: { type: 'number', minimum: 0, maximum: 24, description: 'ساعات النوم' },
        sleepQuality: { type: 'integer', minimum: 1, maximum: 5, description: 'جودة النوم 1–5' },
        waterGlasses: { type: 'integer', minimum: 0, maximum: 50, description: 'أكواب الماء' },
        steps: { type: 'integer', minimum: 0, maximum: 300000, description: 'الخطوات' },
        calories: { type: 'integer', minimum: 0, maximum: 50000, description: 'السعرات' },
        weight: { type: 'number', minimum: 20, maximum: 500, description: 'الوزن (كجم)' },
        mood: { type: 'integer', minimum: 1, maximum: 5, description: 'المزاج 1–5' },
        energy: { type: 'integer', minimum: 1, maximum: 5, description: 'الطاقة 1–5' },
        exerciseType: { type: 'string', maxLength: 100, description: 'نوع التمرين' },
        exerciseMin: { type: 'integer', minimum: 0, maximum: 600, description: 'دقائق التمرين' },
        exerciseNote: { type: 'string', maxLength: 1000, description: 'ملاحظات التمرين' },
      },
      additionalProperties: false,
    },
    validate(args) {
      const known = ['date', 'sleepHours', 'sleepQuality', 'waterGlasses', 'steps', 'calories', 'weight', 'mood', 'energy', 'exerciseType', 'exerciseMin', 'exerciseNote']
      const r = rejectUnknown(args, known)
      if (r) return r
      const a = args as Record<string, unknown>
      if (a.date !== undefined && !DATE_RE.test(String(a.date))) return bad('date: التاريخ يجب أن يكون YYYY-MM-DD')
      const NUM_RANGES: [string, number, number, boolean][] = [
        ['sleepHours', 0, 24, false],
        ['sleepQuality', 1, 5, true],
        ['waterGlasses', 0, 50, true],
        ['steps', 0, 300000, true],
        ['calories', 0, 50000, true],
        ['weight', 20, 500, false],
        ['mood', 1, 5, true],
        ['energy', 1, 5, true],
        ['exerciseMin', 0, 600, true],
      ]
      for (const [f, min, max, int] of NUM_RANGES) {
        if (a[f] !== undefined) {
          const v = a[f] as number
          const badNum = typeof v !== 'number' || v < min || v > max || (int && !Number.isInteger(v))
          if (badNum) return bad(`${f}: ${int ? 'عدد صحيح' : 'رقم'} بين ${min} و${max}`)
        }
      }
      for (const [f, max] of [['exerciseType', 100], ['exerciseNote', 1000]] as [string, number][]) {
        if (a[f] !== undefined && (typeof a[f] !== 'string' || (a[f] as string).length > max)) {
          return bad(`${f}: حتى ${max} محرف`)
        }
      }
      const { date: _d, ...fields } = a
      if (Object.values(fields).every((v) => v === undefined)) {
        return bad('مطلوب قياس واحد على الأقل (sleepHours/waterGlasses/steps/…)')
      }
      return ok(a)
    },
    async execute(db, userId, args) {
      const { date: dateArg, ...fields } = args as Record<string, unknown>
      const date = (dateArg as string) ?? todayCairo()
      const SNAKE: Record<string, string> = {
        sleepHours: 'sleep_hours',
        sleepQuality: 'sleep_quality',
        waterGlasses: 'water_glasses',
        exerciseType: 'exercise_type',
        exerciseMin: 'exercise_min',
        exerciseNote: 'exercise_note',
      }
      const snake: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(fields)) {
        if (v === undefined) continue
        snake[SNAKE[k] ?? k] = v
      }
      // upsert ذري على (user_id, date): قياس واحد لكل يوم والدمج جزئي
      const saved = (await db.upsert('health_logs', { user_id: userId, date, ...snake }, 'user_id,date')) as any
      return {
        summary: `حُفظ سجل صحة ${date} (${Object.keys(fields).join(', ')})`,
        saved: true,
        date,
        fields: Object.keys(fields),
        log: saved
          ? {
              sleepHours: saved.sleep_hours ?? null,
              waterGlasses: saved.water_glasses ?? null,
              steps: saved.steps ?? null,
            }
          : null,
      }
    },
  },

  // 64) ── list_health_logs ─────────────────────────────
  {
    name: 'list_health_logs',
    title: 'سجلات الصحة',
    kind: 'read',
    description: 'سجلات آخر أيام مع متوسطات (نوم/ماء/خطوات/مزاج/طاقة) — مثل «إيه متوسط نومي آخر أسبوع؟».',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'integer', minimum: 1, maximum: 30, description: 'عدد الأيام (افتراضي 7)' },
      },
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['days'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (a.days !== undefined && (!Number.isInteger(a.days) || (a.days as number) < 1 || (a.days as number) > 30)) {
        return bad('days: عدد صحيح بين 1 و30')
      }
      return ok({ days: a.days as number | undefined })
    },
    async execute(db, userId, args) {
      const n = args.days ?? 7
      const dates = lastNDates(todayCairo(), n)
      const rows = ((await db.select('health_logs', {
        filters: { user_id: `eq.${userId}`, date: `gte.${dates[dates.length - 1]}` },
        order: ['date.desc'],
        limit: 100,
      })) ?? []) as any[]
      const avg = (key: string): number | null => {
        const vals = rows.map((r) => Number(r[key])).filter((v) => Number.isFinite(v) && v > 0)
        return vals.length ? round1(vals.reduce((s, v) => s + v, 0) / vals.length) : null
      }
      return {
        summary: rows.length
          ? `${rows.length} سجل صحي — متوسط النوم ${avg('sleep_hours') ?? '—'} س، الماء ${avg('water_glasses') ?? '—'} كوب، الخطوات ${avg('steps') ?? '—'}`
          : `لا سجلات صحية في آخر ${n} أيام`,
        daysRequested: n,
        daysLogged: rows.length,
        averages: {
          sleepHours: avg('sleep_hours'),
          waterGlasses: avg('water_glasses'),
          steps: avg('steps'),
          mood: avg('mood'),
          energy: avg('energy'),
        },
        logs: rows.map((r) => ({
          date: String(r.date),
          sleepHours: r.sleep_hours ?? null,
          waterGlasses: r.water_glasses ?? null,
          steps: r.steps ?? null,
          mood: r.mood ?? null,
          energy: r.energy ?? null,
          exerciseMin: r.exercise_min ?? null,
        })),
      }
    },
  },

  // ═══════════ v3.0 — روتين الصباح (morning_logs) ═══════════

  // 65) ── get_morning_log ─────────────────────────────
  {
    name: 'get_morning_log',
    title: 'سجل صباح يوم',
    kind: 'read',
    description: 'درجة روتين الصباح ليوم وخطواته المكتملة — مثل «صباحي النهاردة كان إيه؟».',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'التاريخ (افتراضي اليوم)' },
      },
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['date'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (a.date !== undefined && !DATE_RE.test(String(a.date))) return bad('date: التاريخ يجب أن يكون YYYY-MM-DD')
      return ok({ date: a.date as string | undefined })
    },
    async execute(db, userId, args) {
      const date = args.date ?? todayCairo()
      const row = (await db.maybeSingle('morning_logs', {
        filters: { user_id: `eq.${userId}`, date: `eq.${date}` },
      })) as any
      if (!row) return { summary: `لا سجل صباح بتاريخ ${date}`, date, log: null }
      let completed: string[] = []
      try {
        const parsed: unknown = JSON.parse(row.completed_items ?? '[]')
        if (Array.isArray(parsed)) completed = parsed.map(String)
      } catch { /* completed_items تالف — نعرضه فارغًا */ }
      return {
        summary: `صباح ${date}: درجة ${round1(row.score ?? 0)} — ${completed.length}/${row.total_items ?? completed.length} خطوة`,
        date,
        log: {
          score: round1(row.score ?? 0),
          completedItems: completed,
          totalItems: row.total_items ?? null,
          startedAt: row.started_at ?? null,
          completedAt: row.completed_at ?? null,
        },
      }
    },
  },

  // 66) ── log_morning ─────────────────────────────
  {
    name: 'log_morning',
    title: 'تسجيل روتين الصباح',
    kind: 'write',
    description: 'يسجل/يحدّث روتين صباح يوم (الدرجة والخطوات المكتملة) — سجل واحد لكل يوم. مثل «سجللي إني خلصت 3 خطوات من روتين الصباح».',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'التاريخ (افتراضي اليوم)' },
        score: { type: 'number', minimum: 0, maximum: 100, description: 'درجة الصباح 0–100' },
        completedItems: {
          type: 'array',
          maxItems: 50,
          items: { type: 'string', maxLength: 100 },
          description: 'أسماء/معرّفات الخطوات المكتملة',
        },
        totalItems: { type: 'integer', minimum: 0, maximum: 100, description: 'إجمالي خطوات الروتين' },
        completed: { type: 'boolean', description: 'أُتم الروتين بالكامل؟ (يختم وقت الإتمام)' },
      },
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['date', 'score', 'completedItems', 'totalItems', 'completed'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (a.date !== undefined && !DATE_RE.test(String(a.date))) return bad('date: التاريخ يجب أن يكون YYYY-MM-DD')
      if (a.score !== undefined && (typeof a.score !== 'number' || (a.score as number) < 0 || (a.score as number) > 100)) {
        return bad('score: رقم بين 0 و100')
      }
      if (a.completedItems !== undefined) {
        if (!Array.isArray(a.completedItems) || (a.completedItems as unknown[]).length > 50) {
          return bad('completedItems: مصفوفة حتى 50 عنصرًا')
        }
        for (const it of a.completedItems as unknown[]) {
          if (typeof it !== 'string' || it.length > 100) {
            return bad('completedItems.?: نص حتى 100 محرف لكل خطوة')
          }
        }
      }
      if (a.totalItems !== undefined && (!Number.isInteger(a.totalItems) || (a.totalItems as number) < 0 || (a.totalItems as number) > 100)) {
        return bad('totalItems: عدد صحيح بين 0 و100')
      }
      if (a.completed !== undefined && typeof a.completed !== 'boolean') {
        return bad('completed: قيمة منطقية (true/false)')
      }
      const { date: _d, ...fields } = a
      if (Object.values(fields).every((v) => v === undefined)) {
        return bad('مطلوب حقل واحد على الأقل (score/completedItems/totalItems/completed)')
      }
      return ok(a)
    },
    async execute(db, userId, args) {
      const { date: dateArg, ...fields } = args as Record<string, unknown>
      const date = (dateArg as string) ?? todayCairo()
      // total_items بلا افتراضي في القاعدة — نضمنه عند إنشاء أول سجل
      const existing = await db.maybeSingle('morning_logs', {
        select: 'id,total_items',
        filters: { user_id: `eq.${userId}`, date: `eq.${date}` },
      })
      const row: Record<string, unknown> = { user_id: userId, date }
      if (fields.score !== undefined) row.score = fields.score
      if (fields.completedItems !== undefined) {
        row.completed_items = JSON.stringify(fields.completedItems)
      }
      if (fields.totalItems !== undefined) row.total_items = fields.totalItems
      if (!existing && fields.totalItems === undefined) {
        row.total_items = Array.isArray(fields.completedItems) ? (fields.completedItems as unknown[]).length : 0
      }
      if (fields.completed === true) row.completed_at = new Date().toISOString()
      const saved = (await db.upsert('morning_logs', row, 'user_id,date')) as any
      return {
        summary: `سُجل روتين الصباح ${date}${fields.score !== undefined ? ` بدرجة ${fields.score}` : ''}`,
        saved: true,
        date,
        log: saved
          ? {
              score: round1(saved.score ?? 0),
              totalItems: saved.total_items ?? null,
            }
          : null,
      }
    },
  },

  // ═══════════ v3.0 — التركيز (focus_sessions) ═══════════

  // 67) ── list_focus_sessions ─────────────────────────────
  {
    name: 'list_focus_sessions',
    title: 'جلسات التركيز',
    kind: 'read',
    description: 'آخر جلسات التركيز (بومودورو/عمل عميق) مع إجمالي الدقائق — مثل «ركزت قد إيه الأسبوع ده؟».',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 50, description: 'أقصى عدد جلسات (افتراضي 10)' },
        days: { type: 'integer', minimum: 1, maximum: 30, description: 'نطاق الإحصائيات بالأيام (افتراضي 7)' },
      },
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['limit', 'days'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (a.limit !== undefined && (!Number.isInteger(a.limit) || (a.limit as number) < 1 || (a.limit as number) > 50)) {
        return bad('limit: عدد صحيح بين 1 و50')
      }
      if (a.days !== undefined && (!Number.isInteger(a.days) || (a.days as number) < 1 || (a.days as number) > 30)) {
        return bad('days: عدد صحيح بين 1 و30')
      }
      return ok({ limit: a.limit as number | undefined, days: a.days as number | undefined })
    },
    async execute(db, userId, args) {
      const days = args.days ?? 7
      const since = new Date(Date.now() - (days - 1) * 86400000).toISOString()
      const rows = ((await db.select('focus_sessions', {
        filters: { user_id: `eq.${userId}`, started_at: `gte.${since}` },
        order: ['started_at.desc'],
        limit: args.limit ?? 10,
      })) ?? []) as any[]
      const totalActual = rows.reduce((s, r) => s + Number(r.actual_min ?? 0), 0)
      const totalPlanned = rows.reduce((s, r) => s + Number(r.duration ?? 0), 0)
      return {
        summary: rows.length
          ? `${rows.length} جلسة تركيز في آخر ${days} أيام — ${totalActual} دقيقة فعلية (المخطط ${totalPlanned})`
          : `لا جلسات تركيز في آخر ${days} أيام`,
        stats: { sessions: rows.length, actualMinutes: totalActual, plannedMinutes: totalPlanned },
        sessions: rows.map((r) => ({
          id: r.id,
          type: r.type ?? 'pomodoro',
          duration: r.duration,
          actualMin: r.actual_min ?? 0,
          completed: r.completed === true,
          taskId: r.task_id ?? null,
          notes: r.notes ?? null,
          startedAt: r.started_at,
        })),
      }
    },
  },

  // 68) ── log_focus_session ─────────────────────────────
  {
    name: 'log_focus_session',
    title: 'تسجيل جلسة تركيز',
    kind: 'write',
    description: 'يسجل جلسة تركيز منجزة (بومودورو/عمل عميق) — مثل «سجللي جلسة تركيز 50 دقيقة على مشروع الإطلاق».',
    inputSchema: {
      type: 'object',
      properties: {
        duration: { type: 'integer', minimum: 1, maximum: 480, description: 'المدة المخططة بالدقائق (مطلوب)' },
        actualMin: { type: 'integer', minimum: 0, maximum: 480, description: 'الدقائق الفعلية (افتراضي = duration)' },
        type: { type: 'string', maxLength: 50, description: 'النوع (افتراضي pomodoro)' },
        taskId: { type: 'string', description: 'معرّف مهمة مرتبطة (اختياري — يجب أن تملكها)' },
        notes: { type: 'string', maxLength: 1000, description: 'ملاحظات' },
        date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'تاريخ الجلسة (افتراضي اليوم)' },
        completed: { type: 'boolean', description: 'أُتمت الجلسة؟ (افتراضي true)' },
      },
      required: ['duration'],
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['duration', 'actualMin', 'type', 'taskId', 'notes', 'date', 'completed'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (!Number.isInteger(a.duration) || (a.duration as number) < 1 || (a.duration as number) > 480) {
        return bad('duration: عدد صحيح بين 1 و480')
      }
      if (a.actualMin !== undefined && (!Number.isInteger(a.actualMin) || (a.actualMin as number) < 0 || (a.actualMin as number) > 480)) {
        return bad('actualMin: عدد صحيح بين 0 و480')
      }
      if (a.type !== undefined && (typeof a.type !== 'string' || a.type.length > 50)) {
        return bad('type: حتى 50 محرف')
      }
      if (a.taskId !== undefined && typeof a.taskId !== 'string') return bad('taskId: نص')
      if (a.notes !== undefined && (typeof a.notes !== 'string' || a.notes.length > 1000)) {
        return bad('notes: حتى 1000 محرف')
      }
      if (a.date !== undefined && !DATE_RE.test(String(a.date))) return bad('date: التاريخ يجب أن يكون YYYY-MM-DD')
      if (a.completed !== undefined && typeof a.completed !== 'boolean') {
        return bad('completed: قيمة منطقية (true/false)')
      }
      return ok(a)
    },
    async execute(db, userId, args) {
      // ملكية المهمة المرتبطة تُفحص أولًا (نفس عقد مسار focus بالموقع)
      if (args.taskId) {
        const task = await db.maybeSingle('tasks', {
          select: 'id',
          filters: { id: `eq.${args.taskId}`, user_id: `eq.${userId}` },
        })
        if (!task) throw new Error('المهمة المرتبطة غير موجودة أو لا تملكها')
      }
      const completed = args.completed ?? true
      const now = new Date().toISOString()
      // تاريخ مخصص: نحافظ على وقت اليوم الحالي مع تاريخ الجلسة
      const startedAt = args.date
        ? `${args.date}T${now.slice(11, 19)}Z`
        : now
      const session = (await db.upsert('focus_sessions', {
        id: crypto.randomUUID(),
        user_id: userId,
        duration: args.duration,
        actual_min: args.actualMin ?? args.duration,
        type: args.type ?? 'pomodoro',
        notes: args.notes ?? null,
        task_id: args.taskId ?? null,
        completed,
        started_at: startedAt,
        completed_at: completed ? now : null,
      }, 'id')) as any
      return {
        summary: `سُجلت جلسة تركيز ${args.actualMin ?? args.duration} دقيقة${args.taskId ? ' (مرتبطة بمهمة)' : ''}`,
        saved: true,
        session: { id: session?.id ?? null, duration: args.duration, actualMin: args.actualMin ?? args.duration, completed, startedAt },
      }
    },
  },

  // ═══════════ v3.0 — الشغل (work_sessions) ═══════════

  // 69) ── list_work_sessions ─────────────────────────────
  {
    name: 'list_work_sessions',
    title: 'جلسات الشغل',
    kind: 'read',
    description: 'آخر جلسات الشغل الطويلة (المخطط/الفعلي/الراحة/جودة الجلسة) — مثل «جلسات الشغل بتاعتي آخر فترة».',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 50, description: 'أقصى عدد جلسات (افتراضي 10)' },
      },
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['limit'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (a.limit !== undefined && (!Number.isInteger(a.limit) || (a.limit as number) < 1 || (a.limit as number) > 50)) {
        return bad('limit: عدد صحيح بين 1 و50')
      }
      return ok({ limit: a.limit as number | undefined })
    },
    async execute(db, userId, args) {
      const rows = ((await db.select('work_sessions', {
        filters: { user_id: `eq.${userId}` },
        order: ['started_at.desc'],
        limit: args.limit ?? 10,
      })) ?? []) as any[]
      const totalActive = rows.reduce((s, r) => s + Number(r.active_min ?? 0), 0)
      const scored = rows.filter((r) => typeof r.quality_score === 'number')
      return {
        summary: rows.length
          ? `${rows.length} جلسة شغل — ${totalActive} دقيقة عمل فعلية${scored.length ? `، متوسط الجودة ${round1(scored.reduce((s, r) => s + Number(r.quality_score), 0) / scored.length)}` : ''}`
          : 'لا جلسات شغل بعد',
        stats: {
          sessions: rows.length,
          activeMinutes: totalActive,
          averageQuality: scored.length ? round1(scored.reduce((s, r) => s + Number(r.quality_score), 0) / scored.length) : null,
        },
        sessions: rows.map((r) => ({
          id: r.id,
          title: r.title ?? null,
          plannedMin: r.planned_min,
          activeMin: r.active_min ?? 0,
          breakMin: r.break_min ?? 0,
          tasksCompleted: r.tasks_completed ?? 0,
          qualityScore: r.quality_score ?? null,
          status: r.status ?? 'completed',
          startedAt: r.started_at,
        })),
      }
    },
  },

  // 70) ── log_work_session ─────────────────────────────
  {
    name: 'log_work_session',
    title: 'تسجيل جلسة شغل',
    kind: 'write',
    description: 'يسجل جلسة شغل (كتلة عمل طويلة بساعات) — مثل «سجللي جلسة شغل 4 ساعات كتبت فيها 3 مهام».',
    inputSchema: {
      type: 'object',
      properties: {
        plannedMin: { type: 'integer', minimum: 1, maximum: 600, description: 'المدة المخططة بالدقائق (مطلوب)' },
        title: { type: 'string', maxLength: 200, description: 'عنوان الجلسة' },
        activeMin: { type: 'integer', minimum: 0, maximum: 600, description: 'دقائق العمل الفعلية' },
        breakMin: { type: 'integer', minimum: 0, maximum: 600, description: 'دقائق الراحة' },
        tasksCompleted: { type: 'integer', minimum: 0, maximum: 200, description: 'عدد المهام المنجزة' },
        qualityScore: { type: 'integer', minimum: 0, maximum: 100, description: 'جودة الجلسة 0–100' },
        notes: { type: 'string', maxLength: 2000, description: 'ملاحظات' },
        status: {
          type: 'string',
          enum: ['active', 'paused', 'completed', 'cancelled'],
          description: 'الحالة (افتراضي completed)',
        },
        date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'تاريخ الجلسة (افتراضي اليوم)' },
      },
      required: ['plannedMin'],
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['plannedMin', 'title', 'activeMin', 'breakMin', 'tasksCompleted', 'qualityScore', 'notes', 'status', 'date'])
      if (r) return r
      const a = args as Record<string, unknown>
      for (const [f, min, max] of [['plannedMin', 1, 600], ['activeMin', 0, 600], ['breakMin', 0, 600], ['tasksCompleted', 0, 200], ['qualityScore', 0, 100]] as [string, number, number][]) {
        if (a[f] !== undefined && (!Number.isInteger(a[f]) || (a[f] as number) < min || (a[f] as number) > max)) {
          return bad(`${f}: عدد صحيح بين ${min} و${max}`)
        }
      }
      if (a.title !== undefined && (typeof a.title !== 'string' || a.title.length > 200)) {
        return bad('title: حتى 200 محرف')
      }
      if (a.notes !== undefined && (typeof a.notes !== 'string' || a.notes.length > 2000)) {
        return bad('notes: حتى 2000 محرف')
      }
      if (a.status !== undefined && !['active', 'paused', 'completed', 'cancelled'].includes(String(a.status))) {
        return bad('status: قيمة غير صالحة — المتاح: active, paused, completed, cancelled')
      }
      if (a.date !== undefined && !DATE_RE.test(String(a.date))) return bad('date: التاريخ يجب أن يكون YYYY-MM-DD')
      return ok(a)
    },
    async execute(db, userId, args) {
      const now = new Date().toISOString()
      const status = args.status ?? 'completed'
      const startedAt = args.date ? `${args.date}T${now.slice(11, 19)}Z` : now
      const session = (await db.upsert('work_sessions', {
        id: crypto.randomUUID(),
        user_id: userId,
        title: args.title ?? null,
        planned_min: args.plannedMin,
        active_min: args.activeMin ?? 0,
        break_min: args.breakMin ?? 0,
        breaks_count: 0,
        tasks_completed: args.tasksCompleted ?? 0,
        quality_score: args.qualityScore ?? null,
        notes: args.notes ?? null,
        status,
        started_at: startedAt,
        completed_at: status === 'completed' || status === 'cancelled' ? now : null,
      }, 'id')) as any
      return {
        summary: `سُجلت جلسة شغل ${args.plannedMin} دقيقة مخططة${args.activeMin !== undefined ? ` (${args.activeMin} فعلية)` : ''}`,
        saved: true,
        session: { id: session?.id ?? null, plannedMin: args.plannedMin, activeMin: args.activeMin ?? 0, status },
      }
    },
  },

  // ═══════════ v3.0 — المخطط اليومي (planner_items) ═══════════
  // القراءة عبر get_today_plan الموجودة أعلاه — هنا الكتابة فقط:
  // إنشاء بترتيب تسلسلي داخل قسمه (نفس منطق مسار planner).

  // 71) ── create_planner_item ─────────────────────────────
  {
    name: 'create_planner_item',
    title: 'إضافة بند للمخطط',
    kind: 'write',
    description: 'يضيف بندًا لكتل اليوم (صباح/ظهر/مساء/شغل) في نهاية قسمه — مثل «ضيف بند «مراجعة الدرس» الصبح 8».',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 200, description: 'نص البند (مطلوب)' },
        section: { type: 'string', minLength: 1, maxLength: 30, description: 'القسم: morning/noon/evening/work (مطلوب)' },
        date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'التاريخ (افتراضي اليوم)' },
        time: { type: 'string', description: 'الوقت HH:MM (اختياري)' },
      },
      required: ['title', 'section'],
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['title', 'section', 'date', 'time'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (typeof a.title !== 'string' || a.title.trim().length < 1 || a.title.length > 200) {
        return bad('title: نص البند مطلوب (1–200 محرف)')
      }
      if (typeof a.section !== 'string' || a.section.trim().length < 1 || a.section.length > 30) {
        return bad('section: القسم مطلوب (morning/noon/evening/work)')
      }
      if (a.date !== undefined && !DATE_RE.test(String(a.date))) return bad('date: التاريخ يجب أن يكون YYYY-MM-DD')
      if (a.time !== undefined && !TIME_RE.test(String(a.time))) return bad('time: الوقت يجب أن يكون HH:MM')
      return ok(a)
    },
    async execute(db, userId, args) {
      const date = args.date ?? todayCairo()
      // الترتيب التسلسلي داخل القسم (نفس حساب مسار planner بالموقع)
      const existing = ((await db.select('planner_items', {
        select: 'id,section,"order"',
        filters: { user_id: `eq.${userId}`, date: `eq.${date}` },
      })) ?? []) as any[]
      const maxOrder = existing
        .filter((i) => i.section === args.section)
        .reduce((max, i) => Math.max(max, Number(i.order ?? 0)), -1)
      const item = (await db.upsert('planner_items', {
        id: crypto.randomUUID(),
        user_id: userId,
        date,
        section: args.section,
        time: args.time ?? null,
        title: args.title,
        completed: false,
        order: maxOrder + 1,
      }, 'id')) as any
      return {
        summary: `أُضيف «${args.title}» لقسم ${args.section} في مخطط ${date}`,
        created: true,
        item: { id: item?.id ?? null, title: args.title, section: args.section, date, order: maxOrder + 1 },
      }
    },
  },

  // 72) ── update_planner_item ─────────────────────────────
  {
    name: 'update_planner_item',
    title: 'تحديث بند مخطط',
    kind: 'write',
    description: 'تحديث بند في المخطط (النص/الوقت/الإتمام/القسم/الترتيب) — مثل «خلصت بند المخطط ده».',
    inputSchema: {
      type: 'object',
      properties: {
        itemId: { type: 'string', minLength: 1, description: 'معرّف البند (من get_today_plan)' },
        title: { type: 'string', minLength: 1, maxLength: 200, description: 'النص' },
        completed: { type: 'boolean', description: 'تم الإنجاز؟' },
        time: { type: 'string', description: 'الوقت HH:MM' },
        section: { type: 'string', minLength: 1, maxLength: 30, description: 'القسم' },
        date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'التاريخ' },
        order: { type: 'integer', minimum: 0, maximum: 99, description: 'الترتيب داخل القسم' },
      },
      required: ['itemId'],
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['itemId', 'title', 'completed', 'time', 'section', 'date', 'order'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (typeof a.itemId !== 'string' || a.itemId.length < 1) return bad('itemId: المعرّف مطلوب')
      if (a.title !== undefined && (typeof a.title !== 'string' || a.title.trim().length < 1 || a.title.length > 200)) {
        return bad('title: النص (1–200 محرف)')
      }
      if (a.completed !== undefined && typeof a.completed !== 'boolean') {
        return bad('completed: قيمة منطقية (true/false)')
      }
      if (a.time !== undefined && !TIME_RE.test(String(a.time))) return bad('time: الوقت يجب أن يكون HH:MM')
      if (a.section !== undefined && (typeof a.section !== 'string' || a.section.trim().length < 1 || a.section.length > 30)) {
        return bad('section: القسم (حتى 30 محرف)')
      }
      if (a.date !== undefined && !DATE_RE.test(String(a.date))) return bad('date: التاريخ يجب أن يكون YYYY-MM-DD')
      if (a.order !== undefined && (!Number.isInteger(a.order) || (a.order as number) < 0 || (a.order as number) > 99)) {
        return bad('order: عدد صحيح بين 0 و99')
      }
      return ok(a)
    },
    async execute(db, userId, args) {
      const owned = await db.maybeSingle('planner_items', {
        select: 'id,title',
        filters: { id: `eq.${args.itemId}`, user_id: `eq.${userId}` },
      })
      if (!owned) throw new Error('البند غير موجود أو لا تملكه')
      const patch: Record<string, unknown> = {}
      if (args.title !== undefined) patch.title = args.title
      if (args.completed !== undefined) patch.completed = args.completed
      if (args.time !== undefined) patch.time = args.time
      if (args.section !== undefined) patch.section = args.section
      if (args.date !== undefined) patch.date = args.date
      if (args.order !== undefined) patch.order = args.order
      if (Object.keys(patch).length === 0) {
        throw new Error('لا حقول للتحديث — مرر حقلًا واحدًا على الأقل')
      }
      await db.patch('planner_items', { id: `eq.${args.itemId}`, user_id: `eq.${userId}` }, patch)
      return {
        summary: `حُدّث بند المخطط «${args.title ?? (owned as any).title}»${args.completed !== undefined ? ` (${args.completed ? 'منجز' : 'غير منجز'})` : ''}`,
        updated: true,
        itemId: args.itemId,
      }
    },
  },

  // 73) ── delete_planner_item ─────────────────────────────
  {
    name: 'delete_planner_item',
    title: 'حذف بند مخطط',
    kind: 'write',
    description: 'حذف بند من المخطط نهائيًا. يتطلب confirm:true صراحةً.',
    inputSchema: {
      type: 'object',
      properties: {
        itemId: { type: 'string', minLength: 1, description: 'معرّف البند' },
        confirm: { type: 'boolean', description: 'يجب أن يكون true لتأكيد الحذف النهائي' },
      },
      required: ['itemId', 'confirm'],
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['itemId', 'confirm'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (typeof a.itemId !== 'string' || a.itemId.length < 1) return bad('itemId: المعرّف مطلوب')
      if (a.confirm !== true) return bad('confirm: الحذف النهائي يتطلب confirm:true صراحةً')
      return ok({ itemId: a.itemId, confirm: true })
    },
    async execute(db, userId, args) {
      const owned = await db.maybeSingle('planner_items', {
        select: 'id,title',
        filters: { id: `eq.${args.itemId}`, user_id: `eq.${userId}` },
      })
      if (!owned) throw new Error('البند غير موجود أو لا تملكه')
      await db.delete('planner_items', { id: `eq.${args.itemId}`, user_id: `eq.${userId}` })
      return { summary: `حُذف «${(owned as any).title}» من المخطط نهائيًا`, deleted: true }
    },
  },

  // ═══════════ v3.0 — المشاريع (projects) ═══════════
  // القراءة عبر list_projects الموجودة — هنا بقية العمليات.

  // 74) ── create_project ─────────────────────────────
  {
    name: 'create_project',
    title: 'إنشاء مشروع',
    kind: 'write',
    description: 'ينشئ مشروعًا جديدًا لتنظيم المهام — مثل «اعملي مشروع «تطوير الموقع» باللون الأزرق».',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 200, description: 'اسم المشروع (مطلوب)' },
        description: { type: 'string', maxLength: 2000, description: 'الوصف' },
        color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$', description: 'اللون بصيغة #RRGGBB (افتراضي #059669)' },
        icon: { type: 'string', maxLength: 50, description: 'أيقونة' },
      },
      required: ['name'],
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['name', 'description', 'color', 'icon'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (typeof a.name !== 'string' || a.name.trim().length < 1 || a.name.length > 200) {
        return bad('name: الاسم مطلوب (1–200 محرف)')
      }
      if (a.description !== undefined && (typeof a.description !== 'string' || a.description.length > 2000)) {
        return bad('description: حتى 2000 محرف')
      }
      if (a.color !== undefined && (typeof a.color !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(a.color))) {
        return bad('color: لون بصيغة #RRGGBB مثل #059669')
      }
      if (a.icon !== undefined && (typeof a.icon !== 'string' || a.icon.length > 50)) {
        return bad('icon: حتى 50 محرف')
      }
      return ok(a)
    },
    async execute(db, userId, args) {
      const project = (await db.upsert('projects', {
        id: crypto.randomUUID(),
        user_id: userId,
        name: args.name,
        description: args.description ?? null,
        color: args.color ?? '#059669',
        icon: args.icon ?? null,
        progress: 0,
        status: 'active',
      }, 'id')) as any
      return {
        summary: `أُنشئ المشروع «${args.name}»`,
        created: true,
        project: { id: project?.id ?? null, name: args.name, status: 'active', progress: 0 },
      }
    },
  },

  // 75) ── update_project ─────────────────────────────
  {
    name: 'update_project',
    title: 'تحديث مشروع',
    kind: 'write',
    description: 'تحديث مشروع (الاسم/الوصف/اللون/التقدم/الحالة) — مثل «المشروع ده خلص، حدّث تقدمه 100».',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', minLength: 1, description: 'معرّف المشروع (من list_projects)' },
        name: { type: 'string', minLength: 1, maxLength: 200, description: 'الاسم' },
        description: { type: 'string', maxLength: 2000, description: 'الوصف' },
        color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$', description: 'اللون #RRGGBB' },
        icon: { type: 'string', maxLength: 50, description: 'أيقونة' },
        progress: { type: 'number', minimum: 0, maximum: 100, description: 'نسبة التقدم' },
        status: { type: 'string', maxLength: 30, description: 'الحالة (active/completed/archived…)' },
      },
      required: ['projectId'],
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['projectId', 'name', 'description', 'color', 'icon', 'progress', 'status'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (typeof a.projectId !== 'string' || a.projectId.length < 1) return bad('projectId: المعرّف مطلوب')
      if (a.name !== undefined && (typeof a.name !== 'string' || a.name.trim().length < 1 || a.name.length > 200)) {
        return bad('name: الاسم (1–200 محرف)')
      }
      if (a.description !== undefined && (typeof a.description !== 'string' || a.description.length > 2000)) {
        return bad('description: حتى 2000 محرف')
      }
      if (a.color !== undefined && (typeof a.color !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(a.color))) {
        return bad('color: لون بصيغة #RRGGBB')
      }
      if (a.icon !== undefined && (typeof a.icon !== 'string' || a.icon.length > 50)) {
        return bad('icon: حتى 50 محرف')
      }
      if (a.progress !== undefined && (typeof a.progress !== 'number' || (a.progress as number) < 0 || (a.progress as number) > 100)) {
        return bad('progress: رقم بين 0 و100')
      }
      if (a.status !== undefined && (typeof a.status !== 'string' || a.status.length > 30)) {
        return bad('status: حتى 30 محرف')
      }
      return ok(a)
    },
    async execute(db, userId, args) {
      const owned = await db.maybeSingle('projects', {
        select: 'id,name',
        filters: { id: `eq.${args.projectId}`, user_id: `eq.${userId}` },
      })
      if (!owned) throw new Error('المشروع غير موجود أو لا تملكه')
      const patch: Record<string, unknown> = {}
      if (args.name !== undefined) patch.name = args.name
      if (args.description !== undefined) patch.description = args.description
      if (args.color !== undefined) patch.color = args.color
      if (args.icon !== undefined) patch.icon = args.icon
      if (args.progress !== undefined) patch.progress = args.progress
      if (args.status !== undefined) patch.status = args.status
      if (Object.keys(patch).length === 0) {
        throw new Error('لا حقول للتحديث — مرر حقلًا واحدًا على الأقل')
      }
      await db.patch('projects', { id: `eq.${args.projectId}`, user_id: `eq.${userId}` }, patch)
      return {
        summary: `حُدّث المشروع «${args.name ?? (owned as any).name}» (${Object.keys(patch).join(', ')})`,
        updated: true,
        projectId: args.projectId,
      }
    },
  },

  // 76) ── delete_project ─────────────────────────────
  {
    name: 'delete_project',
    title: 'حذف مشروع',
    kind: 'write',
    description: 'حذف مشروع نهائيًا — المهام المرتبطة لا تُحذف بل تنفصل عنه (تظل في قائمتك). يتطلب confirm:true.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', minLength: 1, description: 'معرّف المشروع' },
        confirm: { type: 'boolean', description: 'يجب أن يكون true لتأكيد الحذف النهائي' },
      },
      required: ['projectId', 'confirm'],
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['projectId', 'confirm'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (typeof a.projectId !== 'string' || a.projectId.length < 1) return bad('projectId: المعرّف مطلوب')
      if (a.confirm !== true) return bad('confirm: الحذف النهائي يتطلب confirm:true صراحةً')
      return ok({ projectId: a.projectId, confirm: true })
    },
    async execute(db, userId, args) {
      const owned = await db.maybeSingle('projects', {
        select: 'id,name',
        filters: { id: `eq.${args.projectId}`, user_id: `eq.${userId}` },
      })
      if (!owned) throw new Error('المشروع غير موجود أو لا تملكه')
      await db.delete('projects', { id: `eq.${args.projectId}`, user_id: `eq.${userId}` })
      return {
        summary: `حُذف المشروع «${(owned as any).name}» نهائيًا — مهامه تنفصل عنه وتبقى في قائمتك`,
        deleted: true,
      }
    },
  },

  // ═══════════ v3.0 — الإنجازات والإعدادات ═══════════

  // 77) ── list_achievements ─────────────────────────────
  {
    name: 'list_achievements',
    title: 'وسامي الإنجازات',
    kind: 'read',
    description: 'كل وسوم الإنجازات التي كسبها المستخدم (الاسم/الأيقونة/الوصف/تاريخ الكسب) — مثل «إيه الإنجازات اللي جبتها؟».',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    validate(args) {
      const r = rejectUnknown(args, [])
      if (r) return r
      return ok({})
    },
    async execute(db, userId) {
      const rows = ((await db.select('user_achievements', {
        filters: { user_id: `eq.${userId}` },
        order: ['earned_at.desc'],
        limit: 100,
      })) ?? []) as any[]
      return {
        summary: rows.length ? `${rows.length} وسام إنجاز` : 'لا وسوم بعد — استمر!',
        count: rows.length,
        badges: rows.map((b) => ({
          id: b.badge_id,
          name: b.badge_name,
          icon: b.badge_icon ?? null,
          description: b.badge_desc ?? null,
          earnedAt: b.earned_at,
        })),
      }
    },
  },

  // 78) ── get_settings ─────────────────────────────
  {
    name: 'get_settings',
    title: 'إعداداتي',
    kind: 'read',
    description: 'إعدادات المستخدم (وقت الصحيان والنوم، مدة التركيز، أهداف الماء والقراءة والتمرين الأسبوعية).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    validate(args) {
      const r = rejectUnknown(args, [])
      if (r) return r
      return ok({})
    },
    async execute(db, userId) {
      const row = (await db.maybeSingle('user_settings', {
        filters: { user_id: `eq.${userId}` },
      })) as any
      if (!row) {
        return {
          summary: 'الإعدادات بالقيم الافتراضية (لم تُخصَّص بعد)',
          settings: {
            theme: 'system', language: 'ar', wakeUpTime: '06:00', sleepTime: '22:00',
            focusDuration: 50, dailyWaterGoal: 8, dailyReadingGoal: 30, weeklyExerciseGoal: 5, notifications: true,
          },
          customized: false,
        }
      }
      return {
        summary: `الصحيان ${row.wake_up_time ?? '06:00'}، النوم ${row.sleep_time ?? '22:00'}، تركيز ${row.focus_duration ?? 50} دقيقة`,
        settings: {
          theme: row.theme ?? 'system',
          language: row.language ?? 'ar',
          wakeUpTime: row.wake_up_time ?? '06:00',
          sleepTime: row.sleep_time ?? '22:00',
          focusDuration: row.focus_duration ?? 50,
          dailyWaterGoal: row.daily_water_goal ?? 8,
          dailyReadingGoal: row.daily_reading_goal ?? 30,
          weeklyExerciseGoal: row.weekly_exercise_goal ?? 5,
          notifications: row.notifications !== false,
        },
        customized: true,
      }
    },
  },

  // 79) ── update_settings ─────────────────────────────
  {
    name: 'update_settings',
    title: 'تحديث الإعدادات',
    kind: 'write',
    description: 'يحدّث إعدادات المستخدم (وقت الصحيان/النوم، مدة التركيز، أهداف الماء/القراءة/التمرين) — مثل «ظبطلي وقت الصحيان 5:30».',
    inputSchema: {
      type: 'object',
      properties: {
        wakeUpTime: { type: 'string', description: 'وقت الصحيان HH:MM' },
        sleepTime: { type: 'string', description: 'وقت النوم HH:MM' },
        focusDuration: { type: 'integer', minimum: 5, maximum: 180, description: 'مدة التركيز بالدقائق' },
        dailyWaterGoal: { type: 'integer', minimum: 1, maximum: 50, description: 'هدف أكواب الماء اليومي' },
        dailyReadingGoal: { type: 'integer', minimum: 1, maximum: 600, description: 'هدف دقائق القراءة اليومي' },
        weeklyExerciseGoal: { type: 'integer', minimum: 1, maximum: 21, description: 'هدف مرات التمرين الأسبوعي' },
        notifications: { type: 'boolean', description: 'تفعيل الإشعارات' },
        theme: { type: 'string', enum: ['system', 'light', 'dark'], description: 'المظهر' },
        language: { type: 'string', enum: ['ar', 'en'], description: 'اللغة' },
      },
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['wakeUpTime', 'sleepTime', 'focusDuration', 'dailyWaterGoal', 'dailyReadingGoal', 'weeklyExerciseGoal', 'notifications', 'theme', 'language'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (a.wakeUpTime !== undefined && !TIME_RE.test(String(a.wakeUpTime))) return bad('wakeUpTime: الوقت يجب أن يكون HH:MM')
      if (a.sleepTime !== undefined && !TIME_RE.test(String(a.sleepTime))) return bad('sleepTime: الوقت يجب أن يكون HH:MM')
      for (const [f, min, max] of [['focusDuration', 5, 180], ['dailyWaterGoal', 1, 50], ['dailyReadingGoal', 1, 600], ['weeklyExerciseGoal', 1, 21]] as [string, number, number][]) {
        if (a[f] !== undefined && (!Number.isInteger(a[f]) || (a[f] as number) < min || (a[f] as number) > max)) {
          return bad(`${f}: عدد صحيح بين ${min} و${max}`)
        }
      }
      if (a.notifications !== undefined && typeof a.notifications !== 'boolean') {
        return bad('notifications: قيمة منطقية (true/false)')
      }
      if (a.theme !== undefined && !['system', 'light', 'dark'].includes(String(a.theme))) {
        return bad('theme: المتاح: system, light, dark')
      }
      if (a.language !== undefined && !['ar', 'en'].includes(String(a.language))) {
        return bad('language: المتاح: ar, en')
      }
      if (Object.values(a).every((v) => v === undefined)) {
        return bad('مطلوب إعداد واحد على الأقل')
      }
      return ok(a)
    },
    async execute(db, userId, args) {
      const existing = await db.maybeSingle('user_settings', {
        select: 'id',
        filters: { user_id: `eq.${userId}` },
      })
      const SNAKE: Record<string, string> = {
        wakeUpTime: 'wake_up_time',
        sleepTime: 'sleep_time',
        focusDuration: 'focus_duration',
        dailyWaterGoal: 'daily_water_goal',
        dailyReadingGoal: 'daily_reading_goal',
        weeklyExerciseGoal: 'weekly_exercise_goal',
      }
      const snake: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(args as Record<string, unknown>)) {
        if (v === undefined) continue
        snake[SNAKE[k] ?? k] = v
      }
      if (existing) {
        await db.patch('user_settings', { user_id: `eq.${userId}` }, snake)
      } else {
        // أول تخصيص: نزرع صف الإعدادات كاملًا بالقيم الافتراضية + التعديلات
        await db.upsert('user_settings', {
          id: crypto.randomUUID(),
          user_id: userId,
          theme: snake.theme ?? 'system',
          language: snake.language ?? 'ar',
          wake_up_time: snake.wake_up_time ?? '06:00',
          sleep_time: snake.sleep_time ?? '22:00',
          focus_duration: snake.focus_duration ?? 50,
          daily_water_goal: snake.daily_water_goal ?? 8,
          daily_reading_goal: snake.daily_reading_goal ?? 30,
          weekly_exercise_goal: snake.weekly_exercise_goal ?? 5,
          notifications: snake.notifications ?? true,
          ...snake,
        }, 'id')
      }
      return {
        summary: `حُدّثت الإعدادات (${Object.keys(args as Record<string, unknown>).join(', ')})`,
        updated: true,
        fields: Object.keys(args as Record<string, unknown>),
      }
    },
  },

  // ═══════════ v3.1 — المراجعات (أسبوعية/شهرية) + نقاط الخبرة ═══════════
  // وحدتا المراجعة بالموقع تخزنان إجابات المستخدم في المتصفح فقط
  // (localStorage) فلا يصل إليها الخادم — لكن أرقامهما التلقائية
  // تُحسب من المهام والتركيز والعادات واليوميات بتقويم القاهرة.
  // هذه الأدوات تجمع نفس الأرقام فيحصل العميل على صورة المراجعة
  // كاملة ويستطيع هو أو المستخدم ملء الإجابات فوقها.

  // 80) ── get_weekly_review ─────────────────────────────
  {
    name: 'get_weekly_review',
    title: 'المراجعة الأسبوعية',
    kind: 'read',
    description:
      'أرقام الأسبوع كما تملؤها المراجعة الأسبوعية بالموقع تلقائيًا: المهام المكتملة، ساعات التركيز، تسجيلات العادات، اليوميات، ومتوسط درجة الإنتاجية — مثال: «راجع أسبوعي» أو «إيه أرقام الأسبوع اللي فات؟».',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'integer', minimum: 3, maximum: 14, description: 'عدد أيام النافذة (افتراضي 7)' },
        end_date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'آخر يوم في النافذة (افتراضي اليوم بتقويم القاهرة)' },
      },
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['days', 'end_date'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (a.days !== undefined && (!Number.isInteger(a.days) || (a.days as number) < 3 || (a.days as number) > 14)) {
        return bad('days: عدد صحيح بين 3 و14')
      }
      if (a.end_date !== undefined && !isValidDay(String(a.end_date))) {
        return bad('end_date: التاريخ يجب أن يكون YYYY-MM-DD صالحًا تقويميًا')
      }
      return ok({ days: a.days as number | undefined, end_date: a.end_date as string | undefined })
    },
    async execute(db, userId, args) {
      const days = args.days ?? 7
      const dates = windowDates(args.end_date ?? todayCairo(), days)
      const s = await collectReviewStats(db, userId, dates)
      return {
        summary:
          `آخر ${days} أيام (حتى ${dates[dates.length - 1]}): ${s.completedTasks} مهمة مكتملة، ` +
          `${round1(s.focusMin / 60)} ساعة تركيز، ${s.habitCheckIns} تسجيل عادة، ` +
          `${s.journalEntries} يومية${s.averageScore !== null ? `، متوسط الدرجة ${s.averageScore}` : ''} ` +
          `— نشِط ${s.activeDays} من ${days} أيام`,
        range: { from: dates[0], to: dates[dates.length - 1], days },
        completedTasks: s.completedTasks,
        focusHours: round1(s.focusMin / 60),
        focusMinutes: s.focusMin,
        habitCheckIns: s.habitCheckIns,
        journalEntries: s.journalEntries,
        morningLogsCount: s.morningLogsCount,
        averageScore: s.averageScore,
        activeDays: s.activeDays,
        byDay: s.byDay,
      }
    },
  },

  // 81) ── get_monthly_review ─────────────────────────────
  {
    name: 'get_monthly_review',
    title: 'المراجعة الشهرية',
    kind: 'read',
    description:
      'صورة الشهر كاملة كما تقرؤها المراجعة الشهرية بالموقع: الإنجاز مجمّعًا أسبوعًا بأسبوع، انتظام العادات واليوميات، اتجاه درجة الإنتاجية (تحسّن أم تراجع)، وأفضل يوم — مثال: «قوّم شهري» أو «إيه أخبار الشهر ده؟».',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'integer', minimum: 14, maximum: 31, description: 'عدد أيام النافذة (افتراضي 30)' },
        end_date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'آخر يوم في النافذة (افتراضي اليوم بتقويم القاهرة)' },
      },
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['days', 'end_date'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (a.days !== undefined && (!Number.isInteger(a.days) || (a.days as number) < 14 || (a.days as number) > 31)) {
        return bad('days: عدد صحيح بين 14 و31')
      }
      if (a.end_date !== undefined && !isValidDay(String(a.end_date))) {
        return bad('end_date: التاريخ يجب أن يكون YYYY-MM-DD صالحًا تقويميًا')
      }
      return ok({ days: a.days as number | undefined, end_date: a.end_date as string | undefined })
    },
    async execute(db, userId, args) {
      const days = args.days ?? 30
      const dates = windowDates(args.end_date ?? todayCairo(), days)
      const s = await collectReviewStats(db, userId, dates)

      // تقسيم أسابيع (أقدم → أحدث) — نفس ما تعرضه المراجعة الشهرية
      const weeks: Array<{
        from: string; to: string; tasksDone: number; focusHours: number
        habitCheckIns: number; journalEntries: number; averageScore: number | null
      }> = []
      for (let i = 0; i < dates.length; i += 7) {
        const chunk = s.byDay.slice(i, Math.min(i + 7, dates.length))
        const cs = chunk.filter((x) => x.score !== null)
        weeks.push({
          from: dates[i],
          to: dates[Math.min(i + 6, dates.length - 1)],
          tasksDone: chunk.reduce((n, x) => n + x.tasksDone, 0),
          focusHours: round1(chunk.reduce((n, x) => n + x.focusMin, 0) / 60),
          habitCheckIns: chunk.reduce((n, x) => n + x.habitCheckIns, 0),
          journalEntries: chunk.filter((x) => x.journaled).length,
          averageScore: cs.length ? round1(cs.reduce((a, b) => a + (b.score ?? 0), 0) / cs.length) : null,
        })
      }

      // الاتجاه: متوسط النصف الأقدم مقابل الأحدث
      const half = Math.floor(dates.length / 2)
      const avgOf = (xs: ReviewDay[]): number | null => {
        const sc = xs.filter((x) => x.score !== null)
        return sc.length ? round1(sc.reduce((a, b) => a + (b.score ?? 0), 0) / sc.length) : null
      }
      const firstHalfAvg = avgOf(s.byDay.slice(0, half))
      const lastHalfAvg = avgOf(s.byDay.slice(half))
      const trend =
        firstHalfAvg !== null && lastHalfAvg !== null
          ? lastHalfAvg > firstHalfAvg ? 'improving' : lastHalfAvg < firstHalfAvg ? 'declining' : 'steady'
          : null

      // أفضل يوم: أكبر نشاط (مهمة = 3 نقاط، تسجيل عادة = 2، كل 30 دقيقة تركيز = 1)
      let bestDay: ReviewDay | null = null
      let bestScore = 0
      for (const d of s.byDay) {
        const v = d.tasksDone * 3 + d.habitCheckIns * 2 + d.focusMin / 30
        if (v > bestScore) { bestScore = v; bestDay = d }
      }

      const habitConsistency = days > 0 ? Math.round((s.byDay.filter((x) => x.habitCheckIns > 0).length / days) * 100) : 0

      const trendAr = trend === 'improving' ? 'تحسّن' : trend === 'declining' ? 'تراجع' : trend === 'steady' ? 'ثبات' : 'غير معروف'
      return {
        summary:
          `آخر ${days} يومًا: ${s.completedTasks} مهمة، ${round1(s.focusMin / 60)} ساعة تركيز، ` +
          `انتظام عادات ${habitConsistency}%، ${s.journalEntries} يومية، متوسط الدرجة ` +
          `${s.averageScore ?? '—'} (اتجاه: ${trendAr}) — نشِط ${s.activeDays} من ${days} يومًا`,
        range: { from: dates[0], to: dates[dates.length - 1], days },
        completedTasks: s.completedTasks,
        focusHours: round1(s.focusMin / 60),
        focusMinutes: s.focusMin,
        habitCheckIns: s.habitCheckIns,
        habitConsistency,
        journalEntries: s.journalEntries,
        morningLogsCount: s.morningLogsCount,
        averageScore: s.averageScore,
        firstHalfAverageScore: firstHalfAvg,
        lastHalfAverageScore: lastHalfAvg,
        trend,
        activeDays: s.activeDays,
        bestDay: bestDay
          ? {
              date: bestDay.date,
              tasksDone: bestDay.tasksDone,
              focusMinutes: bestDay.focusMin,
              habitCheckIns: bestDay.habitCheckIns,
              score: bestDay.score,
            }
          : null,
        weeks,
        byDay: s.byDay,
      }
    },
  },

  // 82) ── list_xp_awards ─────────────────────────────
  {
    name: 'list_xp_awards',
    title: 'سجل نقاط الخبرة',
    kind: 'read',
    description:
      'نقاط الخبرة المكتسبة: الإجمالي التراكمي وعدد المكافآت + آخر المكافآت بمصادرها (مهمة/عادة/تركيز/قراءة…) — مثال: «إيه آخر حاجة كسبت فيها نقاط؟» أو «جمّع لي نقاطي كلها».',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'عدد المكافآت الأخيرة (افتراضي 20)' },
      },
      additionalProperties: false,
    },
    validate(args) {
      const r = rejectUnknown(args, ['limit'])
      if (r) return r
      const a = args as Record<string, unknown>
      if (a.limit !== undefined && (!Number.isInteger(a.limit) || (a.limit as number) < 1 || (a.limit as number) > 100)) {
        return bad('limit: عدد صحيح بين 1 و100')
      }
      return ok({ limit: a.limit as number | undefined })
    },
    async execute(db, userId, args) {
      const limit = args.limit ?? 20
      const [allRows, recentRows] = await Promise.all([
        db.select('xp_awards', {
          select: 'amount',
          filters: { user_id: `eq.${userId}` },
          limit: 10000,
        }),
        db.select('xp_awards', {
          select: 'reason,amount,created_at',
          filters: { user_id: `eq.${userId}` },
          order: ['created_at.desc'],
          limit,
        }),
      ])
      const all = (allRows ?? []) as any[]
      const totalXp = all.reduce((sum, r) => sum + Number(r.amount ?? 0), 0)
      const recent = ((recentRows ?? []) as any[]).map((r) => ({
        reason: String(r.reason ?? ''),
        label: xpReasonLabel(String(r.reason ?? '')),
        amount: Number(r.amount ?? 0),
        createdAt: r.created_at,
      }))
      return {
        summary: `إجمالي الخبرة المكتسبة: ${totalXp} نقطة عبر ${all.length} مكافأة`,
        totalXp,
        awardsCount: all.length,
        truncated: all.length >= 10000,
        recent,
      }
    },
  },

]

/** خريطة بحث سريعة بالاسم */
export const MCP_TOOLS_BY_NAME = new Map(MCP_TOOLS.map((t) => [t.name, t]))

/** معرّفات المهام كسلاسل (لعامل in.()) */
function taskIdsOf(taskList: { id: unknown }[]): string[] {
  return taskList.map((t) => String(t.id))
}

/** الشكل المعلن للعميل في tools/list — بلا دوال التنفيذ */
export function publicToolsList() {
  return MCP_TOOLS.map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: t.inputSchema,
    annotations: {
      readOnlyHint: t.kind === 'read',
      openWorldHint: false,
    },
  }))
}
