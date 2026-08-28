import { requireAdmin } from "@/lib/audit";
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET: List all API keys with user info
export async function GET(request: NextRequest) {
  try {
    // SECURITY: admin-only — this endpoint enumerates every user's keys.
    const adminId = await requireAdmin(request)
    if (!adminId) {
      return NextResponse.json({ error: 'غير مصرح - أدمن فقط' }, { status: 403 })
    }

    const supabase = await getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json({ keys: [] })
    }

    const sb = supabase as any

    // SECURITY: never select the raw `key` column — only the hash,
    // used to derive a non-secret display fingerprint.
    const { data: keys, error } = await sb
      .from('user_api_keys')
      .select('id, user_id, name, key_hash, created_at, last_used_at')
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      console.error('Admin API keys fetch error:', error.message)
      return NextResponse.json({ keys: [] })
    }

    // Fetch user profiles for name/email
    const userIds = [...new Set((keys || []).map((k: any) => k.user_id))]
    let profileMap: Record<string, { name: string | null; email: string | null }> = {}

    if (userIds.length > 0) {
      let profiles: any[] = []
      try {
        const res = await sb
          .from('profiles')
          .select('id, name, email')
          .in('id', userIds)
        profiles = res.data || []
      } catch { /* ignore */ }

      if (profiles) {
        profileMap = Object.fromEntries(profiles.map((p: any) => [p.id, { name: p.name, email: p.email }]))
      }
    }

    const result = (keys || []).map((k: any) => {
      const profile = profileMap[k.user_id]
      return {
        id: k.id,
        name: k.name || 'مفتاح بدون اسم',
        userId: k.user_id,
        userName: profile?.name || k.user_id?.slice(0, 8) || 'مستخدم محذوف',
        userEmail: profile?.email || '—',
        keyPreview: (k.key_hash || '').slice(0, 8) || '—',
        createdAt: k.created_at,
        lastUsedAt: k.last_used_at || null,
        usageCount: 0,
      }
    })

    return NextResponse.json({ keys: result })
  } catch (error) {
    console.error('Admin API keys error:', error)
    return NextResponse.json({ keys: [] })
  }
}

// DELETE: Revoke an API key
export async function DELETE(request: NextRequest) {
  try {
    const adminId = await requireAdmin(request)
    if (!adminId) {
      return NextResponse.json({ error: 'غير مصرح - أدمن فقط' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const keyId = searchParams.get('id')

    if (!keyId) {
      return NextResponse.json({ error: 'يجب تحديد المفتاح' }, { status: 400 })
    }

    const supabase = await getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase admin not available' }, { status: 503 })
    }

    const { error } = await (supabase as any)
      .from('user_api_keys')
      .delete()
      .eq('id', keyId)

    if (error) {
      console.error('Admin API key revoke error:', error.message)
      return NextResponse.json({ error: 'فشل إلغاء المفتاح' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Admin API key revoke error:', error)
    return NextResponse.json({ error: 'فشل إلغاء المفتاح' }, { status: 500 })
  }
}