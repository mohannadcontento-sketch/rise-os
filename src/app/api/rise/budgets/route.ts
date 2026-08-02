import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ budgets: [] })

    // FIX: Store budgets in user_settings.budgets (JSON string)
    const settings = await db.userSettings.findUnique({ where: { userId } })
    let budgets: { category: string; limit: number }[] = []
    if (settings && (settings as any).budgets) {
      try {
        budgets = JSON.parse((settings as any).budgets)
      } catch { /* ignore parse errors */ }
    }
    const resp = NextResponse.json({ budgets })
    resp.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
    return resp
  } catch (error) {
    console.error('[budgets] GET error:', error)
    return NextResponse.json({ budgets: [] })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

    const body = await req.json()
    const { budgets } = body as { budgets: { category: string; limit: number }[] }

    if (!Array.isArray(budgets)) {
      return NextResponse.json({ error: 'budgets array required' }, { status: 400 })
    }

    // FIX: Upsert budgets into user_settings table
    await db.userSettings.upsert({
      where: { userId },
      update: { budgets: JSON.stringify(budgets) } as any,
      create: { userId, budgets: JSON.stringify(budgets) } as any,
    })

    const resp = NextResponse.json({ budgets })
    resp.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
    return resp
  } catch (error) {
    console.error('[budgets] PUT error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
