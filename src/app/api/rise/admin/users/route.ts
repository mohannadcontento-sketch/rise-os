import { requireAdmin } from "@/lib/audit";
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, ADMIN_EMAIL, isAdminRole } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET all users
export async function GET(request: NextRequest) {
  try {
    const adminId = await requireAdmin(request)
    if (!adminId) {
      return NextResponse.json({ error: 'غير مصرح - أدمن فقط' }, { status: 403 })
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
      isAdmin: isAdminRole(p.role) || p.email === ADMIN_EMAIL,
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
    const adminId = await requireAdmin(request)
    if (!adminId) {
      return NextResponse.json({ error: 'غير مصرح - أدمن فقط' }, { status: 403 })
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

    // Update role in profiles table (normalize: 'Admin'/' admin' → 'admin')
    if (role) {
      const normalizedRole = String(role).trim().toLowerCase()
      const { error } = await sb
        .from('profiles')
        .update({ role: normalizedRole })
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
    const adminId = await requireAdmin(request)
    if (!adminId) {
      return NextResponse.json({ error: 'غير مصرح - أدمن فقط' }, { status: 403 })
    }

    const { userId: targetUserId } = await request.json()

    if (!targetUserId) {
      return NextResponse.json({ error: 'يجب تحديد المستخدم' }, { status: 400 })
    }

    const admin = await getSupabaseAdmin()
    if (!admin) {
      // Mock mode: delete from Prisma
      const { db } = await import('@/lib/db')
      // Delete all user data (CASCADE will handle relations)
      await (db as any).user.delete({ where: { id: targetUserId } })
      return NextResponse.json({ success: true, deleted: true })
    }

    const sb = admin as any

    // FIX: Delete ALL user data from every table (not just profile)
    // Order matters: child tables first, then parent
    const tables = [
      'habit_logs',
      'habits',
      'subtasks',
      'tasks',
      'milestones',
      'goals',
      'projects',
      'journals',
      'focus_sessions',
      'health_logs',
      'finance_records',
      'books',
      'knowledge_items',
      'planner_items',
      'morning_logs',
      'daily_scores',
      'user_achievements',
      'notifications',
      'user_ai_usage',
      'user_storage',
      'user_api_keys',
      'user_settings',
    ]

    for (const table of tables) {
      try {
        await sb.from(table).delete().eq('user_id', targetUserId)
      } catch { /* some tables may not have user_id column */ }
    }

    // Finally delete the profile
    const { error } = await sb
      .from('profiles')
      .delete()
      .eq('id', targetUserId)
    if (error) console.error('[admin/users] delete error:', error)

    return NextResponse.json({ success: true, deleted: true })
  } catch (error) {
    console.error('Admin delete error:', error)
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 })
  }
}