import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { createSupabaseUserClient, isSupabaseConfigured } from '@/lib/supabase'
import { getAccessToken } from '@/lib/cookie-auth'
import { parseBody, communityReactionSchema } from '@/lib/validators'
import { logAudit } from '@/lib/audit'
import { tursoSyncReaction } from '@/lib/community-sync'

export const dynamic = 'force-dynamic'

// ============================================================
// /api/rise/community/reactions — إعجاب/إلغاء (toggle واحد)
//
// POST : إعجاب إن لم يوجد (فهرس فريد يمنع التكرار)، وإلغاؤه
//        إن وجد — نداء واحد idempotent. العدادات يتكفل بها
//        التريجر trg_community_recount (زيادة/نقصان ذري).
//        لا إشعارات على الإعجاب (مضاد للإزعاج — قرار موثق).
// ============================================================

export async function POST(req: NextRequest) {
  const userId = await requireUser(req)
  if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'قاعدة البيانات غير مهيأة' }, { status: 500 })
  }

  const token = getAccessToken(req)
  if (!token) return NextResponse.json({ error: 'جلسة غير صالحة' }, { status: 401 })

  const parsed = await parseBody(req, communityReactionSchema)
  if (!parsed.ok || !parsed.data) return parsed.response!

  const { targetType, targetId } = parsed.data
  const client = await createSupabaseUserClient(token)
  if (!client) return NextResponse.json({ error: 'خطأ في تكوين الخادم' }, { status: 500 })

  const table = targetType === 'post' ? 'community_posts' : 'community_comments'

  // الهدف موجود ومنشور؟ (قراءة بجلسة المستخدم — RLS)
  const { data: target } = await (client as any)
    .from(table)
    .select('id, status')
    .eq('id', targetId)
    .maybeSingle()
  if (!target || target.status !== 'published') {
    return NextResponse.json({ error: 'المحتوى غير متاح' }, { status: 404 })
  }

  // الحالة الحالية
  const { data: existing } = await (client as any)
    .from('community_reactions')
    .select('id')
    .eq('user_id', userId)
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .maybeSingle()

  if (existing) {
    // إلغاء الإعجاب
    const { error } = await (client as any).from('community_reactions').delete().eq('id', existing.id)
    if (error) {
      console.warn('[community/reactions] unlike failed:', error.message)
      return NextResponse.json({ error: 'تعذّر إلغاء الإعجاب' }, { status: 500 })
    }
    // اقرأ العداد بعد التريجر
    const { data: after } = await (client as any).from(table).select('like_count').eq('id', targetId).maybeSingle()

    // مرآة Turso — إلغاء الإعجاب + إعادة مزامنة عدادات الهدف
    void tursoSyncReaction(userId, targetType, targetId, false)

    return NextResponse.json({ liked: false, likeCount: after?.like_count ?? 0 })
  }

  const { error } = await (client as any)
    .from('community_reactions')
    .insert({ user_id: userId, target_type: targetType, target_id: targetId })

  if (error) {
    if (error.message.includes('community_banned')) {
      return NextResponse.json({ error: 'حسابك محظور من المجتمع' }, { status: 403 })
    }
    if (error.message.includes('duplicate key')) {
      // سباق نادر (طلبان متزامنان) — العدّ وصل بالفعل
      return NextResponse.json({ liked: true, likeCount: null })
    }
    console.warn('[community/reactions] like failed:', error.message)
    return NextResponse.json({ error: 'تعذّر تسجيل الإعجاب' }, { status: 500 })
  }

  await logAudit(req, userId, 'community-reaction', {
    resource: 'community_reactions',
    resourceId: targetId,
    details: { targetType },
  })

  const { data: after } = await (client as any).from(table).select('like_count').eq('id', targetId).maybeSingle()

  // مرآة Turso — إعجاب جديد + إعادة مزامنة عدادات الهدف
  void tursoSyncReaction(userId, targetType, targetId, true)

  return NextResponse.json({ liked: true, likeCount: after?.like_count ?? 1 })
}
