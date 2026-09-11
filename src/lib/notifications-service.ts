// ============================================================
// notifications-service.ts — خدمة الإشعارات الموحدة (المرحلة 05)
//
// «بناء مركز إشعارات موحد داخل أوج يكون مصدرًا لكل القنوات
//  الأخرى» — هذه هي النقطة الوحيدة التي تنشئ إشعارات من جهة
// الخادم. كل مصدر حدث (موافقة اشتراك، إيقاف حساب، تصدير،
// حدود استخدام…) ينادي notifyUser / notifySelf من هنا، فلا
// يتفرق منطق الإنشاء بين المسارات.
//
// المساران:
//   notifyUser  — من مسار أدمن (service_role client) إلى أي
//                 مستخدم. يمر عبر RPC notify_user (SECURITY
//                 DEFINER: بوابة service_role فقط).
//   notifySelf  — من مستخدم لنفسه (جلسة المستخدم نفسها).
//                 يمر عبر RPC notify_user (بوابة auth.uid() =
//                 المستخدم).
//
// منع التكرار: كل نداء يحمل dedupKey اختياريًا — الفهرس الفريد
// (user_id, dedup_key) في الهجرة 026 يضمن نداءً واحدًا فقط
// لكل مفتاح. نداء مكرر يعيد { deduplicated: true } ولا يفشل.
//
// توافق تنازلي: لو الهجرة 026 غير مطبقة بعد (owner action)
// نتراجع لإدراج مباشر بلا dedup (degraded-graceful — نفس
// أسلوب entitlements المرحلة 04) حتى لا يتعطل أي مسار.
// ============================================================

export type NotificationType =
  | 'info' | 'success' | 'warning' | 'error' | 'achievement' | 'reminder' | 'system'
  | 'subscription' | 'usage' | 'community' | 'mention' | 'background'

export type NotificationPriority = 'normal' | 'high'

export interface CreateNotificationInput {
  userId: string
  type: NotificationType
  title: string
  body?: string
  icon?: string
  actionUrl?: string
  metadata?: Record<string, unknown>
  priority?: NotificationPriority
  /** ISO — الإشعار يُحذف تلقائيًا بعد انتهائه (lazy purge) */
  expiresAt?: string
  /** نفس المفتاح لا يُدرج مرتين لنفس المستخدم */
  dedupKey?: string
}

