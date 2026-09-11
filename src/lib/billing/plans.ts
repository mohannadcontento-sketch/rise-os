// ============================================================
// plans.ts — بيانات العرض فقط لخطط أوج (المرحلة 04).
//
// ⚠️ مهم: هذا الملف NOT المصدر الوحيد للحدود. المصدر الحقيقي
// للـ enforcement هو جدول plan_entitlements في قاعدة البيانات
// (migration 025) داخل الدالة consume_usage. أي حد هنا هو للتسمية
// والنسخ العربي فقط ولا يُستخدم في أي قرار سماح/منع.
// ============================================================

export type PlanCode = 'free' | 'plus' | 'max'

export interface PlanDisplayInfo {
  code: PlanCode
  nameAr: string
  priceEgp: number
  tagline: string
  ads: boolean
  mcp: boolean
  perks: string[]
}

export const PLANS_UI: Record<PlanCode, PlanDisplayInfo> = {
  free: {
    code: 'free',
    nameAr: 'المجانية',
    priceEgp: 0,
    tagline: 'ابدأ رحلتك مع الأساسيات',
    ads: true,
    mcp: false,
    perks: [
      'كل وحدات أوج الأساسية',
      '5 عمليات ذكاء اصطناعي يوميًا',
      '3 عمليات تصدير يوميًا',
      'إعلانات خفيفة ومتحكم فيها',
    ],
  },
  plus: {
    code: 'plus',
    nameAr: 'بلس',
    priceEgp: 30,
    tagline: 'حدود أعلى بدون إعلانات',
    ads: false,
    mcp: false,
    perks: [
      'بدون أي إعلانات',
      '30 عملية ذكاء اصطناعي يوميًا',
      '15 عملية تصدير يوميًا',
      'دعم أولوية',
    ],
  },
  max: {
    code: 'max',
    nameAr: 'ماكس',
    priceEgp: 50,
    tagline: 'أعلى حدود ضمن Fair Use + MCP',
    ads: false,
    mcp: true,
    perks: [
      '100 عملية ذكاء اصطناعي يوميًا (3000 شهريًا)',
      '50 عملية تصدير يوميًا',
      'مفتاح MCP — أوج داخل أي عميل MCP',
      'أعلى حدود ضمن سياسة Fair Use',
    ],
  },
}

export const UPGRADEABLE_PLANS: PlanCode[] = ['plus', 'max']

/** أسماء عربية لمفاتيح الميزات (تُعرض في عدادات الاستخدام) */
export const FEATURE_LABELS: Record<string, string> = {
  'ai.action': 'عمليات الذكاء الاصطناعي',
  'export.data': 'تصدير البيانات',
  'mcp.key': 'مفتاح MCP',
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  instapay: 'InstaPay',
  vodafone_cash: 'فودافون كاش',
  etisalat_cash: 'اتصالات كاش',
  other: 'وسيلة أخرى',
}

/** تحقق أن نص الخطة المطلوب قابل للترقية (not free) */
export function isUpgradeablePlan(code: string): code is Exclude<PlanCode, 'free'> {
  return code === 'plus' || code === 'max'
}
