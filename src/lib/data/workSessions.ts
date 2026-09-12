import { sb, toSnake, toCamel } from './core'

// ============================================================
// data/workSessions.ts — مستودع «جلسات الشغل»
//
// جلسات العمل الطويلة لوحدة work: list (آخر 50) + get +
// create + update — درجة جودة الجلسة تُحسب عند الإتمام
// (45/35/20) وتُمرَّر ضمن body. كل عملية مقيدة بالملكية.
// ============================================================

export const workSessions = {
    async list(userId: string, limit = 50) {
      const client = await sb()
      const { data, error } = await client
        .from('work_sessions')
        .select('*')
        .eq('user_id', userId)
        .order('started_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return toCamel<any[]>(data ?? [])
    },

    async get(id: string, userId: string) {
      const client = await sb()
      const { data, error } = await client
        .from('work_sessions')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single()
      if (error) throw error
      return toCamel(data)
    },

    async create(userId: string, body: Record<string, any>) {
      const client = await sb()
      const { data, error } = await client
        .from('work_sessions')
        .insert(toSnake({ ...body, userId }))
        .select()
        .single()
      if (error) throw error
      return toCamel(data)
    },

    async update(id: string, userId: string, body: Record<string, any>) {
      const client = await sb()
      const { data, error } = await client
        .from('work_sessions')
        .update(toSnake(body))
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single()
      if (error) throw error
      return toCamel(data)
    },
  }
