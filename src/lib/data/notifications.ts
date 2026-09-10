import { sb, toSnake, toCamel } from './core'

export const notifications = {
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
