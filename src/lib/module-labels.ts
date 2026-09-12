import type { ModuleId } from '@/store/app-store'

// ============================================================
// module-labels.ts — أسماء الوحدات المعروضة
//
// المصدر الوحيد لأسماء الوحدات العربية: خريطة MODULE_LABELS من
// ModuleId إلى الاسم الظاهر للمستخدم. تستهلكها عنوان الصفحة
// (app/app/page.tsx) والشريط الجانبي (sidebar) وشريط التنقل السفلي
// (GlassNav) — توحيد Phase-2 لمنع تضارب التسمية بين الجوال وسطح
// المكتب.
//
// المسؤوليات:
//   1) تسمية الوحدات الـ22 بالعربية في نقطة واحدة.
//   2) كسر التعريف على نوع ModuleId من app-store: أي وحدة جديدة
//      بلا اسمها هنا أخفق التحقق النوعي عند البناء.
//
// حدود: أسماء عرض فقط — لا أيقونات ولا مسارات ولا صلاحيات هنا.
// ============================================================

/**
 * MODULE_LABELS — the single source of truth for module display names.
 * Used by: the app shell page title, the Sidebar (pinned + accordion groups),
 * and GlassNav (mobile bottom bar). Change a label here and it updates
 * everywhere — Phase-2 navigation unification (no more label drift between
 * mobile "الرئيسية" and desktop "لوحة التحكم" for the same module).
 */
export const MODULE_LABELS: Record<ModuleId, string> = {
  'dashboard': 'لوحة التحكم',
  'morning': 'الروتين الصباحي',
  'planner': 'المخطط اليومي',
  'tasks': 'المهام',
  'projects': 'المشاريع',
  'goals': 'الأهداف',
  'habits': 'تتبع العادات',
  'journal': 'اليوميات',
  'deepwork': 'العمل العميق',
  'work': 'الشغل',
  'reading': 'القراءة',
  'learning': 'التعلم',
  'health': 'الصحة',
  'finance': 'المالية',
  'calendar': 'التقويم',
  'brain': 'الدماغ الثاني',
  'weekly-review': 'مراجعة أسبوعية',
  'monthly-review': 'مراجعة شهرية',
  'analytics': 'التحليلات',
  'community': 'المجتمع',
  'admin-panel': 'لوحة الإدارة',
  'settings': 'الإعدادات',
}
