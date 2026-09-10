import { sb, toSnake, toCamel } from './core'

export const focusSessions = {
    async list(userId: string, limit = 50) {
      const client = await sb()
      const { data, error } = await client
        .from('focus_sessions')
        .select('*')
        .eq('user_id', userId)
        .order('started_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return toCamel<any[]>(data ?? [])
    },

    async create(userId: string, body: Record<string, any>) {
      const client = await sb()
      if (body.taskId) {
        const { data: task, error: taskError } = await client
          .from('tasks')
          .select('id')
          .eq('id', body.taskId)
          .eq('user_id', userId)
          .maybeSingle()
        if (taskError) throw taskError
        if (!task) throw new Error('Task not found or not owned by user')
      }
      const { data, error } = await client
        .from('focus_sessions')
        .insert(toSnake({ ...body, userId }))
        .select()
        .single()
      if (error) throw error
      return toCamel(data)
    },

    async update(id: string, userId: string, body: Record<string, any>) {
      const client = await sb()
      if (body.taskId) {
        const { data: task, error: taskError } = await client
          .from('tasks')
          .select('id')
          .eq('id', body.taskId)
          .eq('user_id', userId)
          .maybeSingle()
        if (taskError) throw taskError
        if (!task) throw new Error('Task not found or not owned by user')
      }
      const { data, error } = await client
        .from('focus_sessions')
        .update(toSnake(body))
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single()
      if (error) throw error
      return toCamel(data)
    },
  }
