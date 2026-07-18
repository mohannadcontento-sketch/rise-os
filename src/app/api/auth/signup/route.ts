import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAnon, isSupabaseConfigured, ADMIN_EMAIL } from '@/lib/supabase'
import { db } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const { email, password, name } = await request.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'البريد وكلمة المرور مطلوبان' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' }, { status: 400 })
    }

    // ── Supabase Auth Flow ──
    if (isSupabaseConfigured()) {
      const supabase = getSupabaseAnon()
      if (supabase) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              name: name || email.split('@')[0] || 'مستخدم',
            },
          },
        })

        if (error) {
          if (error.message.includes('already registered') || error.message.includes('already been registered')) {
            // User exists — try to log them in instead
            const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
              email,
              password,
            })

            if (signInError) {
              return NextResponse.json(
                { error: 'هذا البريد مسجل بالفعل وكلمة المرور غير صحيحة' },
                { status: 409 },
              )
            }

            const user = signInData.user!
            await ensureLocalUser({
              id: user.id,
              email: user.email || email,
              name: user.user_metadata?.name || name || email.split('@')[0],
            })

            return NextResponse.json({
              user: {
                id: user.id,
                email: user.email,
                name: user.user_metadata?.name || name || email.split('@')[0],
                isAdmin: email === ADMIN_EMAIL,
              },
              session: {
                access_token: signInData.session!.access_token,
                refresh_token: signInData.session!.refresh_token,
                expires_at: signInData.session!.expires_at,
              },
            })
          }

          return NextResponse.json({ error: error.message }, { status: 400 })
        }

        const user = data.user
        if (!user) {
          return NextResponse.json({ error: 'فشل إنشاء الحساب' }, { status: 500 })
        }

        // If email confirmation is required
        if (data.session === null && user.identities?.length === 0) {
          return NextResponse.json({
            error: 'هذا البريد مسجل بالفعل',
          }, { status: 409 })
        }

        // Email confirmation required
        if (!data.session && user.confirmed_at === null) {
          return NextResponse.json({
            needsConfirmation: true,
            message: 'تم إرسال رابط تأكيد إلى بريدك الإلكتروني',
          })
        }

        // Auto-confirmed (if Supabase email confirmation is disabled)
        if (data.session) {
          await ensureLocalUser({
            id: user.id,
            email: user.email || email,
            name: user.user_metadata?.name || name || email.split('@')[0],
          })

          return NextResponse.json({
            user: {
              id: user.id,
              email: user.email,
              name: user.user_metadata?.name || name || email.split('@')[0],
              isAdmin: email === ADMIN_EMAIL,
            },
            session: {
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token,
              expires_at: data.session.expires_at,
            },
          })
        }

        return NextResponse.json({
          needsConfirmation: true,
          message: 'تم إنشاء الحساب. تحقق من بريدك الإلكتروني للتأكيد.',
        })
      }
    }

    // ── Local Fallback (no Supabase) ──
    const existing = await db.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({
        user: {
          id: existing.id,
          email: existing.email,
          name: existing.name,
          isAdmin: email === ADMIN_EMAIL,
        },
        session: {
          access_token: existing.id,
          refresh_token: '',
          expires_at: 0,
        },
      })
    }

    const user = await db.user.create({
      data: {
        email,
        name: name || email.split('@')[0] || 'مستخدم',
        settings: { create: {} },
      },
    })

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: email === ADMIN_EMAIL,
      },
      session: {
        access_token: user.id,
        refresh_token: '',
        expires_at: 0,
      },
    })
  } catch (error) {
    console.error('[auth/signup] error:', error)
    return NextResponse.json(
      { error: 'حدث خطأ في إنشاء الحساب' },
      { status: 500 },
    )
  }
}

async function ensureLocalUser(params: { id: string; email: string; name: string }) {
  const { id, email, name } = params

  try {
    const existing = await db.user.findUnique({ where: { id } })
    if (existing) return

    await db.user.create({
      data: {
        id,
        email,
        name,
        settings: { create: {} },
      },
    })
    console.log(`[auth/signup] created local user for Supabase: ${id}`)
  } catch (err) {
    console.error('[auth/signup] ensureLocalUser error:', err)
  }
}