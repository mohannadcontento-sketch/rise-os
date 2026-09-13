import type { Metadata } from 'next'
import Link from 'next/link'
import { Zap, AlertTriangle, KeyRound, ShieldCheck, ArrowLeft } from 'lucide-react'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'تفويض ChatGPT | أوج — awj.life',
  robots: { index: false, follow: false },
}

// ============================================================
// /mcp/authorize — صفحة تفويض ChatGPT (خادم MCP — المرحلة 10-ج)
// ------------------------------------------------------------
// ChatGPT يفتح هذه الصفحة في نافذة التفويض: تُعلنها الدالة في
// metadata كauthorization_endpoint (RFC 8414 يسمح بأي رابط https
// مطلق). لماذا هنا وليس في دالة Supabase نفسها؟ بوابة المنصة تمنع
// عرض HTML من الدوال على نطاق *.supabase.co المشترك (تحوّل
// text/html إلى text/plain + sandbox CSP — حماية من صفحات الصيد
// على نطاق مشترك)، فأي واجهة من الدالة تظهر للمستخدم ككود خام.
//
// العقد مع الدالة (supabase/functions/mcp):
//   1) ChatGPT يفتح الصفحة بمعاملات OAuth القياسية:
//      response_type / client_id / redirect_uri / state /
//      code_challenge(+method) / scope (+ أي معاملات إضافية يرسلها).
//   2) بلا مفتاح: الدالة تُحيل إلينا (302) بنفس المعاملات محفوظة
//      ونعرض نموذج الإدخال — نُعيد توجيه كل المعاملات كحقول مخفية.
//   3) بمفتاح خاطئ/خطة غير ماكس: الدالة تُحيل مع error=invalid_key
//      أو plan_required فنعرض الرسالة العربية ونترك المستخدم يعيد
//      المحاولة (المعاملات محفوظة في رابط الصفحة نفسها).
//   4) الإرسال: نموذج GET إلى نقطة الدالة مباشرة (action يحمل
//      المسار فقط — GET يستبدل الـquery بحقول النموذج، لذا
//      oauth=authorize حقل مخفي). المفتاح الصالح → الدالة تصدر
//      code فورًا وتعيد 302 إلى رد نداء ChatGPT → تُغلق النافذة
//      ويُكمل التبديل — إدخال المفتاح هنا هو الموافقة نفسها
//      (النص أعلاه يشرح الممنوح قبل الإرسال).
//   5) «إلغاء» = رابط لنفس نقطة الدالة مع deny=1 → 302
//      access_denied نظيفة تُغلق النافذة عند ChatGPT.
//
// لا سكربتات ولا حالة: كل شيء server-rendered من searchParams —
// القيم يهرّبها React تلقائيًا، والدالة تعيد التحقق من كل مدخل
// (client_id/redirect_uri/PKCE) فلا الثقة ولا الأمان يعتمدان هنا.
// ============================================================

/** رابط نقطة MCP (الدالة) — نفس متغير عميل Supabase الحالي */
const MCP_ENDPOINT = `${(process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '')}/functions/v1/mcp`

/** معاملات الصفحة نفسها التي لا تُعاد للدالة (تحكم/عرض) */
const NON_FORWARDABLE = new Set(['error', 'api_key', 'oauth', 'deny', 'confirm'])

/** رسالات الأخطاء البشرية (تصل من الدالة عبر error=…) */
const ERRORS: Record<string, { title: string; body: string }> = {
  invalid_key: {
    title: 'المفتاح غير صالح',
    body: 'مفتاح MCP غير موجود أو ملغى أو الحساب موقوف — تأكد من نسخه كاملًا من إعدادات أوج ثم أعد المحاولة.',
  },
  plan_required: {
    title: 'التفويض متاح في خطة ماكس',
    body: 'ربط ChatGPT وMCP من ميزات خطة ماكس — رقِّ حسابك من إعدادات أوج ثم أعد المحاولة.',
  },
}

