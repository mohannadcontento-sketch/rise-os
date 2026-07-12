import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const USER_ID = 'rise-default-user'

export async function GET() {
  try {
    const books = await db.book.findMany({ where: { userId: USER_ID }, orderBy: { createdAt: 'desc' } })
    return NextResponse.json({ books })
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const book = await db.book.create({ data: { userId: USER_ID, ...body } })
    return NextResponse.json(book)
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { id, ...body } = await req.json()
    const book = await db.book.update({ where: { id, userId: USER_ID }, data: body })
    return NextResponse.json(book)
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}