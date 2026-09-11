/**
 * turso-backfill.ts — تعبئة أولية لمرآة Turso من بيانات Supabase.
 *
 * يعمل بعد توفير مفاتيح Turso (TURSO_DATABASE_URL/TURSO_AUTH_TOKEN):
 * ينسخ البيانات العامة للمجتمع (members/posts/comments/reactions)
 * من Supabase إلى Turso عبر نفس دوال الكتابة الإنتاجية
 * (community-sync.writeXRow) — idempotent بالكامل (upserts)،
 * فإعادة تشغيله آمنة.
 *
 * متغيرات البيئة المطلوبة:
 *   NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (مصدر)
 *   TURSO_DATABASE_URL + TURSO_AUTH_TOKEN (الهدف)
 *
 * تشغيل: bun scripts/turso-backfill.ts
 */
import { createClient as createSupa } from '@supabase/supabase-js'
import { createClient as createTurso } from '@libsql/client'
import {
  ensureTursoSchema,
  writeMemberRow,
  writePostRow,
  writeCommentRow,
  setReactionRow,
} from '../src/lib/community-sync'

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const tursoUrl = process.env.TURSO_DATABASE_URL
  const tursoToken = process.env.TURSO_AUTH_TOKEN

  if (!url || !key) {
    console.error('❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY مطلوبة')
    process.exit(1)
  }
  if (!tursoUrl) {
    console.error('❌ TURSO_DATABASE_URL مطلوب (أنشئ قاعدة: turso db create awj-community)')
    process.exit(1)
  }

  const supa = createSupa(url, key, { auth: { persistSession: false } })
  const turso = createTurso({ url: tursoUrl, authToken: tursoToken || undefined })

  console.log('── [1/5] مخطط المرآة (idempotent) ──')
  await ensureTursoSchema(turso)

  // ── أعضاء (لقطة العرض العام فقط — لا بريد ولا بيانات خاصة) ──
  console.log('── [2/5] members ──')
  {
    const { data, error } = await supa.from('profiles').select('id, name, handle, avatar')
    if (error) throw error
    let n = 0
    for (const p of data ?? []) {
      await writeMemberRow(turso, {
        user_id: p.id,
        name: p.name ?? 'مستخدم',
        handle: p.handle ?? null,
        avatar: p.avatar ?? null,
      })
      n++
    }
    console.log(`   ${n} عضوًا`)
  }

  // ── منشورات (+ لقطة المؤلف) ──
  console.log('── [3/5] posts ──')
  {
    const { data, error } = await supa
      .from('community_posts')
      .select('id, user_id, title, body, status, media, like_count, reply_count, created_at, last_activity_at, edited_at')
      .order('created_at', { ascending: true })
      .limit(100000)
    if (error) throw error
    const profileById = new Map<string, { name: string | null; handle: string | null; avatar: string | null }>()
    {
      const { data: profs } = await supa.from('profiles').select('id, name, handle, avatar')
      for (const p of profs ?? []) profileById.set(p.id, p)
    }
    let n = 0
    for (const p of data ?? []) {
      const a = profileById.get(p.user_id)
      await writePostRow(turso, {
        id: p.id,
        user_id: p.user_id,
        title: p.title,
        body: p.body,
        status: p.status,
        media_json: p.media ? JSON.stringify(p.media) : null,
        like_count: p.like_count ?? 0,
        reply_count: p.reply_count ?? 0,
        author_name: a?.name ?? null,
        author_handle: a?.handle ?? null,
        author_avatar: a?.avatar ?? null,
        created_at: p.created_at,
        last_activity_at: p.last_activity_at ?? null,
        edited_at: p.edited_at ?? null,
      })
      n++
    }
    console.log(`   ${n} منشورًا`)
  }

  // ── تعليقات ──
  console.log('── [4/5] comments ──')
  {
    const { data, error } = await supa
      .from('community_comments')
      .select('id, post_id, parent_comment_id, user_id, body, status, like_count, reply_count, created_at, edited_at')
      .order('created_at', { ascending: true })
      .limit(500000)
    if (error) throw error
    const profileById = new Map<string, { name: string | null; handle: string | null; avatar: string | null }>()
    {
      const { data: profs } = await supa.from('profiles').select('id, name, handle, avatar')
      for (const p of profs ?? []) profileById.set(p.id, p)
    }
    let n = 0
    for (const c of data ?? []) {
      const a = profileById.get(c.user_id)
      await writeCommentRow(turso, {
        id: c.id,
        post_id: c.post_id,
        parent_comment_id: c.parent_comment_id ?? null,
        user_id: c.user_id,
        body: c.body,
        status: c.status,
        like_count: c.like_count ?? 0,
        reply_count: c.reply_count ?? 0,
        author_name: a?.name ?? null,
        author_handle: a?.handle ?? null,
        author_avatar: a?.avatar ?? null,
        created_at: c.created_at,
        edited_at: c.edited_at ?? null,
      })
      n++
    }
    console.log(`   ${n} تعليقًا`)
  }

  // ── تفاعلات ──
  console.log('── [5/5] reactions ──')
  {
    const { data, error } = await supa
      .from('community_reactions')
      .select('user_id, target_type, target_id, created_at')
      .limit(500000)
    if (error) throw error
    let n = 0
    for (const r of data ?? []) {
      await setReactionRow(turso, r.user_id, r.target_type, r.target_id, true, r.created_at)
      n++
    }
    console.log(`   ${n} تفاعلًا`)
  }

  // ── تحقق ──
  const counts = await Promise.all(
    ['members', 'posts', 'comments', 'reactions'].map(async (t) => {
      const r = await turso.execute(`SELECT count(*) as n FROM ${t}`)
      return `${t}=${Number(r.rows[0]?.n ?? 0)}`
    }),
  )
  console.log(`\n🎉 BACKFILL COMPLETE — ${counts.join(' · ')}`)
}

main().catch((e) => {
  console.error('FATAL:', e?.message ?? e)
  process.exit(1)
})
