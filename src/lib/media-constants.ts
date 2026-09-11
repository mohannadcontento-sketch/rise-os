// ============================================================
// media-constants.ts — ثوابت مرفقات الوسائط (المرحلة 07-ب)
//
// وحدة نقية بلا أي استيراد ثقيل — آمنة للاستيراد من الخادم
// والعميل معًا (zod / cloudinary / routes / واجهة الكومبوزر).
//
// القرار المعماري (تحديث قرار المالك — بديل R2):
// الصور والمرفقات على Cloudinary — لا تخزين صور في Supabase.
// ============================================================

export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const

export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number]

/** سقف الصورة الواحدة (8MB — فوق حد body الفيرسل 4.5MB، لذا
 *  الرفع يسير POST موقّعًا مباشرة من المتصفح إلى Cloudinary). */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024

/** أقصى عدد صور في المنشور الواحد */
export const MAX_MEDIA_PER_POST = 4

/** صلاحية توقيع الرفع (دقائق) */
export const MEDIA_UPLOAD_URL_TTL_SECONDS = 600

/** صلاحية رابط القراءة الموقّع (ساعة) — يُترك للتوثيق؛ روابط
 *  Cloudinary CDN دائمة المفتاح (UUID غير قابل للتخمين) */
export const MEDIA_READ_URL_TTL_SECONDS = 3600

/** امتداد ملف لكل نوع مسموح (لمفاتيح الكائنات — نفس البنية عبر R2/Cloudinary) */
export function mediaExtFor(contentType: string): string {
  switch (contentType) {
    case 'image/jpeg': return 'jpg'
    case 'image/png': return 'png'
    case 'image/webp': return 'webp'
    case 'image/gif': return 'gif'
    default: return 'bin'
  }
}

/** هل النوع مسموح؟ (للتحقق المشترك عميل/خادم) */
export function isAllowedImageType(ct: string): ct is AllowedImageType {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(ct)
}
