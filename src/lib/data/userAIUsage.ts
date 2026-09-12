import { sb, toSnake, toCamel } from './core'

// ============================================================
// data/userAIUsage.ts — مستودع «استهلاك الذكاء الاصطناعي»
//
// قراءة فقط لعدادات الاستخدام اليومي/الشهري. الكتابة حصراً من
// consume_usage (RPC بصفة SECURITY DEFINER داخل معاملة واحدة) —
// لا سياسات كتابة على الجدول إطلاقاً، فعميل بيد المستخدم لا
// يستطيع لمس العدادات (المرحلة 04 في docs/ARCHITECTURE.md).
// ============================================================

export const userAIUsage = {
    async get(userId: string) {
      const client = await sb()
      const { data, error } = await client
        .from('user_ai_usage')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()
      if (error) throw error
      return data ? toCamel(data) : null
    },
  }
