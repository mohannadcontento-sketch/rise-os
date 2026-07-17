import { NextRequest, NextResponse } from 'next/server'
import { getSupabase, getSupabaseWithAuth } from '@/lib/supabase'
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

    // Use auth-aware client so RLS can evaluate auth.uid()
    try {
      const supabase = getSupabaseWithAuth(req)
      const { error } = await supabase
        .from('UserApiKey')
        .insert({ userId, key: apiKey, createdAt })
      if (error) {
        console.error('[mcp/key] Supabase insert error:', error.message)
      }
    } catch (err) {
      console.error('[mcp/key] Supabase not available:', err)
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
      const supabase = getSupabaseWithAuth(req)
      const { data, error } = await supabase
        .from('UserApiKey')
        .select('key')
        .eq('userId', userId)
        .order('createdAt', { ascending: false })
        .limit(1)
        .single()

      if (error) {
        console.error('[mcp/key] Supabase select error:', error.message)
      } else if (data?.key) {
        const key = data.key as string
        const masked = key.slice(0, 8) + '...' + key.slice(-4)
        return NextResponse.json({ apiKey: masked, hasKey: true })
      }
    } catch (err) {
      console.error('[mcp/key] Supabase not available:', err)
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
      const supabase = getSupabaseWithAuth(req)
      const { error } = await supabase.from('UserApiKey').delete().eq('userId', userId)
      if (error) {
        console.error('[mcp/key] Supabase delete error:', error.message)
      }
    } catch (err) {
      console.error('[mcp/key] Supabase not available:', err)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[mcp/key] DELETE error:', error)
    return NextResponse.json({ error: 'فشل في حذف مفتاح API' }, { status: 500 })
  }
}