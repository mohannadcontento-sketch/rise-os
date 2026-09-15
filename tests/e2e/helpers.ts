import { readFileSync } from 'node:fs'
import * as path from 'node:path'

// ============================================================
// tests/e2e/helpers.ts — أدوات مشتركة لاختبارات المرحلة 20
//
// 1) requiredPolicyVersions: يقرأ نسخة السياسة السارية من
//    src/lib/site.ts (LEGAL_LAST_UPDATED) وقت التشغيل — فتبقى
//    الاختبارات متزامنة مع التطبيق تلقائيًا عند أي تحديث
//    قانوني مستقبلي (بلا تثبيت نسخة في الاختبار).
// 2) consentedSignupPayload: حمولة الاشتراك الكاملة ببوابة
//    الموافقة (acceptedTerms + policyVersions) — نفس عقد
//    /api/auth/signup بعد المرحلة 20.
// ============================================================

const repoRoot = path.join(__dirname, '..', '..')

export function requiredPolicyVersions(): { terms: string; privacy: string } {
  const site = readFileSync(path.join(repoRoot, 'src', 'lib', 'site.ts'), 'utf8')
  const m = site.match(/LEGAL_LAST_UPDATED\s*=\s*["']([^"']+)["']/)
  const version = m ? m[1] : ''
  if (!version) throw new Error('LEGAL_LAST_UPDATED not found in src/lib/site.ts')
  return { terms: version, privacy: version }
}

/** حمولة اشتراك بقبول صريح للنسخ السارية (عقد signup بعد المرحلة 20) */
export function consentedSignupPayload(email: string, password: string, name: string) {
  return {
    email,
    password,
    name,
    acceptedTerms: true,
    policyVersions: requiredPolicyVersions(),
  }
}
