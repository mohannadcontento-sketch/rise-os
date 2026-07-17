import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseWithAuth } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const userId = await requireAuth(req)
  if (!userId) {
    return NextResponse.json({ books: [] })
  }
  const supabase = getSupabaseWithAuth(req)

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
    return NextResponse.json({ books: [] })
  }
}

export async function POST(req: NextRequest) {
    const userId = await requireAuth(req)
  if (!userId) return NextResponse.json({ error: "unauthorized", offline: true }, { status: 401 })
  const supabase = getSupabaseWithAuth(req)

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
    // If Supabase not configured, return mock success (demo mode)
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return NextResponse.json({ success: true, offline: true, id: 'mock-' + Date.now() })
    }
    console.error('[books] POST error:', error)
    return NextResponse.json({ error: 'فشل في العملية', details: error instanceof Error ? error.message : 'خطأ غير معروف' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
    const userId = await requireAuth(req)
  if (!userId) return NextResponse.json({ error: "unauthorized", offline: true }, { status: 401 })
  const supabase = getSupabaseWithAuth(req)

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
    // If Supabase not configured, return mock success (demo mode)
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return NextResponse.json({ success: true, offline: true, id: 'mock-' + Date.now() })
    }
    console.error('[books] PUT error:', error)
    return NextResponse.json({ error: 'فشل في العملية', details: error instanceof Error ? error.message : 'خطأ غير معروف' }, { status: 500 })
  }
}