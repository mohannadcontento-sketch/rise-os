import { sb, toSnake, toCamel } from './core'

export const plannerItems = {
    async list(userId: string, date: string) {
      const client = await sb()
      const { data, error } = await client
        .from('planner_items')
        .select('*')
        .eq('user_id', userId)
        .eq('date', date)
        .order('section', { ascending: true })
        .order('order', { ascending: true })
      if (error) throw error
      return toCamel<any[]>(data ?? [])
    },

    async create(userId: string, body: Record<string, any>) {
      const client = await sb()
      const { data, error } = await client
        .from('planner_items')
        .insert(toSnake({ ...body, userId }))
        .select()
        .single()
      if (error) throw error
      return toCamel(data)
    },

    async update(id: string, userId: string, body: Record<string, any>) {
      const client = await sb()
      const { data, error } = await client
        .from('planner_items')
        .update(toSnake(body))
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single()
      if (error) throw error
      return toCamel(data)
    },

    async remove(id: string, userId: string) {
      const client = await sb()
      const { error } = await client
        .from('planner_items')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)
      if (error) throw error
    },
  }
