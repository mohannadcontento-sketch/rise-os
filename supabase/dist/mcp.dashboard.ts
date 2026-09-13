// ════════════════════════════════════════════════════════════
// ملف مدموج آليًا للنشر من لوحة Supabase (الوظيفة: mcp)
// وُلِّد بواسطة scripts/build-dashboard-bundles.mjs — 2026-09-13 01:03:26 UTC
// لا تحرر هذا الملف يدويًا؛ عدّل المصادر ثم أعد التوليد.
//
// طريقة النشر (Dashboard):
//   1) Edge Functions → «Create a new function»
//   2) الاسم: mcp (بالضبط — الرابط يعتمد عليه)
//   3) عطّل «Verify JWT with legacy secret» إن ظهر الخيار
//   4) الصق كامل هذا الملف ثم Save/Deploy
//   المصادر الأصلية:
//     _shared/postgrest.ts
//     _shared/mcp-tools.ts
//     _shared/mcp-core.ts
//     _shared/oauth-core.ts
//     mcp/index.ts
// ════════════════════════════════════════════════════════════

// ──────────────────── من _shared/postgrest.ts ────────────────────
// ============================================================
// postgrest.ts — عميل PostgREST خفيف لـEdge Functions (Deno)
//
// «صفر تبعيات»: لا supabase-js ولا أي npm — فقط fetch الأصلية.
// هذا يضمن توافقًا كاملًا مع edge-runtime المقيّد على Supabase
// ويجعل المنطق قابلًا للاختبار محليًا عبر توجيه baseUrl نحو
// خادم وهمي (انظر supabase/tests/edge/mock-postgrest.ts).
//
// العقد المُستهدَف (مطابق لما تفعله مستودعات التطبيق عبر
// supabase-js، لأن Edge Function تعمل بمفتاح service_role):
//   • GET  /rest/v1/{table}?select=…&filters…  → صفوف
//   • GET  بـ Accept: vnd.pgrst.object (maybeSingle) → كائن
//     أو null عند PGRST116 (نفس معالجة postgrest-js للـ406)
//   • POST /rest/v1/rpc/{fn} بجسم JSON → ناتج الدالة
//   • POST upsert عبر ?on_conflict=… + Prefer:
//     resolution=merge-duplicates,return=representation
//   • PATCH للتحديثات الجزئية (last_used_at للمفاتيح)
//
// الأمان: كل نداء يحمل ترويستي apikey + Authorization بمفتاح
// الخدمة — PostgREST يضبط request.jwt.claim.role=service_role
// فتُتجاوز RLS؛ لذلك يفرض كل مستدعٍ ملكية user_id بنفسه
// (تنبيه موثّق في كل مكان يستدعي هذا الملف).
//
// المهلة: AbortSignal.timeout(10s) لكل نداء — لا تعليق
// دائم داخل Edge Function مهما استجاب الخادم.
// ============================================================

/** خطأ PostgREST مُغلَّف برمز الحالة (يفضَّل على رسالة fetch) */
class PostgrestError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'PostgrestError'
    this.status = status
    this.code = code
  }
}

/** شكل خطأ PostgREST القياسي في الجسم */
interface PostgrestErrorBody {
  message?: string
  code?: string
  details?: string
  hint?: string
}

interface PostgrestOptions {
  /** قاعدة المعرّف: https://<ref>.supabase.co (بلا شرطة مائلة ختامية) */
  baseUrl: string
  /** مفتاح الخدمة (service_role) — يُقرأ من متغيرات البيئة المحقونة */
  serviceKey: string
  /** fetch قابلة للاستبدال للاختبار (الافتراضي العالمية) */
  fetchImpl?: typeof fetch
}

interface QueryParams {
  /** select=... (افتراضي *) */
  select?: string
  /** فلاتر خام: { user_id: 'eq.<uuid>', date: 'eq.2026-09-13' } */
  filters?: Record<string, string>
  /** ترتيب: ['order.asc', 'date.desc'] */
  order?: string[]
  /** حد النتائج */
  limit?: number
}

// ── القسم: ترميز الاستعلام ─────────────────────

/** بناء سلسلة الاستعلام من الأجزاء (فلاتر + ترتيب + حد) */
function buildQuery(params: QueryParams): string {
  const parts: string[] = []
  parts.push(`select=${encodeURIComponent(params.select ?? '*')}`)
  for (const [key, value] of Object.entries(params.filters ?? {})) {
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
  }
  for (const o of params.order ?? []) parts.push(`order=${encodeURIComponent(o)}`)
  if (params.limit) parts.push(`limit=${params.limit}`)
  return parts.join('&')
}

/**
 * صياغة قائمة in.() بقيم آمنة: in.("a","b") — علامات الاقتباس
 * إلزامية لقيم تحوي فواصل/مسافات، وصحيحة تمامًا للـUUID والتواريخ.
 */
function inList(values: string[]): string {
  const quoted = values.map((v) => `"${v.replace(/"/g, '\\"')}"`)
  return `in.(${quoted.join(',')})`
}

// ── القسم: العميل ─────────────────────

class Postgrest {
  private base: string
  private key: string
  private fetchImpl: typeof fetch

