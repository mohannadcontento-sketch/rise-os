import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseWithAuth, handleRouteError, ensureUserExists } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { getToday, getLast30Days } from '@/lib/rise-utils'

export async function POST(req: NextRequest) {
  try {
        const userId = await requireAuth(req)

    const supabase = getSupabaseWithAuth(req)
    await ensureUserExists(supabase, userId)

    // Parse body to check for profileOnly flag
    let createProfileOnly = false
    try {
      const body = await req.json()
      createProfileOnly = body?.createProfileOnly === true
    } catch { /* no body or invalid JSON — default to full seed */ }

    // Check if user profile already exists
    const { data: existingUser } = await supabase
      .from('User')
      .select('id')
      .eq('id', userId)
      .single()

    // If profileOnly mode: just ensure User + UserSettings exist, no sample data
    if (createProfileOnly) {
      if (!existingUser) {
        await supabase.from('User').upsert({
          id: userId,
          email: '',
          name: '',
          level: 1,
          xp: 0,
          streak: 0,
          longestStreak: 0,
          totalFocusMin: 0,
          totalTasksDone: 0,
        })
        await supabase.from('UserSettings').upsert({
          userId,
          theme: 'system',
          language: 'ar',
          wakeUpTime: '06:00',
          sleepTime: '22:00',
          focusDuration: 50,
          dailyWaterGoal: 8,
          dailyReadingGoal: 30,
          weeklyExerciseGoal: 5,
        })
      }
      return NextResponse.json({ success: true, seeded: false })
    }

    // Full seed mode — check if user already has data
    const { count: taskCount } = await supabase
      .from('Task')
      .select('id', { count: 'exact', head: true })
      .eq('userId', userId)

    if (existingUser && taskCount && taskCount > 0) {
      return NextResponse.json({ success: true, user: existingUser, seeded: false })
    }

    const today = getToday()
    const last30 = getLast30Days()

    // --- Create / update User profile ---
    await supabase.from('User').upsert({
      id: userId,
      email: '',
      name: 'مستخدم RiseOS',
      level: 7,
      xp: 650,
      streak: 12,
      longestStreak: 21,
      totalFocusMin: 4200,
      totalTasksDone: 187,
    })

    // --- UserSettings ---
    await supabase.from('UserSettings').upsert({
      userId,
      theme: 'system',
      language: 'ar',
      wakeUpTime: '06:00',
      sleepTime: '22:00',
      focusDuration: 50,
      dailyWaterGoal: 8,
      dailyReadingGoal: 30,
      weeklyExerciseGoal: 5,
    })

    // --- Projects ---
    const { data: projects } = await supabase
      .from('Project')
      .insert([
        { userId, name: 'تطوير تطبيق الويب', description: 'بناء تطبيق ويب متكامل', color: '#059669', progress: 65 },
        { userId, name: 'كتابة الكتاب', description: 'إكمال كتاب الإنتاجية', color: '#D4A853', progress: 35 },
        { userId, name: 'تعلم البرمجة', description: 'دورة متقدمة في TypeScript', color: '#6366F1', progress: 80 },
      ])
      .select('id')

    const projectId0 = projects?.[0]?.id
    const projectId1 = projects?.[1]?.id
    const projectId2 = projects?.[2]?.id

    // --- Tasks ---
    const taskRows = [
      { userId, title: 'إكمال التصميم', status: 'done', priority: 'high', projectId: projectId0, xpReward: 25, completedAt: new Date().toISOString() },
      { userId, title: 'كتابة الفصل الثالث', status: 'in_progress', priority: 'high', projectId: projectId1, xpReward: 30 },
      { userId, title: 'مراجعة الكود', status: 'todo', priority: 'medium', projectId: projectId0, dueDate: today, xpReward: 15 },
      { userId, title: 'تمرين رياضي', status: 'todo', priority: 'medium', xpReward: 20 },
      { userId, title: 'قراءة 30 صفحة', status: 'todo', priority: 'low', xpReward: 10 },
      { userId, title: 'اجتماع الفريق', status: 'todo', priority: 'high', dueDate: today, xpReward: 15 },
      { userId, title: 'تحديث المدونة', status: 'todo', priority: 'low', projectId: projectId0, xpReward: 20 },
      { userId, title: 'درس TypeScript', status: 'in_progress', priority: 'medium', projectId: projectId2, xpReward: 15 },
      { userId, title: 'تخطيط الأسبوع', status: 'done', priority: 'medium', xpReward: 10, completedAt: new Date().toISOString() },
      { userId, title: 'مراجعة أهداف الشهر', status: 'todo', priority: 'high', dueDate: today, xpReward: 15 },
    ]
    await supabase.from('Task').insert(taskRows)

    // --- Habits ---
    const habitRows = [
      { userId, name: 'شرب الماء', icon: '💧', color: '#3B82F6', frequency: 'daily', targetCount: 8, xpReward: 10 },
      { userId, name: 'تمارين رياضية', icon: '🏋️', color: '#EF4444', frequency: 'daily', targetCount: 1, xpReward: 25 },
      { userId, name: 'قراءة', icon: '📖', color: '#059669', frequency: 'daily', targetCount: 1, xpReward: 15 },
      { userId, name: 'تأمل', icon: '🧘', color: '#8B5CF6', frequency: 'daily', targetCount: 1, xpReward: 15 },
      { userId, name: 'كتابة اليوميات', icon: '✍️', color: '#D4A853', frequency: 'daily', targetCount: 1, xpReward: 20 },
      { userId, name: 'تعلم مهارة جديدة', icon: '🎯', color: '#F97316', frequency: 'daily', targetCount: 1, xpReward: 20 },
      { userId, name: 'لا ساعة لمدة ساعة', icon: '📵', color: '#6366F1', frequency: 'daily', targetCount: 1, xpReward: 10 },
    ]
    const { data: createdHabits } = await supabase
      .from('Habit')
      .insert(habitRows)
      .select('id, targetCount')

    // --- Habit Logs (last 30 days) ---
    if (createdHabits && createdHabits.length > 0) {
      const habitLogRows: Array<{ habitId: string; date: string; completed: boolean; count: number }> = []
      for (const day of last30) {
        for (const habit of createdHabits) {
          const completed = Math.random() > 0.3
          habitLogRows.push({
            habitId: habit.id,
            date: day,
            completed,
            count: completed ? (habit.targetCount || 1) : 0,
          })
        }
      }
      // Insert in batches of 500 to avoid Supabase row limits
      for (let i = 0; i < habitLogRows.length; i += 500) {
        await supabase.from('HabitLog').insert(habitLogRows.slice(i, i + 500))
      }
    }

    // --- Goals + Milestones ---
    const goalRows = [
      { userId, title: 'إكمال كتاب الإنتاجية', vision: 'نشر كتاب يغيّر حياة الناس', why: 'للمساهمة في نشر المعرفة', type: 'quarterly', progress: 35, deadline: '2025-12-31' },
      { userId, title: 'الوصول لمستوى 10', vision: 'بناء نظام حياة متكامل', why: 'للتحول لشخص أفضل', type: 'annual', progress: 70, deadline: '2025-12-31' },
      { userId, title: 'قراءة 24 كتاب', vision: 'قراءة كتابين شهرياً', why: 'للتطور المستمر', type: 'annual', progress: 45, deadline: '2025-12-31' },
      { userId, title: 'تسجيل 500 ساعة عمل عميق', vision: 'إتقان التركيز العميق', why: 'لزيادة الإنتاجية', type: 'annual', progress: 65, deadline: '2025-12-31' },
    ]
    const { data: createdGoals } = await supabase
      .from('Goal')
      .insert(goalRows)
      .select('id')

    if (createdGoals && createdGoals.length > 0) {
      const milestoneRows: Array<{ goalId: string; title: string; completed: boolean; order: number }> = []
      for (const goal of createdGoals) {
        milestoneRows.push(
          { goalId: goal.id, title: 'البحث وجمع المصادر', completed: true, order: 0 },
          { goalId: goal.id, title: 'كتابة المسودة الأولى', completed: false, order: 1 },
          { goalId: goal.id, title: 'المراجعة والتحرير', completed: false, order: 2 },
          { goalId: goal.id, title: 'النشر', completed: false, order: 3 },
        )
      }
      await supabase.from('Milestone').insert(milestoneRows)
    }

    // --- Journals (last 10 days) ---
    const moodValues = [3, 4, 5, 4, 3, 5, 4, 3, 4, 5]
    const energyValues = [4, 3, 5, 4, 3, 4, 5, 3, 4, 5]
    const journalRows = last30.slice(-10).map((day, i) => ({
      userId,
      date: day,
      content: 'كان يوماً مليئاً بالإنجازات والتقدم. تعلمت أشياء جديدة وأنجزت مهام مهمة.',
      gratitude: 'الصحة، العائلة، الفرص المتاحة',
      wins: 'أكملت مهمة مهمة وتعلمت مهارة جديدة',
      challenges: 'بعض التشتت في الصباح لكن تم التغلب عليه',
      mood: moodValues[i] ?? 4,
      energy: energyValues[i] ?? 4,
    }))
    await supabase.from('Journal').insert(journalRows)

    // --- Focus Sessions (last 14 days) ---
    const focusRows: Array<{
      userId: string; duration: number; actualMin: number; type: string; completed: boolean; startedAt: string; completedAt: string | null
    }> = []
    for (const day of last30.slice(-14)) {
      const sessions = Math.floor(Math.random() * 3) + 1
      for (let i = 0; i < sessions; i++) {
        const duration = [25, 50, 90][Math.floor(Math.random() * 3)]
        const completed = Math.random() > 0.2
        focusRows.push({
          userId,
          duration,
          actualMin: completed ? duration : Math.floor(duration * 0.7),
          type: duration === 25 ? 'pomodoro' : duration === 50 ? 'deep50' : 'deep90',
          completed,
          startedAt: new Date(day + 'T08:00:00').toISOString(),
          completedAt: completed ? new Date(day + 'T09:00:00').toISOString() : null,
        })
      }
    }
    await supabase.from('FocusSession').insert(focusRows)

    // --- Health Logs (last 14 days) ---
    const healthRows = last30.slice(-14).map((day) => ({
      userId,
      date: day,
      sleepHours: +(6 + Math.random() * 3).toFixed(1),
      sleepQuality: Math.floor(Math.random() * 3) + 3,
      waterGlasses: Math.floor(Math.random() * 5) + 4,
      steps: Math.floor(Math.random() * 8000) + 3000,
      calories: Math.floor(Math.random() * 500) + 1500,
      mood: Math.floor(Math.random() * 3) + 3,
      energy: Math.floor(Math.random() * 3) + 3,
      exerciseType: Math.random() > 0.3 ? 'جري' : null,
      exerciseMin: Math.random() > 0.3 ? Math.floor(Math.random() * 45) + 15 : null,
    }))
    await supabase.from('HealthLog').insert(healthRows)

    // --- Finance Records ---
    const financeRows = [
      { userId, type: 'income', description: 'راتب شهري', amount: 15000, category: 'عمل', date: today },
      { userId, type: 'income', description: 'مشروع حر', amount: 3000, category: 'عمل حر', date: today },
      { userId, type: 'expense', description: 'إيجار', amount: 4000, category: 'سكن', date: today },
      { userId, type: 'expense', description: 'طعام', amount: 2000, category: 'غذاء', date: today },
      { userId, type: 'expense', description: 'مواصلات', amount: 500, category: 'تنقل', date: today },
      { userId, type: 'expense', description: 'اشتراكات', amount: 200, category: 'اشتراكات', date: today },
      { userId, type: 'savings', description: 'ادخار شهري', amount: 3000, category: 'ادخار', date: today },
      { userId, type: 'investment', description: 'استثمار', amount: 2000, category: 'أسهم', date: today },
      { userId, type: 'expense', description: 'كتب', amount: 300, category: 'تعلم', date: today },
      { userId, type: 'expense', description: 'نادي رياضي', amount: 250, category: 'صحة', date: today },
    ]
    await supabase.from('FinanceRecord').insert(financeRows)

    // --- Books ---
    const bookRows = [
      { userId, title: 'عادات ذرية', author: 'جيمس كلير', type: 'book', status: 'completed', totalPages: 320, currentPage: 320, progress: 100, rating: 5, favoriteQuote: 'أنت لا ترتفع لمستوى أهدافك، بل تنخفض لمستوى أنظمتك.', startDate: '2025-01-15' },
      { userId, title: 'العمل العميق', author: 'كال نيوبورت', type: 'book', status: 'reading', totalPages: 296, currentPage: 180, progress: 61, rating: 0, startDate: '2025-01-15' },
      { userId, title: 'العادات السبع', author: 'ستيفن كوفي', type: 'book', status: 'reading', totalPages: 384, currentPage: 120, progress: 31, rating: 0, startDate: '2025-01-15' },
      { userId, title: 'التفكير السريع والبطيء', author: 'دانيال كانيمان', type: 'book', status: 'want_to_read', totalPages: 499, currentPage: 0, progress: 0, startDate: '2025-01-15' },
      { userId, title: 'دورة React المتقدمة', author: 'أونلاين', type: 'course', status: 'reading', totalPages: 50, currentPage: 30, progress: 60, startDate: '2025-01-15' },
    ]
    await supabase.from('Book').insert(bookRows)

    // --- Knowledge Items ---
    const knowledgeRows = [
      { userId, type: 'idea', title: 'فكرة تطبيق جديد', content: 'تطبيق لتتبع العادات مع gamification', tags: '["أفكار","تطبيقات"]' },
      { userId, type: 'resource', title: 'أفضل أدوات الإنتاجية', content: 'Notion, Todoist, RiseOS...', tags: '["أدوات","إنتاجية"]' },
      { userId, type: 'knowledge', title: 'مبادئ التصميم', content: 'التسلسل الهرمي البصري، التباين، المحاذاة...', tags: '["تصميم","UI"]' },
      { userId, type: 'bookmark', title: 'مقال عن العمل العميق', content: 'https://example.com/deep-work', tags: '["قراءة","إنتاجية"]' },
    ]
    await supabase.from('KnowledgeItem').insert(knowledgeRows)

    // --- Morning Logs (last 10 days) ---
    const morningRows = last30.slice(-10).map((day) => {
      const total = 7
      const done = Math.floor(Math.random() * 3) + 4
      return {
        userId,
        date: day,
        score: Math.round((done / total) * 100),
        completedItems: JSON.stringify(Array(done).fill(true).concat(Array(total - done).fill(false))),
        totalItems: total,
      }
    })
    await supabase.from('MorningLog').insert(morningRows)

    // --- Daily Scores (last 30 days) ---
    const dailyScoreRows = last30.map((day) => ({
      userId,
      date: day,
      score: Math.round(40 + Math.random() * 55),
      morningScore: Math.round(30 + Math.random() * 70),
      taskScore: Math.round(30 + Math.random() * 70),
      habitScore: Math.round(30 + Math.random() * 70),
      focusScore: Math.round(20 + Math.random() * 80),
      healthScore: Math.round(30 + Math.random() * 70),
      journalScore: Math.round(20 + Math.random() * 80),
    }))
    await supabase.from('DailyScore').insert(dailyScoreRows)

    // --- Achievements ---
    const achievementRows = [
      { userId, badgeId: 'streak_7', badgeName: 'أسبوع متواصل', badgeIcon: '🔥', badgeDesc: '7 أيام متتالية' },
      { userId, badgeId: 'streak_21', badgeName: 'ثلاثة أسابيع', badgeIcon: '⚡', badgeDesc: '21 يوم متتالي' },
      { userId, badgeId: 'tasks_100', badgeName: 'مائة مهمة', badgeIcon: '✅', badgeDesc: 'أكملت 100 مهمة' },
      { userId, badgeId: 'focus_50h', badgeName: '50 ساعة تركيز', badgeIcon: '🧠', badgeDesc: '50 ساعة عمل عميق' },
      { userId, badgeId: 'books_5', badgeName: 'قارئ نهم', badgeIcon: '📚', badgeDesc: 'أنهيت 5 كتب' },
    ]
    await supabase.from('UserAchievement').insert(achievementRows)

    // Re-fetch user after update
    const { data: user } = await supabase
      .from('User')
      .select('*')
      .eq('id', userId)
      .single()

    return NextResponse.json({ success: true, user })
  } catch (error) {
    return handleRouteError(error, 'seed')
  }
}