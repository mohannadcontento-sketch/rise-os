import { sb, toSnake, toCamel } from './core'

export const journals = {
    async get(userId: string, date: string) {
      const client = await sb()
      const { data, error } = await client
        .from('journals')
        .select('*')
        .eq('user_id', userId)
        .eq('date', date)
        .maybeSingle()
      if (error) throw error
      return data ? toCamel(data) : null
    },

    async list(userId: string, limit = 30) {
      const client = await sb()
      const { data, error } = await client
        .from('journals')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return toCamel<any[]>(data ?? [])
    },

    async upsert(userId: string, date: string, body: Record<string, any>) {
      // P2#5 FIX: Atomic upsert via Supabase native .upsert() (race-condition safe)
      // Relies on unique constraint (user_id, date) from migration 005.
      const client = await sb()
      const { data, error } = await client
        .from('journals')
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
