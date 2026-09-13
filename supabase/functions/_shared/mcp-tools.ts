// ============================================================
// mcp-tools.ts — سجل أدوات MCP لخادم Supabase Edge (v2.0 موسّعة)
//
// النسخة الأصيلة (Deno) الثمانية محفوظة حرفيًا كما هي، وأضيفت
// عليها أدوات تغطي بقية الموقع — كلها على مخطط قاعدة البيانات
// الإنتاجي الفعلي (tasks/journals/goals/habits/habit_logs/
// notifications/community_*/user_subscriptions/usage_daily/
// profiles/user_api_keys):
//   • كل استعلام يفرض ملكية user_id صراحة (العميل يعمل بمفتاح
//     service_role الذي يتجاوز RLS — الملكية مسؤولية ندائنا)
//   • الكتابة الذرية عبر نفس دوال التطبيق: create/update_
//     task_with_subtasks و create_goal_with_milestones
//   • الحذف متاح صراحةً لمالك المفتاح لكنه يتطلب confirm:true
//   • المجتمع: إعجاب/تعليق عبر الجداول الأصلية (العدادات
//     تُحدَّث بالتريجرات الجاهزة trg_community_recount)
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
      const filters: Record<string, string> = { user_id: `eq.${userId}` }
      if (args.fromDate) filters.date = `gte.${args.fromDate}`
      if (args.toDate) filters.date = `lte.${args.toDate}`
      const rows = ((await db.select('journals', {
        select: 'id,date,content,mood,energy,created_at',
        filters,
        order: ['date.desc'],
        limit: args.limit ?? 10,
      })) ?? []) as any[]
      return {
        summary: `${rows.length} مدخل يوميات`,
        entries: rows.map((j) => ({
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
    description: 'بحث واحد في مهامك وأهدافك وعاداتك ويومياتك (العناوين والنصوص) — مثل «دوّر على كلمة تقرير».',
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
      const [tasks, goals, habits, journals] = await Promise.all([
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
      ])
      const total = tasks.length + goals.length + habits.length + journals.length
      return {
        summary: total ? `وُجدت ${total} نتيجة لكلمة «${q}»` : `لا نتائج لكلمة «${q}»`,
        tasks: (tasks as any[]).map((t) => ({ id: t.id, title: t.title, status: t.status })),
        goals: (goals as any[]).map((g) => ({ id: g.id, title: g.title, status: g.status })),
        habits: (habits as any[]).map((h) => ({ id: h.id, name: h.name, frequency: h.frequency })),
        journalEntries: (journals as any[]).map((j) => ({
          date: String(j.date),
          excerpt: (j.content ?? '').slice(0, 120),
        })),
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
