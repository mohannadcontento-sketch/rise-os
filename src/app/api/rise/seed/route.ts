import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { ensureUserExists, handleRouteError } from '@/lib/supabase'
import { getToday, getLast30Days } from '@/lib/rise-utils'

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ success: true, offline: true })
    await ensureUserExists(userId)

    // Parse body to check for profileOnly flag
    let createProfileOnly = false
    try {
      const body = await req.json()
      createProfileOnly = body?.createProfileOnly === true
    } catch { /* no body or invalid JSON — default to full seed */ }

    // Check if user profile already exists
    const existingUser = await db.user.findUnique({
      where: { id: userId },
      select: { id: true },
    })

    // If profileOnly mode: just ensure User + UserSettings exist, no sample data
    if (createProfileOnly) {
      if (!existingUser) {
        await db.user.create({
          data: {
            id: userId,
            email: '',
            name: '',
            level: 1,
            xp: 0,
            streak: 0,
            longestStreak: 0,
            totalFocusMin: 0,
            totalTasksDone: 0,
            settings: { create: {} },
          },
        })
      }
      return NextResponse.json({ success: true, seeded: false })
    }

    // Full seed mode — check if user already has data
    const taskCount = await db.task.count({ where: { userId } })

    if (existingUser && taskCount > 0) {
      return NextResponse.json({ success: true, user: existingUser, seeded: false })
    }

    const today = getToday()
    const last30 = getLast30Days()

    // --- Create / update User profile ---
    if (existingUser) {
      await db.user.update({
        where: { id: userId },
        data: {
          name: 'مستخدم RiseOS',
          level: 7,
          xp: 650,
          streak: 12,
          longestStreak: 21,
          totalFocusMin: 4200,
          totalTasksDone: 187,
        },
      })
    } else {
      await db.user.create({
        data: {
          id: userId,
          email: '',
          name: 'مستخدم RiseOS',
          level: 7,
          xp: 650,
          streak: 12,
          longestStreak: 21,
          totalFocusMin: 4200,
          totalTasksDone: 187,
          settings: { create: {} },
        },
      })
    }

    // --- UserSettings ---
    await db.userSettings.upsert({
      where: { userId },
      update: {
        theme: 'system',
        language: 'ar',
        wakeUpTime: '06:00',
        sleepTime: '22:00',
        focusDuration: 50,
        dailyWaterGoal: 8,
        dailyReadingGoal: 30,
        weeklyExerciseGoal: 5,
      },
      create: {
        userId,
        theme: 'system',
        language: 'ar',
        wakeUpTime: '06:00',
        sleepTime: '22:00',
        focusDuration: 50,
        dailyWaterGoal: 8,
        dailyReadingGoal: 30,
        weeklyExerciseGoal: 5,
      },
    })

    // --- Projects ---
    const project0 = await db.project.create({
      data: { userId, name: 'تطوير تطبيق الويب', description: 'بناء تطبيق ويب متكامل', color: '#059669', progress: 65 },
    })
    const project1 = await db.project.create({
      data: { userId, name: 'كتابة الكتاب', description: 'إكمال كتاب الإنتاجية', color: '#D4A853', progress: 35 },
    })
    const project2 = await db.project.create({
      data: { userId, name: 'تعلم البرمجة', description: 'دورة متقدمة في TypeScript', color: '#6366F1', progress: 80 },
    })

    // --- Tasks ---
    await db.task.create({ data: { userId, title: 'إكمال التصميم', status: 'done', priority: 'high', projectId: project0.id, xpReward: 25, completedAt: new Date() } })
    await db.task.create({ data: { userId, title: 'كتابة الفصل الثالث', status: 'in_progress', priority: 'high', projectId: project1.id, xpReward: 30 } })
    await db.task.create({ data: { userId, title: 'مراجعة الكود', status: 'todo', priority: 'medium', projectId: project0.id, dueDate: today, xpReward: 15 } })
    await db.task.create({ data: { userId, title: 'تمرين رياضي', status: 'todo', priority: 'medium', xpReward: 20 } })
    await db.task.create({ data: { userId, title: 'قراءة 30 صفحة', status: 'todo', priority: 'low', xpReward: 10 } })
    await db.task.create({ data: { userId, title: 'اجتماع الفريق', status: 'todo', priority: 'high', dueDate: today, xpReward: 15 } })
    await db.task.create({ data: { userId, title: 'تحديث المدونة', status: 'todo', priority: 'low', projectId: project0.id, xpReward: 20 } })
    await db.task.create({ data: { userId, title: 'درس TypeScript', status: 'in_progress', priority: 'medium', projectId: project2.id, xpReward: 15 } })
    await db.task.create({ data: { userId, title: 'تخطيط الأسبوع', status: 'done', priority: 'medium', xpReward: 10, completedAt: new Date() } })
    await db.task.create({ data: { userId, title: 'مراجعة أهداف الشهر', status: 'todo', priority: 'high', dueDate: today, xpReward: 15 } })

    // --- Habits ---
    const habit0 = await db.habit.create({ data: { userId, name: 'شرب الماء', icon: '💧', color: '#3B82F6', frequency: 'daily', targetCount: 8, xpReward: 10 } })
    const habit1 = await db.habit.create({ data: { userId, name: 'تمارين رياضية', icon: '🏋️', color: '#EF4444', frequency: 'daily', targetCount: 1, xpReward: 25 } })
    const habit2 = await db.habit.create({ data: { userId, name: 'قراءة', icon: '📖', color: '#059669', frequency: 'daily', targetCount: 1, xpReward: 15 } })
    const habit3 = await db.habit.create({ data: { userId, name: 'تأمل', icon: '🧘', color: '#8B5CF6', frequency: 'daily', targetCount: 1, xpReward: 15 } })
    const habit4 = await db.habit.create({ data: { userId, name: 'كتابة اليوميات', icon: '✍️', color: '#D4A853', frequency: 'daily', targetCount: 1, xpReward: 20 } })
    const habit5 = await db.habit.create({ data: { userId, name: 'تعلم مهارة جديدة', icon: '🎯', color: '#F97316', frequency: 'daily', targetCount: 1, xpReward: 20 } })
    const habit6 = await db.habit.create({ data: { userId, name: 'لا ساعة لمدة ساعة', icon: '📵', color: '#6366F1', frequency: 'daily', targetCount: 1, xpReward: 10 } })

    const createdHabits = [
      { id: habit0.id, targetCount: habit0.targetCount },
      { id: habit1.id, targetCount: habit1.targetCount },
      { id: habit2.id, targetCount: habit2.targetCount },
      { id: habit3.id, targetCount: habit3.targetCount },
      { id: habit4.id, targetCount: habit4.targetCount },
      { id: habit5.id, targetCount: habit5.targetCount },
      { id: habit6.id, targetCount: habit6.targetCount },
    ]

    // --- Habit Logs (last 30 days) ---
    for (const day of last30) {
      for (const habit of createdHabits) {
        const completed = Math.random() > 0.3
        try {
          await db.habitLog.create({
            data: {
              habitId: habit.id,
              date: day,
              completed,
              count: completed ? (habit.targetCount || 1) : 0,
            },
          })
        } catch {
          // Ignore duplicate errors
        }
      }
    }

    // --- Goals + Milestones ---
    const goal0 = await db.goal.create({ data: { userId, title: 'إكمال كتاب الإنتاجية', vision: 'نشر كتاب يغيّر حياة الناس', why: 'للمساهمة في نشر المعرفة', type: 'quarterly', progress: 35, deadline: '2025-12-31' } })
    const goal1 = await db.goal.create({ data: { userId, title: 'الوصول لمستوى 10', vision: 'بناء نظام حياة متكامل', why: 'للتحول لشخص أفضل', type: 'annual', progress: 70, deadline: '2025-12-31' } })
    const goal2 = await db.goal.create({ data: { userId, title: 'قراءة 24 كتاب', vision: 'قراءة كتابين شهرياً', why: 'للتطور المستمر', type: 'annual', progress: 45, deadline: '2025-12-31' } })
    const goal3 = await db.goal.create({ data: { userId, title: 'تسجيل 500 ساعة عمل عميق', vision: 'إتقان التركيز العميق', why: 'لزيادة الإنتاجية', type: 'annual', progress: 65, deadline: '2025-12-31' } })

    const createdGoals = [goal0, goal1, goal2, goal3]

    for (const goal of createdGoals) {
      await db.milestone.create({ data: { goalId: goal.id, title: 'البحث وجمع المصادر', completed: true, order: 0 } })
      await db.milestone.create({ data: { goalId: goal.id, title: 'كتابة المسودة الأولى', completed: false, order: 1 } })
      await db.milestone.create({ data: { goalId: goal.id, title: 'المراجعة والتحرير', completed: false, order: 2 } })
      await db.milestone.create({ data: { goalId: goal.id, title: 'النشر', completed: false, order: 3 } })
    }

    // --- Journals (last 10 days) ---
    const moodValues = [3, 4, 5, 4, 3, 5, 4, 3, 4, 5]
    const energyValues = [4, 3, 5, 4, 3, 4, 5, 3, 4, 5]
    for (let i = 0; i < last30.slice(-10).length; i++) {
      const day = last30.slice(-10)[i]
      await db.journal.create({
        data: {
          userId,
          date: day,
          content: 'كان يوماً مليئاً بالإنجازات والتقدم. تعلمت أشياء جديدة وأنجزت مهام مهمة.',
          gratitude: 'الصحة، العائلة، الفرص المتاحة',
          wins: 'أكملت مهمة مهمة وتعلمت مهارة جديدة',
          challenges: 'بعض التشتت في الصباح لكن تم التغلب عليه',
          mood: moodValues[i] ?? 4,
          energy: energyValues[i] ?? 4,
        },
      })
    }

    // --- Focus Sessions (last 14 days) ---
    for (const day of last30.slice(-14)) {
      const sessions = Math.floor(Math.random() * 3) + 1
      for (let i = 0; i < sessions; i++) {
        const duration = [25, 50, 90][Math.floor(Math.random() * 3)]
        const completed = Math.random() > 0.2
        await db.focusSession.create({
          data: {
            userId,
            duration,
            actualMin: completed ? duration : Math.floor(duration * 0.7),
            type: duration === 25 ? 'pomodoro' : duration === 50 ? 'deep50' : 'deep90',
            completed,
            startedAt: new Date(day + 'T08:00:00'),
            completedAt: completed ? new Date(day + 'T09:00:00') : null,
          },
        })
      }
    }

    // --- Health Logs (last 14 days) ---
    for (const day of last30.slice(-14)) {
      await db.healthLog.create({
        data: {
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
        },
      })
    }

    // --- Finance Records ---
    const financeData = [
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
    for (const f of financeData) {
      await db.financeRecord.create({ data: f })
    }

    // --- Books ---
    const bookData = [
      { userId, title: 'عادات ذرية', author: 'جيمس كلير', type: 'book', status: 'completed', totalPages: 320, currentPage: 320, progress: 100, rating: 5, favoriteQuote: 'أنت لا ترتفع لمستوى أهدافك، بل تنخفض لمستوى أنظمتك.', startDate: '2025-01-15' },
      { userId, title: 'العمل العميق', author: 'كال نيوبورت', type: 'book', status: 'reading', totalPages: 296, currentPage: 180, progress: 61, rating: 0, startDate: '2025-01-15' },
      { userId, title: 'العادات السبع', author: 'ستيفن كوفي', type: 'book', status: 'reading', totalPages: 384, currentPage: 120, progress: 31, rating: 0, startDate: '2025-01-15' },
      { userId, title: 'التفكير السريع والبطيء', author: 'دانيال كانيمان', type: 'book', status: 'want_to_read', totalPages: 499, currentPage: 0, progress: 0, startDate: '2025-01-15' },
      { userId, title: 'دورة React المتقدمة', author: 'أونلاين', type: 'course', status: 'reading', totalPages: 50, currentPage: 30, progress: 60, startDate: '2025-01-15' },
    ]
    for (const b of bookData) {
      await db.book.create({ data: b })
    }

    // --- Knowledge Items ---
    const knowledgeData = [
      { userId, type: 'idea', title: 'فكرة تطبيق جديد', content: 'تطبيق لتتبع العادات مع gamification', tags: '["أفكار","تطبيقات"]' },
      { userId, type: 'resource', title: 'أفضل أدوات الإنتاجية', content: 'Notion, Todoist, RiseOS...', tags: '["أدوات","إنتاجية"]' },
      { userId, type: 'knowledge', title: 'مبادئ التصميم', content: 'التسلسل الهرمي البصري، التباين، المحاذاة...', tags: '["تصميم","UI"]' },
      { userId, type: 'bookmark', title: 'مقال عن العمل العميق', content: 'https://example.com/deep-work', tags: '["قراءة","إنتاجية"]' },
    ]
    for (const k of knowledgeData) {
      await db.knowledgeItem.create({ data: k })
    }

    // --- Morning Logs (last 10 days) ---
    for (const day of last30.slice(-10)) {
      const total = 7
      const done = Math.floor(Math.random() * 3) + 4
      await db.morningLog.create({
        data: {
          userId,
          date: day,
          score: Math.round((done / total) * 100),
          completedItems: JSON.stringify(Array(done).fill(true).concat(Array(total - done).fill(false))),
          totalItems: total,
        },
      })
    }

    // --- Daily Scores (last 30 days) ---
    for (const day of last30) {
      await db.dailyScore.create({
        data: {
          userId,
          date: day,
          score: Math.round(40 + Math.random() * 55),
          morningScore: Math.round(30 + Math.random() * 70),
          taskScore: Math.round(30 + Math.random() * 70),
          habitScore: Math.round(30 + Math.random() * 70),
          focusScore: Math.round(20 + Math.random() * 80),
          healthScore: Math.round(30 + Math.random() * 70),
          journalScore: Math.round(20 + Math.random() * 80),
        },
      })
    }

    // --- Achievements ---
    await db.userAchievement.create({ data: { userId, badgeId: 'streak_7', badgeName: 'أسبوع متواصل', badgeIcon: '🔥', badgeDesc: '7 أيام متتالية' } })
    await db.userAchievement.create({ data: { userId, badgeId: 'streak_21', badgeName: 'ثلاثة أسابيع', badgeIcon: '⚡', badgeDesc: '21 يوم متتالي' } })
    await db.userAchievement.create({ data: { userId, badgeId: 'tasks_100', badgeName: 'مائة مهمة', badgeIcon: '✅', badgeDesc: 'أكملت 100 مهمة' } })
    await db.userAchievement.create({ data: { userId, badgeId: 'focus_50h', badgeName: '50 ساعة تركيز', badgeIcon: '🧠', badgeDesc: '50 ساعة عمل عميق' } })
    await db.userAchievement.create({ data: { userId, badgeId: 'books_5', badgeName: 'قارئ نهم', badgeIcon: '📚', badgeDesc: 'أنهيت 5 كتب' } })

    // Re-fetch user after update
    const user = await db.user.findUnique({ where: { id: userId } })

    return NextResponse.json({ success: true, user })
  } catch (error) {
    return handleRouteError(error, 'seed')
  }
}