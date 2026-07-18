import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { ensureUserExists, handleRouteError } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ items: [] })

    const items = await db.knowledgeItem.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    })

    return NextResponse.json({ items })
  } catch (error) {
    console.error('Knowledge GET error:', error)
    return NextResponse.json({ items: [] })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ success: true, offline: true })
    await ensureUserExists(userId)

    const body = await req.json()
    const { id, createdAt, updatedAt, userId: _uid, ...data } = body
    const record = await db.knowledgeItem.create({
      data: { userId, ...data },
    })
    return NextResponse.json(record)
  } catch (error) {
    return handleRouteError(error, 'knowledge')
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ success: true, offline: true })
    await ensureUserExists(userId)

    const { id, createdAt, updatedAt, userId: _uid, ...body } = await req.json()
    if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 })

    const record = await db.knowledgeItem.update({
      where: { id },
      data: body,
    })
    return NextResponse.json(record)
  } catch (error) {
    return handleRouteError(error, 'knowledge')
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ success: true, offline: true })
    await ensureUserExists(userId)

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 })

    await db.knowledgeItem.deleteMany({
      where: { id, userId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleRouteError(error, 'knowledge')
  }
}