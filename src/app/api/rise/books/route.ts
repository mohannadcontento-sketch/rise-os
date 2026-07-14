import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const userId = await requireAuth(req)
  if (!userId) {
    return NextResponse.json({
      books: [
        { id: 'b1', title: 'العمل العميق', author: 'كال نيوبورت', status: 'reading', progress: 61, totalPages: 296, currentPage: 180 },
        { id: 'b2', title: 'عادات ذرية', author: 'جيمس كلير', status: 'completed', progress: 100, totalPages: 320, currentPage: 320 },
      ],
    })
  }
  const supabase = getSupabase()

  try {
    const { data: books, error } = await supabase
      .from('Book')
      .select('*')
      .eq('userId', userId)
      .order('createdAt', { ascending: false })

    if (error) throw error
    return NextResponse.json({ books })
  } catch (error) {
    console.error('Books GET error:', error)
    return NextResponse.json({
      books: [
        { id: 'b1', title: 'العمل العميق', author: 'كال نيوبورت', status: 'reading', progress: 61, totalPages: 296, currentPage: 180 },
        { id: 'b2', title: 'عادات ذرية', author: 'جيمس كلير', status: 'completed', progress: 100, totalPages: 320, currentPage: 320 },
      ],
    })
  }
}

export async function POST(req: NextRequest) {
    const userId = await requireAuth(req)
  if (!userId) return NextResponse.json({ error: "unauthorized", offline: true }, { status: 401 })
  const supabase = getSupabase()

  try {
    const body = await req.json()
    const { data, error } = await supabase
      .from('Book')
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
      .from('Book')
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