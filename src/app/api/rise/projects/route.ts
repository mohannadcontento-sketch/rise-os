import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const userId = await requireAuth(req)
  if (!userId) {
    return NextResponse.json({ projects: [] })
  }
  const supabase = getSupabase()

  try {
    const { data: projects, error } = await supabase
      .from('Project')
      .select('*')
      .eq('userId', userId)
      .order('createdAt', { ascending: false })

    if (error) throw error
    return NextResponse.json({ projects })
  } catch (error) {
    console.error('Projects GET error:', error)
    return NextResponse.json({ projects: [] })
  }
}

export async function POST(req: NextRequest) {
    const userId = await requireAuth(req)
  if (!userId) return NextResponse.json({ error: "unauthorized", offline: true }, { status: 401 })
  const supabase = getSupabase()

  try {
    const body = await req.json()
    const { data, error } = await supabase
      .from('Project')
      .insert({ userId, ...body })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json({ error: 'Operation saved locally', offline: true })
  }
}

export async function PUT(req: NextRequest) {
    const userId = await requireAuth(req)
  if (!userId) return NextResponse.json({ error: "unauthorized", offline: true }, { status: 401 })
  const supabase = getSupabase()

  try {
    const { id, ...body } = await req.json()
    const { data, error } = await supabase
      .from('Project')
      .update(body)
      .eq('id', id)
      .eq('userId', userId)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json({ error: 'Operation saved locally', offline: true })
  }
}

export async function DELETE(req: NextRequest) {
    const userId = await requireAuth(req)
  if (!userId) return NextResponse.json({ error: "unauthorized", offline: true }, { status: 401 })
  const supabase = getSupabase()

  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 })

    const { error } = await supabase
      .from('Project')
      .delete()
      .eq('id', id)
      .eq('userId', userId)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Operation saved locally', offline: true })
  }
}