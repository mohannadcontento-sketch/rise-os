// ============================================================
// mock-postgrest.ts — خادم PostgREST وهمي لاختبار Edge Functions
//
// يحاكي عقد PostgREST الحقيقي كما تستخدمه الوظائف: فلاتر
// eq./in./gte./is.null، الترتيب والحد، Accept: vnd.pgrst.object
// (مع 406 PGRST116 عند فراغ النتيجة — نفس سلوك الخادم
// الحقيقي)، upsert عبر on_conflict + Prefer merge-duplicates،
// PATCH الجزئي، ودوال RPC المستخدمة (البوابة الذرية للبوش
// + إنشاء/تحديث المهام المركّبة).
//
// كل الحالة في الذاكرة (MockDb) — الاختبارات تملؤها وتفحصها
// بعد الاستدعاء. الحالة قابلة للمشاركة بين عدة وظائف اختبار.
// ============================================================

/** تنبيه: نص بسيط بلا تبعيات Deno.test ليعمل كوحدة مشتركة */

export interface MockNotification {
  id: string
  user_id: string
  type: string
  title: string
  body: string
  icon: string | null
  action_url: string | null
  priority: 'normal' | 'high'
  pushed_at: string | null
  created_at: string
  metadata?: Record<string, unknown>
}

export interface MockPushSubscription {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  revoked_at: string | null
  last_push_at: string | null
}

export interface MockDb {
  profiles: { id: string; suspended: boolean }[]
  apiKeys: { key_hash: string; user_id: string; last_used_at: string | null }[]
  userSubscriptions: { user_id: string; plan: string; status: string; expires_at: string | null }[]
  tasks: Record<string, unknown>[]
  subtasks: Record<string, unknown>[]
  projects: Record<string, unknown>[]
  habits: Record<string, unknown>[]
  habitLogs: Record<string, unknown>[]
  plannerItems: Record<string, unknown>[]
  dailyScores: Record<string, unknown>[]
  journals: Record<string, unknown>[]
  notifications: MockNotification[]
  pushSubscriptions: MockPushSubscription[]
  pushDispatchLog: Record<string, unknown>[]
  auditLogs: Record<string, unknown>[]
  appConfig: { key: string; value: string }[]
  /** تفضيلات البوش المبسطة للبوابة (الافتراضي: مفعّل للجميع) */
  pushPrefs: Map<string, { push_enabled: boolean; categories: Record<string, boolean> }>
  /** تسجيل كل نداءات RPC (للتحقق في الاختبارات) */
  rpcCalls: { fn: string; args: Record<string, unknown> }[]
  /** آخر ترويسات وصلت (للتحقق من مفتاح الخدمة) */
  lastHeaders: Record<string, string> | null
  /** اختبارات: أخفق نداء البوابة التالي بخطأ 500 (مرة واحدة) */
  gateFailNext?: boolean
}

export function createMockDb(): MockDb {
  return {
    profiles: [],
    apiKeys: [],
    userSubscriptions: [],
    tasks: [],
    subtasks: [],
    projects: [],
    habits: [],
    habitLogs: [],
    plannerItems: [],
    dailyScores: [],
    journals: [],
    notifications: [],
    pushSubscriptions: [],
    pushDispatchLog: [],
    auditLogs: [],
    appConfig: [],
    pushPrefs: new Map(),
    rpcCalls: [],
    lastHeaders: null,
  }
}

// ── القسم: أدوات الفلاتر والاستعلام ─────────────────────

interface ParsedQuery {
  filters: Record<string, string>
  order: { col: string; dir: 'asc' | 'desc' }[]
  limit: number | null
  onConflict: string[] | null
}

