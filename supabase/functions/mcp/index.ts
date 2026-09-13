// ============================================================
// supabase/functions/mcp/index.ts — خادم MCP لأوج (المرحلة 10-ب)
//
// نقطة الدخول: خادم MCP كامل على Supabase Edge Functions —
// بروتوكول JSON-RPC 2.0 بنقل Streamable HTTP (stateless: كل
// حالة الربط = مفتاح Bearer). النواة في _shared/mcp-core.ts
// والأدوات الثمانية في _shared/mcp-tools.ts.
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
//
// متغيرات البيئة (تُحقن تلقائيًا من المنصة):
//   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
// ============================================================

import { McpServer } from '../_shared/mcp-core.ts'

function fail(msg: string, status = 500): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

// مثيل واحد لكل نسخة دالة (يحمل حدود المعدل في الذاكرة)
const server = new McpServer({ baseUrl: supabaseUrl, serviceKey })

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
