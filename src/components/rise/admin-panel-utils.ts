// ============================================================
// admin-panel-utils.ts — أدوات لوحة الإدارة (مشتركة)
//
// أنواع وتنسيقات مشتركة بين تبويبات لوحة الإدارة وملحقاتها
// (admin-panel و admin-users-tab / system-stats / api-keys /
// overview / database / health-errors / audit / broadcast):
// بطاقة مستخدم، إحصاءات النظام، ومفتاح API. وحدة .ts نقية
// بلا React — عرض فقط ولا وصول لبيانات هنا.
//
// البنية الداخلية:
//   1) الأنواع: AdminUser / SystemStats / ApiKeyInfo
//   2) toArabicNum — أرقام هندية-عربية لعرض الواجهة
//   3) formatBytes / formatDate / formatDateTime — تنسيق حجم
//      وتاريخ (ar-EG)
//   4) timeAgo (عربية) + timeAgoEn (إنجليزية لرسائل السجل)
//
// مبادئ تقنية: كل دالة تتسامح مع null/undefined وتعيد قيمة
// آمنة ('٠' / '—') بدل الانهيار، وكل تاريخ يُنسَّق داخل try/catch.
// ============================================================

export interface AdminUser {
  id: string
  email: string | null
  name: string
  createdAt: string
  isAdmin: boolean
  storageUsed: number
  storageLimit: number
  aiLimit: number
  aiUsed: number
  level?: number
  xp?: number
  streak?: number
  lastActive?: string
}

export interface SystemStats {
  totalUsers: number
  activeUsers7d: number
  totalTasks: number
  totalHabits: number
  totalJournals: number
  totalGoals: number
  totalStorageUsed: number
  totalAiUsed: number
  userGrowth: { date: string; count: number }[]
  tableCounts: Record<string, number>
  recentActivity: { time: string; action: string; user: string }[]
}

export interface ApiKeyInfo {
  id: string
  name: string
  userId: string
  userName: string
  userEmail: string
  keyPreview: string
  createdAt: string
  lastUsed: string | null
}

export function toArabicNum(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '٠'
  return n.toString().replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[parseInt(d)])
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try { return new Date(dateStr).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }) } catch { return '—' }
}

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try { return new Date(dateStr).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch { return '—' }
}

export function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'الآن'
  if (mins < 60) return `منذ ${toArabicNum(mins)} دقيقة`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `منذ ${toArabicNum(hours)} ساعة`
  return `منذ ${toArabicNum(Math.floor(hours / 24))} يوم`
}

export function timeAgoEn(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
