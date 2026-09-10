import { sb, toSnake, toCamel } from './core'

export const healthLogs = {
    async list(userId: string, dates: string[]) {
      const client = await sb()
      const query = client
        .from('health_logs')
        .select('*')
        .eq('user_id', userId)

      if (dates.length > 0) {
        query.in('date', dates)
      }

      const { data, error } = await query.order('date', { ascending: false })
      if (error) throw error
      return toCamel<any[]>(data ?? [])
    },

    async upsert(userId: string, date: string, body: Record<string, any>) {
      // P2#5 FIX: Atomic upsert (race-condition safe)
      const client = await sb()
      const { data, error } = await client
        .from('health_logs')
        .upsert(
          toSnake({ ...body, userId, date }),
          { onConflict: 'user_id,date' }
        )
        .select()
        .single()
      if (error) throw error
      return toCamel(data)
    },
  }
