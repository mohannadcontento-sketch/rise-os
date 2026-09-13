import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth'
import {
  createSupabaseIsolatedClient,
  createSupabaseUserClient,
  getSupabaseAdmin,
  isSupabaseConfigured,
} from '@/lib/supabase'
import { clearAuthCookies } from '@/lib/cookie-auth'
import { parseBody, deleteAccountSchema } from '@/lib/validators'
import { bustAggregateCache } from '@/lib/aggregate-cache'

export const dynamic = 'force-dynamic'

// ============================================================
// DELETE /api/auth/delete-account
// Phase 3 — حذف الحساب نهائيًا (الحساب نفسه وليس البيانات فقط).
//
// 1. إعادة إثبات الهوية: البريد + كلمة المرور عبر عميل معزول
//    (نفس نمط delete-all) — جلسة مسروقة لا تكفي لحذف الحساب.
// 2. حذف صف auth.users عبر service role: كل الجداول المرتبطة
//    (profiles → tasks/goals/habits/...) تسقط بـ FK ON DELETE CASCADE.
// 3. إبطال كل الجلسات (admin signOut) ومسح الكوكيز.
// ============================================================

export async function DELETE(req: NextRequest) {
  // QA-DIAG (أُبقي في السجل فقط): اسم آخر خطوة للفحص من Vercel logs
  let step = 'start'
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: 'حذف الحساب غير متاح في وضع التطوير المحلي' },
        { status: 503 }
      )
    }

    const userId = await getUserId(req)
    if (!userId) {
      return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })
    }
    step = 'auth-ok'

    const parsed = await parseBody(req, deleteAccountSchema)
    if (!parsed.ok) return parsed.response!
    const { email, password } = parsed.data!
    step = 'body-ok'

    // ── 1. إعادة إثبات الهوية بكلمة المرور ──
    const isolated = await createSupabaseIsolatedClient()
    if (!isolated) {
      return NextResponse.json({ error: 'خدمة المصادقة غير متوفرة حالياً' }, { status: 503 })
    }
    step = 'isolated-ok'

    const { data: authData, error: authError } = await isolated.auth.signInWithPassword({
      email,
      password,
    })
    if (authError || !authData.user || authData.user.id !== userId) {
      return NextResponse.json({ error: 'كلمة المرور أو البريد الإلكتروني غير صحيح' }, { status: 403 })
    }
    step = 'reauth-ok'

    const admin = await getSupabaseAdmin()
    if (!admin) {
      return NextResponse.json({ error: 'خدمة الإدارة غير متوفرة حالياً' }, { status: 503 })
    }
    step = 'admin-ok'

    // ── 2. مسح عدادات الكاش قبل الحذف (الصفوف ستُسقط بالتتابع) ──
    try {
      bustAggregateCache(userId)
    } catch {
      /* الكاش تجميلي فقط — لا يمنع الحذف */
    }

    // (أ) أغلق كل الجلسات أولًا حتى لا تبقى جلسة صالحة بعد حذف المستخدم.
    // FIX (QA المرحلة 15): إبطال الجلسات = admin API ويستقبل JWT وليس userId
    // — الاستدعاء القديم كان يمرر userId فيتجاهله الخادم (401) ويُهمل.
    try {
      const sessionJwt = authData.session?.access_token
      if (sessionJwt) {
        await admin.auth.admin.signOut(sessionJwt)
      }
    } catch (e) {
      console.error('[auth/delete-account] pre-delete signOut failed (continuing):', e)
    }

    step = 'signout-attempt'

    // (ب) احذف بيانات المستخدم عبر RPC الذرّي (متاح للمصادق، نفس مسار
    //     "حذف جميع البيانات") — يضمن مسح المحتوى الشخصي حتى لو تغيرت
    //     قيود FK مستقبلًا، ثم يُسقط صف auth.users فيُتالِى الباقي.
    try {
      step = 'rpc-attempt'
      const userClient = await createSupabaseUserClient(authData.session!.access_token)
      if (userClient) {
        await (userClient as any).rpc('delete_user_data_atomic', { p_user_id: userId })
      }
      step = 'rpc-done'
    } catch (e) {
      console.error('[auth/delete-account] data wipe rpc failed (continuing to user deletion):', e)
    }

    // (ج) حذف مستخدم المصادقة نهائيًا — profiles وكل الجداول تتالى بعده.
    // FIX (QA المرحلة 15): deleteUser على auth.admin وليس auth مباشرة —
    // الاستدعاء القديم كان undefined فيرمي TypeError (500) ولا يُحذف الحساب.
    step = 'deleteUser-attempt'
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId)
    if (deleteError) {
      console.error('[auth/delete-account] supabase deleteUser failed:', deleteError.message)
      return NextResponse.json(
        {
          error: 'تعذر حذف الحساب من مزود المصادقة. حاول لاحقاً أو تواصل مع الدعم.',
          // QA-DIAG (مؤقت): تفاصيل خطأ المزود للتشخيص — يُحذف بعد الحل
          diag: {
            name: (deleteError as any)?.name ?? null,
            status: (deleteError as any)?.status ?? null,
            code: (deleteError as any)?.code ?? null,
            message: (deleteError as any)?.message ?? null,
          },
        },
        { status: 503 }
      )
    }
    step = 'deleteUser-done'

    const res = NextResponse.json({ success: true })
    return clearAuthCookies(res)
  } catch (error) {
    console.error('[auth/delete-account] error at step:', step, error)
    return NextResponse.json({ error: 'حدث خطأ أثناء حذف الحساب' }, { status: 500 })
  }
}
