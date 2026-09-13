'use client'

// ============================================================
// McpSection — «ربط MCP» (المرحلة 10 — MCP للـMax)
//
// بوابة المستخدم لميزة ماكس الفارقة: مفتاح Bearer شخصي يربط
// عميل AI خارجيًا (Claude / ChatGPT connector / Cursor…) بأوج
// عبر /api/rise/mcp/call (بروتوكول MCP — JSON-RPC).
//
// • الخطة: تُقرأ من /api/rise/user/subscription — غير ماكس
//   = بطاقة تعريف بالميزة وإحالة لقسم الخطة أعلاه (لا أزرار).
// • المفتاح: السر يظهر مرة واحدة فقط عند الإنشاء (POST) —
//   بعدها metadata مقنّعة فقط (hasKey/masked/lastUsedAt).
//   «استبدال» = إبطال الكل ثم إصدار جديد (تدفق واحد بأزرار
//   واضحة)، و«إبطال» يوقف كل العملاء فورًا.
// • دليل الربط: عنوان النقطة + ترويسة المصادقة + مثال استدعاء
//   حقيقي + أسماء الأدوات الثمانية — كل شيء ينسخ بضغطة.
//
// ملاحظة عمد: قائمة الأدوات هنا نسخة عرض ثابتة (لا نستورد
// src/lib/mcp/tools في العميل — يجرّ طبقة البيانات والخادم
// كاملة إلى حزمة المتصفح بلا داعٍ).
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import {
  Plug,
  KeyRound,
  Copy,
  Loader2,
  ShieldCheck,
  Trash2,
  RefreshCw,
  Bot,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiFetch, apiPost, apiDelete } from '@/lib/api-fetch'
import { toast } from 'sonner'
import { SectionCard } from './settings-section-card'

interface KeyInfo {
  hasKey: boolean
  masked?: string | null
  createdAt?: string | null
  lastUsedAt?: string | null
}

/** بيانات ربط ChatGPT من /api/rise/mcp/oauth-info (خطة ماكس) */
interface OauthInfo {
  serverUrl: string
  authorizeUrl: string
  tokenUrl: string
  clientId: string
  clientSecret: string
}

/** عرض ثابت للأدوات (مرآة MCP_TOOLS — للنسخ فقط) */
const TOOLS_DISPLAY: { name: string; label: string; write: boolean }[] = [
  { name: 'list_tasks', label: 'عرض المهام', write: false },
  { name: 'create_task', label: 'إنشاء مهمة', write: true },
  { name: 'complete_task', label: 'إكمال مهمة', write: true },
  { name: 'list_habits', label: 'عرض العادات', write: false },
  { name: 'check_in_habit', label: 'تسجيل عادة', write: true },
  { name: 'get_today_plan', label: 'مخطط اليوم', write: false },
  { name: 'get_productivity_score', label: 'درجة الإنتاجية', write: false },
  { name: 'create_journal_entry', label: 'كتابة اليوميات', write: true },
]

