import { z } from 'zod'
import { data } from '@/lib/data'
import { getToday } from '@/lib/rise-utils'
import { bustAggregateCache } from '@/lib/aggregate-cache'

// ============================================================
// mcp/tools.ts — سجل أدوات MCP (المرحلة 10 — MCP للـMax)
//
// «أوج ليس AI داخليًا»: هذه أدوات يستدعيها عميل AI خارجي
// (Claude / ChatGPT connector / Cursor…) عبر بروتوكول MCP
// لقراءة بيانات المستخدم وتنفيذ إجراءات آمنة نيابة عنه.
//
// قواعد التصميم من الخطة:
//   • أول 8 أدوات ذات «قيمة واضحة» (5–10 مطلوبة) — كلها حول
//     الحلقة اليومية الأساسية: المهام/العادات/المخطط/الدرجة/
//     اليوميات. لا أدوات حذف أو تدمير إطلاقًا («منع destructive
//     actions افتراضيًا») — قراءة + إنشاء + إكمال فقط.
//   • كل أداة: inputSchema بصيغة JSON Schema (يُعلن في
//     tools/list للعميل) + مدقق zod strict (يطرد أي حقل غير
//     معروف — «Validation لكل arguments») + تنفيذ يعيد كائنًا
//     بملخص عربي. الاثنان متطابقان يدويًا — عدّل الاثنين معًا.
//   • «عدم كشف أسرار أو مفاتيح داخل tool response»: الأدوات
//     تُرجع بيانات المستخدم نفسه من مستودعاته المعزولة فقط —
//     لا مفاتيح ولا إعدادات خادم ولا بيانات مستخدمين آخرين.
//   • اليوميات: كتابة فقط في النسخة الأولى (لا أداة قراءة —
//     بيانات شديدة الخصوصية) + حماية استبدال: لو يوجد مدخل
//     لنفس اليوم لا نكتب فوقه إلا بـ overwrite صريح من العميل.
//   • هوية الملكية: كل استدعاء مستودع يمرر userId الصادر من
//     مفتاح Bearer (يُحل خادميًا) — المستودعات تفرض الملكية
//     في كل استعلام/كتابة، فلا مجال لعبور الحسابات.
// ============================================================

// ── القسم: الأنواع ─────────────────────

export interface McpTool {
  /** اسم الأداة بالإنجليزية (أسماء بروتوكول MCP — حروف/شرطات سفلية فقط) */
  name: string
  /** العرض العربي (لواجهة الإعدادات) */
  title: string
  /** read = قراءة فقط، write = يغيّر حالة — يحدد التدقيق والحدود */
  kind: 'read' | 'write'
  /** وصف عربي للعميل الخارجي — يظهر له في tools/list */
  description: string
  /** JSON Schema للمدخلات (بروتوكول MCP — تُعلن كما هي) */
  inputSchema: Record<string, unknown>
  /** مدقق zod — strict: أي حقل غير معروف يُرفض */
  validate: (args: unknown) => { ok: true; value: any } | { ok: false; error: string }
  /** التنفيذ — userId من المفتاح، args بعد التحقق */
  execute: (userId: string, args: any) => Promise<unknown>
}

/** أول خطأ تحقق بصيغة مفيدة (مسار zod → رسالة واحدة) */
function firstIssue(result: z.ZodError<any>): string {
  const i = result.issues[0]
  const path = i.path?.length ? `${i.path.join('.')}: ` : ''
  return `${path}${i.message}`
}

/** مخطط تاريخ yyyy-MM-dd مشترك */
const DateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'التاريخ يجب أن يكون بصيغة YYYY-MM-DD')

