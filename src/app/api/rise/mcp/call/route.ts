import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { logAudit } from '@/lib/audit'
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase'
import { MCP_TOOLS_BY_NAME, publicToolsList } from '@/lib/mcp/tools'
import { checkMcpRateLimit } from '@/lib/mcp/rate-limit'

// ============================================================
// /api/rise/mcp/call — خادم MCP لأوج (المرحلة 10 — MCP للـMax)
//
// «الميزة الفارقة» لخطة ماكس: عميل AI خارجي (Claude / ChatGPT
// connector / Cursor…) يصل لبيانات المستخدم وأدواته عبر بروتوكول
// MCP بنقل Streamable HTTP: كل طلب POST واحد يحمل رسالة JSON-RPC
// 2.0 (أو مصفوفة batch) ويعاد الرد كـJSON واحد — بلا جلسات ولا
// SSE (خادمنا stateless بطبيعته: كل حالة الربط = مفتاح Bearer).
//
// سلسلة الأمان (بالترتيب، كلها خادمية ولا يمكن خداعها من الواجهة):
//   0) middleware: حد IP 60 طلب/دقيقة + مستثنى من شرط Origin/
//      Idempotency (عملاء MCP خارجيون لا يرسلونها أصلًا)
//   1) المصادقة: Authorization: Bearer rise_… فقط — الكوكيز
//      تُرفض عمدًا في هذا المسار (المصادقة ambient = ثغرة CSRF؛
//      عميل MCP حقيقي يرسل المفتاح دائمًا). المفتاح يُحل عبر
//      SHA-256 → user_api_keys → userId (requireUser يربط سياق
//      sb() بالمستخدم: مستودعاتنا تفرض الملكية صراحة).
//   2) بوابة الخطة: user_subscriptions → plan == 'max' نشط
//      (تُفحص في كل طلب — مستخدم نزل من ماكس يتوقف فورًا حتى
//      لو مفتاحه القديم صالح). فشل القراءة = رفض (fail-closed).
//      وضع التطوير المحلي (mock) فقط يسمح مع تحذير.
//   3) حدود المعدل: 30/د إجمالي + 10/د كتابة لكل مستخدم.
//   4) Validation: zod strict لكل أداة (يُطرد أي حقل مجهول).
//   5) Audit Log: كل أداة كتابة + كل رفض خطة → audit_logs.
//
// الطرق المفهومة: initialize / notifications/* (202 بلا رد) /
// ping / tools/list / tools/call / resources/list / prompts/list
// (فارغة — إعلان متحفظ لعملاء يتحققون منها). GET → 405 (لا SSE).
// ============================================================

export const dynamic = 'force-dynamic'

/** أحدث نسخة ندعمها + النسخ الشائعة الأقدم (نبادلها بإصدار العميل) */
const PROTOCOL_DEFAULT = '2025-06-18'
const PROTOCOL_KNOWN = new Set(['2025-06-18', '2025-03-26', '2024-11-05'])

const SERVER_INFO = { name: 'awj-mcp', version: '1.0.0' }

const INSTRUCTIONS_AR =
  'أوج (awj.life) هو نظام حياة شخصي عربي: مهام، عادات، مخطط يومي، يوميات، ودرجة إنتاجية. ' +
  'ابدأ بـ list_tasks و list_habits و get_today_plan لتفهم يوم المستخدم، وسجّل له بالمهام والعادات ' +
  'واليوميات عند الطلب. الأدوات تعمل على بيانات المستخدم نفسه فقط، ولا توجد أي عمليات حذف.'

// ── القسم: رؤوس CORS (هذا المسار Bearer فقط — لا كوكيز، فلا مخاطرة CSRF) ──
function corsHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version',
    'Access-Control-Expose-Headers': 'Mcp-Session-Id',
    ...extra,
  }
}

// ── القسم: مساعدات JSON-RPC ─────────────────────

type JsonRpcId = string | number | null

function rpcResult(id: JsonRpcId, result: unknown, status = 200, headers?: Record<string, string>) {
  return NextResponse.json({ jsonrpc: '2.0', id, result }, { status, headers })
}

function rpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  status = 200,
  headers?: Record<string, string>,
) {
  return NextResponse.json(
    { jsonrpc: '2.0', id, error: { code, message } },
    { status, headers },
  )
}

/** هل الرسالة إشعار (بلا id)? الإشعارات لا تُرَد إطلاقًا وفق المواصفة */
function isNotification(msg: unknown): boolean {
  return (
    !!msg &&
    typeof msg === 'object' &&
    (msg as any).jsonrpc === '2.0' &&
    typeof (msg as any).method === 'string' &&
    (msg as any).id === undefined
  )
}

// ── القسم: بوابة الخطة (فحص خادمي في كل طلب) ─────────────────────

interface PlanGate {
  allowed: boolean
  reason?: string
}

