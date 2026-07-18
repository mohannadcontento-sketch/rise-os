import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { data } from '@/lib/data'

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) {
      return NextResponse.json({ goals: [] })
    }

    const goals = await data.goals.list(userId)
    return NextResponse.json({ goals })
  } catch (error) {
    console.error('Goals GET error:', error)
    return NextResponse.json({ goals: [] })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const goal = await data.goals.create(userId, body)
    return NextResponse.json(goal)
  } catch (error) {
    console.error('Goals POST error:', error)
    return NextResponse.json({ error: 'Failed to create goal' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()

    // Milestone toggle
    if (body.milestoneId) {
      const updated = await data.goals.toggleMilestone(body.milestoneId, body.completed)
      return NextResponse.json(updated)
    }

    const { id, ...updateBody } = body
    const goal = await data.goals.update(id, updateBody)
    return NextResponse.json(goal)
  } catch (error) {
    console.error('Goals PUT error:', error)
    return NextResponse.json({ error: 'Failed to update goal' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 })

    await data.goals.remove(id, userId)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Goals DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete goal' }, { status: 500 })
  }
}