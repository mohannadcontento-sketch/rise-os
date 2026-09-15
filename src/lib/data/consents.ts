import { sb, toCamel } from './core'

// ============================================================
// data/consents.ts — مستودع سجل الموافقات (المرحلة 20)
//
// قراءة موافقات المستخدم من user_consents (هجرة 038) عبر RLS
// (صفوفي فقط). الإدراج يتم من بوابة signup خادميًا (service
// role / Prisma مباشرة) — هذا المستودع للقراءة والتحقق.
//
// كسر أرشق (نمط feedback/notReady): إذا لم تُطبَّق هجرة 038
// بعد يُعاد notReady بدل الانهيار — الواجهة تتجاهل بهدوء.
// ============================================================

export interface ConsentRow {
  id: string
  userId: string
  consentType: string
  policyVersion: string
  consentedAt: string
  metadata: Record<string, unknown> | null
}

export const consents = {
  /** موافقات المستخدم (الأحدث أولًا) — أو notReady إن غاب الجدول. */
  async listOwn(userId: string): Promise<{ rows: ConsentRow[]; notReady?: boolean }> {
    const client = await sb()
    const { data, error } = await client
      .from('user_consents')
      .select('id, user_id, consent_type, policy_version, consented_at, metadata')
      .eq('user_id', userId)
      .order('consented_at', { ascending: false })
    if (error) {
      // 038 لم تُطبَّق بعد — تدهور رشيق لا فشلًا صامتًا للعميل
      const msg = String(error.message || '')
      if (msg.includes('user_consents') && (msg.includes('does not exist') || msg.includes('not found'))) {
        return { rows: [], notReady: true }
      }
      throw error
    }
    return { rows: toCamel<ConsentRow[]>(data ?? []) }
  },
}
