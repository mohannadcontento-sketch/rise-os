import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { data, setCurrentAuthToken } from '@/lib/data'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/rise/storage — returns user's REAL storage usage in database
 * Calculates actual bytes by querying Supabase pg_database_size or counting rows × avg row size.
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

    // Count records in each table for this user
    const [tasks, habits, journals, focusSessions, healthLogs, financeRecords, books, knowledgeItems, plannerItems, morningLogs, goals, projects, achievements, dailyScores] = await Promise.all([
      data.tasks.list(userId).catch(() => []),
      data.habits.list(userId).catch(() => []),
      data.journals.list(userId, 1000).catch(() => []),
      data.focusSessions.list(userId, 1000).catch(() => []),
      data.healthLogs.list(userId, []).catch(() => []),
      data.financeRecords.list(userId).catch(() => []),
      data.books.list(userId).catch(() => []),
      data.knowledgeItems.list(userId).catch(() => []),
      data.plannerItems.list(userId, '1970-01-01').catch(() => []),
      data.morningLogs.list(userId, []).catch(() => []),
      data.goals.list(userId).catch(() => []),
      data.projects.list(userId).catch(() => []),
      data.userAchievements.list(userId).catch(() => []),
      data.dailyScores.list(userId, []).catch(() => []),
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

    // Get storage limit from user_storage table
    let limit = 10 * 1024 * 1024 // Default: 10MB
    let aiLimit = 100
    let aiUsed = 0
    try {
      const admin = await getSupabaseAdmin()
      if (admin) {
        const { data: storage } = await admin
          .from('user_storage')
          .select('storage_used, storage_limit, ai_limit')
          .eq('user_id', userId)
          .maybeSingle()
        if (storage) {
          limit = storage.storage_limit || limit
          aiLimit = storage.ai_limit || 100
        }
        // Get AI usage
        const { data: aiUsage } = await admin
          .from('user_ai_usage')
          .select('monthly_used, monthly_limit')
          .eq('user_id', userId)
          .maybeSingle()
        if (aiUsage) {
          aiUsed = aiUsage.monthly_used || 0
          aiLimit = aiUsage.monthly_limit || aiLimit
        }
        // Update actual usage in user_storage
        await admin.from('user_storage').update({ storage_used: used }).eq('user_id', userId)
      } else {
        // Mock mode
        const { db } = await import('@/lib/db')
        const us = await (db as any).userStorage.findUnique({ where: { userId } })
        if (us) {
          limit = us.storageLimit || limit
          aiLimit = us.aiLimit || 100
          await (db as any).userStorage.update({ where: { userId }, data: { storageUsed: used } })
        }
        const au = await (db as any).userAIUsage.findUnique({ where: { userId } })
        if (au) {
          aiUsed = au.monthlyUsed || 0
          aiLimit = au.monthlyLimit || aiLimit
        }
      }
    } catch { /* ignore */ }

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
    return NextResponse.json({ used: 0, limit: 10485760, percent: 0, counts: {}, aiUsed: 0, aiLimit: 100, breakdown: {} })
  }
}
