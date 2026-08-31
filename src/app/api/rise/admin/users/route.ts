import { requireAdmin, logAudit } from "@/lib/audit";
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, ADMIN_EMAIL, isAdminRole } from '@/lib/supabase'
import { bustSuspensionCache } from '@/lib/suspension'

export const dynamic = 'force-dynamic'

// ADMIN PRO users route:
// GET    ?userId=xxx → full 360° detail (profile + content counts + last activity)
// GET            → list (existing behavior, + suspended flag)
// POST   { action: 'set-role' | 'suspend' | 'unsuspend' | 'notify', ... }
// DELETE → remove user entirely (existing behavior)

async function fetchProfile(sb: any, userId: string) {
  const { data } = await sb
    .from('profiles')
    .select('id, name, email, role, avatar, created_at, suspended, suspended_at, level, xp, storage_limit_mb, ai_limit')
    .eq('id', userId)
    .maybeSingle()
  return data
}

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

    // ── Detail mode (?userId=) — user 360° ──
    const { searchParams } = new URL(request.url)
    const detailId = searchParams.get('userId')
    if (detailId) {
      const profile = await fetchProfile(sb, detailId)
      if (!profile) return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 })

      const count = async (table: string) => {
        try {
          const { count } = await sb.from(table).select('*', { count: 'exact', head: true }).eq('user_id', detailId)
          return count ?? 0
        } catch { return 0 }
      }
      const countWhere = async (table: string, col: string, val: any) => {
        try {
          const { count } = await sb.from(table).select('*', { count: 'exact', head: true }).eq('user_id', detailId).eq(col, val)
          return count ?? 0
        } catch { return 0 }
      }
      const [tasks, tasksDone, habits, habitLogs, journals, focusSessions, books, financeRecords, projects, goals] = await Promise.all([
        count('tasks'), countWhere('tasks', 'status', 'done'), count('habits'), count('habit_logs'),
        count('journals'), count('focus_sessions'), count('books'), count('finance_records'),
        count('projects'), count('goals'),
      ])

      // Last activity: newest of several proxies (daily_scores is written on every dashboard open)
      let lastActivity: string | null = null
      try {
        const { data } = await sb
          .from('daily_scores')
          .select('date')
          .eq('user_id', detailId)
          .order('date', { ascending: false })
          .limit(1)
        lastActivity = data?.[0]?.date || null
      } catch { /* ignore */ }

      return NextResponse.json({
        user: {
          id: profile.id,
          email: profile.email || '',
          name: profile.name || 'مستخدم',
          avatar: profile.avatar || null,
          createdAt: profile.created_at,
          role: profile.role || 'user',
          isAdmin: isAdminRole(profile.role) || profile.email === ADMIN_EMAIL,
          suspended: profile.suspended === true,
          suspendedAt: profile.suspended_at || null,
          level: profile.level ?? null,
          xp: profile.xp ?? null,
          storageLimitMb: profile.storage_limit_mb ?? null,
          aiLimit: profile.ai_limit ?? null,
        },
        stats: {
          tasks, tasksDone, habits, habitLogs, journals, focusSessions,
          books, financeRecords, projects, goals, lastActivity,
        },
      })
    }

    // ── List mode (existing) ──
    const { data: profiles, error } = await sb
      .from('profiles')
      .select('id, name, email, role, avatar, created_at, suspended')
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
      suspended: p.suspended === true,
    }))

    return NextResponse.json({ users })
  } catch (error) {
    console.error('Admin users error:', error)
    return NextResponse.json({ users: [] })
  }
}

