import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { data, setCurrentAuthToken } from '@/lib/data'
import { getSupabaseAdmin, getSupabaseWithAuth } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/rise/delete-all — deletes ALL of the user's data from the database
 * Keeps the user account + settings (so they stay logged in).
 */
export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

    // Try Supabase admin first, then per-user client
    let client: any = await getSupabaseAdmin()
    if (!client) {
      client = await getSupabaseWithAuth(req)
    }

    if (client) {
      // Delete from all tables (child tables first)
      const tables = [
        'habit_logs',
        'habits',
        'subtasks',
        'tasks',
        'milestones',
        'goals',
        'projects',
        'journals',
        'focus_sessions',
        'health_logs',
        'finance_records',
        'books',
        'knowledge_items',
        'planner_items',
        'morning_logs',
        'daily_scores',
        'user_achievements',
        'notifications',
      ]

      let deletedCount = 0
      for (const table of tables) {
        try {
          const { count } = await client
            .from(table)
            .delete({ count: 'exact' })
            .eq('user_id', userId)
          if (count) deletedCount += count
        } catch { /* some tables may not have user_id */ }
      }

      // Reset AI usage
      try {
        await client
          .from('user_ai_usage')
          .update({ monthly_used: 0, total_used: 0 })
          .eq('user_id', userId)
      } catch { /* ignore */ }

      // Reset storage usage
      try {
        await client
          .from('user_storage')
          .update({ storage_used: 0 })
          .eq('user_id', userId)
      } catch { /* ignore */ }

      return NextResponse.json({ success: true, deleted: deletedCount })
    }

    // Mock mode: delete from Prisma
    const { db } = await import('@/lib/db')
    await (db as any).habitLog.deleteMany({ where: { userId } })
    await (db as any).habit.deleteMany({ where: { userId } })
    await (db as any).subTask.deleteMany({ where: { task: { userId } } })
    await (db as any).task.deleteMany({ where: { userId } })
    await (db as any).milestone.deleteMany({ where: { goal: { userId } } })
    await (db as any).goal.deleteMany({ where: { userId } })
    await (db as any).project.deleteMany({ where: { userId } })
    await (db as any).journal.deleteMany({ where: { userId } })
    await (db as any).focusSession.deleteMany({ where: { userId } })
    await (db as any).healthLog.deleteMany({ where: { userId } })
    await (db as any).financeRecord.deleteMany({ where: { userId } })
    await (db as any).book.deleteMany({ where: { userId } })
    await (db as any).knowledgeItem.deleteMany({ where: { userId } })
    await (db as any).plannerItem.deleteMany({ where: { userId } })
    await (db as any).morningLog.deleteMany({ where: { userId } })
    await (db as any).dailyScore.deleteMany({ where: { userId } })
    await (db as any).userAchievement.deleteMany({ where: { userId } })
    await (db as any).notification.deleteMany({ where: { userId } })

    return NextResponse.json({ success: true, deleted: -1 })
  } catch (error) {
    console.error('Delete-all error:', error)
    return NextResponse.json({ error: 'فشل حذف البيانات' }, { status: 500 })
  }
}
