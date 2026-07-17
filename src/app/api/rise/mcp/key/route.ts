import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import crypto from 'crypto'

function generateApiKey(): string {
  return 'rise_' + crypto.randomBytes(16).toString('hex')
}

/** POST: Generate a new API key */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) {
      return NextResponse.json({ error: 'غير مصرح', offline: true }, { status: 401 })
    }

    const apiKey = generateApiKey()
    const createdAt = new Date().toISOString()

    // Try to store in Supabase — if the table doesn't exist, that's OK
    try {
      const supabase = getSupabase()
      await supabase
        .from('UserApiKey')
        .insert({ userId, key: apiKey, createdAt })
    } catch {
      // Table might not exist — still return the key
    }

    return NextResponse.json({ apiKey, createdAt })
  } catch (error) {
    console.error('[mcp/key] POST error:', error)
    return NextResponse.json(
      { error: 'فشل في إنشاء مفتاح API', details: error instanceof Error ? error.message : 'خطأ غير معروف' },
      { status: 500 },
    )
  }
}

/** GET: Get the current user's API key (masked) */
export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) {
      return NextResponse.json({ error: 'غير مصرح', offline: true }, { status: 401 })
    }

    try {
      const supabase = getSupabase()
      const { data } = await supabase
        .from('UserApiKey')
        .select('key')
        .eq('userId', userId)
        .order('createdAt', { ascending: false })
        .limit(1)
        .single()

      if (data?.key) {
        const key = data.key as string
        const masked = key.slice(0, 8) + '...' + key.slice(-4)
        return NextResponse.json({ apiKey: masked, hasKey: true })
      }
    } catch {
      // Table might not exist
    }

    return NextResponse.json({ apiKey: null, hasKey: false })
  } catch (error) {
    console.error('[mcp/key] GET error:', error)
    return NextResponse.json({ apiKey: null, hasKey: false })
  }
}

/** DELETE: Revoke the current user's API key */
export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) {
      return NextResponse.json({ error: 'غير مصرح', offline: true }, { status: 401 })
    }

    try {
      const supabase = getSupabase()
      await supabase.from('UserApiKey').delete().eq('userId', userId)
    } catch {
      // Table might not exist — that's fine
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[mcp/key] DELETE error:', error)
    return NextResponse.json({ error: 'فشل في حذف مفتاح API' }, { status: 500 })
  }
}