export default async function McpAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams

  // قيم مفردة فقط (طلب OAuth سليم لا يكرر المعاملات؛ التكرار =
  // طلب ملفق — نتجاهله ولا نمرره). تُعاد للدالة كما وصلت.
  const forward: Array<[string, string]> = []
  for (const [key, value] of Object.entries(params)) {
    if (NON_FORWARDABLE.has(key)) continue
    if (typeof value === 'string' && value !== '') forward.push([key, value])
  }
  const get = (key: string): string => {
    const v = params[key]
    return typeof v === 'string' ? v : ''
  }
  const clientId = get('client_id')
  const redirectUri = get('redirect_uri')
  const responseType = get('response_type')
  const state = get('state')

  // رابط «إلغاء»: نفس معاملات الصفحة + deny=1 — الدالة تصدّق
  // redirect_uri وتعيد access_denied إلى ChatGPT (مواصفة OAuth)
  const cancelHref = redirectUri
    ? `${MCP_ENDPOINT}?${new URLSearchParams([['oauth', 'authorize'], ...forward, ['state', state], ['deny', '1']]).toString()}`
    : null

  const errorKey = get('error')
  const error = ERRORS[errorKey] ?? null
  const ready = !!process.env.NEXT_PUBLIC_SUPABASE_URL
  const validRequest = ready && clientId !== '' && redirectUri !== '' && responseType === 'code'

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-background" dir="rtl">
      {/* Ambient glow — مطابق لصفحات الدخول/الاستعادة */}
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
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">تفويض ChatGPT بالوصول لأوج</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">أوج — awj.life</p>
          </div>

          {error ? (
            <div
              className="rounded-xl bg-warning/15 border border-warning/30 px-4 py-3 mb-5 flex items-start gap-3"
              role="alert"
            >
              <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-foreground">{error.title}</p>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1 leading-relaxed">{error.body}</p>
              </div>
            </div>
          ) : null}

          {!validRequest ? (
            <div className="text-center space-y-5" role="alert">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-warning/15 flex items-center justify-center">
                <AlertTriangle className="w-7 h-7 text-warning" />
              </div>
              <div>
                <h2 className="font-bold text-foreground text-lg">رابط تفويض غير صالح</h2>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                  {ready
                    ? 'هذه الصفحة تُفتح من نافذة ربط ChatGPT فقط، ومعاملات الطلب ناقصة. ارجع إلى ChatGPT وأعد خطوات ربط الموصل من البداية.'
                    : 'الموقع غير مهيأ للربط بعد (متغيرات Supabase غير مضبوطة) — تواصل مع الدعم.'}
                </p>
              </div>
              <Link
                href="/app"
                className="w-full h-11 rounded-xl bg-violet-accent text-ink font-bold press flex items-center justify-center transition-all hover:shadow-lg hover:shadow-violet-accent/25"
              >
                العودة لأوج
              </Link>
            </div>
          ) : (
            <>
              {/* شرح الممنوح — قبل الإدخال (الإدخال نفسه هو الموافقة) */}
              <div className="space-y-3 mb-6 text-sm text-muted-foreground leading-relaxed">
                <p>
                  بإكمال الربط سيتمكن ChatGPT من استخدام أدوات أوج الثمانية باسمك: قراءة مهامك
                  وعاداتك ومخطط يومك ويومياتك ودرجتك، وإنشاء مهام وتسجيل عادات وكتابة يوميات.
                </p>
                <div className="flex items-start gap-2 text-xs">
                  <ShieldCheck className="w-4 h-4 text-lime shrink-0 mt-0.5" />
                  <p>
                    لا حذف لأي بيانات، وحدود الاستخدام 30 عملية/دقيقة، وكل كتابة تُسجَّل في
                    التدقيق — ويمكنك إبطال الوصول في أي وقت من إعدادات أوج.
                  </p>
                </div>
              </div>

              <form method="get" action={MCP_ENDPOINT}>
                {/* oauth=authorize أولاً — GET يستبدل الـquery بحقول النموذج */}
                <input type="hidden" name="oauth" value="authorize" />
                {forward.map(([key, value]) => (
                  <input key={key} type="hidden" name={key} value={value} />
                ))}

                <label
                  htmlFor="api_key"
                  className="flex items-center gap-2 text-sm font-bold text-foreground mb-2"
                >
                  <KeyRound className="w-4 h-4 text-violet-accent" />
                  مفتاح MCP الشخصي (خطة ماكس)
                </label>
                <input
                  id="api_key"
                  name="api_key"
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  autoFocus
                  required
                  placeholder="rise_…"
                  dir="ltr"
                  className="w-full h-12 rounded-xl bg-background border border-border px-4 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-accent/40"
                />
                <p className="text-xs text-muted-foreground mt-2 mb-5">
                  يُنشأ من: الإعدادات ← التكامل ← مفتاح MCP داخل تطبيق أوج.
                </p>

                <button
                  type="submit"
                  className="w-full h-12 rounded-xl bg-violet-accent text-ink font-bold press flex items-center justify-center transition-all hover:shadow-lg hover:shadow-violet-accent/25"
                >
                  تفويض
                </button>
              </form>

              {cancelHref ? (
                <Link
                  href={cancelHref}
                  className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1 py-3"
                >
                  <ArrowLeft className="w-3 h-3" />
                  إلغاء الربط والعودة لـChatGPT
                </Link>
              ) : null}
            </>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-5 sm:mt-6">أوج — awj.life</p>
      </div>
    </div>
  )
}
