import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const USER_ID = 'rise-default-user'

export async function GET() {
  try {
    const items = await db.knowledgeItem.findMany({ where: { userId: USER_ID }, orderBy: { updatedAt: 'desc' } })
    return NextResponse.json({ items })
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const item = await db.knowledgeItem.create({ data: { userId: USER_ID, ...body } })
    return NextResponse.json(item)
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { id, ...body } = await req.json()
    const item = await db.knowledgeItem.update({ where: { id, userId: USER_ID }, data: body })
    return NextResponse.json(item)
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 })
    await db.knowledgeItem.delete({ where: { id, userId: USER_ID } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}