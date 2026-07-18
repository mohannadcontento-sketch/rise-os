import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { handleRouteError } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ success: true, offline: true })

    const { name } = await req.json()
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const trimmed = name.trim()

    await db.user.update({
      where: { id: userId },
      data: { name: trimmed },
    })

    return NextResponse.json({ name: trimmed })
  } catch (error) {
    return handleRouteError(error, 'user-name')
  }
}