  constructor(opts: PostgrestOptions) {
    this.base = opts.baseUrl.replace(/\/+$/, '')
    this.key = opts.serviceKey
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      apikey: this.key,
      Authorization: `Bearer ${this.key}`,
      'Content-Type': 'application/json',
      ...extra,
    }
  }

  /** نداء خام — يفك الخطأ أو يعيد الجسم محلولًا */
  private async call(path: string, init: RequestInit): Promise<unknown> {
    let res: Response
    try {
      res = await this.fetchImpl(`${this.base}${path}`, init)
    } catch (err) {
      throw new PostgrestError(`تعذر الوصول لقاعدة البيانات: ${(err as Error)?.message ?? ''}`, 503)
    }

    const text = await res.text()
    let body: unknown = null
    if (text) {
      try {
        body = JSON.parse(text)
      } catch {
        body = text
      }
    }

    if (!res.ok) {
      const errBody = (body ?? {}) as PostgrestErrorBody
      throw new PostgrestError(
        errBody.message ?? `فشل نداء قاعدة البيانات (${res.status})`,
        res.status,
        errBody.code,
      )
    }
    return body
  }

  /** GET صفوف — مصفوفة */
  async select(table: string, params: QueryParams = {}): Promise<unknown> {
    return this.call(`/rest/v1/${table}?${buildQuery(params)}`, {
      method: 'GET',
      headers: this.headers(),
      signal: AbortSignal.timeout(10_000),
    })
  }

  /** GET صف واحد — null عند غيابه (PGRST116 = «لا صفوف» وليس خطأ) */
  async maybeSingle(table: string, params: QueryParams = {}): Promise<unknown> {
    try {
      return await this.call(`/rest/v1/${table}?${buildQuery(params)}`, {
        method: 'GET',
        headers: this.headers({ Accept: 'application/vnd.pgrst.object+json' }),
        signal: AbortSignal.timeout(10_000),
      })
    } catch (err) {
      if (err instanceof PostgrestError && err.code === 'PGRST116') return null
      throw err
    }
  }

  /** استدعاء دالة SQL — يعيد ناتجها كما هو */
  async rpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
    return this.call(`/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(10_000),
    })
  }

  /** upsert ذري — on_conflict يطابق أقواس القيود الفريدة */
  async upsert(
    table: string,
    row: Record<string, unknown>,
    onConflict: string,
  ): Promise<unknown> {
    return this.call(
      `/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`,
      {
        method: 'POST',
        headers: this.headers({
          Accept: 'application/vnd.pgrst.object+json',
          Prefer: 'resolution=merge-duplicates,return=representation',
        }),
        body: JSON.stringify(row),
        signal: AbortSignal.timeout(10_000),
      },
    )
  }

  /** تحديث جزئي (patch) — يُستخدم لـlast_used_at فقط */
  async patch(
    table: string,
    filters: Record<string, string>,
    row: Record<string, unknown>,
  ): Promise<void> {
    const qs = Object.entries(filters)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&')
    await this.call(`/rest/v1/${table}?${qs}`, {
      method: 'PATCH',
      headers: this.headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify(row),
      signal: AbortSignal.timeout(10_000),
    })
  }

  /** إدراج سجل (التدقيق) — بلا إعادة تمثيل */
  async insert(table: string, row: Record<string, unknown>): Promise<void> {
    await this.call(`/rest/v1/${table}`, {
      method: 'POST',
      headers: this.headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify(row),
      signal: AbortSignal.timeout(10_000),
    })
  }

  /** حذف بفلاتر (تنظيف رموز OAuth المنتهية — أفضل جهد) */
  async delete(table: string, filters: Record<string, string>): Promise<void> {
    const qs = Object.entries(filters)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&')
    await this.call(`/rest/v1/${table}?${qs}`, {
      method: 'DELETE',
      headers: this.headers({ Prefer: 'return=minimal' }),
      signal: AbortSignal.timeout(10_000),
    })
  }
}

// ──────────────────── من _shared/mcp-tools.ts ────────────────────
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


// ── القسم: الأنواع ─────────────────────

interface McpTool {
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
function todayCairo(): string {
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

const MCP_TOOLS: McpTool[] = [
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
const MCP_TOOLS_BY_NAME = new Map(MCP_TOOLS.map((t) => [t.name, t]))

/** معرّفات المهام كسلاسل (لعامل in.()) */
function taskIdsOf(taskList: { id: unknown }[]): string[] {
  return taskList.map((t) => String(t.id))
}

/** الشكل المعلن للعميل في tools/list — بلا دوال التنفيذ */
function publicToolsList() {
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

// ──────────────────── من _shared/mcp-core.ts ────────────────────
// ============================================================
// mcp-core.ts — نواة خادم MCP على Supabase Edge (المرحلة 10-ب)
//
// نسخة Deno الأصيلة من /api/rise/mcp/call: نفس سلسلة الأمان
// الخادمية بالترتيب، ونفس رسائل JSON-RPC العربية:
//   0) حد IP 60/دقيقة (تكافؤ الـmiddleware في مسار Vercel)
//   1) تحليل الجسم: JSON تالف → -32700 (قبل المصادقة — المواصفة
//      تسمح برد الخطأ بلا هوية)
//   2) المصادقة: Authorization: Bearer rise_… حصرًا — لا كوكيز
//      ولا جلسات ولا Supabase JWT (مصادقة ambient = ثغرة CSRF؛
//      عميل MCP حقيقي يرسل المفتاح دائمًا). المفتاح يُحل عبر
//      SHA-256 → user_api_keys (مطابقة التجزئة فقط — لا نص
//      صريح في أي مكان) + تحديث last_used_at.
//   3) إيقاف الحساب: profiles.suspended = رفض (fail-closed —
//      خطأ القراءة نفسه رفض، تمامًا كمسار requireAuth)
//   4) بوابة الخطة: user_subscriptions → plan == 'max' نشط
//      (تُفحص في كل طلب — النزول من ماكس يوقف المفتاح فورًا).
//      فشل القراءة = رفض (fail-closed).
//   5) حدود المعدل: 30/د إجمالي + 10/د كتابة لكل مستخدم
//      (نافذة ثابتة 60 ثانية — نفس أرقام مسار Vercel)
//   6) Validation: strict لكل أداة (يُطرد أي حقل مجهول)
//   7) Audit Log: كل كتابة + كل رفض خطة → audit_logs (بلا قيم
//      الوسائط — خصوصية اليوميات: مفاتيح وأحجام فقط)
//
// ملاحظة نشر إلزامية: الدالة تُنشر مع --no-verify-jwt لأن
// مفاتيح rise_ ليست Supabase JWT — بوابة المنصة الافتراضية
// كانت سترفضها قبل وصول الكود. كل التحقق يحدث هنا داخليًا.
//
// حدود الذاكرة (موثقة بصدق): نفس قيد مسار Vercel — الحدود
// داخل الذاكرة لكل نسخة دالة؛ طبقة أولى وليست عدًّا مضمونًا
// عبر النسخ. الترقية اللاحقة إلى usage_daily دون تغيير الواجهة.
// ============================================================


// ── القسم: الثوابت ─────────────────────

const PROTOCOL_DEFAULT = '2025-06-18'
const PROTOCOL_KNOWN = new Set(['2025-06-18', '2025-03-26', '2024-11-05'])
const SERVER_INFO = { name: 'awj-mcp', version: '1.1.0' }

const INSTRUCTIONS_AR =
  'أوج (awj.life) هو نظام حياة شخصي عربي: مهام، عادات، مخطط يومي، يوميات، ودرجة إنتاجية. ' +
  'ابدأ بـ list_tasks و list_habits و get_today_plan لتفهم يوم المستخدم، وسجّل له بالمهام والعادات ' +
  'واليوميات عند الطلب. الأدوات تعمل على بيانات المستخدم نفسه فقط، ولا توجد أي عمليات حذف.'

/** حد IP بالدقيقة (تكافؤ middleware مسار Vercel: 60/د) */
const IP_LIMIT_PER_MIN = 60
/** حد الطلبات الإجمالي لكل مستخدم في الدقيقة (نفس مسار Vercel) */
const LIMIT_TOTAL_PER_MIN = 30
/** حد عمليات الكتابة لكل مستخدم في الدقيقة */
const LIMIT_WRITES_PER_MIN = 10
const WINDOW_MS = 60_000

// ── القسم: حدود المعدل (قابلة للحقن بالوقت للاختبار) ─────────────────────

interface Bucket {
  count: number
  writes: number
  resetAt: number
}

class RateLimiter {
  private buckets = new Map<string, Bucket>()
  constructor(private now: () => number = Date.now) {}

  check(key: string, isWrite: boolean): { allowed: boolean; reason?: 'total' | 'write' | 'ip'; retryAfterSec?: number } {
    const t = this.now()
    let bucket = this.buckets.get(key)
    if (!bucket || t >= bucket.resetAt) {
      bucket = { count: 0, writes: 0, resetAt: t + WINDOW_MS }
      this.buckets.set(key, bucket)
    }
    const total = bucket.count + 1
    if (total > LIMIT_TOTAL_PER_MIN) {
      return { allowed: false, reason: 'total', retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - t) / 1000)) }
    }
    if (isWrite && bucket.writes + 1 > LIMIT_WRITES_PER_MIN) {
      return { allowed: false, reason: 'write', retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - t) / 1000)) }
    }
    bucket.count = total
    if (isWrite) bucket.writes += 1
    if (this.buckets.size > 5000) {
      for (const [k, b] of this.buckets) if (t >= b.resetAt) this.buckets.delete(k)
    }
    return { allowed: true }
  }

  /** عدّاد IP المنفصل (نافذة أعرض دائمًا — يغطي المصادقة أيضًا) */
  checkIp(ip: string): { allowed: boolean; retryAfterSec?: number } {
    const t = this.now()
    let b = this.buckets.get(`ip:${ip}`) as Bucket | undefined
    if (!b || t >= b.resetAt) {
      b = { count: 0, writes: 0, resetAt: t + WINDOW_MS }
      this.buckets.set(`ip:${ip}`, b)
    }
    if (b.count + 1 > IP_LIMIT_PER_MIN) {
      return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - t) / 1000)) }
    }
    b.count += 1
    return { allowed: true }
  }

  reset() {
    this.buckets.clear()
  }
}

// ── القسم: سياق الطلب والنتيجة (اختباري النواة بلا Deno.serve) ─────────

interface McpServerDeps {
  /** قاعدة Supabase (https://<ref>.supabase.co) */
  baseUrl: string
  /** مفتاح الخدمة المحقون من متغيرات البيئة */
  serviceKey: string
  /** fetch قابلة للاستبدال (اختبارات) */
  fetchImpl?: typeof fetch
  /** ساعة قابلة للحقن (اختبارات الحدود) */
  now?: () => number
  /** كاتب التدقيق قابل للاستبدال (اختبارات) */
  auditSink?: (entry: AuditEntry) => Promise<void> | void
  /**
   * تحقق رموز OAuth (access tokens) — يُحقن من index.ts عبر
   * McpOAuth.verifyAccessTokenUser. غيابه = مسار rise_ فقط
   * (السلوك التاريخي نفسه — الاختبارات القديمة لا تتغير).
   */
  oauthTokenVerifier?: (token: string) => Promise<AuthOutcome>
}

interface McpHttpRequest {
  method: string
  /** ترويسات صغيرة المفاتيح { authorization: 'Bearer …' } */
  headers: Record<string, string>
  rawBody: string
}

interface McpHttpResult {
  status: number
  headers: Record<string, string>
  body: string | null
}

interface AuditEntry {
  actor_user_id: string
  action: string
  target_type: string | null
  target_id: string | null
  metadata: Record<string, unknown>
  ip_address: string | null
  user_agent: string | null
}

// ── القسم: مساعدات JSON-RPC ─────────────────────

type JsonRpcId = string | number | null

function rpcResultBody(id: JsonRpcId, result: unknown): string {
  return JSON.stringify({ jsonrpc: '2.0', id, result })
}

function rpcErrorBody(id: JsonRpcId, code: number, message: string, data?: unknown): string {
  const err: Record<string, unknown> = { code, message }
  if (data !== undefined) err.data = data
  return JSON.stringify({ jsonrpc: '2.0', id, error: err })
}

/** هل الرسالة إشعار (بلا id)? الإشعارات لا تُرَد وفق المواصفة */
function isNotification(msg: unknown): boolean {
  return (
    !!msg &&
    typeof msg === 'object' &&
    (msg as any).jsonrpc === '2.0' &&
    typeof (msg as any).method === 'string' &&
    (msg as any).id === undefined
  )
}

function corsHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version',
    'Access-Control-Expose-Headers': 'Mcp-Session-Id',
    ...extra,
  }
}

// ── القسم: حل مفتاح rise_ (SHA-256 → user_api_keys) ─────────────────────

/** SHA-256 hex عبر Web Crypto (متطابق مع hashApiKey في التطبيق) */
async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** نتيجة حل الهوية (rise_ أو OAuth — نفس الشكل) */
type AuthOutcome = { ok: true; userId: string } | { ok: false; reason: string }

/**
 * حل مفتاح rise_ من جذوره (مستقل للاستيراد من oauth-core):
 * SHA-256 → user_api_keys → تحديث last_used_at → فحص الإيقاف.
 * نفس عقد authenticate السابق حرفيًا (الأدوات الأصلية لم تتغير).
 */
async function resolveRiseKey(db: Postgrest, apiKey: string): Promise<AuthOutcome> {
  try {
    const hash = await sha256Hex(apiKey)
    const row = (await db.maybeSingle('user_api_keys', {
      select: 'user_id',
      filters: { key_hash: `eq.${hash}` },
    })) as { user_id?: string } | null
    if (!row?.user_id) return { ok: false, reason: 'unknown-key' }

    // تحديث last_used_at (أفضل جهد — لا يمنع الطلب)
    try {
      await db.patch('user_api_keys', { key_hash: `eq.${hash}` }, { last_used_at: new Date().toISOString() })
    } catch { /* أفضل جهد فقط */ }

    // حساب موقوف؟ (fail-closed: فشل القراءة = رفض)
    const profile = (await db.maybeSingle('profiles', {
      select: 'suspended',
      filters: { id: `eq.${row.user_id}` },
    })) as { suspended?: boolean } | null
    if (profile?.suspended === true) return { ok: false, reason: 'suspended' }

    return { ok: true, userId: row.user_id }
  } catch (err) {
    return { ok: false, reason: `db-error:${(err as Error)?.message ?? ''}` }
  }
}

/**
 * بوابة الخطة (max نشط) — مستقلة للاستيراد من oauth-core.
 * نفس منطق مسار Vercel حرفيًا: كل استدعاء يعيد الفحص (fail-closed).
 */
async function checkMaxPlanGate(
  db: Postgrest,
  userId: string,
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const data = (await db.maybeSingle('user_subscriptions', {
      select: 'plan,status,expires_at',
      filters: { user_id: `eq.${userId}` },
    })) as { plan?: string; status?: string; expires_at?: string | null } | null

    if (!data) return { allowed: false, reason: 'plan-free' } // لا صف = مجاني
    const active =
      data.status === 'active' &&
      (!data.expires_at || new Date(data.expires_at).getTime() > Date.now())
    if (data.plan === 'max' && active) return { allowed: true }
    return { allowed: false, reason: `plan-${data.plan}${active ? '' : '-inactive'}` }
  } catch (err) {
    const reason = err instanceof PostgrestError ? `read-failed(${err.status})` : 'read-failed'
    return { allowed: false, reason } // fail-closed
  }
}

// ── القسم: المعالج الرئيسي ─────────────────────

/** مثيل خادم — أنشئه مرة واحدة لكل نسخة دالة (يحمل الحدود) */
class McpServer {
  private db: Postgrest
  private limiter: RateLimiter
  private audit: (entry: AuditEntry) => Promise<void>
  private oauthTokenVerifier: ((token: string) => Promise<AuthOutcome>) | null

  constructor(deps: McpServerDeps) {
    this.db = new Postgrest({
      baseUrl: deps.baseUrl,
      serviceKey: deps.serviceKey,
      fetchImpl: deps.fetchImpl,
    })
    this.limiter = new RateLimiter(deps.now ?? Date.now)
    this.oauthTokenVerifier = deps.oauthTokenVerifier ?? null
    this.audit = async (entry) => {
      if (deps.auditSink) {
        await deps.auditSink(entry)
        return
      }
      // أفضل جهد: فشل التدقيق لا يفشل العملية (نفس مسار Vercel)
      try {
        await this.db.insert('audit_logs', { ...entry, created_at: new Date().toISOString() })
      } catch (err) {
        console.warn('[mcp/edge] audit write failed:', (err as Error)?.message)
      }
    }
  }

  /** OPTIONS (preflight لعملاء المتصفح) */
  handleOptions(): McpHttpResult {
    return { status: 204, headers: corsHeaders(), body: null }
  }

  /** GET — لا بث SSE (خادمنا stateless) */
  handleGet(): McpHttpResult {
    return {
      status: 405,
      headers: corsHeaders(),
      body: rpcErrorBody(null, -32000, 'هذه النقطة تدعم POST فقط (JSON-RPC) — لا تدعم بث SSE'),
    }
  }

  /** POST — قلب الخادم */
  async handlePost(req: McpHttpRequest): Promise<McpHttpResult> {
    // 0) حد IP أولًا (قبل أي عمل — يغطي حتى محاولات المفاتيح الوهمية)
    const ip =
      (req.headers['x-forwarded-for'] || '').split(',')[0]?.trim() || 'unknown'
    const ipVerdict = this.limiter.checkIp(ip)
    if (!ipVerdict.allowed) {
      console.warn('[mcp/edge] rate limited (ip)', { ip })
      return {
        status: 429,
        headers: corsHeaders({ 'Retry-After': String(ipVerdict.retryAfterSec ?? 60) }),
        body: rpcErrorBody(null, -32003, `تجاوزت حد الطلبات لهذه النقطة (${ipVerdict.retryAfterSec}s للإعادة)`),
      }
    }

    // 1) قراءة الجسم (قبل المصادقة — المواصفة تسمح بذلك)
    let json: unknown
    try {
      json = JSON.parse(req.rawBody)
    } catch {
      return { status: 400, headers: corsHeaders(), body: rpcErrorBody(null, -32700, 'خطأ في تحليل JSON') }
    }

    const isBatch = Array.isArray(json)
    const messages: unknown[] = Array.isArray(json) ? json : [json]
    if (messages.length === 0) {
      return { status: 400, headers: corsHeaders(), body: rpcErrorBody(null, -32600, 'طلب فارغ') }
    }

    // 2) المصادقة: Bearer rise_… (المسار التاريخي) أو Bearer JWT
    //    من طبقة OAuth لربط ChatGPT (المرحلة 10-ج) — كوكيز وجلسات
    //    تُرفض عمدًا في المسارين (مصادقة ambient = ثغرة CSRF).
    const authHeader = req.headers['authorization'] || ''
    const bearer = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : ''
    let auth: AuthOutcome
    let credential: 'key' | 'oauth' = 'key'
    if (bearer.startsWith('rise_')) {
      auth = await this.authenticate(bearer)
    } else if (
      bearer &&
      bearer.split('.').length === 3 &&
      this.oauthTokenVerifier
    ) {
      credential = 'oauth'
      auth = await this.verifyOAuth(bearer)
    } else {
      return {
        status: 401,
        headers: corsHeaders({ 'WWW-Authenticate': 'Bearer realm="awj-mcp"' }),
        body: rpcErrorBody(
          null,
          -32001,
          'مطلوب مفتاح MCP: Authorization: Bearer rise_… — أنشئه من الإعدادات (خطة ماكس)',
        ),
      }
    }
    if (!auth.ok) {
      console.warn('[mcp/edge] auth failed:', credential, auth.reason)
      const message = credential === 'oauth'
        ? 'رمز OAuth غير صالح أو منتهي — أعد التفويض من التطبيق المتصل'
        : 'مفتاح MCP غير صالح أو ملغى'
      return {
        status: 401,
        headers: corsHeaders(),
        body: rpcErrorBody(null, -32001, message),
      }
    }
    const userId = auth.userId

    // 3) بوابة الخطة: max نشط في كل طلب (fail-closed)
    const gate = await this.checkMaxPlanGate(userId)
    if (!gate.allowed) {
      await this.audit({
        actor_user_id: userId,
        action: 'mcp.plan_denied',
        target_type: 'mcp',
        target_id: 'edge',
        metadata: { reason: gate.reason, endpoint: 'supabase-edge', credential },
        ip_address: ip,
        user_agent: req.headers['user-agent'] || null,
      })
      return {
        status: 403,
        headers: corsHeaders(),
        body: rpcErrorBody(null, -32002, 'أدوات MCP متاحة في خطة ماكس فقط — رقّ حسابك لتفعيلها'),
      }
    }

    // 4) حد المعدل الإجمالي (لكل POST — يغطي كل الرسائل داخله)
    const total = this.limiter.check(`u:${userId}`, false)
    if (!total.allowed) {
      console.warn('[mcp/edge] rate limited (total)', { userId })
      return {
        status: 429,
        headers: corsHeaders({ 'Retry-After': String(total.retryAfterSec ?? 60) }),
        body: rpcErrorBody(null, -32003, `تجاوزت حد الطلبات (${total.retryAfterSec}s للإعادة)`),
      }
    }

    // 5) توزيع الرسائل
    const responses: string[] = []
    let wroteSomething = false

    for (const msg of messages) {
      // إشعار صحيح → لا رد (202 لاحقًا لو كل الرسائل إشعارات)
      if (isNotification(msg)) continue

      // بنية غير صالحة → -32600
      if (
        !msg ||
        typeof msg !== 'object' ||
        (msg as any).jsonrpc !== '2.0' ||
        typeof (msg as any).method !== 'string'
      ) {
        responses.push(
          rpcErrorBody((msg as any)?.id ?? null, -32600, 'طلب JSON-RPC غير صالح'),
        )
        continue
      }

      const { id, method, params } = msg as { id?: JsonRpcId; method: string; params?: any }
      const msgId: JsonRpcId = id === undefined ? null : id

      switch (method) {
        // ── المصافحة: قدراتنا = أدوات فقط ──
        case 'initialize': {
          const requested = typeof params?.protocolVersion === 'string' ? params.protocolVersion : ''
          responses.push(
            JSON.stringify({
              jsonrpc: '2.0',
              id: msgId,
              result: {
                protocolVersion: PROTOCOL_KNOWN.has(requested) ? requested : PROTOCOL_DEFAULT,
                capabilities: { tools: { listChanged: false } },
                serverInfo: SERVER_INFO,
                instructions: INSTRUCTIONS_AR,
              },
            }),
          )
          break
        }

        case 'ping':
          responses.push(rpcResultBody(msgId, {}))
          break

        case 'tools/list':
          responses.push(JSON.stringify({ jsonrpc: '2.0', id: msgId, result: { tools: publicToolsList() } }))
          break

        // ── استدعاء أداة: القلب ──
        case 'tools/call': {
          const name = typeof params?.name === 'string' ? params.name : ''
          const tool = MCP_TOOLS_BY_NAME.get(name)
          if (!tool) {
            responses.push(
              rpcErrorBody(
                msgId,
                -32602,
                `أداة غير معروفة: ${name || '(فارغ)'} — المتاح: ${[...MCP_TOOLS_BY_NAME.keys()].join(', ')}`,
              ),
            )
            break
          }

          // حدود الكتابة (10/د): قبل التنفيذ + قبل التدقيق
          if (tool.kind === 'write') {
            const w = this.limiter.check(`u:${userId}`, true)
            if (!w.allowed) {
              console.warn('[mcp/edge] rate limited (writes)', { userId, tool: name })
              responses.push(
                rpcErrorBody(
                  msgId,
                  -32003,
                  `تجاوزت حد عمليات الكتابة (${w.retryAfterSec}s للإعادة)`,
                  { retryAfterSec: w.retryAfterSec },
                ),
              )
              break
            }
          }

          // Validation: strict — أول خطأ يرد للعميل نصًا
          const args = params?.arguments ?? {}
          const verdict = tool.validate(args)
          if (!verdict.ok) {
            responses.push(
              rpcErrorBody(msgId, -32602, `وسائط غير صالحة (${tool.name}): ${verdict.error}`),
            )
            break
          }

          // Audit: كل كتابة حساسة تُسجَّل (بلا قيم الوسائط)
          if (tool.kind === 'write') {
            wroteSomething = true
            await this.audit({
              actor_user_id: userId,
              action: 'mcp.tool_call',
              target_type: 'mcp_tool',
              target_id: tool.name,
              metadata: {
                argKeys: Object.keys(args ?? {}),
                argBytes: JSON.stringify(args ?? {}).length,
                endpoint: 'supabase-edge',
              },
              ip_address: ip,
              user_agent: req.headers['user-agent'] || null,
            })
          }

          // التنفيذ: فشل الأداة = نتيجة isError (مواصفة MCP)
          try {
            const result = await tool.execute(this.db, userId, verdict.value)
            responses.push(
              JSON.stringify({
                jsonrpc: '2.0',
                id: msgId,
                result: {
                  content: [{ type: 'text', text: JSON.stringify(result, null, 1) }],
                  structuredContent: result,
                  isError: false,
                },
              }),
            )
          } catch (err) {
            responses.push(
              JSON.stringify({
                jsonrpc: '2.0',
                id: msgId,
                result: {
                  content: [{ type: 'text', text: `تعذر تنفيذ ${tool.name}: ${(err as Error)?.message ?? 'خطأ غير معروف'}` }],
                  isError: true,
                },
              }),
            )
          }
          break
        }

        // ── إعلان متحفظ لعملاء يتحققون منها قبل initialize ──
        case 'resources/list':
          responses.push(JSON.stringify({ jsonrpc: '2.0', id: msgId, result: { resources: [] } }))
          break
        case 'prompts/list':
          responses.push(JSON.stringify({ jsonrpc: '2.0', id: msgId, result: { prompts: [] } }))
          break

        default:
          responses.push(rpcErrorBody(msgId, -32601, `طريقة غير معروفة: ${method}`))
      }
    }

    // 6) الرد النهائي
    if (responses.length === 0) {
      // كل الرسائل إشعارات → 202 بلا جسم (مواصفة Streamable HTTP)
      return { status: 202, headers: corsHeaders(), body: null }
    }
    const body = isBatch ? `[${responses.join(',')}]` : responses[0]
    return { status: 200, headers: corsHeaders({ 'Content-Type': 'application/json' }), body }
  }

  // ── المصادقة: تفويض لـresolveRiseKey المستقلة (توحيد المسارين) ──
  private async authenticate(apiKey: string): Promise<AuthOutcome> {
    return resolveRiseKey(this.db, apiKey)
  }

  // ── المصادقة عبر OAuth: حقن من index (خطأ = رفض، لا استثناء) ──
  private async verifyOAuth(token: string): Promise<AuthOutcome> {
    if (!this.oauthTokenVerifier) return { ok: false, reason: 'oauth-not-configured' }
    try {
      return await this.oauthTokenVerifier(token)
    } catch (err) {
      return { ok: false, reason: `oauth-error:${(err as Error)?.message ?? ''}` }
    }
  }

  // ── بوابة الخطة: تفويض للنسخة المستقلة ──
  private checkMaxPlanGate(userId: string) {
    return checkMaxPlanGate(this.db, userId)
  }
}

// ──────────────────── من _shared/oauth-core.ts ────────────────────
// ============================================================
// oauth-core.ts — طبقة OAuth 2.0 لربط ChatGPT بخادم MCP
// (المرحلة 10-ج — تفويض OAuth لأوج)
//
// لماذا هذه الطبقة؟ دوكس OpenAI الرسمية (developer-mode): ChatGPT
// يقبل لخوادم MCP البعيدة مصادقة OAuth فقط (أو بلا مصادقة /
// مختلطة) — لا يقبل مفتاح Bearer ثابت في الترويسة. خادمنا
// «مغلق بالتصميم» يرفض أي طلب بلا هوية، لذا هذه الطبقة تضيف
// مسار التفويض القياسي دون المساس بمسار rise_ القائم:
//
//   GET  ?oauth=metadata   → بيانات خادم التفويض (RFC 8414 مبسط)
//   GET  ?oauth=authorize  → صفحة موافقة عربية → 302 مع code
//   POST ?oauth=token      → code→tokens أو refresh→tokens
//   POST (بلا oauth=)      → JSON-RPC كما هو + قبول Bearer JWT
//                            بجانب Bearer rise_ (في mcp-core)
//
// التصميم (stateless قدر الإمكان):
//   • JWT موقّعة HS256 بمفتاح اشتقاقي = sha256(service_key +
//     '|awj-mcp-oauth-v1') — ثابت عبر نسخ الدالة، ولا يُفهم إلا
//     لمن يملك مفتاح الخدمة (تدويره يُبطل الرموز → إعادة تفويض).
//   • authorization code = JWT قصيرة العمر (10 دقائق) تحمل
//     user_id + client_id + redirect_uri + تحدي PKCE؛ الاستخدام
//     الواحد يُفرض بإدراج jti في mcp_oauth_codes (تعارض 23505
//     = إعادة تشغيل مرفوضة) — الهجرة 034.
//   • access_token (ساعة) + refresh_token (60 يومًا) بلا جلسات:
//     كل طلب MCP لاحق يعيد فحص الخطة والإيقاف كالمعتاد —
//     نزول المستخدم من ماكس يوقف رموز OAuth فورًا (نفس بوابة
//     rise_ بالضبط).
//   • بيانات العميل (client_id/secret) في app_config (زرع 034) —
//     نفس نمط VAPID في 028. سر العميل نص صريح بنيويًا كقيم
//     VAPID: app_config بلا سياسات RLS للقراءة العامة.
//   • redirect_uri المسموح: نطاقات chatgpt.com/openai.com فقط
//     (https حصرًا) — لا يمكن استخدام النقطة لإعادة توجيه
//     مهاجم إلى نطاقه.
//   • ساعة وfetch قابلان للحقن — كل المنطق قابل للاختبار
//     محليًا بلا Deno.serve (انظر oauth.test.ts).
//
// عقود الأخطاء: نصوص JSON-RPC العربية في mcp-core؛ هنا أخطاء
// OAuth القياسية { error, error_description } بالإنجليزية
// (مواصفة RFC 6749 — عملاء OAuth قياسيون يفهمونها) وصفحات
// HTML عربية للبشر في authorize.
// ============================================================


// ── القسم: الثوابت ─────────────────────

/** عمر رمز التفويض (10 دقائق — استخدام واحد) */
const CODE_TTL_SEC = 600
/** عمر access token (ساعة — قصير، مع refresh) */
const ACCESS_TTL_SEC = 3600
/** عمر refresh token (60 يومًا) */
const REFRESH_TTL_SEC = 60 * 24 * 3600
/** النطاق الوحيد المدعوم */
const SCOPE = 'mcp:tools'

/** مفتاحا app_config لبيانات عميل OAuth (زرعهما 034) */
const CONFIG_CLIENT_ID = 'mcp_oauth_client_id'
const CONFIG_CLIENT_SECRET = 'mcp_oauth_client_secret'

/** نطاقات إعادة التوجيه المسموحة (ChatGPT/OpenAI حصرًا) */
const ALLOWED_REDIRECT_SUFFIXES = ['chatgpt.com', 'openai.com']

/** شكل النتيجة الموحد مع mcp-core (بلا استيراد عكسي) */
interface OAuthHttpResult {
  status: number
  headers: Record<string, string>
  body: string | null
}

interface OAuthTokenUser {
  ok: true
  userId: string
}
type OAuthTokenOutcome = OAuthTokenUser | { ok: false; reason: string }

// ── القسم: base64url وJWT (HS256 عبر Web Crypto) ─────────────────────

/** ترميز base64url بلا حشو */
function b64urlEncode(bytes: Uint8Array<ArrayBuffer>): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** فك base64url (متسامح مع الحشو) */
function b64urlDecode(input: string): Uint8Array<ArrayBuffer> {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function enc(text: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(text)
}
function dec(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ])
}

/** sha256 بترميز base64url — لتحدي PKCE S256 (مصدَّرة للاختبارات) */
async function sha256B64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc(input))
  return b64urlEncode(new Uint8Array(digest))
}

/** هيكل حمولة رموزنا الثلاثة (code/access/refresh) */
interface TokenPayload {
  iss: string
  sub: string
  cid: string
  typ: 'code' | 'access' | 'refresh'
  jti: string
  iat: number
  exp: number
  scope: string
  /** code فقط: إعادة التوجيه المربوطة */
  red?: string
  /** code فقط: تحدي PKCE S256 (base64url) */
  chal?: string
}

/** توقيع JWT (HS256) — للرموز الثلاثة */
async function signJwt(payload: TokenPayload, signingKey: string): Promise<string> {
  const header = b64urlEncode(enc(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const body = b64urlEncode(enc(JSON.stringify(payload)))
  const key = await hmacKey(signingKey)
  const sig = await crypto.subtle.sign('HMAC', key, enc(`${header}.${body}`))
  return `${header}.${body}.${b64urlEncode(new Uint8Array(sig))}`
}

/** تحقق من التوقيع والبنية — يعيد الحمولة أو سببًا نصيًا (الوقت يُحقن) */
async function verifyJwt(
  token: string,
  signingKey: string,
  expectedIssuer: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): Promise<{ ok: true; payload: TokenPayload } | { ok: false; reason: string }> {
  const parts = token.split('.')
  if (parts.length !== 3) return { ok: false, reason: 'malformed' }
  const [header, body, sig] = parts
  let head: { alg?: string }
  let payload: TokenPayload
  try {
    head = JSON.parse(dec(b64urlDecode(header)))
    payload = JSON.parse(dec(b64urlDecode(body)))
  } catch {
    return { ok: false, reason: 'bad-json' }
  }
  if (head.alg !== 'HS256') return { ok: false, reason: 'alg' }
  const key = await hmacKey(signingKey)
  const valid = await crypto.subtle.verify('HMAC', key, b64urlDecode(sig), enc(`${header}.${body}`))
  if (!valid) return { ok: false, reason: 'signature' }
  if (payload.iss !== expectedIssuer) return { ok: false, reason: 'issuer' }
  if (typeof payload.exp !== 'number' || payload.exp <= 0) return { ok: false, reason: 'exp-missing' }
  if (payload.exp <= nowSec) return { ok: false, reason: 'expired' }
  if (typeof payload.sub !== 'string' || !payload.sub) return { ok: false, reason: 'sub' }
  if (payload.typ !== 'code' && payload.typ !== 'access' && payload.typ !== 'refresh') {
    return { ok: false, reason: 'typ' }
  }
  return { ok: true, payload }
}

/** مشتق مفتاح التوقيع من مفتاح الخدمة (ثابت عبر النسخ) */
async function deriveSigningKey(serviceKey: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc(`${serviceKey}|awj-mcp-oauth-v1`))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// ── القسم: مقارنة زمنية ثابتة (بيانات العميل) ─────────────────────

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// ── القسم: تهريب HTML (كل مدخلات authorize غير موثوقة) ─────────────────────

function esc(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ── القسم: صفحات HTML العربية (بسيطة، inline، بلا أصول خارجية) ─────

function htmlPage(title: string, inner: string): string {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<style>
  body{font-family:system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;background:#f6f7fb;
       margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}
  .card{background:#fff;border-radius:16px;box-shadow:0 8px 30px rgba(2,6,23,.08);
        max-width:420px;width:100%;padding:28px 24px;text-align:center}
  h1{font-size:18px;margin:0 0 8px;color:#0f172a}
  p{font-size:14px;color:#475569;line-height:1.8;margin:0 0 14px}
  .brand{font-weight:700;color:#0ea5e9;font-size:20px;margin-bottom:18px;display:block}
  .btn{display:inline-block;background:#0ea5e9;color:#fff;text-decoration:none;border:none;
       border-radius:12px;padding:12px 32px;font-size:15px;font-weight:600;cursor:pointer;margin:4px}
  .btn.ghost{background:transparent;color:#64748b;border:1px solid #e2e8f0}
  .meta{font-size:12px;color:#94a3b8;margin-top:18px;direction:ltr;unicode-bidi:embed}
  .warn{background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:12px;
        padding:10px 14px;font-size:13px;margin-bottom:14px}
</style>
</head>
<body><div class="card">${inner}</div></body></html>`
}

