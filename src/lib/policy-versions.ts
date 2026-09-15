import { LEGAL_LAST_UPDATED } from '@/lib/site'

// ============================================================
// policy-versions.ts — المرحلة 20: نسخ السياسات المطلوبة للموافقة
//
// مصدر واحد لنسخ الشروط وسياسة الخصوصية التي يُطلب قبولها عند
// إنشاء الحساب: القيمة من LEGAL_LAST_UPDATED (site.ts) — نفس
// المرجع الذي تعرضه صفحتا /terms و /privacy («مرجع النسخة»).
// عند تحديث النصوص القانونية تتغير القيمة هناك تلقائيًا فيصبح
// إصدار الموافقة الجديد مطلوبًا في كل التسجيلات الجديدة.
//
// هذه الوحدة ثوابت خالصة (آمنة للعميل والخادم معًا). تجزئة
// بصمات التدقيق (SHA-256) في مسار signup الخادمي فقط.
//
// آلية الرفض الخادمي (بند الخطة):
//   - العميل يرسل { acceptedTerms: true, policyVersions } مع
//     النسختين التي رآها عند القبول.
//   - الخادم يقارنها بـ REQUIRED_POLICY_VERSIONS:
//       بلا قبول            → 403 CONSENT_REQUIRED
//       نسخة لا تطابق        → 409 POLICY_VERSION_MISMATCH
//       (صفحة قانونية قديمة مخبأة عند العميل مثلًا)
//   - السجل يُخزَّن في user_consents (هجرة 038) ببصمة دنيا
//     (ua/ip مُجزّأة SHA-256 — لا PII خام).
// ============================================================

export type ConsentType = 'terms' | 'privacy'

/** النسخ السارية المطلوب قبولها عند إنشاء الحساب */
export const REQUIRED_POLICY_VERSIONS: { terms: string; privacy: string } = {
  terms: LEGAL_LAST_UPDATED,
  privacy: LEGAL_LAST_UPDATED,
}

/** أنواع الموافقات المسجَّلة في user_consents */
export const CONSENT_TYPES: ConsentType[] = ['terms', 'privacy']
