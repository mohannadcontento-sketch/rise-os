import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, logAudit } from '@/lib/audit'
import { getSupabaseAdmin } from '@/lib/supabase'
import { parseBody, communityModerateSchema } from '@/lib/validators'
import { notifyUser, communityModerationMessage, communityBannedMessage, communityUnbannedMessage } from '@/lib/notifications-service'
import { tursoUpsertPost, tursoDeletePost, tursoUpsertComment, tursoDeleteComment } from '@/lib/community-sync'

export const dynamic = 'force-dynamic'

// ============================================================
// /api/rise/admin/community/moderate — إجراءات الإشراف (07)
//
// POST : { action: ... } — كل إجراء:
//   1) ينفّذ التغيير عبر service_role
//   2) يقيّد سجل community_moderation_log (target + سبب)
//   3) يبّلغ المتأثر عبر نظام الإشعارات الموحد (إلا unban?)
//   4) يوثّق في audit log العام
// الإجراءات: hide/restore/remove post أو comment،
// dismiss_report، remove_reported (إزالة + حل البلاغ)،
// ban_user (مؤقت اختياري)، unban_user.
// hide ≠ remove: الإخفاء قابل للاستعادة (restore)، والإزالة
// نهائية (يُحذف المحتوى فعليًا).
// ============================================================

async function writeLog(
  admin: any,
  moderatorId: string,
  action: string,
  targetType: string,
  targetId: string,
  reason?: string,
) {
  const { error } = await admin
    .from('community_moderation_log')
    .insert({ moderator_id: moderatorId, action, target_type: targetType, target_id: targetId, reason: reason ?? null })
  if (error) console.warn('[admin/community/moderate] log insert failed:', error.message)
}

async function resolveReportsFor(admin: any, targetType: string, targetId: string, resolution: string, adminId: string) {
  // كل البلاغات المفتوحة على الهدف → نفس القرار
  await admin
    .from('community_reports')
    .update({ status: resolution, handled_by: adminId, handled_at: new Date().toISOString() })
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .eq('status', 'open')
}

