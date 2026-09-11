/**
 * turso-live-setup.ts — إعداد وتفعيل مرآة Turso الحية (Super-Z).
 *
 * يقوم بـ:
 *   1) ضمان مخطط المرآة (idempotent)
 *   2) تعبئة أولية من dump JSON (نفس دوال الكتابة الإنتاجية)
 *   3) جولة كتابة/قراءة/حذف حقيقية (برهنة الصلاحيات full-access)
 *   4) تحقق الأعداد
 *
 * متغيرات البيئة:
 *   TURSO_DATABASE_URL + TURSO_AUTH_TOKEN (الهدف)
 *   COMMUNITY_DUMP (اختياري — مسار ملف JSON من export-community)
 *
 * تشغيل: bun scripts/turso-live-setup.ts
 */
import { readFileSync } from 'node:fs'
import { createClient, type Client } from '@libsql/client'
import {
  ensureTursoSchema,
  writeMemberRow,
  writePostRow,
  writeCommentRow,
  setReactionRow,
  deletePostCascadeRow,
  type MemberMirrorRow,
  type PostMirrorRow,
  type CommentMirrorRow,
} from '../src/lib/community-sync'

async function count(c: Client, table: string): Promise<number> {
  const r = await c.execute(`SELECT count(*) as n FROM ${table}`)
  return Number(r.rows[0]?.n ?? 0)
}

async function main() {
  const url = process.env.TURSO_DATABASE_URL
  const token = process.env.TURSO_AUTH_TOKEN
  if (!url) {
    console.error('❌ TURSO_DATABASE_URL مطلوب')
    process.exit(1)
  }

  const turso = createClient({ url, authToken: token || undefined })
  const check = (label: string, ok: boolean, extra = '') => {
    console.log(`${ok ? '✅' : '❌'} ${label}${extra ? ' — ' + extra : ''}`)
    if (!ok) process.exitCode = 1
  }

  // 1) المخطط
  console.log('── [1/4] مخطط المرآة (idempotent) ──')
  await ensureTursoSchema(turso)
  for (const t of ['members', 'posts', 'comments', 'reactions']) {
    const n = await count(turso, t) // يثبت وجود الجدول
    console.log(`   ${t}: ${n}`)
  }

  // 2) التعبئة الأولية (idempotent — upserts)
  const dumpPath = process.env.COMMUNITY_DUMP
  if (dumpPath) {
    console.log('── [2/4] backfill من dump ──')
    const dump = JSON.parse(readFileSync(dumpPath, 'utf-8'))
    let n = 0
    for (const m of dump.members ?? []) {
      await writeMemberRow(turso, m as MemberMirrorRow)
      n++
    }
    console.log(`   members: ${n}`)
    n = 0
    for (const p of dump.posts ?? []) {
      await writePostRow(turso, p as PostMirrorRow)
      n++
    }
    console.log(`   posts: ${n}`)
    n = 0
    for (const cm of dump.comments ?? []) {
      await writeCommentRow(turso, cm as CommentMirrorRow)
      n++
    }
    console.log(`   comments: ${n}`)
    n = 0
    for (const r of dump.reactions ?? []) {
      await setReactionRow(turso, r.user_id, r.target_type, r.target_id, true, r.created_at)
      n++
    }
    console.log(`   reactions: ${n}`)
  } else {
    console.log('── [2/4] بلا dump — تخطي التعبئة ──')
  }

  // 3) جولة كتابة/قراءة/حذف حقيقية (full-access برهان)
  console.log('── [3/4] جولة كتابة حية ──')
  const probeId = '11111111-1111-4111-8111-111111111111'
  const probeUserId = '22222222-2222-4222-8222-222222222222'
  await writePostRow(turso, {
    id: probeId,
    user_id: probeUserId,
    title: 'probe',
    body: 'super-z live probe',
    status: 'published',
    media_json: null,
    like_count: 0,
    reply_count: 0,
    author_name: null,
    author_handle: null,
    author_avatar: null,
    created_at: new Date().toISOString(),
    last_activity_at: null,
    edited_at: null,
  })
  const readBack = await turso.execute({ sql: 'SELECT title FROM posts WHERE id = ?', args: [probeId] })
  check('كتابة + قراءة منشور probe', readBack.rows[0]?.title === 'probe')
  await deletePostCascadeRow(turso, probeId)
  const gone = await turso.execute({ sql: 'SELECT count(*) as n FROM posts WHERE id = ?', args: [probeId] })
  check('حذف متسلسل للـ probe', Number(gone.rows[0]?.n ?? 1) === 0)

  // 4) تحقق نهائي
  console.log('── [4/4] الأعداد النهائية ──')
  const counts = {
    members: await count(turso, 'members'),
    posts: await count(turso, 'posts'),
    comments: await count(turso, 'comments'),
    reactions: await count(turso, 'reactions'),
  }
  console.log('   ', JSON.stringify(counts))
  if (dumpPath) {
    const dump = JSON.parse(readFileSync(dumpPath, 'utf-8'))
    check(
      'الأعداد تطابق الـ dump',
      counts.members === (dump.members?.length ?? 0) &&
        counts.posts === (dump.posts?.length ?? 0) &&
        counts.comments === (dump.comments?.length ?? 0) &&
        counts.reactions === (dump.reactions?.length ?? 0),
      JSON.stringify(counts),
    )
  }

  console.log(process.exitCode ? '\n⚠️ فشل فحص واحد أو أكثر' : '\n🎉 TURSO LIVE SETUP COMPLETE')
}

main().catch((e) => {
  console.error('FATAL:', e?.message ?? e)
  process.exit(1)
})
