import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseWithAuth } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) {
      return NextResponse.json({ goals: [] })
    }
    const supabase = getSupabaseWithAuth(req)

    const { data: goals, error } = await supabase
      .from('Goal')
      .select('*, milestones:Milestone(*)')
      .eq('userId', userId)
      .order('createdAt', { ascending: false })
    if (error) throw error

    return NextResponse.json({ goals: goals || [] })
  } catch (error) {
    console.error('Goals GET error:', error)
    return NextResponse.json({ goals: [] })
  }
}

export async function POST(req: NextRequest) {
  try {
        const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ error: "unauthorized", offline: true }, { status: 401 })
    const supabase = getSupabaseWithAuth(req)

    const body = await req.json()
    const { data, error } = await supabase.from('Goal').insert({ userId, ...body }).select().single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('[goals] POST error:', error)
    return NextResponse.json({ error: 'فشل في العملية', details: error instanceof Error ? error.message : 'خطأ غير معروف' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
        const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ error: "unauthorized", offline: true }, { status: 401 })
    const supabase = getSupabaseWithAuth(req)

    const body = await req.json()

    // Milestone toggle
    if (body.milestoneId) {
      // Verify milestone belongs to user's goal
      const { data: milestone } = await supabase
        .from('Milestone')
        .select('goalId, goal:Goal(userId)')
        .eq('id', body.milestoneId)
        .single()
      if (!milestone || milestone.goal?.userId !== userId) {
        return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
      }

      const { data, error } = await supabase
        .from('Milestone')
        .update({ completed: body.completed })
        .eq('id', body.milestoneId)
        .select()
        .single()
      if (error) throw error
      return NextResponse.json(data)
    }

    const { id, ...updateBody } = body
    const { data, error } = await supabase.from('Goal').update(updateBody).eq('id', id).eq('userId', userId).select().single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('[goals] PUT error:', error)
    return NextResponse.json({ error: 'فشل في العملية', details: error instanceof Error ? error.message : 'خطأ غير معروف' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
        const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ error: "unauthorized", offline: true }, { status: 401 })
    const supabase = getSupabaseWithAuth(req)

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 })
    const { error } = await supabase.from('Goal').delete().eq('id', id).eq('userId', userId)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[goals] DELETE error:', error)
    return NextResponse.json({ error: 'فشل في الحذف' }, { status: 500 })
  }
}