import { sb, toSnake, toCamel } from './core'

export const books = {
    async list(userId: string) {
      const client = await sb()
      const { data, error } = await client
        .from('books')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return toCamel<any[]>(data ?? [])
    },

    async create(userId: string, body: Record<string, any>) {
      const client = await sb()
      const { data, error } = await client
        .from('books')
        .insert(toSnake({ ...body, userId }))
        .select()
        .single()
      if (error) throw error
      return toCamel(data)
    },

    async update(id: string, userId: string, body: Record<string, any>) {
      const client = await sb()
      const { data, error } = await client
        .from('books')
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
        .from('books')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)
      if (error) throw error
    },
  }
