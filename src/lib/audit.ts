import { NextRequest } from 'next/server'

// ============================================================
// P3#3: Audit Logging — tracks admin actions for security
// ------------------------------------------------------------
// Logs all admin operations (user management, config changes,
// data access) to the notifications table + console.
// In production, forward to Sentry/external log service.
// ============================================================

interface AuditEntry {
  userId: string
  action: string
  resource?: string
  resourceId?: string
  details?: Record<string, any>
  ip?: string
  userAgent?: string
  timestamp: string
}

/**
 * Log an admin action for audit trail.
 * Stores in notifications table (type: 'audit') + console.
 */
export async function logAudit(
  req: NextRequest,
  userId: string,
  action: string,
  details?: {
    resource?: string
    resourceId?: string
    details?: Record<string, any>
  }
): Promise<void> {
  const entry: AuditEntry = {
    userId,
    action,
    resource: details?.resource,
    resourceId: details?.resourceId,
    details: details?.details,
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
    userAgent: req.headers.get('user-agent') || 'unknown',
    timestamp: new Date().toISOString(),
  }

  // Always log to console (Vercel captures this)
  console.log('[AUDIT]', JSON.stringify(entry))

  // Try to persist to notifications table
  try {
    const { data } = await import('@/lib/data')
    await data.notifications.create(userId, {
      title: `Admin: ${action}`,
      body: details?.resource ? `${details.resource}:${details.resourceId || ''}` : action,
      type: 'audit',
      icon: '🛡️',
      actionUrl: '',
      isRead: false,
    })
  } catch {
    // Non-critical — console log is sufficient
  }
}

/**
 * Check if user has admin role.
 * Uses profile.role from Supabase or Prisma.
 */
export async function isAdmin(userId: string): Promise<boolean> {
  try {
    const { getSupabaseAdmin } = await import('@/lib/supabase')
    const admin = await getSupabaseAdmin()
    if (admin) {
      const { data: profile } = await admin
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle()
      return (profile as any)?.role === 'admin'
    }
    // Mock mode
    const { db } = await import('@/lib/db')
    const user = await (db as any).user.findUnique({ where: { id: userId }, select: { role: true } })
    return user?.role === 'admin'
  } catch {
    return false
  }
}