/** توليد آخر N أيام (بما فيها اليوم) كسلاسل تاريخ */
function lastNDates(today: string, n: number): string[] {
  const out: string[] = []
  const base = new Date(`${today}T12:00:00Z`) // ظهيرة UTC: حساب آمن بلا انزياح
  for (let i = 0; i < n; i++) {
    const d = new Date(base.getTime() - i * 86400000)
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

/** حساب streak: أطول سلسلة أيام مكتملة تنتهي اليوم (أو أمس) */
function habitStreak(logs: { date: string; completed: boolean }[], today: string): number {
  const done = new Set(logs.filter((l) => l.completed).map((l) => l.date))
  // السلسلة تبدأ من اليوم؛ لو اليوم لم يُسجَّل بعد نبدأ من أمس (عادة
  // ليست «كسرًا» — اليوم لسه شغال)
  let cursor = done.has(today) ? today : lastNDates(today, 2)[1]
  if (!done.has(cursor)) return 0
  let streak = 0
  while (done.has(cursor)) {
    streak += 1
    cursor = lastNDates(cursor, 2)[1]
  }
  return streak
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
    validate: (args) => {
      const s = z
        .object({
          status: z.enum(['todo', 'in_progress', 'done']).optional(),
          limit: z.number().int().min(1).max(100).optional(),
        })
        .strict()
      const r = s.safeParse(args)
      return r.success ? { ok: true, value: r.data } : { ok: false, error: firstIssue(r.error) }
    },
    async execute(userId, args) {
      const all = await data.tasks.list(userId)
      const filtered = args.status ? all.filter((t: any) => t.status === args.status) : all
      const sliced = filtered.slice(0, args.limit ?? 50)
      return {
        summary: `عُرضت ${sliced.length} مهمة من أصل ${all.length}${args.status ? ` (حالة: ${args.status})` : ''}`,
        tasks: sliced.map((t: any) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          priority: t.priority ?? null,
          dueDate: t.dueDate ?? null,
          project: t.project?.name ?? null,
          subtasksTotal: Array.isArray(t.subtasks) ? t.subtasks.length : 0,
          subtasksDone: Array.isArray(t.subtasks)
            ? t.subtasks.filter((s: any) => s.completed).length
            : 0,
        })),
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
    validate: (args) => {
      const s = z
        .object({
          title: z.string().min(1, 'العنوان مطلوب').max(200),
          priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
          dueDate: DateStr.optional(),
          dueTime: z.string().regex(/^\d{2}:\d{2}$/, 'الوقت يجب أن يكون HH:MM').optional(),
          description: z.string().max(2000).optional(),
          estimatedMin: z.number().int().min(0).max(600).optional(),
          subtasks: z
            .array(z.object({ title: z.string().min(1).max(100) }).strict())
            .max(10)
            .optional(),
        })
        .strict()
      const r = s.safeParse(args)
      return r.success ? { ok: true, value: r.data } : { ok: false, error: firstIssue(r.error) }
    },
    async execute(userId, args) {
      const created = await data.tasks.create(userId, {
        title: args.title,
        priority: args.priority ?? 'medium',
        dueDate: args.dueDate ?? null,
        dueTime: args.dueTime ?? null,
        description: args.description ?? null,
        estimatedMin: args.estimatedMin ?? null,
        subtasks: (args.subtasks ?? []).map((s: { title: string }, i: number) => ({
          title: s.title,
          order: i,
        })),
      })
      return {
        summary: `أُنشئت المهمة «${created?.title ?? args.title}»${(args.subtasks ?? []).length ? ` مع ${args.subtasks.length} عنوان فرعي` : ''}`,
        created: true,
        task: {
          id: created?.id ?? null,
          title: created?.title ?? args.title,
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
    validate: (args) => {
      const s = z.object({ taskId: z.string().min(1, 'taskId مطلوب') }).strict()
      const r = s.safeParse(args)
      return r.success ? { ok: true, value: r.data } : { ok: false, error: firstIssue(r.error) }
    },
    async execute(userId, args) {
      const updated = await data.tasks.update(args.taskId, userId, { status: 'done' })
      if (!updated?.id) throw new Error('المهمة غير موجودة أو لا تملكها')
      // completedAt: Supabase يعيده ISO نصًا، ووضع mock قد يعيد كائن
      // تاريخ فارغًا عند التحويل — نوحّد دائمًا إلى ISO نص
      const completedAt =
        typeof updated.completedAt === 'string' && updated.completedAt
          ? updated.completedAt
          : new Date().toISOString()
      return {
        summary: `أُنجزت المهمة «${updated.title}»`,
        completed: true,
        taskId: updated.id,
        title: updated.title,
        completedAt,
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
    validate: (args) => {
      const r = z.object({}).strict().safeParse(args)
      return r.success ? { ok: true, value: r.data } : { ok: false, error: firstIssue(r.error) }
    },
    async execute(userId) {
      const habits = await data.habits.list(userId)
      const today = getToday()
      return {
        summary: `${habits.length} عادة${habits.length ? '' : ' — لا عادات بعد'}`,
        habits: habits.map((h: any) => ({
          id: h.id,
          name: h.name,
          frequency: h.frequency ?? null,
          targetCount: h.targetCount ?? 1,
          todayCompleted: (h.logs ?? []).some(
            (l: any) => l.date === today && l.completed,
          ),
          streak: habitStreak(h.logs ?? [], today),
        })),
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
    validate: (args) => {
      const s = z
        .object({
          habitId: z.string().min(1, 'habitId مطلوب'),
          date: DateStr.optional(),
          completed: z.boolean().optional(),
        })
        .strict()
      const r = s.safeParse(args)
      return r.success ? { ok: true, value: r.data } : { ok: false, error: firstIssue(r.error) }
    },
    async execute(userId, args) {
      const date = args.date ?? getToday()
      const completed = args.completed ?? true
      const log = await data.habits.toggleLog(args.habitId, userId, date, completed, 1)
      // نفس تكافؤ مسار التطبيق: تسجيل العادة يبطل كاش الدرجة اليومية
      bustAggregateCache(userId)
      return {
        summary: `${completed ? 'سُجّلت' : 'أُلغي تسجيل'} العادة بتاريخ ${date}`,
        habitId: args.habitId,
        date,
        completed,
        log: log ? { date: (log as any).date ?? date, completed: (log as any).completed ?? completed } : null,
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
    validate: (args) => {
      const s = z.object({ date: DateStr.optional() }).strict()
      const r = s.safeParse(args)
      return r.success ? { ok: true, value: r.data } : { ok: false, error: firstIssue(r.error) }
    },
    async execute(userId, args) {
      const date = args.date ?? getToday()
      const items = await data.plannerItems.list(userId, date)
      const sections: Record<string, any[]> = {}
      for (const it of items) {
        const sec = it.section ?? 'other'
        if (!sections[sec]) sections[sec] = []
        sections[sec].push({ id: it.id, title: it.title, time: it.time ?? null, completed: !!it.completed })
      }
      const total = items.length
      const done = items.filter((i: any) => i.completed).length
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
    validate: (args) => {
      const s = z.object({ days: z.number().int().min(1).max(14).optional() }).strict()
      const r = s.safeParse(args)
      return r.success ? { ok: true, value: r.data } : { ok: false, error: firstIssue(r.error) }
    },
    async execute(userId, args) {
      const n = args.days ?? 7
      const dates = lastNDates(getToday(), n)
      const rows = await data.dailyScores.list(userId, dates)
      const byDate = new Map(rows.map((r: any) => [r.date, r]))
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
    validate: (args) => {
      const s = z
        .object({
          date: DateStr.optional(),
          content: z.string().max(20000).optional(),
          wins: z.string().max(5000).optional(),
          challenges: z.string().max(5000).optional(),
          ideas: z.string().max(5000).optional(),
          tomorrowPlan: z.string().max(5000).optional(),
          gratitude: z.string().max(5000).optional(),
          mood: z.number().int().min(1).max(5).optional(),
          energy: z.number().int().min(1).max(5).optional(),
          overwrite: z.boolean().optional(),
        })
        .strict()
      const r = s.safeParse(args)
      if (!r.success) return { ok: false, error: firstIssue(r.error) }
      const { overwrite, ...fields } = r.data
      const hasContent = Object.values(fields).some((v) => v !== undefined && v !== '')
      if (!hasContent) {
        return { ok: false, error: 'مطلوب حقل واحد على الأقل من محتوى اليومية (content/wins/…)' }
      }
      return { ok: true, value: r.data }
    },
    async execute(userId, args) {
      const date = args.date ?? getToday()
      const { overwrite, date: _d, ...fields } = args
      // حماية الاستبدال: لا نكتب فوق مدخل قائم إلا بتصريح صريح
      const existing = await data.journals.get(userId, date)
      if (existing && !overwrite) {
        throw new Error(
          `يوجد مدخل يوميات بتاريخ ${date} بالفعل — لن أستبدله. مرّر overwrite: true لو تريد ذلك صراحةً.`,
        )
      }
      const saved = await data.journals.upsert(userId, date, fields)
      bustAggregateCache(userId)
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

/** الشكل المعلن للعميل في tools/list — بلا دوال التنفيذ */
export function publicToolsList() {
  return MCP_TOOLS.map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: t.inputSchema,
    annotations: {
      // اقتراح أولوية للعميل: أدوات الكتابة أثقل — يعرضها العميل
      // كأفعال وليست قراءات (readOnlyHint من مواصفة MCP)
      readOnlyHint: t.kind === 'read',
      // openWorldHint: أدواتنا تعمل على بيانات المستخدم فقط
      openWorldHint: false,
    },
  }))
}
