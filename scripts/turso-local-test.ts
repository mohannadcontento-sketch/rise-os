/**
 * turso-local-test.ts — يختبر طبقة مرآة Turso (community-sync) ضد
 * قاعدة libSQL محلية (file:) — نفس كود الكتابة الإنتاجي بالضبط،
 * لأن كل دوال writeXRow هي التي يستدعيها المسار عند توفر مفاتيح
 * Turso. البروتوكول (libSQL/SQLite) هو نفسه المستخدم في Turso.
 *
 * تشغيل: bun scripts/turso-local-test.ts
 */
import { createClient, type Client } from '@libsql/client'
import { rmSync } from 'fs'
import {
  ensureTursoSchema,
  writeMemberRow,
  writePostRow,
  writeCommentRow,
  setReactionRow,
  deletePostCascadeRow,
  deleteCommentRow,
} from '../src/lib/community-sync'

const DB_PATH = './tmp/turso-local-test.db'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, extra = '') {
  if (cond) {
    pass++
    console.log(`✅ ${name}${extra ? ` — ${extra}` : ''}`)
  } else {
    fail++
    console.log(`❌ ${name}${extra ? ` — ${extra}` : ''}`)
  }
}

async function one(c: Client, sql: string, ...args: (string | number | null)[]): Promise<any> {
  const r = await c.execute({ sql, args })
  return r.rows[0] ?? null
}

