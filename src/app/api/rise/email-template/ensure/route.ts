import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, hasServiceRole } from '@/lib/supabase'
import { RECOVERY_EMAIL_HTML, RECOVERY_EMAIL_SUBJECT } from '@/lib/email/recovery-template'

export const dynamic = 'force-dynamic'

// ============================================================
// /api/rise/email-template/ensure — المرحلة 05 (تحديث المالك)
//
// «زبط الايميل لاني مش فاهم» — تطبيق قالب إيميل «إعادة تعيين
// كلمة المرور» بهوية أوج على Supabase (auth.email_templates →
// type='recovery') **تلقائيًا** — بلا زر في لوحة الأدمن وبلا
// لصق يدوي من الـDashboard:
//
//   • يُنادى يوميًا عبر Vercel Cron (vercel.json → crons)
//     → القالب يظل مطبقًا (self-healing) حتى لو أُعيد ضبط المشروع.
//   • يمكن استدعاؤه يدويًا (GET — اختياري ?force=1) للتطبيق الفوري أو للفحص.
//
// الأمان: العملية idempotent (نفس المحتوى دائمًا)، لا تلمس
// أي بيانات مستخدمين، ولا تُرجع أي معلومات حساسة. الحماية من
// الإغراق: rate-limit في middleware.ts (أدق من بادئة /api/rise)
// + كاش داخلي 10 دقائق لكل نسخة خادم.
//
// الاستجابة (شفافية كاملة — كل حالة لها سبب):
//   applied:true  reason:'updated'  → القالب حي في Supabase ✓
//   reason:'migration_missing'      → شغّل migration 026 أولًا
//   reason:'server_not_configured'  → SUPABASE_SERVICE_ROLE_KEY غير مضبوط
//   reason:'table_missing'/'permission' → المشروع لا يتيح الكتابة
//                                     على auth schema → اللصق اليدوي
//                                     (مرة واحدة فقط) من Dashboard.
// ============================================================

// كاش لكل نسخة خادم (serverless) — يمنع تكرار الـRPC عند
// الاستدعاء المتكرر خلال 10 دقائق، مع ترك الـcron اليومي
// يعيد التطبيق دائمًا (self-healing حقيقي).
let _lastEnsure: { at: number; result: Record<string, unknown> } | null = null
const ENSURE_TTL_MS = 10 * 60 * 1000

/** تنفيذ RPC التطبيق بصلاحيات الخادم (idempotent). */
async function runEnsure(force = false): Promise<Record<string, unknown>> {
  const now = Date.now()
  if (!force && _lastEnsure && now - _lastEnsure.at < ENSURE_TTL_MS) {
    return { ..._lastEnsure.result, cached: true }
  }

  const base: Record<string, unknown> = {
    applied: false,
    subject: RECOVERY_EMAIL_SUBJECT,
    contentLength: RECOVERY_EMAIL_HTML.length,
    hasConfirmationUrl: RECOVERY_EMAIL_HTML.includes('{{ .ConfirmationURL }}'),
    checkedAt: new Date(now).toISOString(),
  }

  if (!hasServiceRole()) {
    return { ...base, reason: 'server_not_configured', note: 'SUPABASE_SERVICE_ROLE_KEY غير مضبوط في بيئة الخادم.' }
  }

  const admin = await getSupabaseAdmin()
  if (!admin) {
    return { ...base, reason: 'server_not_configured', note: 'تعذر إنشاء عميل الإدارة.' }
  }

  try {
    const { data, error } = await (admin as any).rpc('admin_apply_recovery_email_template', {
      p_content: RECOVERY_EMAIL_HTML,
      p_subject: RECOVERY_EMAIL_SUBJECT,
    })

    if (error) {
      const msg = String(error.message || '')
      // الهجرة 026 غير مطبقة → الدالة غير موجودة
      if (msg.includes('admin_apply_recovery_email_template') || msg.includes('function') || msg.includes('PGRST202')) {
        const r = { ...base, reason: 'migration_missing', note: 'شغّل migration 026_phase5_notifications_center.sql في Supabase SQL Editor ثم أعد المحاولة.' }
        _lastEnsure = { at: now, result: r }
        return r
      }
      console.error('[email-template/ensure] RPC error:', msg)
      const r = { ...base, reason: 'error', note: 'فشل استدعاء RPC: ' + msg }
      _lastEnsure = { at: now, result: r }
      return r
    }

    const rpcRes = (data ?? {}) as { applied?: boolean; reason?: string; note?: string }
    const r: Record<string, unknown> = {
      ...base,
      applied: !!rpcRes.applied,
      reason: rpcRes.reason ?? 'updated',
      note: rpcRes.note ?? null,
    }
    _lastEnsure = { at: now, result: r }
    return r
  } catch (err) {
    console.error('[email-template/ensure] error:', err)
    const r = { ...base, reason: 'error', note: 'استثناء غير متوقع.' }
    _lastEnsure = { at: now, result: r }
    return r
  }
}

/** GET — الفحص/التطبيق (يستخدمه الـcron اليومي + الفحص اليدوي).
 *  GET عمدًا بلا POST: الـcron ينادي GET، والمسار idempotent —
 *  والـPOST كان سيتطلب Idempotency-Key من middleware التطبيق
 *  بلا أي قيمة إضافية هنا. */
export async function GET(req: NextRequest) {
  const isCron = req.headers.get('x-vercel-cron') === '1' || req.headers.get('x-vercel-cron') === 'true'
  const force = isCron || new URL(req.url).searchParams.get('force') === '1'
  const result = await runEnsure(force)
  // سجل مصدر الاستدعاء للتشخيص فقط (بلا أي بيانات مستخدم)
  console.log('[email-template/ensure] source:', isCron ? 'vercel-cron' : 'manual', 'applied:', result.applied, 'reason:', result.reason)
  return NextResponse.json(result)
}
