import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseIsolatedClient, getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase'
import { setAuthCookies } from '@/lib/cookie-auth'
import { isMockAuthEnabled } from '@/lib/mock-auth'
import { db } from '@/lib/db'
import {
  REQUIRED_POLICY_VERSIONS,
  CONSENT_TYPES,
} from '@/lib/policy-versions'
import { createHash } from 'node:crypto'

/** تجزئة بصمة الطلب للبيانات الوصفية الدنيا (لا تخزين PII) */
function hashAuditField(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16)
}

// ============================================================
// /api/auth/signup — المصادقة (إنشاء حساب جديد) — المرحلة 20
//
// يسجل حساباً جديداً عبر Supabase Auth (الاسم يُخزن في
// user_metadata)، ويرد إما بجلسة فورية (كوكيز httpOnly) أو
// بطلب تأكيد البريد حسب إعدادات المشروع على Supabase.
//
// بوابة الموافقة الخادمية (بند الخطة: «رفض التسجيل خادميًا إذا
// لم يتم قبول النسخة المطلوبة»):
//   - acceptedTerms !== true            → 403 CONSENT_REQUIRED
//   - policyVersions لا تطابق المطلوبة  → 409 POLICY_VERSION_MISMATCH
//     (يرد مع requiredPolicyVersions ليحدّث العميل روابطه)
//   - عند النجاح: سطر consent لكل نوع (terms/privacy) في
//     user_consents (هجرة 038) بلحظة القبول وبصمات مجزّأة دنيا.
//
// المسار عام بالضرورة: لا جلسة قبل إنشاء الحساب.
// الطرق: POST — يعيد { user } + كوكيز، أو { needsConfirmation }،
//        أو 409 (بريد مسجل/نسخة سياسة) / 403 (موافقة) / 400
//        (بيانات) / 500 / 503.
// zod: SignupSchema — بريد + كلمة مرور ≥ 8 بحرف ورقم + اسم
//        اختياري + قبول صريح + نسختا السياسة.
// أمان: isAdmin يُعاد false دائماً — منح دور الإدارة يتم خارج
// النطاق يدوياً، لا عبر التسجيل الذاتي. دون Supabase: mock.
// ============================================================

export const dynamic = 'force-dynamic'

// P1#5: Zod validation + P1#11: password min 8 (was 6)
// المرحلة 20: قوة كلمة المرور (حرف + رقم) + قبول السياسات
const SignupSchema = z.object({
  email: z.string().email('بريد إلكتروني غير صالح'),
  password: z
    .string()
    .min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل')
    .regex(/[A-Za-z]/, 'كلمة المرور يجب أن تحتوي حرفًا واحدًا على الأقل')
    .regex(/[0-9]/, 'كلمة المرور يجب أن تحتوي رقمًا واحدًا على الأقل'),
  name: z.string().max(100).optional(),
  // بوابة الموافقة — القبول صريح لا افتراضي
  acceptedTerms: z.boolean().refine((v) => v === true, {
    message: 'يجب قبول الشروط وسياسة الخصوصية لإنشاء الحساب',
  }),
  // النسختان التي رآهما المستخدم عند القبول (تُقارنان بالمطلوبة)
  policyVersions: z.object({
    terms: z.string().min(1),
    privacy: z.string().min(1),
  }),
})

/** إدراج سجلات الموافقة بعد نجاح إنشاء الحساب (وضع Supabase) */
async function recordConsentsSupabase(
  userId: string,
  request: NextRequest
): Promise<boolean> {
  try {
    const admin = await getSupabaseAdmin()
    if (!admin) return false

    const uaHash = hashAuditField(request.headers.get('user-agent') || 'unknown')
    const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown'
    const ipHash = hashAuditField(ip)

    const rows = CONSENT_TYPES.map((type) => ({
      user_id: userId,
      consent_type: type,
      policy_version: (REQUIRED_POLICY_VERSIONS as Record<string, string>)[type],
      metadata: { uaHash, ipHash },
    }))

    // ignoreDuplicates: أول قبول لنفس النسخة هو السجل القانوني —
    // إعادة قبول لا تستبدل التاريخ الأصلي
    const { error } = await admin.from('user_consents').upsert(rows, {
      onConflict: 'user_id,consent_type,policy_version',
      ignoreDuplicates: true,
    })
    if (error) {
      // 038 لم تُطبَّق بعد؟ — بوابة القبول مُفعلة، والسجل أفضل جهد
      console.error('[auth/signup] consent insert failed:', error.message)
      return false
    }
    return true
  } catch (e) {
    console.error('[auth/signup] consent insert error:', e)
    return false
  }
}