async function main() {
  rmSync(DB_PATH, { force: true })
  const client = createClient({ url: `file:${DB_PATH}` })

  // 1) المخطط
  await ensureTursoSchema(client)
  const tables = await client.execute(
    `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('members','posts','comments','reactions') ORDER BY name`,
  )
  check('[schema] الجداول الأربعة أُنشئت', tables.rows.length === 4, tables.rows.map((r) => r.name).join(','))

  // 2) عضو + upsert
  await writeMemberRow(client, { user_id: 'u-1', name: 'محمود', handle: 'mahmoud', avatar: null })
  await writeMemberRow(client, { user_id: 'u-1', name: 'محمود الجديد', handle: 'mahmoud2', avatar: 'av1' })
  const m = await one(client, `SELECT name, handle, avatar FROM members WHERE user_id = ?`, 'u-1')
  check('[members] upsert يحدّث لا يكرر', m?.name === 'محمود الجديد' && m?.handle === 'mahmoud2' && m?.avatar === 'av1')
  const mCount = await one(client, `SELECT count(*) as n FROM members`)
  check('[members] صف واحد فقط', Number(mCount?.n) === 1)

  // 3) منشور مع media_json + عدادات
  const mediaJson = JSON.stringify([{ key: 'community/u-1/x.jpg', contentType: 'image/jpeg', bytes: 123 }])
  await writePostRow(client, {
    id: 'p-1', user_id: 'u-1', title: 'عنوان', body: 'نص', status: 'published',
    media_json: mediaJson, like_count: 3, reply_count: 2,
    author_name: 'محمود', author_handle: 'mahmoud', author_avatar: null,
    created_at: '2026-09-12T10:00:00Z', last_activity_at: '2026-09-12T11:00:00Z', edited_at: null,
  })
  await writePostRow(client, {
    id: 'p-1', user_id: 'u-1', title: 'عنوان معدّل', body: 'نص', status: 'published',
    media_json: mediaJson, like_count: 4, reply_count: 2,
    author_name: 'محمود', author_handle: 'mahmoud', author_avatar: null,
    created_at: '2026-09-12T10:00:00Z', last_activity_at: '2026-09-12T12:00:00Z', edited_at: '2026-09-12T12:30:00Z',
  })
  const p = await one(client, `SELECT title, like_count, edited_at, media_json FROM posts WHERE id = ?`, 'p-1')
  check('[posts] upsert يحدّث العنوان والعدادات', p?.title === 'عنوان معدّل' && Number(p?.like_count) === 4)
  check('[posts] media_json مخزّن كما هو', p?.media_json === mediaJson)

  // 4) تعليق + رد
  await writeCommentRow(client, {
    id: 'c-1', post_id: 'p-1', parent_comment_id: null, user_id: 'u-2',
    body: 'تعليق', status: 'published', like_count: 0, reply_count: 1,
    author_name: 'سارة', author_handle: 'sara', author_avatar: null,
    created_at: '2026-09-12T10:30:00Z', edited_at: null,
  })
  await writeCommentRow(client, {
    id: 'c-2', post_id: 'p-1', parent_comment_id: 'c-1', user_id: 'u-1',
    body: 'رد', status: 'published', like_count: 0, reply_count: 0,
    author_name: 'محمود', author_handle: 'mahmoud', author_avatar: null,
    created_at: '2026-09-12T10:35:00Z', edited_at: null,
  })
  const cCount = await one(client, `SELECT count(*) as n FROM comments WHERE post_id = ?`, 'p-1')
  check('[comments] تعليق + رد مخزّنان', Number(cCount?.n) === 2)

  // 5) تفاعل toggle
  await setReactionRow(client, 'u-2', 'post', 'p-1', true, '2026-09-12T10:40:00Z')
  const r1 = await one(client, `SELECT count(*) as n FROM reactions`)
  check('[reactions] إعجاب مخزّن', Number(r1?.n) === 1)
  await setReactionRow(client, 'u-2', 'post', 'p-1', false)
  const r2 = await one(client, `SELECT count(*) as n FROM reactions`)
  check('[reactions] toggle يزيل الإعجاب', Number(r2?.n) === 0)
  await setReactionRow(client, 'u-2', 'post', 'p-1', true)
  await setReactionRow(client, 'u-2', 'post', 'p-1', true) // idempotent
  const r3 = await one(client, `SELECT count(*) as n FROM reactions`)
  check('[reactions] تكرار الإعجاب idempotent (لا صف مكرر)', Number(r3?.n) === 1)

  // 6) حذف تعليق (متسلسل مع تفاعلاته)
  await setReactionRow(client, 'u-1', 'comment', 'c-1', true)
  await deleteCommentRow(client, 'c-1')
  const cGone = await one(client, `SELECT count(*) as n FROM comments WHERE id = 'c-1'`)
  const crGone = await one(client, `SELECT count(*) as n FROM reactions WHERE target_type='comment' AND target_id='c-1'`)
  check('[delete] حذف تعليق + تفاعلاته', Number(cGone?.n) === 0 && Number(crGone?.n) === 0)

  // 7) حذف متسلسل للمنشور
  await setReactionRow(client, 'u-2', 'post', 'p-1', true)
  await deletePostCascadeRow(client, 'p-1')
  const pGone = await one(client, `SELECT count(*) as n FROM posts WHERE id='p-1'`)
  const pcGone = await one(client, `SELECT count(*) as n FROM comments WHERE post_id='p-1'`)
  const prGone = await one(client, `SELECT count(*) as n FROM reactions WHERE target_type='post' AND target_id='p-1'`)
  check('[delete] حذف متسلسل: منشور + تعليقاته + تفاعلاته',
    Number(pGone?.n) === 0 && Number(pcGone?.n) === 0 && Number(prGone?.n) === 0)

  // 8) الأمان: المرآة لا تحمل أي بيانات خاصة (تحقق بنيوي)
  const cols = await client.execute(`PRAGMA table_info(posts)`)
  const colNames = cols.rows.map((r) => String(r.name))
  const noPrivate = !colNames.some((c) => ['email', 'password', 'phone', 'address'].includes(c))
  check('[privacy] أعمدة المرآة عامة فقط (لا بريد/كلمة مرور)', noPrivate, colNames.join(','))

  console.log(`\n═══ RESULT: ${pass} pass, ${fail} fail ═══`)
  process.exit(fail > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
