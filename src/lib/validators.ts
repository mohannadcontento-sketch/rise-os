import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

// ============================================================
// validators.ts — التحقق المركزي من المدخلات (zod)
//
// مخططات zod الموحّدة لكل مسارات API الحساسة + مساعد parseBody
// يوحّد شكل استجابة الخطأ 400 عبر المشروع بأكمله.
//
// المسؤوليات:
//   1) تعريف مخططات التحقق للمسارات الحساسة (auth/الحساب/الاشتراكات/push/المجتمع).
//   2) parseBody: تحليل جسم الطلب وإرجاع استجابة 400 جاهزة عند أول خطأ تحقق.
// ============================================================

/**
 * التحقق المركزي من المدخلات الحساسة — المرحلة 01 (Audit وتنظيف المشروع)
 * الهدف: مصدر واحد لمخططات zod للمدخلات الحساسة بدل فحوص يدوية مبعثرة.
 * ملاحظة: بقية المسارات ذات الفحوص اليدوية المكتملة (sanitize.ts وغيره)
 * تُهاجر تدريجيًا عند لمسها في مراحلها (المرحلة 04 تضيف entitlement checks).
 */

// ─── أنواع أساسية ───

// تسوية البريد (trim + toLowerCase) قبل التحقق حتى لا تتعدد نسخ العنوان نفسه
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'البريد الإلكتروني أطول من الحد المسموح')
  .email('بريد إلكتروني غير صالح')

export const passwordSchema = z
  .string()
  .min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل')
  .max(128, 'كلمة المرور أطول من الحد المسموح')

export const uuidSchema = z.string().uuid('معرّف غير صالح')

// ─── مخططات المسارات الحساسة ───

/** POST /api/auth/resend */
export const resendSchema = z.object({ email: emailSchema })

/** DELETE /api/rise/delete-all — تدمير بيانات: أقصى صرامة */
export const deleteAllSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  confirmDelete: z.literal(true, {
    message: 'يجب تأكيد الحذف صراحةً',
  }),
})

/** PUT /api/rise/admin/storage — حد التخزين بالبايت: من 1KB إلى 10GB */
export const storageLimitSchema = z.object({
  userId: uuidSchema,
  storageLimit: z
    .number()
    .int('الحد يجب أن يكون عددًا صحيحًا')
    .min(1024, 'الحد الأدنى 1KB')
    .max(10 * 1024 * 1024 * 1024, 'الحد الأقصى 10GB'),
})

/** POST /api/rise/user/name */
export const userNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'الاسم مطلوب')
    .max(80, 'الاسم أطول من 80 حرفًا'),
})

/** POST /api/rise/user/avatar */
export const avatarIdSchema = z.object({
  avatar: z.string().min(1, 'الصورة الرمزية مطلوبة').max(64),
})

// ─── المرحلة 03 — Auth والحساب والملف الشخصي ───

/** POST /api/auth/reset-password — طلب بريد استعادة كلمة المرور */
export const requestPasswordResetSchema = z.object({ email: emailSchema })

/**
 * POST /api/auth/update-password — تغيير كلمة المرور.
 * flow "settings": currentPassword + newPassword (إعادة إثبات هوية).
 * flow "recovery": newPassword فقط + marker cookie من رابط الاستعادة.
 */
export const updatePasswordSchema = z
  .object({
    currentPassword: passwordSchema.optional(),
    newPassword: passwordSchema,
  })
  .refine(
    (v) => !!v.currentPassword || v.newPassword,
    { message: 'بيانات غير صالحة' }
  )
  // رفض الجديدة إن طابقت الحالية — شرط flow الإعدادات فقط (إعادة إثبات الهوية)
  .refine(
    (v) => !v.currentPassword || v.currentPassword !== v.newPassword,
    { message: 'كلمة المرور الجديدة مطابقة للحالية' }
  )

/** DELETE /api/auth/delete-account — حذف الحساب نهائيًا: أقصى صرامة */
export const deleteAccountSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  confirmDelete: z.literal(true, {
    message: 'يجب تأكيد حذف الحساب صراحةً',
  }),
})

