import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ budgets: [] })

    // No UserBudget model — return empty
    return NextResponse.json({ budgets: [] })
  } catch (error) {
    console.error('[budgets] GET error:', error)
    return NextResponse.json({ budgets: [] })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ success: true, offline: true })

    const body = await req.json()
    const { budgets } = body as { budgets: { category: string; limit: number }[] }

    if (!Array.isArray(budgets)) {
      return NextResponse.json({ error: 'budgets array required' }, { status: 400 })
    }

    // No UserBudget model — return data as-is with offline flag
    return NextResponse.json({ budgets, offline: true })
  } catch (error) {
    console.error('[budgets] PUT error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ success: true, offline: true })

    // No UserBudget model — just return success
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[budgets] DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}