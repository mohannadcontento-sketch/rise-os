import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabase, ADMIN_EMAIL } from '@/lib/supabase'

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createClient(url, key)
}

// GET all users (admin only)
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization') || ''
    const token = authHeader.replace('Bearer ', '')

    const supabase = getSupabase()
    const { data: userData } = await supabase.auth.getUser(token)
    if (!userData.user || userData.user.email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: 'غير مصرح - أدمن فقط' }, { status: 403 })
    }

    // Get all users from Supabase auth
    const adminClient = getAdminSupabase()
    const { data: { users }, error: listError } = await adminClient.auth.admin.listUsers()

    const supabaseUsers = users?.map(u => ({
      id: u.id,
      email: u.email,
      name: u.user_metadata?.display_name || u.email?.split('@')[0] || 'مستخدم',
      createdAt: u.created_at,
      isAdmin: u.email === ADMIN_EMAIL,
    })) || []

    // Get storage/limits from Supabase tables
    const { data: storageRecords } = await supabase.from('UserStorage').select('*')
    const { data: aiUsages } = await supabase.from('UserAIUsage').select('*')

    const mergedUsers = supabaseUsers.map(su => {
      const storage = storageRecords?.find(s => s.supabaseId === su.id || s.userId === su.id)
      const aiUsage = aiUsages?.find(a => a.userId === su.id)
      return {
        ...su,
        storageUsed: storage?.storageUsed || 0,
        storageLimit: storage?.storageLimit || 10485760,
        aiLimit: storage?.aiLimit || 100,
        aiUsed: aiUsage?.monthlyUsed || 0,
      }
    })

    return NextResponse.json({ users: mergedUsers })
  } catch (error) {
    console.error('Admin users error:', error)
    return NextResponse.json({ users: [] })
  }
}

// POST - Create/update user limits
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization') || ''
    const token = authHeader.replace('Bearer ', '')

    const supabase = getSupabase()
    const { data: userData } = await supabase.auth.getUser(token)
    if (!userData.user || userData.user.email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }

    const { supabaseUserId, storageLimit, aiLimit, role } = await request.json()

    // Upsert user storage record in Supabase
    const { data: existing } = await supabase
      .from('UserStorage')
      .select('id, userId')
      .eq('supabaseId', supabaseUserId)
      .single()

    if (existing) {
      await supabase.from('UserStorage').update({
        storageLimit: storageLimit ?? undefined,
        aiLimit: aiLimit ?? undefined,
        role: role ?? undefined,
      }).eq('id', existing.id)

      if (aiLimit !== undefined && existing.userId) {
        await supabase.from('UserAIUsage').upsert({
          userId: existing.userId,
          monthlyLimit: aiLimit,
        })
      }
    } else {
      await supabase.from('UserStorage').insert({
        userId: supabaseUserId,
        supabaseId: supabaseUserId,
        storageLimit: storageLimit ?? 10485760,
        aiLimit: aiLimit ?? 100,
        role: role ?? 'user',
      })

      if (aiLimit !== undefined) {
        await supabase.from('UserAIUsage').upsert({
          userId: supabaseUserId,
          monthlyLimit: aiLimit,
        })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Admin update error:', error)
    return NextResponse.json({ error: 'Failed to update user limits' }, { status: 500 })
  }
}

// DELETE - Remove user
export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization') || ''
    const token = authHeader.replace('Bearer ', '')

    const supabase = getSupabase()
    const { data: userData } = await supabase.auth.getUser(token)
    if (!userData.user || userData.user.email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }

    const { supabaseUserId } = await request.json()

    // Delete from Supabase auth (admin API)
    const adminClient = getAdminSupabase()
    await adminClient.auth.admin.deleteUser(supabaseUserId)

    // Delete from Supabase tables
    await supabase.from('UserStorage').delete().eq('supabaseId', supabaseUserId)
    await supabase.from('UserStorage').delete().eq('userId', supabaseUserId)
    await supabase.from('UserAIUsage').delete().eq('userId', supabaseUserId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Admin delete error:', error)
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 })
  }
}