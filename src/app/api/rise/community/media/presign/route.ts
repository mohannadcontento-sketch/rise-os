import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase'
import { parseBody, communityMediaPresignSchema } from '@/lib/validators'
import {
  isCloudinaryConfigured,
  presignMediaUpload,
  buildMediaKey,
  cloudinaryStatus,
} from '@/lib/cloudinary'
import { mediaExtFor, MEDIA_UPLOAD_URL_TTL_SECONDS, MAX_IMAGE_BYTES } from '@/lib/media-constants'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

// ============================================================
// /api/rise/community/media/presign — المرحلة 07-ب (Cloudinary)
//
// POST : توقيع رفع صورة منشور — العميل يرفع الملف مباشرة إلى
//        Cloudinary (signed upload) متجاوزًا حد body الفيرسل.
//
// القرار المعماري (تحديث قرار المالك — بديل R2): الصور على
// Cloudinary، لا تخزين صور في Supabase — هذا الجدول يحمل
// المفاتيح والحساب فقط.
//
// التدفق:
//   العميل → POST {contentType, bytes}
//     ├─ 401 بدون جلسة
//     ├─ 503 STORAGE_NOT_CONFIGURED إذا لم تُضبط مفاتيح Cloudinary
//     ├─ 402 STORAGE_LIMIT عند تجاوز حصة الخطة (50MB/1GB/10GB)
//     └─ {mediaId, key, uploadUrl, apiKey, timestamp, publicId,
//         signature, cloudName} → العميل يرسل FormData (file +
//         api_key + timestamp + public_id + signature) POST إلى
//         uploadUrl مباشرة (حتى 8MB للصورة).
//
// الأمان: صف pending في media_objects يُنشأ خادميًا (المفتاح
// يولَّد هنا — العميل لا يختاره)، والحصص تحتسب من status
// pending+active، والملكية تتحقق عند تعليق المرفق بالمنشور —
// حيث يتأكد الخادم عبر Admin API أن الرفع تم فعلًا وبالحجم
// والصيغة الحقيقيين (لا نثق بأرقام العميل).
// ============================================================

const DEFAULT_FREE_STORAGE_BYTES = 52428800 // 50MB — fail-closed

export async function POST(req: NextRequest) {
  const userId = await requireUser(req)
  if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

  const parsed = await parseBody(req, communityMediaPresignSchema)
  if (!parsed.ok || !parsed.data) return parsed.response!

  const { contentType, bytes } = parsed.data

  // 1) Cloudinary مضبوط؟ (رسالة صريحة ترشد للتفعيل)
  if (!(await isCloudinaryConfigured())) {
    return NextResponse.json(
      {
        error: 'تخزين الصور غير مفعّل بعد — أضف مفاتيح Cloudinary (CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET)',
        code: 'STORAGE_NOT_CONFIGURED',
        storage: await cloudinaryStatus(),
      },
      { status: 503 },
    )
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'قاعدة البيانات غير مهيأة' }, { status: 500 })
  }

  const admin = await getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: 'خطأ في تكوين الخادم' }, { status: 500 })

  // 2) حصة التخزين حسب الخطة (المصدر: plan_entitlements.storage_limit)
  const { data: plan } = await (admin as any).rpc('effective_plan', { p_user: userId })
  const planCode: string = (plan as string) || 'free'

  const { data: ent } = await (admin as any)
    .from('plan_entitlements')
    .select('storage_limit')
    .eq('plan_code', planCode)
    .eq('feature_key', 'community.post')
    .maybeSingle()
  const limitBytes: number =
    typeof ent?.storage_limit === 'number' && ent.storage_limit > 0
      ? ent.storage_limit
      : DEFAULT_FREE_STORAGE_BYTES

  const { data: usageRows } = await (admin as any)
    .from('media_objects')
    .select('bytes')
    .eq('user_id', userId)
    .in('status', ['pending', 'active'])
  const usedBytes: number = (usageRows ?? []).reduce(
    (acc: number, r: { bytes: number }) => acc + (Number(r.bytes) || 0),
    0,
  )

  if (usedBytes + bytes > limitBytes) {
    const usedMb = (usedBytes / 1048576).toFixed(1)
    const limitMb = (limitBytes / 1048576).toFixed(0)
    return NextResponse.json(
      {
        error: `مساحة المرفقات ممتلئة — استخدمت ${usedMb}MB من ${limitMb}MB. احذف منشورات قديمة بصورها أو رقّي خطتك.`,
        code: 'STORAGE_LIMIT',
        usage: {
          feature: 'media.storage',
          featureLabel: 'مساحة المرفقات',
          reason: 'storage_limit',
          plan: planCode,
          usedBytes,
          limitBytes,
        },
      },
      { status: 402 },
    )
  }

  // 3) مفتاح خادمي + صف pending + توقيع الرفع
  const ext = mediaExtFor(contentType)
  const key = buildMediaKey(userId, contentType, ext)

  const { data: obj, error: insertErr } = await (admin as any)
    .from('media_objects')
    .insert({
      user_id: userId,
      kind: 'community_post',
      object_key: key,
      bytes: Math.min(bytes, MAX_IMAGE_BYTES),
      content_type: contentType,
      status: 'pending',
    })
    .select('id')
    .single()

  if (insertErr || !obj) {
    console.warn('[community/media/presign] insert failed:', insertErr?.message)
    return NextResponse.json({ error: 'تعذّر بدء الرفع — أعد المحاولة' }, { status: 500 })
  }

  const presigned = await presignMediaUpload(key)
  if (!presigned) {
    console.warn('[community/media/presign] cloudinary presign failed')
    return NextResponse.json({ error: 'تعذّر توليد توقيع الرفع — أعد المحاولة' }, { status: 500 })
  }

  await logAudit(req, userId, 'community-media-presign', {
    resource: 'media_objects',
    resourceId: obj.id,
    details: { contentType, bytes, key },
  })

  return NextResponse.json(
    {
      mediaId: obj.id,
      key,
      uploadUrl: presigned.uploadUrl,
      cloudName: presigned.cloudName,
      apiKey: presigned.apiKey,
      timestamp: presigned.timestamp,
      publicId: presigned.publicId,
      signature: presigned.signature,
      expiresIn: MEDIA_UPLOAD_URL_TTL_SECONDS,
    },
    { status: 201 },
  )
}
