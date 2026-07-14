import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getSupabase } from '@/lib/supabase'
import { getToday, getLast30Days, getWeekDays } from '@/lib/rise-utils'

// Vercel: extend serverless function timeout to 30s for cold starts
export const maxDuration = 30

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) {
      return NextResponse.json(fallbackDashboard())
    }

    const supabase = getSupabase()
    const today = getToday()
    const last30 = getLast30Days()
    const weekDays = getWeekDays()

    // Fetch all data in parallel
    const [
      userResult,
      tasksResult,
      habitsResult,
      habitLogsResult,
      focusSessionsResult,
      healthLogResult,
      morningLogResult,
      achievementsResult,
      dailyScoresResult,
      projectsResult,
      goalsResult,
      booksResult,
      journalsResult,
    ] = await Promise.all([
      // User
      supabase.from('User').select('*').eq('id', userId).single(),
      // Tasks with project join
      supabase
        .from('Task')
        .select('*, project:Project(name, color)')
        .eq('userId', userId)
        .order('createdAt', { ascending: false })
        .limit(10),
      // Habits
      supabase.from('Habit').select('*').eq('userId', userId),
      // Today habit logs (join to filter by owner user)
      supabase
        .from('HabitLog')
        .select('*, habit:Habit(userId)')
        .eq('habit.userId', userId)
        .eq('date', today),
      // Recent focus sessions (last 30 days)
      supabase
        .from('FocusSession')
        .select('*')
        .eq('userId', userId)
        .gte('startedAt', last30[0])
        .order('startedAt', { ascending: false }),
      // Today health log
      supabase
        .from('HealthLog')
        .select('*')
        .eq('userId', userId)
        .eq('date', today)
        .limit(1),
      // Today morning log
      supabase
        .from('MorningLog')
        .select('*')
        .eq('userId', userId)
        .eq('date', today)
        .limit(1),
      // Achievements
      supabase
        .from('UserAchievement')
        .select('*')
        .eq('userId', userId)
        .order('earnedAt', { ascending: false })
        .limit(10),
      // Daily scores for last 30 days
      supabase
        .from('DailyScore')
        .select('*')
        .eq('userId', userId)
        .in('date', last30),
      // Projects
      supabase.from('Project').select('*').eq('userId', userId),
      // Active goals (top 5)
      supabase
        .from('Goal')
        .select('*')
        .eq('userId', userId)
        .eq('status', 'active')
        .limit(5),
      // Books currently reading
      supabase
        .from('Book')
        .select('*')
        .eq('userId', userId)
        .eq('status', 'reading'),
      // Recent journals
      supabase
        .from('Journal')
        .select('*')
        .eq('userId', userId)
        .order('createdAt', { ascending: false })
        .limit(5),
    ])

    const user = userResult.data
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const tasks = tasksResult.data || []
    const habits = habitsResult.data || []
    const todayHabitsLogs = habitLogsResult.data || []
    const focusSessions = focusSessionsResult.data || []
    const healthLog = healthLogResult.data?.[0] || null
    const morningLog = morningLogResult.data?.[0] || null
    const achievements = achievementsResult.data || []
    const dailyScores = dailyScoresResult.data || []
    const projects = projectsResult.data || []
    const goals = goalsResult.data || []
    const books = booksResult.data || []
    const journals = journalsResult.data || []

    // Computed metrics
    const completedTasksToday = tasks.filter(
      (t) => t.completedAt && String(t.completedAt).startsWith(today),
    ).length
    const completedHabitsToday = todayHabitsLogs.filter((l) => l.completed).length
    const totalHabits = habits.length
    const todayFocusMin = focusSessions
      .filter(
        (s) => String(s.startedAt).startsWith(today) && s.completed,
      )
      .reduce((sum, s) => sum + (s.actualMin || 0), 0)

    const totalTasks = tasks.length
    const doneTasks = tasks.filter((t) => t.status === 'done').length

    return NextResponse.json({
      user: {
        name: user.name,
        level: user.level,
        xp: user.xp,
        streak: user.streak,
        longestStreak: user.longestStreak,
        totalFocusMin: user.totalFocusMin,
        totalTasksDone: user.totalTasksDone,
      },
      today: {
        tasksCompleted: completedTasksToday,
        tasksTotal: totalTasks,
        habitsCompleted: completedHabitsToday,
        habitsTotal: totalHabits,
        focusMin: todayFocusMin,
        morningScore: morningLog?.score || 0,
      },
      tasks: tasks.map((t) => ({
        ...t,
        done: t.status === 'done',
        projectName: t.project?.name,
        projectColor: t.project?.color,
      })),
      habits: habits.map((h) => ({
        ...h,
        todayCompleted:
          todayHabitsLogs.find((l) => l.habitId === h.id)?.completed || false,
        todayCount:
          todayHabitsLogs.find((l) => l.habitId === h.id)?.count || 0,
      })),
      recentFocus: focusSessions.slice(0, 5),
      health: healthLog,
      morning: morningLog,
      achievements,
      dailyScores: dailyScores.sort((a, b) => a.date.localeCompare(b.date)),
      projects: projects.map((p) => ({
        ...p,
        taskCount: tasks.filter((t) => t.projectId === p.id).length,
        doneTaskCount: tasks.filter(
          (t) => t.projectId === p.id && t.status === 'done',
        ).length,
      })),
      goals,
      books,
      journals,
      weekDays,
    })
  } catch (error) {
    console.error('Dashboard error:', error)
    // Return fallback demo data so the site works even without DB
    return NextResponse.json(fallbackDashboard())
  }
}

