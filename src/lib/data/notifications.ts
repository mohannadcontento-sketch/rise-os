import { sb, toSnake, toCamel } from './core'

// ============================================================
// المرحلة 05 — توسيع طبقة الإشعارات:
//   feed          → RPC get_notifications_feed (حذف المنتهي
//                   كسولًا + فلترة account/activity/high/unread
//                   + عدّاد الشارة) في طلب واحد.
//   markAllRead   → RPC mark_all_notifications_read (ذري).
//   unreadCount   → RPC notifications_unread_count (خفيف).
// كلها تتراجع تلقائيًا للمسار القديم (list/updateMany) لو الهجرة
// 026 غير مطبقة بعد — توافق تنازلي كامل مع ما قبل المرحلة.
// ============================================================

export type NotificationFeedFilter = 'all' | 'unread' | 'high' | 'account' | 'activity'

export const notifications = {
    async feed(userId: string, opts: {
      limit?: number
      filter?: NotificationFeedFilter
      unreadOnly?: boolean
    } = {}) {
      const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100)
      const filter = opts.filter ?? 'all'
      try {
        const client = await sb()
        const { data, error } = await (client as any).rpc('get_notifications_feed', {
          p_limit: limit,
          p_filter: filter,
          p_unread_only: opts.unreadOnly === true,
        })
        if (!error && data) {
          const rows = (data as any).notifications ?? []
          return {
            notifications: toCamel<any[]>(rows),
            unreadCount: Number((data as any).unreadCount ?? 0),
            purged: Number((data as any).purged ?? 0),
            degraded: false,
          }
        }
        console.warn('[data/notifications] feed RPC degraded:', error?.message)
      } catch (err) {
        console.warn('[data/notifications] feed RPC error:', (err as Error)?.message)
      }
      // ── fallback ما قبل 026: list + فلترة في الذاكرة ──
      const all = await this.list(userId)
      const now = Date.now()
      const alive = all.filter((n: any) => !n.expiresAt || new Date(n.expiresAt).getTime() >= now)
      let filtered = alive
      if (opts.unreadOnly || filter === 'unread') {
        filtered = alive.filter((n: any) => !(n.isRead ?? n.read ?? false))
      } else if (filter === 'high') {
        filtered = alive.filter((n: any) => n.priority === 'high')
      } else if (filter === 'account') {
        filtered = alive.filter((n: any) => ['subscription', 'usage', 'system', 'background'].includes(n.type))
      } else if (filter === 'activity') {
        filtered = alive.filter((n: any) => ['community', 'mention', 'achievement', 'success', 'reminder', 'info', 'warning', 'error'].includes(n.type))
      }
      return {
        notifications: filtered.slice(0, limit),
        unreadCount: alive.filter((n: any) => !(n.isRead ?? n.read ?? false)).length,
        purged: 0,
        degraded: true,
      }
    },

    async unreadCount(userId: string) {
      try {
        const client = await sb()
        const { data, error } = await (client as any).rpc('notifications_unread_count')
        if (!error && data !== null && data !== undefined) {
          return Number(data)
        }
        console.warn('[data/notifications] unreadCount RPC degraded:', error?.message)
      } catch (err) {
        console.warn('[data/notifications] unreadCount RPC error:', (err as Error)?.message)
      }
      const all = await this.list(userId)
      const now = Date.now()
      return all.filter((n: any) =>
        !(n.isRead ?? n.read ?? false) && (!n.expiresAt || new Date(n.expiresAt).getTime() >= now)
      ).length
    },

    async markAllRead(userId: string) {
      try {
        const client = await sb()
        const { data, error } = await (client as any).rpc('mark_all_notifications_read')
        if (!error && data !== null && data !== undefined) {
          return Number(data)
        }
        console.warn('[data/notifications] markAllRead RPC degraded:', error?.message)
      } catch (err) {
        console.warn('[data/notifications] markAllRead RPC error:', (err as Error)?.message)
      }
      // fallback: حدّث كل غير المقروء بالمسار القديم
      const all = await this.list(userId)
      const unreadIds = all.filter((n: any) => !(n.isRead ?? n.read ?? false)).map((n: any) => n.id)
      if (unreadIds.length === 0) return 0
      return await this.updateMany(unreadIds, userId, { read: true })
    },

    async list(userId: string) {
      const client = await sb()
      const { data, error } = await client
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return toCamel<any[]>(data ?? [])
    },

    async create(userId: string, body: Record<string, any>) {
      const client = await sb()
      const { data, error } = await client
        .from('notifications')
        .insert(toSnake({ ...body, userId }))
        .select()
        .single()
      if (error) throw error
      return toCamel(data)
    },

    async update(id: string, userId: string, body: Record<string, any>) {
      const client = await sb()
      const { data, error } = await client
        .from('notifications')
        .update(toSnake(body))
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single()
      if (error) throw error
      return toCamel(data)
    },

    async updateMany(ids: string[], userId: string, body: Record<string, any>) {
      if (ids.length === 0) return 0
      const client = await sb()
      const { data: rows, error } = await client
        .from('notifications')
        .update(toSnake(body))
        .in('id', ids)
        .eq('user_id', userId)
        .select('id')
      if (error) throw error
      return rows?.length ?? 0
    },

    async remove(id: string, userId: string) {
      const client = await sb()
      const { error } = await client
        .from('notifications')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)
      if (error) throw error
    },

    async removeMany(ids: string[], userId: string) {
      if (ids.length === 0) return 0
      const client = await sb()
      const { data: rows, error } = await client
        .from('notifications')
        .delete()
        .in('id', ids)
        .eq('user_id', userId)
        .select('id')
      if (error) throw error
      return rows?.length ?? 0
    },

    async removeAll(userId: string) {
      const client = await sb()
      const { data: rows, error } = await client
        .from('notifications')
        .delete()
        .eq('user_id', userId)
        .select('id')
      if (error) throw error
      return rows?.length ?? 0
    },
  }
