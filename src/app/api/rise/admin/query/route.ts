import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabase, ADMIN_EMAIL, getSupabaseAdmin } from '@/lib/supabase'

async function requireAdmin(request: NextRequest) {
  const authHeader = request.headers.get('Authorization') || ''
  const token = authHeader.replace('Bearer ', '')

  const supabase = getSupabase()
  const { data: userData } = await supabase.auth.getUser(token)
  if (!userData.user || userData.user.email !== ADMIN_EMAIL) {
    return null
  }
  return userData.user
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAdmin(request)
    if (!user) {
      return NextResponse.json({ error: 'غير مصرح - أدمن فقط' }, { status: 403 })
    }

    const { sql } = await request.json()

    if (!sql || typeof sql !== 'string') {
      return NextResponse.json({ error: 'يجب توفير استعلام SQL' }, { status: 400 })
    }

    // Trim and limit query length
    const trimmedSql = sql.trim().slice(0, 10000)

    const adminClient = getSupabaseAdmin()
    if (!adminClient) {
      return NextResponse.json({ error: 'خدمة المشرف غير متاحة' }, { status: 500 })
    }

    // Use Supabase RPC to execute raw SQL
    // We'll use the pg client approach via Supabase's rpc
    try {
      const { data, error } = await adminClient.rpc('exec_sql', { query: trimmedSql })

      if (error) {
        // If the RPC doesn't exist, try a different approach
        if (error.message.includes('function') || error.message.includes('does not exist')) {
          // Fallback: use a direct approach — parse the SQL and use Supabase query builder
          // This is limited but covers common read queries
          return await executeFallback(adminClient, trimmedSql)
        }
        return NextResponse.json({ error: error.message })
      }

      if (Array.isArray(data)) {
        const columns = data.length > 0 ? Object.keys(data[0]) : []
        return NextResponse.json({ columns, rows: data })
      }

      return NextResponse.json({ columns: ['result'], rows: [{ result: JSON.stringify(data) }] })
    } catch (err) {
      // If RPC fails entirely, try fallback
      return await executeFallback(adminClient, trimmedSql)
    }
  } catch (error) {
    console.error('Admin query error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'فشل تنفيذ الاستعلام' },
      { status: 500 }
    )
  }
}

async function executeFallback(supabase: any, sql: string): Promise<NextResponse> {
  // Parse simple SELECT queries
  const selectMatch = sql.match(/SELECT\s+(.+?)\s+FROM\s+"?(\w+)"?/i)
  const limitMatch = sql.match(/LIMIT\s+(\d+)/i)

  if (selectMatch) {
    const columns = selectMatch[1].split(',').map((c: string) => c.trim().replace(/".*?"/g, ''))
    const table = selectMatch[2]
    const limit = limitMatch ? parseInt(limitMatch[1]) : 100

    try {
      const query = supabase.from(table).select(columns.join(',')).limit(limit)
      const { data, error } = await query

      if (error) {
        return NextResponse.json({ error: `خطأ: ${error.message}` })
      }

      const resultColumns = data && data.length > 0 ? Object.keys(data[0]) : columns
      return NextResponse.json({ columns: resultColumns, rows: data || [] })
    } catch (err: any) {
      return NextResponse.json({ error: `خطأ: ${err.message}` })
    }
  }

  return NextResponse.json({
    error: 'لا يمكن تنفيذ هذا الاستعلام. استخدم استعلامات SELECT بسيطة أو فعّل دالة exec_sql في قاعدة البيانات.',
  })
}