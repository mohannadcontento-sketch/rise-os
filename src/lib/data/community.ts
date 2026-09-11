// ============================================================
// data/community.ts — طبقة بيانات المجتمع (المرحلة 07)
// الخلاصة/التفاصيل/التعليقات/التفاعل/البلاغ/الأعضاء + أنواع مشتركة.
// ============================================================

import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api-fetch'

export interface CommunityPostCard {
  id: string
  title: string
  body_snippet: string
  user_id: string
  author_name: string
  author_handle: string
  author_avatar: string | null
  like_count: number
  reply_count: number
  created_at: string
  last_activity_at: string
  status: 'published' | 'hidden' | 'removed'
  liked_by_me: boolean
}

export interface CommunityPostDetail {
  id: string
  title: string
  body: string
  userId: string
  author: { name: string; handle: string; avatar: string | null } | null
  status: string
  likeCount: number
  replyCount: number
  createdAt: string
  editedAt: string | null
  likedByMe: boolean
}

export interface CommunityCommentCard {
  id: string
  post_id: string
  parent_comment_id: string | null
  parent_author_handle: string | null
  user_id: string
  author_name: string
  author_handle: string
  author_avatar: string | null
  body: string
  status: string
  like_count: number
  reply_count: number
  created_at: string
  edited_at: string | null
  liked_by_me: boolean
}

interface FeedResponse {
  items: CommunityPostCard[]
  total: number
  page: number
  perPage: number
  hasMore: boolean
}

interface CommentsResponse {
  items: CommunityCommentCard[]
  total: number
  page: number
  perPage: number
  hasMore: boolean
}

/** يقرأ جسم JSON مع رسالة الخطأ العربية من الاستجابة إن وُجدت */
async function readJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = 'تعذّر الاتصال — أعد المحاولة'
    try {
      const j = await res.json()
      if (j?.error) msg = j.error
    } catch { /* keep default */ }
    throw new Error(msg)
  }
  return res.json() as Promise<T>
}

const EMPTY_FEED: FeedResponse = { items: [], total: 0, page: 1, perPage: 20, hasMore: false }

export async function fetchCommunityFeed(page: number, filter: 'latest' | 'top'): Promise<FeedResponse> {
  try {
    const r = await apiGet(`/api/rise/community/posts?page=${page}&filter=${filter}`)
    return await readJson<FeedResponse>(r)
  } catch {
    return { ...EMPTY_FEED, page }
  }
}

export async function fetchCommunityPost(id: string): Promise<CommunityPostDetail | null> {
  try {
    const r = await apiGet(`/api/rise/community/posts/${id}`)
    return await readJson<CommunityPostDetail>(r)
  } catch {
    return null
  }
}

export async function fetchCommunityComments(postId: string, page: number): Promise<CommentsResponse> {
  try {
    const r = await apiGet(`/api/rise/community/posts/${postId}/comments?page=${page}`)
    return await readJson<CommentsResponse>(r)
  } catch {
    return { items: [], total: 0, page, perPage: 20, hasMore: false }
  }
}

export async function createCommunityPost(title: string, body: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const r = await apiPost('/api/rise/community/posts', { title, body })
    const data = await readJson<{ id?: string }>(r)
    return { ok: true, id: data.id }
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || 'تعذّر النشر' }
  }
}

export async function updateCommunityPost(id: string, patch: { title?: string; body?: string }): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await apiPatch(`/api/rise/community/posts/${id}`, patch)
    await readJson<unknown>(r)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || 'تعذّر التحديث' }
  }
}

export async function deleteCommunityPost(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await apiDelete(`/api/rise/community/posts/${id}`)
    await readJson<unknown>(r)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || 'تعذّر الحذف' }
  }
}

export async function createCommunityComment(postId: string, body: string, parentId?: string | null): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const r = await apiPost('/api/rise/community/comments', { postId, body, parentId: parentId ?? undefined })
    const data = await readJson<{ id?: string }>(r)
    return { ok: true, id: data.id }
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || 'تعذّر إضافة التعليق' }
  }
}

export async function deleteCommunityComment(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await apiDelete(`/api/rise/community/comments/${id}`)
    await readJson<unknown>(r)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || 'تعذّر الحذف' }
  }
}

export async function toggleCommunityReaction(targetType: 'post' | 'comment', targetId: string): Promise<{ ok: boolean; liked?: boolean; likeCount?: number | null; error?: string }> {
  try {
    const r = await apiPost('/api/rise/community/reactions', { targetType, targetId })
    const data = await readJson<{ liked?: boolean; likeCount?: number | null }>(r)
    return { ok: true, liked: data.liked, likeCount: data.likeCount }
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || 'تعذّر تسجيل التفاعل' }
  }
}

export async function reportCommunityContent(targetType: 'post' | 'comment', targetId: string, reason: string, details?: string): Promise<{ ok: boolean; already?: boolean; error?: string }> {
  try {
    const r = await apiPost('/api/rise/community/reports', { targetType, targetId, reason, details })
    const data = await readJson<{ already?: boolean }>(r)
    return { ok: true, already: data.already }
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || 'تعذّر تسجيل البلاغ' }
  }
}

export async function searchCommunityMembers(q: string): Promise<{ id: string; name: string; handle: string; avatar: string | null }[]> {
  try {
    const r = await apiGet(`/api/rise/community/members?q=${encodeURIComponent(q)}`)
    const data = await readJson<{ members: { id: string; name: string; handle: string; avatar: string | null }[] }>(r)
    return data.members ?? []
  } catch {
    return []
  }
}
