import { sb, toSnake, toCamel } from './core'
import { isSupabaseConfigured } from '@/lib/supabase'
import { db } from '@/lib/db'

// ============================================================
// data/goals.ts — مستودع «الأهداف»
//
// أهداف المستخدم ومحطاتها: list يجلب كل هدف مع محطاته مرتبة،
// وaddMilestone/toggleMilestone يتحققان من الملكية أولاً. قلب
// المحطة في Supabase ذري عبر RPC toggle_goal_milestone_atomic
// (يعيد حساب progress داخل المعاملة نفسها)؛ وفي وضع dev
// المحلي (Prisma/SQLite) المنطق ذاته بمعاملة $transaction.
// ============================================================

export const goals = {
    async list(userId: string) {
      const client = await sb()

      const { data: goals, error } = await client
        .from('goals')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      if (error) throw error

      const goalList = goals ?? []
      const goalIds = goalList.map((g: any) => g.id)

      // Fetch milestones for these goals
      let milestoneRows: any[] = []
      if (goalIds.length > 0) {
        const { data: ms } = await client
          .from('milestones')
          .select('*')
          .in('goal_id', goalIds)
          .order('order', { ascending: true })
        milestoneRows = ms ?? []
      }

      const msMap = new Map<string, any[]>()
      for (const m of milestoneRows) {
        const gid = m.goal_id
        if (!msMap.has(gid)) msMap.set(gid, [])
        msMap.get(gid)!.push(m)
      }

      return toCamel(
        goalList.map((g: any) => ({
          ...g,
          milestones: msMap.get(g.id) ?? [],
        })),
      )
    },

    async create(userId: string, body: Record<string, any>) {
      const client = await sb()
      const { data, error } = await client
        .from('goals')
        .insert(toSnake({ ...body, userId }))
        .select()
        .single()
      if (error) throw error
      return toCamel({ ...data, milestones: [] })
    },

    async addMilestone(goalId: string, userId: string, title: string) {
      const client = await sb()
      // FIX: Verify the goal belongs to the user before adding a milestone
      const { data: goal } = await client
        .from('goals')
        .select('id')
        .eq('id', goalId)
        .eq('user_id', userId)
        .maybeSingle()
      if (!goal) throw new Error('Goal not found or not owned by user')
      const { data, error } = await client
        .from('milestones')
        .insert(toSnake({ goalId, title }))
        .select()
        .single()
      if (error) throw error
      return toCamel(data)
    },

    async update(id: string, userId: string, body: Record<string, any>) {
      const client = await sb()
      const { data, error } = await client
        .from('goals')
        .update(toSnake(body))
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single()
      if (error) throw error
      return toCamel(data)
    },

    async toggleMilestone(milestoneId: string, userId: string, completed: boolean) {
      if (isSupabaseConfigured()) {
        const client = await sb()
        const { data: result, error } = await (client as any).rpc('toggle_goal_milestone_atomic', {
          p_user_id: userId,
          p_milestone_id: milestoneId,
          p_completed: completed,
        })
        if (error) throw error
        return toCamel(result?.milestone || result)
      }

      const result = await (db as any).$transaction(async (tx: any) => {
        const milestone = await tx.milestone.findFirst({
          where: { id: milestoneId, goal: { userId } },
        })
        if (!milestone) throw new Error('Milestone not found or not owned')
        const updated = await tx.milestone.update({
          where: { id: milestoneId },
          data: { completed },
        })
        const milestones = await tx.milestone.findMany({ where: { goalId: milestone.goalId } })
        const progress = milestones.length > 0
          ? Math.round((milestones.filter((m: any) => m.completed).length / milestones.length) * 100)
          : 0
        await tx.goal.update({
          where: { id: milestone.goalId },
          data: { progress, status: progress === 100 ? 'done' : 'active' },
        })
        return updated
      })
      return toCamel(result)
    },

    async remove(id: string, userId: string) {
      const client = await sb()
      const { error } = await client
        .from('goals')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)
      if (error) throw error
    },
  }
