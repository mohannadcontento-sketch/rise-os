// ============================================================
// cloudinary.ts — عميل Cloudinary لمرفقات الوسائط.
//
// القرار المعماري (تحديث قرار المالك — سبتمبر 2026، بديل R2):
//   • الصور والمرفقات على Cloudinary — CDN عالمي + تحويلات
//     f_auto/q_auto، ولا تخزين صور في Supabase أبدًا.
//   • الرفع موقّع من الخادم لكن يسير مباشرة من المتصفح إلى
//     Cloudinary (يتجاوز حد body الفيرسل 4.5MB — حتى 8MB).
//
// ترتيب قراءة الإعداد (env أولًا — مسار الترقية للمالك):
//   1. CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY /
//      CLOUDINARY_API_SECRET (متغيرات بيئة Vercel)
//   2. جدول app_config في Supabase (قراءة service_role فقط —
//      RLS بلا policies = fail-closed؛ نفس نمط VAPID)
//
// بدون مفاتيح: كل الدوال تتراجع بأمان (null) — التطبيق يعمل
// نصيًا كما كان، ورفع الصور يرجّع 503 واضحًا.
//
// هذا الملف للخادم فقط (node:crypto) — لا تستورده من مكونات
// العميل أبدًا.
// ============================================================

import { createHash } from 'node:crypto'

export interface CloudinaryConfig {
  cloudName: string
  apiKey: string
  apiSecret: string
}

let cached: { at: number; config: CloudinaryConfig | null } | null = null
const CACHE_MS = 10 * 60 * 1000

/** تحويلات التسليم: صيغة تلقائية + جودة تلقائية (CDN) */
const DELIVERY_TRANSFORM = 'f_auto,q_auto'

export async function getCloudinaryConfig(): Promise<CloudinaryConfig | null> {
  // 1) متغيرات البيئة أولًا
  const envCloud = process.env.CLOUDINARY_CLOUD_NAME?.trim()
  const envKey = process.env.CLOUDINARY_API_KEY?.trim()
  const envSecret = process.env.CLOUDINARY_API_SECRET?.trim()
  if (envCloud && envKey && envSecret) {
    return { cloudName: envCloud, apiKey: envKey, apiSecret: envSecret }
  }

  // 2) كاش (يشمل null — لا نضرب DB مع كل طلب)
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.config

  // 3) app_config عبر service_role
  const config = await readFromDb()
  cached = { at: Date.now(), config }
  return config
}

async function readFromDb(): Promise<CloudinaryConfig | null> {
  try {
    const { getSupabaseAdmin } = await import('@/lib/supabase')
    const admin = await getSupabaseAdmin()
    if (!admin) return null

    const { data, error } = await (admin as any)
      .from('app_config')
      .select('key, value')
      .in('key', ['cloudinary_cloud_name', 'cloudinary_api_key', 'cloudinary_api_secret'])

    if (error) {
      console.warn('[cloudinary] app_config unavailable:', error.message)
      return null
    }

    const map: Record<string, string> = {}
    for (const row of data ?? []) map[row.key] = row.value

    if (!map.cloudinary_cloud_name || !map.cloudinary_api_key || !map.cloudinary_api_secret) {
      return null
    }
    return {
      cloudName: map.cloudinary_cloud_name,
      apiKey: map.cloudinary_api_key,
      apiSecret: map.cloudinary_api_secret,
    }
  } catch (err) {
    console.warn('[cloudinary] read failed:', (err as Error)?.message)
    return null
  }
}

/** اختبار الوحدة: إبطال الكاش بعد تحديث المفاتيح */
export function resetCloudinaryCache(): void {
  cached = null
}

/** هل Cloudinary مضبوط بمفاتيح كاملة؟ (env أو app_config) */
export async function isCloudinaryConfigured(): Promise<boolean> {
  return (await getCloudinaryConfig()) !== null
}

/** حالة الربط (للأدمن/التشخيص — لا أسرار) */
export async function cloudinaryStatus(): Promise<{
  configured: boolean
  cloudName: string | null
}> {
  const cfg = await getCloudinaryConfig()
  return { configured: !!cfg, cloudName: cfg?.cloudName ?? null }
}

// ─────────────── المفاتيح (نفس بنية R2 — CHECK في DB مطابق) ───────────────

/** مفتاح كائن: community/<userId>/<uuid>.<ext> (موحّد مع CHECK قاعدة البيانات) */
export function buildMediaKey(userId: string, _contentType: string, ext: string): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  return `community/${userId}/${rand}.${ext}`
}

/** public_id في Cloudinary = المفتاح دون الامتداد (Cloudinary يستخرج الصيغة من الملف نفسه) */
export function publicIdFromKey(key: string): string {
  return key.replace(/\.(jpg|png|webp|gif)$/, '')
}

/** الامتداد من نهاية المفتاح */
export function extFromKey(key: string): string | null {
  const m = key.match(/\.(jpg|png|webp|gif)$/)
  return m ? m[1] : null
}

// ─────────────── الرفع الموقّع (مباشرة من المتصفح) ───────────────

export interface MediaUploadPresign {
  uploadUrl: string
  cloudName: string
  apiKey: string
  timestamp: number
  publicId: string
  signature: string
}

