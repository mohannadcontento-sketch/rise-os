import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAdmin(request)
    if (!userId) {
      return NextResponse.json({ error: 'غير مصرح - أدمن فقط' }, { status: 403 })
    }

    const { sql } = await request.json()

    if (!sql || typeof sql !== 'string') {
      return NextResponse.json({ error: 'يجب توفير استعلام SQL' }, { status: 400 })
    }

    const trimmedSql = sql.trim().slice(0, 10000)

    // Only allow SELECT queries for safety
    if (!/^\s*SELECT\s/i.test(trimmedSql)) {
      return NextResponse.json({ error: 'يُسمح فقط باستعلامات SELECT' }, { status: 400 })
    }

    const supabase = await getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json(
        { error: 'Supabase admin client not available. Raw SQL queries require a configured database.' },
        { status: 503 },
      )
    }

    // Execute raw SQL via Supabase RPC
    const { data, error } = await (supabase as any).rpc('exec_sql', { query: trimmedSql })

    if (error) {
      return NextResponse.json(
        { error: error.message || 'فشل تنفيذ الاستعلام' },
        { status: 500 },
      )
    }

    // Handle both array and single object results
    const rows = Array.isArray(data) ? data : (data ? [data] : [])
    const columns = rows.length > 0 ? Object.keys(rows[0]) : []

    return NextResponse.json({ columns, rows })
  } catch (error) {
    console.error('Admin query error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'فشل تنفيذ الاستعلام' },
      { status: 500 },
    )
  }
}