/** أي Supabase client (user أو admin/service_role) — نستدعي RPC عليه */
type AnyClient = { rpc: (fn: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> }

export interface CreateNotificationResult {
  created: boolean
  /** true = منعها الفهرس الفريد (نفس dedupKey) — ليست فشلًا */
  deduplicated: boolean
  id?: string | null
  /** true = الهجرة 026 غير مطبقة؛ تم الإدراج المباشر بلا dedup */
  degraded: boolean
}

/** إدراج عمودي مباشر (fallback ما قبل 026 — client الأدمن فقط) */
async function directInsert(
  client: AnyClient & { from: (t: string) => any },
  input: CreateNotificationInput,
): Promise<CreateNotificationResult> {
  const { error } = await client
    .from('notifications')
    .insert({
      user_id: input.userId,
      type: input.type,
      title: input.title.slice(0, 200),
      body: input.body?.slice(0, 1000) ?? null,
      icon: input.icon?.slice(0, 10) ?? null,
      action_url: input.actionUrl?.slice(0, 500) || null,
      metadata: input.metadata ?? {},
      read: false,
    })
  if (error) throw new Error(error.message)
  return { created: true, deduplicated: false, degraded: true }
}

/** notify_user RPC — dedup + بوابة صلاحيات داخل قاعدة البيانات */
async function viaRpc(client: AnyClient, input: CreateNotificationInput): Promise<CreateNotificationResult> {
  const { data, error } = await client.rpc('notify_user', {
    p_user_id: input.userId,
    p_type: input.type,
    p_title: input.title.slice(0, 200),
    p_body: input.body?.slice(0, 1000) ?? null,
    p_icon: input.icon?.slice(0, 10) ?? null,
    p_action_url: input.actionUrl?.slice(0, 500) ?? null,
    p_metadata: input.metadata ?? {},
    p_priority: input.priority ?? 'normal',
    p_expires_at: input.expiresAt ?? null,
    p_dedup_key: input.dedupKey ?? null,
  })
  if (error) throw new Error(error.message)
  const id = (data as string | null) ?? null
  return { created: !!id, deduplicated: !id, id, degraded: false }
}

/**
 * إشعار من جهة الخادم (admin → أي مستخدم / حدث نظام).
 * client = service-role client (getSupabaseAdmin) أو أي عميل يملك
 * بوابة RPC. لا يرفع استثناء — يرجّع النتيجة ويترك القرار
 * للمسار المتصل (إشعار فاشل لا يجب أن يفشّل موافقة اشتراك).
 */
export async function notifyUser(
  client: AnyClient & { from: (t: string) => any },
  input: CreateNotificationInput,
): Promise<CreateNotificationResult> {
  try {
    return await viaRpc(client, input)
  } catch (err) {
    const msg = String((err as Error)?.message || '')
    // 026 غير مطبقة: الدالة غير موجودة → إدراج مباشر (client أدمن يتجاوز RLS)
    if (msg.includes('notify_user') || msg.includes('function') || msg.includes('404') || msg.includes('PGRST202')) {
      try {
        return await directInsert(client, input)
      } catch (err2) {
        console.warn('[notifications-service] direct insert failed:', (err2 as Error)?.message)
        return { created: false, deduplicated: false, degraded: true }
      }
    }
    console.warn('[notifications-service] notifyUser failed:', msg)
    return { created: false, deduplicated: false, degraded: false }
  }
}

/**
 * إشعار المستخدم لنفسه من مساره هو (مثل: قرب انتهاء اشتراكه).
 * يستدعي notify_user بجلسة المستخدم — البوابة تسمح auth.uid() =
 * المستخدم. لو 026 غير مطبقة يتجاهل بصمت (لا توجد بديل آمن
 * عبر RLS لأن insert policy تشترط user_id = auth.uid()).
 */
export async function notifySelf(
  client: AnyClient,
  input: Omit<CreateNotificationInput, 'userId'>,
  userId: string,
): Promise<CreateNotificationResult> {
  try {
    return await viaRpc(client, { ...input, userId })
  } catch (err) {
    console.warn('[notifications-service] notifySelf skipped (migration 026 not applied?):', (err as Error)?.message)
    return { created: false, deduplicated: false, degraded: true }
  }
}

// ─── نصوص جاهزة لمصادر الأحداث (توحيد الرسائل) ────────────────

export function subscriptionApprovedMessage(plan: string, months: number, expiresAt: string) {
  const planAr = plan === 'max' ? 'ماكس' : plan === 'plus' ? 'بلس' : 'المجانية'
  return {
    type: 'subscription' as NotificationType,
    priority: 'high' as NotificationPriority,
    icon: '🎉',
    actionUrl: 'settings',
    title: `تم تفعيل خطة ${planAr} 🎉`,
    body: `اشتراكك أصبح نشطًا لمدة ${months} ${months === 1 ? 'شهر' : 'أشهر'} — ينتهي في ${new Date(expiresAt).toLocaleDateString('ar-EG')}. شكرًا لدعمك أوج!`,
    metadata: { plan, months, expiresAt },
  }
}

export function subscriptionRejectedMessage(plan: string, reason?: string) {
  const planAr = plan === 'max' ? 'ماكس' : 'بلس'
  return {
    type: 'subscription' as NotificationType,
    priority: 'high' as NotificationPriority,
    icon: '⚠️',
    actionUrl: 'settings',
    title: `تعذّر تفعيل طلب خطة ${planAr}`,
    body: reason
      ? `راجعة إدارة أوج طلبك ولم يكتمل: ${reason}. يمكنك إرسال طلب جديد بصيغة مرجع صحيحة من الإعدادات.`
      : 'راجعة إدارة أوج طلبك ولم يكتمل. يمكنك إرسال طلب جديد من الإعدادات ← الخطة والاشتراك.',
    metadata: { plan, reason: reason ?? null },
  }
}

export function subscriptionSetPlanMessage(plan: string, months: number | null, expiresAt: string | null) {
  const planAr = plan === 'max' ? 'ماكس' : plan === 'plus' ? 'بلس' : 'المجانية'
  return {
    type: 'subscription' as NotificationType,
    priority: 'high' as NotificationPriority,
    icon: '🎫',
    actionUrl: 'settings',
    title: `تم تحديث خطتك إلى ${planAr}`,
    body: months && expiresAt
      ? `حدّثت إدارة أوج خطتك يدويًا لمدة ${months} ${months === 1 ? 'شهر' : 'أشهر'} — تنتهي في ${new Date(expiresAt).toLocaleDateString('ar-EG')}.`
      : 'حدّثت إدارة أوج خطتك يدويًا. تفاصيل الخطة في الإعدادات ← الخطة والاشتراك.',
    metadata: { plan, months, expiresAt },
  }
}

export function subscriptionExpiringMessage(plan: string, expiresAt: string, daysLeft: number) {
  const planAr = plan === 'max' ? 'ماكس' : 'بلس'
  return {
    type: 'subscription' as NotificationType,
    priority: daysLeft <= 3 ? ('high' as NotificationPriority) : ('normal' as NotificationPriority),
    icon: '⏳',
    actionUrl: 'settings',
    title: daysLeft <= 3 ? `اشتراك ${planAr} ينتهي بعد ${daysLeft} ${daysLeft === 1 ? 'يوم' : 'أيام'}!` : `اشتراك ${planAr} يقترب من الانتهاء`,
    body: `ينتهي اشتراكك في ${new Date(expiresAt).toLocaleDateString('ar-EG')}. جدّد قبل الانتهاء كي لا تفقد حدود ${planAr} — من الإعدادات ← الخطة والاشتراك.`,
    metadata: { plan, expiresAt, daysLeft },
  }
}

export function accountUnsuspendedMessage() {
  return {
    type: 'system' as NotificationType,
    priority: 'normal' as NotificationPriority,
    icon: '✅',
    actionUrl: 'settings',
    title: 'أهلاً بعودتك 👋',
    body: 'تم إلغاء إيقاف حسابك ويمكنك استخدام أوج بشكل طبيعي الآن.',
    metadata: {},
  }
}

export function adminMessageNotification(title: string, message: string) {
  return {
    type: 'system' as NotificationType,
    priority: 'normal' as NotificationPriority,
    icon: '🛡️',
    actionUrl: 'settings',
    title: title.slice(0, 200),
    body: message.slice(0, 1000),
    metadata: { source: 'admin' },
  }
}

export function exportDoneMessage(dateStr: string) {
  return {
    type: 'background' as NotificationType,
    priority: 'normal' as NotificationPriority,
    icon: '📦',
    actionUrl: 'settings',
    title: 'نسخة احتياطية جاهزة',
    body: `اكتمل تصدير بياناتك (${dateStr}) وبدأ تنزيلها. النسخة تشمل كل وحدات أوج — احتفظ بها في مكان آمن.`,
    metadata: { date: dateStr },
  }
}

export function exportFailedMessage(reason: string) {
  return {
    type: 'background' as NotificationType,
    priority: 'high' as NotificationPriority,
    icon: '❗',
    actionUrl: 'settings',
    title: 'تعذّر تصدير بياناتك',
    body: `فشلت عملية التصدير: ${reason.slice(0, 300)}. جرّب مرة أخرى — إن تكرر الفشل أخبرنا.`,
    metadata: { reason: reason.slice(0, 300) },
  }
}