// ─── المرحلة 04 — Plans والاشتراكات والـUsage Limits ───

/**
 * POST /api/rise/user/subscription/requests — طلب ترقية (دفع يدوي v1).
 * المرجع = رقم عملية الدفع لدى الوسيلة (InstaPay/كاش...) 4–64 حرفًا.
 */
export const subscriptionRequestSchema = z.object({
  requestedPlan: z.enum(['plus', 'max'], {
    message: 'الخطة المطلوبة يجب أن تكون بلس أو ماكس',
  }),
  paymentMethod: z.enum(['instapay', 'vodafone_cash', 'etisalat_cash', 'other'], {
    message: 'وسيلة دفع غير معروفة',
  }),
  reference: z
    .string()
    .trim()
    .min(4, 'رقم عملية الدفع مطلوب (4 أحرف على الأقل)')
    .max(64, 'رقم العملية أطول من اللازم'),
  note: z.string().trim().max(200, 'الملاحظة أطول من 200 حرف').optional(),
})

/**
 * POST /api/rise/admin/subscriptions — إجراءات الأدمن:
 * approve (requestId + مدة) / reject (requestId + سبب) / set-plan يدوي.
 */
export const adminSubscriptionActionSchema = z
  .object({
    action: z.enum(['approve', 'reject', 'set-plan'], {
      message: 'إجراء غير معروف',
    }),
    requestId: uuidSchema.optional(),
    userId: uuidSchema.optional(),
    plan: z.enum(['free', 'plus', 'max']).optional(),
    months: z
      .number()
      .int('المدة يجب أن تكون عددًا صحيحًا من الشهور')
      .min(1, 'أقل مدة شهر واحد')
      .max(12, 'أقصى مدة 12 شهرًا')
      .optional(),
    reference: z
      .string()
      .trim()
      .min(4, 'مرجع العملية مطلوب (4 أحرف على الأقل)')
      .max(64, 'مرجع العملية أطول من اللازم')
      .optional(),
    reason: z.string().trim().min(3, 'سبب الرفض مطلوب').max(200, 'السبب أطول من 200 حرف').optional(),
  })
  // حقول مشروطة بالإجراء: كل action يفرز حقوله الإلزامية (رفض الطلب الناقص مبكراً)
  .refine((v) => (v.action === 'approve' ? !!v.requestId : true), {
    message: 'requestId مطلوب للاعتماد',
  })
  .refine((v) => (v.action === 'reject' ? !!v.requestId : true), {
    message: 'requestId مطلوب للرفض',
  })
  .refine((v) => (v.action === 'set-plan' ? !!v.userId && !!v.plan : true), {
    message: 'userId و plan مطلوبان للتعيين اليدوي',
  })

// ─── مساعد موحد لتحليل جسم الطلب ───

export interface ParsedBody<T> {
  ok: boolean
  data?: T
  response?: NextResponse
}

/**
 * ── المرحلة 06 — Web Push ─────────────────────────────────────
 */

/** POST /api/rise/push/subscribe — تسجيل اشتراك جهاز */
export const pushSubscribeSchema = z.object({
  endpoint: z
    .string()
    .trim()
    .startsWith('https://', 'عنوان الاشتراك يجب أن يكون https')
    .max(2048, 'عنوان الاشتراك أطول من اللازم'),
  keys: z.object({
    p256dh: z.string().min(64, 'مفتاح p256dh غير صالح').max(160, 'مفتاح p256dh غير صالح'),
    auth: z.string().min(16, 'مفتاح auth غير صالح').max(64, 'مفتاح auth غير صالح'),
  }),
  label: z.string().trim().max(120, 'تسمية الجهاز أطول من اللازم').optional(),
})

/** DELETE /api/rise/push/subscribe — إبطال بالـid (من القائمة) أو endpoint (لجهازنا) */
export const pushUnsubscribeSchema = z
  .object({
    id: z.string().uuid('معرّف الجهاز غير صالح').optional(),
    endpoint: z.string().trim().startsWith('https://', 'عنوان الاشتراك غير صالح').max(2048).optional(),
  })
  // يكفي أحد المعرّفين: id (من قائمة الأجهزة) أو endpoint (لجهازنا الحالي)
  .refine((v) => !!v.id || !!v.endpoint, { message: 'مطلوب معرّف الجهاز أو عنوان الاشتراك' })

