import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseWithAuth, handleRouteError, ensureUserExists } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ budgets: [] })

    const supabase = getSupabaseWithAuth(req)

    const { data, error } = await supabase
      .from('UserBudget')
      .select('*')
      .eq('userId', userId)

    if (error) {
      // Table might not exist yet — return empty
      console.warn('[budgets] GET fallback (table may not exist):', error.message)
      return NextResponse.json({ budgets: [] })
    }

    return NextResponse.json({ budgets: data || [] })
  } catch (error) {
    console.error('[budgets] GET error:', error)
    return NextResponse.json({ budgets: [] })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireAuth(req)

    const supabase = getSupabaseWithAuth(req)
    await ensureUserExists(supabase, userId)
    const body = await req.json()
    const { budgets } = body as { budgets: { category: string; limit: number }[] }

    if (!Array.isArray(budgets)) {
      return NextResponse.json({ error: 'budgets array required' }, { status: 400 })
    }

    // Upsert each budget category — delete all existing then insert
    await supabase.from('UserBudget').delete().eq('userId', userId)

    const rows = budgets.map((b) => ({
      userId,
      category: b.category,
      limit: b.limit,
    }))

    const { data, error } = await supabase
      .from('UserBudget')
      .insert(rows)
      .select()

    if (error) {
      console.warn('[budgets] PUT fallback (table may not exist):', error.message)
      // Gracefully handle missing table — client will use defaults
      return NextResponse.json({ budgets, offline: true })
    }

    return NextResponse.json({ budgets: data || [] })
  } catch (error) {
    return handleRouteError(error, 'budgets')
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireAuth(req)

    const supabase = getSupabaseWithAuth(req)
    await ensureUserExists(supabase, userId)
    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category')

    if (!category) {
      return NextResponse.json({ error: 'category query param required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('UserBudget')
      .delete()
      .eq('userId', userId)
      .eq('category', category)

    if (error) {
      console.warn('[budgets] DELETE fallback (table may not exist):', error.message)
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleRouteError(error, 'budgets')
  }
}