import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { data } from '@/lib/data'
import { consumeUsage, limitReachedResponse } from '@/lib/billing/entitlements'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUser(req)
if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

    // ── المرحلة 04: حد تصدير البيانات (server-side، لا تجاوز من الفرونت) ──
    // القرار الذري داخل consume_usage (قاعدة البيانات)؛ عند المنع
    // نرجّع 402 LIMIT_REACHED مع الاستخدام → واجهة المستخدم تعرض
    // upgrade prompt. (degraded = الهجرة غير مطبقة → سلوك سابق)
    const usage = await consumeUsage(req, 'export.data')
    if (!usage.allowed) {
      return limitReachedResponse(usage)
    }

    const [
      tasksResult,
      projects,
      goals,
      habitsWithLogs,
      journals,
      focusSessions,
      healthLogs,
      financeRecords,
      books,
      knowledgeItems,
      morningLogs,
      dailyScoresRaw,
      achievements,
      profileData,
      habitLogsAll,
    ] = await Promise.all([
      data.tasks.list(userId),
      data.projects.list(userId),
      data.goals.list(userId),
      data.habits.list(userId),
      data.journals.list(userId, 999),
      data.focusSessions.list(userId, 999),
      data.healthLogs.list(userId, []),
      data.financeRecords.list(userId),
      data.books.list(userId),
      data.knowledgeItems.list(userId),
      data.morningLogs.list(userId, []),
      data.dailyScores.list(userId, []),
      data.userAchievements.list(userId),
      data.profiles.get(userId),
      data.habitLogs.list(userId),
    ])

    const exportData = {
      metadata: {
        application: 'أوج',
        version: '1.0.0',
        exportDate: new Date().toISOString(),
        description: 'نسخة احتياطية شاملة من بيانات أوج',
      },
      المستخدم: profileData
        ? {
            الاسم: profileData.name,
            المستوى: profileData.level,
            الخبرة: profileData.xp,
            السلسلة: profileData.streak,
            أطول_سلسلة: profileData.longest_streak,
            إجمالي_تركيز_دقائق: profileData.total_focus_min,
            إجمالي_مهام_مكتملة: profileData.total_tasks_done,
          }
        : null,
      المهام: tasksResult.map((t: any) => ({
        العنوان: t.title,
        الوصف: t.description,
        الحالة: t.status,
        الأولوية: t.priority,
        التاريخ_المستهدف: t.dueDate,
        مكافئة_الخبرة: t.xpReward,
        تاريخ_الإكمال: t.completedAt ? String(t.completedAt) : null,
        المهام_الفرعية: (t.subtasks || []).map((s: any) => ({ العنوان: s.title, مكتمل: s.completed })),
      })),
      المشاريع: projects.map((p: any) => ({
        الاسم: p.name,
        الوصف: p.description,
        اللون: p.color,
        التقدم: p.progress,
        الحالة: p.status,
      })),
      الأهداف: goals.map((g: any) => ({
        العنوان: g.title,
        الرؤية: g.vision,
        النوع: g.type,
        التقدم: g.progress,
        الموعد_النهائي: g.deadline,
        الحالة: g.status,
        المحطات: (g.milestones || []).map((m: any) => ({ العنوان: m.title, مكتمل: m.completed })),
      })),
      العادات: habitsWithLogs.map((h: any) => ({
        الاسم: h.name,
        الوصف: h.description,
        التكرار: h.frequency,
        مكافئة_الخبرة: h.xpReward,
      })),
      سجلات_العادات: habitLogsAll.map((l: any) => ({
        تاريخ: l.date,
        مكتمل: l.completed,
        العدد: l.count,
      })),
      اليوميات: journals.map((j: any) => ({
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
      جلسات_التركيز: focusSessions.map((s: any) => ({
        المدة_المخططة: s.duration,
        المدة_الفعلية: s.actualMin,
        النوع: s.type,
        مكتمل: s.completed,
        ملاحظات: s.notes,
        تاريخ_البدء: String(s.startedAt),
      })),
      السجلات_الصحية: healthLogs.map((h: any) => ({
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
      السجلات_المالية: financeRecords.map((f: any) => ({
        النوع: f.type,
        الفئة: f.category,
        الوصف: f.description,
        المبلغ: f.amount,
        التاريخ: f.date,
        متكرر: f.recurring,
      })),
      الكتب: books.map((b: any) => ({
        العنوان: b.title,
        المؤلف: b.author,
        النوع: b.type,
        الحالة: b.status,
        الصفحة_الحالية: b.currentPage,
        إجمالي_الصفحات: b.totalPages,
        التقدم: b.progress,
        التقييم: b.rating,
      })),
      عناصر_المعرفة: knowledgeItems.map((k: any) => ({
        العنوان: k.title,
        النوع: k.type,
        المحتوى: k.content,
        المجلد: k.folder,
        الوسوم: k.tags,
        المصدر: k.source,
        مفضل: k.isFavorite,
      })),
      سجلات_الصباح: morningLogs.map((m: any) => ({
        التاريخ: m.date,
        الدرجة: m.score,
        العناصر_المكتملة: m.completedItems,
        إجمالي_العناصر: m.totalItems,
      })),
      الدرجات_اليومية: dailyScoresRaw.map((d: any) => ({
        التاريخ: d.date,
        الدرجة: d.score,
        درجة_الصباح: d.morningScore,
        درجة_المهام: d.taskScore,
        درجة_العادات: d.habitScore,
        درجة_التركيز: d.focusScore,
      })),
      الإنجازات: achievements.map((a: any) => ({
        الشارة: a.badgeName,
        الأيقونة: a.badgeIcon,
        الوصف: a.badgeDesc,
        تاريخ_الحصول: String(a.earnedAt),
      })),
    }

    const dateStr = new Date().toISOString().split('T')[0]
    const jsonStr = JSON.stringify(exportData, null, 2)

    return new NextResponse(jsonStr, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="awj-export-${dateStr}.json"`,
      },
    })
  } catch (error) {
    console.error('Export error:', error)
    // Return a minimal valid export file as fallback
    const fallbackData = {
      metadata: {
        application: 'أوج',
        version: '1.0.0',
        exportDate: new Date().toISOString(),
        description: 'نسخة احتياطية شاملة من بيانات أوج',
        note: 'وضع العرض التوضيحي - لا توجد بيانات حقيقية',
      },
      المستخدم: { الاسم: 'مستخدم أوج', المستوى: 1, الخبرة: 0, السلسلة: 0, أطول_سلسلة: 0, إجمالي_تركيز_دقائق: 0, إجمالي_مهام_مكتملة: 0 },
      المهام: [],
      المشاريع: [],
      الأهداف: [],
      العادات: [],
      سجلات_العادات: [],
      اليوميات: [],
      جلسات_التركيز: [],
      السجلات_الصحية: [],
      السجلات_المالية: [],
      الكتب: [],
      عناصر_المعرفة: [],
      سجلات_الصباح: [],
      الدرجات_اليومية: [],
      الإنجازات: [],
    }
    const dateStr = new Date().toISOString().split('T')[0]
    const jsonStr = JSON.stringify(fallbackData, null, 2)
    return new NextResponse(jsonStr, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="awj-export-${dateStr}.json"`,
      },
    })
  }
}