import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { data, setCurrentAuthToken } from '@/lib/data'

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
    if (!userId) return NextResponse.json({ records: [], summary: { income: 0, expense: 0, balance: 0 } })

    const records = await data.financeRecords.list(userId)
    return NextResponse.json({ records })
  } catch (error) {
    console.error('Finance GET error:', error)
    return NextResponse.json({ records: [], summary: { income: 0, expense: 0, balance: 0 } })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
    if (!userId) return NextResponse.json({ success: true, offline: true })

    const body = await req.json()
    const { id, createdAt, updatedAt, userId: _uid, ...dataFields } = body
    const record = await data.financeRecords.create(userId, dataFields)
    return NextResponse.json(record)
  } catch (error) {
    console.error('Finance POST error:', error)
    return NextResponse.json({ error: 'Failed to create finance record' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req.headers.get('Authorization')?.replace('Bearer ', ''))
    if (!userId) return NextResponse.json({ success: true, offline: true })

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 })

    await data.financeRecords.remove(id, userId)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Finance DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete finance record' }, { status: 500 })
  }
}