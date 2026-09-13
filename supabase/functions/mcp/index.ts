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

import { McpServer, sha256Hex } from '../_shared/mcp-core.ts'
import { McpOAuth, deriveSigningKey } from '../_shared/oauth-core.ts'
import { Postgrest } from '../_shared/postgrest.ts'

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
