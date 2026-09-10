import { sb, toSnake, toCamel } from './core'

export const habitLogs = {
    async list(userId: string) {
      const client = await sb()
      const { data: habits, error: habitsError } = await client
        .from('habits')
        .select('id')
        .eq('user_id', userId)
      if (habitsError) throw habitsError
      const habitIds = (habits ?? []).map((h: any) => h.id).filter(Boolean)
      if (habitIds.length === 0) return []

      const { data: rows, error } = await client
        .from('habit_logs')
        .select('*')
        .in('habit_id', habitIds)
        .order('date', { ascending: true })
      if (error) throw error
      return toCamel<any[]>(rows ?? [])
    },
  }
