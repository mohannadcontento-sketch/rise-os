import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { data } from '@/lib/data'

// ============================================================
// /api/rise/storage — الإعدادات (استخدام التخزين الحقيقي)
//
// يحسب الاستهلاك الفعلي بايتاً بايتاً: يجلب 14 مستودعاً دفعة
// واحدة، يجمع أطوال النصوص الحقيقية (اليوميات، المهام،
// المعرفة، الأهداف، الكتب) مع 200 بايت تقديرية لكل سجل
// (أعمدة ثابتة)، ويقارن الناتج بحد المستخدم من user_storage
// محدّثاً storageUsed.
//
// المسار محمي: requireUser — سجلات المستخدم نفسه عبر طبقة
// البيانات (لا service_role).
// الطرق: GET — { used, limit, percent, counts, breakdown,
//        aiUsed, aiLimit } أو 401/503.
// ملاحظات: الحد الافتراضي 10MB عند غياب سجل الحصة، وحدود
//        استخدام الذكاء الاصطناعي تُقرأ من user_ai_usage.
// ============================================================

export const dynamic = 'force-dynamic'

/**
 * GET /api/rise/storage — returns user's REAL storage usage in database
 * Calculates actual bytes by querying Supabase pg_database_size or counting rows × avg row size.
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await requireUser(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

    // Count records in each table for this user
    const [tasks, habits, journals, focusSessions, healthLogs, financeRecords, books, knowledgeItems, plannerItems, morningLogs, goals, projects, achievements, dailyScores] = await Promise.all([
      data.tasks.list(userId),
      data.habits.list(userId),
      data.journals.list(userId, 1000),
      data.focusSessions.list(userId, 1000),
      data.healthLogs.list(userId, []),
      data.financeRecords.list(userId),
      data.books.list(userId),
      data.knowledgeItems.list(userId),
      data.plannerItems.list(userId, '1970-01-01'),
      data.morningLogs.list(userId, []),
      data.goals.list(userId),
      data.projects.list(userId),
      data.userAchievements.list(userId),
      data.dailyScores.list(userId, []),
    ])

    // Count records
    const counts: Record<string, number> = {
      tasks: (tasks as any[]).length,
      habits: (habits as any[]).length,
      journals: (journals as any[]).length,
      focusSessions: (focusSessions as any[]).length,
      healthLogs: (healthLogs as any[]).length,
      financeRecords: (financeRecords as any[]).length,
      books: (books as any[]).length,
      knowledgeItems: (knowledgeItems as any[]).length,
      plannerItems: (plannerItems as any[]).length,
      morningLogs: (morningLogs as any[]).length,
      goals: (goals as any[]).length,
      projects: (projects as any[]).length,
      achievements: (achievements as any[]).length,
      dailyScores: (dailyScores as any[]).length,
    }

    // Calculate ACTUAL bytes: content length + fixed overhead per record
    // Text content: count actual string lengths
    const journalBytes = (journals as any[]).reduce((sum: number, j: any) =>
      sum + (j.content || '').length + (j.gratitude || '').length + (j.wins || '').length + (j.challenges || '').length, 0)
    const knowledgeBytes = (knowledgeItems as any[]).reduce((sum: number, k: any) =>
      sum + (k.content || '').length + (k.title || '').length + (k.tags || '').length, 0)
    const taskBytes = (tasks as any[]).reduce((sum: number, t: any) =>
      sum + (t.title || '').length + (t.description || '').length, 0)
    const goalBytes = (goals as any[]).reduce((sum: number, g: any) =>
      sum + (g.title || '').length + (g.vision || '').length + (g.why || '').length, 0)
    const bookBytes = (books as any[]).reduce((sum: number, b: any) =>
      sum + (b.title || '').length + (b.author || '').length + (b.notes || '').length, 0)

    // Fixed overhead per record (UUID, timestamps, foreign keys, etc.)
    // Each record has ~200 bytes of fixed columns (id, user_id, created_at, updated_at, etc.)
    const totalRecords = Object.values(counts).reduce((sum: number, c: any) => sum + c, 0)
    const fixedBytes = totalRecords * 200

    // Total used = text content + fixed overhead
    const used = fixedBytes + journalBytes + knowledgeBytes + taskBytes + goalBytes + bookBytes

    // Read/update the current user's quota through the RLS-first data layer.
    // Never use service_role for a normal user's own records.
    const storage = await data.userStorage.get(userId)
    const aiUsage = await data.userAIUsage.get(userId)

    const limit = storage?.storageLimit || 10 * 1024 * 1024
    const aiLimit = aiUsage?.monthlyLimit || storage?.aiLimit || 100
    const aiUsed = aiUsage?.monthlyUsed || 0

    if (storage) {
      await data.userStorage.update(userId, { storageUsed: used })
    }

    const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0

    return NextResponse.json({
      used,
      limit,
      percent,
      counts,
      aiUsed,
      aiLimit,
      // Human-readable breakdown
      breakdown: {
        tasks: taskBytes,
        journals: journalBytes,
        knowledge: knowledgeBytes,
        goals: goalBytes,
        books: bookBytes,
        fixed: fixedBytes,
      },
    })
  } catch (error) {
    console.error('Storage GET error:', error)
    return NextResponse.json({ error: 'تعذر التحقق من مساحة التخزين' }, { status: 503 })
  }
}