/**
 * PUT /api/rise/user/notification-preferences — تفضيلات الفئات.
 * التسويق خيار منفصل بطلب موافقة صريحة من الواجهة (checkbox
 * نصي) — الخادم يقبل القيمة فقط؛ الافتراضية false عند أول تفعيل.
 */
export const notificationPreferencesSchema = z.object({
  pushEnabled: z.boolean().optional(),
  categories: z
    .object({
      important: z.boolean().optional(),
      security: z.boolean().optional(),
      reminders: z.boolean().optional(),
      community: z.boolean().optional(),
      marketing: z.boolean().optional(),
    })
    .refine((v) => Object.values(v).some((x) => x !== undefined), {
      message: 'حدد فئة واحدة على الأقل',
    })
    .optional(),
})

/**
 * POST /api/rise/error-log وغيرها — تحليل جسم الطلب الموحد.
 * يقرأ جسم الطلب ويطبق مخطط zod.
 * عند الفشل يرجع استجابة 400 جاهزة برسالة الخطأ الأولى (بنمط المسارات الحالية).
 */
export async function parseBody<T>(
  req: NextRequest,
  schema: z.ZodType<T>
): Promise<ParsedBody<T>> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: 'جسم الطلب غير صالح' }, { status: 400 }),
    }
  }
  // safeParse لا يرمي استثناءً — نعيد أول رسالة تحقق فقط (بنمط بقية المسارات)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'بيانات غير صالحة' },
        { status: 400 }
      ),
    }
  }
  return { ok: true, data: parsed.data }
}

// ============================================================
// المرحلة 07 — المجتمع (community validators)
// ============================================================

// ── القسم: منشورات وتعليقات وتفاعلات وبلاغات المجتمع ──────────────────────────────────

export const communityPostCreateSchema = z.object({
  title: z.string().trim().min(3, 'العنوان قصير جدًا (3 أحرف على الأقل)').max(200, 'العنوان طويل جدًا (200 حرف كحد أقصى)'),
  body: z.string().trim().min(1, 'المحتوى مطلوب').max(10000, 'المحتوى طويل جدًا (10000 حرف كحد أقصى)'),
  // المرحلة 07-ب: مفاتيح مرفقات سبق رفعها إلى Cloudinary عبر مسار presign.
  // التحقق من الملكية والحالة يجري خادميًا ضد media_objects (لا نثق بالعميل).
  media: z.array(z.object({
    key: z.string().trim().min(5, 'مفتاح المرفق غير صالح').max(300, 'مفتاح المرفق غير صالح'),
    mediaId: z.string().uuid('معرّف المرفق غير صالح'),
  })).max(4, 'حتى 4 صور في المنشور الواحد').optional(),
})

export const communityPostUpdateSchema = z.object({
  title: z.string().trim().min(3, 'العنوان قصير جدًا (3 أحرف على الأقل)').max(200, 'العنوان طويل جدًا (200 حرف كحد أقصى)').optional(),
  body: z.string().trim().min(1, 'المحتوى مطلوب').max(10000, 'المحتوى طويل جدًا (10000 حرف كحد أقصى)').optional(),
  // تحديث جزئي: يجب إرسال title أو body على الأقل وإلا فالطلب بلا أثر
}).refine((v) => v.title !== undefined || v.body !== undefined, { message: 'لا يوجد ما يُحدّث' })

export const communityCommentCreateSchema = z.object({
  postId: z.string().uuid('معرّف المنشور غير صالح'),
  parentId: z.string().uuid('معرّف التعليق غير صالح').optional().nullable(),
  body: z.string().trim().min(1, 'التعليق مطلوب').max(5000, 'التعليق طويل جدًا (5000 حرف كحد أقصى)'),
})

