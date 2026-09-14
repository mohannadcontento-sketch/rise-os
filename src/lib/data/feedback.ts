import { sb, toSnake, toCamel } from './core'

// ============================================================
// data/feedback.ts — مستودع «ملاحظات البيتا» (المرحلة 15)
//
// قناة جمع Feedback داخل التطبيق: insert بملاحظة المستخدم
// (type + message + page) وlist لآخر ملاحظاته لمتابعة حالتها.
// RLS (هجرة 037): إدراج/قراءة باسمه فقط — لا تعديل ولا حذف
// من جهة العميل إطلاقًا؛ إدارة الحالة تتم عبر service role في
// مسارات الإدارة.
// ============================================================

export type FeedbackType = 'bug' | 'suggestion' | 'question' | 'other'
export type FeedbackStatus = 'new' | 'read' | 'handled'

export interface FeedbackRow {
  id: string
  userId: string
  type: FeedbackType
  message: string
  page: string | null
  status: FeedbackStatus
  createdAt: string
  handledAt: string | null
}

export const feedback = {
    /** إرسال ملاحظة — يعيد الصف كما خُزّن (بالحالة new). */
    async insert(userId: string, body: { type: FeedbackType; message: string; page?: string | null }) {
      const client = await sb()
      const { data, error } = await client
        .from('feedback')
        .insert(toSnake({ userId, type: body.type, message: body.message, page: body.page ?? null }))
        .select('id, user_id, type, message, page, status, created_at, handled_at')
        .single()
      if (error) throw error
      return toCamel<FeedbackRow>(data)
    },

    /** ملاحظات المستخدم نفسه (الأحدث أولًا) — لمتابعة الحالة. */
    async listOwn(userId: string, limit = 20) {
      const client = await sb()
      const { data, error } = await client
        .from('feedback')
        .select('id, user_id, type, message, page, status, created_at, handled_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(Math.min(Math.max(limit, 1), 50))
      if (error) throw error
      return toCamel<FeedbackRow[]>(data ?? [])
    },
  }