/** Fallback dashboard data when database is unavailable (e.g., cold start on Vercel) */
function fallbackDashboard() {
  return {
    user: { name: 'مستخدم RiseOS', level: 7, xp: 650, streak: 12, longestStreak: 21, totalFocusMin: 4200, totalTasksDone: 187, xpToNextLevel: 100, avatar: null },
    today: { tasksCompleted: 0, tasksTotal: 5, habitsCompleted: 0, habitsTotal: 3, focusMin: 0, morningScore: 0 },
    tasks: [
      { id: '1', title: 'إكمال التصميم', done: true, priority: 'high', xpReward: 25 },
      { id: '2', title: 'كتابة الفصل الثالث', done: false, priority: 'high', xpReward: 30 },
      { id: '3', title: 'مراجعة الكود', done: false, priority: 'medium', xpReward: 15 },
      { id: '4', title: 'تمرين رياضي', done: false, priority: 'medium', xpReward: 20 },
      { id: '5', title: 'قراءة 30 صفحة', done: false, priority: 'low', xpReward: 10 },
    ],
    habits: [
      { id: 'h1', name: 'شرب الماء', icon: '💧', color: '#3B82F6', frequency: 'daily', targetCount: 8, xpReward: 10, todayCompleted: false, todayCount: 0 },
      { id: 'h2', name: 'تمارين رياضية', icon: '🏋️', color: '#EF4444', frequency: 'daily', targetCount: 1, xpReward: 25, todayCompleted: false, todayCount: 0 },
      { id: 'h3', name: 'قراءة', icon: '📖', color: '#059669', frequency: 'daily', targetCount: 1, xpReward: 15, todayCompleted: false, todayCount: 0 },
    ],
    todayHabitsLogs: [],
    recentFocus: [],
    health: null,
    morning: null,
    achievements: [
      { id: 'a1', badgeName: 'أسبوع متواصل', badgeIcon: '🔥', badgeDesc: '7 أيام متتالية', earnedAt: new Date().toISOString() },
      { id: 'a2', badgeName: 'ثلاثة أسابيع', badgeIcon: '⚡', badgeDesc: '21 يوم متتالي', earnedAt: new Date().toISOString() },
    ],
    dailyScores: Array.from({ length: 10 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - 9 + i)
      return { date: d.toISOString().split('T')[0], score: 40 + Math.round(Math.random() * 55), morningScore: 50, taskScore: 50, habitScore: 50, focusScore: 40, healthScore: 50, journalScore: 40 }
    }),
    projects: [
      { id: 'p1', name: 'تطوير تطبيق الويب', color: '#059669', progress: 65, taskCount: 3, doneTaskCount: 1 },
      { id: 'p2', name: 'كتابة الكتاب', color: '#D4A853', progress: 35, taskCount: 2, doneTaskCount: 0 },
      { id: 'p3', name: 'تعلم البرمجة', color: '#6366F1', progress: 80, taskCount: 1, doneTaskCount: 0 },
    ],
    goals: [
      { id: 'g1', title: 'إكمال كتاب الإنتاجية', progress: 35, status: 'active', deadline: '2025-12-31' },
      { id: 'g2', title: 'الوصول لمستوى 10', progress: 70, status: 'active', deadline: '2025-12-31' },
    ],
    books: [
      { id: 'b1', title: 'العمل العميق', author: 'كال نيوبورت', status: 'reading', progress: 61, totalPages: 296, currentPage: 180 },
      { id: 'b2', title: 'عادات ذرية', author: 'جيمس كلير', status: 'completed', progress: 100, rating: 5 },
    ],
    journals: [],
    weekDays: [],
  }
}