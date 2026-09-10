import { sb, toSnake, toCamel } from './core'
import { isSupabaseConfigured } from '@/lib/supabase'
import { db } from '@/lib/db'

export const tasks = {
    async list(userId: string) {
      const client = await sb()

      // FIX: Fetch tasks + projects first (parallel), then fetch subtasks
      // using .in('task_id', taskIds) instead of the nested relation filter
      // .eq('task.user_id', userId) which the mock client doesn't support.
      // This works identically in both Supabase and mock (Prisma) mode.
      const [tasksRes, projectsRes] = await Promise.all([
        client.from('tasks').select('*').eq('user_id', userId).order('order', { ascending: true }),
        client.from('projects').select('id, name, color').eq('user_id', userId),
      ])

      if (tasksRes.error) throw tasksRes.error
      const taskList = tasksRes.data ?? []
      const taskIds = taskList.map((t: any) => t.id)

      // Fetch subtasks for the user's tasks (only if there are tasks)
      let subtasksData: any[] = []
      if (taskIds.length > 0) {
        const subtasksRes = await client
          .from('subtasks')
          .select('*')
          .in('task_id', taskIds)
          .order('order', { ascending: true })
        subtasksData = subtasksRes.data ?? []
      }

      // Build subtask map (group by task_id)
      const subtaskMap = new Map<string, any[]>()
      for (const st of subtasksData) {
        const tid = st.task_id
        if (!subtaskMap.has(tid)) subtaskMap.set(tid, [])
        subtaskMap.get(tid)!.push(st)
      }

      // Build project map
      const projectMap = new Map<string, { name: string; color: string }>()
      for (const p of (projectsRes.data ?? [])) {
        projectMap.set(p.id, { name: p.name, color: p.color })
      }

      return toCamel(
        taskList.map((t: any) => ({
          ...t,
          subtasks: subtaskMap.get(t.id) ?? [],
          project: t.project_id ? projectMap.get(t.project_id) ?? null : null,
        }))
      )
    },

    async create(userId: string, body: Record<string, any>) {
      const { subtasks: stBody, ...taskFields } = body

      if (isSupabaseConfigured()) {
        const client = await sb()
        const { data: result, error } = await (client as any).rpc('create_task_with_subtasks', {
          p_user_id: userId,
          p_task: toSnake(taskFields),
          p_subtasks: toSnake(Array.isArray(stBody) ? stBody : []),
        })
        if (error) throw error
        return toCamel({ ...(result?.task || {}), subtasks: result?.subtasks || [] })
      }

      // Local SQLite: keep task + subtasks atomic as one Prisma transaction.
      const result = await (db as any).$transaction(async (tx: any) => {
        const task = await tx.task.create({ data: toCamel({ ...taskFields, userId }) })
        const rows = Array.isArray(stBody) ? stBody : []
        if (rows.length) {
          await tx.subTask.createMany({
            data: rows.map((s: any, index: number) => toCamel({
              ...s,
              taskId: task.id,
              order: Number.isInteger(s.order) ? s.order : index,
            })),
          })
        }
        return tx.task.findUnique({ where: { id: task.id }, include: { subtasks: { orderBy: { order: 'asc' } } } })
      })
      return toCamel(result)
    },

    async update(id: string, userId: string, body: Record<string, any>) {
      const { subtasks: stBody, ...restBody } = body
      const updateBody: Record<string, any> = { ...restBody }
      if (body.status === 'done') updateBody.completedAt = new Date().toISOString()
      else if (body.status && body.status !== 'done') updateBody.completedAt = null

      if (isSupabaseConfigured()) {
        const client = await sb()
        const { data: result, error } = await (client as any).rpc('update_task_with_subtasks', {
          p_user_id: userId,
          p_task_id: id,
          p_task: toSnake(updateBody),
          p_subtasks: Array.isArray(stBody) ? toSnake(stBody) : null,
        })
        if (error) throw error
        return toCamel({ ...(result?.task || {}), subtasks: result?.subtasks || [] })
      }

      const result = await (db as any).$transaction(async (tx: any) => {
        const existing = await tx.task.findFirst({ where: { id, userId } })
        if (!existing) throw new Error('Task not found or not owned')
        await tx.task.update({ where: { id }, data: toCamel(updateBody) })
        if (Array.isArray(stBody)) {
          await tx.subTask.deleteMany({ where: { taskId: id } })
          if (stBody.length) {
            await tx.subTask.createMany({
              data: stBody.map((s: any, index: number) => toCamel({
                ...s,
                taskId: id,
                order: Number.isInteger(s.order) ? s.order : index,
              })),
            })
          }
        }
        return tx.task.findUnique({ where: { id }, include: { subtasks: { orderBy: { order: 'asc' } } } })
      })
      return toCamel(result)
    },

    async remove(id: string, userId: string) {
      const client = await sb()
      const { error } = await client
        .from('tasks')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)
      if (error) throw error
    },
  }
