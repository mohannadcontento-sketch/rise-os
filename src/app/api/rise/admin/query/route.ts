import { requireAdmin } from '@/lib/audit'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { withIdempotency } from '@/lib/idempotency'
import { z } from 'zod'

// ============================================================
// /api/rise/admin/query — الإدارة (استعلامات قراءة مقيدة)
//
// نافذة قراءة إدارية محصورة: لا SQL حر — فقط استعلامات مسماة
// في allowlist (عدّادات الجداول، المستخدمون الجدد، سجل التدقيق،
// الأخطاء الحديثة، ملخص التخزين) تنفَّذ عبر RPC admin_read داخل
// قاعدة البيانات، مع تمرير p_admin_user_id ليتحقق الدور هناك.
//
// المسار محمي: requireAdmin — يقرأ بيانات عبر كل الحسابات (403
// لغير الأدمن).
// الطرق: POST { queryId, limit? } — يعيد { columns, rows } من
//        الـRPC، أو 400 (استعلام غير مسموح) / 503 / 500.
// zod: QuerySchema — queryId ضمن enum مسموح + limit عدد صحيح
//        بين 1 و500 (افتراضي 100).
// Idempotency-Key: مطلوب (withIdempotency).
// ============================================================

export const dynamic = 'force-dynamic'

const QuerySchema = z.object({
  queryId: z.enum(['table_counts', 'recent_users', 'recent_audit', 'recent_errors', 'storage_summary']),
  limit: z.number().int().min(1).max(500).default(100),
})

export async function POST(request: NextRequest) {
  try {
    const adminId = await requireAdmin(request)
    if (!adminId) return NextResponse.json({ error: 'غير مصرح - أدمن فقط' }, { status: 403 })

    return withIdempotency(request, adminId, async () => {
      const parsed = QuerySchema.safeParse(await request.json().catch(() => null))
      if (!parsed.success) {
        return NextResponse.json({ error: 'استعلام إداري غير مسموح' }, { status: 400 })
      }

      const supabase = await getSupabaseAdmin()
      if (!supabase) return NextResponse.json({ error: 'قاعدة البيانات غير متاحة' }, { status: 503 })

      const { data, error } = await (supabase as any).rpc('admin_read', {
        p_query_id: parsed.data.queryId,
        p_limit: parsed.data.limit,
        p_admin_user_id: adminId,
      })
      if (error) {
        console.error('[admin/query] allowlisted RPC failed:', error)
        return NextResponse.json({ error: 'فشل تنفيذ القراءة الإدارية' }, { status: 500 })
      }

      return NextResponse.json(data || { columns: [], rows: [] })
    })
  } catch (error) {
    console.error('[admin/query] error:', error)
    return NextResponse.json({ error: 'فشل تنفيذ الاستعلام الإداري' }, { status: 500 })
  }
}
