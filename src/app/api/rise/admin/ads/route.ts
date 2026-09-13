import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, logAudit } from '@/lib/audit'
import { getSupabaseAdmin } from '@/lib/supabase'
import { parseBody } from '@/lib/validators'
import { adminAdsActionSchema } from '@/lib/validators'
import { resetAdsConfigCache, DEFAULT_ADSENSE_CLIENT_ID, AD_PLACEMENTS } from '@/lib/ads/config'

export const dynamic = 'force-dynamic'

// ============================================================
// /api/rise/admin/ads — المرحلة 11 (الوحدة الناقصة: Ads UI)
//
// الغرض: إدارة الإعلانات من اللوحة دون لمس SQL — الخطة (المرحلة
// العاشرة/Admin) تنص على «إنشاء وتشغيل/إيقاف وإدارة placements».
// المصدر الفعلي للقراءة في العرض يظل src/lib/ads/config.ts
// (ترتيب: env ← app_config ← الافتراضي المدمج).
//
// GET  : القيم الحالية من app_config مباشرة (بلا كاش 10 دقائق —
//        الأدمن يرى الحقيقة، لا نسخة قديمة) + مواضع العرض الثابتة.
// POST : { action }:
//   • set           : enabled? / adsenseClientId? / slots?{home,
//                     community, tasks} — كتابة app_config
//                     (slot فارغ = حذف المفتاح ← يظهر إعلان البيت).
//   • direct-ad-save  : إعلان مباشر جديد/تعديل (id فريد) — JSON
//                     في مفتاح direct_ads.
//   • direct-ad-delete: حذف إعلان بالـid.
// كل كتابة: logAudit + إبطال كاش الإعلانات في نفس النسخة.
// ملاحظة انتشار: نسخ Lambda أخرى قد تخدم القيمة القديمة حتى
// 10 دقائق (كاش getAdsConfig) — موثّق في الواجهة.
// ============================================================

function jsonOk(payload: Record<string, unknown>) {
  return NextResponse.json(payload)
}

/** قراءة app_config مباشرة (service_role — بلا كاش) */
async function readConfigKeys(keys: string[]): Promise<Record<string, string>> {
  const admin = await getSupabaseAdmin()
  if (!admin) throw new Error('db-unavailable')
  const sb = admin as any
  const { data, error } = await sb.from('app_config').select('key, value').in('key', keys)
  if (error) throw new Error(error.message)
  const map: Record<string, string> = {}
  for (const row of data ?? []) map[row.key] = row.value
  return map
}

async function upsertConfig(sb: any, key: string, value: string) {
  const { error } = await sb
    .from('app_config')
    .upsert({ key, value }, { onConflict: 'key' })
  if (error) throw new Error(`upsert ${key}: ${error.message}`)
}

async function deleteConfig(sb: any, key: string) {
  const { error } = await sb.from('app_config').delete().eq('key', key)
  if (error) throw new Error(`delete ${key}: ${error.message}`)
}

export async function GET(request: NextRequest) {
  try {
    const adminId = await requireAdmin(request)
    if (!adminId) {
      return NextResponse.json({ error: 'غير مصرح - أدمن فقط' }, { status: 403 })
    }

    const map = await readConfigKeys([
      'ads_enabled',
      'adsense_client_id',
      'adsense_slot_home',
      'adsense_slot_community',
      'adsense_slot_tasks',
      'direct_ads',
    ])

    let directAds: unknown[] = []
    if (map.direct_ads) {
      try {
        const parsed = JSON.parse(map.direct_ads)
        if (Array.isArray(parsed)) directAds = parsed
      } catch {
        directAds = []
      }
    }

    return jsonOk({
      enabled: map.ads_enabled === undefined ? true : map.ads_enabled === 'true',
      adsenseClientId: map.adsense_client_id || DEFAULT_ADSENSE_CLIENT_ID,
      slots: {
        home: map.adsense_slot_home || '',
        community: map.adsense_slot_community || '',
        tasks: map.adsense_slot_tasks || '',
      },
      directAds,
      placements: Object.entries(AD_PLACEMENTS).map(([id, p]) => ({ id, labelAr: p.labelAr })),
    })
  } catch (error) {
    console.error('[admin/ads] GET error:', error)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const adminId = await requireAdmin(request)
    if (!adminId) {
      return NextResponse.json({ error: 'غير مصرح - أدمن فقط' }, { status: 403 })
    }

    const parsed = await parseBody(request, adminAdsActionSchema)
    if (!parsed.ok || !parsed.data) return parsed.response!
    const input = parsed.data

    const admin = await getSupabaseAdmin()
    if (!admin) return NextResponse.json({ error: 'تعذر الاتصال بقاعدة البيانات' }, { status: 500 })
    const sb = admin as any

    // ── set: البوابة العامة + معرف الناشر + المواضع ──
    if (input.action === 'set') {
      if (input.enabled !== undefined) {
        await upsertConfig(sb, 'ads_enabled', input.enabled ? 'true' : 'false')
      }
      if (input.adsenseClientId !== undefined) {
        await upsertConfig(sb, 'adsense_client_id', input.adsenseClientId)
      }
      if (input.slots) {
        for (const placement of ['home', 'community', 'tasks'] as const) {
          const value = input.slots[placement]
          if (value === undefined) continue
          const key = `adsense_slot_${placement}`
          if (value === '') {
            // فراغ = إزالة المفتاح ← يعرض إعلان البيت بدل الوحدة
            await deleteConfig(sb, key)
          } else {
            await upsertConfig(sb, key, value)
          }
        }
      }

      await logAudit(request, adminId, 'ads-config-set', {
        resource: 'app_config',
        resourceId: 'ads',
        details: {
          enabled: input.enabled,
          adsenseClientId: input.adsenseClientId,
          slots: input.slots,
        },
      })

      resetAdsConfigCache()
      return jsonOk({ success: true, message: 'تم حفظ إعدادات الإعلانات (قد تتأخر حتى 10 دقائق على كل النسخ).' })
    }

    // ── direct-ad-save / direct-ad-delete: قائمة direct_ads ──
    const map = await readConfigKeys(['direct_ads'])
    let ads: Array<Record<string, unknown>> = []
    if (map.direct_ads) {
      try {
        const parsedAds = JSON.parse(map.direct_ads)
        if (Array.isArray(parsedAds)) ads = parsedAds
      } catch {
        ads = []
      }
    }

    if (input.action === 'direct-ad-save') {
      const ad = input.ad
      const idx = ads.findIndex((a) => a.id === ad.id)
      if (idx >= 0) ads[idx] = ad
      else ads.push(ad)
    } else {
      // direct-ad-delete
      ads = ads.filter((a) => a.id !== input.id)
    }

    await upsertConfig(sb, 'direct_ads', JSON.stringify(ads))

    await logAudit(request, adminId, input.action === 'direct-ad-save' ? 'ads-direct-ad-save' : 'ads-direct-ad-delete', {
      resource: 'app_config',
      resourceId: 'direct_ads',
      details: { adId: input.action === 'direct-ad-save' ? input.ad.id : input.id, count: ads.length },
    })

    resetAdsConfigCache()
    return jsonOk({
      success: true,
      message: input.action === 'direct-ad-save' ? 'تم حفظ الإعلان المباشر.' : 'تم حذف الإعلان المباشر.',
      directAds: ads,
    })
  } catch (error) {
    console.error('[admin/ads] POST error:', error)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}