export const communityCommentUpdateSchema = z.object({
  body: z.string().trim().min(1, 'التعليق مطلوب').max(5000, 'التعليق طويل جدًا (5000 حرف كحد أقصى)'),
})

export const communityReactionSchema = z.object({
  targetType: z.enum(['post', 'comment'], { message: 'نوع الهدف غير صالح' }),
  targetId: z.string().uuid('معرّف الهدف غير صالح'),
})

export const communityReportSchema = z.object({
  targetType: z.enum(['post', 'comment'], { message: 'نوع الهدف غير صالح' }),
  targetId: z.string().uuid('معرّف الهدف غير صالح'),
  reason: z.enum(['spam', 'abuse', 'offensive', 'off_topic', 'other'], { message: 'سبب البلاغ غير صالح' }),
  details: z.string().trim().max(2000, 'التفاصيل طويلة جدًا').optional(),
})

export const communityMembersSearchSchema = z.object({
  q: z.string().trim().min(1, 'اكتب حرفًا للبحث').max(64, 'استعلام طويل جدًا').optional(),
})

// ── المرحلة 07-ب: طلب توقيع رفع (signed upload) لصورة إلى Cloudinary ──
export const communityMediaPresignSchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif'], {
    message: 'نوع الصورة غير مدعوم (JPG / PNG / WebP / GIF فقط)',
  }),
  bytes: z
    .number({ message: 'حجم الصورة مطلوب' })
    .int('حجم غير صالح')
    .min(1, 'حجم غير صالح')
    .max(8388608, 'الصورة أكبر من 8MB — صغّرها وأعد المحاولة'),
})

// ── القسم: إجراءات الإشراف والإدارة (discriminatedUnion على action) ──────────────────────────────────

export const communityModerateSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('hide_post'),
    postId: z.string().uuid(),
    reason: z.string().trim().max(500).optional(),
  }),
  z.object({
    action: z.literal('restore_post'),
    postId: z.string().uuid(),
    reason: z.string().trim().max(500).optional(),
  }),
  z.object({
    action: z.literal('remove_post'),
    postId: z.string().uuid(),
    reason: z.string().trim().max(500).optional(),
  }),
  z.object({
    action: z.literal('hide_comment'),
    commentId: z.string().uuid(),
    reason: z.string().trim().max(500).optional(),
  }),
  z.object({
    action: z.literal('restore_comment'),
    commentId: z.string().uuid(),
    reason: z.string().trim().max(500).optional(),
  }),
  z.object({
    action: z.literal('remove_comment'),
    commentId: z.string().uuid(),
    reason: z.string().trim().max(500).optional(),
  }),
  z.object({
    action: z.literal('dismiss_report'),
    reportId: z.string().uuid(),
    reason: z.string().trim().max(500).optional(),
  }),
  z.object({
    action: z.literal('remove_reported'),
    reportId: z.string().uuid(),
    reason: z.string().trim().max(500).optional(),
  }),
  z.object({
    action: z.literal('ban_user'),
    userId: z.string().uuid(),
    reason: z.string().trim().min(3, 'سبب الحظر مطلوب').max(500),
    days: z.number().int().min(1).max(365).optional(),
  }),
  z.object({
    action: z.literal('unban_user'),
    userId: z.string().uuid(),
    reason: z.string().trim().max(500).optional(),
  }),
])

// ─── المرحلة 11 — استكمال وحدات لوحة الإدارة (Ads / Plans / System) ───

/** رقم وحدة AdSense: أرقام فقط، أو فراغ (= إزالة المفتاح ← إعلان البيت) */
const adSlotValueSchema = z
  .string()
  .trim()
  .refine((v) => v === '' || /^\d{6,20}$/.test(v), {
    message: 'رقم الوحدة أرقام فقط (أو فراغ)',
  })

