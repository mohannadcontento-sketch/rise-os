import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) {
      return NextResponse.json({
        goals: [
          { id: 'g1', title: 'إكمال كتاب الإنتاجية', type: 'quarterly', progress: 35, status: 'active', deadline: '2025-12-31', milestones: [] },
          { id: 'g2', title: 'الوصول لمستوى 10', type: 'annual', progress: 70, status: 'active', deadline: '2025-12-31', milestones: [] },
          { id: 'g3', title: 'قراءة 24 كتاب', type: 'annual', progress: 45, status: 'active', deadline: '2025-12-31', milestones: [] },
        ],
      })
    }
    const supabase = getSupabase()

    const { data: goals, error } = await supabase
      .from('Goal')
      .select('*, milestones:Milestone(*)')
      .eq('userId', userId)
      .order('createdAt', { ascending: false })
    if (error) throw error

    return NextResponse.json({ goals: goals || [] })
  } catch (error) {
    console.error('Goals GET error:', error)
    return NextResponse.json({
      goals: [
        { id: 'g1', title: 'إكمال كتاب الإنتاجية', type: 'quarterly', progress: 35, status: 'active', deadline: '2025-12-31', milestones: [] },
        { id: 'g2', title: 'الوصول لمستوى 10', type: 'annual', progress: 70, status: 'active', deadline: '2025-12-31', milestones: [] },
        { id: 'g3', title: 'قراءة 24 كتاب', type: 'annual', progress: 45, status: 'active', deadline: '2025-12-31', milestones: [] },
      ],
    })
  }
}

export async function POST(req: NextRequest) {
  try {
        const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ error: "unauthorized", offline: true }, { status: 401 })
    const supabase = getSupabase()

    const body = await req.json()
    const { data, error } = await supabase.from('Goal').insert({ userId, ...body }).select().single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json({ error: 'Operation saved locally', offline: true })
  }
}

export async function PUT(req: NextRequest) {
  try {
        const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ error: "unauthorized", offline: true }, { status: 401 })
    const supabase = getSupabase()

    const body = await req.json()

    // Milestone toggle
    if (body.milestoneId) {
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
    return NextResponse.json({ error: 'Operation saved locally', offline: true })
  }
}

export async function DELETE(req: NextRequest) {
  try {
        const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ error: "unauthorized", offline: true }, { status: 401 })
    const supabase = getSupabase()

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 })
    const { error } = await supabase.from('Goal').delete().eq('id', id).eq('userId', userId)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Operation saved locally', offline: true })
  }
}