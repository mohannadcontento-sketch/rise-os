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

    const parsed = await parseBody(req, deleteAccountSchema)
    if (!parsed.ok) return parsed.response!
    const { email, password } = parsed.data!

    // ── 1. إعادة إثبات الهوية بكلمة المرور ──
    const isolated = await createSupabaseIsolatedClient()
    if (!isolated) {
      return NextResponse.json({ error: 'خدمة المصادقة غير متوفرة حالياً' }, { status: 503 })
    }

    const { data: authData, error: authError } = await isolated.auth.signInWithPassword({
      email,
      password,
    })
    if (authError || !authData.user || authData.user.id !== userId) {
      return NextResponse.json({ error: 'كلمة المرور أو البريد الإلكتروني غير صحيح' }, { status: 403 })
    }

    const admin = await getSupabaseAdmin()
    if (!admin) {
      return NextResponse.json({ error: 'خدمة الإدارة غير متوفرة حالياً' }, { status: 503 })
    }

    // ── 2. مسح عدادات الكاش قبل الحذف (الصفوف ستُسقط بالتتابع) ──
    try {
      bustAggregateCache(userId)
    } catch {
      /* الكاش تجميلي فقط — لا يمنع الحذف */
    }

    // (أ) أغلق كل الجلسات أولًا حتى لا تبقى جلسة صالحة بعد حذف المستخدم.
    try {
      await admin.auth.signOut(userId)
    } catch (e) {
      console.error('[auth/delete-account] pre-delete signOut failed (continuing):', e)
    }

    // (ب) احذف بيانات المستخدم عبر RPC الذرّي (متاح للمصادق، نفس مسار
    //     "حذف جميع البيانات") — يضمن مسح المحتوى الشخصي حتى لو تغيرت
    //     قيود FK مستقبلًا، ثم يُسقط صف auth.users فيُتالِى الباقي.
    try {
      const userClient = await createSupabaseUserClient(authData.session!.access_token)
      if (userClient) {
        await (userClient as any).rpc('delete_user_data_atomic', { p_user_id: userId })
      }
    } catch (e) {
      console.error('[auth/delete-account] data wipe rpc failed (continuing to user deletion):', e)
    }

    // (ج) حذف مستخدم المصادقة نهائيًا — profiles وكل الجداول تتالى بعده.
    const { error: deleteError } = await admin.auth.deleteUser(userId)
    if (deleteError) {
      console.error('[auth/delete-account] supabase deleteUser failed:', deleteError.message)
      return NextResponse.json(
        { error: 'تعذر حذف الحساب من مزود المصادقة. حاول لاحقاً أو تواصل مع الدعم.' },
        { status: 503 }
      )
    }

    const res = NextResponse.json({ success: true })
    return clearAuthCookies(res)
  } catch (error) {
    console.error('[auth/delete-account] error:', error)
    return NextResponse.json({ error: 'حدث خطأ أثناء حذف الحساب' }, { status: 500 })
  }
}
