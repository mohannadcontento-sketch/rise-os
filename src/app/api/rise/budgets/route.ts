import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleRouteError } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ budgets: [] })

    // No UserBudget model in Prisma schema — return empty
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
    return handleRouteError(error, 'budgets')
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ success: true, offline: true })

    // No UserBudget model — just return success
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleRouteError(error, 'budgets')
  }
}