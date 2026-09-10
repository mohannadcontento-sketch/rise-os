import { sb, toSnake, toCamel } from './core'

export const userAchievements = {
    async list(userId: string) {
      const client = await sb()
      const { data, error } = await client
        .from('user_achievements')
        .select('*')
        .eq('user_id', userId)
      if (error) throw error
      return toCamel<any[]>(data ?? [])
    },

    async create(userId: string, body: Record<string, any>) {
      const client = await sb()
      const { data, error } = await client
        .from('user_achievements')
        .upsert(toSnake({ ...body, userId }), { onConflict: 'user_id,badge_id', ignoreDuplicates: false })
        .select()
        .single()
      if (error) throw error
      return toCamel(data)
    },
  }
