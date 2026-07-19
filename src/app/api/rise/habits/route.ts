import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { data, setCurrentAuthToken } from '@/lib/data'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
    if (!userId) {
      return NextResponse.json({ habits: [], logs: [] })
    }

    const habitsWithLogs = await data.habits.list(userId)
    const logs = habitsWithLogs.flatMap(h => h.logs)
    const habits = habitsWithLogs.map(({ logs: _l, ...rest }) => rest)

    return NextResponse.json({ habits, logs })
  } catch (error) {
    console.error('Habits GET error:', error)
    return NextResponse.json({ habits: [], logs: [] })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const habit = await data.habits.create(userId, body)
    return NextResponse.json(habit)
  } catch (error) {
    console.error('Habits POST error:', error)
    return NextResponse.json({ error: 'Failed to create habit' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()

    // Habit log toggle (from frontend habit toggle)
    if (body.habitId && body.date !== undefined) {
      const log = await data.habits.toggleLog(
        body.habitId,
        body.date,
        body.completed,
        body.count !== undefined ? body.count : 1,
      )
      return NextResponse.json(log)
    }

    // Normal habit update
    const { id, ...updateBody } = body
    const habit = await data.habits.update(id, updateBody)
    return NextResponse.json(habit)
  } catch (error) {
    console.error('Habits PUT error:', error)
    return NextResponse.json({ error: 'Failed to update habit' }, { status: 500 })
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

    await data.habits.remove(id, userId)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Habits DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete habit' }, { status: 500 })
  }
}