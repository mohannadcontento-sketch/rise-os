import { requireAdmin } from "@/lib/audit";
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    // SECURITY: authenticate AND authorize — this route executes raw SQL
    // with a service-role client, so it must be admin-only.
    const adminId = await requireAdmin(request)
    if (!adminId) {
      return NextResponse.json({ error: 'غير مصرح - أدمن فقط' }, { status: 403 })
    }

    const { sql } = await request.json()

    if (!sql || typeof sql !== 'string') {
      return NextResponse.json({ error: 'يجب توفير استعلام SQL' }, { status: 400 })
    }

    let trimmedSql = sql.trim().slice(0, 10000)

    // SECURITY: single read-only statement only.
    // - Must start with SELECT (blocks WITH/CTE-wrapped writes, EXPLAIN, etc.)
    // - Any embedded semicolon means multiple statements → reject
    //   (the old start-anchored regex let "SELECT 1; DROP TABLE x" through).
    if (!/^SELECT\s/i.test(trimmedSql)) {
      return NextResponse.json(
        { error: 'يُسمح فقط باستعلامات SELECT مفردة' },
        { status: 400 }
      )
    }
    if (trimmedSql.endsWith(';')) trimmedSql = trimmedSql.slice(0, -1).trimEnd()
    if (trimmedSql.includes(';')) {
      return NextResponse.json(
        { error: 'لا يُسمح إلا بعبارة واحدة (بدون فواصل منقوطة)' },
        { status: 400 }
      )
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