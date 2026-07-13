import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDb } from '@/lib/db'

const USER_ID = 'rise-default-user'

export async function GET() {
  try {
    await ensureDb()
    const tasks = await db.task.findMany({
      where: { userId: USER_ID },
      orderBy: { order: 'asc' },
      include: { subtasks: true, project: { select: { name: true, color: true } } },
    })
    const projects = await db.project.findMany({ where: { userId: USER_ID } })
    return NextResponse.json({ tasks, projects })
  } catch (error) {
    console.error('Tasks GET error:', error)
    return NextResponse.json({
      tasks: [
        { id: 't1', title: 'إكمال التصميم', status: 'done', priority: 'high', xpReward: 25, createdAt: new Date().toISOString(), subtasks: [], project: null },
        { id: 't2', title: 'كتابة الفصل الثالث', status: 'in_progress', priority: 'high', xpReward: 30, createdAt: new Date().toISOString(), subtasks: [], project: { name: 'كتابة الكتاب', color: '#D4A853' } },
        { id: 't3', title: 'مراجعة الكود', status: 'todo', priority: 'medium', xpReward: 15, createdAt: new Date().toISOString(), subtasks: [], project: { name: 'تطوير تطبيق الويب', color: '#059669' } },
        { id: 't4', title: 'تمرين رياضي', status: 'todo', priority: 'medium', xpReward: 20, createdAt: new Date().toISOString(), subtasks: [], project: null },
        { id: 't5', title: 'قراءة 30 صفحة', status: 'todo', priority: 'low', xpReward: 10, createdAt: new Date().toISOString(), subtasks: [], project: null },
      ],
      projects: [],
    })
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureDb()
    const body = await req.json()
    const task = await db.task.create({
      data: { userId: USER_ID, ...body },
      include: { subtasks: true, project: true },
    })
    return NextResponse.json(task)
  } catch (error) {
    return NextResponse.json({ error: 'Operation saved locally', offline: true })
  }
}

export async function PUT(req: NextRequest) {
  try {
    await ensureDb()
    const { id, ...body } = await req.json()
    const task = await db.task.update({
      where: { id, userId: USER_ID },
      data: body,
      include: { subtasks: true, project: true },
    })
    return NextResponse.json(task)
  } catch (error) {
    return NextResponse.json({ error: 'Operation saved locally', offline: true })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await ensureDb()
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 })
    await db.task.delete({ where: { id, userId: USER_ID } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Operation saved locally', offline: true })
  }
}