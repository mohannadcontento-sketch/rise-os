import { sb, toSnake, toCamel } from './core'

// ============================================================
// data/dailyScores.ts — مستودع «درجات اليوم»
//
// يغذّي المراجعة الأسبوعية/الشهرية والرسوم البيانية: get ليوم
// واحد، list لمجموعة تواريخ (رسم الأسبوع)، وupsert ذري على
// (user_id, date) — الحفظ المتزامن لنفس اليوم يذوب في آخر
// كتابة بلا صفوف مكررة.
// ============================================================

export const dailyScores = {
    async get(userId: string, date: string) {
      const client = await sb()
      const { data, error } = await client
        .from('daily_scores')
        .select('*')
        .eq('user_id', userId)
        .eq('date', date)
        .maybeSingle()
      if (error) throw error
      return data ? toCamel(data) : null
    },

    async list(userId: string, dates: string[]) {
      // P2#3: New method for fetching multiple days (used by weekly chart)
      const client = await sb()
      let query = client
        .from('daily_scores')
        .select('*')
        .eq('user_id', userId)
      if (dates.length > 0) query = query.in('date', dates)
      const { data, error } = await query.order('date', { ascending: true })
      if (error) throw error
      return toCamel<any[]>(data ?? [])
    },

    async upsert(userId: string, date: string, body: Record<string, any>) {
      // P2#5 FIX: Atomic upsert (race-condition safe)
      const client = await sb()
      const { data, error } = await client
        .from('daily_scores')
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
