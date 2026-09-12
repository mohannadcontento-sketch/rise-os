import { sb, toSnake, toCamel } from './core'

// ============================================================
// data/knowledgeItems.ts — مستودع «عناصر المعرفة»
//
// يخدم وحدتي «التعلم» و«الدماغ الثاني» من جدول knowledge_items
// موحّد (الحقل type هو الفاصل): CRUD عام + upsertByType أحادي
// الصف مع معالجة سباق كتابة متزامنة (إعادة قراءة الصف الفائز
// والتحديث عليه بدل الفشل).
// ============================================================

export const knowledgeItems = {
    async getByType(userId: string, type: string) {
      const client = await sb()
      const { data, error } = await client
        .from('knowledge_items')
        .select('*')
        .eq('user_id', userId)
        .eq('type', type)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data ? toCamel(data) : null
    },

    async upsertByType(userId: string, type: string, title: string, content: string) {
      const client = await sb()
      const existing = await this.getByType(userId, type)
      if (existing?.id) {
        const { data, error } = await client
          .from('knowledge_items')
          .update({ content })
          .eq('id', existing.id)
          .eq('user_id', userId)
          .select('*')
          .single()
        if (error) throw error
        return toCamel(data)
      }

      const { data, error } = await client
        .from('knowledge_items')
        .insert({ user_id: userId, type, title, content })
        .select('*')
        .single()
      if (!error) return toCamel(data)

      // Another concurrent writer may have created the singleton between the
      // read and insert. Re-read the winning row and update it.
      const winner = await this.getByType(userId, type)
      if (winner?.id) {
        const { data: updated, error: updateError } = await client
          .from('knowledge_items')
          .update({ content })
          .eq('id', winner.id)
          .eq('user_id', userId)
          .select('*')
          .single()
        if (!updateError) return toCamel(updated)
      }
      throw error
    },

    async list(userId: string) {
      const client = await sb()
      const { data, error } = await client
        .from('knowledge_items')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
      if (error) throw error
      return toCamel<any[]>(data ?? [])
    },

    async create(userId: string, body: Record<string, any>) {
      const client = await sb()
      const { data, error } = await client
        .from('knowledge_items')
        .insert(toSnake({ ...body, userId }))
        .select()
        .single()
      if (error) throw error
      return toCamel(data)
    },

    async update(id: string, userId: string, body: Record<string, any>) {
      const client = await sb()
      const { data, error } = await client
        .from('knowledge_items')
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
        .from('knowledge_items')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)
      if (error) throw error
    },
  }
