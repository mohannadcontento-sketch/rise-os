import { sb, toSnake, toCamel } from './core'

export const workSessions = {
    async list(userId: string, limit = 50) {
      const client = await sb()
      const { data, error } = await client
        .from('work_sessions')
        .select('*')
        .eq('user_id', userId)
        .order('started_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return toCamel<any[]>(data ?? [])
    },

    async get(id: string, userId: string) {
      const client = await sb()
      const { data, error } = await client
        .from('work_sessions')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single()
      if (error) throw error
      return toCamel(data)
    },

    async create(userId: string, body: Record<string, any>) {
      const client = await sb()
      const { data, error } = await client
        .from('work_sessions')
        .insert(toSnake({ ...body, userId }))
        .select()
        .single()
      if (error) throw error
      return toCamel(data)
    },

    async update(id: string, userId: string, body: Record<string, any>) {
      const client = await sb()
      const { data, error } = await client
        .from('work_sessions')
        .update(toSnake(body))
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single()
      if (error) throw error
      return toCamel(data)
    },
  }
