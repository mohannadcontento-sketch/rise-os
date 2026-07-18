import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { data } from '@/lib/data'

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ items: [] })

    const items = await data.knowledgeItems.list(userId)
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

    const body = await req.json()
    const { id, createdAt, updatedAt, userId: _uid, ...dataFields } = body
    const record = await data.knowledgeItems.create(userId, dataFields)
    return NextResponse.json(record)
  } catch (error) {
    console.error('Knowledge POST error:', error)
    return NextResponse.json({ error: 'Failed to create knowledge item' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ success: true, offline: true })

    const { id, createdAt, updatedAt, userId: _uid, ...body } = await req.json()
    if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 })

    const record = await data.knowledgeItems.update(id, body)
    return NextResponse.json(record)
  } catch (error) {
    console.error('Knowledge PUT error:', error)
    return NextResponse.json({ error: 'Failed to update knowledge item' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ success: true, offline: true })

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 })

    await data.knowledgeItems.remove(id, userId)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Knowledge DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete knowledge item' }, { status: 500 })
  }
}