function parseQuery(url: URL): ParsedQuery {
  const filters: Record<string, string> = {}
  const order: { col: string; dir: 'asc' | 'desc' }[] = []
  let limit: number | null = null
  let onConflict: string[] | null = null

  for (const [key, value] of url.searchParams.entries()) {
    if (key === 'select') continue
    if (key === 'order') {
      for (const part of value.split(',')) {
        const [col, dir] = part.split('.')
        order.push({ col, dir: dir === 'desc' ? 'desc' : 'asc' })
      }
      continue
    }
    if (key === 'limit') {
      limit = Number(value)
      continue
    }
    if (key === 'on_conflict') {
      onConflict = value.split(',')
      continue
    }
    filters[key] = value
  }
  return { filters, order, limit, onConflict }
}

function matches(row: Record<string, unknown>, filters: Record<string, string>): boolean {
  for (const [key, raw] of Object.entries(filters)) {
    const cell = row[key]
    if (raw === 'is.null') {
      if (cell !== null && cell !== undefined) return false
      continue
    }
    if (raw.startsWith('eq.')) {
      if (String(cell ?? '') !== raw.slice(3)) return false
      continue
    }
    if (raw.startsWith('neq.')) {
      if (String(cell ?? '') === raw.slice(4)) return false
      continue
    }
    if (raw.startsWith('gte.')) {
      if (String(cell ?? '') < raw.slice(4)) return false
      continue
    }
    if (raw.startsWith('in.')) {
      const inner = raw.slice(3).replace(/^\(/, '').replace(/\)$/, '')
      const items = inner.split(',').map((s) => s.trim().replace(/^"|"$/g, ''))
      if (!items.includes(String(cell ?? ''))) return false
      continue
    }
    return false // فلتر غير مفهوم = لا تطابق (fail-closed)
  }
  return true
}

function applyOrder(rows: Record<string, unknown>[], order: ParsedQuery['order']): Record<string, unknown>[] {
  if (order.length === 0) return rows
  const sorted = [...rows]
  sorted.sort((a, b) => {
    for (const { col, dir } of order) {
      const av = String(a[col] ?? '')
      const bv = String(b[col] ?? '')
      if (av === bv) continue
      return (av < bv ? -1 : 1) * (dir === 'desc' ? -1 : 1)
    }
    return 0
  })
  return sorted
}

function uuid(): string {
  return crypto.randomUUID()
}

// ── القسم: الجداول المتاحة ─────────────────────

const TABLES: Record<string, (db: MockDb) => Record<string, unknown>[]> = {
  user_api_keys: (db) => db.apiKeys as unknown as Record<string, unknown>[],
  profiles: (db) => db.profiles as unknown as Record<string, unknown>[],
  user_subscriptions: (db) => db.userSubscriptions as unknown as Record<string, unknown>[],
  tasks: (db) => db.tasks,
  subtasks: (db) => db.subtasks,
  projects: (db) => db.projects,
  habits: (db) => db.habits,
  habit_logs: (db) => db.habitLogs,
  planner_items: (db) => db.plannerItems,
  daily_scores: (db) => db.dailyScores,
  journals: (db) => db.journals,
  notifications: (db) => db.notifications as unknown as Record<string, unknown>[],
  push_subscriptions: (db) => db.pushSubscriptions as unknown as Record<string, unknown>[],
  push_dispatch_log: (db) => db.pushDispatchLog,
  audit_logs: (db) => db.auditLogs,
  app_config: (db) => db.appConfig as unknown as Record<string, unknown>[],
}

// ── القسم: الخادم ─────────────────────

export interface MockServer {
  url: string
  close(): Promise<void>
}

