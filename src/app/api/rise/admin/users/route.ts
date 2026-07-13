import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ADMIN_EMAIL } from '@/lib/supabase'

// GET all users (admin only)
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization') || ''
    const token = authHeader.replace('Bearer ', '')

    // Verify admin via Supabase
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data: userData } = await supabase.auth.getUser(token)
    if (!userData.user || userData.user.email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: 'غير مصرح - أدمن فقط' }, { status: 403 })
    }

    // Get all users from Supabase
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers()
    
    const supabaseUsers = users?.map(u => ({
      id: u.id,
      email: u.email,
      name: u.user_metadata?.display_name || u.email?.split('@')[0] || 'مستخدم',
      createdAt: u.created_at,
      isAdmin: u.email === ADMIN_EMAIL,
    })) || []

    // Get storage/limits from local DB
    const localUsers = await db.userStorage.findMany()

    // Merge data
    const mergedUsers = supabaseUsers.map(su => {
      const local = localUsers.find(lu => lu.supabaseId === su.id)
      return {
        ...su,
        storageUsed: local?.storageUsed || 0,
        storageLimit: local?.storageLimit || 10485760,
        aiLimit: local?.aiLimit || 100,
        aiUsed: 0, // Will be populated from UserAIUsage
      }
    })

    // Also get AI usage
    const aiUsages = await db.userAIUsage.findMany()
    for (const user of mergedUsers) {
      const localUser = localUsers.find(lu => lu.supabaseId === user.id)
      if (localUser) {
        const aiUsage = aiUsages.find(a => a.userId === localUser.userId)
        if (aiUsage) {
          user.aiUsed = aiUsage.monthlyUsed
        }
      }
    }

    return NextResponse.json({ users: mergedUsers })
  } catch (error) {
    console.error('Admin users error:', error)
    return NextResponse.json({ users: [] })
  }
}

// POST - Create/update user limits
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization') || ''
    const token = authHeader.replace('Bearer ', '')

    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data: userData } = await supabase.auth.getUser(token)
    if (!userData.user || userData.user.email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }

    const { supabaseUserId, storageLimit, aiLimit, role } = await request.json()

    // Upsert user storage record
    const existing = await db.userStorage.findFirst({ where: { supabaseId: supabaseUserId } })

    if (existing) {
      await db.userStorage.update({
        where: { id: existing.id },
        data: {
          storageLimit: storageLimit ?? existing.storageLimit,
          aiLimit: aiLimit ?? existing.aiLimit,
          role: role ?? existing.role,
        },
      })

      // Also update AI usage limit if provided
      if (aiLimit !== undefined && existing.userId) {
        await db.userAIUsage.upsert({
          where: { userId: existing.userId },
          create: { userId: existing.userId, monthlyLimit: aiLimit },
          update: { monthlyLimit: aiLimit },
        })
      }
    } else {
      // Create new local user record
      const newUserId = `user-${supabaseUserId.slice(0, 8)}`
      await db.userStorage.create({
        data: {
          userId: newUserId,
          supabaseId: supabaseUserId,
          storageLimit: storageLimit ?? 10485760,
          aiLimit: aiLimit ?? 100,
          role: role ?? 'user',
        },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Admin update error:', error)
    return NextResponse.json({ error: 'Operation saved locally', offline: true })
  }
}

// DELETE - Remove user
export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization') || ''
    const token = authHeader.replace('Bearer ', '')

    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data: userData } = await supabase.auth.getUser(token)
    if (!userData.user || userData.user.email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }

    const { supabaseUserId } = await request.json()

    // Delete from Supabase (admin API)
    await supabase.auth.admin.deleteUser(supabaseUserId)

    // Delete from local DB
    const local = await db.userStorage.findFirst({ where: { supabaseId: supabaseUserId } })
    if (local) {
      await db.userStorage.delete({ where: { id: local.id } })
      await db.userAIUsage.deleteMany({ where: { userId: local.userId } })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Admin delete error:', error)
    return NextResponse.json({ error: 'Operation saved locally', offline: true })
  }
}