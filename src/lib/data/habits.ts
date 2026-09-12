import { sb, toSnake, toCamel } from './core'

// ============================================================
// data/habits.ts — مستودع «العادات»
//
// CRUD العادات + سجلات آخر 30 يوماً مدمجة داخل list (تجميع
// خريطة habit→logs). toggleLog ذري: upsert على (habit_id, date)
// بعد التحقق أن العادة ملك للمستخدم — يحصّن ضد النقر المتزامن
// وضد انتحال معرف غريب.
// ============================================================

export const habits = {
    async list(userId: string) {
      const client = await sb()

      const { data: habits, error } = await client
        .from('habits')
        .select('*')
        .eq('user_id', userId)
      if (error) throw error

      const habitList = habits ?? []
      const habitIds = habitList.map((h: any) => h.id)

      // Fetch logs for the last 30 days
      let logRows: any[] = []
      if (habitIds.length > 0) {
        const thirtyAgo = new Date()
        thirtyAgo.setDate(thirtyAgo.getDate() - 30)
        const dateStr = thirtyAgo.toISOString().split('T')[0]

        const { data: logs } = await client
          .from('habit_logs')
          .select('*')
          .in('habit_id', habitIds)
          .gte('date', dateStr)
        logRows = logs ?? []
      }

      const logMap = new Map<string, any[]>()
      for (const log of logRows) {
        const hid = log.habit_id
        if (!logMap.has(hid)) logMap.set(hid, [])
        logMap.get(hid)!.push(log)
      }

      return toCamel(
        habitList.map((h: any) => ({
          ...h,
          logs: logMap.get(h.id) ?? [],
        })),
      )
    },

    async create(userId: string, body: Record<string, any>) {
      const client = await sb()
      const { data, error } = await client
        .from('habits')
        .insert(toSnake({ ...body, userId }))
        .select()
        .single()
      if (error) throw error
      return toCamel({ ...data, logs: [] })
    },

    async update(id: string, userId: string, body: Record<string, any>) {
      const client = await sb()
      const { data, error } = await client
        .from('habits')
        .update(toSnake(body))
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single()
      if (error) throw error
      return toCamel(data)
    },

    async toggleLog(habitId: string, userId: string, date: string, completed: boolean, count: number) {
      // P2#5 FIX: Atomic upsert (race-condition safe)
      // FIX: Verify the habit belongs to the user before toggling log
      const client = await sb()
      const { data: habit } = await client
        .from('habits')
        .select('id')
        .eq('id', habitId)
        .eq('user_id', userId)
        .maybeSingle()
      if (!habit) throw new Error('Habit not found or not owned by user')
      const { data, error } = await client
        .from('habit_logs')
        .upsert(
          { habit_id: habitId, date, completed, count },
          { onConflict: 'habit_id,date' }
        )
        .select()
        .single()
      if (error) throw error
      return toCamel(data)
    },

    async remove(id: string, userId: string) {
      const client = await sb()
      const { error } = await client
        .from('habits')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)
      if (error) throw error
    },
  }
