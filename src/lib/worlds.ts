import type { ModuleId } from '@/store/app-store'

// ============================================================
// worlds.ts — المرحلة 18: خريطة العوالم الأربعة (مصدر واحد)
//
// UX_FOUNDATION §3: تقسيم الوحدات حسب «معنى الحياة» لا نوع
// النشاط — أنجز/تطور/توازن/إدارة حياتي (٦/٣/٤/٥ = ١٨ وحدة).
// خارج العوالم: الرئيسية + المجتمع + الإعدادات (+ الأدمن) —
// هويات مستقلة (حسم §9/4 و§9/6).
//
// المستهلكون: الشريط الجانبي (بطاقات العوالم) + استكشف Hub
// (بطاقات كبيرة). أي تعديل عضوية وحدة يمر من هنا فقط —
// الأسماء تبقى من MODULE_LABELS (مصدر التسمية الوحيد).
//
// التحقق الحسابي: ٦+٣+٤+٥ = ١٨ + ٤ وحدات نظام = ٢٢ ✓
// ============================================================

/** هوية عالم واحد — لون مستمد من tokens الواجهة (§3.2/قاعدة 3) */
export interface World {
  id: string
  title: string
  /** سطر واحد فقط — بلا وصف تسويقي (§3.2/قاعدة 4) */
  hint: string
  /** نقطة الهوية في الشريط الجانبي — من tokens القائمة */
  dot: string
  /** غراديان بئر الأيقونة في بطاقات الاستكشف */
  gradient: string
  /** أيقونة العالم — رمز فريد لا يتكرر داخل وحداته */
  glyph: 'flame' | 'sprout' | 'sunrise' | 'steering'
  items: ModuleId[]
}

export const WORLDS: World[] = [
  {
    id: 'achieve',
    title: 'أنجز',
    hint: 'عالم الإنجاز والتنفيذ',
    dot: 'bg-emerald-accent',
    gradient: 'linear-gradient(135deg, #10B981, #34D399)',
    glyph: 'flame',
    items: ['tasks', 'projects', 'goals', 'deepwork', 'work', 'calendar'],
  },
  {
    id: 'grow',
    title: 'تطوّر',
    hint: 'عالم التعلم والمعرفة',
    dot: 'bg-gold',
    gradient: 'linear-gradient(135deg, #F59E0B, #FCD34D)',
    glyph: 'sprout',
    items: ['learning', 'reading', 'brain'],
  },
  {
    id: 'balance',
    title: 'توازن',
    hint: 'عالم الجسد والروتين والتأمل',
    dot: 'bg-forest',
    gradient: 'linear-gradient(135deg, #1B342B, #34D399)',
    glyph: 'sunrise',
    items: ['morning', 'habits', 'journal', 'health'],
  },
  {
    id: 'manage',
    title: 'إدارة حياتي',
    hint: 'عالم التخطيط والمال والقياس',
    dot: 'bg-rose-accent',
    gradient: 'linear-gradient(135deg, #FF5A76, #FFA3B2)',
    glyph: 'steering',
    items: ['planner', 'finance', 'analytics', 'weekly-review', 'monthly-review'],
  },
]

/** نقاط مستقلة خارج العوالم (حسم §9/4: المجتمع ليس عالمًا) */
export const INDEPENDENT_MODULES: ModuleId[] = ['community']

/** عدد وحدات المحتوى داخل العوالم (تحقق قاعدة الـ٦ — §5) */
export const WORLD_MODULE_COUNT = WORLDS.reduce((n, w) => n + w.items.length, 0) // ١٨
