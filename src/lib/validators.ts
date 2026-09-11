import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

/**
 * التحقق المركزي من المدخلات الحساسة — المرحلة 01 (Audit وتنظيف المشروع)
 * الهدف: مصدر واحد لمخططات zod للمدخلات الحساسة بدل فحوص يدوية مبعثرة.
 * ملاحظة: بقية المسارات ذات الفحوص اليدوية المكتملة (sanitize.ts وغيره)
 * تُهاجر تدريجيًا عند لمسها في مراحلها (المرحلة 04 تضيف entitlement checks).
 */

// ─── أنواع أساسية ───

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
