// ============================================================
// r2.ts — عميل Cloudflare R2 (متوافق S3) لمرفقات الوسائط.
//
// القرار المعماري (وثيقة النطاق §4 — قرار المالك 11 سبتمبر):
//   • الصور والمرفقات على Cloudflare R2 — صفر رسوم egress،
//     ولا تخزين صور في Supabase أبدًا.
//   • الصور تُقدَّم عبر signed URLs مؤقتة (لا روابط عامة دائمة
//     إلا إذا ضبط المالك R2_PUBLIC_BASE_URL عمدًا لمحتوى عام).
//
// التفعيل: متغيرات بيئة في Vercel (انظر .env.example):
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
//   R2_PUBLIC_BASE_URL (اختياري)
// بدون هذه المفاتيح: كل الدوال تتراجع بأمان (null/false) —
// التطبيق يعمل نصيًا كما كان، ورفع الصور يرجّع 503 واضحًا.
//
// هذا الملف للخادم فقط (يستورد AWS SDK) — لا تستورده من
// مكونات العميل أبدًا.
// ============================================================

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

interface R2Config {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  publicBaseUrl: string | null
}

let cachedClient: S3Client | null = null

function r2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicBaseUrl: process.env.R2_PUBLIC_BASE_URL?.replace(/\/+$/, '') || null,
  }
}

/** هل R2 مضبوط بمفاتيح كاملة؟ */
export function isR2Configured(): boolean {
  return r2Config() !== null
}

function getR2Client(): S3Client | null {
  const cfg = r2Config()
  if (!cfg) return null
  if (!cachedClient) {
    cachedClient = new S3Client({
      region: 'auto',
      endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
    })
  }
  return cachedClient
}

/** حالة الربط (للأدمن/التشخيص — لا أسرار) */
export function r2Status(): { configured: boolean; bucket: string | null; publicReads: boolean } {
  const cfg = r2Config()
  return {
    configured: !!cfg,
    bucket: cfg?.bucket ?? null,
    publicReads: !!cfg?.publicBaseUrl,
  }
}

/** مفتاح كائن: community/<userId>/<uuid>.<ext> */
export function buildMediaKey(userId: string, contentType: string, ext: string): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  return `community/${userId}/${rand}.${ext}`
}

/** رابط رفع موقّع (PUT مباشرة من المتصفح إلى R2 — يتجاوز حد body الفيرسل) */
export async function presignMediaPut(
  key: string,
  contentType: string,
  expiresIn = 600,
): Promise<string | null> {
  const client = getR2Client()
  const cfg = r2Config()
  if (!client || !cfg) return null
  try {
    return await getSignedUrl(
      client,
      new PutObjectCommand({ Bucket: cfg.bucket, Key: key, ContentType: contentType }),
      { expiresIn },
    )
  } catch (e) {
    console.warn('[r2] presign PUT failed:', (e as Error)?.message)
    return null
  }
}

/** رابط قراءة: signed URL مؤقت، أو رابط عام إذا ضُبط R2_PUBLIC_BASE_URL */
export async function presignMediaGet(
  key: string,
  expiresIn = 3600,
): Promise<string | null> {
  const cfg = r2Config()
  if (!cfg) return null
  if (cfg.publicBaseUrl) return `${cfg.publicBaseUrl}/${key}`
  const client = getR2Client()
  if (!client) return null
  try {
    return await getSignedUrl(client, new GetObjectCommand({ Bucket: cfg.bucket, Key: key }), { expiresIn })
  } catch (e) {
    console.warn('[r2] presign GET failed:', (e as Error)?.message)
    return null
  }
}

/** حذف كائن (best-effort — لا يرمي أبدًا) */
export async function deleteMediaObject(key: string): Promise<void> {
  const client = getR2Client()
  const cfg = r2Config()
  if (!client || !cfg) return
  try {
    await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }))
  } catch (e) {
    console.warn('[r2] delete failed (ignored):', (e as Error)?.message)
  }
}

/** عنصر ميديا كما يظهر في استجابات API */
export interface MediaItemDTO {
  key: string
  contentType: string
  bytes: number
  url: string | null
}

/**
 * يوقّع روابط قراءة لعناصر media المرفقة بالمنشورات.
 * - R2 غير مضبوط → url: null (العميل يعرض حالة «غير متاح»).
 * - التوقيع محلي (HMAC) — لا نداء شبكة، آمن لكل عنصر في الخلاصة.
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
      url: await presignMediaGet(m.key),
    })
  }
  return out
}