// ── القسم: الخادم ─────────────────────

interface OAuthDeps {
  /** عميل PostgREST (نفس قاعدة المشروع — service_role) */
  db: Postgrest
  /** هوية المُصدر: رابط نقطة MCP كاملًا (https://…/functions/v1/mcp) */
  issuer: string
  /** مفتاح التوقيع (deriveSigningKey(serviceKey)) */
  signingKey: string
  /** ساعة قابلة للحقن (اختبارات) — ثوانٍ Unix */
  now?: () => number
  /** فحص نطاق إعادة التوجيه (اختبارات تتجاوزه) */
  allowedRedirect?: (url: URL) => boolean
}

class McpOAuth {
  private db: Postgrest
  private issuer: string
  private signingKey: string
  private now: () => number
  private clientCache: { id: string; secret: string } | null | undefined
  private allowedRedirect: (url: URL) => boolean

  constructor(deps: OAuthDeps) {
    this.db = deps.db
    this.issuer = deps.issuer
    this.signingKey = deps.signingKey
    this.now = deps.now ?? (() => Math.floor(Date.now() / 1000))
    this.allowedRedirect = deps.allowedRedirect ?? this.defaultAllowedRedirect
  }

  /** chatgpt.com / openai.com (وفروعهما) عبر https فقط */
  private defaultAllowedRedirect(url: URL): boolean {
    if (url.protocol !== 'https:') return false
    const host = url.hostname.toLowerCase()
    return ALLOWED_REDIRECT_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))
  }

  private t(): number {
    return this.now() >= 1e12 ? Math.floor(this.now() / 1000) : Math.floor(this.now())
  }

  /** تحميل بيانات العميل من app_config (كاش داخلي) — null = غير مهيأ */
  private async loadClient(): Promise<{ id: string; secret: string } | null> {
    if (this.clientCache !== undefined) return this.clientCache
    try {
      const rows = (await this.db.select('app_config', {
        select: 'key,value',
        filters: { key: `in.("${CONFIG_CLIENT_ID}","${CONFIG_CLIENT_SECRET}")` },
      })) as { key?: string; value?: string }[]
      const id = rows.find((r) => r.key === CONFIG_CLIENT_ID)?.value
      const secret = rows.find((r) => r.key === CONFIG_CLIENT_SECRET)?.value
      this.clientCache = id && secret ? { id, secret } : null
    } catch {
      this.clientCache = null
    }
    return this.clientCache
  }

  // ── GET ?oauth=metadata ──
  metadata(): OAuthHttpResult {
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
      body: JSON.stringify({
        issuer: this.issuer,
        authorization_endpoint: `${this.issuer}?oauth=authorize`,
        token_endpoint: `${this.issuer}?oauth=token`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
        scopes_supported: [SCOPE],
      }),
    }
  }

  // ── GET ?oauth=authorize ──
  async handleAuthorize(url: URL, reqHeaders: Record<string, string>): Promise<OAuthHttpResult> {
    const p = url.searchParams
    const html = (status: number, inner: string, title = 'أوج — تفويض') => ({
      status,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
      body: htmlPage(title, inner),
    })

    // 1) إعادة التوجيه أصلًا: إن صحّت نُبلغ الأخطاء عبرها، وإلا 400 مباشرة
    const redirectUriRaw = p.get('redirect_uri') ?? ''
    let redirect: URL | null = null
    try {
      const candidate = new URL(redirectUriRaw)
      redirect = this.allowedRedirect(candidate) ? candidate : null
    } catch {
      redirect = null
    }
    if (!redirect) {
      return html(
        400,
        `<span class="brand">أوج</span>
         <h1>طلب تفويض غير صالح</h1>
         <p>عنوان إعادة التوجيه (redirect_uri) مفقود أو خارج النطاقات المسموح بها.</p>
         <p class="meta">redirect_uri must be an https URL on chatgpt.com or openai.com</p>`,
      )
    }
    const back = (params: Record<string, string>): OAuthHttpResult => {
      const u = new URL(redirect!.toString())
      for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
      return { status: 302, headers: { Location: u.toString(), 'Cache-Control': 'no-store' }, body: null }
    }
    const state = p.get('state') ?? ''

    // 2) معطيات OAuth الأساسية
    const responseType = p.get('response_type') ?? ''
    const clientId = p.get('client_id') ?? ''
    const challenge = p.get('code_challenge') ?? ''
    const challengeMethod = p.get('code_challenge_method') ?? ''
    const scope = p.get('scope') ?? SCOPE

    if (scope !== SCOPE) return back({ error: 'invalid_scope', state })
    if (responseType !== 'code') return back({ error: 'unsupported_response_type', state })
    if (challenge && challengeMethod !== 'S256') return back({ error: 'invalid_request', state })
    if (!challenge && challengeMethod) return back({ error: 'invalid_request', state })

    // 3) بيانات العميل (fail-closed: لم يشغّل المالك الهجرة 034)
    const client = await this.loadClient()
    if (!client) {
      return html(
        500,
        `<span class="brand">أوج</span>
         <h1>خدمة التفويض غير مهيأة بعد</h1>
         <p>بيانات عميل OAuth غير موجودة في قاعدة البيانات — شغّل هجرة 034 ثم أعد المحاولة.</p>`,
      )
    }
    if (!clientId || !safeEqual(clientId, client.id)) {
      return back({ error: 'invalid_client', state })
    }

    // 4) رفض صريح من المستخدم
    if (p.get('deny') === '1') {
      await this.audit('mcp.oauth.denied', clientId, null)
      return back({ error: 'access_denied', state })
    }

    // 5) هوية المستخدم: مفتاح rise_ (نفس سلسلة mcp-core حرفيًا)
    const apiKey = p.get('api_key') ?? ''
    if (!apiKey.startsWith('rise_')) {
      return html(
        401,
        `<span class="brand">أوج</span>
         <h1>مطلوب مفتاح MCP</h1>
         <p>أضف مفتاحك الشخصي إلى رابط التفويض (المعامل api_key) — يُنشأ من إعدادات أوج (خطة ماكس).</p>`,
      )
    }
    const resolved = await resolveRiseKey(this.db, apiKey)
    if (!resolved.ok) {
      return html(
        401,
        `<span class="brand">أوج</span>
         <h1>المفتاح غير صالح</h1>
         <p>مفتاح MCP غير موجود أو ملغى أو الحساب موقوف — أنشئ مفتاحًا جديدًا من إعدادات أوج.</p>`,
      )
    }

    // 6) بوابة الخطة (نفس عقد rise_: كل تفويض يعيد الفحص)
    const gate = await checkMaxPlanGate(this.db, resolved.userId)
    if (!gate.allowed) {
      await this.audit('mcp.oauth.plan_denied', clientId, resolved.userId)
      return html(
        403,
        `<span class="brand">أوج</span>
         <h1>التفويض متاح في خطة ماكس</h1>
         <p>ربط ChatGPT وMCP من ميزات خطة ماكس — رقّ حسابك ثم أعد التفويض.</p>`,
        'أوج — الخطة',
      )
    }

    // 7) موافقة المستخدم: صفحة ثم confirm=1
    if (p.get('confirm') !== '1') {
      const host = esc(redirect.hostname)
      const stateAttr = esc(state)
      // نبني رابط «تفويض» آمنًا: نفس المعاملات + confirm=1
      const approveUrl = new URL(url.toString())
      approveUrl.searchParams.set('confirm', '1')
      const denyUrl = new URL(url.toString())
      denyUrl.searchParams.set('deny', '1')
      return html(
        200,
        `<span class="brand">أوج</span>
         <h1>تفويض ChatGPT بالوصول لأوج</h1>
         <p>سيمكن للتطبيق المتصل (<b>${host}</b>) استخدام أدواتك الثمانية: قراءة مهامك وعاداتك
            ومخطط يومك ويومياتك ودرجتك، وإنشاء مهام وتسجيل عادات وكتابة يوميات باسمك.</p>
         <p>لا حذف لأي بيانات، وحدود الاستخدام 30 عملية/دقيقة، وكل كتابة تُسجَّل في التدقيق.
            يمكنك إبطال الوصول في أي وقت من إعدادات أوج.</p>
         <a class="btn" href="${esc(approveUrl.toString())}">تفويض</a>
         <a class="btn ghost" href="${esc(denyUrl.toString())}">رفض</a>
         <p class="meta">state: ${stateAttr || '—'}</p>`,
        'أوج — موافقة',
      )
    }

    // 8) إصدار code (JWT قصيرة العمر + استخدام واحد)
    const t = this.t()
    const payload: TokenPayload = {
      iss: this.issuer,
      sub: resolved.userId,
      cid: client.id,
      typ: 'code',
      jti: crypto.randomUUID(),
      iat: t,
      exp: t + CODE_TTL_SEC,
      scope,
      red: redirect.toString(),
      chal: challenge || undefined,
    }
    const code = await signJwt(payload, this.signingKey)
    await this.audit('mcp.oauth.authorized', client.id, resolved.userId)
    return back({ code, state })
  }

  // ── POST ?oauth=token ──
  async handleTokenPost(
    contentType: string,
    rawBody: string,
    reqHeaders: Record<string, string>,
  ): Promise<OAuthHttpResult> {
    const json = (status: number, obj: unknown): OAuthHttpResult => ({
      status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
      },
      body: JSON.stringify(obj),
    })
    const oauthErr = (status: number, error: string, desc: string) =>
      json(status, { error, error_description: desc })

    // 1) تحليل الجسم: form-urlencoded (المعيار) أو JSON
    let form: Record<string, string> = {}
    const ct = (contentType || '').toLowerCase()
    if (ct.includes('application/json')) {
      try {
        form = { ...JSON.parse(rawBody) } as Record<string, string>
      } catch {
        return oauthErr(400, 'invalid_request', 'bad JSON body')
      }
    } else {
      for (const [k, v] of new URLSearchParams(rawBody).entries()) form[k] = v
    }

    // 2) بيانات العميل: Basic أصلًا ثم body
    let clientId = form['client_id'] ?? ''
    let clientSecret = form['client_secret'] ?? ''
    const basic = (reqHeaders['authorization'] || '').match(/^Basic (.+)$/)
    if (basic) {
      try {
        const [id, secret] = atob(basic[1]).split(':')
        if (id !== undefined) clientId = id
        if (secret !== undefined) clientSecret = secret
      } catch { /* نتجاهل Basic تالفًا ونفشل في المقارنة */ }
    }
    const client = await this.loadClient()
    if (!client || !clientId || !safeEqual(clientId, client.id) || !safeEqual(clientSecret, client.secret)) {
      return oauthErr(401, 'invalid_client', 'client credentials are invalid')
    }

    const grantType = form['grant_type'] ?? ''

    // 3) منح رمز التفويض
    if (grantType === 'authorization_code') {
      const code = form['code'] ?? ''
      const redirectUri = form['redirect_uri'] ?? ''
      const verifier = form['code_verifier'] ?? ''
      if (!code || !redirectUri) {
        return oauthErr(400, 'invalid_request', 'code and redirect_uri are required')
      }

      const verdict = await verifyJwt(code, this.signingKey, this.issuer, this.t())
      if (!verdict.ok) return oauthErr(400, 'invalid_grant', `code is invalid (${verdict.reason})`)
      const payload = verdict.payload
      if (payload.typ !== 'code') return oauthErr(400, 'invalid_grant', 'token is not an authorization code')
      if (payload.cid !== clientId) return oauthErr(400, 'invalid_grant', 'code was issued to another client')
      if (payload.red !== redirectUri) {
        return oauthErr(400, 'invalid_grant', 'redirect_uri does not match the authorization request')
      }

      // PKCE S256 إلزامي عند وجود التحدي
      if (payload.chal) {
        if (!verifier) return oauthErr(400, 'invalid_request', 'code_verifier is required')
        const computed = await sha256B64Url(verifier)
        if (!safeEqual(computed, payload.chal)) {
          return oauthErr(400, 'invalid_grant', 'code_verifier does not match the challenge')
        }
      }

      // الاستخدام الواحد: إدراج jti — التعارض = إعادة تشغيل
      try {
        await this.db.insert('mcp_oauth_codes', {
          jti: payload.jti,
          user_id: payload.sub,
          expires_at: new Date(payload.exp * 1000).toISOString(),
        })
      } catch (err) {
        const code = (err as { code?: string }).code
        const status = (err as { status?: number }).status
        if (code === '23505' || status === 409) {
          return oauthErr(400, 'invalid_grant', 'authorization code has already been used')
        }
        // فشل خادم = رفض (fail-closed — لا نصدر رموزًا بلا ضمان الاستخدام الواحد)
        return oauthErr(503, 'server_error', 'could not persist code state')
      }
      // تنظيف أفضل-جهد للرموز المنتهية (لا يفشل الطلب)
      try {
        await this.db.delete('mcp_oauth_codes', {
          expires_at: `lt.${new Date(this.t() * 1000 - 86_400_000).toISOString()}`,
        })
      } catch { /* أفضل جهد */ }

      return json(200, await this.issueTokens(payload.sub, clientId, payload.scope))
    }

    // 4) منح التجديد
    if (grantType === 'refresh_token') {
      const refreshToken = form['refresh_token'] ?? ''
      if (!refreshToken) return oauthErr(400, 'invalid_request', 'refresh_token is required')
      const verdict = await verifyJwt(refreshToken, this.signingKey, this.issuer, this.t())
      if (!verdict.ok) {
        return oauthErr(400, 'invalid_grant', `refresh token is invalid (${verdict.reason})`)
      }
      const payload = verdict.payload
      if (payload.typ !== 'refresh') {
        return oauthErr(400, 'invalid_grant', 'token is not a refresh token')
      }
      if (payload.cid !== clientId) {
        return oauthErr(400, 'invalid_grant', 'token was issued to another client')
      }

      // بوابة الخطة عند التجديد أيضًا (نزل من ماكس؟ لا تجديد)
      const gate = await checkMaxPlanGate(this.db, payload.sub)
      if (!gate.allowed) {
        await this.audit('mcp.oauth.plan_denied', clientId, payload.sub)
        return oauthErr(403, 'invalid_grant', 'subscription no longer includes MCP (max plan required)')
      }

      return json(200, await this.issueTokens(payload.sub, clientId, payload.scope))
    }

    return oauthErr(400, 'unsupported_grant_type', 'only authorization_code and refresh_token are supported')
  }

  /** إصدار زوج الرموز (access + refresh) */
  private async issueTokens(userId: string, clientId: string, scope: string): Promise<unknown> {
    const t = this.t()
    const base = {
      iss: this.issuer,
      sub: userId,
      cid: clientId,
      scope,
    }
    const access = await signJwt(
      { ...base, typ: 'access', jti: crypto.randomUUID(), iat: t, exp: t + ACCESS_TTL_SEC },
      this.signingKey,
    )
    const refresh = await signJwt(
      { ...base, typ: 'refresh', jti: crypto.randomUUID(), iat: t, exp: t + REFRESH_TTL_SEC },
      this.signingKey,
    )
    return {
      access_token: access,
      token_type: 'Bearer',
      expires_in: ACCESS_TTL_SEC,
      refresh_token: refresh,
      scope,
    }
  }

  // ── تحقق access token لمسار JSON-RPC (يُحقن في mcp-core) ──
  async verifyAccessTokenUser(token: string): Promise<OAuthTokenOutcome> {
    const verdict = await verifyJwt(token, this.signingKey, this.issuer, this.t())
    if (!verdict.ok) return { ok: false, reason: verdict.reason }
    if (verdict.payload.typ !== 'access') return { ok: false, reason: 'typ' }

    // حساب موقوف؟ (نفس فحص rise_ — fail-closed)
    try {
      const profile = (await this.db.maybeSingle('profiles', {
        select: 'suspended',
        filters: { id: `eq.${verdict.payload.sub}` },
      })) as { suspended?: boolean } | null
      if (profile?.suspended === true) return { ok: false, reason: 'suspended' }
    } catch {
      return { ok: false, reason: 'db-error' }
    }
    return { ok: true, userId: verdict.payload.sub }
  }

  /** تدقيق أحداث التفويض (أفضل جهد — لا يفشل الطلب) */
  private async audit(action: string, clientId: string, userId: string | null): Promise<void> {
    try {
      await this.db.insert('audit_logs', {
        actor_user_id: userId ?? '00000000-0000-0000-0000-000000000000',
        action,
        target_type: 'mcp_oauth',
        target_id: clientId,
        metadata: { clientId },
        ip_address: null,
        user_agent: null,
      })
    } catch { /* أفضل جهد */ }
  }
}

