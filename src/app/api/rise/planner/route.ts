import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { data, setCurrentAuthToken } from '@/lib/data'

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
    if (!userId) return NextResponse.json({ items: [] })

    const { searchParams } = new URL(req.url)
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0]

    const items = await data.plannerItems.list(userId, date)
    return NextResponse.json({ items })
  } catch (error) {
    console.error('Planner GET error:', error)
    return NextResponse.json({ items: [] })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { date, section } = body

    // Get next order for this section/date
    const existing = await data.plannerItems.list(userId, date)
    const maxOrder = existing
      .filter((i: any) => i.section === section)
      .reduce((max: number, i: any) => Math.max(max, i.order ?? 0), -1)
    const nextOrder = maxOrder + 1

    const item = await data.plannerItems.create(userId, { ...body, order: nextOrder })
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
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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