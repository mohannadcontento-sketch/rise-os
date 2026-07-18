import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { db } from '@/lib/db'
import { ensureUserExists, handleRouteError } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const userId = await requireAuth(req)
  if (!userId) {
    return NextResponse.json({ projects: [] })
  }

  try {
    const projects = await db.project.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ projects })
  } catch (error) {
    console.error('Projects GET error:', error)
    return NextResponse.json({ projects: [] })
  }
}

export async function POST(req: NextRequest) {
  const userId = await requireAuth(req)
  if (!userId) return handleRouteError(new Error('Unauthorized'), 'projects')

  await ensureUserExists(userId)

  try {
    const body = await req.json()
    const project = await db.project.create({
      data: { userId, ...body },
    })
    return NextResponse.json(project)
  } catch (error) {
    return handleRouteError(error, 'projects')
  }
}

export async function PUT(req: NextRequest) {
  const userId = await requireAuth(req)
  if (!userId) return handleRouteError(new Error('Unauthorized'), 'projects')

  await ensureUserExists(userId)

  try {
    const { id, ...body } = await req.json()
    const project = await db.project.update({
      where: { id },
      data: body,
    })
    return NextResponse.json(project)
  } catch (error) {
    return handleRouteError(error, 'projects')
  }
}

export async function DELETE(req: NextRequest) {
  const userId = await requireAuth(req)
  if (!userId) return handleRouteError(new Error('Unauthorized'), 'projects')

  await ensureUserExists(userId)

  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 })

    await db.project.deleteMany({ where: { id, userId } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleRouteError(error, 'projects')
  }
}