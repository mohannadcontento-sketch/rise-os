/**
 * cloudinary-sign-test.ts — اختبار وحدة لمكتبة Cloudinary (بلا حساب حقيقي).
 *
 * يتحقق من:
 *   1) بنية المفتاح تطابق CHECK قاعدة البيانات (community_media_valid)
 *   2) publicIdFromKey/extFromKey
 *   3) توقيع الرفع = SHA-1 للمعاملات مرتبة أبجديًا + api_secret
 *      (خوارزمية Cloudinary الموثقة)
 *   4) رابط التسليم CDN (f_auto,q_auto)
 *   5) signMediaForApi يرسم url/null كما يجب
 *   6) إعداد env يعمل وcache يُبطَل
 *
 * تشغيل: bun scripts/cloudinary-sign-test.ts
 */
import { createHash } from 'node:crypto'

process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud'
process.env.CLOUDINARY_API_KEY = '123456789012345'
process.env.CLOUDINARY_API_SECRET = 'test-secret-abcdef'

const mod = await import('../src/lib/cloudinary.ts')
const {
  buildMediaKey,
  publicIdFromKey,
  extFromKey,
  presignMediaUpload,
  deliveryUrlFor,
  signMediaForApi,
  getCloudinaryConfig,
  isCloudinaryConfigured,
  resetCloudinaryCache,
} = mod as any

let failed = 0
const check = (label: string, ok: boolean, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${label}${extra ? ' — ' + extra : ''}`)
  if (!ok) failed++
}

// 1) بنية المفتاح = نفس CHECK الإنتاج
const KEY_RE = /^community\/[A-Za-z0-9-]+\/[A-Za-z0-9-]+\.(jpg|png|webp|gif)$/
const key = buildMediaKey('11111111-1111-4111-8111-111111111111', 'image/jpeg', 'jpg')
check('بنية المفتاح تطابق CHECK قاعدة البيانات', KEY_RE.test(key), key)
const key2 = buildMediaKey('u', 'image/png', 'png')
check('مفاتيح مختلفة لكل استدعاء', key !== key2)

// 2) publicId/ext
check('publicIdFromKey يشيل الامتداد', publicIdFromKey(key) === key.replace(/\.jpg$/, ''))
check('extFromKey يرجّع الامتداد', extFromKey(key) === 'jpg')
check('extFromKey لمفتاح بلا امتداد → null', extFromKey('community/a/b') === null)

// 3) التوقيع — نعيد حسابه يدويًا ونقارن
const pres = await presignMediaUpload(key)
const expected = createHash('sha1')
  .update(`public_id=${publicIdFromKey(key)}&timestamp=${pres.timestamp}test-secret-abcdef`)
  .digest('hex')
check('توقيع SHA-1 (معاملات مرتبة + secret)', pres.signature === expected)
check('uploadUrl بصيغة Cloudinary', pres.uploadUrl === 'https://api.cloudinary.com/v1_1/test-cloud/image/upload')
check('apiKey/timestamp/publicId موجودة', pres.apiKey === '123456789012345' && typeof pres.timestamp === 'number' && pres.publicId === publicIdFromKey(key))

// 4) رابط التسليم
const url = await deliveryUrlFor(key)
check(
  'رابط CDN مع f_auto,q_auto',
  url === `https://res.cloudinary.com/test-cloud/image/upload/f_auto,q_auto/${publicIdFromKey(key)}.jpg`,
  url,
)

// 5) signMediaForApi
const signed = await signMediaForApi([
  { key, contentType: 'image/jpeg', bytes: 100 },
  { key: 'community/x/y.png', contentType: 'image/png', bytes: 50 },
])
check('signMediaForApi يبني الروابط', signed?.length === 2 && signed[0].url?.includes('res.cloudinary.com') && signed[1].url?.endsWith('.png'))
check('signMediaForApi null/[]/فارغ', (await signMediaForApi(null)) === null && (await signMediaForApi([]))?.length === 0)

// 6) الإعداد + cache
check('env يعمل', (await isCloudinaryConfigured()) === true)
delete process.env.CLOUDINARY_CLOUD_NAME
delete process.env.CLOUDINARY_API_KEY
delete process.env.CLOUDINARY_API_SECRET
resetCloudinaryCache()
// بلا env: app_config عبر service role غير متاح هنا → غير مضبوط
const cfg = await getCloudinaryConfig()
check('بدون env → غير مضبوط (تدرّج آمن)', cfg === null)
check('presign بدون إعداد → null', (await presignMediaUpload(key)) === null)
check('deliveryUrl بدون إعداد → null', (await deliveryUrlFor(key)) === null)
check('verifyMediaUploads بدون إعداد → null', (await mod.verifyMediaUploads([key])) === null)
check('deleteMediaObject بدون إعداد لا يرمي', await mod.deleteMediaObject(key) === undefined)

console.log(failed === 0 ? '\n🎉 CLOUDINARY SIGN TEST: ALL PASS' : `\n💥 ${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
