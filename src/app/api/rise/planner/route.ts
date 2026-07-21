import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { data, setCurrentAuthToken } from '@/lib/data'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
    if (!userId) return NextResponse.json({ items: [], linkedTasks: [] })

    const { searchParams } = new URL(req.url)
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0]

    const [items, allTasks] = await Promise.all([
      data.plannerItems.list(userId, date),
      data.tasks.list(userId),
    ])

    // Filter tasks due today with a dueTime (not completed, not cancelled)
    const linkedTasks = allTasks.filter(
      (t: any) => t.dueDate === date && t.dueTime && t.status !== 'done' && t.status !== 'cancelled'
    ).map((t: any) => {
      // Determine section from dueTime hour
      const hour = parseInt(t.dueTime.split(':')[0], 10)
      let section = 'morning'
      if (hour >= 12 && hour < 17) section = 'noon'
      else if (hour >= 17) section = 'evening'

      return {
        id: `task-${t.id}`,
        taskId: t.id,
        title: t.title,
        completed: t.status === 'done',
        time: t.dueTime,
        section,
        order: -1, // linked tasks sort by time, not order
        priority: t.priority,
        projectName: t.project?.name || null,
        projectColor: t.project?.color || null,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        isLinkedTask: true,
      }
    })

    return NextResponse.json({ items, linkedTasks })
  } catch (error) {
    console.error('Planner GET error:', error)
    return NextResponse.json({ items: [], linkedTasks: [] })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
    if (!userId) return NextResponse.json({ success: true, offline: true })

    const body = await req.json()
    const { id, createdAt, updatedAt, userId: _uid, ...dataFields } = body
    const { date, section } = body

    // Get next order for this section/date
    const existing = await data.plannerItems.list(userId, date)
    const maxOrder = existing
      .filter((i: any) => i.section === section)
      .reduce((max: number, i: any) => Math.max(max, i.order ?? 0), -1)
    const nextOrder = maxOrder + 1

    const item = await data.plannerItems.create(userId, { ...dataFields, order: nextOrder })
    return NextResponse.json(item)
  } catch (error) {
    console.error('Planner POST error:', error)
    return NextResponse.json({ error: 'Failed to create planner item' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
    if (!userId) return NextResponse.json({ success: true, offline: true })

    const { id, ...body } = await req.json()
    const item = await data.plannerItems.update(id, body)
    return NextResponse.json(item)
  } catch (error) {
    console.error('Planner PUT error:', error)
    return NextResponse.json({ error: 'Failed to update planner item' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
    if (!userId) return NextResponse.json({ success: true, offline: true })

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 })

    await data.plannerItems.remove(id, userId)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Planner DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete planner item' }, { status: 500 })
  }
}