/**
 * توليد توقيع رفع موقّع (SHA-1 للمعاملات مرتبة أبجديًا + api_secret —
 * خوارزمية Cloudinary القياسية للـsigned upload).
 * العميل يرسل FormData: file + api_key + timestamp + public_id + signature.
 */
export async function presignMediaUpload(key: string): Promise<MediaUploadPresign | null> {
  const cfg = await getCloudinaryConfig()
  if (!cfg) return null
  const publicId = publicIdFromKey(key)
  const timestamp = Math.floor(Date.now() / 1000)
  // المعاملات الموقّعة: public_id + timestamp (مرتبة أبجديًا)
  const toSign = `public_id=${publicId}&timestamp=${timestamp}${cfg.apiSecret}`
  const signature = createHash('sha1').update(toSign).digest('hex')
  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${cfg.cloudName}/image/upload`,
    cloudName: cfg.cloudName,
    apiKey: cfg.apiKey,
    timestamp,
    publicId,
    signature,
  }
}

// ─────────────── التسليم (روابط CDN عامة — مفتاح UUID غير قابل للتخمين) ───────────────

/** رابط تسليم الصورة من المفتاح (f_auto,q_auto — CDN) أو null إذا لم يُضبط الحساب */
export async function deliveryUrlFor(key: string): Promise<string | null> {
  const cfg = await getCloudinaryConfig()
  if (!cfg) return null
  const ext = extFromKey(key)
  if (!ext) return null
  return `https://res.cloudinary.com/${cfg.cloudName}/image/upload/${DELIVERY_TRANSFORM}/${publicIdFromKey(key)}.${ext}`
}

/** عنصر ميديا كما يظهر في استجابات API */
export interface MediaItemDTO {
  key: string
  contentType: string
  bytes: number
  url: string | null
}

/**
 * يحوّل مفاتيح media المرفقة بالمنشورات إلى روابط تسليم.
 * - Cloudinary غير مضبوط → url: null (العميل يعرض حالة «غير متاح»).
 * - لا نداء شبكة — الروابط تُبنى محليًا من المفتاح (آمن لكل عنصر).
 */
export async function signMediaForApi(
  media: { key: string; contentType?: string; bytes?: number }[] | null | undefined,
): Promise<MediaItemDTO[] | null> {
  if (!media || !Array.isArray(media) || media.length === 0) return media === null || media === undefined ? null : []
  const out: MediaItemDTO[] = []
  for (const m of media) {
    if (!m || typeof m.key !== 'string') continue
    out.push({
      key: m.key,
      contentType: typeof m.contentType === 'string' ? m.contentType : 'application/octet-stream',
      bytes: typeof m.bytes === 'number' ? m.bytes : 0,
      url: await deliveryUrlFor(m.key),
    })
  }
  return out
}

// ─────────────── Admin API (تحقق + حذف) ───────────────

export interface VerifiedMediaInfo {
  format: string
  bytes: number
}

function adminAuth(cfg: CloudinaryConfig): string {
  return `Basic ${Buffer.from(`${cfg.apiKey}:${cfg.apiSecret}`).toString('base64')}`
}

/**
 * التحقق من أن الرفع تم فعلًا عبر Admin API (قراءة الموارد بـ public_ids)
 * — يعطي الصيغة والحجم الفعليين (حساب الحصة من أرقام موثوقة لا مزعومة).
 * ترجع null إذا لم يُضبط الحساب أو فشل النداء (تدرّج آمن — مثل سلوك R2
 * السابق حيث لم يكن هناك تحقق أصلاً)؛ خريطة فارغة = الرفع لم يحدث.
 */
export async function verifyMediaUploads(keys: string[]): Promise<Map<string, VerifiedMediaInfo> | null> {
  const cfg = await getCloudinaryConfig()
  if (!cfg || keys.length === 0) return null
  try {
    const ids = [...new Set(keys.map(publicIdFromKey))]
    const params = new URLSearchParams()
    for (const id of ids) params.append('public_ids[]', id)
    params.set('max_results', '500')
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${cfg.cloudName}/resources/image/upload?${params.toString()}`,
      { headers: { Authorization: adminAuth(cfg) }, signal: AbortSignal.timeout(10_000) },
    )
    if (!res.ok) {
      console.warn('[cloudinary] admin verify failed:', res.status)
      return null
    }
    const body = (await res.json()) as { resources?: Array<{ public_id: string; format: string; bytes: number }> }
    const map = new Map<string, VerifiedMediaInfo>()
    for (const r of body.resources ?? []) {
      map.set(r.public_id, { format: r.format, bytes: Number(r.bytes) || 0 })
    }
    return map
  } catch (e) {
    console.warn('[cloudinary] admin verify error (degraded):', (e as Error)?.message)
    return null
  }
}

/** حذف كائن (Admin API — best-effort، لا ترمي أبدًا) */
export async function deleteMediaObject(key: string): Promise<void> {
  const cfg = await getCloudinaryConfig()
  if (!cfg) return
  try {
    const params = new URLSearchParams()
    params.append('public_ids[]', publicIdFromKey(key))
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${cfg.cloudName}/resources/image/upload?${params.toString()}`,
      { method: 'DELETE', headers: { Authorization: adminAuth(cfg) }, signal: AbortSignal.timeout(10_000) },
    )
    if (!res.ok) console.warn('[cloudinary] delete failed:', res.status)
  } catch (e) {
    console.warn('[cloudinary] delete error (ignored):', (e as Error)?.message)
  }
}
