import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseWithAuth } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { getToday } from '@/lib/rise-utils'

export async function GET(req: NextRequest) {
  try {
        const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ journal: null, recentJournals: [] })
    const supabase = getSupabaseWithAuth(req)

    const today = getToday()
    const { data: journal } = await supabase.from('Journal').select('*').eq('userId', userId).eq('date', today).single()
    const { data: recentJournals, error } = await supabase
      .from('Journal')
      .select('*')
      .eq('userId', userId)
      .order('createdAt', { ascending: false })
      .limit(30)
    if (error) throw error

    return NextResponse.json({ journal: journal || null, recentJournals: recentJournals || [] })
  } catch (error) {
    console.error('Journal GET error:', error)
    return NextResponse.json({ journal: null, recentJournals: [] })
  }
}

export async function POST(req: NextRequest) {
  try {
        const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ error: "unauthorized", offline: true }, { status: 401 })
    const supabase = getSupabaseWithAuth(req)

    const body = await req.json()
    const today = getToday()
    const journalDate = body.date || today

    const { data: existing } = await supabase.from('Journal').select('id').eq('userId', userId).eq('date', journalDate).single()

    if (existing) {
      const { data, error } = await supabase.from('Journal').update(body).eq('id', existing.id).select().single()
      if (error) throw error
      return NextResponse.json(data)
    } else {
      const { data, error } = await supabase.from('Journal').insert({ userId, date: today, ...body }).select().single()
      if (error) throw error
      return NextResponse.json(data)
    }
  } catch (error) {
    // If Supabase not configured, return mock success (demo mode)
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return NextResponse.json({ success: true, offline: true, id: 'mock-' + Date.now() })
    }
    console.error('[journal] POST error:', error)
    return NextResponse.json({ error: 'فشل في العملية', details: error instanceof Error ? error.message : 'خطأ غير معروف' }, { status: 500 })
  }
}