import { sb, toSnake, toCamel } from './core'

export const userAIUsage = {
    async get(userId: string) {
      const client = await sb()
      const { data, error } = await client
        .from('user_ai_usage')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()
      if (error) throw error
      return data ? toCamel(data) : null
    },
  }
