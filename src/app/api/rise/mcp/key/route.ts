import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import crypto from 'crypto'

function generateApiKey(): string {
  return 'rise_' + crypto.randomBytes(16).toString('hex')
}

/** POST: Generate a new API key */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }

    const apiKey = generateApiKey()

    await db.userApiKey.create({
      data: {
        userId,
        key: apiKey,
      },
    })

    return NextResponse.json({ apiKey, createdAt: new Date().toISOString() })
  } catch (error) {
    console.error('[mcp/key] POST error:', error)
    return NextResponse.json(
      { error: 'فشل في إنشاء مفتاح API', details: error instanceof Error ? error.message : 'خطأ غير معروف' },
      { status: 500 },
    )
  }
}

/** GET: Get the current user's API key (masked) */
export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }

    const keyRecord = await db.userApiKey.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })

    if (keyRecord?.key) {
      const key = keyRecord.key
      const masked = key.slice(0, 8) + '...' + key.slice(-4)
      return NextResponse.json({ apiKey: masked, hasKey: true })
    }

    return NextResponse.json({ apiKey: null, hasKey: false })
  } catch (error) {
    console.error('[mcp/key] GET error:', error)
    return NextResponse.json({ apiKey: null, hasKey: false })
  }
}

/** DELETE: Revoke the current user's API keys */
export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }

    await db.userApiKey.deleteMany({ where: { userId } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[mcp/key] DELETE error:', error)
    return NextResponse.json({ error: 'فشل في حذف مفتاح API' }, { status: 500 })
  }
}