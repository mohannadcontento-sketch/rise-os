import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { Prisma } from '@prisma/client'

export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth(request)
    if (!userId) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }

    // Count users
    const totalUsers = await db.user.count()

    // Active users in last 7 days (users with recent activity)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const activeUsers7d = await db.user.count({
      where: { updatedAt: { gte: sevenDaysAgo } },
    })

    // User growth over last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const usersCreatedInPeriod = await db.user.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    })

    const usersBeforePeriod = await db.user.count({
      where: { createdAt: { lt: thirtyDaysAgo } },
    })

    // Build daily growth map
    const dateMap = new Map<string, number>()
    for (let i = 0; i <= 30; i++) {
      const d = new Date(thirtyDaysAgo)
      d.setDate(d.getDate() + i)
      dateMap.set(d.toISOString().slice(0, 10), 0)
    }

    for (const u of usersCreatedInPeriod) {
      const day = u.createdAt.toISOString().slice(0, 10)
      dateMap.set(day, (dateMap.get(day) || 0) + 1)
    }

    let cumulativeCount = usersBeforePeriod
    const userGrowth: { date: string; count: number }[] = []
    for (const [date, newCount] of dateMap) {
      cumulativeCount += newCount
      userGrowth.push({ date, count: cumulativeCount })
    }

    // Table counts
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
    ] = await Promise.all([
      db.task.count(),
      db.habit.count(),
      db.journal.count(),
      db.goal.count(),
      db.project.count(),
      db.book.count(),
      db.knowledgeItem.count(),
      db.financeRecord.count(),
      db.focusSession.count(),
    ])

    // Storage usage
    const storageRecords = await db.userStorage.findMany()
    const totalStorageUsed = storageRecords.reduce((acc, s) => acc + s.storageUsed, 0)

    // AI usage
    const aiUsages = await db.userAIUsage.findMany()
    const totalAiUsed = aiUsages.reduce((acc, a) => acc + a.monthlyUsed, 0)

    // Recent activity
    const recentActivity: { time: string; action: string; user: string }[] = []

    // Recent tasks
    const recentTasks = await db.task.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: { title: true, userId: true, updatedAt: true, user: { select: { name: true } } },
    })
    for (const t of recentTasks) {
      recentActivity.push({
        time: t.updatedAt.toISOString(),
        action: `مهمة: ${t.title.slice(0, 40)}`,
        user: t.user?.name || 'مستخدم',
      })
    }

    // Recent journals
    const recentJournals = await db.journal.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { content: true, userId: true, createdAt: true, user: { select: { name: true } } },
    })
    for (const j of recentJournals) {
      recentActivity.push({
        time: j.createdAt.toISOString(),
        action: `يومية: ${j.content.slice(0, 40)}`,
        user: j.user?.name || 'مستخدم',
      })
    }

    // Sort by time desc and limit
    recentActivity.sort((a, b) => b.time.localeCompare(a.time))

    const tableCounts: Record<string, number> = {
      User: totalUsers,
      Task: totalTasks,
      Habit: totalHabits,
      HabitLog: await db.habitLog.count(),
      Journal: totalJournals,
      Goal: totalGoals,
      Milestone: await db.milestone.count(),
      Project: totalProjects,
      Book: totalBooks,
      KnowledgeItem: totalKnowledge,
      FinanceRecord: totalFinanceRecords,
      FocusSession: totalFocusSessions,
      UserStorage: storageRecords.length,
      UserApiKey: await db.userApiKey.count(),
    }

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