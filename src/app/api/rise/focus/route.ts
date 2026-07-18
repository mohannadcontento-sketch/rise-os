import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { db } from '@/lib/db'
import { ensureUserExists, handleRouteError } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ sessions: [], todayMin: 0, totalMin: 0 })

    const sessions = await db.focusSession.findMany({
      where: { userId },
      orderBy: { startedAt: 'desc' },
      take: 50,
    })

    return NextResponse.json({ sessions })
  } catch (error) {
    console.error('Focus GET error:', error)
    return NextResponse.json({ sessions: [], todayMin: 0, totalMin: 0 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return handleRouteError(new Error('Unauthorized'), 'focus')

    await ensureUserExists(userId)

    const body = await req.json()
    const session = await db.focusSession.create({
      data: { userId, ...body },
    })
    return NextResponse.json(session)
  } catch (error) {
    return handleRouteError(error, 'focus')
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return handleRouteError(new Error('Unauthorized'), 'focus')

    await ensureUserExists(userId)

    const { id, ...body } = await req.json()
    const session = await db.focusSession.update({
      where: { id },
      data: body,
    })
    return NextResponse.json(session)
  } catch (error) {
    return handleRouteError(error, 'focus')
  }
}