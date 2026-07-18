import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ADMIN_EMAIL, getSupabaseAnon, isSupabaseConfigured } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) {
      return NextResponse.json({ user: null, expires: null })
    }

    // ── Try Supabase Auth ──
    if (isSupabaseConfigured() && token.length > 50 && !token.startsWith('rise_')) {
      const supabase = await getSupabaseAnon()
      if (supabase) {
        try {
          const { data: { user }, error } = await supabase.auth.getUser(token)
          if (!error && user) {
            const localUser = await db.user.findUnique({ where: { id: user.id } })
            if (!localUser) {
              await db.user.create({
                data: {
                  id: user.id,
                  name: user.user_metadata?.name || user.email?.split('@')[0] || 'مستخدم',
                  email: user.email || '',
                  settings: { create: {} },
                },
              })
            }
            return NextResponse.json({
              user: {
                id: user.id,
                email: user.email,
                name: user.user_metadata?.name || user.email?.split('@')[0] || 'مستخدم',
                isAdmin: user.email === ADMIN_EMAIL,
              },
              expires: new Date((user.exp || 0) * 1000).toISOString() || null,
            })
          }
        } catch { /* fall through */ }
      }
    }

    // ── Local Fallback ──
    const user = await db.user.findUnique({
      where: { id: token },
      select: { id: true, email: true, name: true },
    })

    if (!user) return NextResponse.json({ user: null, expires: null })

    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, isAdmin: user.email === ADMIN_EMAIL },
    })
  } catch {
    return NextResponse.json({ user: null, expires: null })
  }
}