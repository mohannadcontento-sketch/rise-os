import { sb, toSnake, toCamel } from './core'

// ============================================================
// data/habitLogs.ts — مستودع «سجلات العادات»
//
// قراءة فقط: كل سجلات عادات المستخدم مرتبة زمنياً، بجلب
// مستوٍين — معرفات عادات المستخدم أولاً ثم سجلاتها بنمط .in
// (بدل الفلترة المتشعبة .eq('task.user_id') غير المدعومة في
// وضع mock). الكتابة تجري في habits.toggleLog المجاور.
// ============================================================

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
