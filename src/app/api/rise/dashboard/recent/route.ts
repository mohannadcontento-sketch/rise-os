import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { data, setCurrentAuthToken } from '@/lib/data'

export const dynamic = 'force-dynamic'

/**
 * P2#3: Decomposed dashboard — recent activity sub-endpoint
 * GET /api/rise/dashboard/recent
 * Returns: recent tasks + recent journal entries (lazy-loaded)
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req)
if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

    const [tasks, journals] = await Promise.all([
      data.tasks.list(userId).catch(() => []),
      data.journals.list(userId, 5).catch(() => []),
    ])

    // P2#2: Limit recent tasks to 5 (was loading all)
    const recentTasks = tasks
      .filter((t: any) => t.status === 'done')
      .slice(0, 5)

    return NextResponse.json({
      recentTasks,
      recentJournals: journals.slice(0, 3),
    })
  } catch (error) {
    console.error('Recent activity error:', error)
    return NextResponse.json({ recentTasks: [], recentJournals: [] })
  }
}
