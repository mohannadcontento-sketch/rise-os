import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDb } from '@/lib/db'

const USER_ID = 'rise-default-user'

export async function GET() {
  try {
    await ensureDb()
    const books = await db.book.findMany({ where: { userId: USER_ID }, orderBy: { createdAt: 'desc' } })
    return NextResponse.json({ books })
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureDb()
    const body = await req.json()
    const book = await db.book.create({ data: { userId: USER_ID, ...body } })
    return NextResponse.json(book)
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    await ensureDb()
    const { id, ...body } = await req.json()
    const book = await db.book.update({ where: { id, userId: USER_ID }, data: body })
    return NextResponse.json(book)
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}