export function startMockPostgrest(db: MockDb, port = 0): Promise<MockServer> {
  const handler = (req: Request): Response | Promise<Response> => {
    const headers: Record<string, string> = {}
    req.headers.forEach((v, k) => (headers[k.toLowerCase()] = v))
    db.lastHeaders = headers

    const url = new URL(req.url)
    const path = url.pathname

    // ── مسار RPC ──
    const rpcMatch = path.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/)
    if (rpcMatch && req.method === 'POST') {
      return handleRpc(db, rpcMatch[1], req)
    }

    // ── مسار جدول ──
    const tableMatch = path.match(/^\/rest\/v1\/([a-z_]+)$/)
    if (tableMatch) {
      const getter = TABLES[tableMatch[1]]
      if (!getter) return pgrstError(404, `table not found: ${tableMatch[1]}`)
      const qs = parseQuery(url)

      if (req.method === 'GET') {
        let rows = getter(db).filter((r) => matches(r, qs.filters))
        rows = applyOrder(rows, qs.order)
        if (qs.limit) rows = rows.slice(0, qs.limit)
        const wantsObject = (headers['accept'] || '').includes('vnd.pgrst.object')
        if (wantsObject) {
          if (rows.length === 0) {
            return pgrstError(406, 'JSON object requested, multiple (or no) rows returned', 'PGRST116')
          }
          return json(rows[0])
        }
        return json(rows)
      }

      if (req.method === 'POST') {
        return handleTablePost(db, tableMatch[1], qs, req, getter)
      }

      if (req.method === 'PATCH') {
        return (async () => {
          const body = await readBody(req)
          const rows = getter(db).filter((r) => matches(r, qs.filters))
          for (const row of rows) Object.assign(row, body)
          return new Response(null, { status: 204 })
        })()
      }

      return pgrstError(405, 'method not allowed')
    }

    return pgrstError(404, `route not found: ${path}`)
  }

  return new Promise((resolve) => {
    const server = Deno.serve({ port }, handler)
    // port 0 → نظام التشغيل يختار منفذًا حرًّا؛ addr يحمل الفعلي
    const actualPort = (server.addr as { port: number }).port
    resolve({
      url: `http://127.0.0.1:${actualPort}`,
      close: () => server.shutdown(),
    })
  })
}

// ── القسم: مساعدات الرد ─────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function pgrstError(status: number, message: string, code?: string): Response {
  return json({ message, code, details: null, hint: null }, status)
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await req.text()) as Record<string, unknown>
  } catch {
    return {}
  }
}

// ── القسم: POST على جدول (إدراج/upsert) ─────────────────────

function handleTablePost(
  db: MockDb,
  table: string,
  qs: ParsedQuery,
  req: Request,
  getter: (db: MockDb) => Record<string, unknown>[],
): Promise<Response> {
  return (async () => {
    const body = await readBody(req)
    const prefer = (db.lastHeaders?.['prefer'] || '')

    // upsert: ابحث بأعمدة التعارض ثم ادمج أو أدرج
    if (qs.onConflict) {
      const rows = getter(db)
      const key = qs.onConflict
      const existing = rows.find((r) =>
        key.every((col) => String(r[col] ?? '') === String(body[col] ?? '')),
      )
      if (existing) Object.assign(existing, body)
      else rows.push({ id: uuid(), ...body })
      const merged = existing ?? rows[rows.length - 1]
      if (prefer.includes('return=representation')) {
        if ((db.lastHeaders?.['accept'] || '').includes('vnd.pgrst.object')) return json(merged)
        return json([merged])
      }
      return new Response(null, { status: 201 })
    }

    // إدراج عادي (audit_logs)
    getter(db).push({ id: uuid(), ...body })
    if (prefer.includes('return=representation')) return json([body])
    return new Response(null, { status: 201 })
  })()
}

// ── القسم: دوال RPC ─────────────────────

