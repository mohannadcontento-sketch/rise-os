'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiFetch, apiPost, apiPut, apiDelete } from '@/lib/api-fetch'
import { useDataRefresh } from '@/hooks/use-data-refresh'
import { getToday } from '@/lib/rise-utils'
import { notifyTaskComplete } from '@/lib/notifications'
import { playSound } from '@/lib/sounds'
import { toast } from 'sonner'
import { toastError, toastCreated } from '@/lib/toast-helpers'

export interface SubTask {
  id: string
  title: string
  completed: boolean
}

export interface Task {
  id: string
  title: string
  description?: string | null
  status: string
  priority: string
  label?: string | null
  projectId?: string | null
  project?: { name: string; color: string } | null
  dueDate?: string | null
  dueTime?: string | null
  xpReward: number
  completedAt?: string | null
  subtasks: SubTask[]
  order: number
  dependsOn?: string | null
}

export interface Project {
  id: string
  name: string
  color: string
}

interface CreateTaskInput {
  title: string
  description?: string | null
  priority: string
  projectId?: string | null
  dueDate?: string | null
  dueTime?: string | null
  dependsOn?: string | null
}

interface UseTasksControllerOptions {
  scope: 'mine' | 'projects'
  filterPriority: string
  filterProject: string
  filterStatus: string
  searchQuery: string
}

