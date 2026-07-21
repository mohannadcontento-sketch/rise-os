import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

function generateApiKey(): string {
  return 'rise_' + crypto.randomBytes(16).toString('hex')
}

/** POST: Generate a new API key */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }

    const apiKey = generateApiKey()

    const supabase = await getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json(
        { error: 'Database not available', details: 'Supabase admin client not configured' },
        { status: 503 },
      )
    }

    const { error } = await (supabase as any)
      .from('user_api_keys')
      .insert({
        user_id: userId,
        key: apiKey,
      })

    if (error) {
      console.error('[mcp/key] POST insert error:', error.message)
      return NextResponse.json(
        { error: 'فشل في إنشاء مفتاح API', details: error.message },
        { status: 500 },
      )
    }

    return NextResponse.json({ apiKey, createdAt: new Date().toISOString() })
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
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }

    const supabase = await getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json({ apiKey: null, hasKey: false })
    }

    const sb = supabase as any
    const { data: keyRecord } = await sb
      .from('user_api_keys')
      .select('key')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (keyRecord?.key) {
      const key = keyRecord.key
      const masked = key.slice(0, 8) + '...' + key.slice(-4)
      return NextResponse.json({ apiKey: masked, hasKey: true })
    }

    return NextResponse.json({ apiKey: null, hasKey: false })
  } catch (error) {
    console.error('[mcp/key] GET error:', error)
    return NextResponse.json({ apiKey: null, hasKey: false })
  }
}

/** DELETE: Revoke the current user's API keys */
export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }

    const supabase = await getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json(
        { error: 'Database not available' },
        { status: 503 },
      )
    }

    const { error } = await (supabase as any)
      .from('user_api_keys')
      .delete()
      .eq('user_id', userId)

    if (error) {
      console.error('[mcp/key] DELETE error:', error.message)
      return NextResponse.json({ error: 'فشل في حذف مفتاح API' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[mcp/key] DELETE error:', error)
    return NextResponse.json({ error: 'فشل في حذف مفتاح API' }, { status: 500 })
  }
}