// POST — action-based admin ops
export async function POST(request: NextRequest) {
  try {
    const adminId = await requireAdmin(request)
    if (!adminId) {
      return NextResponse.json({ error: 'غير مصرح - أدمن فقط' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const { userId: targetUserId, action, role, title, message } = body

    if (!targetUserId) {
      return NextResponse.json({ error: 'يجب تحديد المستخدم' }, { status: 400 })
    }
    if (targetUserId === adminId && (action === 'suspend' || action === 'unsuspend')) {
      return NextResponse.json({ error: 'لا يمكنك إيقاف حسابك أنت' }, { status: 400 })
    }

    const admin = await getSupabaseAdmin()
    if (!admin) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
    }
    const sb = admin as any

    // Self-protection: never suspend/delete another admin's account silently
    const target = await fetchProfile(sb, targetUserId)
    if (!target) return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 })
    const targetIsAdmin = isAdminRole(target.role) || target.email === ADMIN_EMAIL

    switch (action) {
      case 'set-role': {
        if (!role) return NextResponse.json({ error: 'الدور مطلوب' }, { status: 400 })
        const normalizedRole = String(role).trim().toLowerCase()
        const { error } = await sb.from('profiles').update({ role: normalizedRole }).eq('id', targetUserId)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        await logAudit(request, adminId, 'set-role', { resource: 'profiles', resourceId: targetUserId, details: { role: normalizedRole } })
        return NextResponse.json({ success: true })
      }

      case 'suspend': {
        if (targetIsAdmin) return NextResponse.json({ error: 'لا يمكن إيقاف حساب أدمن' }, { status: 400 })
        const { error } = await sb
          .from('profiles')
          .update({ suspended: true, suspended_at: new Date().toISOString() })
          .eq('id', targetUserId)
        if (error) {
          // migration 012 not applied yet
          const m = String(error.message || '')
          if (m.includes('suspended')) return NextResponse.json({ error: 'شغّل migration 012_admin_pro.sql أولاً' }, { status: 400 })
          return NextResponse.json({ error: m }, { status: 500 })
        }
        bustSuspensionCache(targetUserId) // ban lands within seconds, not 5 min
        await logAudit(request, adminId, 'suspend', { resource: 'profiles', resourceId: targetUserId, details: { email: target.email } })
        return NextResponse.json({ success: true })
      }

      case 'unsuspend': {
        const { error } = await sb
          .from('profiles')
          .update({ suspended: false, suspended_at: null })
          .eq('id', targetUserId)
        if (error) {
          const m = String(error.message || '')
          if (m.includes('suspended')) return NextResponse.json({ error: 'شغّل migration 012_admin_pro.sql أولاً' }, { status: 400 })
          return NextResponse.json({ error: m }, { status: 500 })
        }
        bustSuspensionCache(targetUserId)
        await logAudit(request, adminId, 'unsuspend', { resource: 'profiles', resourceId: targetUserId, details: { email: target.email } })
        return NextResponse.json({ success: true })
      }

      case 'notify': {
        if (!title || !message) return NextResponse.json({ error: 'العنوان والنص مطلوبان' }, { status: 400 })
        const { error } = await sb.from('notifications').insert({
          user_id: targetUserId,
          title: String(title).slice(0, 120),
          body: String(message).slice(0, 1000),
          type: 'admin_message',
          icon: '🛡️',
          action_url: '',
          is_read: false,
        })
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        await logAudit(request, adminId, 'notify-user', { resource: 'notifications', resourceId: targetUserId })
        return NextResponse.json({ success: true })
      }

      default:
        // Legacy behavior: bare {userId, role} → set-role
        if (role) {
          const normalizedRole = String(role).trim().toLowerCase()
          const { error } = await sb.from('profiles').update({ role: normalizedRole }).eq('id', targetUserId)
          if (error) return NextResponse.json({ error: error.message }, { status: 500 })
          await logAudit(request, adminId, 'set-role', { resource: 'profiles', resourceId: targetUserId, details: { role: normalizedRole } })
          return NextResponse.json({ success: true })
        }
        return NextResponse.json({ error: 'إجراء غير معروف' }, { status: 400 })
    }
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
    if (targetUserId === adminId) {
      return NextResponse.json({ error: 'لا يمكنك حذف حسابك أنت' }, { status: 400 })
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

    // Safety: never delete an admin account
    const target = await fetchProfile(sb, targetUserId)
    if (target && (isAdminRole(target.role) || target.email === ADMIN_EMAIL)) {
      return NextResponse.json({ error: 'لا يمكن حذف حساب أدمن — أزل الصلاحية أولاً' }, { status: 400 })
    }

    // Delete ALL user data from every table (not just profile)
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

    await logAudit(request, adminId, 'delete-user', { resource: 'profiles', resourceId: targetUserId, details: { email: target?.email || '' } })
    return NextResponse.json({ success: true, deleted: true })
  } catch (error) {
    console.error('Admin delete error:', error)
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 })
  }
}
