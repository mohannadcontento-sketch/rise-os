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

// GET: List all API keys with user info
export async function GET(request: NextRequest) {
  try {
    const user = await requireAdmin(request)
    if (!user) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }

    const adminClient = getAdminSupabase()

    // Get all users for name resolution
    const { data: { users } } = await adminClient.auth.admin.listUsers()
    const userMap = new Map(
      (users || []).map((u) => [u.id, {
        name: u.user_metadata?.display_name || u.email?.split('@')[0] || 'مستخدم',
        email: u.email || '',
      }])
    )

    const supabase = getSupabase()

    // Try to get API keys from the ApiKey table
    let keys: any[] = []
    try {
      const { data } = await supabase
        .from('ApiKey')
        .select('*')
        .order('createdAt', { ascending: false })
        .limit(100)

      keys = (data || []).map((k: any) => {
        const userInfo = userMap.get(k.userId)
        return {
          id: k.id,
          name: k.name || 'مفتاح بدون اسم',
          userId: k.userId,
          userName: userInfo?.name || 'مستخدم محذوف',
          userEmail: userInfo?.email || '—',
          keyPreview: (k.key || k.apiKey || '').slice(0, 12),
          createdAt: k.createdAt,
          lastUsed: k.lastUsedAt || k.lastUsed || null,
          usageCount: k.usageCount || 0,
        }
      })
    } catch {
      // ApiKey table might not exist
    }

    return NextResponse.json({ keys })
  } catch (error) {
    console.error('Admin API keys error:', error)
    return NextResponse.json({ keys: [] })
  }
}

// DELETE: Revoke an API key
export async function DELETE(request: NextRequest) {
  try {
    const user = await requireAdmin(request)
    if (!user) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const keyId = searchParams.get('id')

    if (!keyId) {
      return NextResponse.json({ error: 'يجب تحديد المفتاح' }, { status: 400 })
    }

    const supabase = getSupabase()

    const { error } = await supabase.from('ApiKey').delete().eq('id', keyId)

    if (error) {
      return NextResponse.json({ error: `فشل إلغاء المفتاح: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Admin API key revoke error:', error)
    return NextResponse.json({ error: 'فشل إلغاء المفتاح' }, { status: 500 })
  }
}

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createClient(url, key)
}