import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseWithAuth } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
        const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ records: [], summary: { income: 0, expense: 0, balance: 0 } })
    const supabase = getSupabaseWithAuth(req)

    const { data: records } = await supabase
      .from('FinanceRecord')
      .select('*')
      .eq('userId', userId)
      .order('date', { ascending: false })

    return NextResponse.json({ records: records || [] })
  } catch (error) {
    console.error('Finance GET error:', error)
    return NextResponse.json({ records: [], summary: { income: 0, expense: 0, balance: 0 } })
  }
}

export async function POST(req: NextRequest) {
  try {
        const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ error: "unauthorized", offline: true }, { status: 401 })
    const supabase = getSupabaseWithAuth(req)

    const body = await req.json()
    const { data: record, error } = await supabase
      .from('FinanceRecord')
      .insert({ userId, ...body })
      .select()
      .single()
    if (error) throw error
    return NextResponse.json(record)
  } catch (error) {
    console.error('[finance] POST error:', error)
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

    const { error } = await supabase
      .from('FinanceRecord')
      .delete()
      .eq('id', id)
      .eq('userId', userId)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[finance] DELETE error:', error)
    return NextResponse.json({ error: 'فشل في الحذف' }, { status: 500 })
  }
}