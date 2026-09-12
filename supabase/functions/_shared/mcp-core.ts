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

import { Postgrest, PostgrestError } from './postgrest.ts'
import { MCP_TOOLS_BY_NAME, publicToolsList } from './mcp-tools.ts'

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

export class RateLimiter {
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

export interface McpServerDeps {
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
}

export interface McpHttpRequest {
  method: string
  /** ترويسات صغيرة المفاتيح { authorization: 'Bearer …' } */
  headers: Record<string, string>
  rawBody: string
}

export interface McpHttpResult {
  status: number
  headers: Record<string, string>
  body: string | null
}

export interface AuditEntry {
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
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// ── القسم: المعالج الرئيسي ─────────────────────

/** مثيل خادم — أنشئه مرة واحدة لكل نسخة دالة (يحمل الحدود) */
export class McpServer {
  private db: Postgrest
  private limiter: RateLimiter
  private audit: (entry: AuditEntry) => Promise<void>

  constructor(deps: McpServerDeps) {
    this.db = new Postgrest({
      baseUrl: deps.baseUrl,
      serviceKey: deps.serviceKey,
      fetchImpl: deps.fetchImpl,
    })
    this.limiter = new RateLimiter(deps.now ?? Date.now)
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

    // 2) المصادقة: Bearer rise_… حصرًا (رفض واعٍ لأي مصادقة أخرى)
    const authHeader = req.headers['authorization'] || ''
    if (!authHeader.startsWith('Bearer rise_')) {
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

    const apiKey = authHeader.slice('Bearer '.length).trim()
    const auth = await this.authenticate(apiKey)
    if (!auth.ok) {
      console.warn('[mcp/edge] auth failed:', auth.reason)
      return {
        status: 401,
        headers: corsHeaders(),
        body: rpcErrorBody(null, -32001, 'مفتاح MCP غير صالح أو ملغى'),
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
        metadata: { reason: gate.reason, endpoint: 'supabase-edge' },
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

  // ── المصادقة: تجزئة → بحث → last_used_at ──
  private async authenticate(apiKey: string): Promise<{ ok: true; userId: string } | { ok: false; reason: string }> {
    try {
      const hash = await sha256Hex(apiKey)
      const row = (await this.db.maybeSingle('user_api_keys', {
        select: 'user_id',
        filters: { key_hash: `eq.${hash}` },
      })) as { user_id?: string } | null
      if (!row?.user_id) return { ok: false, reason: 'unknown-key' }

      // تحديث last_used_at (أفضل جهد — لا يمنع الطلب)
      try {
        await this.db.patch('user_api_keys', { key_hash: `eq.${hash}` }, { last_used_at: new Date().toISOString() })
      } catch { /* أفضل جهد فقط */ }

      // حساب موقوف؟ (fail-closed: فشل القراءة = رفض)
      const profile = (await this.db.maybeSingle('profiles', {
        select: 'suspended',
        filters: { id: `eq.${row.user_id}` },
      })) as { suspended?: boolean } | null
      if (profile?.suspended === true) return { ok: false, reason: 'suspended' }

      return { ok: true, userId: row.user_id }
    } catch (err) {
      return { ok: false, reason: `db-error:${(err as Error)?.message ?? ''}` }
    }
  }

  // ── بوابة الخطة (نفس منطق مسار Vercel حرفيًا) ──
  private async checkMaxPlanGate(userId: string): Promise<{ allowed: boolean; reason?: string }> {
    try {
      const data = (await this.db.maybeSingle('user_subscriptions', {
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
}
