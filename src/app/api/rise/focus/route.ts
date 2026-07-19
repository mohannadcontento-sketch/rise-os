import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { data, setCurrentAuthToken } from '@/lib/data'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
    if (!userId) return NextResponse.json({ sessions: [], todayMin: 0, totalMin: 0 })

    const sessions = await data.focusSessions.list(userId, 50)

    return NextResponse.json({ sessions })
  } catch (error) {
    console.error('Focus GET error:', error)
    return NextResponse.json({ sessions: [], todayMin: 0, totalMin: 0 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
    if (!userId) return NextResponse.json({ success: true, offline: true })

    const body = await req.json()
    const session = await data.focusSessions.create(userId, body)
    return NextResponse.json(session)
  } catch (error) {
    console.error('Focus POST error:', error)
    return NextResponse.json({ error: 'Failed to create focus session' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
    if (!userId) return NextResponse.json({ success: true, offline: true })

    const { id, ...body } = await req.json()
    const session = await data.focusSessions.update(id, body)
    return NextResponse.json(session)
  } catch (error) {
    console.error('Focus PUT error:', error)
    return NextResponse.json({ error: 'Failed to update focus session' }, { status: 500 })
  }
}