// ──────────────────── من mcp/index.ts ────────────────────
// ============================================================
// supabase/functions/mcp/index.ts — خادم MCP لأوج (المرحلة 10-ب/ج)
//
// نقطة الدخول: خادم MCP كامل على Supabase Edge Functions —
// بروتوكول JSON-RPC 2.0 بنقل Streamable HTTP (stateless: كل
// حالة الربط = مفتاح Bearer). النواة في _shared/mcp-core.ts
// والأدوات الثمانية في _shared/mcp-tools.ts وطبقة OAuth لربط
// ChatGPT في _shared/oauth-core.ts:
//
//   GET  /?oauth=metadata   → بيانات خادم التفويض (RFC 8414)
//   GET  /?oauth=authorize  → موافقة عربية ثم 302 مع code
//   POST /?oauth=token      → code/refresh → رموز access+refresh
//   POST /                  → JSON-RPC: Bearer rise_ أو Bearer JWT
//
// النشر — مساران:
//   أ) CLI (كامل البنية): supabase functions deploy mcp --no-verify-jwt
//      (--no-verify-jwt إلزامي: مفاتيح rise_ ليست Supabase JWT — بوابة
//       المنصة سترفضها قبل وصول الكود؛ التحقق يتم داخل mcp-core)
//   ب) لوحة Dashboard (ملف واحد فقط): الصق الملف المدموج
//      supabase/dist/mcp.dashboard.ts — وُلّد بـ
//      scripts/build-dashboard-bundles.mjs (لا تحرره يدويًا)
//      التفاصيل الكاملة: supabase/DEPLOY.md
//
// نقطة النهاية بعد النشر:
//   https://<project-ref>.supabase.co/functions/v1/mcp
//   Authorization: Bearer rise_… (أنشئه من الإعدادات — خطة ماكس)
//   أو Bearer <access_token> بعد تفويض OAuth من ChatGPT
//
// متغيرات البيئة (تُحقن تلقائيًا من المنصة):
//   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
//   (بيانات عميل OAuth تُقرأ من app_config — هجرة 034)
// ============================================================


