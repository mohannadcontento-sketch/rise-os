'use client'

// ============================================================
// AdminEmailTemplateTab — «الإيميل» (المرحلة 05 — لوحة الأدمن)
//
// تطبيق قالب إيميل «إعادة تعيين كلمة المرور» (أوج RTL) على
// Supabase بضغطة واحدة — متطلب المالك: «حط قالب الايميل دا
// في سوبا بيز». المسار: POST /api/rise/admin/email-template →
// RPC admin_apply_recovery_email_template (يكتب
// auth.email_templates → type='recovery').
//
// حالات النتيجة (كلها من RPC، لا فشل صامت):
//   updated          → تم التطبيق ✓ (أخضر)
//   migration_missing→ شغّل الهجرة 026 أولًا (ذهبي)
//   table_missing    → الجدول غير متاح → اللصق اليدوي (ذهبي)
//   permission       → الصلاحية غير كافية → اللصق اليدوي
//   schema_mismatch  → بنية مختلفة → اللصق اليدوي
// + زر «نسخ HTML» مع تعليمات اللصق اليدوي كبديل دائم.
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import { Mail, Loader2, RefreshCw, Check, Copy, Info, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { apiFetch, apiPost } from '@/lib/api-fetch'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type ApplyResult = {
  applied: boolean
  reason: string
  note?: string | null
}

export function AdminEmailTemplateTab() {
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [subject, setSubject] = useState('إعادة تعيين كلمة المرور — أوج')
  const [html, setHtml] = useState('')
  const [result, setResult] = useState<ApplyResult | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await apiFetch('/api/rise/admin/email-template')
      if (r.ok) {
        const data = await r.json()
        setSubject(data.subject ?? '')
        setHtml(data.html ?? '')
      }
    } catch {
      toast.error('تعذر تحميل القالب')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const apply = async () => {
    setBusy(true)
    setResult(null)
    try {
      const r = await apiPost('/api/rise/admin/email-template', { subject })
      const data = await r.json()
      if (!r.ok) {
        toast.error(data.error || 'فشل تطبيق القالب')
        return
      }
      setResult({ applied: !!data.applied, reason: data.reason, note: data.note })
      if (data.applied) {
        toast.success('تم تطبيق قالب الإيميل في Supabase ✓')
      } else if (data.reason !== 'migration_missing') {
        toast.info('المشروع يحتاج اللصق اليدوي — التفاصيل بالأسفل')
      } else {
        toast.warning('شغّل الهجرة 026 ثم أعد المحاولة')
      }
    } catch {
      toast.error('فشل تطبيق القالب')
    } finally {
      setBusy(false)
    }
  }

  const copyHtml = async () => {
    try {
      await navigator.clipboard.writeText(html)
      toast.success('تم نسخ HTML — الصقه في Supabase Dashboard')
    } catch {
      toast.error('تعذر النسخ — انسخ من ملف docs/phase-3/recovery-email-template.html')
    }
  }

  if (loading) {
    return (
      <div className="space-y-3 pt-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-[380px] w-full" />
      </div>
    )
  }

  const reasonMeta: Record<string, { title: string; tone: 'ok' | 'warn'; body: string }> = {
    updated: { title: 'القالب مطبَّق في Supabase ✓', tone: 'ok', body: 'إيميلات إعادة تعيين كلمة المرور سترسل الآن بتصميم أوج. جرّب «نسيت كلمة المرور؟» للتحقق (الإيميل قد يتأخر دقيقة حسب قائمة البريد).' },
    migration_missing: { title: 'الهجرة 026 غير مطبقة', tone: 'warn', body: 'شغّل supabase/migrations/026_phase5_notifications_center.sql في Supabase SQL Editor (تُنشئ دالة admin_apply_recovery_email_template) ثم أعد المحاولة.' },
    table_missing: { title: 'auth.email_templates غير متاح في هذا المشروع', tone: 'warn', body: 'لا يوجد جدول قوالب بريد على مستوى قاعدة البيانات — استخدم اللصق اليدوي من الـDashboard (الخطوات بالأسفل).' },
    permission: { title: 'الصلاحية غير كافية للكتابة', tone: 'warn', body: 'دور الخادم لا يستطيع الكتابة على auth.email_templates في هذا المشروع — استخدم اللصق اليدوي من الـDashboard (الخطوات بالأسفل).' },
    schema_mismatch: { title: 'بنية الجدول غير مطابقة', tone: 'warn', body: 'بنية auth.email_templates مختلفة عن المتوقع — استخدم اللصق اليدوي من الـDashboard.' },
  }
  const meta = result ? reasonMeta[result.reason] ?? { title: result.reason, tone: 'warn' as const, body: result.note ?? '' } : null

  return (
    <div className="space-y-5 pt-4">
      {/* الرأس */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <Mail className="w-4 h-4 text-lime" />
          قالب إيميل إعادة تعيين كلمة المرور
        </h3>
        <Button variant="ghost" size="sm" onClick={load} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          تحديث
        </Button>
      </div>

      {/* النتيجة */}
      {meta && (
        <div className={cn(
          'rounded-xl border px-4 py-3 flex items-start gap-3',
          meta.tone === 'ok'
            ? 'bg-emerald-accent/10 border-emerald-accent/30'
            : 'bg-gold/[0.07] border-gold/30'
        )}>
          {meta.tone === 'ok' ? (
            <Check className="w-4 h-4 text-emerald-accent shrink-0 mt-0.5" />
          ) : (
            <Info className="w-4 h-4 text-gold shrink-0 mt-0.5" />
          )}
          <div className="min-w-0">
            <p className={cn('text-xs font-bold', meta.tone === 'ok' ? 'text-emerald-accent' : 'text-gold')}>
              {meta.title}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{meta.body}</p>
          </div>
        </div>
      )}

      {/* الموضوع */}
      <div className="space-y-1.5">
        <Label htmlFor="email-subject" className="text-xs">موضوع الإيميل</Label>
        <Input
          id="email-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="h-9 text-xs"
          maxLength={200}
          dir="rtl"
        />
        <p className="text-[10px] text-muted-foreground/70">
          يظهر في صندوق الوارد قبل فتح الرسالة — الافتراضي: «إعادة تعيين كلمة المرور — أوج»
        </p>
      </div>

      {/* المعاينة */}
      <div className="space-y-1.5">
        <Label className="text-xs">معاينة القالب (كما سيصل المستخدم)</Label>
        <div className="rounded-xl overflow-hidden border border-border bg-[#070B14]">
          <iframe
            title="معاينة قالب إيميل إعادة التعيين"
            srcDoc={html}
            sandbox=""
            className="w-full h-[430px] border-0"
            style={{ background: '#070B14' }}
          />
        </div>
        <p className="text-[10px] text-muted-foreground/70">
          المعاينة تعرض <span dir="ltr">{'{{ .ConfirmationURL }}'}</span> ومتغيرات Supabase الأخرى كما هي — في الإيميل الفعلي تُستبدل بقيم حية.
        </p>
      </div>

      {/* التطبيق */}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={apply} disabled={busy} className="gap-2 h-9">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          {result?.applied ? 'إعادة التطبيق' : 'تطبيق القالب في Supabase'}
        </Button>
        <Button variant="outline" onClick={copyHtml} disabled={!html} className="gap-2 h-9">
          <Copy className="w-3.5 h-3.5" />
          نسخ HTML (للصق اليدوي)
        </Button>
      </div>

      {/* البديل اليدوي */}
      <div className="rounded-xl border border-dashed border-border/70 px-4 py-3">
        <p className="text-[11px] font-bold text-muted-foreground flex items-center gap-1.5">
          <ExternalLink className="w-3 h-3" />
          البديل اليدوي (لو تعذّر التطبيق الآلي)
        </p>
        <ol className="mt-2 space-y-1 text-[11px] text-muted-foreground/80 list-decimal list-inside leading-relaxed">
          <li>Supabase Dashboard → Authentication → Email Templates → Reset Password.</li>
          <li>Body type: <b>HTML</b> — الصق محتوى «نسخ HTML» بالكامل.</li>
          <li>Subject: <b>{subject || 'إعادة تعيين كلمة المرور — أوج'}</b>.</li>
          <li>Save — الرابط الحي <span dir="ltr">{'{{ .ConfirmationURL }}'}</span> يعمل كما هو (تدفق PKCE لا يتغير).</li>
        </ol>
      </div>
    </div>
  )
}
