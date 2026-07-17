import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseWithAuth } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function GET(req: NextRequest) {
    const userId = await requireAuth(req)
  if (!userId) return NextResponse.json({ items: [] })
  const supabase = getSupabaseWithAuth(req)

  try {
    const { data: items, error } = await supabase
      .from('KnowledgeItem')
      .select('*')
      .eq('userId', userId)
      .order('updatedAt', { ascending: false })

    if (error) throw error
    return NextResponse.json({ items })
  } catch (error) {
    console.error('Knowledge GET error:', error)
    return NextResponse.json({ items: [] })
  }
}

export async function POST(req: NextRequest) {
    const userId = await requireAuth(req)
  if (!userId) return NextResponse.json({ error: "unauthorized", offline: true }, { status: 401 })
  const supabase = getSupabaseWithAuth(req)

  try {
    const body = await req.json()
    const { data, error } = await supabase
      .from('KnowledgeItem')
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
    console.error('[knowledge] POST error:', error)
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
      .from('KnowledgeItem')
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
    console.error('[knowledge] PUT error:', error)
    return NextResponse.json({ error: 'فشل في العملية', details: error instanceof Error ? error.message : 'خطأ غير معروف' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
    const userId = await requireAuth(req)
  if (!userId) return NextResponse.json({ error: "unauthorized", offline: true }, { status: 401 })
  const supabase = getSupabaseWithAuth(req)

  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 })

    const { error } = await supabase
      .from('KnowledgeItem')
      .delete()
      .eq('id', id)
      .eq('userId', userId)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    // If Supabase not configured, return mock success (demo mode)
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return NextResponse.json({ success: true, offline: true, id: 'mock-' + Date.now() })
    }
    console.error('[knowledge] DELETE error:', error)
    return NextResponse.json({ error: 'فشل في الحذف' }, { status: 500 })
  }
}