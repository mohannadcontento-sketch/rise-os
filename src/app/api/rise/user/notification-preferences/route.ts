import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { createSupabaseUserClient, isSupabaseConfigured } from '@/lib/supabase'
import { getAccessToken } from '@/lib/cookie-auth'
import { parseBody, notificationPreferencesSchema } from '@/lib/validators'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

// ============================================================
// /api/rise/user/notification-preferences — المرحلة 06
//
// GET : تفضيلاتي (صف المستخدم أو الافتراضيات — RPC
//       get_notification_preferences: صفه فقط).
// PUT : تحديث (RPC set_notification_preferences: upsert صفه
//       ببوابة auth.uid). فئات الخطة:
//       important/security/reminders افتراضي مفتوح،
//       community/marketing افتراضي مغلق (موافقة صريحة).
//
// إيقاف قناة لا يكسر مركز الإشعارات داخل الموقع — القيم
// تُقرأ فقط عند بوابة إرسال Push.
// ============================================================

export async function GET(req: NextRequest) {
  const userId = await requireUser(req)
  if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

  if (!isSupabaseConfigured()) {
    return NextResponse.json(defaults())
  }

  const token = getAccessToken(req)
  if (!token) return NextResponse.json({ error: 'جلسة غير صالحة' }, { status: 401 })

  const client = await createSupabaseUserClient(token)
  if (!client) return NextResponse.json({ error: 'خطأ في تكوين الخادم' }, { status: 500 })

  const { data, error } = await (client as any).rpc('get_notification_preferences')

  if (error) {
    // الهجرة 028 غير مطبقة → الافتراضيات (متدرج بأمان)
    console.warn('[push/preferences] RPC failed:', error.message)
    return NextResponse.json(defaults())
  }

  return NextResponse.json(shape(data as Record<string, unknown>))
}

export async function PUT(req: NextRequest) {
  const userId = await requireUser(req)
  if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'قاعدة البيانات غير مهيأة' }, { status: 500 })
  }

  const token = getAccessToken(req)
  if (!token) return NextResponse.json({ error: 'جلسة غير صالحة' }, { status: 401 })

  const parsed = await parseBody(req, notificationPreferencesSchema)
  if (!parsed.ok || !parsed.data) return parsed.response!

  const client = await createSupabaseUserClient(token)
  if (!client) return NextResponse.json({ error: 'خطأ في تكوين الخادم' }, { status: 500 })

  const c = parsed.data.categories ?? {}
  const { data, error } = await (client as any).rpc('set_notification_preferences', {
    p_enabled: parsed.data.pushEnabled ?? null,
    p_important: c.important ?? null,
    p_security: c.security ?? null,
    p_reminders: c.reminders ?? null,
    p_community: c.community ?? null,
    p_marketing: c.marketing ?? null,
  })

  if (error) {
    console.warn('[push/preferences] set failed:', error.message)
    return NextResponse.json({ error: 'تعذّر حفظ التفضيلات — أعد المحاولة' }, { status: 500 })
  }

  await logAudit(req, userId, 'push-preferences-update', {
    resource: 'notification_preferences',
    details: { ...parsed.data },
  })

  return NextResponse.json(shape(data as Record<string, unknown>))
}

// ── توحيد شكل الاستجابة للعميل ──────────────────────────────
function defaults() {
  return {
    pushEnabled: true,
    categories: {
      important: true,
      security: true,
      reminders: true,
      community: false,
      marketing: false,
    },
  }
}

function shape(prefs: Record<string, unknown> | null | undefined) {
  if (!prefs) return defaults()
  return {
    pushEnabled: (prefs.push_enabled ?? true) as boolean,
    categories: {
      important: (prefs.push_important ?? true) as boolean,
      security: (prefs.push_security ?? true) as boolean,
      reminders: (prefs.push_reminders ?? true) as boolean,
      community: (prefs.push_community ?? false) as boolean,
      marketing: (prefs.push_marketing ?? false) as boolean,
    },
  }
}
