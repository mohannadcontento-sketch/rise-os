import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseIsolatedClient, isSupabaseConfigured } from '@/lib/supabase'
import { parseBody, resendSchema } from '@/lib/validators'

// ============================================================
// /api/auth/resend — المصادقة (إعادة إرسال تأكيد التسجيل)
//
// يعيد إرسال بريد تأكيد الحساب (type='signup') عبر Supabase
// للمستخدم الذي لم يؤكد بريده بعد — يستدعيه ملء الشاشة عند
// رسالة «تحقق من بريدك» (شاشة انتظار التأكيد بعد التسجيل).
//
// المسار عام: المستخدم بلا جلسة أصلاً (حسابه غير مفعّل).
// الطرق: POST — يعيد { success: true } أو 400 عند فشل الإرسال.
// zod: resendSchema عبر parseBody (بريد صالح فقط).
// ملاحظة: دون Supabase يرد success بصمت — لا يكشف وجود البريد.
// ============================================================

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const parsed = await parseBody(request, resendSchema)
    if (!parsed.ok) return parsed.response!
    const { email } = parsed.data!

    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseIsolatedClient()
      if (supabase) {
        const { error } = await supabase.auth.resend({ type: 'signup', email })
        if (error) {
          return NextResponse.json({ error: 'فشل إعادة الإرسال' }, { status: 400 })
        }
        return NextResponse.json({ success: true })
      }
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}