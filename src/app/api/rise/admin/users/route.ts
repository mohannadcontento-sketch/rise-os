import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { ADMIN_EMAIL } from '@/lib/supabase'

// GET all users
export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth(request)
    if (!userId) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }

    const users = await db.user.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        storage: true,
        aiUsage: true,
      },
    })

    const mergedUsers = users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      createdAt: u.createdAt.toISOString(),
      isAdmin: u.email === ADMIN_EMAIL,
      storageUsed: u.storage?.storageUsed || 0,
      storageLimit: u.storage?.storageLimit || 10485760,
      aiLimit: u.storage?.aiLimit || 100,
      aiUsed: u.aiUsage?.monthlyUsed || 0,
    }))

    return NextResponse.json({ users: mergedUsers })
  } catch (error) {
    console.error('Admin users error:', error)
    return NextResponse.json({ users: [] })
  }
}

// POST — update user limits
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request)
    if (!userId) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }

    const { userId: targetUserId, storageLimit, aiLimit, role } = await request.json()

    if (!targetUserId) {
      return NextResponse.json({ error: 'يجب تحديد المستخدم' }, { status: 400 })
    }

    // Verify target user exists
    const targetUser = await db.user.findUnique({ where: { id: targetUserId } })
    if (!targetUser) {
      return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 })
    }

    // Upsert UserStorage
    const existingStorage = await db.userStorage.findUnique({ where: { userId: targetUserId } })
    if (existingStorage) {
      await db.userStorage.update({
        where: { userId: targetUserId },
        data: {
          ...(storageLimit !== undefined ? { storageLimit } : {}),
          ...(aiLimit !== undefined ? { aiLimit } : {}),
          ...(role !== undefined ? { role } : {}),
        },
      })
    } else {
      await db.userStorage.create({
        data: {
          userId: targetUserId,
          email: targetUser.email,
          name: targetUser.name,
          storageLimit: storageLimit ?? 10485760,
          aiLimit: aiLimit ?? 100,
          role: role ?? 'user',
        },
      })
    }

    // Update AI usage limit if provided
    if (aiLimit !== undefined) {
      const existingAiUsage = await db.userAIUsage.findUnique({ where: { userId: targetUserId } })
      if (existingAiUsage) {
        await db.userAIUsage.update({
          where: { userId: targetUserId },
          data: { monthlyLimit: aiLimit },
        })
      } else {
        await db.userAIUsage.create({
          data: { userId: targetUserId, monthlyLimit: aiLimit },
        })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Admin update error:', error)
    return NextResponse.json({ error: 'Failed to update user limits' }, { status: 500 })
  }
}

// DELETE — remove user
export async function DELETE(request: NextRequest) {
  try {
    const userId = await requireAuth(request)
    if (!userId) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }

    const { userId: targetUserId } = await request.json()

    if (!targetUserId) {
      return NextResponse.json({ error: 'يجب تحديد المستخدم' }, { status: 400 })
    }

    // Delete user (cascade will handle related records)
    await db.user.delete({ where: { id: targetUserId } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Admin delete error:', error)
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 })
  }
}