function handleRpc(db: MockDb, fn: string, req: Request): Promise<Response> {
  return (async () => {
    const args = await readBody(req)
    db.rpcCalls.push({ fn, args })

    switch (fn) {
      // ── بوابة البوش الذرية (تكافؤ الهجرة 029 المبسطة) ──
      case 'gate_push_for_notification': {
        // اختبارات: إخفاق مُفتعل مرة واحدة (500 من الخادم)
        if (db.gateFailNext) {
          db.gateFailNext = false
          return pgrstError(500, 'internal error (simulated)')
        }
        const id = String(args.p_notification_id ?? '')
        const n = db.notifications.find((x) => x.id === id)
        if (!n) return json({ ok: false, reason: 'not_found' })

        const prefs = db.pushPrefs.get(n.user_id) ?? { push_enabled: true, categories: {} }
        if (!prefs.push_enabled) return json({ ok: false, reason: 'push_disabled' })

        const category = String(
          (n.metadata as Record<string, unknown> | undefined)?.category ??
          (n.type === 'community' ? 'community' : n.type === 'reminder' ? 'reminders' : 'important'),
        )
        if (prefs.categories[category] === false) {
          return json({ ok: false, reason: 'category_disabled', category })
        }

        // الادعاء الذري — نداء متزامن ثانٍ لن يحصل عليه
        if (n.pushed_at) return json({ ok: false, reason: 'already_pushed' })
        n.pushed_at = new Date().toISOString()

        return json({
          ok: true,
          notification_id: n.id,
          user_id: n.user_id,
          category,
          priority: n.priority,
          title: n.title,
          body: n.body,
          icon: n.icon,
          action_url: n.action_url,
        })
      }

      case 'touch_push_subscription': {
        const ep = String(args.p_endpoint ?? '')
        const sub = db.pushSubscriptions.find((s) => s.endpoint === ep)
        if (sub) sub.last_push_at = new Date().toISOString()
        return json({ ok: true })
      }

      case 'revoke_push_subscription': {
        const ep = String(args.p_endpoint ?? '')
        const sub = db.pushSubscriptions.find((s) => s.endpoint === ep)
        if (sub) {
          sub.revoked_at = new Date().toISOString()
        }
        return json({ ok: true })
      }

      // ── المهام المركّبة (تكافؤ الهجرة 016) ──
      case 'create_task_with_subtasks': {
        const userId = String(args.p_user_id ?? '')
        const task = (args.p_task ?? {}) as Record<string, unknown>
        const subtasks = (args.p_subtasks ?? []) as Record<string, unknown>[]
        const taskRow: Record<string, unknown> = {
          id: uuid(),
          user_id: userId,
          title: task.title ?? null,
          description: task.description ?? null,
          status: task.status ?? 'todo',
          priority: task.priority ?? 'medium',
          project_id: task.project_id ?? null,
          due_date: task.due_date ?? null,
          due_time: task.due_time ?? null,
          estimated_min: task.estimated_min ?? null,
          order: task.order ?? 0,
          completed_at: null,
        }
        db.tasks.push(taskRow)
        const insertedSubs = subtasks.map((s) => ({
          id: uuid(),
          task_id: taskRow.id,
          title: s.title ?? null,
          completed: false,
          order: s.order ?? 0,
        }))
        db.subtasks.push(...insertedSubs)
        return json({ task: taskRow, subtasks: insertedSubs })
      }

      case 'update_task_with_subtasks': {
        const userId = String(args.p_user_id ?? '')
        const taskId = String(args.p_task_id ?? '')
        const task = (args.p_task ?? {}) as Record<string, unknown>
        const row = db.tasks.find((t) => String(t.id) === taskId && String(t.user_id) === userId)
        if (!row) return pgrstError(400, 'task not found or owned')

        if (task.title !== undefined) row.title = task.title
        if (task.status !== undefined) row.status = task.status
        if (task.due_date !== undefined) row.due_date = task.due_date
        // completed_at: COALESCE(completed_at, now()) عند done
        if (task.status === 'done' && !row.completed_at) {
          row.completed_at = new Date().toISOString()
        }
        const subs = db.subtasks.filter((s) => s.task_id === row.id)
        return json({ task: row, subtasks: subs })
      }

      default:
        return pgrstError(404, `function not found: ${fn}`)
    }
  })()
}
