'use client'

// ============================================================
// community.tsx — وحدة «المجتمع» (المرحلة 07)
//
// بنية ثلاث طبقات داخل نفس الوحدة (state machine خفيفة):
//   1) الخلاصة: فلاتر (الأحدث/الأكثر تفاعلًا) + تحميل تدريجي
//      (IntersectionObserver + زر «المزيد») + كومبوزر النشر
//      مع اقتراحات @mention
//   2) تفاصيل المنشور: النص الكامل + التعليقات (الأحدث أولًا،
//      تحميل تدريجي) + الردود على تعليق + القلب + البلاغ
//   3) صندوق البلاغ: أسباب جاهزة + تفاصيل اختيارية
//
// مبادئ UX من الخطة: «تحميل مضبوط» (skeleton + تعطيل أثناء
// الإرسال)، الإبلاغ لا يكسر الجلسة، وإشعار للمستخدم بحالته.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Heart, MessageCircle, Flag, Trash2, Pencil, ArrowRight, Users, Loader2, CornerUpLeft, X, Send, ImagePlus, Image as ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { AVATARS } from '@/lib/avatars'
import { useRiseStore } from '@/store/app-store'
import {
  fetchCommunityFeed,
  fetchCommunityPost,
  fetchCommunityComments,
  createCommunityPost,
  updateCommunityPost,
  deleteCommunityPost,
  createCommunityComment,
  deleteCommunityComment,
  toggleCommunityReaction,
  reportCommunityContent,
  searchCommunityMembers,
  uploadCommunityImage,
  type PendingMediaRef,
  type CommunityPostCard,
  type CommunityPostDetail,
  type CommunityCommentCard,
} from '@/lib/data/community'
import { getPendingCommunityPost, consumePendingCommunityPost } from '@/lib/community-focus'
import { MAX_MEDIA_PER_POST, MAX_IMAGE_BYTES, isAllowedImageType } from '@/lib/media-constants'

// ─── أدوات عرض ─────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'الآن'
  if (m < 60) return `قبل ${m} دقيقة`
  const h = Math.floor(m / 60)
  if (h < 24) return `قبل ${h} ساعة`
  const d = Math.floor(h / 24)
  if (d < 30) return `قبل ${d} يوم`
  return new Date(iso).toLocaleDateString('ar-EG')
}

const AR = (n: number) => n.toLocaleString('ar-EG')

