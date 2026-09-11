// ============================================================
// community-sync.ts — مرآة Turso لمسار بيانات المجتمع العام.
//
// (قرار المالك — وثيقة النطاق §4: «المجتمع على Turso من اليوم
//  الأول — لتخفيف الضغط عن Supabase وفصل مسار البيانات العامة»)
//
// المبدأ: DUAL-WRITE، وSupabase هو مصدر الحقيقة.
//   1. الكتابة تنجح أولًا في Supabase (RLS + الحظر داخل DB +
//      العدادات بالتريجر + الإشعارات) — كما هي بلا تغيير.
//   2. بعد كل نجاح تُستدعى دالة مزامنة (fire-and-forget):
//      إما no-op فوري (بدون مفاتيح Turso) أو upsert مرآة.
//   3. فشل المزامنة لا يفسد الطلب أبدًا — تحذير في السجل فقط.
//
// ما يُزامَن (البيانات العامة فقط — لا بريد ولا بيانات خاصة):
//   members (الاسم/handle/الصورة العامة) + posts + comments +
//   reactions. البلاغات وسجل الإشراف والإشعارات = بيانات تشغيلية/
//  خاصة → تبقى في Supabase حصرًا (وثيقة النطاق §7).
//
// الكتابات منخفضة المستوى (writeXRow) مُصدَّرة للاختبار المحلي
// (file:) وللسكربت scripts/turso-backfill.ts.
// ============================================================

import type { Client } from '@libsql/client'
import { getTursoClient, isTursoConfigured } from '@/lib/turso'
import { getSupabaseAdmin } from '@/lib/supabase'

// ─────────────── المخطط المرآة (libSQL/SQLite) ───────────────

const SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS members (
     user_id    TEXT PRIMARY KEY,
     name       TEXT NOT NULL,
     handle     TEXT,
     avatar     TEXT,
     synced_at  TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS posts (
     id               TEXT PRIMARY KEY,
     user_id          TEXT NOT NULL,
     title            TEXT NOT NULL,
     body             TEXT NOT NULL,
     status           TEXT NOT NULL DEFAULT 'published',
     media_json       TEXT,
     like_count       INTEGER NOT NULL DEFAULT 0,
     reply_count      INTEGER NOT NULL DEFAULT 0,
     author_name      TEXT,
     author_handle    TEXT,
     author_avatar    TEXT,
     created_at       TEXT NOT NULL,
     last_activity_at TEXT,
     edited_at        TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS posts_status_activity_idx ON posts (status, last_activity_at DESC)`,
  `CREATE INDEX IF NOT EXISTS posts_user_idx ON posts (user_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS comments (
     id                TEXT PRIMARY KEY,
     post_id           TEXT NOT NULL,
     parent_comment_id TEXT,
     user_id           TEXT NOT NULL,
     body              TEXT NOT NULL,
     status            TEXT NOT NULL DEFAULT 'published',
     like_count        INTEGER NOT NULL DEFAULT 0,
     reply_count       INTEGER NOT NULL DEFAULT 0,
     author_name       TEXT,
     author_handle     TEXT,
     author_avatar     TEXT,
     created_at        TEXT NOT NULL,
     edited_at         TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS comments_post_idx ON comments (post_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS reactions (
     user_id      TEXT NOT NULL,
     target_type  TEXT NOT NULL,
     target_id    TEXT NOT NULL,
     created_at   TEXT,
     PRIMARY KEY (user_id, target_type, target_id)
   )`,
]

let schemaEnsured = false

/** يضمن وجود مخطط المرآة (مرة واحدة لكل عملية) — يرجّع العميل أو null */
export async function ensureTursoSchema(client?: Client): Promise<Client | null> {
  if (!isTursoConfigured() && !client) return null
  const c = client ?? getTursoClient()
  if (!c) return null
  if (!schemaEnsured || client) {
    for (const sql of SCHEMA_STATEMENTS) {
      await c.execute(sql)
    }
    schemaEnsured = true
  }
  return c
}

// ─────────────── أنواع صفوف المرآة ───────────────

export interface MemberMirrorRow {
  user_id: string
  name: string
  handle: string | null
  avatar: string | null
}

export interface PostMirrorRow {
  id: string
  user_id: string
  title: string
  body: string
  status: string
  media_json: string | null
  like_count: number
  reply_count: number
  author_name: string | null
  author_handle: string | null
  author_avatar: string | null
  created_at: string
  last_activity_at: string | null
  edited_at: string | null
}

export interface CommentMirrorRow {
  id: string
  post_id: string
  parent_comment_id: string | null
  user_id: string
  body: string
  status: string
  like_count: number
  reply_count: number
  author_name: string | null
  author_handle: string | null
  author_avatar: string | null
  created_at: string
  edited_at: string | null
}

function iso(v: unknown): string {
  if (typeof v === 'string' && v) return v
  try { return new Date(v as any).toISOString() } catch { return new Date().toISOString() }
}

// ─────────────── كتابات منخفضة المستوى (قابلة للاختبار) ───────────────

export async function writeMemberRow(client: Client, r: MemberMirrorRow): Promise<void> {
  await client.execute({
    sql: `INSERT INTO members (user_id, name, handle, avatar, synced_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT (user_id) DO UPDATE SET
            name = excluded.name, handle = excluded.handle,
            avatar = excluded.avatar, synced_at = excluded.synced_at`,
    args: [r.user_id, r.name, r.handle ?? null, r.avatar ?? null, new Date().toISOString()],
  })
}

export async function writePostRow(client: Client, r: PostMirrorRow): Promise<void> {
  await client.execute({
    sql: `INSERT INTO posts (id, user_id, title, body, status, media_json,
            like_count, reply_count, author_name, author_handle, author_avatar,
            created_at, last_activity_at, edited_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (id) DO UPDATE SET
            title = excluded.title, body = excluded.body, status = excluded.status,
            media_json = excluded.media_json, like_count = excluded.like_count,
            reply_count = excluded.reply_count, author_name = excluded.author_name,
            author_handle = excluded.author_handle, author_avatar = excluded.author_avatar,
            last_activity_at = excluded.last_activity_at, edited_at = excluded.edited_at`,
    args: [
      r.id, r.user_id, r.title, r.body, r.status, r.media_json,
      r.like_count, r.reply_count, r.author_name, r.author_handle, r.author_avatar,
      iso(r.created_at), r.last_activity_at ? iso(r.last_activity_at) : null,
      r.edited_at ? iso(r.edited_at) : null,
    ],
  })
}

export async function writeCommentRow(client: Client, r: CommentMirrorRow): Promise<void> {
  await client.execute({
    sql: `INSERT INTO comments (id, post_id, parent_comment_id, user_id, body, status,
            like_count, reply_count, author_name, author_handle, author_avatar,
            created_at, edited_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (id) DO UPDATE SET
            body = excluded.body, status = excluded.status,
            like_count = excluded.like_count, reply_count = excluded.reply_count,
            author_name = excluded.author_name, author_handle = excluded.author_handle,
            author_avatar = excluded.author_avatar, edited_at = excluded.edited_at`,
    args: [
      r.id, r.post_id, r.parent_comment_id, r.user_id, r.body, r.status,
      r.like_count, r.reply_count, r.author_name, r.author_handle, r.author_avatar,
      iso(r.created_at), r.edited_at ? iso(r.edited_at) : null,
    ],
  })
}

export async function setReactionRow(
  client: Client,
  userId: string,
  targetType: 'post' | 'comment',
  targetId: string,
  liked: boolean,
  createdAt?: string | null,
): Promise<void> {
  if (liked) {
    await client.execute({
      sql: `INSERT INTO reactions (user_id, target_type, target_id, created_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT (user_id, target_type, target_id) DO UPDATE SET
              created_at = excluded.created_at`,
      args: [userId, targetType, targetId, createdAt ?? new Date().toISOString()],
    })
  } else {
    await client.execute({
      sql: `DELETE FROM reactions WHERE user_id = ? AND target_type = ? AND target_id = ?`,
      args: [userId, targetType, targetId],
    })
  }
}

/** حذف متسلسل: منشور + تعليقاته + تفاعلاته من المرآة */
export async function deletePostCascadeRow(client: Client, postId: string): Promise<void> {
  await client.batch([
    {
      sql: `DELETE FROM reactions WHERE (target_type = 'post' AND target_id = ?)
              OR (target_type = 'comment' AND target_id IN
                  (SELECT id FROM comments WHERE post_id = ?))`,
      args: [postId, postId],
    },
    { sql: `DELETE FROM comments WHERE post_id = ?`, args: [postId] },
    { sql: `DELETE FROM posts WHERE id = ?`, args: [postId] },
  ])
}

export async function deleteCommentRow(client: Client, commentId: string): Promise<void> {
  await client.batch([
    { sql: `DELETE FROM reactions WHERE target_type = 'comment' AND target_id = ?`, args: [commentId] },
    { sql: `DELETE FROM comments WHERE id = ?`, args: [commentId] },
  ])
}

// ─────────────── المنسّقات (fetch من Supabase ثم مرآة) ───────────────
// كلها: no-op فوري بدون مفاتيح Turso، ولا ترمي أبدًا.

async function fetchPostRow(postId: string): Promise<PostMirrorRow | null> {
  const admin = await getSupabaseAdmin()
  if (!admin) return null
  const { data: post } = await (admin as any)
    .from('community_posts')
    .select('id, user_id, title, body, status, media, like_count, reply_count, created_at, last_activity_at, edited_at')
    .eq('id', postId)
    .maybeSingle()
  if (!post) return null
  const { data: profile } = await (admin as any)
    .from('profiles')
    .select('name, handle, avatar')
    .eq('id', post.user_id)
    .maybeSingle()
  return {
    id: post.id,
    user_id: post.user_id,
    title: post.title,
    body: post.body,
    status: post.status,
    media_json: post.media ? JSON.stringify(post.media) : null,
    like_count: post.like_count ?? 0,
    reply_count: post.reply_count ?? 0,
    author_name: profile?.name ?? null,
    author_handle: profile?.handle ?? null,
    author_avatar: profile?.avatar ?? null,
    created_at: iso(post.created_at),
    last_activity_at: post.last_activity_at ? iso(post.last_activity_at) : null,
    edited_at: post.edited_at ? iso(post.edited_at) : null,
  }
}

async function fetchCommentRow(commentId: string): Promise<CommentMirrorRow | null> {
  const admin = await getSupabaseAdmin()
  if (!admin) return null
  const { data: c } = await (admin as any)
    .from('community_comments')
    .select('id, post_id, parent_comment_id, user_id, body, status, like_count, reply_count, created_at, edited_at')
    .eq('id', commentId)
    .maybeSingle()
  if (!c) return null
  const { data: profile } = await (admin as any)
    .from('profiles')
    .select('name, handle, avatar')
    .eq('id', c.user_id)
    .maybeSingle()
  return {
    id: c.id,
    post_id: c.post_id,
    parent_comment_id: c.parent_comment_id ?? null,
    user_id: c.user_id,
    body: c.body,
    status: c.status,
    like_count: c.like_count ?? 0,
    reply_count: c.reply_count ?? 0,
    author_name: profile?.name ?? null,
    author_handle: profile?.handle ?? null,
    author_avatar: profile?.avatar ?? null,
    created_at: iso(c.created_at),
    edited_at: c.edited_at ? iso(c.edited_at) : null,
  }
}

/** مزامنة ملف عضو عام (اسم/handle/صورة) */
export async function tursoUpsertMember(userId: string): Promise<void> {
  try {
    const client = await ensureTursoSchema()
    if (!client) return
    const admin = await getSupabaseAdmin()
    if (!admin) return
    const { data: p } = await (admin as any)
      .from('profiles')
      .select('name, handle, avatar')
      .eq('id', userId)
      .maybeSingle()
    if (!p) return
    await writeMemberRow(client, {
      user_id: userId,
      name: p.name ?? 'مستخدم',
      handle: p.handle ?? null,
      avatar: p.avatar ?? null,
    })
  } catch (e) {
    console.warn('[turso-sync] member failed (ignored):', (e as Error)?.message)
  }
}

/** مزامنة منشور (مع لقطة المؤلف وmedia) — تُستدعى بعد إنشاء/تعديل/إشراف/عدادات */
export async function tursoUpsertPost(postId: string): Promise<void> {
  try {
    const client = await ensureTursoSchema()
    if (!client) return
    const row = await fetchPostRow(postId)
    if (!row) return
    await writePostRow(client, row)
  } catch (e) {
    console.warn('[turso-sync] post failed (ignored):', (e as Error)?.message)
  }
}

export async function tursoDeletePost(postId: string): Promise<void> {
  try {
    const client = await ensureTursoSchema()
    if (!client) return
    await deletePostCascadeRow(client, postId)
  } catch (e) {
    console.warn('[turso-sync] post delete failed (ignored):', (e as Error)?.message)
  }
}

export async function tursoUpsertComment(commentId: string): Promise<void> {
  try {
    const client = await ensureTursoSchema()
    if (!client) return
    const row = await fetchCommentRow(commentId)
    if (!row) return
    await writeCommentRow(client, row)
  } catch (e) {
    console.warn('[turso-sync] comment failed (ignored):', (e as Error)?.message)
  }
}

export async function tursoDeleteComment(commentId: string): Promise<void> {
  try {
    const client = await ensureTursoSchema()
    if (!client) return
    await deleteCommentRow(client, commentId)
  } catch (e) {
    console.warn('[turso-sync] comment delete failed (ignored):', (e as Error)?.message)
  }
}

/** مزامنة toggle تفاعل + إعادة مزامنة عدادات الهدف */
export async function tursoSyncReaction(
  userId: string,
  targetType: 'post' | 'comment',
  targetId: string,
  liked: boolean,
): Promise<void> {
  try {
    const client = await ensureTursoSchema()
    if (!client) return
    await setReactionRow(client, userId, targetType, targetId, liked)
    // العدادات تغيّرت بالتريجر في Supabase → أعد مزامنة صف الهدف
    if (targetType === 'post') await tursoUpsertPost(targetId)
    else await tursoUpsertComment(targetId)
  } catch (e) {
    console.warn('[turso-sync] reaction failed (ignored):', (e as Error)?.message)
  }
}