/** POST /api/rise/admin/ads — إعدادات الإعلانات + الإعلانات المباشرة */
export const adminAdsActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('set'),
    enabled: z.boolean().optional(),
    adsenseClientId: z
      .string()
      .trim()
      .regex(/^ca-pub-\d{6,20}$/, 'معرف الناشر بصيغة ca-pub- ثم أرقام')
      .optional(),
    slots: z
      .object({
        home: adSlotValueSchema.optional(),
        community: adSlotValueSchema.optional(),
        tasks: adSlotValueSchema.optional(),
      })
      .optional(),
  }),
  z.object({
    action: z.literal('direct-ad-save'),
    ad: z.object({
      id: z
        .string()
        .trim()
        .regex(/^[a-z0-9-]{2,40}$/, 'معرّف الإعلان: أحرف صغيرة وأرقام وشرطات'),
      title: z.string().trim().min(2, 'عنوان الإعلان مطلوب').max(80),
      description: z.string().trim().max(160).optional(),
      cta: z.string().trim().max(30).optional(),
      href: z
        .string()
        .trim()
        .max(500)
        .regex(/^https?:\/\//, 'رابط الهدف يجب أن يبدأ بـ http(s)://')
        .optional(),
      image: z
        .string()
        .trim()
        .max(500)
        .regex(/^https?:\/\//, 'رابط الصورة يجب أن يبدأ بـ http(s)://')
        .optional(),
      placement: z.enum(['home', 'community', 'tasks', 'all']),
      startAt: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'تاريخ البدء بصيغة YYYY-MM-DD')
        .nullable()
        .optional(),
      endAt: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'تاريخ الانتهاء بصيغة YYYY-MM-DD')
        .nullable()
        .optional(),
      priority: z.number().int().min(0).max(1000).optional(),
      active: z.boolean().optional(),
    }),
  }),
  z.object({
    action: z.literal('direct-ad-delete'),
    id: z
      .string()
      .trim()
      .regex(/^[a-z0-9-]{2,40}$/, 'معرّف الإعلان غير صالح'),
  }),
])

/** POST /api/rise/admin/plans — تعديل حد ميزة لخطة (يسري فورًا خادميًا) */
export const adminPlansActionSchema = z.object({
  action: z.literal('set-entitlement'),
  plan: z.enum(['free', 'plus', 'max']),
  featureKey: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9._-]{2,63}$/, 'مفتاح الميزة غير صالح (مثل ai.action)'),
  enabled: z.boolean(),
  dailyLimit: z
    .number()
    .int('الحد اليومي عدد صحيح')
    .min(0, 'الحد اليومي لا يمكن أن يكون سالبًا')
    .max(100000, 'الحد اليومي كبير جدًا')
    .nullable()
    .optional(),
  monthlyLimit: z
    .number()
    .int('الحد الشهري عدد صحيح')
    .min(0, 'الحد الشهري لا يمكن أن يكون سالبًا')
    .max(100000, 'الحد الشهري كبير جدًا')
    .nullable()
    .optional(),
})

/** POST /api/rise/admin/system — وضع الصيانة + أعلام الميزات */
export const adminSystemActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('maintenance'),
    enabled: z.boolean(),
    message: z.string().trim().min(3, 'الرسالة قصيرة جدًا').max(160).optional(),
  }),
  z.object({
    action: z.literal('flags'),
    flags: z
      .record(
        z.string().regex(/^[a-z][a-z0-9_]{2,63}$/, 'اسم علم غير صالح'),
        z.boolean(),
      )
      .refine((obj) => Object.keys(obj).length <= 50, {
        message: 'أقصى عدد أعلام 50',
      }),
  }),
])

/** POST /api/rise/feedback — إرسال ملاحظة البيتا (المرحلة 15) */
export const feedbackSubmitSchema = z.object({
  type: z.enum(['bug', 'suggestion', 'question', 'other']),
  message: z
    .string()
    .trim()
    .min(5, 'اكتب ملاحظتك بوضوح (5 أحرف على الأقل)')
    .max(2000, 'الملاحظة طويلة جدًا (الحد 2000 حرف)'),
  page: z.string().trim().max(160).optional(),
})

/** POST /api/rise/admin/feedback — تحديث حالة ملاحظة (المرحلة 15) */
export const adminFeedbackActionSchema = z.object({
  action: z.literal('set-status'),
  id: uuidSchema,
  status: z.enum(['new', 'read', 'handled']),
})
