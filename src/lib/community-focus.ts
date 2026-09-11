// ============================================================
// community-focus.ts — ربط إشعار «ذِكر/تعليق» بالمنشور
//
// إشعارات المجتمع تحمل actionUrl بصيغة community?post=<id>.
// معالج التنقل في app/page.tsx يضبط الوحدة ويخزّن معرّف
// المنشور هنا؛ مكون المجتمع يستهلكه عند التركيب (mount) —
// حل مشكلة التوقيت (الحدث يُطلق قبل تركيب المكون).
// ============================================================

let pendingPostId: string | null = null

export function setPendingCommunityPost(postId: string): void {
  pendingPostId = postId
}

export function getPendingCommunityPost(): string | null {
  return pendingPostId
}

export function consumePendingCommunityPost(): string | null {
  const id = pendingPostId
  pendingPostId = null
  return id
}
