import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseWithAuth, handleRouteError, ensureUserExists } from '@/lib/supabase'
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
  const supabase = getSupabaseWithAuth(req)
  await ensureUserExists(supabase, userId)

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
    return handleRouteError(error, 'books')
  }
}

export async function PUT(req: NextRequest) {
    const userId = await requireAuth(req)
  const supabase = getSupabaseWithAuth(req)
  await ensureUserExists(supabase, userId)

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
    return handleRouteError(error, 'books')
  }
}