async function checkMaxPlanGate(userId: string): Promise<PlanGate> {
  // وضع التطوير المحلي فقط (بلا Supabase) — البوابة الحقيقية
  // إلزامية في الإنتاج ولا تُتجاوز أبدًا هناك
  if (!isSupabaseConfigured()) {
    console.warn('[mcp/call] dev/mock mode: plan gate degraded (allowed)')
    return { allowed: true }
  }
  const admin = await getSupabaseAdmin()
  if (!admin) return { allowed: false, reason: 'admin-unavailable' } // fail-closed

  const { data, error } = await (admin as any)
    .from('user_subscriptions')
    .select('plan, status, expires_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) return { allowed: false, reason: 'read-failed' } // fail-closed
  if (!data) return { allowed: false, reason: 'plan-free' } // لا صف = مجاني

  const active =
    data.status === 'active' &&
    (!data.expires_at || new Date(data.expires_at).getTime() > Date.now())
  if (data.plan === 'max' && active) return { allowed: true }
  return { allowed: false, reason: `plan-${data.plan}${active ? '' : '-inactive'}` }
}

// ── القسم: OPTIONS (preflight لعملاء المتصفح) ─────────────────────

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() })
}

// ── القسم: GET — لا بث SSE (خادمنا stateless) ─────────────────────

export async function GET() {
  return rpcError(null, -32000, 'هذه النقطة تدعم POST فقط (JSON-RPC) — لا تدعم بث SSE', 405, corsHeaders())
}

// ── القسم: POST — قلب الخادم ─────────────────────

