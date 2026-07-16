import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseWithAuth } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { getToday, getLast30Days } from '@/lib/rise-utils'

export async function GET(req: NextRequest) {
  try {
        const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ logs: [], todayLog: null })
    const supabase = getSupabaseWithAuth(req)

    const today = getToday()
    const last30 = getLast30Days()

    const { data: logs } = await supabase
      .from('HealthLog')
      .select('*')
      .eq('userId', userId)
      .in('date', last30)
      .order('date', { ascending: false })

    const todayLog = logs?.find(l => l.date === today) || null
    return NextResponse.json({ logs: logs || [], todayLog })
  } catch (error) {
    console.error('Health GET error:', error)
    return NextResponse.json({ healthLog: null, recentLogs: [] })
  }
}

export async function POST(req: NextRequest) {
  try {
        const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ error: "unauthorized", offline: true }, { status: 401 })
    const supabase = getSupabaseWithAuth(req)

    const body = await req.json()
    const today = getToday()
    const targetDate = body.date || today

    const { data: existing } = await supabase
      .from('HealthLog')
      .select('id')
      .eq('userId', userId)
      .eq('date', targetDate)
      .single()

    if (existing) {
      const { data: updated, error } = await supabase
        .from('HealthLog')
        .update(body)
        .eq('id', existing.id)
        .select()
        .single()
      if (error) throw error
      return NextResponse.json(updated)
    }

    const { data: created, error } = await supabase
      .from('HealthLog')
      .insert({ userId, date: today, ...body })
      .select()
      .single()
    if (error) throw error
    return NextResponse.json(created)
  } catch (error) {
    console.error('[health] POST error:', error)
    return NextResponse.json({ error: 'فشل في العملية', details: error instanceof Error ? error.message : 'خطأ غير معروف' }, { status: 500 })
  }
}