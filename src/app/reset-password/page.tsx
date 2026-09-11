import { cookies } from 'next/headers'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Zap, AlertTriangle, MonitorSmartphone, Hourglass, ArrowLeft } from 'lucide-react'
import ResetPasswordForm from '@/components/rise/reset-password-form'
import { RECOVERY_COOKIE } from '@/lib/auth-pkce'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'كلمة مرور جديدة | أوج — awj.life',
  robots: { index: false, follow: false },
}

// ============================================================
// /reset-password — صفحة تعيين كلمة مرور جديدة (server-guarded)
// ------------------------------------------------------------
// تُعرض فقط عندما تتحقق شروط الوصول على السيرفر:
//   1. marker cookie httpOnly (rise-pwd-recovery) — لا يُوضع إلا
//      بعد تبديل ناجح لكود رابط استعادة حقيقي في /auth/callback.
//   2. جلسة استعادة حية في كوكيز httpOnly.
// أي زيارة مباشرة أو رابط مستهلك/منتهٍ/مفتوح من جهاز آخر تظهر
// حالة ودّية توضح السبب وتوجّه لطلب رابط جديد — لا واجهة وهمية.
// ============================================================

type LinkState = 'expired' | 'device' | 'invalid'

const STATE_CONTENT: Record<
  LinkState,
  { icon: typeof AlertTriangle; title: string; body: string }
> = {
  expired: {
    icon: Hourglass,
    title: 'انتهت صلاحية رابط الاستعادة',
    body: 'روابط الاستعادة أحادية الاستخدام وتنتهي سريعًا حفاظًا على أمان حسابك. اطلب رابطًا جديدًا وافتح الرسالة خلال المدة المتاحة، ثم أكمل خلال عشر دقائق.',
  },
  device: {
    icon: MonitorSmartphone,
    title: 'الرابط فُتح من متصفح أو جهاز مختلف',
    body: 'لأمانك، يجب فتح رابط الاستعادة في نفس المتصفح الذي طلبت منه الرسالة (رابط الاستعادة مرتبط بجلسة الطلب). ارجع إلى ذلك المتصفح واضغط الرابط من جديد، أو اطلب رابطًا جديدًا من هنا.',
  },
  invalid: {
    icon: AlertTriangle,
    title: 'رابط غير صالح',
    body: 'هذه الصفحة متاحة فقط من رابط الاستعادة المرسل إلى بريدك. اطلب رابطًا جديدًا ثم اتبع خطوات الرسالة.',
  },
}

function InvalidLinkCard({ state }: { state: LinkState }) {
  const content = STATE_CONTENT[state]
  const Icon = content.icon
  return (
    <div className="text-center space-y-5" role="alert">
      <div className="mx-auto w-14 h-14 rounded-2xl bg-warning/15 flex items-center justify-center">
        <Icon className="w-7 h-7 text-warning" />
      </div>
      <div>
        <h2 className="font-bold text-foreground text-lg">{content.title}</h2>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{content.body}</p>
      </div>
      <div className="space-y-2">
        <Link
          href="/app?forgot=1"
          className="w-full h-11 rounded-xl bg-violet-accent text-ink font-bold press flex items-center justify-center transition-all hover:shadow-lg hover:shadow-violet-accent/25"
        >
          طلب رابط استعادة جديد
        </Link>
        <Link
          href="/app"
          className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1 py-1"
        >
          <ArrowLeft className="w-3 h-3" />
          العودة لتسجيل الدخول
        </Link>
      </div>
    </div>
  )
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const rawState = typeof params.state === 'string' ? params.state : ''

  const cookieStore = await cookies()
  const hasMarker = cookieStore.get(RECOVERY_COOKIE)?.value === '1'
  const hasSession = !!cookieStore.get('rise-access')?.value

  // جِلسة استعادة سليمة → الفورم. أي شيء آخر → تفسير واضح للسبب.
  const allowed = hasMarker && hasSession
  const state: LinkState =
    rawState === 'expired' || rawState === 'device' || rawState === 'invalid'
      ? rawState
      : 'invalid'

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-background" dir="rtl">
      {/* Ambient glow — مطابق لصفحة الدخول */}
      <div className="absolute inset-0" aria-hidden="true">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 h-96 w-96 rounded-full bg-violet-accent/15 blur-3xl" />
        <div className="absolute top-1/3 right-0 h-72 w-72 rounded-full bg-glass/10 blur-3xl" />
        <div className="absolute bottom-0 inset-x-0 h-64 bg-gradient-to-t from-forest/25 to-transparent" />
      </div>

      <div className="relative z-10 w-full max-w-sm sm:max-w-md mx-4 px-2">
        <div className="rounded-3xl neo-card shadow-lift bg-card/95 p-6 sm:p-8 backdrop-blur-xl">
          {/* Logo */}
          <div className="flex flex-col items-center mb-6 sm:mb-8">
            <div className="press w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-lime flex items-center justify-center shadow-lg shadow-lime/25 mb-3 sm:mb-4">
              <Zap className="w-7 h-7 sm:w-8 sm:h-8 text-ink" />
            </div>
            {allowed ? (
              <>
                <h1 className="text-xl sm:text-2xl font-bold text-foreground">كلمة مرور جديدة</h1>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">أوج — awj.life</p>
              </>
            ) : null}
          </div>

          {allowed ? <ResetPasswordForm /> : <InvalidLinkCard state={state} />}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-5 sm:mt-6">أوج v1.0 — awj.life</p>
      </div>
    </div>
  )
}
