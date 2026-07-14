import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { getLast30Days } from '@/lib/rise-utils'

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) {
      return NextResponse.json({
        habits: [
          { id: 'h1', name: 'شرب الماء', icon: '💧', color: '#3B82F6', frequency: 'daily', targetCount: 8, xpReward: 10 },
          { id: 'h2', name: 'تمارين رياضية', icon: '🏋️', color: '#EF4444', frequency: 'daily', targetCount: 1, xpReward: 25 },
          { id: 'h3', name: 'قراءة', icon: '📖', color: '#059669', frequency: 'daily', targetCount: 1, xpReward: 15 },
        ],
        logs: [],
      })
    }
    const supabase = getSupabase()

    const { data: habits } = await supabase.from('Habit').select('*').eq('userId', userId)
    const last30 = getLast30Days()
    const habitIds = habits?.map(h => h.id) || []

    const { data: logs } = await supabase.from('HabitLog').select('*').in('habitId', habitIds)
    const filteredLogs = logs?.filter(log => last30.includes(log.date)) || []

    return NextResponse.json({ habits: habits || [], logs: filteredLogs })
  } catch (error) {
    console.error('Habits GET error:', error)
    return NextResponse.json({
      habits: [
        { id: 'h1', name: 'شرب الماء', icon: '💧', color: '#3B82F6', frequency: 'daily', targetCount: 8, xpReward: 10 },
        { id: 'h2', name: 'تمارين رياضية', icon: '🏋️', color: '#EF4444', frequency: 'daily', targetCount: 1, xpReward: 25 },
        { id: 'h3', name: 'قراءة', icon: '📖', color: '#059669', frequency: 'daily', targetCount: 1, xpReward: 15 },
      ],
      logs: [],
    })
  }
}

export async function POST(req: NextRequest) {
  try {
        const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ error: "unauthorized", offline: true }, { status: 401 })
    const supabase = getSupabase()

    const body = await req.json()
    const { data, error } = await supabase.from('Habit').insert({ userId, ...body }).select().single()
    if (error) throw error
    return NextResponse.json(data)
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
    const { data, error } = await supabase.from('Habit').update(body).eq('id', id).eq('userId', userId).select().single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json({ error: 'Operation saved locally', offline: true })
  }
}

export async function DELETE(req: NextRequest) {
  try {
        const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ error: "unauthorized", offline: true }, { status: 401 })
    const supabase = getSupabase()

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 })
    const { error } = await supabase.from('Habit').delete().eq('id', id).eq('userId', userId)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Operation saved locally', offline: true })
  }
}