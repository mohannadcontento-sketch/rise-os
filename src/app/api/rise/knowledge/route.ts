import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { data, setCurrentAuthToken } from '@/lib/data'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req)
    if (!userId) return NextResponse.json({ items: [] })

    const items = await data.knowledgeItems.list(userId)
    // Support optional type filter: ?type=learning
    const typeFilter = req.nextUrl.searchParams.get('type')
    const filtered = typeFilter
      ? items.filter((i: any) => String(i.type || '').startsWith(typeFilter))
      : items
    return NextResponse.json({ items: filtered })
  } catch (error) {
    console.error('Knowledge GET error:', error)
    return NextResponse.json({ items: [] })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

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
    setCurrentAuthToken(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

    const { id, createdAt, updatedAt, userId: _uid, ...body } = await req.json()
    if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 })

    const record = await data.knowledgeItems.update(id, userId, body)
    return NextResponse.json(record)
  } catch (error) {
    console.error('Knowledge PUT error:', error)
    return NextResponse.json({ error: 'Failed to update knowledge item' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

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