import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { data, setCurrentAuthToken } from '@/lib/data'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/rise/storage — returns user's storage usage + limit
 * Calculates actual bytes used across all tables.
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

    // Count records in each table for this user
    const [tasks, habits, journals, focusSessions, healthLogs, financeRecords, books, knowledgeItems, plannerItems, morningLogs, goals, projects] = await Promise.all([
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
    ])

    // Estimate bytes: each record ~500 bytes average
    const counts = {
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
    }

    // Calculate approximate bytes (each record ~500 bytes + content)
    const journalBytes = (journals as any[]).reduce((sum: number, j: any) => sum + ((j.content || '').length + (j.gratitude || '').length + (j.wins || '').length), 0)
    const knowledgeBytes = (knowledgeItems as any[]).reduce((sum: number, k: any) => sum + ((k.content || '').length + (k.title || '').length), 0)
    const recordBytes = Object.values(counts).reduce((sum: number, c: any) => sum + c * 500, 0)
    const used = recordBytes + journalBytes + knowledgeBytes

    // Get storage limit from user_storage table
    let limit = 10 * 1024 * 1024 // Default: 10MB
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
          // Update actual usage
          await admin.from('user_storage').update({ storage_used: used }).eq('user_id', userId)
        }
      } else {
        // Mock mode
        const { db } = await import('@/lib/db')
        const us = await (db as any).userStorage.findUnique({ where: { userId } })
        if (us) {
          limit = us.storageLimit || limit
          await (db as any).userStorage.update({ where: { userId }, data: { storageUsed: used } })
        }
      }
    } catch { /* ignore */ }

    return NextResponse.json({
      used,
      limit,
      percent: Math.min(100, Math.round((used / limit) * 100)),
      counts,
    })
  } catch (error) {
    console.error('Storage GET error:', error)
    return NextResponse.json({ used: 0, limit: 10485760, percent: 0, counts: {} })
  }
}
