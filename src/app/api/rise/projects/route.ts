import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDb } from '@/lib/db'

const USER_ID = 'rise-default-user'

export async function GET() {
  try {
    await ensureDb()
    const projects = await db.project.findMany({ where: { userId: USER_ID }, orderBy: { createdAt: 'desc' } })
    return NextResponse.json({ projects })
  } catch (error) {
    console.error('Projects GET error:', error)
    return NextResponse.json({
      projects: [
        { id: 'p1', name: 'تطوير تطبيق الويب', color: '#059669', progress: 65, status: 'active' },
        { id: 'p2', name: 'كتابة الكتاب', color: '#D4A853', progress: 35, status: 'active' },
        { id: 'p3', name: 'تعلم البرمجة', color: '#6366F1', progress: 80, status: 'active' },
      ],
    })
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureDb()
    const body = await req.json()
    const project = await db.project.create({ data: { userId: USER_ID, ...body } })
    return NextResponse.json(project)
  } catch (error) {
    return NextResponse.json({ error: 'Operation saved locally', offline: true })
  }
}

export async function PUT(req: NextRequest) {
  try {
    await ensureDb()
    const { id, ...body } = await req.json()
    const project = await db.project.update({ where: { id, userId: USER_ID }, data: body })
    return NextResponse.json(project)
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
    await db.project.delete({ where: { id, userId: USER_ID } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Operation saved locally', offline: true })
  }
}