/** يعرض النص مع تظليل @mentions */
function RichText({ text }: { text: string }) {
  const parts = useMemo(() => text.split(/(@[a-z0-9_]{2,24})/gi), [text])
  return (
    <p className="whitespace-pre-wrap break-words text-sm leading-7 text-foreground/90">
      {parts.map((p, i) =>
        /^@[a-z0-9_]{2,24}$/i.test(p) ? (
          <span key={i} className="font-semibold text-emerald-600 dark:text-emerald-400">{p}</span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </p>
  )
}

// FIX (2026-09-12 hotfix): قيمة الأفاتار قد تكون مفتاح ثيم (مثل "ocean-3") وليست رابط صورة —
// تمريرها كـ <img src> كان يسبب 404 لكل عضو ضبط أفاتاره من نافذة «اختر صورتك الرمزية».
// الآن: رابط صورة حقيقي → <img>، مفتاح ثيم → نفس تدرّج+SVG المستخدم في الشريط الجانبي/الإعدادات،
// وأي قيمة أخرى → دائرة الحرف الأول (كما كان).
function isImageUrl(v: string | null | undefined): boolean {
  if (!v) return false
  return /^(https?:)?\/\//i.test(v) || v.startsWith('data:') || v.startsWith('blob:') || v.startsWith('/')
}

function Avatar({ name, src, size = 36 }: { name: string; src?: string | null; size?: number }) {
  const initials = (name || '؟').trim().slice(0, 1)
  if (src && isImageUrl(src)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={name} width={size} height={size} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />
    )
  }
  const themed = src ? AVATARS.find(a => a.id === src) : undefined
  if (themed) {
    return (
      <div
        aria-label={name}
        className="rounded-full flex items-center justify-center shrink-0 overflow-hidden"
        style={{ width: size, height: size, ...themed.style }}
      >
        <span style={{ transform: `scale(${Math.min(1, size / 40)})` }}>{themed.svg}</span>
      </div>
    )
  }
  return (
    <div
      className="rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-bold flex items-center justify-center shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initials}
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border bg-card p-4 space-y-3 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-full bg-muted" />
        <div className="space-y-1.5 flex-1">
          <div className="h-3 w-24 rounded bg-muted" />
          <div className="h-2.5 w-16 rounded bg-muted" />
        </div>
      </div>
      <div className="h-4 w-3/4 rounded bg-muted" />
      <div className="h-3 w-full rounded bg-muted" />
      <div className="h-3 w-2/3 rounded bg-muted" />
    </div>
  )
}

// ─── كومبوننت الوحدة ───────────────────────────────────────

type FeedFilter = 'latest' | 'top'

export default function CommunityModule() {
  const { user } = useRiseStore()
  const userId = user?.id ?? ''

  // الخلاصة
  const [filter, setFilter] = useState<FeedFilter>('latest')
  const [posts, setPosts] = useState<CommunityPostCard[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [loadingFeed, setLoadingFeed] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  // الكومبوزر
  const [composerOpen, setComposerOpen] = useState(false)
  // ── مرفقات صور Cloudinary (المرحلة 07-ب): رفع موقّع + معاينة محلية ──
  interface LocalAttachment extends PendingMediaRef { localUrl: string; uploading: boolean }
  const [attachments, setAttachments] = useState<LocalAttachment[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftBody, setDraftBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [mentionSuggests, setMentionSuggests] = useState<{ id: string; name: string; handle: string }[]>([])
  const mentionSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // التفاصيل
  const [openPostId, setOpenPostId] = useState<string | null>(null)
  const [detail, setDetail] = useState<CommunityPostDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [comments, setComments] = useState<CommunityCommentCard[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentsHasMore, setCommentsHasMore] = useState(false)
  const [commentsPage, setCommentsPage] = useState(1)
  const [commentDraft, setCommentDraft] = useState('')
  const [replyTo, setReplyTo] = useState<CommunityCommentCard | null>(null)
  const [commentSubmitting, setCommentSubmitting] = useState(false)

  // تحرير منشوري
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editBody, setEditBody] = useState('')

  // البلاغ
  const [reportTarget, setReportTarget] = useState<{ type: 'post' | 'comment'; id: string; label: string } | null>(null)

  // ─── جلب الخلاصة ───
  const loadFeed = useCallback(async (f: FeedFilter, p: number, replace: boolean) => {
    if (replace) setLoadingFeed(true)
    else setLoadingMore(true)
    try {
      const r = await fetchCommunityFeed(p, f)
      setPosts((prev) => (replace ? r.items : [...prev, ...r.items.filter((n) => !prev.some((o) => o.id === n.id))]))
      setHasMore(r.hasMore)
      setTotal(r.total)
      setPage(p)
    } finally {
      setLoadingFeed(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    void loadFeed('latest', 1, true)
  }, [loadFeed])

  // deep-link من الإشعارات (community?post=<id>)
  useEffect(() => {
    const pending = getPendingCommunityPost()
    if (pending) {
      consumePendingCommunityPost()
      setOpenPostId(pending)
    }
    const handler = (e: Event) => {
      const id = String((e as CustomEvent).detail || '')
      if (id) setOpenPostId(id)
    }
    window.addEventListener('awj:open-community-post', handler)
    return () => window.removeEventListener('awj:open-community-post', handler)
  }, [])

  // infinite scroll على الخلاصة (بعيد عن منطقة التفاصيل)
  useEffect(() => {
    if (openPostId || !hasMore || loadingMore) return
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !loadingMore && hasMore) {
        void loadFeed(filter, page + 1, false)
      }
    }, { rootMargin: '300px' })
    io.observe(el)
    return () => io.disconnect()
  }, [openPostId, hasMore, loadingMore, page, filter, loadFeed])

  const switchFilter = (f: FeedFilter) => {
    if (f === filter) return
    setFilter(f)
    void loadFeed(f, 1, true)
  }

  // ─── فتح التفاصيل ───
  const openPost = useCallback(async (id: string) => {
    setOpenPostId(id)
    setDetailLoading(true)
    setDetail(null)
    setComments([])
    setCommentsPage(1)
    setEditing(false)
    try {
      const [p, c] = await Promise.all([
        fetchCommunityPost(id),
        fetchCommunityComments(id, 1),
      ])
      setDetail(p)
      setComments(c.items)
      setCommentsHasMore(c.hasMore)
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    if (openPostId) void openPost(openPostId)
  }, [openPostId, openPost])

  const loadMoreComments = async () => {
    if (!openPostId || commentsLoading) return
    setCommentsLoading(true)
    try {
      const r = await fetchCommunityComments(openPostId, commentsPage + 1)
      setComments((prev) => [...prev, ...r.items.filter((n) => !prev.some((o) => o.id === n.id))])
      setCommentsHasMore(r.hasMore)
      setCommentsPage(r.page)
    } finally {
      setCommentsLoading(false)
    }
  }

  // ─── النشر ───
  const onDraftBodyChange = (v: string) => {
    setDraftBody(v)
    // اقتراحات mention: آخر كلمة تبدأ بـ@
    if (mentionSearchRef.current) clearTimeout(mentionSearchRef.current)
    const m = v.match(/@([a-z0-9_]*)$/i)
    if (m && m[1].length >= 1) {
      mentionSearchRef.current = setTimeout(() => {
        void searchCommunityMembers(m[1]).then(setMentionSuggests)
      }, 250)
    } else {
      setMentionSuggests([])
    }
  }

  const pickMention = (handle: string) => {
    setDraftBody((b) => b.replace(/@([a-z0-9_]*)$/i, `@${handle} `))
    setMentionSuggests([])
  }

  // ─── مرفقات الصور (Cloudinary): presign → POST موقّع → معاينة محلية ───
  const onPickImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const room = MAX_MEDIA_PER_POST - attachments.length
    if (room <= 0) {
      toast.error(`حتى ${MAX_MEDIA_PER_POST} صور في المنشور الواحد`)
      return
    }
    for (const f of Array.from(files).slice(0, room)) {
      if (!isAllowedImageType(f.type)) {
        toast.error('نوع غير مدعوم — JPG / PNG / WebP / GIF فقط')
        continue
      }
      if (f.size > MAX_IMAGE_BYTES) {
        toast.error('الصورة أكبر من 8MB — صغّرها وأعد المحاولة')
        continue
      }
      const localUrl = URL.createObjectURL(f)
      // صف متفائل (loading) → يُستبدل عند اكتمال الرفع
      setAttachments((prev) => [...prev, { mediaId: '', key: `local-${localUrl}`, contentType: f.type, bytes: f.size, localUrl, uploading: true }])
      const r = await uploadCommunityImage(f)
      if (r.ok) {
        setAttachments((prev) =>
          prev.map((a) => (a.localUrl === localUrl
            ? { ...a, mediaId: r.media.mediaId, key: r.media.key, uploading: false }
            : a)),
        )
      } else {
        setAttachments((prev) => prev.filter((a) => a.localUrl !== localUrl))
        URL.revokeObjectURL(localUrl)
        toast.error(r.error || 'تعذّر رفع الصورة')
      }
    }
  }

  const removeAttachment = (localUrl: string) => {
    setAttachments((prev) => prev.filter((a) => a.localUrl !== localUrl))
    URL.revokeObjectURL(localUrl)
  }

  const clearAttachments = () => {
    attachments.forEach((a) => URL.revokeObjectURL(a.localUrl))
    setAttachments([])
  }

  const submitPost = async () => {
    if (submitting) return
    const title = draftTitle.trim()
    const body = draftBody.trim()
    if (title.length < 3) { toast.error('العنوان قصير جدًا (3 أحرف على الأقل)'); return }
    if (body.length < 1) { toast.error('المحتوى مطلوب'); return }
    if (attachments.some((a) => a.uploading)) { toast.error('انتظر اكتمال رفع الصور'); return }
    setSubmitting(true)
    try {
      const media = attachments
        .filter((a) => !a.uploading && a.mediaId)
        .map((a) => ({ key: a.key, mediaId: a.mediaId, contentType: a.contentType, bytes: a.bytes }))
      const r = await createCommunityPost(title, body, media.length > 0 ? media : undefined)
      if (r.ok) {
        toast.success('تم نشر منشورك في المجتمع')
        setComposerOpen(false)
        setDraftTitle('')
        setDraftBody('')
        clearAttachments()
        void loadFeed(filter, 1, true)
      } else {
        toast.error(r.error || 'تعذّر النشر')
      }
    } finally {
      setSubmitting(false)
    }
  }

  // ─── تعديل منشوري ───
  const startEdit = () => {
    if (!detail) return
    setEditTitle(detail.title)
    setEditBody(detail.body)
    setEditing(true)
  }

  const saveEdit = async () => {
    if (!detail || submitting) return
    setSubmitting(true)
    try {
      const r = await updateCommunityPost(detail.id, { title: editTitle.trim(), body: editBody.trim() })
      if (r.ok) {
        toast.success('تم تحديث المنشور')
        setEditing(false)
        await openPost(detail.id)
      } else {
        toast.error(r.error || 'تعذّر التحديث')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const removePost = async () => {
    if (!detail || submitting) return
    if (!confirm('حذف المنشور نهائيًا مع كل تعليقاته؟')) return
    setSubmitting(true)
    try {
      const r = await deleteCommunityPost(detail.id)
      if (r.ok) {
        toast.success('تم حذف المنشور')
        setOpenPostId(null)
        void loadFeed(filter, 1, true)
      } else {
        toast.error(r.error || 'تعذّر الحذف')
      }
    } finally {
      setSubmitting(false)
    }
  }

  // ─── التفاعل ───
  const like = async (type: 'post' | 'comment', id: string) => {
    const r = await toggleCommunityReaction(type, id)
    if (!r.ok) {
      toast.error(r.error || 'تعذّر تسجيل التفاعل')
      return
    }
    // تحديث محلي متزامن
    if (type === 'post') {
      setPosts((prev) => prev.map((p) => (p.id === id
        ? { ...p, liked_by_me: !!r.liked, like_count: r.likeCount ?? p.like_count + (r.liked ? 1 : -1) }
        : p)))
      setDetail((d) => (d && d.id === id ? { ...d, likedByMe: !!r.liked, likeCount: r.likeCount ?? d.likeCount + (r.liked ? 1 : -1) } : d))
    } else {
      setComments((prev) => prev.map((c) => (c.id === id
        ? { ...c, liked_by_me: !!r.liked, like_count: r.likeCount ?? c.like_count + (r.liked ? 1 : -1) }
        : c)))
    }
  }

  // ─── التعليق ───
  const submitComment = async () => {
    if (!openPostId || commentSubmitting) return
    const body = commentDraft.trim()
    if (body.length < 1) { toast.error('اكتب تعليقًا أولًا'); return }
    setCommentSubmitting(true)
    try {
      const r = await createCommunityComment(openPostId, body, replyTo?.id ?? null)
      if (r.ok) {
        setCommentDraft('')
        const wasReply = !!replyTo
        setReplyTo(null)
        toast.success(wasReply ? 'تم إرسال ردك' : 'تم إضافة تعليقك')
        // إعادة تحميل التعليقات (الأحدث أولًا)
        const c = await fetchCommunityComments(openPostId, 1)
        setComments(c.items)
        setCommentsHasMore(c.hasMore)
        setCommentsPage(1)
        // عدّاد التعليقات في التفاصيل
        setDetail((d) => (d ? { ...d, replyCount: d.replyCount + 1 } : d))
      } else {
        toast.error(r.error || 'تعذّر إضافة التعليق')
      }
    } finally {
      setCommentSubmitting(false)
    }
  }

  const removeComment = async (id: string) => {
    if (!confirm('حذف التعليق نهائيًا؟')) return
    const r = await deleteCommunityComment(id)
    if (r.ok) {
      toast.success('تم حذف التعليق')
      setComments((prev) => prev.filter((c) => c.id !== id))
      setDetail((d) => (d ? { ...d, replyCount: Math.max(0, d.replyCount - 1) } : d))
    } else {
      toast.error(r.error || 'تعذّر الحذف')
    }
  }

  // ─── البلاغ ───
  const [reportReason, setReportReason] = useState('spam')
  const [reportDetails, setReportDetails] = useState('')
  const [reportSubmitting, setReportSubmitting] = useState(false)

  const submitReport = async () => {
    if (!reportTarget || reportSubmitting) return
    setReportSubmitting(true)
    try {
      const r = await reportCommunityContent(reportTarget.type, reportTarget.id, reportReason, reportDetails.trim() || undefined)
      if (r.ok) {
        toast.success(r.already ? 'بلاغك عن هذا المحتوى مسجل بالفعل' : 'تم استلام البلاغ — سيراجعه المشرفون')
        setReportTarget(null)
        setReportDetails('')
      } else {
        toast.error(r.error || 'تعذّر تسجيل البلاغ')
      }
    } finally {
      setReportSubmitting(false)
    }
  }

  // ═══════════════ العرض ═══════════════

  // (1) تفاصيل منشور
  if (openPostId) {
    return (
      <div className="space-y-4 max-w-3xl mx-auto pb-8">
        <button
          onClick={() => { setOpenPostId(null); setDetail(null) }}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowRight className="w-4 h-4" />
          <span>رجوع للمجتمع</span>
        </button>

        {detailLoading || !detail ? (
          <div className="space-y-4">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : (
          <>
            <article className={cn(
              'rounded-2xl border bg-card p-5 space-y-4',
              detail.status === 'hidden' && 'border-amber-300/60 bg-amber-50/50 dark:bg-amber-950/20',
            )}>
              {detail.status === 'hidden' && (
                <div className="rounded-lg bg-amber-100/70 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 text-xs px-3 py-2 font-medium">
                  هذا المنشور مخفي عن بقية الأعضاء بواسطة المشرفين — يظهر لك فقط لأنك صاحبه.
                </div>
              )}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar name={detail.author?.name ?? '؟'} src={detail.author?.avatar} size={42} />
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate">{detail.author?.name ?? 'عضو'}</p>
                    <p className="text-xs text-muted-foreground truncate">@{detail.author?.handle} · {timeAgo(detail.createdAt)}{detail.editedAt ? ' · عدّل' : ''}</p>
                  </div>
                </div>
                {detail.userId === userId && (
                  <div className="flex items-center gap-1 shrink-0">
                    {!editing && (
                      <Button variant="ghost" size="icon" onClick={startEdit} title="تعديل">
                        <Pencil className="w-4 h-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={removePost} title="حذف" className="text-destructive hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>

              {editing ? (
                <div className="space-y-3">
                  <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} maxLength={200} />
                  <Textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={6} maxLength={10000} />
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={submitting}>إلغاء</Button>
                    <Button size="sm" onClick={saveEdit} disabled={submitting}>
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      حفظ التعديلات
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="text-lg font-bold leading-8">{detail.title}</h2>
                  <RichText text={detail.body} />
                  {detail.media && detail.media.length > 0 && (
                    <div
                      className="grid gap-2 mt-2"
                      style={{ gridTemplateColumns: detail.media.length === 1 ? '1fr' : 'repeat(2, minmax(0, 1fr))' }}
                    >
                      {detail.media.map((m, i) => (
                        <div key={m.key || i} className="rounded-xl overflow-hidden border bg-muted">
                          {m.url ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={m.url} alt={`صورة ${i + 1}`} className="w-full max-h-96 object-cover" loading="lazy" />
                          ) : (
                            <div className="h-24 grid place-items-center text-muted-foreground/50 gap-1">
                              <ImageIcon className="w-5 h-5" />
                              <span className="text-[10px]">الصورة غير متاحة — التخزين غير مفعّل</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-4 pt-2 border-t">
                    <button
                      onClick={() => void like('post', detail.id)}
                      className={cn(
                        'flex items-center gap-1.5 text-sm transition-colors',
                        detail.likedByMe ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground hover:text-rose-600',
                      )}
                    >
                      <Heart className={cn('w-4.5 h-4.5 w-[18px] h-[18px]', detail.likedByMe && 'fill-current')} />
                      <span>{AR(detail.likeCount)}</span>
                    </button>
                    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <MessageCircle className="w-[18px] h-[18px]" />
                      <span>{AR(detail.replyCount)}</span>
                    </span>
                    {detail.userId !== userId && (
                      <button
                        onClick={() => setReportTarget({ type: 'post', id: detail.id, label: detail.title })}
                        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-amber-600 transition-colors mr-auto"
                      >
                        <Flag className="w-4 h-4" />
                        <span>إبلاغ</span>
                      </button>
                    )}
                  </div>
                </>
              )}
            </article>

            {/* صندوق التعليق */}
            <div className="rounded-2xl border bg-card p-4 space-y-3">
              {replyTo && (
                <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-xs">
                  <span className="truncate">ردًا على @{replyTo.author_handle}</span>
                  <button onClick={() => setReplyTo(null)} className="text-muted-foreground hover:text-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <Textarea
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                rows={2}
                maxLength={5000}
                placeholder={replyTo ? `ردك على @${replyTo.author_handle}…` : 'شارك رأيك… اكتب @ لذِكر عضو'}
              />
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">{AR(commentDraft.length)} / ٥٬٠٠٠</span>
                <Button size="sm" onClick={submitComment} disabled={commentSubmitting || !commentDraft.trim()}>
                  {commentSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {replyTo ? 'رد' : 'تعليق'}
                </Button>
              </div>
            </div>

            {/* التعليقات */}
            {comments.length === 0 && !commentsLoading ? (
              <p className="text-center text-sm text-muted-foreground py-6">لا تعليقات بعد — كن أول من يشارك رأيه</p>
            ) : (
              <div className="space-y-3">
                {comments.map((c) => (
                  <div key={c.id} className={cn('rounded-2xl border bg-card p-4', c.status === 'hidden' && 'border-amber-300/60 opacity-75')}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar name={c.author_name} src={c.author_avatar} size={32} />
                        <div className="min-w-0">
                          <p className="text-sm font-bold truncate">
                            {c.author_name}
                            {c.user_id === userId && <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium"> (أنت)</span>}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {c.parent_author_handle ? `ردًا على @${c.parent_author_handle} · ` : ''}{timeAgo(c.created_at)}{c.edited_at ? ' · عدّل' : ''}
                          </p>
                        </div>
                      </div>
                      {c.user_id === userId && (
                        <Button variant="ghost" size="icon" onClick={() => void removeComment(c.id)} title="حذف تعليقي" className="text-destructive hover:text-destructive shrink-0 h-7 w-7">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                    <RichText text={c.body} />
                    <div className="flex items-center gap-4 pt-1.5">
                      <button
                        onClick={() => void like('comment', c.id)}
                        className={cn(
                          'flex items-center gap-1 text-xs transition-colors',
                          c.liked_by_me ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground hover:text-rose-600',
                        )}
                      >
                        <Heart className={cn('w-3.5 h-3.5', c.liked_by_me && 'fill-current')} />
                        <span>{AR(c.like_count)}</span>
                      </button>
                      <button
                        onClick={() => { setReplyTo(c); setCommentDraft((b) => (b.startsWith('@') ? b : `@${c.author_handle} ${b}`)) }}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <CornerUpLeft className="w-3.5 h-3.5" />
                        <span>رد</span>
                      </button>
                      {c.user_id !== userId && (
                        <button
                          onClick={() => setReportTarget({ type: 'comment', id: c.id, label: c.body.slice(0, 40) })}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-amber-600 transition-colors mr-auto"
                        >
                          <Flag className="w-3.5 h-3.5" />
                          <span>إبلاغ</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {commentsHasMore && (
                  <div className="text-center pt-1">
                    <Button variant="outline" size="sm" onClick={loadMoreComments} disabled={commentsLoading}>
                      {commentsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      تحميل تعليقات أقدم
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  // (2) الخلاصة
  return (
    <div className="space-y-4 max-w-3xl mx-auto pb-8">
      {/* رأس الوحدة */}
      <div className="rounded-2xl border bg-gradient-to-l from-emerald-50/80 to-transparent dark:from-emerald-950/20 p-5">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-emerald-100 dark:bg-emerald-900/40 p-2.5">
            <Users className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-base">مجتمع أوج</h1>
            <p className="text-xs text-muted-foreground">
              شارك خبراتك، اسأل، ورد على الأعضاء — {AR(total)} منشورًا حتى الآن
            </p>
          </div>
          <Button onClick={() => setComposerOpen(!composerOpen)} size="sm">
            {composerOpen ? 'إغلاق' : 'منشور جديد'}
          </Button>
        </div>

        {/* فلاتر */}
        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={() => switchFilter('latest')}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors',
              filter === 'latest' ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:bg-muted/70',
            )}
          >
            الأحدث نشاطًا
          </button>
          <button
            onClick={() => switchFilter('top')}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors',
              filter === 'top' ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:bg-muted/70',
            )}
          >
            الأكثر تفاعلًا
          </button>
        </div>
      </div>

      {/* الكومبوزر */}
      {composerOpen && (
        <div className="rounded-2xl border bg-card p-4 space-y-3">
          <Input
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            placeholder="عنوان المنشور أو سؤالك باختصار…"
            maxLength={200}
          />
          <div className="relative">
            <Textarea
              value={draftBody}
              onChange={(e) => onDraftBodyChange(e.target.value)}
              rows={4}
              maxLength={10000}
              placeholder="اكتب المحتوى… اكتب @ لذِكر عضو بالاسم"
            />
            {mentionSuggests.length > 0 && (
              <div className="absolute z-10 bottom-full mb-1 left-0 right-0 rounded-lg border bg-popover shadow-lg max-h-44 overflow-y-auto">
                {mentionSuggests.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => pickMention(m.handle)}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent text-right"
                  >
                    <Avatar name={m.name} size={22} />
                    <span className="font-medium truncate">{m.name}</span>
                    <span className="text-muted-foreground text-xs">@{m.handle}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* إرفاق صور — Cloudinary presign (يظهر رسالة واضحة إذا لم تُضبط المفاتيح) */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                hidden
                onChange={(e) => {
                  void onPickImages(e.target.files)
                  e.target.value = ''
                }}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={attachments.length >= MAX_MEDIA_PER_POST}
                title="إرفاق صور (حتى ٤)"
              >
                <ImagePlus className="w-4 h-4" />
                <span className="text-[11px]">{attachments.length}/{MAX_MEDIA_PER_POST}</span>
              </Button>
              <span className="text-[11px] text-muted-foreground">{AR(draftBody.length)} / ١٠٬٠٠٠</span>
            </div>
            <Button size="sm" onClick={submitPost} disabled={submitting || !draftTitle.trim() || !draftBody.trim()}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              نشر
            </Button>
          </div>

          {/* معاينات المرفقات (قبل النشر — إزالة محلية فقط) */}
          {attachments.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {attachments.map((a) => (
                <div key={a.localUrl} className="relative w-20 h-20 rounded-xl overflow-hidden border bg-muted shrink-0 group/att">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.localUrl} alt="مرفق" className="w-full h-full object-cover" />
                  {a.uploading && (
                    <div className="absolute inset-0 grid place-items-center bg-background/60">
                      <Loader2 className="w-5 h-5 animate-spin" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeAttachment(a.localUrl)}
                    className="absolute top-1 left-1 w-5 h-5 rounded-full bg-black/60 text-white grid place-items-center hover:bg-destructive"
                    aria-label="إزالة المرفق"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* الخلاصة */}
      {loadingFeed ? (
        <div className="space-y-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : posts.length === 0 ? (
        <div className="rounded-2xl border bg-card p-10 text-center space-y-2">
          <Users className="w-10 h-10 mx-auto text-muted-foreground/40" />
          <p className="font-medium">المجتمع لسه في بدايته</p>
          <p className="text-sm text-muted-foreground">كن أول من ينشر — سؤال، خبرة، أو نصيحة تفيد الأعضاء.</p>
          <Button size="sm" variant="outline" onClick={() => setComposerOpen(true)}>ابدأ أول منشور</Button>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {posts.map((p) => (
              <button
                key={p.id}
                onClick={() => setOpenPostId(p.id)}
                className="w-full text-right rounded-2xl border bg-card p-4 hover:border-emerald-300/60 hover:shadow-sm transition-all group"
              >
                <div className="flex items-center gap-3">
                  <Avatar name={p.author_name} src={p.author_avatar} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold truncate">
                      {p.author_name}
                      {p.user_id === userId && <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium"> (أنت)</span>}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">@{p.author_handle} · {timeAgo(p.last_activity_at)}</p>
                  </div>
                  {new Date(p.last_activity_at).getTime() - new Date(p.created_at).getTime() > 60_000 && (
                    <span className="text-[10px] rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 font-medium shrink-0">
                      نشِط
                    </span>
                  )}
                </div>
                <h3 className="font-bold mt-3 leading-7 group-hover:text-emerald-700 dark:group-hover:text-emerald-300 transition-colors">{p.title}</h3>
                <p className="text-sm text-muted-foreground leading-7 line-clamp-2 mt-1">{p.body_snippet}</p>
                {p.media && p.media.length > 0 && (
                  <div className="flex items-center gap-2 mt-2">
                    <div className="w-24 h-16 rounded-lg overflow-hidden border bg-muted shrink-0">
                      {p.media[0]?.url ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={p.media[0].url} alt="صورة المنشور" className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full h-full grid place-items-center text-muted-foreground/50">
                          <ImageIcon className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                    {p.media.length > 1 && (
                      <span className="text-[10px] rounded-full bg-muted px-2 py-0.5 text-muted-foreground">+{AR(p.media.length - 1)} صور</span>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-4 mt-3 pt-2.5 border-t text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <MessageCircle className="w-3.5 h-3.5" />
                    {AR(p.reply_count)}
                  </span>
                  <span className={cn('flex items-center gap-1', p.liked_by_me && 'text-rose-600 dark:text-rose-400')}>
                    <Heart className={cn('w-3.5 h-3.5', p.liked_by_me && 'fill-current')} />
                    {AR(p.like_count)}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* infinite scroll sentinel + زر احتياطي */}
          <div ref={sentinelRef} className="h-1" />
          {hasMore && (
            <div className="text-center pb-4">
              <Button variant="outline" size="sm" onClick={() => void loadFeed(filter, page + 1, false)} disabled={loadingMore}>
                {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                تحميل المزيد
              </Button>
            </div>
          )}
          {!hasMore && posts.length > 0 && (
            <p className="text-center text-xs text-muted-foreground py-2">وصلت لنهاية الخلاصة</p>
          )}
        </>
      )}

      {/* صندوق البلاغ */}
      <Dialog open={!!reportTarget} onOpenChange={(o) => !o && setReportTarget(null)}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-right">الإبلاغ عن محتوى</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {reportTarget && (
              <p className="text-xs text-muted-foreground truncate bg-muted rounded-lg px-3 py-2">
                «{reportTarget.label}»
              </p>
            )}
            <Select value={reportReason} onValueChange={setReportReason}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="سبب البلاغ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="spam">رسائل مزعجة/إعلانية</SelectItem>
                <SelectItem value="abuse">إساءة أو تنمّر</SelectItem>
                <SelectItem value="offensive">محتوى مسيء</SelectItem>
                <SelectItem value="off_topic">خارج الموضوع</SelectItem>
                <SelectItem value="other">أخرى</SelectItem>
              </SelectContent>
            </Select>
            <Textarea
              value={reportDetails}
              onChange={(e) => setReportDetails(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="تفاصيل إضافية (اختياري) — تساعد المشرفين على القرار"
            />
            <p className="text-[11px] text-muted-foreground">
              البلاغ سرّي — صاحب المحتوى لن يعرف من أبلغ عنه. سيصل للمشرفين فورًا.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReportTarget(null)} disabled={reportSubmitting}>إلغاء</Button>
            <Button onClick={submitReport} disabled={reportSubmitting || !reportReason}>
              {reportSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              إرسال البلاغ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
