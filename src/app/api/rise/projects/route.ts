import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { data, setCurrentAuthToken } from '@/lib/data'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const userId = await requireAuth(req)
  setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
  if (!userId) {
    return NextResponse.json({ projects: [] })
  }

  try {
    const projects = await data.projects.list(userId)
    return NextResponse.json({ projects })
  } catch (error) {
    console.error('Projects GET error:', error)
    return NextResponse.json({ projects: [] })
  }
}

export async function POST(req: NextRequest) {
  const userId = await requireAuth(req)
  setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
  if (!userId) return NextResponse.json({ success: true, offline: true })

  try {
    const body = await req.json()
    const project = await data.projects.create(userId, body)
    return NextResponse.json(project)
  } catch (error) {
    console.error('Projects POST error:', error)
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const userId = await requireAuth(req)
  setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
  if (!userId) return NextResponse.json({ success: true, offline: true })

  try {
    const { id, ...body } = await req.json()
    const project = await data.projects.update(id, body)
    return NextResponse.json(project)
  } catch (error) {
    console.error('Projects PUT error:', error)
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const userId = await requireAuth(req)
  setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
  if (!userId) return NextResponse.json({ success: true, offline: true })

  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 })

    await data.projects.remove(id, userId)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Projects DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 })
  }
}