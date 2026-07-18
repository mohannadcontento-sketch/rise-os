import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabase, ADMIN_EMAIL } from '@/lib/supabase'

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createClient(url, key)
}

async function requireAdmin(request: NextRequest) {
  const authHeader = request.headers.get('Authorization') || ''
  const token = authHeader.replace('Bearer ', '')

  const supabase = getSupabase()
  const { data: userData } = await supabase.auth.getUser(token)
  if (!userData.user || userData.user.email !== ADMIN_EMAIL) {
    return null
  }
  return userData.user
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAdmin(request)
    if (!user) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }

    const adminClient = getAdminSupabase()
    const supabase = getSupabase()

    // Get all users from Supabase auth
    const { data: { users }, error: listError } = await adminClient.auth.admin.listUsers()
    const totalUsers = users?.length || 0

    // Active users in last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const activeUsers7d = users?.filter(u => u.last_sign_in_at && u.last_sign_in_at >= sevenDaysAgo).length || 0

    // User growth over last 30 days (grouped by day)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const userGrowth: { date: string; count: number }[] = []

    // Build cumulative growth data
    const sortedUsers = (users || [])
      .filter(u => u.created_at && new Date(u.created_at) >= thirtyDaysAgo)
      .sort((a, b) => a.created_at!.localeCompare(b.created_at!))

    // Count users created before the period
    const usersBeforePeriod = (users || []).filter(
      u => u.created_at && new Date(u.created_at) < thirtyDaysAgo
    ).length

    let cumulativeCount = usersBeforePeriod

    // Create date entries for each day
    const dateMap = new Map<string, number>()
    for (let i = 0; i <= 30; i++) {
      const d = new Date(thirtyDaysAgo)
      d.setDate(d.getDate() + i)
      dateMap.set(d.toISOString().slice(0, 10), 0)
    }

    // Count users per day
    for (const u of sortedUsers) {
      const day = u.created_at!.slice(0, 10)
      dateMap.set(day, (dateMap.get(day) || 0) + 1)
    }

    // Build growth data with cumulative counts
    for (const [date, newCount] of dateMap) {
      cumulativeCount += newCount
      userGrowth.push({ date, count: cumulativeCount })
    }

    // Count rows in various tables
    const tableCounts: Record<string, number> = {}
    const tablesToCount = ['User', 'Task', 'Habit', 'HabitLog', 'Journal', 'Goal', 'GoalMilestone', 'Project', 'Book', 'KnowledgeItem', 'UserStorage', 'UserAIUsage', 'ApiKey']

    for (const table of tablesToCount) {
      try {
        const { count, error } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true })
        if (!error && count !== null) {
          tableCounts[table] = count
        }
      } catch {
        // Table might not exist
      }
    }

    // Aggregate stats
    const totalTasks = tableCounts['Task'] || 0
    const totalHabits = tableCounts['Habit'] || 0
    const totalJournals = tableCounts['Journal'] || 0
    const totalGoals = tableCounts['Goal'] || 0

    // Storage and AI usage
    const { data: storageRecords } = await supabase.from('UserStorage').select('*')
    const totalStorageUsed = storageRecords?.reduce((acc: number, s: any) => acc + (s.storageUsed || 0), 0) || 0

    const { data: aiUsages } = await supabase.from('UserAIUsage').select('*')
    const totalAiUsed = aiUsages?.reduce((acc: number, a: any) => acc + (a.monthlyUsed || 0), 0) || 0

    // Recent activity — get recent tasks, journals, habits
    const recentActivity: { time: string; action: string; user: string }[] = []

    try {
      const { data: recentTasks } = await supabase
        .from('Task')
        .select('title, userId, createdAt, updatedAt')
        .order('updatedAt', { ascending: false })
        .limit(5)
      if (recentTasks) {
        for (const t of recentTasks) {
          const userInfo = users?.find(u => u.id === t.userId)
          recentActivity.push({
            time: t.updatedAt || t.createdAt || '',
            action: `مهمة: ${(t.title || '').slice(0, 40)}`,
            user: userInfo?.user_metadata?.display_name || userInfo?.email?.split('@')[0] || 'مستخدم',
          })
        }
      }
    } catch { /* ignore */ }

    try {
      const { data: recentJournals } = await supabase
        .from('Journal')
        .select('content, userId, createdAt')
        .order('createdAt', { ascending: false })
        .limit(5)
      if (recentJournals) {
        for (const j of recentJournals) {
          const userInfo = users?.find(u => u.id === j.userId)
          recentActivity.push({
            time: j.createdAt || '',
            action: `يومية: ${(j.content || '').slice(0, 40)}`,
            user: userInfo?.user_metadata?.display_name || userInfo?.email?.split('@')[0] || 'مستخدم',
          })
        }
      }
    } catch { /* ignore */ }

    // Sort by time desc and limit
    recentActivity.sort((a, b) => b.time.localeCompare(a.time))

    return NextResponse.json({
      totalUsers,
      activeUsers7d,
      totalTasks,
      totalHabits,
      totalJournals,
      totalGoals,
      totalStorageUsed,
      totalAiUsed,
      userGrowth,
      tableCounts,
      recentActivity: recentActivity.slice(0, 15),
    })
  } catch (error) {
    console.error('Admin stats error:', error)
    return NextResponse.json({ error: 'فشل تحميل الإحصائيات' }, { status: 500 })
  }
}