export async function POST(req: NextRequest) {
  const adminId = await requireAdmin(req)
  if (!adminId) return NextResponse.json({ error: 'هذه الصفحة للمشرفين فقط' }, { status: 403 })

  const admin = await getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: 'تكوين الخادم غير مكتمل' }, { status: 500 })

  const parsed = await parseBody(req, communityModerateSchema)
  if (!parsed.ok || !parsed.data) return parsed.response!
  const act = parsed.data

  try {
    switch (act.action) {
      // ─── منشورات ───
      case 'hide_post': {
        const { data: post } = await admin.from('community_posts').select('id, user_id, title').eq('id', act.postId).maybeSingle()
        if (!post) return NextResponse.json({ error: 'المنشور غير موجود' }, { status: 404 })
        const { error } = await admin.from('community_posts').update({ status: 'hidden' }).eq('id', act.postId)
        if (error) throw error
        await resolveReportsFor(admin, 'post', act.postId, 'resolved_hidden', adminId)
        await writeLog(admin, adminId, 'hide_post', 'post', act.postId, act.reason)
        await notifyUser(admin, {
          userId: post.user_id,
          ...communityModerationMessage('post', 'hidden', act.reason, act.postId),
          dedupKey: `mod-hide-post-${act.postId}`,
        })
        break
      }
      case 'restore_post': {
        const { data: post } = await admin.from('community_posts').select('id, user_id').eq('id', act.postId).maybeSingle()
        if (!post) return NextResponse.json({ error: 'المنشور غير موجود' }, { status: 404 })
        const { error } = await admin.from('community_posts').update({ status: 'published' }).eq('id', act.postId)
        if (error) throw error
        await writeLog(admin, adminId, 'restore_post', 'post', act.postId, act.reason)
        break
      }
      case 'remove_post': {
        const { data: post } = await admin.from('community_posts').select('id, user_id').eq('id', act.postId).maybeSingle()
        if (!post) return NextResponse.json({ error: 'المنشور غير موجود' }, { status: 404 })
        const { error } = await admin.from('community_posts').delete().eq('id', act.postId)
        if (error) throw error
        await resolveReportsFor(admin, 'post', act.postId, 'resolved_removed', adminId)
        await writeLog(admin, adminId, 'remove_post', 'post', act.postId, act.reason)
        await notifyUser(admin, {
          userId: post.user_id,
          ...communityModerationMessage('post', 'removed', act.reason),
          dedupKey: `mod-remove-post-${act.postId}`,
        })
        break
      }

      // ─── تعليقات ───
      case 'hide_comment': {
        const { data: c } = await admin.from('community_comments').select('id, user_id, post_id').eq('id', act.commentId).maybeSingle()
        if (!c) return NextResponse.json({ error: 'التعليق غير موجود' }, { status: 404 })
        const { error } = await admin.from('community_comments').update({ status: 'hidden' }).eq('id', act.commentId)
        if (error) throw error
        await resolveReportsFor(admin, 'comment', act.commentId, 'resolved_hidden', adminId)
        await writeLog(admin, adminId, 'hide_comment', 'comment', act.commentId, act.reason)
        await notifyUser(admin, {
          userId: c.user_id,
          ...communityModerationMessage('comment', 'hidden', act.reason, c.post_id),
          dedupKey: `mod-hide-comment-${act.commentId}`,
        })
        break
      }
      case 'restore_comment': {
        const { data: c } = await admin.from('community_comments').select('id').eq('id', act.commentId).maybeSingle()
        if (!c) return NextResponse.json({ error: 'التعليق غير موجود' }, { status: 404 })
        const { error } = await admin.from('community_comments').update({ status: 'published' }).eq('id', act.commentId)
        if (error) throw error
        await writeLog(admin, adminId, 'restore_comment', 'comment', act.commentId, act.reason)
        break
      }
      case 'remove_comment': {
        const { data: c } = await admin.from('community_comments').select('id, user_id, post_id').eq('id', act.commentId).maybeSingle()
        if (!c) return NextResponse.json({ error: 'التعليق غير موجود' }, { status: 404 })
        const { error } = await admin.from('community_comments').delete().eq('id', act.commentId)
        if (error) throw error
        await resolveReportsFor(admin, 'comment', act.commentId, 'resolved_removed', adminId)
        await writeLog(admin, adminId, 'remove_comment', 'comment', act.commentId, act.reason)
        await notifyUser(admin, {
          userId: c.user_id,
          ...communityModerationMessage('comment', 'removed', act.reason, c.post_id),
          dedupKey: `mod-remove-comment-${act.commentId}`,
        })
        break
      }

      // ─── بلاغات ───
      case 'dismiss_report': {
        const { data: r } = await admin.from('community_reports').select('id, target_type, target_id').eq('id', act.reportId).maybeSingle()
        if (!r) return NextResponse.json({ error: 'البلاغ غير موجود' }, { status: 404 })
        const { error } = await admin
          .from('community_reports')
          .update({ status: 'resolved_dismissed', handled_by: adminId, handled_at: new Date().toISOString() })
          .eq('id', act.reportId)
        if (error) throw error
        await writeLog(admin, adminId, 'dismiss_report', 'report', act.reportId, act.reason)
        break
      }
      case 'remove_reported': {
        const { data: r } = await admin.from('community_reports').select('id, target_type, target_id').eq('id', act.reportId).maybeSingle()
        if (!r) return NextResponse.json({ error: 'البلاغ غير موجود' }, { status: 404 })
        // أزل المحتوى + حلّ كل البلاغات المفتوحة عليه
        const table = r.target_type === 'post' ? 'community_posts' : 'community_comments'
        const { data: target } = await admin.from(table).select('user_id, post_id').eq('id', r.target_id).maybeSingle()
        const { error: delErr } = await admin.from(table).delete().eq('id', r.target_id)
        if (delErr) throw delErr
        await resolveReportsFor(admin, r.target_type, r.target_id, 'resolved_removed', adminId)
        await writeLog(admin, adminId, 'remove_reported', r.target_type, r.target_id, act.reason)
        // مرآة Turso — حذف المحتوى المُبلَّغ عنه من المرآة
        if (r.target_type === 'post') void tursoDeletePost(r.target_id)
        else void tursoDeleteComment(r.target_id)
        if (target) {
          await notifyUser(admin, {
            userId: target.user_id,
            ...communityModerationMessage(r.target_type === 'post' ? 'post' : 'comment', 'removed', act.reason, r.target_type === 'comment' ? target.post_id : r.target_id),
            dedupKey: `mod-remove-${r.target_type}-${r.target_id}`,
          })
        }
        break
      }

      // ─── حظر ───
      case 'ban_user': {
        const { data: existing } = await admin.from('community_bans').select('user_id').eq('user_id', act.userId).maybeSingle()
        const expiresAt = act.days ? new Date(Date.now() + act.days * 86400_000).toISOString() : null
        const { error } = await admin
          .from('community_bans')
          .upsert(
            { user_id: act.userId, reason: act.reason, banned_by: adminId, expires_at: expiresAt },
            { onConflict: 'user_id' },
          )
        if (error) throw error
        await writeLog(admin, adminId, 'ban_user', 'user', act.userId, act.reason)
        await notifyUser(admin, {
          userId: act.userId,
          ...communityBannedMessage(act.reason, expiresAt),
          dedupKey: `mod-ban-${act.userId}-${Date.now()}`,
        })
        void existing
        break
      }
      case 'unban_user': {
        const { error } = await admin.from('community_bans').delete().eq('user_id', act.userId)
        if (error) throw error
        await writeLog(admin, adminId, 'unban_user', 'user', act.userId, act.reason)
        await notifyUser(admin, {
          userId: act.userId,
          ...communityUnbannedMessage(),
          dedupKey: `mod-unban-${act.userId}-${Date.now()}`,
        })
        break
      }
    }

    // ── مرآة Turso: أثر الإشراف على المحتوى العام (fire-and-forget) ──
    // الحظر/البلاغات بيانات تشغيلية → لا تدخل المرآة (تبقى Supabase).
    {
      const a = act as any
      if (a.postId) {
        if (act.action === 'remove_post') void tursoDeletePost(a.postId)
        else void tursoUpsertPost(a.postId)
      }
      if (a.commentId) {
        if (act.action === 'remove_comment') void tursoDeleteComment(a.commentId)
        else void tursoUpsertComment(a.commentId)
      }
    }

    await logAudit(req, adminId, 'admin-community-moderate', {
      resource: 'community_moderation_log',
      details: { action: act.action, reason: act.reason ?? null },
    })

    return NextResponse.json({ ok: true, action: act.action })
  } catch (err) {
    console.warn('[admin/community/moderate] failed:', (err as Error)?.message)
    return NextResponse.json({ error: 'تعذّر تنفيذ الإجراء — أعد المحاولة' }, { status: 500 })
  }
}
