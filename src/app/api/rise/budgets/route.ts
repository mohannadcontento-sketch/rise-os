import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { data } from '@/lib/data'
import { withIdempotency } from '@/lib/idempotency'

// ============================================================
// /api/rise/budgets — المالية (حدود الميزانية وهدف الادخار)
//
// يخزن إعدادات وحدة المالية الخاصة بالمستخدم نفسه كعنصرَي
// knowledge من نوعَي 'budget-config' (حدود الفئات JSON) و
// 'savings-goal' (هدف ادخار رقمي) — بلا جدول مخصص.
//
// المسار محمي: requireUser — بيانات مالية شخصية معزولة بـ RLS.
// الطرق: GET — يعيد { budgets, savingsGoal } مع no-store.
//        PUT { budgets } أو { savingsGoal } — يكتب أحدهما
//        (upsertByType) ويعيد القيمة المحفوظة.
// Idempotency-Key: مطلوب لـ PUT (withIdempotency).
// ملاحظة: كل الاستجابات بلا كاش (no-cache, no-store).
// ============================================================

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUser(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })
    const [budgetItem, savingsItem] = await Promise.all([
      data.knowledgeItems.getByType(userId, 'budget-config'),
      data.knowledgeItems.getByType(userId, 'savings-goal'),
    ])

    let budgets: { category: string; limit: number }[] = []
    let savingsGoal: number | null = null
    if (budgetItem?.content) {
      try { budgets = JSON.parse(budgetItem.content) } catch { budgets = [] }
    }
    if (savingsItem?.content) {
      const g = parseFloat(savingsItem.content)
      if (!Number.isNaN(g) && g > 0) savingsGoal = g
    }

    const resp = NextResponse.json({ budgets, savingsGoal })
    resp.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
    return resp
  } catch (error) {
    console.error('[budgets] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 503 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireUser(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })
    return withIdempotency(req, userId, async () => {
    const body = await req.json()
    const { budgets, savingsGoal } = body as {
      budgets?: { category: string; limit: number }[]
      savingsGoal?: number
    }

    if (savingsGoal !== undefined && !Array.isArray(budgets)) {
      const goal = Math.max(0, Math.round(Number(savingsGoal) || 0))
      await data.knowledgeItems.upsertByType(userId, 'savings-goal', 'هدف الادخار', String(goal))
      const resp = NextResponse.json({ success: true, savingsGoal: goal })
      resp.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
      return resp
    }

    if (!Array.isArray(budgets)) {
      return NextResponse.json({ error: 'budgets array required' }, { status: 400 })
    }
    await data.knowledgeItems.upsertByType(userId, 'budget-config', 'ميزانية المستخدم', JSON.stringify(budgets))
    const resp = NextResponse.json({ budgets })
    resp.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
    return resp
    })
  } catch (error) {
    console.error('[budgets] PUT error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
