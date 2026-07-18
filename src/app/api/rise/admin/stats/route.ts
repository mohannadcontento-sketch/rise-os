import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase'
import { setCurrentAuthToken } from '@/lib/data'

export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth(request)
    if (!userId) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }

    // Set auth token for data layer
    setCurrentAuthToken(request.headers.get('Authorization')?.replace('Bearer ', ''))

    const admin = await getSupabaseAdmin()

    // Helper to safely count rows from Supabase
    async function countTable(tableName: string): Promise<number> {
      if (!admin) return 0
      try {
        const { count, error } = await admin
          .from(tableName)
          .select('*', { count: 'exact', head: true })
        if (error) {
          console.warn(`[admin/stats] count ${tableName} error:`, error.message)
          return 0
        }
        return count ?? 0
      } catch {
        return 0
      }
    }

    // Count users
    const totalUsers = await countTable('profiles')

    // Active users in last 7 days (users with recent activity — use daily_scores as proxy)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    let activeUsers7d = 0
    if (admin) {
      try {
        const { data: recentScores } = await admin
          .from('daily_scores')
          .select('user_id')
          .gte('date', sevenDaysAgo)
        if (recentScores) {
          activeUsers7d = new Set(recentScores.map((r: any) => r.user_id)).size
        }
      } catch { /* ignore */ }
    }

    // User growth over last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    let userGrowth: { date: string; count: number }[] = []

    if (admin) {
      try {
        const { data: users } = await admin
          .from('profiles')
          .select('created_at')
          .gte('created_at', thirtyDaysAgo.toISOString())
          .order('created_at', { ascending: true })

        // Count users before period
        const { count: usersBefore } = await admin
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .lt('created_at', thirtyDaysAgo.toISOString())

        // Build daily growth map
        const dateMap = new Map<string, number>()
        for (let i = 0; i <= 30; i++) {
          const d = new Date(thirtyDaysAgo)
          d.setDate(d.getDate() + i)
          dateMap.set(d.toISOString().slice(0, 10), 0)
        }

        for (const u of (users ?? [])) {
          const day = new Date(u.created_at).toISOString().slice(0, 10)
          dateMap.set(day, (dateMap.get(day) || 0) + 1)
        }

        let cumulativeCount = usersBefore ?? 0
        userGrowth = []
        for (const [date, newCount] of dateMap) {
          cumulativeCount += newCount
          userGrowth.push({ date, count: cumulativeCount })
        }
      } catch (err) {
        console.warn('[admin/stats] user growth error:', err)
      }
    }

    // Table counts (all from Supabase)
    const [
      totalTasks,
      totalHabits,
      totalJournals,
      totalGoals,
      totalProjects,
      totalBooks,
      totalKnowledge,
      totalFinanceRecords,
      totalFocusSessions,
      totalHabitLogs,
      totalMilestones,
    ] = await Promise.all([
      countTable('tasks'),
      countTable('habits'),
      countTable('journals'),
      countTable('goals'),
      countTable('projects'),
      countTable('books'),
      countTable('knowledge_items'),
      countTable('finance_records'),
      countTable('focus_sessions'),
      countTable('habit_logs'),
      countTable('milestones'),
    ])

    // Recent activity
    const recentActivity: { time: string; action: string; user: string }[] = []

    if (admin) {
      try {
        // Recent tasks
        const { data: recentTasks } = await admin
          .from('tasks')
          .select('title, user_id, updated_at')
          .order('updated_at', { ascending: false })
          .limit(5)

        // Get user names for the tasks
        const taskUserIds = [...new Set((recentTasks ?? []).map((t: any) => t.user_id))]
        const userNameMap = new Map<string, string>()
        if (taskUserIds.length > 0) {
          const { data: profiles } = await admin
            .from('profiles')
            .select('id, name')
            .in('id', taskUserIds)
          for (const p of (profiles ?? [])) {
            userNameMap.set(p.id, p.name || 'مستخدم')
          }
        }

        for (const t of (recentTasks ?? [])) {
          recentActivity.push({
            time: t.updated_at,
            action: `مهمة: ${(t.title || '').slice(0, 40)}`,
            user: userNameMap.get(t.user_id) || 'مستخدم',
          })
        }
      } catch { /* ignore */ }

      try {
        // Recent journals
        const { data: recentJournals } = await admin
          .from('journals')
          .select('content, user_id, created_at')
          .order('created_at', { ascending: false })
          .limit(5)

        for (const j of (recentJournals ?? [])) {
          recentActivity.push({
            time: j.created_at,
            action: `يومية: ${(j.content || '').slice(0, 40)}`,
            user: 'مستخدم',
          })
        }
      } catch { /* ignore */ }
    }

    // Sort by time desc and limit
    recentActivity.sort((a, b) => b.time.localeCompare(a.time))

    const tableCounts: Record<string, number> = {
      Profiles: totalUsers,
      Task: totalTasks,
      Habit: totalHabits,
      HabitLog: totalHabitLogs,
      Journal: totalJournals,
      Goal: totalGoals,
      Milestone: totalMilestones,
      Project: totalProjects,
      Book: totalBooks,
      KnowledgeItem: totalKnowledge,
      FinanceRecord: totalFinanceRecords,
      FocusSession: totalFocusSessions,
    }

    return NextResponse.json({
      totalUsers,
      activeUsers7d,
      totalTasks,
      totalHabits,
      totalJournals,
      totalGoals,
      totalStorageUsed: 0,
      totalAiUsed: 0,
      userGrowth,
      tableCounts,
      recentActivity: recentActivity.slice(0, 15),
    })
  } catch (error) {
    console.error('Admin stats error:', error)
    return NextResponse.json({ error: 'فشل تحميل الإحصائيات' }, { status: 500 })
  }
}