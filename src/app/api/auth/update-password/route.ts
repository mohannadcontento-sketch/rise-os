import { NextRequest, NextResponse } from 'next/server'
import {
  getUserId,
} from '@/lib/auth'
import {
  createSupabaseIsolatedClient,
  getSupabaseAnon,
  getSupabaseAdmin,
  isSupabaseConfigured,
} from '@/lib/supabase'
import { clearAuthCookies } from '@/lib/cookie-auth'
import { parseBody, updatePasswordSchema } from '@/lib/validators'

export const dynamic = 'force-dynamic'

// ============================================================
// POST /api/auth/update-password
// Phase 3 — تغيير كلمة المرور (م歌ران للدخول اثنان):
//
// Flow A — settings: { currentPassword, newPassword }
//   المستخدم مسجل دخوله ويعيد إثبات هويته بكلمة المرور الحالية.
// Flow B — recovery: { newPassword }
//   المستخدم وصل من رابط الاستعادة في البريد؛ جلسته أُنشئت في
//   /auth/callback?flow=recovery وعندها وُضع marker cookie httpOnly
//   قصير العمر (rise-pwd-recovery). بدون الاثنين يرفض الطلب.
//
// بعد النجاح: تُبطل كل جلسات المستخدم (admin signOut) ويجب تسجيل
// الدخول من جديد — لا تبقى أي جلسة قديمة بعد تغيير كلمة المرور.
// ============================================================

const RECOVERY_COOKIE = 'rise-pwd-recovery'

export async function POST(req: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: 'تغيير كلمة المرور غير متاح في وضع التطوير المحلي' },
        { status: 503 }
      )
    }

    const userId = await getUserId(req)
    if (!userId) {
      return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })
    }

    const parsed = await parseBody(req, updatePasswordSchema)
    if (!parsed.ok) return parsed.response!
    const { currentPassword, newPassword } = parsed.data!

    const accessToken = req.cookies.get('rise-access')?.value || ''
    const refreshToken = req.cookies.get('rise-refresh')?.value || ''
    const recoveryMarker = req.cookies.get(RECOVERY_COOKIE)?.value

    const isolated = await createSupabaseIsolatedClient()
    if (!isolated) {
      return NextResponse.json({ error: 'خدمة المصادقة غير متوفرة حالياً' }, { status: 503 })
    }

    if (currentPassword) {
      // ── Flow A: إعادة إثبات الهوية بكلمة المرور الحالية ──
      // جلب البريد من الجلسة الحالية (وليس من جسم الطلب — لا نثق به).
      const anon = await getSupabaseAnon()
      if (!anon) {
        return NextResponse.json({ error: 'خدمة المصادقة غير متوفرة حالياً' }, { status: 503 })
      }
      const { data: { user: sessionUser }, error: userError } = await anon.auth.getUser(accessToken)
      const email = sessionUser?.email
      if (userError || !email) {
        return NextResponse.json({ error: 'تعذر التحقق من الجلسة الحالية' }, { status: 401 })
      }

      const { data: authData, error: authError } = await isolated.auth.signInWithPassword({
        email,
        password: currentPassword,
      })
      if (authError || !authData.user || authData.user.id !== userId) {
        return NextResponse.json({ error: 'كلمة المرور الحالية غير صحيحة' }, { status: 403 })
      }
    } else {
      // ── Flow B: رابط الاستعادة — marker cookie إلزامي ──
      // (جلسة عادية بلا marker لا تكفي: كوكي مسروق لا يغيّر كلمة المرور)
      if (!recoveryMarker || recoveryMarker !== '1') {
        return NextResponse.json(
          { error: 'مطلوب إثبات الهوية: أعد تسجيل الدخول أو استخدم رابط الاستعادة' },
          { status: 403 }
        )
      }
      if (!accessToken) {
        return NextResponse.json({ error: 'جلسة الاستعادة غير صالحة' }, { status: 401 })
      }
    }

    // تعيين الجلسة في العميل المعزول ثم تحديث كلمة المرور.
    if (!accessToken || !refreshToken) {
      return NextResponse.json({ error: 'الجلسة غير مكتملة، سجّل الدخول من جديد' }, { status: 401 })
    }
    const { error: sessionError } = await isolated.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    })
    if (sessionError) {
      return NextResponse.json({ error: 'انتهت صلاحية الجلسة، سجّل الدخول من جديد' }, { status: 401 })
    }

    const { error: updateError } = await isolated.auth.updateUser({
      password: newPassword,
    })
    if (updateError) {
      console.error('[auth/update-password] supabase error:', updateError.message)
      return NextResponse.json(
        { error: 'تعذر تحديث كلمة المرور. تأكد أنها 8 أحرف على الأقل وغير مستخدمة سابقًا.' },
        { status: 400 }
      )
    }

    // ── إبطال كل الجلسات بعد تغيير كلمة المرور ──
    const admin = await getSupabaseAdmin()
    if (admin) {
      try {
        await admin.auth.signOut(userId)
      } catch (e) {
        console.error('[auth/update-password] global signOut failed (non-fatal):', e)
      }
    }

    const res = NextResponse.json({ success: true, mustReauth: true })
    clearAuthCookies(res)
    res.cookies.delete(RECOVERY_COOKIE)
    return res
  } catch (error) {
    console.error('[auth/update-password] error:', error)
    return NextResponse.json({ error: 'حدث خطأ أثناء تغيير كلمة المرور' }, { status: 500 })
  }
}
