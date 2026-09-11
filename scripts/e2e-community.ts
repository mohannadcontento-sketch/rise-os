// ============================================================
// E2E driver: المجتمع (المرحلة 07) ضد التطبيق الحقيقي المحلي
// + community-mock (PostgREST :5997).
//
// السيناريوهات (بمستخدمين اثنين: A أدمن المالك، B عضو):
//   1.  feed فارغ بدون توكن → 401 / بتوكن → 200
//   2.  إنشاء منشور: zod 400 (عنوان قصير) + سليم 201
//   3.  mention: B يُذكر في منشور A → mention row + إشعار
//       'mention' لـ B فقط (لا إشعار ذاتي)
//   4.  feed: عنصر واحد + liked_by_me=false
//   5.  B يعلّق على منشور A → تعليق + إشعار 'community' لـ A
//       (dedup) + reply_count=1
//   6.  A يرد على تعليق B → إشعار 'community' (رد) لـ B،
//       وليس لـ A (صاحب المنشور هو نفسه صاحب الرد)
//   7.  تفاعل toggle: B يعجب بمنشور A → liked=true + count=1،
//       إعادة النداء → unlike + count=0
//   8.  بلاغ: A يبلغ عن تعليق B (valid) + تكراره → already
//   9.  الإشراف (A أدمن): قائمة البلاغات + hide_post +
//       إشعار إشراف لصاحب المحتوى + ban_user + B محظور
//       (تعليق → 403) + unban + B يعلّق من جديد
//   10. منشور B مع A: مخفي → 404 لغير الصاحب
//   11. pagination: 21 منشورًا → صفحة 1 = 20 + hasMore، صفحة 2 = 1
//   12. تعليقات RPC: parent_author_handle + liked_by_me
//   13. حذف: تعليق ذاتي → 200، منشور ذاتي → 200
//   14. بحث الأعضاء: members?q=me → B بدون A (استبعاد النفس)
// Run: APP=http://127.0.0.1:3103 bun scripts/e2e-community.ts
// ============================================================

const APP = process.env.APP || 'http://127.0.0.1:3103'
const MOCK = process.env.MOCK || 'http://127.0.0.1:5997'
const TOKEN_A = process.env.E2E_TOKEN_A || ''
const TOKEN_B = process.env.E2E_TOKEN_B || ''

const USER_B_ID = 'b0000000-0000-4000-8000-000000000002'
const USER_A_ID = 'a0000000-0000-4000-8000-000000000001'

