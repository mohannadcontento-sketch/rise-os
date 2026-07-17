import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseWithAuth, handleRouteError } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { getToday, getLast30Days } from '@/lib/rise-utils'

/** Fields allowed to be stored in HealthLog */
const ALLOWED_FIELDS = [
  'sleepHours', 'sleepQuality', 'water', 'exercise', 'exerciseType',
  'mood', 'energy', 'weight', 'notes', 'steps',
] as const

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ logs: [], todayLog: null })
    const supabase = getSupabaseWithAuth(req)

    const today = getToday()
    const last30 = getLast30Days()

    const { data: logs, error } = await supabase
      .from('HealthLog')
      .select('*')
      .eq('userId', userId)
      .in('date', last30)
      .order('date', { ascending: false })

    if (error) {
      console.error('[health] GET Supabase error:', error.message)
      return NextResponse.json({ logs: [], todayLog: null })
    }

    const todayLog = logs?.find(l => l.date === today) || null
    return NextResponse.json({ logs: logs || [], todayLog })
  } catch (error) {
    console.error('Health GET error:', error)
    return NextResponse.json({ logs: [], todayLog: null })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    const supabase = getSupabaseWithAuth(req)

    const body = await req.json().catch(() => ({}))
    const today = getToday()
    const targetDate = body.date || today

    // Only keep allowed fields
    const cleanData: Record<string, unknown> = { userId, date: targetDate }
    for (const field of ALLOWED_FIELDS) {
      if (body[field] !== undefined) {
        cleanData[field] = body[field]
      }
    }

    const { data: existing } = await supabase
      .from('HealthLog')
      .select('id')
      .eq('userId', userId)
      .eq('date', targetDate)
      .single()

    if (existing) {
      const { data: updated, error } = await supabase
        .from('HealthLog')
        .update(cleanData)
        .eq('id', existing.id)
        .select()
        .single()
      if (error) {
        console.error('[health] UPDATE error:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json(updated)
    }

    const { data: created, error } = await supabase
      .from('HealthLog')
      .insert(cleanData)
      .select()
      .single()
    if (error) {
      console.error('[health] INSERT error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json(created)
  } catch (error) {
    return handleRouteError(error, 'health')
  }
}