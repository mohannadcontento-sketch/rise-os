import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { data } from '@/lib/data'
import { consumeUsage, limitReachedResponse } from '@/lib/billing/entitlements'
import { notifyUser, exportDoneMessage, exportFailedMessage } from '@/lib/notifications-service'
import { getSupabaseAdmin } from '@/lib/supabase'

// ============================================================
// /api/rise/export — الإعدادات (تصدير نسخة احتياطية)
//
// يجمع بيانات المستخدم من 15 مستودعاً دفعة واحدة (Promise.all)
// ويسلّمها ملف JSON عربي المفاتيح جاهزاً للتنزيل
// (awj-export-<التاريخ>.json) — خلف زر «تصدير بياناتي».
//
// المسار محمي: requireUser — تصدير البيانات الشخصية كاملة.
// الطرق: GET — يعيد الملف كمرفق تنزيل، أو 401.
// consume_usage: 'export.data' — حد تصدير مفروض في قاعدة
//        البيانات (المرحلة 04)؛ عند بلوغه يرد 402 LIMIT_REACHED
//        مع الاستخدام ليعرض العميل ترقية الخطة.
// إشعارات: notifyUser بالنجاح/الفشل (dedup + صلاحية 30 يوماً)
//        وفشلها لا يفسد التنزيل؛ وعند أي استثناء يُرد 500
//        صريحاً (الفشل الصادق) — لا ملف وهمي يوهم بنجاح التنزيل.
// ============================================================

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  let userId: string | null = null
  try {
    userId = await requireUser(req)
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

    // المرحلة 05: إشعار «عملية خلفية» — سجل التصدير في مركز الإشعارات
    // (dedup يومي؛ ينتهي تلقائيًا بعد 30 يومًا). فشل الإشعار لا يفسد التنزيل.
    try {
      const admin = await getSupabaseAdmin()
      if (admin) {
        await notifyUser(admin as any, {
          userId,
          ...exportDoneMessage(dateStr),
          expiresAt: new Date(Date.now() + 30 * 864e5).toISOString(),
          dedupKey: `export-done:${userId}:${dateStr}`,
        })
      }
    } catch { /* silent — الإشعار ترف لا أساس */ }

    return new NextResponse(jsonStr, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="awj-export-${dateStr}.json"`,
      },
    })
  } catch (error) {
    console.error('Export error:', error)

    // المرحلة 05: إشعار فشل العملية (high) — يوثّق الفشل الحقيقي
    // للمستخدم في مركز الإشعارات، بالتوازي مع رد 500 الذي يعرض
    // toast الخطأ في الواجهة فوراً.
    try {
      if (userId) {
        const admin = await getSupabaseAdmin()
        if (admin) {
          await notifyUser(admin as any, {
            userId,
            ...exportFailedMessage(String((error as Error)?.message || 'خطأ غير معروف')),
            expiresAt: new Date(Date.now() + 30 * 864e5).toISOString(),
            dedupKey: `export-fail:${userId}:${new Date().toISOString().slice(0, 13)}`,
          })
        }
      }
    } catch { /* silent */ }

    // ── فشل صادق بدل ملف وهمي ──
    // سابقاً: كان يُرد 200 مع ملف fallback فارغ فيظن المستخدم أن
    // التنزيل نجح ويكتشف لاحقاً أن ملفه بلا بيانات. الآن: 500 واضح
    // والعميل (settings.tsx handleExportData) يلتقط !res.ok ويرمي
    // خطأ فيظهر toast الفشل الصحيح.
    return NextResponse.json(
      { error: 'فشل تصدير البيانات — حاول مرة أخرى بعد قليل' },
      { status: 500 }
    )
  }
}