export async function POST(req: NextRequest) {
  // 1) قراءة الجسم: خطأ التحليل = -32700 (قبل المصادقة — المواصفة
  //    تسمح برد الخطأ بلا هوية)
  let json: unknown
  try {
    json = JSON.parse(await req.text())
  } catch {
    return rpcError(null, -32700, 'خطأ في تحليل JSON', 400, corsHeaders())
  }

  // Array.isArray مباشرة في التعبير: يضيّق json إلى any[] في فرع
  // الصحة (المتغير المنفصل يفقد الترابط في TypeScript)
  const isBatch = Array.isArray(json)
  const messages: unknown[] = Array.isArray(json) ? json : [json]
  if (messages.length === 0) {
    return rpcError(null, -32600, 'طلب فارغ', 400, corsHeaders())
  }

  // 2) المصادقة: Bearer rise_… حصرًا (رفض واعٍ للكوكيز — يقطع CSRF
  //    من جذوره: لا مصادقة ambient في مسار الآلة هذا)
  const authHeader = req.headers.get('authorization') || ''
  if (!authHeader.startsWith('Bearer rise_')) {
    return rpcError(
      null,
      -32001,
      'مطلوب مفتاح MCP: Authorization: Bearer rise_… — أنشئه من الإعدادات (خطة ماكس)',
      401,
      corsHeaders({ 'WWW-Authenticate': 'Bearer realm="awj-mcp"' }),
    )
  }

  // requireUser يربط سياق الطلب (request-context يقرأ ترويسة
  // Authorization) ثم يحل المفتاح: rise_ → SHA-256 → user_api_keys
  const userId = await requireUser(req)
  if (!userId) {
    // مفتاح غير صالح/ملغى — لا نعرف المالك فلا سجل تدقيق دائم
    // (actor_user_id NOT NULL REFERENCES profiles) → كونسول فقط
    console.warn('[mcp/call] auth failed: invalid or revoked key')
    return rpcError(null, -32001, 'مفتاح MCP غير صالح أو ملغى', 401, corsHeaders())
  }

  // 3) بوابة الخطة: max نشط في كل طلب (نزول المستخدم يوقف المفتاح فورًا)
  const gate = await checkMaxPlanGate(userId)
  if (!gate.allowed) {
    await logAudit(req, userId, 'mcp.plan_denied', {
      resource: 'mcp',
      resourceId: 'call',
      details: { reason: gate.reason },
    })
    return rpcError(
      null,
      -32002,
      'أدوات MCP متاحة في خطة ماكس فقط — رقّ حسابك لتفعيلها',
      403,
      corsHeaders(),
    )
  }

  // 4) حد المعدل الإجمالي (لكل POST — يغطي كل الرسائل داخله)
  const total = checkMcpRateLimit(userId, false)
  if (!total.allowed) {
    // طوفان معدل: لا سجل دائم (يُغرق جدول التدقيق بلا فائدة) — كونسول
    console.warn('[mcp/call] rate limited (total)', { userId })
    return rpcError(
      null,
      -32003,
      `تجاوزت حد الطلبات (${total.retryAfterSec}s للإعادة)`,
      429,
      corsHeaders({ 'Retry-After': String(total.retryAfterSec ?? 60) }),
    )
  }

  // 5) توزيع الرسائل
  const responses: unknown[] = []
  let wroteSomething = false

  for (const msg of messages) {
    // إشعار صحيح → لا رد (202 لاحقًا لو كل الرسائل إشعارات)
    if (isNotification(msg)) continue

    // بنية غير صالحة (ليست jsonrpc/method) → -32600
    if (
      !msg ||
      typeof msg !== 'object' ||
      (msg as any).jsonrpc !== '2.0' ||
      typeof (msg as any).method !== 'string'
    ) {
      responses.push({ jsonrpc: '2.0', id: (msg as any)?.id ?? null, error: { code: -32600, message: 'طلب JSON-RPC غير صالح' } })
      continue
    }

    const { id, method, params } = msg as { id?: JsonRpcId; method: string; params?: any }
    const msgId: JsonRpcId = id === undefined ? null : id

    switch (method) {
      // ── المصافحة: قدراتنا = أدوات فقط (listChanged: بلا دفع) ──
      case 'initialize': {
        const requested = typeof params?.protocolVersion === 'string' ? params.protocolVersion : ''
        responses.push({
          jsonrpc: '2.0',
          id: msgId,
          result: {
            protocolVersion: PROTOCOL_KNOWN.has(requested) ? requested : PROTOCOL_DEFAULT,
            capabilities: { tools: { listChanged: false } },
            serverInfo: SERVER_INFO,
            instructions: INSTRUCTIONS_AR,
          },
        })
        break
      }

      case 'ping':
        responses.push({ jsonrpc: '2.0', id: msgId, result: {} })
        break

      case 'tools/list':
        responses.push({ jsonrpc: '2.0', id: msgId, result: { tools: publicToolsList() } })
        break

      // ── استدعاء أداة: القلب ──
      case 'tools/call': {
        const name = typeof params?.name === 'string' ? params.name : ''
        const tool = MCP_TOOLS_BY_NAME.get(name)
        if (!tool) {
          responses.push({
            jsonrpc: '2.0',
            id: msgId,
            error: {
              code: -32602,
              message: `أداة غير معروفة: ${name || '(فارغ)'} — المتاح: ${[...MCP_TOOLS_BY_NAME.keys()].join(', ')}`,
            },
          })
          break
        }

        // حدود الكتابة (10/د): قبل التنفيذ + قبل التدقيق
        if (tool.kind === 'write') {
          const w = checkMcpRateLimit(userId, true)
          if (!w.allowed) {
            console.warn('[mcp/call] rate limited (writes)', { userId, tool: name })
            responses.push({
              jsonrpc: '2.0',
              id: msgId,
              error: {
                code: -32003,
                message: `تجاوزت حد عمليات الكتابة (${w.retryAfterSec}s للإعادة)`,
                data: { retryAfterSec: w.retryAfterSec },
              },
            })
            break
          }
        }

        // Validation: zod strict — أول خطأ يرد للعميل نصًا
        const args = params?.arguments ?? {}
        const verdict = tool.validate(args)
        if (!verdict.ok) {
          responses.push({
            jsonrpc: '2.0',
            id: msgId,
            error: { code: -32602, message: `وسائط غير صالحة (${tool.name}): ${verdict.error}` },
          })
          break
        }

        // Audit: كل كتابة حساسة تُسجَّل (بلا قيم الوسائط — خصوصية
        // اليوميات: مفاتيح وأحجام فقط، لا محتوى)
        if (tool.kind === 'write') {
          wroteSomething = true
          await logAudit(req, userId, 'mcp.tool_call', {
            resource: 'mcp_tool',
            resourceId: tool.name,
            details: {
              argKeys: Object.keys(args ?? {}),
              argBytes: JSON.stringify(args ?? {}).length,
            },
          })
        }

        // التنفيذ: فشل الأداة = نتيجة isError (مواصفة MCP) وليس خطأ
        // بروتوكول — العميل الخارجي يقرأه ويعيد الصياغة للمستخدم
        try {
          const result = await tool.execute(userId, verdict.value)
          responses.push({
            jsonrpc: '2.0',
            id: msgId,
            result: {
              content: [{ type: 'text', text: JSON.stringify(result, null, 1) }],
              structuredContent: result,
              isError: false,
            },
          })
        } catch (err) {
          responses.push({
            jsonrpc: '2.0',
            id: msgId,
            result: {
              content: [
                { type: 'text', text: `تعذر تنفيذ ${tool.name}: ${(err as Error).message}` },
              ],
              isError: true,
            },
          })
        }
        break
      }

      // ── إعلان متحفظ لعملاء يتحققون منها قبل initialize ──
      case 'resources/list':
        responses.push({ jsonrpc: '2.0', id: msgId, result: { resources: [] } })
        break
      case 'prompts/list':
        responses.push({ jsonrpc: '2.0', id: msgId, result: { prompts: [] } })
        break

      default:
        responses.push({
          jsonrpc: '2.0',
          id: msgId,
          error: { code: -32601, message: `طريقة غير معروفة: ${method}` },
        })
    }
  }

  // 6) الرد النهائي
  if (responses.length === 0) {
    // كل الرسائل إشعارات → 202 بلا جسم (مواصفة Streamable HTTP)
    return new NextResponse(null, { status: 202, headers: corsHeaders() })
  }
  if (isBatch) {
    return NextResponse.json(responses, { status: 200, headers: corsHeaders() })
  }
  return NextResponse.json(responses[0], { status: 200, headers: corsHeaders() })
}