function fail(msg: string, status = 500): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

// نقطة MCP كاملة (هوية مُصدر رموز OAuth + رابط الردود)
const issuer = `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/mcp`

// مفتاح توقيع OAuth مشتق من مفتاح الخدمة (ثابت عبر نسخ الدالة)
const signingKey = await deriveSigningKey(serviceKey)

// مثيل واحد لكل نسخة دالة (يحمل حدود المعدل في الذاكرة)
const server = new McpServer({
  baseUrl: supabaseUrl,
  serviceKey,
  oauthTokenVerifier: (token: string) => oauth.verifyAccessTokenUser(token),
})

// طبقة OAuth (عميل PostgREST خاص بها — خفيف وبلا حالة)
const oauth = new McpOAuth({
  db: new Postgrest({ baseUrl: supabaseUrl, serviceKey: serviceKey }),
  issuer,
  signingKey,
})

/** تحويل ترويسات Request إلى خريطة صغيرة المفاتيح */
function headersToRecord(req: Request): Record<string, string> {
  const out: Record<string, string> = {}
  req.headers.forEach((value, key) => {
    out[key.toLowerCase()] = value
  })
  return out
}

Deno.serve(
  // PORT للتشغيل المحلي والاختبارات — منصة Supabase تدير المنفذ
  // بنفسها وتتجاهل هذا الخيار بأمان
  { port: Number(Deno.env.get('PORT') || 8000) },
  (req: Request): Response | Promise<Response> => {
    // بلا مفاتيح المنصة → رفض صريح (fail-closed — لا وضع mock هنا)
    if (!supabaseUrl || !serviceKey) {
      return fail('الوظيفة غير مهيأة: SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY مفقودة')
    }

    // ── مسارات OAuth (?oauth=…) قبل توزيع JSON-RPC ──
    const url = new URL(req.url)
    const oauthAction = url.searchParams.get('oauth')
    if (oauthAction) {
      switch (oauthAction) {
        case 'metadata':
          if (req.method !== 'GET') return fail('metadata تدعم GET فقط', 405)
          return toResponse(oauth.metadata())
        case 'authorize':
          if (req.method !== 'GET') return fail('authorize تدعم GET فقط', 405)
          return oauth
            .handleAuthorize(url, headersToRecord(req))
            .then(toResponse)
            .catch((err: Error) => fail(`خطأ غير متوقع: ${err?.message ?? 'غير معروف'}`))
        case 'token':
          if (req.method !== 'POST') return fail('token تدعم POST فقط', 405)
          return req
            .text()
            .then((rawBody) =>
              oauth.handleTokenPost(
                req.headers.get('content-type') ?? '',
                rawBody,
                headersToRecord(req),
              ),
            )
            .then(toResponse)
            .catch((err: Error) => fail(`خطأ غير متوقع: ${err?.message ?? 'غير معروف'}`))
        default:
          return fail(`إجراء oauth غير معروف: ${oauthAction}`, 400)
      }
    }

    switch (req.method) {
      case 'OPTIONS':
        return toResponse(server.handleOptions())
      case 'GET':
        return toResponse(server.handleGet())
      case 'POST':
        return req
          .text()
          .then((rawBody) =>
            server.handlePost({
              method: 'POST',
              headers: headersToRecord(req),
              rawBody,
            }),
          )
          .then(toResponse)
          .catch((err: Error) => fail(`خطأ غير متوقع: ${err?.message ?? 'غير معروف'}`))
      default:
        return fail('هذه النقطة تدعم POST فقط (JSON-RPC)', 405)
    }
  },
)

/** تحويل نتيجة النواة إلى Response */
function toResponse(result: { status: number; headers: Record<string, string>; body: string | null }): Response {
  return new Response(result.body, {
    status: result.status,
    headers: result.headers,
  })
}

