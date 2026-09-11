// ============================================================
// e2e-community-mock.ts — PostgREST stub للمرحلة 07 (المجتمع)
//
// يقلّد Supabase REST لكل ما تلمسه مسارات المجتمع:
//   • auth/v1/user لمستخدمين (A = أدمن/المالك، B = عضو)
//   • community_posts / comments / reactions / mentions /
//     reports / moderation_log / bans + profiles + notifications
//   • RPCs: get_community_feed / get_community_post /
//     get_community_comments / search_community_members /
//     notify_user (مع dedup)
// منطق العدادات/الحظر/RLS-own يُطبَّق داخل الموك كما في
// migration 030 بالضبط.
// ============================================================

import http from 'node:http'

const PORT = Number(process.env.COMMUNITY_MOCK_PORT || 5997)

// ── users ──
const USER_A = { id: 'a0000000-0000-4000-8000-000000000001', email: 'a@example.com', handle: 'owner', name: 'مالك أوج', role: 'admin' }
const USER_B = { id: 'b0000000-0000-4000-8000-000000000002', email: 'b@example.com', handle: 'member', name: 'عضو تجريبي', role: 'user' }
const PROFILES = [USER_A, USER_B]

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
function mint(u: typeof USER_A): string {
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: u.id, email: u.email, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.${b64url({ sig: 'mock' })}`
}
export const tokenA = mint(USER_A)
export const tokenB = mint(USER_B)

// ── state ──
interface PostRow { id: string; user_id: string; title: string; body: string; status: string; edited_at: string | null; like_count: number; reply_count: number; last_activity_at: string; created_at: string }
interface CommentRow { id: string; post_id: string; user_id: string; parent_comment_id: string | null; body: string; status: string; edited_at: string | null; like_count: number; reply_count: number; created_at: string }
interface ReactionRow { id: string; user_id: string; target_type: string; target_id: string; created_at: string }
interface ReportRow { id: string; reporter_id: string; target_type: string; target_id: string; reason: string; details: string | null; status: string; handled_by: string | null; handled_at: string | null; created_at: string }
interface NotifRow { id: string; user_id: string; type: string; title: string; body: string | null; icon: string | null; action_url: string | null; metadata: Record<string, unknown>; priority: string; read: boolean; dedup_key: string | null; pushed_at: string | null; created_at: string }

const posts: PostRow[] = []
const comments: CommentRow[] = []
const reactions: ReactionRow[] = []
const mentions: Array<{ id: string; post_id: string | null; comment_id: string | null; mentioned_user_id: string }> = []
const reports: ReportRow[] = []
const modLog: Array<{ id: string; moderator_id: string | null; action: string; target_type: string; target_id: string; reason: string | null; created_at: string }> = []
const bans: Array<{ user_id: string; reason: string | null; expires_at: string | null; created_at: string }> = []
const notifications: NotifRow[] = []

let seq = 0
const nextId = () => { seq++; return `20000000-0000-4000-8000-${String(seq).padStart(12, '0')}` }
const now = () => new Date().toISOString()

const profileOf = (id: string) => PROFILES.find((p) => p.id === id)

function bearerPayload(req: any): { sub?: string; role?: string } {
  const auth = req.headers['authorization'] || ''
  const token = String(auth).replace(/^Bearer\s+/i, '')
  if (token.startsWith('test-service-role')) return { role: 'service_role' }
  try { return JSON.parse(Buffer.from(token.split('.')[1] || '', 'base64url').toString()) } catch { return {} }
}

// ── logic mirrors of migration 030 ──

function isBanned(userId: string): boolean {
  return bans.some((b) => b.user_id === userId && (!b.expires_at || new Date(b.expires_at) > new Date()))
}

function insertPost(userId: string, body: any): PostRow {
  if (isBanned(userId)) throw { code: 403, message: 'community_banned' }
  const row: PostRow = {
    id: nextId(), user_id: userId,
    title: String(body.title ?? ''), body: String(body.body ?? ''),
    status: body.status ?? 'published', edited_at: null,
    like_count: 0, reply_count: 0, last_activity_at: now(), created_at: now(),
  }
  posts.push(row)
  return row
}

function insertComment(userId: string, body: any): CommentRow {
  if (isBanned(userId)) throw { code: 403, message: 'community_banned' }
  const post = posts.find((p) => p.id === body.post_id)
  if (!post || post.status !== 'published') throw { code: 404, message: 'post not available' }
  if (body.parent_comment_id) {
    const parent = comments.find((c) => c.id === body.parent_comment_id)
    if (!parent || parent.post_id !== body.post_id || parent.status !== 'published') throw { code: 404, message: 'parent not available' }
    parent.reply_count++
  }
  const row: CommentRow = { id: nextId(), post_id: body.post_id, user_id: userId, parent_comment_id: body.parent_comment_id ?? null, body: String(body.body ?? ''), status: 'published', edited_at: null, like_count: 0, reply_count: 0, created_at: now() }
  comments.push(row)
  post.reply_count++
  post.last_activity_at = now()
  return row
}

function deleteComment(id: string): boolean {
  const idx = comments.findIndex((c) => c.id === id)
  if (idx === -1) return false
  const c = comments[idx]
  if (c.parent_comment_id) {
    const parent = comments.find((p) => p.id === c.parent_comment_id)
    if (parent) parent.reply_count = Math.max(0, parent.reply_count - 1)
  }
  const post = posts.find((p) => p.id === c.post_id)
  if (post) post.reply_count = Math.max(0, post.reply_count - 1)
  // الردود على هذا التعليق تُحذف (cascade)
  comments.splice(idx, 1)
  for (let i = comments.length - 1; i >= 0; i--) {
    if (comments[i].parent_comment_id === id) { comments.splice(i, 1); post && (post.reply_count = Math.max(0, post.reply_count - 1)) }
  }
  return true
}

function toggleReaction(userId: string, body: any): { liked: boolean } {
  if (isBanned(userId)) throw { code: 403, message: 'community_banned' }
  const key = (r: ReactionRow) => r.user_id === userId && r.target_type === body.targetType && r.target_id === body.targetId
  const existing = reactions.find(key)
  if (existing) {
    reactions.splice(reactions.indexOf(existing), 1)
    const t = body.targetType === 'post' ? posts : comments
    const row: any = t.find((x: any) => x.id === body.targetId)
    if (row) row.like_count = Math.max(0, row.like_count - 1)
    return { liked: false }
  }
  reactions.push({ id: nextId(), user_id: userId, target_type: body.targetType, target_id: body.targetId, created_at: now() })
  const t = body.targetType === 'post' ? posts : comments
  const row: any = t.find((x: any) => x.id === body.targetId)
  if (row) row.like_count++
  return { liked: true }
}

function insertReport(reporterId: string, body: any) {
  const tType = String(body.target_type ?? body.targetType ?? '')
  const tId = String(body.target_id ?? body.targetId ?? '')
  const dup = reports.find((r) => r.reporter_id === reporterId && r.target_type === tType && r.target_id === tId)
  if (dup) return { duplicate: true }
  reports.push({ id: nextId(), reporter_id: reporterId, target_type: tType, target_id: tId, reason: body.reason, details: body.details ?? null, status: 'open', handled_by: null, handled_at: null, created_at: now() })
  return { duplicate: false }
}

function notifyUserRpc(body: any): string | null {
  // dedup مثل الفهرس الفريد (user_id, dedup_key)
  if (body.p_dedup_key) {
    const dup = notifications.find((n) => n.user_id === body.p_user_id && n.dedup_key === body.p_dedup_key)
    if (dup) return null
  }
  const id = nextId()
  notifications.push({
    id, user_id: body.p_user_id, type: body.p_type, title: body.p_title, body: body.p_body ?? null,
    icon: body.p_icon ?? null, action_url: body.p_action_url ?? null,
    metadata: body.p_metadata ?? {}, priority: body.p_priority ?? 'normal',
    read: false, dedup_key: body.p_dedup_key ?? null, pushed_at: null, created_at: now(),
  })
  return id
}

// ── RPC read models ──
function feed(page: number, perPage: number, filter: string, me: string) {
  const visible = posts.filter((p) => p.status === 'published')
  const sorted = [...visible].sort((a, b) =>
    filter === 'top'
      ? b.like_count - a.like_count || b.created_at.localeCompare(a.created_at)
      : b.last_activity_at.localeCompare(a.last_activity_at))
  const items = sorted.slice((page - 1) * perPage, page * perPage).map((p) => {
    const author = profileOf(p.user_id)
    return {
      id: p.id, title: p.title, body_snippet: p.body.slice(0, 220), user_id: p.user_id,
      author_name: author?.name, author_handle: author?.handle, author_avatar: null,
      like_count: p.like_count, reply_count: p.reply_count,
      created_at: p.created_at, last_activity_at: p.last_activity_at, status: p.status,
      liked_by_me: reactions.some((r) => r.user_id === me && r.target_type === 'post' && r.target_id === p.id),
    }
  })
  return { items, total: visible.length, page, perPage: perPage, hasMore: page * perPage < visible.length }
}

function postDetail(id: string, me: string) {
  const p = posts.find((x) => x.id === id)
  if (!p) return null
  if (p.status !== 'published' && p.user_id !== me) return null
  const author = profileOf(p.user_id)
  return {
    id: p.id, title: p.title, body: p.body, userId: p.user_id,
    author: author ? { name: author.name, handle: author.handle, avatar: null } : null,
    status: p.status, likeCount: p.like_count, replyCount: p.reply_count,
    createdAt: p.created_at, editedAt: p.edited_at,
    likedByMe: reactions.some((r) => r.user_id === me && r.target_type === 'post' && r.target_id === p.id),
  }
}

function commentsFeed(postId: string, page: number, perPage: number, me: string) {
  const visible = comments.filter((c) => c.post_id === postId && c.status === 'published')
  const sorted = [...visible].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const items = sorted.slice((page - 1) * perPage, page * perPage).map((c) => {
    const author = profileOf(c.user_id)
    const parent = c.parent_comment_id ? comments.find((x) => x.id === c.parent_comment_id) : null
    const parentAuthor = parent ? profileOf(parent.user_id) : null
    return {
      id: c.id, post_id: c.post_id, parent_comment_id: c.parent_comment_id,
      parent_author_handle: parentAuthor?.handle ?? null,
      user_id: c.user_id, author_name: author?.name, author_handle: author?.handle, author_avatar: null,
      body: c.body, status: c.status, like_count: c.like_count, reply_count: c.reply_count,
      created_at: c.created_at, edited_at: c.edited_at,
      liked_by_me: reactions.some((r) => r.user_id === me && r.target_type === 'comment' && r.target_id === c.id),
    }
  })
  return { items, total: visible.length, page, perPage, hasMore: page * perPage < visible.length }
}

// ── HTTP plumbing ──
function json(res: http.ServerResponse, status: number, body: unknown) {
  const s = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(s) })
  res.end(s)
}

async function readBody(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  if (chunks.length === 0) return {}
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}') } catch { return {} }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`)
  const caller = bearerPayload(req)
  const body = await readBody(req)
  const accept = String(req.headers['accept'] || '')

  try {
    // ── debug state ──
    if (req.method === 'GET' && url.pathname === '/state') {
      return json(res, 200, { posts, comments, reactions, mentions, reports, modLog, bans, notifications })
    }

    // ── auth ──
    if (req.method === 'GET' && url.pathname === '/auth/v1/user') {
      const p = caller
      const u = PROFILES.find((x) => x.id === p.sub)
      if (u) {
        return json(res, 200, {
          id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email,
          email_confirmed_at: now(), phone: '', app_metadata: {}, user_metadata: { name: u.name },
          identities: [], created_at: now(), updated_at: now(), is_anonymous: false,
        })
      }
      return json(res, 401, { code: 401, msg: 'Invalid token' })
    }

    // ── RPCs ──
    const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/)
    if (req.method === 'POST' && rpc) {
      const fn = rpc[1]
      const me = caller.sub
      switch (fn) {
        case 'get_community_feed':
          if (!me) return json(res, 403, { message: 'not_authenticated' })
          return json(res, 200, feed(Number(body.p_page ?? 1), Number(body.p_per_page ?? 20), String(body.p_filter ?? 'latest'), me))
        case 'get_community_post':
          if (!me) return json(res, 403, { message: 'not_authenticated' })
          return json(res, 200, postDetail(String(body.p_post_id), me))
        case 'get_community_comments':
          if (!me) return json(res, 403, { message: 'not_authenticated' })
          return json(res, 200, commentsFeed(String(body.p_post_id), Number(body.p_page ?? 1), Number(body.p_per_page ?? 20), me))
        case 'search_community_members': {
          if (!me) return json(res, 403, { message: 'not_authenticated' })
          const q = String(body.p_query ?? '').trim().toLowerCase()
          if (!q) return json(res, 200, [])
          const members = PROFILES.filter((p) => p.id !== me && (p.handle.startsWith(q) || p.name.toLowerCase().includes(q)))
            .map((p) => ({ id: p.id, name: p.name, handle: p.handle, avatar: null }))
          return json(res, 200, members)
        }
        case 'notify_user':
          return json(res, 200, notifyUserRpc(body))
        default:
          return json(res, 404, { code: 404, message: `function ${fn} not found` })
      }
    }

    // ── tables ──
    const table = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/)
    if (!table) return json(res, 404, { message: 'not found' })
    const t = table[1]
    const q = url.searchParams

    // profiles (mentions resolve + isAdmin)
    if (t === 'profiles' && req.method === 'GET') {
      let rows: any[] = [...PROFILES.map((p) => ({ id: p.id, name: p.name, handle: p.handle, email: p.email, role: p.role, suspended: false, avatar: null }))]
      const idEq = q.get('id')
      if (idEq?.startsWith('eq.')) rows = rows.filter((r) => r.id === idEq.slice(3))
      const handleIn = q.get('handle') || ''
      if (handleIn.startsWith('in.')) {
        const list = handleIn.replace(/^in\./, '').replace(/[()"']/g, '').split(',').map((s) => s.trim()).filter(Boolean)
        rows = rows.filter((r) => list.includes(r.handle))
      }
      const suspendedEq = q.get('suspended')
      if (suspendedEq === 'eq.false') rows = rows.filter((r) => !r.suspended)
      if (accept.includes('vnd.pgrst.object+json')) return json(res, 200, rows[0] ?? null)
      return json(res, 200, rows)
    }

    if (t === 'community_posts') {
      if (req.method === 'POST') {
        if (!caller.sub) return json(res, 403, { message: 'unauthenticated' })
        try {
          const row = insertPost(caller.sub, body)
          return json(res, 201, accept.includes('vnd.pgrst.object+json') ? row : [row])
        } catch (e: any) { return json(res, e.code || 400, { message: e.message }) }
      }
      if (req.method === 'GET') {
        let rows = posts.filter((p) => (p.status === 'published' || p.user_id === caller.sub) || caller.role === 'service_role')
        const idEq = q.get('id')
        if (idEq?.startsWith('eq.')) rows = rows.filter((p) => p.id === idEq.slice(3))
        if (idEq?.startsWith('in.')) {
          const list = idEq.replace(/^in\./, '').replace(/[()"']/g, '').split(',').map((x) => x.trim()).filter(Boolean)
          rows = rows.filter((p) => list.includes(p.id))
        }
        const sel = q.get('select')
        if (sel) {
          const cols = sel.split(',').map((c) => c.trim())
          rows = rows.map((p) => Object.fromEntries(cols.map((c) => [c, (p as any)[c]])))
        }
        if (accept.includes('vnd.pgrst.object+json')) return json(res, 200, rows[0] ?? null)
        return json(res, 200, rows)
      }
      if (req.method === 'PATCH') {
        const idEq = q.get('id') || ''
        const id = idEq.slice(3)
        const row = posts.find((p) => p.id === id)
        // service_role = الإشراف (status)؛ المستخدم = تعديل محتواه فقط
        if (row && caller.role === 'service_role') {
          if (body.status !== undefined) row.status = body.status
          if (body.title !== undefined) row.title = body.title
          if (body.body !== undefined) { row.body = body.body; row.edited_at = now() }
          return json(res, 204, null)
        }
        if (row && caller.sub === row.user_id && row.status === 'published' && body.status === undefined) {
          if (body.title !== undefined) row.title = body.title
          if (body.body !== undefined) { row.body = body.body; row.edited_at = now() }
          return json(res, 204, null)
        }
        return json(res, 400, { message: 'update rejected' })
      }
      if (req.method === 'DELETE') {
        const id = (q.get('id') || '').slice(3)
        const idx = posts.findIndex((p) => p.id === id)
        if (idx >= 0 && (posts[idx].user_id === caller.sub || caller.role === 'service_role')) {
          const pid = posts[idx].id
          posts.splice(idx, 1)
          for (let i = comments.length - 1; i >= 0; i--) if (comments[i].post_id === pid) comments.splice(i, 1)
          return json(res, 204, null)
        }
        return json(res, 400, { message: 'delete rejected' })
      }
    }

    if (t === 'community_comments') {
      if (req.method === 'POST') {
        if (!caller.sub) return json(res, 403, { message: 'unauthenticated' })
        try {
          const row = insertComment(caller.sub, body)
          return json(res, 201, accept.includes('vnd.pgrst.object+json') ? row : [row])
        } catch (e: any) { return json(res, e.code || 400, { message: e.message }) }
      }
      if (req.method === 'GET') {
        let rows = comments.filter((c) => (c.status === 'published' || c.user_id === caller.sub) || caller.role === 'service_role')
        const idEq = q.get('id')
        if (idEq?.startsWith('eq.')) rows = rows.filter((c) => c.id === idEq.slice(3))
        if (idEq?.startsWith('in.')) {
          const list = idEq.replace(/^in\./, '').replace(/[()"']/g, '').split(',').map((x) => x.trim()).filter(Boolean)
          rows = rows.filter((c) => list.includes(c.id))
        }
        const postEq = q.get('post_id')
        if (postEq?.startsWith('eq.')) rows = rows.filter((c) => c.post_id === postEq.slice(3))
        const sel = q.get('select')
        if (sel) {
          const cols = sel.split(',').map((c) => c.trim())
          rows = rows.map((c) => Object.fromEntries(cols.map((col) => [col, (c as any)[col]])))
        }
        if (accept.includes('vnd.pgrst.object+json')) return json(res, 200, rows[0] ?? null)
        return json(res, 200, rows)
      }
      if (req.method === 'DELETE') {
        const id = (q.get('id') || '').slice(3)
        const row = comments.find((c) => c.id === id)
        if (row && (row.user_id === caller.sub || caller.role === 'service_role')) {
          deleteComment(id)
          return json(res, 204, null)
        }
        return json(res, 400, { message: 'delete rejected' })
      }
      if (req.method === 'PATCH') {
        const id = (q.get('id') || '').slice(3)
        const row = comments.find((c) => c.id === id)
        if (row && caller.role === 'service_role') {
          if (body.status !== undefined) row.status = body.status
          if (body.body !== undefined) { row.body = body.body; row.edited_at = now() }
          return json(res, 204, null)
        }
        if (row && caller.sub === row.user_id && row.status === 'published' && body.status === undefined && body.body !== undefined) {
          row.body = body.body
          row.edited_at = now()
          return json(res, 204, null)
        }
        return json(res, 400, { message: 'update rejected' })
      }
    }

    if (t === 'community_reactions' && req.method === 'POST') {
      if (!caller.sub) return json(res, 403, { message: 'unauthenticated' })
      // المسار يُدرج مباشرة (snake_case) — التكرار يرفضه القيد الفريد
      const tType = String(body.target_type ?? body.targetType ?? '')
      const tId = String(body.target_id ?? body.targetId ?? '')
      if (isBanned(caller.sub)) return json(res, 403, { message: 'community_banned' })
      const dup = reactions.find((r) => r.user_id === caller.sub && r.target_type === tType && r.target_id === tId)
      if (dup) return json(res, 409, { message: 'duplicate key violates unique constraint "community_reactions_user_id_target_type_target_id_key"' })
      const row: ReactionRow = { id: nextId(), user_id: caller.sub, target_type: tType, target_id: tId, created_at: now() }
      reactions.push(row)
      const tgt: any = tType === 'post' ? posts.find((p) => p.id === tId) : comments.find((c) => c.id === tId)
      if (tgt && tgt.status !== 'removed') tgt.like_count++
      return json(res, 201, accept.includes('vnd.pgrst.object+json') ? row : [row])
    }
    if (t === 'community_reactions' && req.method === 'GET') {
      let rows = [...reactions]
      const userIdEq = q.get('user_id')
      if (userIdEq?.startsWith('eq.')) rows = rows.filter((r) => r.user_id === userIdEq.slice(3))
      const ttEq = q.get('target_type')
      if (ttEq?.startsWith('eq.')) rows = rows.filter((r) => r.target_type === ttEq.slice(3))
      const tidEq = q.get('target_id')
      if (tidEq?.startsWith('eq.')) rows = rows.filter((r) => r.target_id === tidEq.slice(3))
      if (accept.includes('vnd.pgrst.object+json')) return json(res, 200, rows[0] ?? null)
      return json(res, 200, rows)
    }
    if (t === 'community_reactions' && req.method === 'DELETE') {
      const id = (q.get('id') || '').slice(3)
      const idx = reactions.findIndex((r) => r.id === id)
      if (idx >= 0) {
        const r = reactions[idx]
        if (r.user_id === caller.sub) {
          reactions.splice(idx, 1)
          const tgt: any = r.target_type === 'post' ? posts.find((p) => p.id === r.target_id) : comments.find((c) => c.id === r.target_id)
          if (tgt) tgt.like_count = Math.max(0, tgt.like_count - 1)
          return json(res, 204, null)
        }
      }
      return json(res, 400, { message: 'unlike rejected' })
    }

    if (t === 'community_reports') {
      if (req.method === 'POST' && caller.sub) {
        const r = insertReport(caller.sub, body)
        if (r.duplicate) return json(res, 409, { message: 'duplicate key violates unique constraint' })
        return json(res, 201, {})
      }
      if (req.method === 'GET') {
        let rows = caller.role === 'service_role' ? [...reports] : reports.filter((r) => r.reporter_id === caller.sub)
        const idEq = q.get('id')
        if (idEq?.startsWith('eq.')) rows = rows.filter((r) => r.id === idEq.slice(3))
        const statusEq = q.get('status')
        if (statusEq?.startsWith('eq.')) rows = rows.filter((r) => r.status === statusEq.slice(3))
        else if (statusEq?.startsWith('neq.')) rows = rows.filter((r) => r.status !== statusEq.slice(4))
        rows = rows.sort((a, b) => a.created_at.localeCompare(b.created_at))
        if (accept.includes('vnd.pgrst.object+json')) return json(res, 200, rows[0] ?? null)
        return json(res, 200, rows)
      }
      if (req.method === 'PATCH' && caller.role === 'service_role') {
        // يدعم id=eq. (مسار مباشر) أو فلاتر target_type/target_id/status
        // (resolveReportsFor في مسار الإشراف)
        const idEq = q.get('id') || ''
        let rows = [...reports]
        if (idEq.startsWith('eq.')) rows = rows.filter((r) => r.id === idEq.slice(3))
        const tt = q.get('target_type')
        if (tt?.startsWith('eq.')) rows = rows.filter((r) => r.target_type === tt.slice(3))
        const tid = q.get('target_id')
        if (tid?.startsWith('eq.')) rows = rows.filter((r) => r.target_id === tid.slice(3))
        const st = q.get('status')
        if (st?.startsWith('eq.')) rows = rows.filter((r) => r.status === st.slice(3))
        for (const row of rows) {
          if (body.status !== undefined) row.status = body.status
          if (body.handled_by !== undefined) row.handled_by = body.handled_by
          if (body.handled_at !== undefined) row.handled_at = body.handled_at
        }
        return json(res, 204, null)
      }
    }

    if (t === 'community_mentions') {
      if (req.method === 'POST' && caller.role === 'service_role') {
        const rows = Array.isArray(body) ? body : [body]
        for (const r of rows) {
          const dup = mentions.find((m) =>
            (r.post_id ? m.post_id === r.post_id : m.comment_id === r.comment_id) && m.mentioned_user_id === r.mentioned_user_id)
          if (!dup) mentions.push({ id: nextId(), post_id: r.post_id ?? null, comment_id: r.comment_id ?? null, mentioned_user_id: r.mentioned_user_id })
        }
        return json(res, 201, {})
      }
      if (req.method === 'GET') {
        const rows = mentions.filter((m) => m.mentioned_user_id === caller.sub)
        return json(res, 200, rows)
      }
    }

    if (t === 'community_moderation_log') {
      if (req.method === 'POST' && caller.role === 'service_role') {
        const rows = Array.isArray(body) ? body : [body]
        for (const r of rows) modLog.push({ id: nextId(), moderator_id: r.moderator_id ?? null, action: r.action, target_type: r.target_type, target_id: r.target_id, reason: r.reason ?? null, created_at: now() })
        return json(res, 201, {})
      }
      if (req.method === 'GET') {
        const rows = caller.role === 'service_role' ? [...modLog].sort((a, b) => b.created_at.localeCompare(a.created_at)) : []
        return json(res, 200, rows)
      }
    }

    if (t === 'community_bans') {
      if (req.method === 'POST' && caller.role === 'service_role') {
        const rows = Array.isArray(body) ? body : [body]
        for (const r of rows) {
          const idx = bans.findIndex((b) => b.user_id === r.user_id)
          if (idx >= 0) bans.splice(idx, 1)
          bans.push({ user_id: r.user_id, reason: r.reason ?? null, expires_at: r.expires_at ?? null, created_at: now() })
        }
        return json(res, 201, {})
      }
      if (req.method === 'DELETE' && caller.role === 'service_role') {
        const userId = (q.get('user_id') || '').slice(3)
        const idx = bans.findIndex((b) => b.user_id === userId)
        if (idx >= 0) bans.splice(idx, 1)
        return json(res, 204, null)
      }
      if (req.method === 'GET') {
        let rows = caller.role === 'service_role' ? [...bans] : bans.filter((b) => b.user_id === caller.sub)
        const or = q.get('or')
        if (or) {
          // expires_at.is.null,expires_at.gt.<iso>
          const m = or.match(/expires_at\.gt\.([^,)]+)/)
          rows = rows.filter((b) => !b.expires_at || new Date(b.expires_at) > new Date(m ? m[1] : now()))
        }
        return json(res, 200, rows)
      }
    }

    if (t === 'notifications' && req.method === 'GET') {
      const rows = notifications.filter((n) => n.user_id === caller.sub || caller.role === 'service_role')
      if (accept.includes('vnd.pgrst.object+json')) return json(res, 200, rows[0] ?? null)
      return json(res, 200, rows)
    }

    // ── catch-all: audit_logs وأي جدول آخر (ابتلاع صامت) ──
    if (req.method === 'POST') return json(res, 201, {})
    if (req.method === 'GET') return json(res, 200, accept.includes('vnd.pgrst.object+json') ? {} : [])
    return json(res, 204, null)
  } catch (e: any) {
    return json(res, e.code || 400, { message: e.message || 'mock error' })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`community-mock on :${PORT}`)
  console.log('token A (admin):', tokenA)
  console.log('token B (member):', tokenB)
})
