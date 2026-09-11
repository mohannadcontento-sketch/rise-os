import { requireAdmin, logAudit } from "@/lib/audit";
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, isAdminRole } from '@/lib/supabase'
import { bustSuspensionCache } from '@/lib/suspension'
import { withIdempotency } from '@/lib/idempotency'
import { notifyUser, adminMessageNotification, accountUnsuspendedMessage } from '@/lib/notifications-service'

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
      return NextResponse.json({ error: 'تعذر تحميل المستخدمين' }, { status: 500 })
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
          isAdmin: isAdminRole(profile.role),
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
      return NextResponse.json({ error: 'تعذر تحميل المستخدمين' }, { status: 500 })
    }

    const users = (profiles ?? []).map((p: any) => ({
      id: p.id,
      email: p.email || '',
      name: p.name || 'مستخدم',
      avatar: p.avatar || null,
      createdAt: p.created_at,
      isAdmin: isAdminRole(p.role),
      role: p.role || 'user',
      suspended: p.suspended === true,
    }))

    return NextResponse.json({ users })
  } catch (error) {
    console.error('Admin users error:', error)
    return NextResponse.json({ error: 'تعذر تحميل المستخدمين' }, { status: 500 })
  }
}

// POST — action-based admin ops
export async function POST(request: NextRequest) {
  try {
    const adminId = await requireAdmin(request)
    if (!adminId) {
      return NextResponse.json({ error: 'غير مصرح - أدمن فقط' }, { status: 403 })
    }

  return withIdempotency(request, adminId, async () => {
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
    const targetIsAdmin = isAdminRole(target.role)

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
        // المرحلة 05: أهلاً بعودتك — إشعار ترحيبي عند إلغاء الإيقاف
        // (dedup شهري: لا يتكرر لو تكرر الإيقاف/التنشيط مرات في نفس الشهر)
        await notifyUser(sb, {
          userId: targetUserId,
          ...accountUnsuspendedMessage(),
          dedupKey: `unsuspend:${targetUserId}:${new Date().toISOString().slice(0, 7)}`,
        })
        return NextResponse.json({ success: true })
      }

      case 'notify': {
        // المرحلة 05 — تصليح جذري: الإدراج القديم كان يفشل صامتًا
        // (type 'admin_message' خارج CHECK constraint + عمود is_read
        // غير موجود). الآن عبر الخدمة الموحدة: type 'system' صحيح +
        // dedup على (المستخدم+محتوى الرسالة+اليوم) يمنع التكرار.
        if (!title || !message) return NextResponse.json({ error: 'العنوان والنص مطلوبان' }, { status: 400 })
        const result = await notifyUser(sb, {
          userId: targetUserId,
          ...adminMessageNotification(String(title), String(message)),
          dedupKey: `admin-msg:${targetUserId}:${String(title).slice(0, 60)}:${new Date().toISOString().slice(0, 10)}`,
        })
        if (!result.created && !result.deduplicated) {
          return NextResponse.json({ error: 'تعذر إرسال الإشعار' }, { status: 500 })
        }
        await logAudit(request, adminId, 'notify-user', { resource: 'notifications', resourceId: targetUserId })
        return NextResponse.json({ success: true, deduplicated: result.deduplicated })
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
  
  })} catch (error) {
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

  return withIdempotency(request, adminId, async () => {
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
    if (target && isAdminRole(target.role)) {
      return NextResponse.json({ error: 'لا يمكن حذف حساب أدمن — أزل الصلاحية أولاً' }, { status: 400 })
    }

    // One DB transaction: wipe all application data + profile together.
    const { data: deletedCount, error: deleteError } = await sb.rpc('admin_delete_user_data_atomic', {
      p_admin_user_id: adminId,
      p_target_user_id: targetUserId,
    })
    if (deleteError) {
      console.error('[admin/users] atomic delete failed:', deleteError.message)
      return NextResponse.json({ error: 'تعذر حذف بيانات المستخدم بالكامل' }, { status: 503 })
    }

    await logAudit(request, adminId, 'delete-user', { resource: 'profiles', resourceId: targetUserId, details: { email: target?.email || '', deletedRows: Number(deletedCount || 0) } })
    return NextResponse.json({ success: true, deleted: true, deletedRows: Number(deletedCount || 0) })
  
  })} catch (error) {
    console.error('Admin delete error:', error)
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 })
  }
}