/** إدراج سجلات الموافقة بعد نجاح إنشاء الحساب (وضع mock المحلي) */
async function recordConsentsLocal(
  userId: string,
  request: NextRequest
): Promise<boolean> {
  try {
    const uaHash = hashAuditField(request.headers.get('user-agent') || 'unknown')
    const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown'
    const ipHash = hashAuditField(ip)
    const metadata = JSON.stringify({ uaHash, ipHash })

    for (const type of CONSENT_TYPES) {
      // أول قبول لنفس النسخة هو السجل القانوني — تعارض الفهرس
      // الوحيد (P2002) يعني «مسجّل سلفًا» وليس خطأ
      await db.userConsent
        .create({
          data: {
            userId,
            consentType: type,
            policyVersion: (REQUIRED_POLICY_VERSIONS as Record<string, string>)[type],
            metadata,
          },
        })
        .catch((e: { code?: string }) => {
          if (e?.code !== 'P2002') throw e
        })
    }
    return true
  } catch (e) {
    console.error('[auth/signup] consent insert (local) error:', e)
    return false
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'جسم الطلب غير صالح' }, { status: 400 })
    }

    // P1#5: Validate input
    const parsed = SignupSchema.safeParse(body)
    if (!parsed.success) {
      // فشل «القبول» يعني رفض الموافقة — 403 برسالة عربية موحدة
      // (غاب الحقل أو جاء false — رسالة Zod الافتراضية إنجليزية)
      const consentIssue = parsed.error.issues.find((i) =>
        i.path.includes('acceptedTerms')
      )
      if (consentIssue) {
        return NextResponse.json(
          {
            error: 'يجب قبول الشروط وسياسة الخصوصية لإنشاء الحساب',
            errorType: 'CONSENT_REQUIRED',
          },
          { status: 403 }
        )
      }
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'بيانات غير صالحة' },
        { status: 400 }
      )
    }

    const { email, password, name } = parsed.data

    // ── بوابة النسخة: قارن النسخ المُرسَلة بالمطلوبة ──
    const versionsMatch =
      parsed.data.policyVersions.terms === REQUIRED_POLICY_VERSIONS.terms &&
      parsed.data.policyVersions.privacy === REQUIRED_POLICY_VERSIONS.privacy
    if (!versionsMatch) {
      return NextResponse.json(
        {
          error: 'تحديثت الشروط أو سياسة الخصوصية — راجعها ثم اقبل النسخة الجديدة',
          errorType: 'POLICY_VERSION_MISMATCH',
          requiredPolicyVersions: REQUIRED_POLICY_VERSIONS,
        },
        { status: 409 }
      )
    }

    // ── Supabase Auth Flow ──
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseIsolatedClient()
      if (supabase) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { name: name || email.split('@')[0] || 'مستخدم' },
          },
        })

        if (error) {
          console.error('[auth/signup] Supabase error:', (error as any).message, (error as any).code, (error as any).status)
          // P1#11 FIX: Do NOT auto-login on "already registered" — return clear error
          if (error.message.includes('already registered') || error.message.includes('already been registered')) {
            return NextResponse.json(
              { error: 'هذا البريد مسجل بالفعل. استخدم تسجيل الدخول.' },
              { status: 409 }
            )
          }
          return NextResponse.json({ error: `خطأ في التسجيل: ${error.message}` }, { status: 400 })
        }

        const user = data.user
        if (!user) return NextResponse.json({ error: 'فشل إنشاء الحساب' }, { status: 500 })

        if (data.session === null && user.identities?.length === 0) {
          return NextResponse.json({ error: 'هذا البريد مسجل بالفعل' }, { status: 409 })
        }

        // سجّل الموافقة لحظة قبولها — حتى قبل تأكيد البريد
        const consentRecorded = await recordConsentsSupabase(user.id, request)

        if (!data.session && user.confirmed_at === null) {
          return NextResponse.json({
            needsConfirmation: true,
            consentRecorded,
            message: 'تم إرسال رابط تأكيد إلى بريدك الإلكتروني',
          })
        }

        if (data.session) {
          // SECURITY: self-service signup can never grant an admin role.
          // Admin provisioning is performed out-of-band by the operator.
          const userInfo = {
            id: user.id,
            email: user.email || email,
            name: (user as any).user_metadata?.name || name || email.split('@')[0],
            isAdmin: false,
          }
          // P1#3: Set httpOnly cookies
          const res = NextResponse.json({ user: userInfo, consentRecorded })
          return setAuthCookies(res, {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_at: data.session.expires_at!,
          }, userInfo)
        }

        return NextResponse.json({
          needsConfirmation: true,
          consentRecorded,
          message: 'تم إنشاء الحساب. تحقق من بريدك الإلكتروني للتأكيد.',
        })
      }
    }

    // ── Local Fallback (mock mode) ──
    if (!isMockAuthEnabled()) {
      return NextResponse.json({ error: 'المصادقة غير مُهيأة على الخادم' }, { status: 503 })
    }
    const { createMockClient } = await import('@/lib/mock-client')
    const mock = createMockClient()
    const { data: signUpData, error: signUpError } = await mock.auth.signUp({
      email, password, options: { data: { name: name || email.split('@')[0] } }
    })
    if (signUpError || !signUpData.user || !signUpData.session) {
      return NextResponse.json({ error: 'فشل إنشاء الحساب' }, { status: 500 })
    }
    const consentRecorded = await recordConsentsLocal(signUpData.user.id, request)
    const userInfo = {
      id: signUpData.user.id,
      email: signUpData.user.email || email,
      name: name || email.split('@')[0],
      isAdmin: false,
    }
    const res = NextResponse.json({ user: userInfo, consentRecorded })
    return setAuthCookies(res, {
      access_token: signUpData.session.access_token,
      refresh_token: signUpData.session.refresh_token,
      expires_at: signUpData.session.expires_at,
    }, userInfo)
  } catch (error) {
    console.error('[auth/signup] error:', error)
    return NextResponse.json({ error: 'حدث خطأ في إنشاء الحساب' }, { status: 500 })
  }
}
