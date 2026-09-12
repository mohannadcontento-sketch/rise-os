// ============================================================
// mcp-tools.ts — سجل أدوات MCP لخادم Supabase Edge (المرحلة 10-ب)
//
// هذه النسخة الأصيلة (Deno) من src/lib/mcp/tools.ts — نفس
// الأدوات الثمانية، نفس الـJSON Schema، نفس رسائل الأخطاء،
// لكن التنفيذ مباشر عبر PostgREST بدل مستودعات التطبيق:
//   • لا أي عملية حذف («منع destructive actions افتراضيًا»)
//   • كل استعلام يفرض ملكية user_id صراحة (العميل يعمل بمفتاح
//     service_role الذي يتجاوز RLS — الملكية مسؤولية ندائنا)
//   • الكتابة الذرية عبر نفس دوال التطبيق: create/update_
//     task_with_subtasks (تفحص is_trusted_user_context بنفسها)
//   • اليوميات: كتابة فقط + حماية استبدال (overwrite صريح)
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
