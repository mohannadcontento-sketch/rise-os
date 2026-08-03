import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ budgets: [] })

    let budgets: { category: string; limit: number }[] = []

    if (isSupabaseConfigured()) {
      // Production: use Supabase
      const admin = await getSupabaseAdmin()
      if (admin) {
        const { data, error } = await admin
          .from('user_settings')
          .select('budgets')
          .eq('user_id', userId)
          .maybeSingle()
        if (!error && data?.budgets) {
          try { budgets = JSON.parse(data.budgets) } catch {}
        }
      }
      // Fallback: if no budgets in user_settings, check knowledge_items
      if (budgets.length === 0 && admin) {
        const { data: kData } = await admin
          .from('knowledge_items')
          .select('content')
          .eq('user_id', userId)
          .eq('type', 'budget-config')
          .maybeSingle()
        if (kData?.content) {
          try { budgets = JSON.parse(kData.content) } catch {}
        }
      }
    } else {
      // Local dev: use Prisma
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
      // Production: use Supabase
      const admin = await getSupabaseAdmin()
      if (admin) {
        // Try to update existing user_settings row
        const { data: existing } = await admin
          .from('user_settings')
          .select('user_id')
          .eq('user_id', userId)
          .maybeSingle()

        if (existing) {
          // Update existing row
          const { error } = await admin
            .from('user_settings')
            .update({ budgets: budgetsJson })
            .eq('user_id', userId)
          if (error) {
            // If 'budgets' column doesn't exist, store in profiles table instead
            if (error.message.includes('column') || error.message.includes('Could not find')) {
              // Fallback: store as a knowledge_item with type 'budget-config'
              await admin.from('knowledge_items').upsert({
                user_id: userId,
                type: 'budget-config',
                title: 'ميزانية المستخدم',
                content: budgetsJson,
              }, { onConflict: 'user_id,type' })
            } else {
              throw error
            }
          }
        } else {
          // Insert new row
          const { error } = await admin
            .from('user_settings')
            .insert({ user_id: userId, budgets: budgetsJson })
          if (error) {
            // Fallback: store as a knowledge_item
            await admin.from('knowledge_items').upsert({
              user_id: userId,
              type: 'budget-config',
              title: 'ميزانية المستخدم',
              content: budgetsJson,
            }, { onConflict: 'user_id,type' })
          }
        }
      }
    } else {
      // Local dev: use Prisma
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
