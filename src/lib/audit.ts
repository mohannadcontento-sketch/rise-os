import { NextRequest } from 'next/server'
import { isAdminRole } from '@/lib/supabase'

// ============================================================
// P3#3: Audit Logging — tracks admin actions for security
// ------------------------------------------------------------
// Logs all admin operations (user management, config changes,
// data access) to a dedicated durable audit ledger + console.
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
 * Stores in audit_logs + console.
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

  console.log('[AUDIT]', JSON.stringify(entry))

  // Durable, append-oriented audit trail. Do NOT route audit events through
  // notifications: notifications are user-facing mutable data, not a security ledger.
  try {
    const { getSupabaseAdmin } = await import('@/lib/supabase')
    const admin = await getSupabaseAdmin()
    if (!admin) return

    const { error } = await (admin as any).from('audit_logs').insert({
      actor_user_id: userId,
      action,
      target_type: details?.resource || null,
      target_id: details?.resourceId || null,
      metadata: details?.details || {},
      ip_address: entry.ip || null,
      user_agent: entry.userAgent || null,
      created_at: entry.timestamp,
    })

    if (error) console.error('[AUDIT] durable write failed:', error.message)
  } catch (error) {
    console.error('[AUDIT] durable write unavailable:', error)
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
      return isAdminRole((profile as any)?.role)
    }
    // Mock mode
    const { db } = await import('@/lib/db')
    const user = await (db as any).user.findUnique({ where: { id: userId }, select: { role: true } })
    return isAdminRole(user?.role)
  } catch {
    return false
  }
}

/**
 * Combined guard for admin-only API routes: authenticate, then authorize.
 * Returns the userId when the caller is an admin, otherwise null.
 * Every /api/rise/admin/* route MUST call this — importing isAdmin alone
 * is not enough (several routes imported it without ever calling it).
 */
export async function requireAdmin(req: NextRequest): Promise<string | null> {
  const { requireAuth } = await import('@/lib/auth')
  const userId = await requireAuth(req)
  if (!userId) return null
  if (!(await isAdmin(userId))) return null
  return userId
}
