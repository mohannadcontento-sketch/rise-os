import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getSupabaseWithAuth } from '@/lib/supabase'
import { getToday, getLast30Days, getWeekDays } from '@/lib/rise-utils'

// Vercel: extend serverless function timeout to 30s for cold starts
export const maxDuration = 30

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) {
      return NextResponse.json(emptyDashboard())
    }

    const supabase = getSupabaseWithAuth(req)
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
    // Return empty fallback when database is unavailable
    return NextResponse.json(emptyDashboard())
  }
}

function emptyDashboard() {
  return {
    user: { name: 'مستخدم', level: 1, xp: 0, streak: 0, longestStreak: 0, totalFocusMin: 0, totalTasksDone: 0, xpToNextLevel: 100, avatar: null },
    today: { tasksCompleted: 0, tasksTotal: 0, habitsCompleted: 0, habitsTotal: 0, focusMin: 0, morningScore: 0 },
    tasks: [],
    habits: [],
    todayHabitsLogs: [],
    recentFocus: [],
    health: null,
    morning: null,
    achievements: [],
    dailyScores: [],
    projects: [],
    goals: [],
    books: [],
    journals: [],
    weekDays: [],
    offline: true,
  }
}