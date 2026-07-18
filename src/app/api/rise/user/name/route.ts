import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getSupabaseWithAuth, handleRouteError } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    const supabase = getSupabaseWithAuth(req)

    const { name } = await req.json()
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const trimmed = name.trim()

    const { error } = await supabase
      .from('User')
      .update({ name: trimmed })
      .eq('id', userId)

    if (error) throw error

    return NextResponse.json({ name: trimmed })
  } catch (error) {
    return handleRouteError(error, 'user-name')
  }
}