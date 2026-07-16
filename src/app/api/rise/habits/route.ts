import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseWithAuth } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { getLast30Days } from '@/lib/rise-utils'

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) {
      return NextResponse.json({ habits: [], logs: [] })
    }
    const supabase = getSupabaseWithAuth(req)

    const { data: habits } = await supabase.from('Habit').select('*').eq('userId', userId)
    const last30 = getLast30Days()
    const habitIds = habits?.map(h => h.id) || []

    const { data: logs } = await supabase.from('HabitLog').select('*').in('habitId', habitIds)
    const filteredLogs = logs?.filter(log => last30.includes(log.date)) || []

    return NextResponse.json({ habits: habits || [], logs: filteredLogs })
  } catch (error) {
    console.error('Habits GET error:', error)
    return NextResponse.json({ habits: [], logs: [] })
  }
}

export async function POST(req: NextRequest) {
  try {
        const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ error: "unauthorized", offline: true }, { status: 401 })
    const supabase = getSupabaseWithAuth(req)

    const body = await req.json()
    const { data, error } = await supabase.from('Habit').insert({ userId, ...body }).select().single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('[habits] POST error:', error)
    return NextResponse.json({ error: 'فشل في العملية', details: error instanceof Error ? error.message : 'خطأ غير معروف' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
        const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ error: "unauthorized", offline: true }, { status: 401 })
    const supabase = getSupabaseWithAuth(req)
    const body = await req.json()

    // Habit log toggle (from frontend habit toggle)
    if (body.habitId && body.date !== undefined) {
      // Verify habit belongs to current user
      const { data: habit } = await supabase
        .from('Habit')
        .select('userId')
        .eq('id', body.habitId)
        .single()
      if (!habit || habit.userId !== userId) {
        return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
      }

      const { data: existing } = await supabase
        .from('HabitLog')
        .select('id')
        .eq('habitId', body.habitId)
        .eq('date', body.date)
        .single()

      if (existing && !body.completed) {
        // Delete the log entry when unchecking
        await supabase.from('HabitLog').delete().eq('id', existing.id)
        return NextResponse.json({ success: true })
      } else if (!existing && body.completed) {
        // Create log entry when checking
        const habit = body.count !== undefined ? { habitId: body.habitId, date: body.date, completed: true, count: body.count } : { habitId: body.habitId, date: body.date, completed: true, count: 1 }
        const { data, error } = await supabase.from('HabitLog').insert(habit).select().single()
        if (error) throw error
        return NextResponse.json(data)
      } else if (existing && body.completed) {
        // Update count if already exists
        const { data, error } = await supabase.from('HabitLog').update({ completed: true, count: body.count || 1 }).eq('id', existing.id).select().single()
        if (error) throw error
        return NextResponse.json(data)
      }
      return NextResponse.json({ success: true })
    }

    // Normal habit update
    const { id, ...updateBody } = body
    const { data, error } = await supabase.from('Habit').update(updateBody).eq('id', id).eq('userId', userId).select().single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('[habits] PUT error:', error)
    return NextResponse.json({ error: 'فشل في العملية', details: error instanceof Error ? error.message : 'خطأ غير معروف' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
        const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ error: "unauthorized", offline: true }, { status: 401 })
    const supabase = getSupabaseWithAuth(req)

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 })
    const { error } = await supabase.from('Habit').delete().eq('id', id).eq('userId', userId)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[habits] DELETE error:', error)
    return NextResponse.json({ error: 'فشل في الحذف' }, { status: 500 })
  }
}