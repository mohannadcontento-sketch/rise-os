import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { db } from '@/lib/db'
import { ensureUserExists, handleRouteError } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ items: [] })

    const { searchParams } = new URL(req.url)
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0]

    const items = await db.plannerItem.findMany({
      where: { userId, date },
      orderBy: [{ section: 'asc' }, { order: 'asc' }],
    })

    return NextResponse.json({ items })
  } catch (error) {
    console.error('Planner GET error:', error)
    return NextResponse.json({ items: [] })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return handleRouteError(new Error('Unauthorized'), 'planner')

    await ensureUserExists(userId)

    const body = await req.json()
    const { date, section, title, time } = body

    // Get next order for this section/date
    const maxItem = await db.plannerItem.findFirst({
      where: { userId, date, section },
      orderBy: { order: 'desc' },
    })

    const nextOrder = (maxItem?.order ?? -1) + 1

    const item = await db.plannerItem.create({
      data: {
        userId,
        date,
        section,
        title,
        time: time || null,
        order: nextOrder,
      },
    })

    return NextResponse.json(item)
  } catch (error) {
    return handleRouteError(error, 'planner')
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return handleRouteError(new Error('Unauthorized'), 'planner')

    await ensureUserExists(userId)

    const { id, ...body } = await req.json()

    const item = await db.plannerItem.update({
      where: { id },
      data: body,
    })

    return NextResponse.json(item)
  } catch (error) {
    return handleRouteError(error, 'planner')
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return handleRouteError(new Error('Unauthorized'), 'planner')

    await ensureUserExists(userId)

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 })

    await db.plannerItem.deleteMany({ where: { id, userId } })

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleRouteError(error, 'planner')
  }
}