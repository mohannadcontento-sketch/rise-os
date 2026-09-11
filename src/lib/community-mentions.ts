// ============================================================
// community-mentions.ts — تحليل @mentions من محتوى المجتمع
// (خادميًا فقط — العميل لا يرسل قائمة أسماء موثوقة)
//
// المسار: نص المنشور/التعليق → regex @handle → حلّ إلى
// مستخدمين حقيقيين (service client) → سجل mentions +
// إشعار «mention» عبر المصدر الموحد (notifyUser).
// ============================================================

import { getSupabaseAdmin } from '@/lib/supabase'
import { notifyUser } from '@/lib/notifications-service'
import { communityMentionMessage } from '@/lib/notifications-service'

/** استخراج handles فريدة من النص (2-24 حرف a-z0-9_) */
export function extractMentionHandles(text: string): string[] {
  const matches = text.match(/(?:^|\s)@([a-z0-9_]{2,24})/gi) ?? []
  const handles = matches
    .map((m) => m.trim().slice(1).toLowerCase())
    .filter((h) => h.length >= 2)
  return [...new Set(handles)].slice(0, 20) // حد أقصى 20 ذِكرًا للمحتوى الواحد
}

export interface MentionResolution {
  /** user ids (بدون صاحب المحتوى) */
  users: { id: string; handle: string; name: string }[]
}

/** حلّ الـ handles إلى مستخدمين حقيقيين غير موقوفين */
export async function resolveMentions(
  handles: string[],
  excludeUserId: string,
): Promise<MentionResolution> {
  if (handles.length === 0) return { users: [] }
  const admin = await getSupabaseAdmin()
  if (!admin) return { users: [] }

  const { data, error } = await (admin as any)
    .from('profiles')
    .select('id, handle, name')
    .in('handle', handles)
    .eq('suspended', false)
    .limit(20)
  if (error) {
    console.warn('[community-mentions] resolve failed:', error.message)
    return { users: [] }
  }
  return {
    users: (data ?? [])
      .filter((p: any) => p.id !== excludeUserId)
      .map((p: any) => ({ id: p.id, handle: p.handle, name: p.name })),
  }
}

/**
 * تسجيل الذِكر + إرسال إشعار mention لكل مذكور.
 * تُستدعى بعد إنشاء المنشور/التعليق بنجاح — الفشل لا يعطّل
 * المسار أبدًا (ذكر فاشل ≠ منشور فاشل).
 */
export async function processMentions(opts: {
  authorId: string
  authorName: string
  authorHandle: string
  text: string
  postId: string
  source: 'post' | 'comment'
  sourceId: string
}): Promise<{ notified: number }> {
  let notified = 0
  try {
    const handles = extractMentionHandles(opts.text)
    const { users } = await resolveMentions(handles, opts.authorId)
    if (users.length === 0) return { notified: 0 }

    const admin = await getSupabaseAdmin()
    if (!admin) return { notified: 0 }

    // سجل الذِكر (service client — لا سياسة إدراج للمصادقين)
    // صفوف المنشور وصفوف التعليق لكل منها قيد فريد مختلف — ننفصل
    const postRows = users
      .filter(() => opts.source === 'post')
      .map((u) => ({ post_id: opts.postId, comment_id: null, mentioned_user_id: u.id }))
    const commentRows = users
      .filter(() => opts.source === 'comment')
      .map((u) => ({ post_id: null, comment_id: opts.sourceId, mentioned_user_id: u.id }))

    if (postRows.length > 0) {
      const { error: e1 } = await (admin as any)
        .from('community_mentions')
        .upsert(postRows, { onConflict: 'post_id,mentioned_user_id', ignoreDuplicates: true })
      if (e1) console.warn('[community-mentions] post rows insert failed:', e1.message)
    }
    if (commentRows.length > 0) {
      const { error: e2 } = await (admin as any)
        .from('community_mentions')
        .upsert(commentRows, { onConflict: 'comment_id,mentioned_user_id', ignoreDuplicates: true })
      if (e2) console.warn('[community-mentions] comment rows insert failed:', e2.message)
    }

    // إشعار لكل مذكور (dedup لكل مصدر+مستخدم)
    for (const u of users) {
      const msg = communityMentionMessage(
        opts.authorName,
        opts.authorHandle,
        opts.postId,
        opts.source,
        opts.sourceId,
      )
      const dedupKey = `mention-${opts.source}-${opts.sourceId}-${u.id}`
      const res = await notifyUser(admin as any, {
        userId: u.id,
        ...msg,
        dedupKey,
      })
      if (res.created) notified++
    }
  } catch (err) {
    console.warn('[community-mentions] process failed (non-fatal):', (err as Error)?.message)
  }
  return { notified }
}
