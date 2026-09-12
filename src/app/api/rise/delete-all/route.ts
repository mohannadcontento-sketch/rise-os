import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { createSupabaseIsolatedClient, createSupabaseUserClient } from '@/lib/supabase'
import { bustAggregateCache } from '@/lib/aggregate-cache'
import { withIdempotency } from '@/lib/idempotency'
import { parseBody, deleteAllSchema } from '@/lib/validators'

// ============================================================
// /api/rise/delete-all — الإعدادات (منطقة الخطر: حذف كل البيانات)
//
// يمسح بيانات المستخدم بالكامل عبر RPC delete_user_data_atomic —
// معاملة واحدة تشمل التبعيات (المهام الفرعية، المحطات) وإعادة
// ضبط الاستخدام؛ لا حذف جزئي ممكن. لا يُنفَّذ إلا بعد إعادة
// إدخال البريد وكلمة المرور على عميل Supabase معزول.
//
// المسار محمي: requireUser + إعادة مصادقة إلزامية بالكلمة —
// يمنع مسحاً خبيثاً بجلسة مسروقة (403 عند عدم التطابق).
// الطرق: DELETE { email, password } — يعيد { success, deleted }
//        (عدد الصفوف) أو 403/500/503.
// zod: deleteAllSchema عبر parseBody.
// Idempotency-Key: مطلوب (withIdempotency)، وبعد النجاح
// bustAggregateCache يُبطل كاشات المستخدم فوراً.
// ============================================================

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/rise/delete-all
 * 🔒 CRITICAL FIX: Requires password re-authentication to prevent malicious data wiping.
 */
export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireUser(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

  return withIdempotency(req, userId, async () => {
    const parsed = await parseBody(req, deleteAllSchema)
    if (!parsed.ok) return parsed.response!
    const { email, password } = parsed.data!

    // 2. Re-verify credentials
    // Re-authenticate on an isolated, non-persistent Supabase client so a
    // password session is never shared through a process-global client.
    const authClient: any = await createSupabaseIsolatedClient()
    if (!authClient) {
      return NextResponse.json({ error: 'خطأ في تكوين الخادم' }, { status: 500 })
    }

    const { error: authError, data: authData } = await authClient.auth.signInWithPassword({ email, password })
    if (authError || !authData.user || authData.user.id !== userId || !authData.session?.access_token) {
      return NextResponse.json({ error: 'كلمة المرور أو البريد الإلكتروني غير صحيح' }, { status: 403 })
    }

    // 3. Proceed with deletion only after successful re-authentication.
    // The DB RPC performs the entire wipe in one transaction, including
    // dependent subtasks/milestones and usage resets. Partial wipes are no longer possible.
    const userClient = await createSupabaseUserClient(authData.session.access_token)
    if (!userClient) return NextResponse.json({ error: 'خطأ في تكوين الخادم' }, { status: 500 })
    const { data: deletedCount, error: deleteError } = await (userClient as any).rpc('delete_user_data_atomic', {
      p_user_id: userId,
    })
    if (deleteError) {
      console.error('[delete-all] atomic wipe failed:', deleteError.message)
      return NextResponse.json({ error: 'تعذر حذف البيانات بالكامل' }, { status: 503 })
    }

    bustAggregateCache(userId)
    return NextResponse.json({ success: true, deleted: Number(deletedCount || 0) })
  
  })} catch (error) {
    console.error('[delete-all] error:', error)
    return NextResponse.json({ error: 'فشل حذف البيانات' }, { status: 500 })
  }
}
