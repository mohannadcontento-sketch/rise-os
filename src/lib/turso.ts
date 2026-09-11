// ============================================================
// turso.ts — عميل Turso (libSQL) لمسار بيانات المجتمع العام.
//
// القرار المعماري (وثيقة النطاق §4 — قرار المالك 11 سبتمبر):
//   «المجتمع على Turso من اليوم الأول — لتخفيف الضغط عن Supabase
//    وفصل مسار البيانات العامة منذ البداية».
//
// الوضع الحالي (شيد: dual-write مع سلوك fail-open):
//   • Supabase يبقى مصدر الحقيقة (RLS، الحظر داخل DB، العدادات،
//     الإشعارات) — كل الكتابات تنجح أولًا هناك.
//   • Turso نسخة مرآة للبيانات العامة (members/posts/comments/
//     reactions) تُكتب بعد كل نجاح (انظر community-sync.ts).
//   • بدون TURSO_DATABASE_URL/TURSO_AUTH_TOKEN: كل المزامنة
//     تتعطل بأمان (no-op) — لا شيء ينكسر.
//   • القراءة تبقى من Supabase حتى التحقق من المزامنة ثم قلب
//     TURSO_READ_MODE لاحقًا (خطوة موثقة، غير مفعلة عمدًا).
//
// التفعيل: متغيرات بيئة في Vercel (انظر .env.example):
//   TURSO_DATABASE_URL (libsql://… أو https://…) + TURSO_AUTH_TOKEN
//
// للخادم فقط. يدعم كذلك url بصيغة file: للاختبار المحلي.
// ============================================================

import { createClient, type Client } from '@libsql/client'

let cachedClient: Client | null = null
let cacheUrl: string | null = null

function tursoUrl(): string | null {
  const url = process.env.TURSO_DATABASE_URL
  if (!url || !url.trim()) return null
  return url.trim()
}

export function isTursoConfigured(): boolean {
  return tursoUrl() !== null
}

/** عميل مفرد كسول — null عند غياب الإعداد */
export function getTursoClient(): Client | null {
  const url = tursoUrl()
  if (!url) return null
  if (!cachedClient || cacheUrl !== url) {
    cachedClient = createClient({
      url,
      authToken: process.env.TURSO_AUTH_TOKEN || undefined,
    })
    cacheUrl = url
  }
  return cachedClient
}

/** حالة الربط (للأدمن/التشخيص — المضيف فقط، لا الرمز السري) */
export function tursoStatus(): { configured: boolean; host: string | null; readMode: boolean } {
  const url = tursoUrl()
  let host: string | null = null
  if (url) {
    try {
      host = new URL(url).host || url.replace(/^[a-z]+:\/\//, '').split('/')[0] || 'local-file'
    } catch {
      host = 'local-file'
    }
  }
  return {
    configured: !!url,
    host,
    readMode: process.env.TURSO_READ_MODE === 'true',
  }
}
