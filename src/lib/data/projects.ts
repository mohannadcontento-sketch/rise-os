import { sb, toSnake, toCamel } from './core'

// ============================================================
// data/projects.ts — مستودع «المشاريع»
//
// CRUD قياسي على projects: قائمة بالأحدث، إنشاء، تحديث، حذف —
// كل عملية بفلتر user_id صريح فوق RLS. المهام ترتبط عبر
// project_id ويعيدها مستودع tasks مضمنة مع كل مهمة.
// ============================================================

export const projects = {
    async list(userId: string) {
      const client = await sb()
      const { data: rows, error } = await client
        .from('projects')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return toCamel<any[]>(rows ?? [])
    },

    async create(userId: string, body: Record<string, any>) {
      const client = await sb()
      const row = toSnake({ ...body, userId })
      const { data, error } = await client
        .from('projects')
        .insert(row)
        .select()
        .single()
      if (error) throw error
      return toCamel(data)
    },

    async update(id: string, userId: string, body: Record<string, any>) {
      const client = await sb()
      const { data, error } = await client
        .from('projects')
        .update(toSnake(body))
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single()
      if (error) throw error
      return toCamel(data)
    },

    async remove(id: string, userId: string) {
      const client = await sb()
      const { error } = await client
        .from('projects')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)
      if (error) throw error
    },
  }
