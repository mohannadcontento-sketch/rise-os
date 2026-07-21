import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getSupabaseAdmin, ADMIN_EMAIL } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET all users
export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth(request)
    if (!userId) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }

    const admin = await getSupabaseAdmin()
    if (!admin) {
      return NextResponse.json({ users: [] })
    }

    const sb = admin as any

    const { data: profiles, error } = await sb
      .from('profiles')
      .select('id, name, email, role, avatar, created_at')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[admin/users] error:', error)
      return NextResponse.json({ users: [] })
    }

    const users = (profiles ?? []).map((p: any) => ({
      id: p.id,
      email: p.email || '',
      name: p.name || 'مستخدم',
      avatar: p.avatar || null,
      createdAt: p.created_at,
      isAdmin: p.role === 'admin' || p.email === ADMIN_EMAIL,
      role: p.role || 'user',
    }))

    return NextResponse.json({ users })
  } catch (error) {
    console.error('Admin users error:', error)
    return NextResponse.json({ users: [] })
  }
}

// POST — update user role
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request)
    if (!userId) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }

    const { userId: targetUserId, role } = await request.json()

    if (!targetUserId) {
      return NextResponse.json({ error: 'يجب تحديد المستخدم' }, { status: 400 })
    }

    const admin = await getSupabaseAdmin()
    if (!admin) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
    }

    const sb = admin as any

    // Update role in profiles table
    if (role) {
      const { error } = await sb
        .from('profiles')
        .update({ role })
        .eq('id', targetUserId)
      if (error) console.error('[admin/users] update role error:', error)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Admin update error:', error)
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
}

// DELETE — remove user
export async function DELETE(request: NextRequest) {
  try {
    const userId = await requireAuth(request)
    if (!userId) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }

    const { userId: targetUserId } = await request.json()

    if (!targetUserId) {
      return NextResponse.json({ error: 'يجب تحديد المستخدم' }, { status: 400 })
    }

    const admin = await getSupabaseAdmin()
    if (!admin) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
    }

    const sb = admin as any

    // Delete profile (cascade should handle related data via RLS or triggers)
    const { error } = await sb
      .from('profiles')
      .delete()
      .eq('id', targetUserId)
    if (error) console.error('[admin/users] delete error:', error)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Admin delete error:', error)
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 })
  }
}