import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

const USER_ID = 'rise-default-user'

export async function GET() {
  try {
    const [
      tasks,
      projects,
      goals,
      habits,
      habitLogs,
      journals,
      focusSessions,
      healthLogs,
      financeRecords,
      books,
      knowledgeItems,
      morningLogs,
      dailyScores,
      achievements,
      user,
    ] = await Promise.all([
      db.task.findMany({ where: { userId: USER_ID }, include: { subtasks: true } }),
      db.project.findMany({ where: { userId: USER_ID } }),
      db.goal.findMany({ where: { userId: USER_ID }, include: { milestones: true } }),
      db.habit.findMany({ where: { userId: USER_ID } }),
      db.habitLog.findMany({ where: { habit: { userId: USER_ID } } }),
      db.journal.findMany({ where: { userId: USER_ID } }),
      db.focusSession.findMany({ where: { userId: USER_ID } }),
      db.healthLog.findMany({ where: { userId: USER_ID } }),
      db.financeRecord.findMany({ where: { userId: USER_ID } }),
      db.book.findMany({ where: { userId: USER_ID } }),
      db.knowledgeItem.findMany({ where: { userId: USER_ID } }),
      db.morningLog.findMany({ where: { userId: USER_ID } }),
      db.dailyScore.findMany({ where: { userId: USER_ID } }),
      db.userAchievement.findMany({ where: { userId: USER_ID } }),
      db.user.findUnique({ where: { id: USER_ID } }),
    ])

    const exportData = {
      metadata: {
        application: 'RiseOS',
        version: '1.0.0',
        exportDate: new Date().toISOString(),
        description: 'نسخة احتياطية شاملة من بيانات RiseOS',
      },
      المستخدم: user
        ? {
            الاسم: user.name,
            المستوى: user.level,
            الخبرة: user.xp,
            السلسلة: user.streak,
            أطول_سلسلة: user.longestStreak,
            إجمالي_تركيز_دقائق: user.totalFocusMin,
            إجمالي_مهام_مكتملة: user.totalTasksDone,
          }
        : null,
      المهام: tasks.map((t) => ({
        العنوان: t.title,
        الوصف: t.description,
        الحالة: t.status,
        الأولوية: t.priority,
        التاريخ_المستهدف: t.dueDate,
        مكافئة_الخبرة: t.xpReward,
        تاريخ_الإكمال: t.completedAt?.toISOString() || null,
        المهام_الفرعية: t.subtasks.map((s) => ({ العنوان: s.title, مكتمل: s.completed })),
      })),
      المشاريع: projects.map((p) => ({
        الاسم: p.name,
        الوصف: p.description,
        اللون: p.color,
        التقدم: p.progress,
        الحالة: p.status,
      })),
      الأهداف: goals.map((g) => ({
        العنوان: g.title,
        الرؤية: g.vision,
        النوع: g.type,
        التقدم: g.progress,
        الموعد_النهائي: g.deadline,
        الحالة: g.status,
        المحطات: g.milestones.map((m) => ({ العنوان: m.title, مكتمل: m.completed })),
      })),
      العادات: habits.map((h) => ({
        الاسم: h.name,
        الوصف: h.description,
        التكرار: h.frequency,
        مكافئة_الخبرة: h.xpReward,
      })),
      سجلات_العادات: habitLogs.map((l) => ({
        تاريخ: l.date,
        مكتمل: l.completed,
        العدد: l.count,
      })),
      اليوميات: journals.map((j) => ({
        التاريخ: j.date,
        المحتوى: j.content,
        الامتنان: j.gratitude,
        الانتصارات: j.wins,
        التحديات: j.challenges,
        المزاج: j.mood,
        الطاقة: j.energy,
        الأفكار: j.ideas,
        خطة_الغد: j.tomorrowPlan,
        الوسوم: j.tags,
      })),
      جلسات_التركيز: focusSessions.map((s) => ({
        المدة_المخططة: s.duration,
        المدة_الفعلية: s.actualMin,
        النوع: s.type,
        مكتمل: s.completed,
        ملاحظات: s.notes,
        تاريخ_البدء: s.startedAt.toISOString(),
      })),
      السجلات_الصحية: healthLogs.map((h) => ({
        التاريخ: h.date,
        ساعات_النوم: h.sleepHours,
        جودة_النوم: h.sleepQuality,
        كؤوس_الماء: h.waterGlasses,
        الخطوات: h.steps,
        السعرات: h.calories,
        الوزن: h.weight,
        المزاج: h.mood,
        الطاقة: h.energy,
        نوع_التمرين: h.exerciseType,
        دقائق_التمرين: h.exerciseMin,
      })),
      السجلات_المالية: financeRecords.map((f) => ({
        النوع: f.type,
        الفئة: f.category,
        الوصف: f.description,
        المبلغ: f.amount,
        التاريخ: f.date,
        متكرر: f.recurring,
      })),
      الكتب: books.map((b) => ({
        العنوان: b.title,
        المؤلف: b.author,
        النوع: b.type,
        الحالة: b.status,
        الصفحة_الحالية: b.currentPage,
        إجمالي_الصفحات: b.totalPages,
        التقدم: b.progress,
        التقييم: b.rating,
      })),
      عناصر_المعرفة: knowledgeItems.map((k) => ({
        العنوان: k.title,
        النوع: k.type,
        المحتوى: k.content,
        المجلد: k.folder,
        الوسوم: k.tags,
        المصدر: k.source,
        مفضل: k.isFavorite,
      })),
      سجلات_الصباح: morningLogs.map((m) => ({
        التاريخ: m.date,
        الدرجة: m.score,
        العناصر_المكتملة: m.completedItems,
        إجمالي_العناصر: m.totalItems,
      })),
      الدرجات_اليومية: dailyScores.map((d) => ({
        التاريخ: d.date,
        الدرجة: d.score,
        درجة_الصباح: d.morningScore,
        درجة_المهام: d.taskScore,
        درجة_العادات: d.habitScore,
        درجة_التركيز: d.focusScore,
      })),
      الإنجازات: achievements.map((a) => ({
        الشارة: a.badgeName,
        الأيقونة: a.badgeIcon,
        الوصف: a.badgeDesc,
        تاريخ_الحصول: a.earnedAt.toISOString(),
      })),
    }

    const dateStr = new Date().toISOString().split('T')[0]
    const jsonStr = JSON.stringify(exportData, null, 2)

    return new NextResponse(jsonStr, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="riseos-export-${dateStr}.json"`,
      },
    })
  } catch (error) {
    console.error('Export error:', error)
    return NextResponse.json({ error: 'Failed to export data' }, { status: 500 })
  }
}