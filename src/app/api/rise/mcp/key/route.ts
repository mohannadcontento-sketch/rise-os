import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { data } from '@/lib/data'
import { hashApiKey, isSupabaseConfigured } from '@/lib/supabase'
import crypto from 'crypto'
import { withIdempotency } from '@/lib/idempotency'

export const dynamic = 'force-dynamic'

function generateApiKey(): string {
  return 'rise_' + crypto.randomBytes(16).toString('hex')
}

/** POST: Generate a new API key */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser(req)
    if (!userId) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }

  return withIdempotency(req, userId, async () => {
    const apiKey = generateApiKey()
    const keyHash = await hashApiKey(apiKey)

    if (isSupabaseConfigured()) {
      await data.userApiKeys.create(userId, keyHash, 'MCP Key')
    } else {
      // Local/mock mode: the legacy Prisma `key` field stores only the digest.
      // The plaintext secret is returned once and is never persisted.
      const { db } = await import('@/lib/db')
      await (db as any).userApiKey.create({
        data: {
          userId,
          key: keyHash,
          name: 'MCP Key',
        },
      })
    }

    // Secret is returned once only. It is never stored or retrievable later.
    return NextResponse.json({ apiKey, createdAt: new Date().toISOString() })
  
  }, { persistResponse: false })} catch (error) {
    console.error('[mcp/key] POST error:', error)
    return NextResponse.json({ error: 'فشل في إنشاء مفتاح API' }, { status: 500 })
  }
}

/** GET: Get key metadata only. The secret is never returned after creation. */
export async function GET(req: NextRequest) {
  try {
    const userId = await requireUser(req)
    if (!userId) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }

    if (isSupabaseConfigured()) {
      const keyRecord = await data.userApiKeys.latest(userId)
      return NextResponse.json(keyRecord ? {
        apiKey: null,
        masked: 'rise_••••••••••••',
        hasKey: true,
        name: keyRecord.name || 'MCP Key',
        createdAt: keyRecord.createdAt || null,
        lastUsedAt: keyRecord.lastUsedAt || null,
      } : { apiKey: null, hasKey: false })
    }

    const { db } = await import('@/lib/db')
    const keyRecord = await (db as any).userApiKey.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { key: true, name: true, createdAt: true, lastUsedAt: true },
    })

    return NextResponse.json(keyRecord ? {
      apiKey: null,
      masked: 'rise_••••••••••••',
      hasKey: true,
      name: keyRecord.name || 'MCP Key',
      createdAt: keyRecord.createdAt || null,
      lastUsedAt: keyRecord.lastUsedAt || null,
    } : { apiKey: null, hasKey: false })
  } catch (error) {
    console.error('[mcp/key] GET error:', error)
    return NextResponse.json({ apiKey: null, hasKey: false })
  }
}

/** DELETE: Revoke the current user's API keys */
export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireUser(req)
    if (!userId) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }

  return withIdempotency(req, userId, async () => {
    if (isSupabaseConfigured()) {
      await data.userApiKeys.removeAll(userId)
    } else {
      const { db } = await import('@/lib/db')
      await (db as any).userApiKey.deleteMany({ where: { userId } })
    }

    return NextResponse.json({ success: true })
  
  })} catch (error) {
    console.error('[mcp/key] DELETE error:', error)
    return NextResponse.json({ error: 'فشل في حذف مفتاح API' }, { status: 500 })
  }
}
