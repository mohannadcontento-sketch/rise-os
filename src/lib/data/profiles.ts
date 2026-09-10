import { sb, toSnake, toCamel } from './core'

export const profiles = {
    async get(userId: string) {
      const client = await sb()
      const { data, error } = await client
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()
      if (error) throw error
      return data ? toCamel(data) : null
    },

    async update(userId: string, body: Record<string, any>) {
      const client = await sb()
      const { data, error } = await client
        .from('profiles')
        .update(toSnake(body))
        .eq('id', userId)
        .select('*')
        .single()
      if (error) throw error
      return toCamel(data)
    },
  }
