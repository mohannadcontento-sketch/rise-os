import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { data } from '@/lib/data'
import {
  REQUIRED_POLICY_VERSIONS,
  CONSENT_TYPES,
} from '@/lib/policy-versions'

// ============================================================
// /api/auth/consents — المرحلة 20: قراءة سجل موافقاتي
//
// يعرض موافقات المستخدم الحالية من user_consents (هجرة 038)
// مع مقارنتها بالنُسخ المطلوبة حاليًا — بحيث تعرف الواجهة
// (والاختبارات) إن كانت النسخة السارية مقبولة أم لا.
//
// GET فقط: السجل قانوني — لا تحديث ولا حذف من جهة العميل
// (قراءة RLS: صفوفي فقط). الإدراج خادمي عبر بوابة signup.
// تدهور رشيق: قبل تطبيق 038 يعاد notReady (نمط feedback).
// ============================================================

export const dynamic = 'force-dynamic'

export const GET = withAuth(async (_req: NextRequest, userId: string) => {
  let rows: { consentType: string; policyVersion: string; consentedAt: string }[] = []
  let notReady = false

  try {
    const result = await data.consents.listOwn(userId)
    notReady = !!result.notReady
    rows = result.rows.map((r) => ({
      consentType: r.consentType,
      policyVersion: r.policyVersion,
      consentedAt: r.consentedAt,
    }))
  } catch (e) {
    console.error('[auth/consents] read failed:', e)
    return NextResponse.json(
      { error: 'تعذر قراءة سجل الموافقات' },
      { status: 500 }
    )
  }

  // هل النسخ السارية مقبولة؟ (لأغراض الواجهة والاختبار)
  const accepted = CONSENT_TYPES.every((type) =>
    rows.some(
      (r) =>
        r.consentType === type &&
        r.policyVersion ===
          (REQUIRED_POLICY_VERSIONS as Record<string, string>)[type]
    )
  )

  return NextResponse.json({
    consents: rows,
    requiredPolicyVersions: REQUIRED_POLICY_VERSIONS,
    currentVersionsAccepted: accepted,
    notReady,
  })
})