export function useTasksController({
  scope,
  filterPriority,
  filterProject,
  filterStatus,
  searchQuery,
}: UseTasksControllerOptions) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchFailed, setFetchFailed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const xpAwardedRef = useRef<Set<string>>(new Set())
  const { refreshKey } = useDataRefresh()

  const fetchData = useCallback(async () => {
    try {
      const res = await apiFetch('/api/rise/tasks')
      if (!res.ok) {
        setFetchFailed(true)
        return
      }
      const payload = await res.json()
      setFetchFailed(false)
      setTasks(Array.isArray(payload.tasks) ? payload.tasks : [])
      setProjects(Array.isArray(payload.projects) ? payload.projects : [])
    } catch {
      setFetchFailed(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData, refreshKey])

  const awardXpOnce = useCallback((key: string, amount: number, reason: string) => {
    if (xpAwardedRef.current.has(key)) return
    xpAwardedRef.current.add(key)
    apiPost('/api/rise/earn-xp', { amount, reason }).catch(() => {})
  }, [])

  const checkUnblockedTasks = useCallback((completedTaskId: string) => {
    const unblocked = tasks.filter((task) => {
      if (!task.dependsOn || task.status === 'done') return false
      const deps = task.dependsOn.split(',').filter(Boolean)
      if (!deps.includes(completedTaskId)) return false
      return deps.every((depId) => tasks.find((dep) => dep.id === depId)?.status === 'done')
    })

    if (unblocked.length > 0) {
      toast.success('🔓 تم فتح مهام محظورة', {
        description: unblocked.map((task) => task.title).join('، '),
        duration: 4000,
      })
    }
  }, [tasks])

  const dispatchInstant = useCallback((task: Task, nowDone: boolean) => {
    const detail: Record<string, number | string> = { type: 'task' }
    const today = getToday()
    if (task.dueDate === today) {
      detail.deltaCompleted = nowDone ? 1 : -1
    } else if (!task.dueDate) {
      detail.deltaCompleted = nowDone ? 1 : -1
      detail.deltaTotal = nowDone ? 1 : -1
    } else if (task.dueDate < today) {
      detail.overdueDelta = nowDone ? -1 : 1
    }
    window.dispatchEvent(new CustomEvent('rise:instant-update', { detail }))
  }, [])

  const isTaskBlocked = useCallback((task: Task): boolean => {
    if (!task.dependsOn) return false
    return task.dependsOn.split(',').filter(Boolean).some((depId) => {
      const depTask = tasks.find((candidate) => candidate.id === depId)
      return !!depTask && depTask.status !== 'done'
    })
  }, [tasks])

  const scopedTasks = useMemo(
    () => scope === 'mine' ? tasks.filter((task) => !task.projectId) : tasks.filter((task) => !!task.projectId),
    [tasks, scope],
  )

  const filteredTasks = useMemo(() => scopedTasks.filter((task) => {
    if (filterPriority !== 'all' && task.priority !== filterPriority) return false
    if (scope === 'projects' && filterProject !== 'all' && task.projectId !== filterProject) return false
    if (filterStatus === 'blocked') return isTaskBlocked(task)
    if (filterStatus !== 'all' && task.status !== filterStatus) return false
    if (searchQuery && !task.title.includes(searchQuery) && !task.description?.includes(searchQuery)) return false
    return true
  }), [scopedTasks, filterPriority, filterProject, filterStatus, searchQuery, isTaskBlocked, scope])

  const groupedTasks = useMemo(() => {
    const groups: Record<string, Task[]> = { todo: [], in_progress: [], done: [] }
    for (const task of filteredTasks) {
      if (groups[task.status]) groups[task.status].push(task)
    }
    return groups
  }, [filteredTasks])

  const toggleTask = useCallback(async (task: Task) => {
    const isDone = task.status === 'done'
    const newStatus = isDone ? 'todo' : 'done'
    setTasks((prev) => prev.map((item) => item.id === task.id ? { ...item, status: newStatus } : item))
    if (!isDone) {
      playSound('task-complete')
      notifyTaskComplete(task.title, task.xpReward)
      awardXpOnce(`task-done:${task.id}`, task.xpReward || 10, `task:${task.id}`)
      checkUnblockedTasks(task.id)
    }
    dispatchInstant(task, !isDone)

    try {
      const res = await apiPut('/api/rise/tasks', {
        id: task.id,
        status: newStatus,
        completedAt: !isDone ? new Date().toISOString() : null,
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        setTasks((prev) => prev.map((item) => item.id === task.id ? { ...item, status: task.status } : item))
        dispatchInstant(task, isDone)
        toastError('تحديث المهمة', errData.error || errData.details || 'حاول مرة أخرى')
        await fetchData()
      }
    } catch {
      setTasks((prev) => prev.map((item) => item.id === task.id ? { ...item, status: task.status } : item))
      toastError('تحديث المهمة')
    }
  }, [awardXpOnce, checkUnblockedTasks, dispatchInstant, fetchData])

  const moveTask = useCallback(async (task: Task, newStatus: string) => {
    const oldStatus = task.status
    if (oldStatus === newStatus) return
    setTasks((prev) => prev.map((item) => item.id === task.id ? { ...item, status: newStatus } : item))
    const nowDone = newStatus === 'done'
    if (nowDone) {
      playSound('task-complete')
      awardXpOnce(`task-done:${task.id}`, task.xpReward || 10, `task:${task.id}`)
      checkUnblockedTasks(task.id)
    }
    dispatchInstant(task, nowDone)
    try {
      const res = await apiPut('/api/rise/tasks', {
        id: task.id,
        status: newStatus,
        completedAt: nowDone ? new Date().toISOString() : null,
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        setTasks((prev) => prev.map((item) => item.id === task.id ? { ...item, status: oldStatus } : item))
        dispatchInstant(task, oldStatus === 'done')
        toastError('تحديث المهمة', errData.error || errData.details || 'حاول مرة أخرى')
        await fetchData()
      }
    } catch {
      setTasks((prev) => prev.map((item) => item.id === task.id ? { ...item, status: oldStatus } : item))
      toastError('تحديث المهمة')
    }
  }, [awardXpOnce, checkUnblockedTasks, dispatchInstant, fetchData])

  const deleteTask = useCallback(async (taskId: string) => {
    playSound('delete')
    try {
      const res = await apiDelete(`/api/rise/tasks?id=${taskId}`)
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload.error || `HTTP ${res.status}`)
      }
      toast.success('تم حذف المهمة بنجاح')
    } catch (error) {
      toastError('حذف المهمة', error instanceof Error ? error.message : 'حاول مرة أخرى')
    }
  }, [])

  const toggleSubtask = useCallback(async (task: Task, subtaskId: string, completed: boolean) => {
    const updatedSubtasks = task.subtasks.map((subtask) => subtask.id === subtaskId ? { ...subtask, completed: !completed } : subtask)
    try {
      const res = await apiPut('/api/rise/tasks', {
        id: task.id,
        subtasks: updatedSubtasks.map((subtask) => ({ id: subtask.id, title: subtask.title, completed: subtask.completed })),
      })
      if (res.ok) await fetchData()
    } catch {
      // Preserve optimistic UI and let the regular refresh cycle reconcile state.
    }
  }, [fetchData])

  const createTask = useCallback(async (input: CreateTaskInput) => {
    if (!input.title.trim()) return false
    setSubmitting(true)
    try {
      const res = await apiPost('/api/rise/tasks', {
        title: input.title.trim(),
        description: input.description?.trim() || null,
        priority: input.priority,
        ...(input.projectId ? { projectId: input.projectId } : {}),
        dueDate: input.dueDate || null,
        dueTime: input.dueTime || null,
        ...(input.dependsOn ? { dependsOn: input.dependsOn } : {}),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        toast.error('فشلت إضافة المهمة', { description: errData.error || errData.details || 'حاول مرة أخرى' })
        return false
      }
      const result = await res.json().catch(() => ({}))
      if (result.offline || (result.success === true && !result.id && !result.requestId)) {
        toast.error('فشل الاتصال بالخادم', { description: 'يرجى إعادة تسجيل الدخول' })
        return false
      }
      toastCreated('المهمة')
      await fetchData()
      return true
    } catch {
      toast.error('حدث خطأ أثناء الحفظ')
      return false
    } finally {
      setSubmitting(false)
    }
  }, [fetchData])

  return {
    tasks,
    projects,
    loading,
    fetchFailed,
    submitting,
    refresh: fetchData,
    scopedTasks,
    filteredTasks,
    groupedTasks,
    isTaskBlocked,
    projectTasksCount: useMemo(() => tasks.filter((task) => !!task.projectId).length, [tasks]),
    toggleTask,
    moveTask,
    deleteTask,
    toggleSubtask,
    createTask,
  }
}
