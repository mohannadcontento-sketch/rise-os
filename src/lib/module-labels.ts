import type { ModuleId } from '@/store/app-store'

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
