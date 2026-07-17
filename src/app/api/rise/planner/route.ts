import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseWithAuth, handleRouteError, ensureUserExists } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
        const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ items: [] })
    const supabase = getSupabaseWithAuth(req)

    const { searchParams } = new URL(req.url)
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0]

    const { data: items, error } = await supabase
      .from('PlannerItem')
      .select('*')
      .eq('userId', userId)
      .eq('date', date)
      .order('section')
      .order('order')

    if (error) throw error

    return NextResponse.json({ items: items || [] })
  } catch (error) {
    console.error('Planner GET error:', error)
    return NextResponse.json({ items: [] })
  }
}

export async function POST(req: NextRequest) {
  try {
        const userId = await requireAuth(req)
    const supabase = getSupabaseWithAuth(req)
    await ensureUserExists(supabase, userId)

    const body = await req.json()
    const { date, section, title, time } = body

    // Get next order for this section/date
    const { data: maxItem } = await supabase
      .from('PlannerItem')
      .select('order')
      .eq('userId', userId)
      .eq('date', date)
      .eq('section', section)
      .order('order', { ascending: false })
      .limit(1)
      .single()

    const nextOrder = (maxItem?.order ?? -1) + 1

    const { data: item, error } = await supabase
      .from('PlannerItem')
      .insert({
        userId,
        date,
        section,
        title,
        time: time || null,
        order: nextOrder,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(item)
  } catch (error) {
    return handleRouteError(error, 'planner')
  }
}

export async function PUT(req: NextRequest) {
  try {
        const userId = await requireAuth(req)
    const supabase = getSupabaseWithAuth(req)
    await ensureUserExists(supabase, userId)

    const { id, ...body } = await req.json()

    const { data: item, error } = await supabase
      .from('PlannerItem')
      .update(body)
      .eq('id', id)
      .eq('userId', userId)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(item)
  } catch (error) {
    return handleRouteError(error, 'planner')
  }
}

export async function DELETE(req: NextRequest) {
  try {
        const userId = await requireAuth(req)
    const supabase = getSupabaseWithAuth(req)
    await ensureUserExists(supabase, userId)

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 })

    const { error } = await supabase
      .from('PlannerItem')
      .delete()
      .eq('id', id)
      .eq('userId', userId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleRouteError(error, 'planner')
  }
}