function formatDateAr(iso: string | null | undefined): string | null {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleDateString('ar-EG', {
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return null
  }
}

/**
 * تحميل بيانات القسم — دالة نقية بلا setState (تصلح للتأثير
 * والمعالجات معًا): الخطة + حالة المفتاح. الفشل بلا قيمة (البطاقة
 * تعرض الحالة الفارغة).
 */
async function fetchSectionData(): Promise<{ plan: string | null; keyInfo: KeyInfo | null }> {
  try {
    const [subRes, keyRes] = await Promise.all([
      apiFetch('/api/rise/user/subscription').catch(() => null),
      apiFetch('/api/rise/mcp/key').catch(() => null),
    ])
    let plan: string | null = null
    let keyInfo: KeyInfo | null = null
    if (subRes?.ok) {
      const sub = await subRes.json().catch(() => null)
      plan = sub?.effectivePlan ?? sub?.subscription?.plan ?? 'free'
    }
    if (keyRes?.ok) keyInfo = await keyRes.json().catch(() => null)
    return { plan, keyInfo }
  } catch {
    return { plan: null, keyInfo: null }
  }
}

export function McpSection() {
  const [plan, setPlan] = useState<string | null>(null)
  const [keyInfo, setKeyInfo] = useState<KeyInfo | null>(null)
  const [newKey, setNewKey] = useState<string | null>(null) // كشف لمرة واحدة
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'create' | 'revoke' | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const [chatgptOpen, setChatgptOpen] = useState(false)
  const [oauthInfo, setOauthInfo] = useState<OauthInfo | null>(null)
  const [oauthState, setOauthState] = useState<'idle' | 'loading' | 'error' | 'ready' | 'unconfigured'>('idle')

  // التحميل الأول: setState داخل .then فقط — لا استدعاء مباشر
  // لدالة تحوي setState من جسم التأثير (react-hooks/set-state-in-effect)
  useEffect(() => {
    let alive = true
    fetchSectionData().then((d) => {
      if (!alive) return
      setPlan(d.plan)
      setKeyInfo(d.keyInfo)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [])

  // إعادة التحميل من المعالجات (أزرار — خارج قيود التأثير)
  const reload = useCallback(async () => {
    const d = await fetchSectionData()
    setPlan(d.plan)
    setKeyInfo(d.keyInfo)
  }, [])

  // جلب بيانات OAuth عند فتح قسم ChatGPT أول مرة (lazy)
  useEffect(() => {
    if (!chatgptOpen || oauthState !== 'idle' || plan !== 'max') return
    let alive = true
    setOauthState('loading')
    apiFetch('/api/rise/mcp/oauth-info')
      .then(async (res) => {
        if (!alive) return
        if (res.ok) {
          setOauthInfo(await res.json().catch(() => null))
          setOauthState('ready')
        } else if (res.status === 503) {
          setOauthState('unconfigured')
        } else {
          setOauthState('error')
        }
      })
      .catch(() => alive && setOauthState('error'))
    return () => {
      alive = false
    }
  }, [chatgptOpen, oauthState, plan])

  const endpointUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/api/rise/mcp/call` : '/api/rise/mcp/call'

  // نقطة Supabase البديلة (Edge Function — مستقلة عن Vercel):
  // NEXT_PUBLIC_* آمنة للعميل بنيويًا (نفس مفتاح anon العام)؛
  // تظهر فقط لو ضُبط متغير البيئة، مع تنويه أنها تنشط بنشر المالك
  const edgeEndpointUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/mcp`
    : null

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`نُسخ ${label}`)
    } catch {
      toast.error('تعذر النسخ — انسخه يدويًا')
    }
  }

  // ── إنشاء مفتاح (لا يظهر السر إلا هنا — لمرة واحدة) ──
  const handleCreate = async () => {
    setBusy('create')
    try {
      const res = await apiPost('/api/rise/mcp/key')
      const body = await res.json().catch(() => null)
      if (res.ok && body?.apiKey) {
        setNewKey(body.apiKey)
        setGuideOpen(true)
        toast.success('أُنشئ مفتاح MCP — انسخه الآن، لن يظهر مرة أخرى', {
          description: 'أي عميل يحمله يصل لبياناتك — لا تضعه في أماكن مشتركة',
        })
        await reload()
      } else {
        toast.error(body?.error || 'تعذر إنشاء المفتاح', {
          description: body?.code === 'PLAN_REQUIRED' ? 'ربط MCP متاح في خطة ماكس' : undefined,
        })
      }
    } catch {
      toast.error('تعذر إنشاء المفتاح')
    } finally {
      setBusy(null)
    }
  }

  // ── إبطال كل المفاتيح (يوقف كل العملاء المرتبطين فورًا) ──
  const handleRevoke = async () => {
    setBusy('revoke')
    try {
      const res = await apiDelete('/api/rise/mcp/key')
      if (res.ok) {
        setNewKey(null)
        toast.success('أُبطل المفتاح — أُوقف أي عميل كان يستخدمه')
        await reload()
      } else {
        toast.error('تعذر إبطال المفتاح')
      }
    } catch {
      toast.error('تعذر إبطال المفتاح')
    } finally {
      setBusy(null)
    }
  }

  const isMax = plan === 'max'

  return (
    <SectionCard icon={Plug} well="iw-cyan" title="ربط MCP (عميل AI خارجي)" desc="اربط Claude أو ChatGPT بأوج — ميزة خطة ماكس">
      <div className="space-y-4">
        {/* التعريف بالميزة — سطر واحد دائمًا */}
        <p className="text-xs text-muted-foreground leading-relaxed">
          وصل بياناتك (المهام، العادات، المخطط، اليوميات) لأي مساعد ذكي يدعم بروتوكول MCP — يقرأ
          يومك وينفّذ لك، بأدوات قراءة وإضافة آمنة بلا أي حذف.
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : !isMax ? (
          /* ── غير ماكس: بطاقة إحالة (لا أزرار إنشاء) ── */
          <div className="rounded-xl border border-dashed border-white/15 dark:border-white/10 p-4 bg-muted/30">
            <div className="flex items-start gap-3">
              <Bot className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="space-y-1.5">
                <p className="text-sm font-semibold">متاح في خطة ماكس</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  رقّ خطتك من قسم «الخطة والاشتراك» أعلاه لتفعيل مفتاح MCP والأدوات الثمانية.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* ── كشف المفتاح لمرة واحدة ── */}
            {newKey && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 space-y-2.5">
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <p className="text-xs font-semibold">انسخه الآن — لن يظهر مرة أخرى أبدًا</p>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 min-w-0 text-[11px] font-mono bg-card rounded-lg px-3 py-2 break-all border border-white/10" dir="ltr">
                    {newKey}
                  </code>
                  <Button size="sm" variant="outline" onClick={() => copyText(newKey, 'المفتاح')}>
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}

            {/* ── حالة المفتاح ── */}
            {keyInfo?.hasKey ? (
              <div className="rounded-xl border border-white/10 dark:border-white/5 bg-muted/30 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <code className="text-xs font-mono text-muted-foreground truncate" dir="ltr">
                      {keyInfo.masked || 'rise_••••••••'}
                    </code>
                  </div>
                  {keyInfo.lastUsedAt && (
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      آخر استخدام: {formatDateAr(keyInfo.lastUsedAt)}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={handleCreate} disabled={busy !== null}>
                    {busy === 'create' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" />
                    )}
                    استبدال المفتاح
                  </Button>
                  <Button size="sm" variant="destructive" onClick={handleRevoke} disabled={busy !== null}>
                    {busy === 'revoke' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    إبطال
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  «استبدال» يُبطل الحالي ويُصدر جديدًا (أعد ربط عملائك). «إبطال» يوقف كل الوصول
                  الخارجي فورًا — بياناتك تبقى سليمة داخل أوج.
                </p>
              </div>
            ) : (
              !newKey && (
                <Button onClick={handleCreate} disabled={busy !== null} className="w-full">
                  {busy === 'create' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <KeyRound className="w-4 h-4" />
                  )}
                  إنشاء مفتاح MCP
                </Button>
              )
            )}

            {/* ── دليل الربط (يُفتح تلقائيًا مع أول مفتاح) ── */}
            <div className="rounded-xl border border-white/10 dark:border-white/5 overflow-hidden">
              <button
                type="button"
                onClick={() => setGuideOpen((v) => !v)}
                className="w-full flex items-center justify-between gap-2 px-4 py-3 text-right hover:bg-muted/40 transition-colors"
              >
                <span className="text-xs font-semibold flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-muted-foreground" />
                  دليل الربط لأي عميل MCP
                </span>
                <span className="text-[10px] text-muted-foreground">{guideOpen ? 'إخفاء' : 'إظهار'}</span>
              </button>

              {guideOpen && (
                <div className="px-4 pb-4 space-y-3 border-t border-white/10 dark:border-white/5 pt-3">
                  {/* النقطة — الافتراضية (تطبيق أوج) */}
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold text-muted-foreground">عنوان الخادم (URL) — تطبيق أوج</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 min-w-0 text-[11px] font-mono bg-card rounded-lg px-3 py-2 truncate border border-white/10" dir="ltr">
                        {endpointUrl}
                      </code>
                      <Button size="sm" variant="outline" onClick={() => copyText(endpointUrl, 'العنوان')}>
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* النقطة — Supabase (بديل مستقل عن Vercel) */}
                  {edgeEndpointUrl && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold text-muted-foreground">
                        عنوان بديل (Supabase) — يستضيفه سيرفر أوج على Supabase نفسها
                      </p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 min-w-0 text-[11px] font-mono bg-card rounded-lg px-3 py-2 truncate border border-white/10" dir="ltr">
                          {edgeEndpointUrl}
                        </code>
                        <Button size="sm" variant="outline" onClick={() => copyText(edgeEndpointUrl, 'عنوان Supabase')}>
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        النقطتان تشتركان في نفس المفتاح والأدوات والحدود — استخدم أيّهما في عميل MCP،
                        والبديل يعمل حتى أثناء نشر تحديثات تطبيق أوج.
                      </p>
                    </div>
                  )}

                  {/* المصادقة */}
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold text-muted-foreground">المصادقة (ترويسة)</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 min-w-0 text-[11px] font-mono bg-card rounded-lg px-3 py-2 truncate border border-white/10" dir="ltr">
                        Authorization: Bearer rise_…
                      </code>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyText('Authorization: Bearer rise_…', 'الترويسة')}
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* الأدوات */}
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold text-muted-foreground">
                      الأدوات المتاحة (8) — كتابة أوضح بالعلامة
                    </p>
                    <div className="flex flex-wrap gap-1.5" dir="rtl">
                      {TOOLS_DISPLAY.map((t) => (
                        <span
                          key={t.name}
                          title={t.write ? 'أداة كتابة — تُسجَّل في سجل التدقيق' : 'أداة قراءة'}
                          className="text-[10px] font-mono border border-white/15 dark:border-white/10 rounded-full px-2 py-0.5 bg-muted/40"
                        >
                          {t.name}
                          {t.write ? ' ✎' : ''}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* مثال */}
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold text-muted-foreground">
                      مثال استدعاء (أداة create_task)
                    </p>
                    <pre
                      dir="ltr"
                      className="text-[10px] font-mono bg-card rounded-lg p-3 border border-white/10 overflow-x-auto leading-relaxed"
                    >{`{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "create_task",
    "arguments": {
      "title": "مراجعة خطة الأسبوع",
      "priority": "high"
    }
  }
}`}</pre>
                  </div>

                  {/* ربط ChatGPT تحديدًا — OAuth (10-ج) */}
                  <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setChatgptOpen((v) => !v)}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-right hover:bg-cyan-500/10 transition-colors"
                    >
                      <span className="text-[11px] font-semibold flex items-center gap-1.5">
                        <Bot className="w-3.5 h-3.5 text-cyan-500" />
                        ربط ChatGPT تحديدًا (تفويض OAuth)
                      </span>
                      <span className="text-[10px] text-muted-foreground">{chatgptOpen ? 'إخفاء' : 'إظهار'}</span>
                    </button>
                    {chatgptOpen && (
                      <div className="px-3 pb-3 space-y-2.5 border-t border-cyan-500/10 pt-2.5">
                        <p className="text-[10px] text-muted-foreground leading-relaxed">
                          ChatGPT لا يقبل مفاتيح Bearer الثابتة — يستخدم تفويض OAuth قياسيًا. فعّل
                          <b> Developer mode</b> من ChatGPT → Settings → Security، ثم من
                          <b> ChatGPT Plugins</b> أنشئ تطبيق MCP جديد والصق القيم التالية:
                        </p>
                        {oauthState === 'loading' && (
                          <div className="flex items-center justify-center py-2">
                            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                          </div>
                        )}
                        {oauthState === 'unconfigured' && (
                          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[10px] text-amber-600 dark:text-amber-400 leading-relaxed">
                            تفويض ChatGPT غير مهيأ بعد على الخادم — أبلغ إدارة أوج (يتطلب تشغيل هجرة OAuth).
                          </div>
                        )}
                        {oauthState === 'error' && (
                          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-[10px] text-red-600 leading-relaxed">
                            تعذر جلب بيانات التفويض — أعد المحاولة لاحقًا.
                          </div>
                        )}
                        {oauthState === 'ready' && oauthInfo && (
                          <div className="space-y-2">
                            {[
                              { label: 'Client ID', value: oauthInfo.clientId, copy: 'Client ID' },
                              { label: 'Client Secret', value: oauthInfo.clientSecret, copy: 'Client Secret' },
                              {
                                label: 'Authorization URL',
                                value: newKey
                                  ? `${oauthInfo.authorizeUrl}&api_key=${newKey}`
                                  : `${oauthInfo.authorizeUrl}&api_key=<مفتاحك>`,
                                copy: 'رابط التفويض',
                              },
                              { label: 'Token URL', value: oauthInfo.tokenUrl, copy: 'Token URL' },
                            ].map((f) => (
                              <div key={f.label} className="space-y-0.5">
                                <p className="text-[10px] font-semibold text-muted-foreground">{f.label}</p>
                                <div className="flex items-center gap-1.5">
                                  <code className="flex-1 min-w-0 text-[10px] font-mono bg-card rounded-lg px-2 py-1.5 break-all border border-white/10" dir="ltr">
                                    {f.value}
                                  </code>
                                  <Button size="sm" variant="outline" className="shrink-0 h-7 px-2" onClick={() => copyText(f.value, f.copy)}>
                                    <Copy className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                            {!newKey && (
                              <p className="text-[10px] text-amber-600 dark:text-amber-400 leading-relaxed">
                                ⚠️ استبدل <code dir="ltr">&lt;مفتاحك&gt;</code> في Authorization URL بمفتاحك — أو أنشئ مفتاحًا
                                جديدًا وسيظهر الرابط جاهزًا هنا تلقائيًا.
                              </p>
                            )}
                            <p className="text-[10px] text-muted-foreground leading-relaxed">
                              عند أول استخدام: ستُفتح صفحة موافقة من أوج — اضغط «تفويض» وستعود إلى ChatGPT.
                              يمكنك قطع الوصول في أي وقت بـ«إبطال» المفتاح.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    الحدود: 30 استدعاء/دقيقة و10 عمليات كتابة/دقيقة لكل حساب — وكل كتابة تُسجَّل في
                    سجل التدقيق. استبدال أو إبطال المفتاح من هنا يوقف كل العملاء فورًا.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </SectionCard>
  )
}
