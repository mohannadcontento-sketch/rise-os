import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { getToday, getLast30Days } from '@/lib/rise-utils'

export async function GET(req: NextRequest) {
  try {
        const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ todayLog: null, items: [{ id: "mi1", title: "الاستيقاظ مبكراً", icon: "🌅", completed: false }, { id: "mi2", title: "شرب كوب ماء", icon: "💧", completed: false }, { id: "mi3", title: "الصلاة", icon: "🤲", completed: false }, { id: "mi4", title: "تمارين رياضية", icon: "🏋️", completed: false }, { id: "mi5", title: "تأمل وتهدئة", icon: "🧘", completed: false }, { id: "mi6", title: "قراءة صفحات", icon: "📖", completed: false }, { id: "mi7", title: "تخطيط اليوم", icon: "📋", completed: false }] })
    const supabase = getSupabase()

    const today = getToday()
    const last30 = getLast30Days()

    const { data: logs, error } = await supabase
      .from('MorningLog')
      .select('*')
      .eq('userId', userId)
      .in('date', last30)
      .order('date', { ascending: false })

    if (error) throw error

    const todayLog = (logs || []).find((l) => l.date === today) || null
    return NextResponse.json({ logs: logs || [], todayLog })
  } catch (error) {
    console.error('Morning GET error:', error)
    return NextResponse.json({
      todayLog: null,
      items: [
        { id: 'mi1', title: 'الاستيقاظ مبكراً', icon: '🌅', completed: false },
        { id: 'mi2', title: 'شرب كوب ماء', icon: '💧', completed: false },
        { id: 'mi3', title: 'الصلاة', icon: '🤲', completed: false },
        { id: 'mi4', title: 'تمارين رياضية', icon: '🏋️', completed: false },
        { id: 'mi5', title: 'تأمل وتهدئة', icon: '🧘', completed: false },
        { id: 'mi6', title: 'قراءة صفحات', icon: '📖', completed: false },
        { id: 'mi7', title: 'تخطيط اليوم', icon: '📋', completed: false },
      ],
    })
  }
}

export async function POST(req: NextRequest) {
  try {
        const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ error: "unauthorized", offline: true }, { status: 401 })
    const supabase = getSupabase()

    const body = await req.json()
    const today = getToday()
    const date = body.date || today

    // Upsert: check if log exists for this date
    const { data: existing } = await supabase
      .from('MorningLog')
      .select('id')
      .eq('userId', userId)
      .eq('date', date)
      .single()

    let result
    if (existing) {
      const { data, error } = await supabase
        .from('MorningLog')
        .update(body)
        .eq('id', existing.id)
        .select()
        .single()
      if (error) throw error
      result = data
    } else {
      const { data, error } = await supabase
        .from('MorningLog')
        .insert({ userId, date, ...body })
        .select()
        .single()
      if (error) throw error
      result = data
    }

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: 'Operation saved locally', offline: true })
  }
}