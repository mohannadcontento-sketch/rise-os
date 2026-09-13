import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase'
import { checkEntitlement } from '@/lib/billing/entitlements'

// ============================================================
// /api/rise/mcp/oauth-info — بيانات ربط ChatGPT عبر OAuth (10-ج)
//
// دوكس OpenAI: ChatGPT (Developer mode) يقبل لخادم MCP مصادقة
// OAuth فقط — لا مفاتيح Bearer ثابتة. وظيفة Supabase mcp (النسخة
// 10-ج) تضيف مسارات ?oauth=authorize و?oauth=token، وهذا المسار
// يسلّم المستخدم (خطة ماكس) كل ما يلصقه في ChatGPT:
//   { authorizeUrl, tokenUrl, serverUrl, clientId, clientSecret }
//
// بيانات العميل من app_config (زرعتها الهجرة 034 — توليد مرة
// واحدة). الغياب = 503 CHATGPT_OAUTH_NOT_CONFIGURED (المالك لم
// يشغّل الهجرة بعد) برسالة عربية واضحة لا تفضيل تفاصيل.
//
// الأمان: requireUser (جلسة) + entitlement mcp.key (ماكس فقط) —
// بيانات العميل سر مشترك للنشر لكنه لا يمنح أي وصول وحده:
// التفويض الفعلي يتطلب مفتاح rise_ الشخصي عند authorize.
// الطرق: GET فقط.
// ============================================================

export const dynamic = 'force-dynamic'

const CONFIG_CLIENT_ID = 'mcp_oauth_client_id'
const CONFIG_CLIENT_SECRET = 'mcp_oauth_client_secret'

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUser(req)
    if (!userId) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }

    // ماكس فقط — نفس عقد إنشاء المفتاح
    const entitlement = await checkEntitlement(req, 'mcp.key')
    if (!entitlement.entitled) {
      return NextResponse.json(
        {
          error: 'ربط ChatGPT متاح في خطة ماكس فقط — رقّ حسابك لتفعيله.',
          code: 'PLAN_REQUIRED',
          requiredPlan: 'max',
          currentPlan: entitlement.plan,
        },
        { status: 403 },
      )
    }

    // نقطة Supabase إلزامية هنا: OAuth يعيش على وظيفة Edge
    const edgeBase = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '')
    if (!edgeBase) {
      return NextResponse.json(
        {
          error: 'نقطة Supabase غير مضبوطة (NEXT_PUBLIC_SUPABASE_URL)',
          code: 'EDGE_NOT_CONFIGURED',
        },
        { status: 503 },
      )
    }

    // قراءة بيانات العميل من app_config (هجرة 034)
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: 'قاعدة البيانات غير مهيأة', code: 'DB_NOT_CONFIGURED' },
        { status: 503 },
      )
    }
    const admin = await getSupabaseAdmin()
    const { data, error } = await admin
      .from('app_config')
      .select('key,value')
      .in('key', [CONFIG_CLIENT_ID, CONFIG_CLIENT_SECRET])
    if (error) throw error

    const clientId = data?.find((r: { key: string }) => r.key === CONFIG_CLIENT_ID)?.value
    const clientSecret = data?.find((r: { key: string }) => r.key === CONFIG_CLIENT_SECRET)?.value
    if (!clientId || !clientSecret) {
      return NextResponse.json(
        {
          error: 'تفويض ChatGPT غير مهيأ بعد — اطلب من إدارة أوج تشغيل هجرة OAuth (034).',
          code: 'CHATGPT_OAUTH_NOT_CONFIGURED',
        },
        { status: 503 },
      )
    }

    const serverUrl = `${edgeBase}/functions/v1/mcp`
    return NextResponse.json({
      serverUrl,
      authorizeUrl: `${serverUrl}?oauth=authorize`,
      tokenUrl: `${serverUrl}?oauth=token`,
      clientId,
      clientSecret,
      // يظهر مرة واحدة عند إنشاء المفتاح — الواجهة تبني الرابط الجاهز
      note: 'أضف &api_key=rise_… إلى authorizeUrl عند إعداده في ChatGPT',
    })
  } catch (err) {
    console.error('[mcp/oauth-info] error:', err)
    return NextResponse.json({ error: 'تعذر جلب بيانات التفويض' }, { status: 500 })
  }
}
