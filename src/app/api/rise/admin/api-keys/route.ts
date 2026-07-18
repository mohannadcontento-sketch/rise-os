import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth'

// GET: List all API keys with user info
export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth(request)
    if (!userId) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }

    const keys = await db.userApiKey.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        user: {
          select: { name: true, email: true },
        },
      },
    })

    const result = keys.map((k) => ({
      id: k.id,
      name: k.name || 'مفتاح بدون اسم',
      userId: k.userId,
      userName: k.user?.name || 'مستخدم محذوف',
      userEmail: k.user?.email || '—',
      keyPreview: k.key.slice(0, 12),
      createdAt: k.createdAt.toISOString(),
      lastUsedAt: k.lastUsedAt?.toISOString() || null,
      usageCount: 0,
    }))

    return NextResponse.json({ keys: result })
  } catch (error) {
    console.error('Admin API keys error:', error)
    return NextResponse.json({ keys: [] })
  }
}

// DELETE: Revoke an API key
export async function DELETE(request: NextRequest) {
  try {
    const userId = await requireAuth(request)
    if (!userId) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const keyId = searchParams.get('id')

    if (!keyId) {
      return NextResponse.json({ error: 'يجب تحديد المفتاح' }, { status: 400 })
    }

    await db.userApiKey.delete({ where: { id: keyId } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Admin API key revoke error:', error)
    return NextResponse.json({ error: 'فشل إلغاء المفتاح' }, { status: 500 })
  }
}