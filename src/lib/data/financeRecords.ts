import { sb, toSnake, toCamel } from './core'

// ============================================================
// data/financeRecords.ts — مستودع «المالية»
//
// معاملات المستخدم على finance_records: قائمة بالأحدث أولاً،
// إنشاء، وحذف — بلا تحديث (التعديل من الواجهة = حذف ثم إنشاء).
// كل عملية مقيدة بـ user_id (RLS + فلتر صريح).
// ============================================================

export const financeRecords = {
    async list(userId: string) {
      const client = await sb()
      const { data, error } = await client
        .from('finance_records')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false })
      if (error) throw error
      return toCamel<any[]>(data ?? [])
    },

    async create(userId: string, body: Record<string, any>) {
      const client = await sb()
      const { data, error } = await client
        .from('finance_records')
        .insert(toSnake({ ...body, userId }))
        .select()
        .single()
      if (error) throw error
      return toCamel(data)
    },

    async remove(id: string, userId: string) {
      const client = await sb()
      const { error } = await client
        .from('finance_records')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)
      if (error) throw error
    },
  }
