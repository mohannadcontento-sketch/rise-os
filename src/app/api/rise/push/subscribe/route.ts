import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { createSupabaseUserClient, isSupabaseConfigured } from '@/lib/supabase'
import { getAccessToken } from '@/lib/cookie-auth'
import { parseBody, pushSubscribeSchema, pushUnsubscribeSchema } from '@/lib/validators'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

// ============================================================
// /api/rise/push/subscribe — المرحلة 06 (Web Push)
//
// POST   : تسجيل/تجديد اشتراك جهاز (لكل متصفح على حدة).
//          zod (endpoint https + keys) ثم RPC upsert_push_subscription
//          (SECURITY DEFINER: بوابة auth.uid، سقف 10 أجهزة،
//          ON CONFLICT endpoint يجدد المفاتيح ويلغي الإبطال).
// DELETE : إبطال الاشتراك — RPC revoke_push_subscription
//          (بوابة: صفو المستخدم أو service_role).
//
// إيقاف Push من هنا يمنع القناة فقط — مركز الإشعارات داخل
// الموقع لا يتأثر إطلاقًا (DoD).
// ============================================================

export async function POST(req: NextRequest) {
  const userId = await requireUser(req)
  if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'قاعدة البيانات غير مهيأة' }, { status: 500 })
  }

  const token = getAccessToken(req)
  if (!token) return NextResponse.json({ error: 'جلسة غير صالحة' }, { status: 401 })

  const parsed = await parseBody(req, pushSubscribeSchema)
  if (!parsed.ok || !parsed.data) return parsed.response!

  const { endpoint, keys, label } = parsed.data
  const client = await createSupabaseUserClient(token)
  if (!client) return NextResponse.json({ error: 'خطأ في تكوين الخادم' }, { status: 500 })

  // UA من الترويسة — يفيد في تسمية الجهاز تلقائيًا
  const ua = req.headers.get('user-agent') || ''

  const { data: id, error } = await (client as any).rpc('upsert_push_subscription', {
    p_endpoint: endpoint,
    p_p256dh: keys.p256dh,
    p_auth: keys.auth,
    p_label: label ?? null,
    p_ua: ua,
  })

  if (error) {
    // أخطاء RPC معروفة → رسائل عربية واضحة، وليست 500 صامتة
    if (error.message.includes('device_limit')) {
      return NextResponse.json(
        { error: 'وصلت للحد الأقصى (10 أجهزة). أزل جهازًا قديمًا من القائمة أولًا.' },
        { status: 409 },
      )
    }
    if (error.message.includes('invalid_endpoint')) {
      return NextResponse.json({ error: 'عنوان الاشتراك غير صالح' }, { status: 400 })
    }
    console.warn('[push/subscribe] RPC failed:', error.message)
    return NextResponse.json({ error: 'تعذّر تسجيل الجهاز — أعد المحاولة' }, { status: 500 })
  }

  await logAudit(req, userId, 'push-subscribe', {
    resource: 'push_subscriptions',
    resourceId: id,
    details: { label: label ?? null },
  })

  return NextResponse.json({ success: true, subscriptionId: id })
}

export async function DELETE(req: NextRequest) {
  const userId = await requireUser(req)
  if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'قاعدة البيانات غير مهيأة' }, { status: 500 })
  }

  const token = getAccessToken(req)
  if (!token) return NextResponse.json({ error: 'جلسة غير صالحة' }, { status: 401 })

  const parsed = await parseBody(req, pushUnsubscribeSchema)
  if (!parsed.ok || !parsed.data) return parsed.response!

  const client = await createSupabaseUserClient(token)
  if (!client) return NextResponse.json({ error: 'خطأ في تكوين الخادم' }, { status: 500 })

  // بالمعرّف (قائمة الأجهزة) أو بالـendpoint (جهازنا الحالي)
  const { data: revoked, error } = parsed.data.id
    ? await (client as any).rpc('revoke_push_subscription_by_id', {
        p_id: parsed.data.id,
        p_reason: 'user',
      })
    : await (client as any).rpc('revoke_push_subscription', {
        p_endpoint: parsed.data.endpoint,
        p_reason: 'user',
      })

  if (error) {
    console.warn('[push/subscribe] revoke failed:', error.message)
    return NextResponse.json({ error: 'تعذّر إلغاء الاشتراك' }, { status: 500 })
  }

  await logAudit(req, userId, 'push-unsubscribe', {
    resource: 'push_subscriptions',
    resourceId: parsed.data.id,
    details: { endpoint: parsed.data.endpoint ?? null },
  })

  return NextResponse.json({ success: true, revoked: !!revoked })
}
