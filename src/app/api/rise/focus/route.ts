import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
        const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ sessions: [], todayMin: 0, totalMin: 0 })
    const supabase = getSupabase()

    const { data: sessions } = await supabase
      .from('FocusSession')
      .select('*')
      .eq('userId', userId)
      .order('startedAt', { ascending: false })
      .limit(50)

    return NextResponse.json({ sessions: sessions || [] })
  } catch (error) {
    console.error('Focus GET error:', error)
    return NextResponse.json({ sessions: [], todayMin: 0, totalMin: 0 })
  }
}

export async function POST(req: NextRequest) {
  try {
        const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ error: "unauthorized", offline: true }, { status: 401 })
    const supabase = getSupabase()

    const body = await req.json()
    const { data: session, error } = await supabase
      .from('FocusSession')
      .insert({ userId, ...body })
      .select()
      .single()
    if (error) throw error
    return NextResponse.json(session)
  } catch (error) {
    return NextResponse.json({ error: 'Operation saved locally', offline: true })
  }
}

export async function PUT(req: NextRequest) {
  try {
        const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ error: "unauthorized", offline: true }, { status: 401 })
    const supabase = getSupabase()

    const { id, ...body } = await req.json()
    const { data: session, error } = await supabase
      .from('FocusSession')
      .update(body)
      .eq('id', id)
      .eq('userId', userId)
      .select()
      .single()
    if (error) throw error
    return NextResponse.json(session)
  } catch (error) {
    return NextResponse.json({ error: 'Operation saved locally', offline: true })
  }
}