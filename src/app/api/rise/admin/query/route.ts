import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request)
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

    // Execute raw SQL via Prisma (SQLite)
    const rows = await db.$queryRawUnsafe(trimmedSql) as Record<string, unknown>[]

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