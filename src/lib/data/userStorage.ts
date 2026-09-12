import { sb, toSnake, toCamel } from './core'

// ============================================================
// data/userStorage.ts — مستودع «حدود التخزين»
//
// متابعة بايتات تخزين المستخدم: get + update — رفع الحد قرار
// إداري يمر عبر /api/rise/admin/storage مع تدقيق logAudit.
// الحساب الفعلي للبايتات يجمعه /api/rise/storage من كل
// المستودعات (14 مستودعاً).
// ============================================================

export const userStorage = {
    async get(userId: string) {
      const client = await sb()
      const { data, error } = await client
        .from('user_storage')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()
      if (error) throw error
      return data ? toCamel(data) : null
    },
    async update(userId: string, body: Record<string, any>) {
      const client = await sb()
      const { data, error } = await client
        .from('user_storage')
        .update(toSnake(body))
        .eq('user_id', userId)
        .select('*')
        .single()
      if (error) throw error
      return toCamel(data)
    },
  }
