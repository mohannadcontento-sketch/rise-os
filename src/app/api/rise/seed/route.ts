import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getToday, getLast30Days } from '@/lib/rise-utils'

const DEFAULT_USER_ID = 'rise-default-user'

export async function POST() {
  try {
    let user = await db.user.findUnique({ where: { id: DEFAULT_USER_ID } })
    
    if (!user) {
      user = await db.user.create({
        data: {
          id: DEFAULT_USER_ID,
          email: 'user@riseos.app',
          name: 'مستخدم RiseOS',
          level: 7,
          xp: 650,
          streak: 12,
          longestStreak: 21,
          totalFocusMin: 4200,
          totalTasksDone: 187,
        },
      })

      await db.userSettings.create({
        data: {
          userId: DEFAULT_USER_ID,
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

      const projects = await Promise.all([
        db.project.create({ data: { userId: DEFAULT_USER_ID, name: 'تطوير تطبيق الويب', description: 'بناء تطبيق ويب متكامل', color: '#059669', progress: 65 } }),
        db.project.create({ data: { userId: DEFAULT_USER_ID, name: 'كتابة الكتاب', description: 'إكمال كتاب الإنتاجية', color: '#D4A853', progress: 35 } }),
        db.project.create({ data: { userId: DEFAULT_USER_ID, name: 'تعلم البرمجة', description: 'دورة متقدمة في TypeScript', color: '#6366F1', progress: 80 } }),
      ])

      const today = getToday()
      const taskData = [
        { title: 'إكمال التصميم', status: 'done', priority: 'high', projectId: projects[0].id, xpReward: 25 },
        { title: 'كتابة الفصل الثالث', status: 'in_progress', priority: 'high', projectId: projects[1].id, xpReward: 30 },
        { title: 'مراجعة الكود', status: 'todo', priority: 'medium', projectId: projects[0].id, dueDate: today, xpReward: 15 },
        { title: 'تمرين رياضي', status: 'todo', priority: 'medium', xpReward: 20 },
        { title: 'قراءة 30 صفحة', status: 'todo', priority: 'low', xpReward: 10 },
        { title: 'اجتماع الفريق', status: 'todo', priority: 'high', dueDate: today, xpReward: 15 },
        { title: 'تحديث المدونة', status: 'todo', priority: 'low', projectId: projects[0].id, xpReward: 20 },
        { title: 'درس TypeScript', status: 'in_progress', priority: 'medium', projectId: projects[2].id, xpReward: 15 },
        { title: 'تخطيط الأسبوع', status: 'done', priority: 'medium', xpReward: 10 },
        { title: 'مراجعة أهداف الشهر', status: 'todo', priority: 'high', dueDate: today, xpReward: 15 },
      ]
      for (const t of taskData) {
        await db.task.create({ data: { userId: DEFAULT_USER_ID, ...t, completedAt: t.status === 'done' ? new Date() : null } })
      }

      const habits = [
        { name: 'شرب الماء', icon: '💧', color: '#3B82F6', frequency: 'daily', targetCount: 8, xpReward: 10 },
        { name: 'تمارين رياضية', icon: '🏋️', color: '#EF4444', frequency: 'daily', targetCount: 1, xpReward: 25 },
        { name: 'قراءة', icon: '📖', color: '#059669', frequency: 'daily', targetCount: 1, xpReward: 15 },
        { name: 'تأمل', icon: '🧘', color: '#8B5CF6', frequency: 'daily', targetCount: 1, xpReward: 15 },
        { name: 'كتابة اليوميات', icon: '✍️', color: '#D4A853', frequency: 'daily', targetCount: 1, xpReward: 20 },
        { name: 'تعلم مهارة جديدة', icon: '🎯', color: '#F97316', frequency: 'daily', targetCount: 1, xpReward: 20 },
        { name: 'لا ساعة لمدة ساعة', icon: '📵', color: '#6366F1', frequency: 'daily', targetCount: 1, xpReward: 10 },
      ]
      const createdHabits: Array<Awaited<ReturnType<typeof db.habit.create>>> = []
      for (const h of habits) {
        const habit = await db.habit.create({ data: { userId: DEFAULT_USER_ID, ...h } })
        createdHabits.push(habit)
      }

      const last30 = getLast30Days()
      for (const day of last30) {
        for (const habit of createdHabits) {
          const completed = Math.random() > 0.3
          await db.habitLog.create({
            data: { habitId: habit.id, date: day, completed, count: completed ? (habit.targetCount || 1) : 0 },
          })
        }
      }

      const goals = [
        { title: 'إكمال كتاب الإنتاجية', vision: 'نشر كتاب يغيّر حياة الناس', why: 'للمساهمة في نشر المعرفة', type: 'quarterly', progress: 35, deadline: '2025-12-31' },
        { title: 'الوصول لمستوى 10', vision: 'بناء نظام حياة متكامل', why: 'للتحول لشخص أفضل', type: 'annual', progress: 70, deadline: '2025-12-31' },
        { title: 'قراءة 24 كتاب', vision: 'قراءة كتابين شهرياً', why: 'للتطور المستمر', type: 'annual', progress: 45, deadline: '2025-12-31' },
        { title: 'تسجيل 500 ساعة عمل عميق', vision: 'إتقان التركيز العميق', why: 'لزيادة الإنتاجية', type: 'annual', progress: 65, deadline: '2025-12-31' },
      ]
      for (const g of goals) {
        const goal = await db.goal.create({ data: { userId: DEFAULT_USER_ID, ...g } })
        await db.milestone.createMany({
          data: [
            { goalId: goal.id, title: 'البحث وجمع المصادر', completed: true, order: 0 },
            { goalId: goal.id, title: 'كتابة المسودة الأولى', completed: false, order: 1 },
            { goalId: goal.id, title: 'المراجعة والتحرير', completed: false, order: 2 },
            { goalId: goal.id, title: 'النشر', completed: false, order: 3 },
          ],
        })
      }

      for (let i = 0; i < 10; i++) {
        const day = last30[last30.length - 10 + i]
        await db.journal.create({
          data: {
            userId: DEFAULT_USER_ID,
            date: day,
            content: 'كان يوماً مليئاً بالإنجازات والتقدم. تعلمت أشياء جديدة وأنجزت مهام مهمة.',
            gratitude: 'الصحة، العائلة، الفرص المتاحة',
            wins: 'أكملت مهمة مهمة وتعلمت مهارة جديدة',
            challenges: 'بعض التشتت في الصباح لكن تم التغلب عليه',
            mood: [3, 4, 5, 4, 3, 5, 4, 3, 4, 5][i] || 4,
            energy: [4, 3, 5, 4, 3, 4, 5, 3, 4, 5][i] || 4,
          },
        })
      }

      for (const day of last30.slice(-14)) {
        const sessions = Math.floor(Math.random() * 3) + 1
        for (let i = 0; i < sessions; i++) {
          const duration = [25, 50, 90][Math.floor(Math.random() * 3)]
          const completed = Math.random() > 0.2
          await db.focusSession.create({
            data: {
              userId: DEFAULT_USER_ID,
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

      for (const day of last30.slice(-14)) {
        await db.healthLog.create({
          data: {
            userId: DEFAULT_USER_ID,
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

      const financeData = [
        { type: 'income', description: 'راتب شهري', amount: 15000, category: 'عمل' },
        { type: 'income', description: 'مشروع حر', amount: 3000, category: 'عمل حر' },
        { type: 'expense', description: 'إيجار', amount: 4000, category: 'سكن' },
        { type: 'expense', description: 'طعام', amount: 2000, category: 'غذاء' },
        { type: 'expense', description: 'مواصلات', amount: 500, category: 'تنقل' },
        { type: 'expense', description: 'اشتراكات', amount: 200, category: 'اشتراكات' },
        { type: 'savings', description: 'ادخار شهري', amount: 3000, category: 'ادخار' },
        { type: 'investment', description: 'استثمار', amount: 2000, category: 'أسهم' },
        { type: 'expense', description: 'كتب', amount: 300, category: 'تعلم' },
        { type: 'expense', description: 'نادي رياضي', amount: 250, category: 'صحة' },
      ]
      for (const f of financeData) {
        await db.financeRecord.create({ data: { userId: DEFAULT_USER_ID, ...f, date: today } })
      }

      const books = [
        { title: 'عادات ذرية', author: 'جيمس كلير', type: 'book', status: 'completed', totalPages: 320, currentPage: 320, progress: 100, rating: 5, favoriteQuote: 'أنت لا ترتفع لمستوى أهدافك، بل تنخفض لمستوى أنظمتك.' },
        { title: 'العمل العميق', author: 'كال نيوبورت', type: 'book', status: 'reading', totalPages: 296, currentPage: 180, progress: 61, rating: 0 },
        { title: 'العادات السبع', author: 'ستيفن كوفي', type: 'book', status: 'reading', totalPages: 384, currentPage: 120, progress: 31, rating: 0 },
        { title: 'التفكير السريع والبطيء', author: 'دانيال كانيمان', type: 'book', status: 'want_to_read', totalPages: 499, currentPage: 0, progress: 0 },
        { title: 'دورة React المتقدمة', author: 'أونلاين', type: 'course', status: 'reading', totalPages: 50, currentPage: 30, progress: 60 },
      ]
      for (const b of books) {
        await db.book.create({ data: { userId: DEFAULT_USER_ID, ...b, startDate: '2025-01-15' } })
      }

      const knowledge = [
        { type: 'idea', title: 'فكرة تطبيق جديد', content: 'تطبيق لتتبع العادات مع gamification', tags: '["أفكار","تطبيقات"]' },
        { type: 'resource', title: 'أفضل أدوات الإنتاجية', content: 'Notion, Todoist, RiseOS...', tags: '["أدوات","إنتاجية"]' },
        { type: 'knowledge', title: 'مبادئ التصميم', content: 'التسلسل الهرمي البصري، التباين، المحاذاة...', tags: '["تصميم","UI"]' },
        { type: 'bookmark', title: 'مقال عن العمل العميق', content: 'https://example.com/deep-work', tags: '["قراءة","إنتاجية"]' },
      ]
      for (const k of knowledge) {
        await db.knowledgeItem.create({ data: { userId: DEFAULT_USER_ID, ...k } })
      }

      for (const day of last30.slice(-10)) {
        const items = JSON.stringify(['استيقاظ', 'شرب ماء', 'صلاة', 'تمارين', 'تأمل', 'قراءة', 'تخطيط'])
        const total = 7
        const done = Math.floor(Math.random() * 3) + 4
        await db.morningLog.create({
          data: {
            userId: DEFAULT_USER_ID,
            date: day,
            score: Math.round((done / total) * 100),
            completedItems: JSON.stringify(Array(done).fill(true).concat(Array(total - done).fill(false))),
            totalItems: total,
          },
        })
      }

      for (const day of last30) {
        await db.dailyScore.create({
          data: {
            userId: DEFAULT_USER_ID,
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

      const achievements = [
        { badgeId: 'streak_7', badgeName: 'أسبوع متواصل', badgeIcon: '🔥', badgeDesc: '7 أيام متتالية' },
        { badgeId: 'streak_21', badgeName: 'ثلاثة أسابيع', badgeIcon: '⚡', badgeDesc: '21 يوم متتالي' },
        { badgeId: 'tasks_100', badgeName: 'مائة مهمة', badgeIcon: '✅', badgeDesc: 'أكملت 100 مهمة' },
        { badgeId: 'focus_50h', badgeName: '50 ساعة تركيز', badgeIcon: '🧠', badgeDesc: '50 ساعة عمل عميق' },
        { badgeId: 'books_5', badgeName: 'قارئ نهم', badgeIcon: '📚', badgeDesc: 'أنهيت 5 كتب' },
      ]
      for (const a of achievements) {
        await db.userAchievement.create({ data: { userId: DEFAULT_USER_ID, ...a } })
      }
    }

    return NextResponse.json({ success: true, user })
  } catch (error) {
    console.error('Seed error:', error)
    return NextResponse.json({ error: 'Failed to seed' }, { status: 500 })
  }
}