// أوج (Awj) Data Access Layer
// Stable facade over domain-specific repositories.
import { profiles } from './profiles'
import { userSettings } from './userSettings'
import { userStorage } from './userStorage'
import { userApiKeys } from './userApiKeys'
import { userAIUsage } from './userAIUsage'
import { projects } from './projects'
import { tasks } from './tasks'
import { goals } from './goals'
import { habits } from './habits'
import { journals } from './journals'
import { focusSessions } from './focusSessions'
import { workSessions } from './workSessions'
import { healthLogs } from './healthLogs'
import { financeRecords } from './financeRecords'
import { books } from './books'
import { knowledgeItems } from './knowledgeItems'
import { plannerItems } from './plannerItems'
import { morningLogs } from './morningLogs'
import { notifications } from './notifications'
import { habitLogs } from './habitLogs'
import { dailyScores } from './dailyScores'
import { userAchievements } from './userAchievements'

// ============================================================
// data/index.ts — الواجهة الجماعية لطبقة البيانات (facade)
//
// الغرض: نقطة الدخول الوحيدة للبيانات — استيراد '@/lib/data'
// يصل إلى هذا الملف (لا يوجد data.ts مستقل؛ هذا هو الـ facade).
//
// المسؤوليات:
//   1) تجميع 22 مستودع نطاق (tasks, goals, habits...) في كائن data واحد
//   2) إعادة تصدير setCurrentAuthToken من core (وضع mock/dev فقط)
//
// قرار مهم: نمط facade — المكونات والمسارات تستدعي data.<domain>()
// ولا تعرف Supabase إطلاقاً؛ تبديل مستودع داخلي لا يكسر المستدعين.
// ============================================================
// ── القسم: إعادة تصدير نواة الوصول ─────────────────────
export { setCurrentAuthToken } from './core'

// ── القسم: كائن الواجهة الجماعية data ─────────────────────
// كل المستودعات تُجمَّع هنا؛ الاستخدام حصراً عبر data.<domain> (مثل data.tasks)
export const data = {
  profiles,
  userSettings,
  userStorage,
  userApiKeys,
  userAIUsage,
  projects,
  tasks,
  goals,
  habits,
  journals,
  focusSessions,
  workSessions,
  healthLogs,
  financeRecords,
  books,
  knowledgeItems,
  plannerItems,
  morningLogs,
  notifications,
  habitLogs,
  dailyScores,
  userAchievements,
}
