import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, logAudit } from '@/lib/audit'
import { getSupabaseAdmin } from '@/lib/supabase'
import { parseBody } from '@/lib/validators'
import { adminSystemActionSchema } from '@/lib/validators'
import { getSystemConfig, resetSystemConfigCache, KNOWN_FEATURE_FLAGS } from '@/lib/system-config'

export const dynamic = 'force-dynamic'

// ============================================================
// /api/rise/admin/system — المرحلة 11 (الوحدة الناقصة: System)
//
// «maintenance mode / feature flags / status» من الخطة:
//   • maintenance: تشغيل وضع الصيانة يمنع middleware فورًا كل
//     طفرات /api/rise/* غير الإدارية (503 + رسالة عربية) —
//     القراءة والتصفح والمسارات الإدارية يستمرون (الأدمن يستطيع
//     الدخول وإيقافه دائمًا). env SYSTEM_MAINTENANCE_MODE له
//     الأسبقية (kill-switch من Vercel عند تعطل قاعدة البيانات).
//   • flags: أعلام ميزات منطقية في app_config (feature_flags)
//     للاستخدام التدريجي — عامة وغير سرية بحكم التصميم.
//   • status: GET يعرض الحالة + إصدار النشر (VERCEL_GIT_COMMIT_SHA).
// كل كتابة: logAudit + إبطال كاش إعدادات النظام (30 ثانية).
// ============================================================

function jsonOk(payload: Record<string, unknown>) {
  return NextResponse.json(payload)
}

async function upsertConfig(sb: any, key: string, value: string) {
  const { error } = await sb
    .from('app_config')
    .upsert({ key, value }, { onConflict: 'key' })
  if (error) throw new Error(`upsert ${key}: ${error.message}`)
}

export async function GET(request: NextRequest) {
  try {
    const adminId = await requireAdmin(request)
    if (!adminId) {
      return NextResponse.json({ error: 'غير مصرح - أدمن فقط' }, { status: 403 })
    }

    const config = await getSystemConfig()

    // إصدار النشر الحالي (يُدمج وقت البناء على Vercel) + بيئة التشغيل
    const commit = process.env.VERCEL_GIT_COMMIT_SHA || null
    const envName = process.env.VERCEL_ENV || process.env.NODE_ENV || null

    return jsonOk({
      maintenance: {
        enabled: config.maintenanceMode,
        message: config.maintenanceMessage,
        envOverride: process.env.SYSTEM_MAINTENANCE_MODE !== undefined,
      },
      flags: config.featureFlags,
      knownFlags: KNOWN_FEATURE_FLAGS,
      deployment: { commit, env: envName },
    })
  } catch (error) {
    console.error('[admin/system] GET error:', error)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const adminId = await requireAdmin(request)
    if (!adminId) {
      return NextResponse.json({ error: 'غير مصرح - أدمن فقط' }, { status: 403 })
    }

    const parsed = await parseBody(request, adminSystemActionSchema)
    if (!parsed.ok || !parsed.data) return parsed.response!
    const input = parsed.data

    const admin = await getSupabaseAdmin()
    if (!admin) return NextResponse.json({ error: 'تعذر الاتصال بقاعدة البيانات' }, { status: 500 })
    const sb = admin as any

    if (input.action === 'maintenance') {
      const before = await getSystemConfig()
      await upsertConfig(sb, 'maintenance_mode', input.enabled ? 'true' : 'false')
      if (input.message !== undefined) {
        await upsertConfig(sb, 'maintenance_message', input.message)
      }

      await logAudit(request, adminId, 'system-maintenance', {
        resource: 'app_config',
        resourceId: 'maintenance_mode',
        details: { before: before.maintenanceMode, after: input.enabled, message: input.message ?? null },
      })

      resetSystemConfigCache()
      return jsonOk({
        success: true,
        message: input.enabled
          ? 'وضع الصيانة مفعّل — طفرات المستخدمين تُرفض الآن برسالة 503.'
          : 'وضع الصيانة متوقف — كل شيء يعمل.',
      })
    }

    // action === 'flags'
    const before = await getSystemConfig()
    await upsertConfig(sb, 'feature_flags', JSON.stringify(input.flags))

    await logAudit(request, adminId, 'system-flags', {
      resource: 'app_config',
      resourceId: 'feature_flags',
      details: { before: before.featureFlags, after: input.flags },
    })

    resetSystemConfigCache()
    return jsonOk({ success: true, message: 'تم حفظ أعلام الميزات.', flags: input.flags })
  } catch (error) {
    console.error('[admin/system] POST error:', error)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}
