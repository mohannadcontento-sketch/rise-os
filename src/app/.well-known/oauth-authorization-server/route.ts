import { NextResponse } from 'next/server'

// ============================================================
// /.well-known/oauth-authorization-server — اكتشاف OAuth (تكامل MCP)
//
// نقطة الاستعلام القياسية (RFC 8414) التي يفحصها عميل ChatGPT /
// OpenAI عند ربط أوج عبر MCP. المنصة لا تدير تدفق OAuth — لذا
// يرد المسار 404 عمداً مع ترويسة CORS مفتوحة، فيرتد العميل
// تلقائياً إلى مصادقة Bearer (إصدار المفتاح في /api/rise/mcp/key).
//
// المسار عام: استجابة 404 فارغة لا تكشف أي بيانات ولا تحتاج جلسة.
// الطرق: GET — يرد 404 بلا جسم + Access-Control-Allow-Origin: *.
// ============================================================

/**
 * OAuth discovery endpoint for ChatGPT / OpenAI MCP integration.
 * Returns 404 so the client falls back to bearer token auth.
 */
export async function GET() {
  return new NextResponse(null, {
    status: 404,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  })
}