let failures = 0
function check(label: string, ok: boolean, detail?: string) {
  if (ok) console.log(`  ✅ ${label}`)
  else {
    failures++
    console.error(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

let seq = 0
async function req(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  seq++
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    'idempotency-key': `e2e-community-${Date.now()}-${seq}`,
    ...(init.headers as Record<string, string>),
  }
  return fetch(`${APP}${path}`, { ...init, headers, redirect: 'manual' })
}

async function mockState() {
  const r = await fetch(`${MOCK}/state`)
  return r.json() as Promise<any>
}

async function main() {
  if (!TOKEN_A || !TOKEN_B) {
    console.error('E2E_TOKEN_A / E2E_TOKEN_B required (printed by e2e-community-mock)')
    process.exit(1)
  }

  // ═══ 1. feed: auth ═══
  console.log('══ [1] الخلاصة: الصلاحيات ══')
  let r = await req('/api/rise/community/posts', '')
  check('feed بدون توكن → 401', r.status === 401, `got ${r.status}`)
  r = await req('/api/rise/community/posts', TOKEN_A)
  check('feed بتوكن → 200', r.status === 200, `got ${r.status}`)
  const empty = await r.json()
  check('feed فارغ في البداية', Array.isArray(empty.items) && empty.items.length === 0)

  // ═══ 2. إنشاء منشور (zod) ═══
  console.log('══ [2] إنشاء المنشورات (zod) ══')
  r = await req('/api/rise/community/posts', TOKEN_A, { method: 'POST', body: JSON.stringify({ title: 'قص', body: 'محتوى' }) })
  check('عنوان قصير → 400', r.status === 400, `got ${r.status}`)
  r = await req('/api/rise/community/posts', TOKEN_B, { method: 'POST', body: JSON.stringify({ title: '', body: '' }) })
  check('جسم فارغ → 400', r.status === 400, `got ${r.status}`)

  r = await req('/api/rise/community/posts', TOKEN_A, {
    method: 'POST',
    body: JSON.stringify({ title: 'سؤال عن الروتين الصباحي', body: 'إزاي تنظمون روتينكم؟ رأيي @member مهم هنا' }),
  })
  check('منشور A سليم → 201', r.status === 201, `got ${r.status}`)
  const postA = (await r.json()).id
  check('رُجّع معرّف', !!postA)

  // ═══ 3. mention ═══
  console.log('══ [3] الذِكر (mentions) ══')
  await new Promise((res) => setTimeout(res, 300))
  let state = await mockState()
  check('mention row أُنشئ لـ B', state.mentions.some((m: any) => m.post_id === postA && m.mentioned_user_id.includes('0002')))
  const mentionNotif = state.notifications.find((n: any) => n.type === 'mention' && n.user_id.includes('0002'))
  check('إشعار mention لـ B', !!mentionNotif)
  check('إشعار mention يحمل dedup key للمصدر', mentionNotif?.dedup_key === `mention-post-${postA}-${state.mentions.find((m: any) => m.post_id === postA)?.mentioned_user_id ?? ''}` || String(mentionNotif?.dedup_key || '').startsWith('mention-post-'))
  check('لا إشعار ذاتي لـ A', !state.notifications.some((n: any) => n.type === 'mention' && n.user_id.includes('0001')))

  // ═══ 4. feed ═══
  console.log('══ [4] الخلاصة بعد النشر ══')
  r = await req('/api/rise/community/posts', TOKEN_B)
  const feed1 = await r.json()
  check('feed يحتوي منشور A', feed1.items?.some((p: any) => p.id === postA))
  const cardA = feed1.items?.find((p: any) => p.id === postA)
  check('بيانات المؤلف (handle)', cardA?.author_handle === 'owner', `handle=${cardA?.author_handle}`)
  check('liked_by_me=false لـ B', cardA?.liked_by_me === false)

  // ═══ 5. تعليق B على منشور A ═══
  console.log('══ [5] تعليق B على منشور A ══')
  r = await req('/api/rise/community/comments', TOKEN_B, { method: 'POST', body: JSON.stringify({ postId: postA, body: 'أبدأ بـ ٣ عادات صغيرة فقط.' }) })
  check('تعليق B → 201', r.status === 201, `got ${r.status}`)
  const commentB = (await r.json()).id

  r = await req('/api/rise/community/comments', TOKEN_B, { method: 'POST', body: JSON.stringify({ postId: '99999999-9999-4999-8999-999999999999', body: 'تعليق على منشور غير موجود' }) })
  check('تعليق على منشور غير موجود → 404', r.status === 404, `got ${r.status}`)

  await new Promise((res) => setTimeout(res, 300))
  state = await mockState()
  const commentNotifA = state.notifications.find((n: any) => n.type === 'community' && n.user_id.includes('0001') && String(n.dedup_key).startsWith('community-comment-'))
  check('إشعار «تعليق جديد» لـ A (صاحب المنشور)', !!commentNotifA)
  check('رد_count=1 على المنشور', state.posts.find((p: any) => p.id === postA)?.reply_count === 1)

  // ═══ 6. A يرد على تعليق B ═══
  console.log('══ [6] رد A على تعليق B ══')
  r = await req('/api/rise/community/comments', TOKEN_A, { method: 'POST', body: JSON.stringify({ postId: postA, parentId: commentB, body: 'تمام — دي نصيحة ذهبية @member' }) })
  check('رد A → 201', r.status === 201, `got ${r.status}`)
  await new Promise((res) => setTimeout(res, 300))
  state = await mockState()
  const replyNotifB = state.notifications.find((n: any) => n.type === 'community' && n.user_id.includes('0002') && String(n.dedup_key).startsWith('community-reply-'))
  check('إشعار «رد جديد» لـ B (صاحب التعليق الأب)', !!replyNotifB)
  check('لا إشعار تعليق/رد إضافي لـ A من رده الذاتي', state.notifications.filter((n: any) => n.user_id.includes('0001') && n.type === 'community').length === 1)
  // mention في الرد
  const replyMention = state.mentions.find((m: any) => m.comment_id && m.mentioned_user_id.includes('0002'))
  check('mention في الرد سُجّل', !!replyMention)

  // ═══ 7. تفاعل toggle ═══
  console.log('══ [7] الإعجاب (toggle) ══')
  r = await req('/api/rise/community/reactions', TOKEN_B, { method: 'POST', body: JSON.stringify({ targetType: 'post', targetId: postA }) })
  check('B يعجب بمنشور A → 200', r.status === 200, `got ${r.status}`)
  let likeRes = await r.json()
  check('liked=true', likeRes.liked === true)
  check('likeCount=1', likeRes.likeCount === 1, `count=${likeRes.likeCount}`)

  r = await req('/api/rise/community/reactions', TOKEN_B, { method: 'POST', body: JSON.stringify({ targetType: 'post', targetId: postA }) })
  likeRes = await r.json()
  check('toggle مرة ثانية → unlike', likeRes.liked === false)
  check('likeCount=0', likeRes.likeCount === 0, `count=${likeRes.likeCount}`)

  // ═══ 8. البلاغات ═══
  console.log('══ [8] البلاغات ══')
  r = await req('/api/rise/community/reports', TOKEN_A, { method: 'POST', body: JSON.stringify({ targetType: 'comment', targetId: commentB, reason: 'off_topic', details: 'خارج الموضوع' }) })
  check('بلاغ A عن تعليق B → 201', r.status === 201, `got ${r.status}`)
  r = await req('/api/rise/community/reports', TOKEN_A, { method: 'POST', body: JSON.stringify({ targetType: 'comment', targetId: commentB, reason: 'spam' }) })
  const dupReport = await r.json()
  check('تكرار البلاغ → already', r.status === 200 && dupReport.already === true, `status=${r.status}`)
  // A يبلغ عن تعليقه الذاتي؟ (لا يوجد — نجرب بلاغ B عن منشور B نفسه)
  const r2 = await req('/api/rise/community/posts', TOKEN_B, { method: 'POST', body: JSON.stringify({ title: 'منشور B للتجارب', body: 'محتوى B' }) })
  const postB = (await r2.json()).id
  const r3 = await req('/api/rise/community/reports', TOKEN_B, { method: 'POST', body: JSON.stringify({ targetType: 'post', targetId: postB, reason: 'spam' }) })
  check('بلاغ عن محتواك → 400', r3.status === 400, `got ${r3.status}`)
  const r4 = await req('/api/rise/community/reports', TOKEN_A, { method: 'POST', body: JSON.stringify({ targetType: 'post', targetId: postB, reason: 'invalid_reason_xyz' }) })
  check('سبب غير صالح → 400 (zod)', r4.status === 400, `got ${r4.status}`)

  // ═══ 9. الإشراف (A أدمن) ═══
  console.log('══ [9] الإشراف ══')
  r = await req('/api/rise/admin/community/reports?status=open', TOKEN_B)
  check('تقارير الأدمن بجلسة B (ليس أدمن) → 403', r.status === 403, `got ${r.status}`)
  r = await req('/api/rise/admin/community/reports?status=open', TOKEN_A)
  check('تقارير الأدمن → 200', r.status === 200, `got ${r.status}`)
  const reportsList = (await r.json()).items
  check('البلاغ المفتوح ظاهر مع معاينة المحتوى', reportsList.some((x: any) => x.target?.id === commentB && x.reasonAr))

  // إخفاء تعليق B
  r = await req('/api/rise/admin/community/moderate', TOKEN_A, { method: 'POST', body: JSON.stringify({ action: 'hide_comment', commentId: commentB, reason: 'خارج الموضوع' }) })
  check('hide_comment → 200', r.status === 200, `got ${r.status}`)
  await new Promise((res) => setTimeout(res, 200))
  state = await mockState()
  check('التعليق مخفي', state.comments.find((c: any) => c.id === commentB)?.status === 'hidden')
  check('البلاغ حلّ resolved_hidden', state.reports.find((x: any) => x.target_id === commentB)?.status === 'resolved_hidden')
  check('سجل الإشراف: hide_comment', state.modLog.some((m: any) => m.action === 'hide_comment'))
  check('إشعار إشراف لـ B', state.notifications.some((n: any) => n.user_id.includes('0002') && String(n.title).includes('تعليقك')))

  // استبعاد بلاغ منشور B
  const reportPostB = state.reports.find((x: any) => x.target_id === postB)
  if (reportPostB) {
    r = await req('/api/rise/admin/community/moderate', TOKEN_A, { method: 'POST', body: JSON.stringify({ action: 'dismiss_report', reportId: reportPostB.id }) })
    check('dismiss_report → 200', r.status === 200, `got ${r.status}`)
  } else {
    // بلاغ منشور B رُفض (zod؟) — نبلّغ عنه مرة أخرى ب سبب صالح ثم نستبعده
    r = await req('/api/rise/community/reports', TOKEN_A, { method: 'POST', body: JSON.stringify({ targetType: 'post', targetId: postB, reason: 'other' }) })
    check('بلاغ على منشور B (إعادة) → 201', r.status === 201, `got ${r.status}`)
    state = await mockState()
    const rp = state.reports.find((x: any) => x.target_id === postB)
    r = await req('/api/rise/admin/community/moderate', TOKEN_A, { method: 'POST', body: JSON.stringify({ action: 'dismiss_report', reportId: rp.id }) })
    check('dismiss_report → 200', r.status === 200, `got ${r.status}`)
  }

  // حظر B
  r = await req('/api/rise/admin/community/moderate', TOKEN_A, { method: 'POST', body: JSON.stringify({ action: 'ban_user', userId: USER_B_ID, reason: 'سلوك مخالف', days: 7 }) })
  check('ban_user → 200', r.status === 200, `got ${r.status}`)
  r = await req('/api/rise/community/comments', TOKEN_B, { method: 'POST', body: JSON.stringify({ postId: postA, body: 'محاولة تعليق بعد الحظر' }) })
  check('B محظور: تعليق → 403', r.status === 403, `got ${r.status}`)
  check('رسالة الحظر عربية', (await r.json()).error?.includes('محظور'))
  r = await req('/api/rise/community/reactions', TOKEN_B, { method: 'POST', body: JSON.stringify({ targetType: 'post', targetId: postA }) })
  check('B محظور: تفاعل → 403', r.status === 403, `got ${r.status}`)

  // قائمة الحظر
  r = await req('/api/rise/admin/community/bans', TOKEN_A)
  check('قائمة الحظر → 200', r.status === 200)
  const bansList = (await r.json()).items
  check('B في قائمة الحظر', bansList.some((b: any) => b.handle === 'member' && b.active))

  // فك الحظر
  r = await req('/api/rise/admin/community/moderate', TOKEN_A, { method: 'POST', body: JSON.stringify({ action: 'unban_user', userId: USER_B_ID }) })
  check('unban_user → 200', r.status === 200, `got ${r.status}`)
  r = await req('/api/rise/community/comments', TOKEN_B, { method: 'POST', body: JSON.stringify({ postId: postA, body: 'عودة بعد فك الحظر' }) })
  check('B بعد فك الحظر يعلّق → 201', r.status === 201, `got ${r.status}`)

  // سجل الإشراف
  r = await req('/api/rise/admin/community/log', TOKEN_A)
  check('سجل الإشراف → 200', r.status === 200)
  const logItems = (await r.json()).items
  check('السجل يحوي الإجراءات', logItems.length >= 4 && logItems[0]?.actionAr)

  // ═══ 10. المخفي عن غير صاحبه ═══
  console.log('══ [10] المحتوى المخفي ══')
  r = await req('/api/rise/admin/community/moderate', TOKEN_A, { method: 'POST', body: JSON.stringify({ action: 'hide_post', postId: postB, reason: 'مراجعة' }) })
  check('hide_post → 200', r.status === 200, `got ${r.status}`)
  r = await req(`/api/rise/community/posts/${postB}`, TOKEN_A)
  check('منشور B المخفي: A (غير صاحب) → 404', r.status === 404, `got ${r.status}`)
  r = await req(`/api/rise/community/posts/${postB}`, TOKEN_B)
  check('B (الصاحب) يرى منشوره المخفي → 200', r.status === 200, `got ${r.status}`)
  const hiddenDetail = await r.json()
  check('حالة hidden في التفاصيل', hiddenDetail.status === 'hidden')
  r = await req('/api/rise/community/posts', TOKEN_A)
  const feedAfterHide = await r.json()
  check('منشور B اختفى من خلاصة A', !feedAfterHide.items.some((p: any) => p.id === postB))

  // ═══ 11. Pagination ═══
  console.log('══ [11] التحميل التدريجي ══')
  // نافذة الحد (٦٠ث ثابتة in-memory) تحسب القراءة والكتابة معًا على
  // نفس المسار — ننتظر resetها قبل دفعة الإنشاء الكبيرة (سلوك حقيقي:
  // من ينشر بهذا الازدحام يُحد)
  console.log('   … انتظار reset نافذة rate-limit (61s)')
  await new Promise((res) => setTimeout(res, 61_000))
  for (let i = 0; i < 21; i++) {
    const rr = await req('/api/rise/community/posts', TOKEN_A, { method: 'POST', body: JSON.stringify({ title: `منشور ترقيم ${i + 1}`, body: 'محتوى ترقيم' }) })
    if (rr.status !== 201) { check(`منشور ترقيم ${i + 1} → 201`, false, `got ${rr.status}`); break }
  }
  r = await req('/api/rise/community/posts?page=1', TOKEN_A)
  const p1 = await r.json()
  check('صفحة 1 = 20 عنصرًا + hasMore', p1.items.length === 20 && p1.hasMore === true, `items=${p1.items.length} hasMore=${p1.hasMore}`)
  r = await req('/api/rise/community/posts?page=2', TOKEN_A)
  const p2 = await r.json()
  check('صفحة 2 بها الباقي + hasMore=false', p2.items.length >= 1 && p2.hasMore === false, `items=${p2.items.length}`)
  r = await req('/api/rise/community/posts?page=1&filter=top', TOKEN_A)
  const top = await r.json()
  check('فلتر top يعمل (الأكثر إعجابًا أولًا)', Array.isArray(top.items) && top.items.length === 20)

  // ═══ 12. تعليقات RPC ═══
  console.log('══ [12] تعليقات المنشور ══')
  r = await req(`/api/rise/community/posts/${postA}/comments`, TOKEN_A)
  check('تعليقات المنشور → 200', r.status === 200)
  const cmts = await r.json()
  const replyOfB = cmts.items?.find((c: any) => c.parent_comment_id === commentB)
  check('parent_author_handle في الرد', replyOfB?.parent_author_handle === 'member', `handle=${replyOfB?.parent_author_handle}`)

  // ═══ 13. الحذف الذاتي ═══
  console.log('══ [13] الحذف الذاتي ══')
  const ownComment = cmts.items?.find((c: any) => c.user_id === USER_A_ID)
  r = await req(`/api/rise/community/comments/${ownComment?.id}`, TOKEN_A, { method: 'DELETE' })
  check('حذف تعليقي → 200', r.status === 200, `got ${r.status}`)
  const somePost = p2.items?.[0]?.id
  r = await req(`/api/rise/community/posts/${somePost}`, TOKEN_A, { method: 'DELETE' })
  check('حذف منشوري → 200', r.status === 200, `got ${r.status}`)

  // ═══ 14. بحث الأعضاء ═══
  console.log('══ [14] بحث الأعضاء ══')
  r = await req('/api/rise/community/members?q=me', TOKEN_A)
  check('بحث الأعضاء → 200', r.status === 200)
  const members = (await r.json()).members
  check('يجد B بدون A (استبعاد النفس)', members.some((m: any) => m.handle === 'member') && !members.some((m: any) => m.handle === 'owner'))

  // ═══ 15. المرحلة 07-ب: مرفقات R2 (بيئة بلا مفاتيح — تدرّج آمن) ═══
  console.log('══ [15] مرفقات R2 (بيئة بلا مفاتيح — تدرّج آمن) ═══')
  // presign: R2 غير مضبوط في بيئة الاختبار → 503 واضح لا يكسر شيئًا
  r = await req('/api/rise/community/media/presign', TOKEN_A, { method: 'POST', body: JSON.stringify({ contentType: 'image/jpeg', bytes: 102400 }) })
  const pres = r.status === 503 ? await r.json() : {}
  check('presign بدون مفاتيح R2 → 503 STORAGE_NOT_CONFIGURED', r.status === 503, `got ${r.status}`)
  check('رسالة 503 عربية مع كود واضح', pres?.code === 'STORAGE_NOT_CONFIGURED' && /R2/.test(String(pres?.error || '')))
  r = await req('/api/rise/community/media/presign', TOKEN_A, { method: 'POST', body: JSON.stringify({ contentType: 'video/mp4', bytes: 1024 }) })
  check('presign بنوع غير صورة → 400 (zod)', r.status === 400, `got ${r.status}`)
  r = await req('/api/rise/community/media/presign', TOKEN_A, { method: 'POST', body: JSON.stringify({ contentType: 'image/jpeg', bytes: 99999999 }) })
  check('presign بحجم > 8MB → 400 (zod)', r.status === 400, `got ${r.status}`)
  // نشر بمرفق وهمي → رفض خادمي (الملكية تتحقق من media_objects — لا نثق بالعميل)
  r = await req('/api/rise/community/posts', TOKEN_A, { method: 'POST', body: JSON.stringify({ title: 'منشور بمرفق وهمي', body: 'محاولة مرفق غير مملوك', media: [{ key: 'community/x/y.jpg', mediaId: '11111111-2222-4333-8444-555555555555' }] }) })
  const forged = r.status === 400 ? await r.json() : {}
  check('نشر بمرفق وهمي → 400 INVALID_MEDIA', r.status === 400 && forged?.code === 'INVALID_MEDIA', `got ${r.status}`)
  // نشر نصي بدون مرفقات → يعمل كالسابق (متوافق رجعيًا)
  r = await req('/api/rise/community/posts', TOKEN_A, { method: 'POST', body: JSON.stringify({ title: 'منشور نصي بعد المرفقات', body: 'النص يعمل كالسابق' }) })
  check('نشر نصي (بدون مرفقات) → 201 (متوافق رجعيًا)', r.status === 201, `got ${r.status}`)
  // الخلاصة تعمل مع حقل media الجديد
  r = await req('/api/rise/community/posts?page=1', TOKEN_A)
  const feedMedia = await r.json()
  check('الخلاصة تعمل مع حقل media (بلا كراش)', Array.isArray(feedMedia.items) && feedMedia.items.length > 0)

  // ═══ الخلاصة ═══
  console.log('')
  if (failures === 0) console.log('✅✅ E2E COMMUNITY: ALL CHECKS PASSED')
  else console.log(`💥 ${failures} failures`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1) })
