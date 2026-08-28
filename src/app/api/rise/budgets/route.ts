import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

    let budgets: { category: string; limit: number }[] = []

    if (isSupabaseConfigured()) {
      // Production: read from knowledge_items (type='budget-config')
      const admin = await getSupabaseAdmin()
      if (admin) {
        const { data, error } = await admin
          .from('knowledge_items')
          .select('content')
          .eq('user_id', userId)
          .eq('type', 'budget-config')
          .maybeSingle()
        if (!error && data?.content) {
          try { budgets = JSON.parse(data.content) } catch {}
        }
      }
    } else {
      // Local dev: read from Prisma user_settings
      const settings = await db.userSettings.findUnique({ where: { userId } })
      if (settings && (settings as any).budgets) {
        try { budgets = JSON.parse((settings as any).budgets) } catch {}
      }
    }

    const resp = NextResponse.json({ budgets })
    resp.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
    return resp
  } catch (error) {
    console.error('[budgets] GET error:', error)
    return NextResponse.json({ budgets: [] })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

    const body = await req.json()
    const { budgets } = body as { budgets: { category: string; limit: number }[] }

    if (!Array.isArray(budgets)) {
      return NextResponse.json({ error: 'budgets array required' }, { status: 400 })
    }

    const budgetsJson = JSON.stringify(budgets)

    if (isSupabaseConfigured()) {
      // Production: save to knowledge_items (type='budget-config')
      const admin = await getSupabaseAdmin()
      if (admin) {
        // Check if budget-config already exists
        const { data: existing } = await admin
          .from('knowledge_items')
          .select('id')
          .eq('user_id', userId)
          .eq('type', 'budget-config')
          .maybeSingle()

        if (existing?.id) {
          // Update existing
          await admin
            .from('knowledge_items')
            .update({ content: budgetsJson })
            .eq('id', existing.id)
        } else {
          // Insert new
          await admin
            .from('knowledge_items')
            .insert({
              user_id: userId,
              type: 'budget-config',
              title: 'ميزانية المستخدم',
              content: budgetsJson,
            })
        }
      }
    } else {
      // Local dev: save to Prisma user_settings
      await db.userSettings.upsert({
        where: { userId },
        update: { budgets: budgetsJson } as any,
        create: { userId, budgets: budgetsJson } as any,
      })
    }

    const resp = NextResponse.json({ budgets })
    resp.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
    return resp
  } catch (error) {
    console.error('[budgets] PUT error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
