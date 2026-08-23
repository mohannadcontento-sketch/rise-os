import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getSupabaseAdmin, getSupabaseWithAuth } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/rise/delete-all
 * 🔒 CRITICAL FIX: Requires password re-authentication to prevent malicious data wiping.
 */
export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const { email, password, confirmDelete } = body

    // 1. Enforce strict validation
    if (!confirmDelete || !email || !password) {
      return NextResponse.json(
        { error: 'مطلوب تأكيد الحذف مع البريد الإلكتروني وكلمة المرور' },
        { status: 400 }
      )
    }

    // 2. Re-verify credentials
    let client: any = await getSupabaseAdmin()
    if (!client) {
      client = await getSupabaseWithAuth(req)
    }

    if (!client) {
      return NextResponse.json({ error: 'خطأ في تكوين الخادم' }, { status: 500 })
    }

    const { error: authError, data } = await client.auth.signInWithPassword({ email, password })
    
    if (authError || !data.user || data.user.id !== userId) {
      return NextResponse.json({ error: 'كلمة المرور أو البريد الإلكتروني غير صحيح' }, { status: 403 })
    }

    // 3. Proceed with deletion only after successful re-authentication
    const tables = [
      'habit_logs', 'habits', 'subtasks', 'tasks', 'milestones',
      'goals', 'projects', 'journals', 'focus_sessions',
      'health_logs', 'finance_records', 'books', 'knowledge_items',
      'planner_items', 'morning_logs', 'daily_scores', 'user_achievements',
      'notifications', 'user_settings' // Added user_settings for complete cleanup
    ]

    let deletedCount = 0
    for (const table of tables) {
      try {
        const { count } = await client
          .from(table)
          .delete({ count: 'exact' })
          .eq('user_id', userId)
        if (count) deletedCount += count
      } catch { /* Ignore tables that might not exist yet or lack user_id */ }
    }

    // Reset AI usage
    try {
      await client.from('user_ai_usage').update({ monthly_used: 0, total_used: 0 }).eq('user_id', userId)
    } catch { /* ignore */ }

    // Reset storage usage
    try {
      await client.from('user_storage').update({ storage_used: 0 }).eq('user_id', userId)
    } catch { /* ignore */ }

    return NextResponse.json({ success: true, deleted: deletedCount })
  } catch (error) {
    console.error('[delete-all] error:', error)
    return NextResponse.json({ error: 'فشل حذف البيانات' }, { status: 500 })
  }
}
