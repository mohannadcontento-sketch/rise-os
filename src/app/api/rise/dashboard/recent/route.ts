import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { data } from '@/lib/data'

// ============================================================
// /api/rise/dashboard/recent — لوحة التحكم (النشاط الأخير)
//
// نقطة فرعية من تفكيك لوحة التحكم (P2#3): تجلب آخر المهام
// المُنجزة وآخر اليوميات لقسم «النشاط الأخير» — تُحمَّل كسولاً
// بمعزل عن ملخص اللوحة حتى لا تتضخم الاستجابة الرئيسية.
//
// المسار محمي: requireUser — بيانات شخصية معزولة بـ RLS.
// الطرق: GET — يعيد { recentTasks } (آخر 5 مكتملة) و
//        { recentJournals } (آخر 3 اليوميات) أو 401/500.
// ملاحظة: القوائم محدودة عمداً (P2#2) — لا يُجلب التاريخ كله.
// ============================================================

export const dynamic = 'force-dynamic'

/**
 * P2#3: Decomposed dashboard — recent activity sub-endpoint
 * GET /api/rise/dashboard/recent
 * Returns: recent tasks + recent journal entries (lazy-loaded)
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await requireUser(req)
if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

    const [tasks, journals] = await Promise.all([
      data.tasks.list(userId),
      data.journals.list(userId, 5),
    ])

    // P2#2: Limit recent tasks to 5 (was loading all)
    const recentTasks = tasks
      .filter((t: any) => t.status === 'done')
      .slice(0, 5)

    return NextResponse.json({
      recentTasks,
      recentJournals: journals.slice(0, 3),
    })
  } catch (error) {
    console.error('Recent activity error:', error)
    return NextResponse.json({ error: 'تعذر تحميل النشاط الأخير' }, { status: 500 })
  }
}
