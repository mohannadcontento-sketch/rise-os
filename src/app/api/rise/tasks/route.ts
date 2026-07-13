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
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
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
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
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
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
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
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}