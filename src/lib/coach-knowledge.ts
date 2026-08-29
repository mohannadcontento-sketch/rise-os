/**
 * قاعدة المعارف — مكتبة معارف من الكتب (بلا ذكاء اصطناعي)
 *
 * مبدأ التصميم (طلب المستخدم):
 *   - لا AI ولا API: كل الإجابات من قاعدة معارف محلية دقيقة مبنية على كتب حقيقية
 *   - أزرار معروفة: تصنيفات → أسئلة → إجابة → أزرار متابعة مقترحة
 *   - بحث حر عربي يعمل بتطبيع الأحرف العربية ومطابقة الكلمات المفتاحية
 *   - المستخدم يمكنه إضافة معارفه المقترحة (تُحفظ محلياً وتُدمج في البحث)
 */

import { KB_PART_1 } from './coach-kb-1'
import { KB_PART_2 } from './coach-kb-2'

export type TopicId =
  | 'habits'
  | 'focus'
  | 'productivity'
  | 'goals'
  | 'morning'
  | 'sleep'
  | 'motivation'
  | 'procrastination'
  | 'time'
  | 'money'
  | 'learning'
  | 'mindset'

export interface CoachAction {
  label: string
  moduleId: string
}

export interface KnowledgeEntry {
  id: string
  topic: TopicId
  title: string
  book: string
  author: string
  summary: string
  steps: string[]
  tags: string[]
  actions?: CoachAction[]
}

export interface CoachTopic {
  id: TopicId
  label: string
  desc: string
  icon: string // lucide icon name — resolved in the component
  hue: string  // css color token class prefix
}

/* ─────────────── التصنيفات (الأزرار الرئيسية) ─────────────── */

export const COACH_TOPICS: CoachTopic[] = [
  { id: 'habits', label: 'العادات', desc: 'كيف تبني عادة تثبت', icon: 'Repeat', hue: 'emerald' },
  { id: 'focus', label: 'التركيز', desc: 'عمل عميق ومقاومة التشتت', icon: 'Brain', hue: 'violet' },
  { id: 'productivity', label: 'الإنتاجية', desc: 'أنظم الأهم قبل العاجل', icon: 'Zap', hue: 'gold' },
  { id: 'goals', label: 'الأهداف', desc: 'من رؤية واضحة لنظام يومي', icon: 'Target', hue: 'rose' },
  { id: 'morning', label: 'الروتين الصباحي', desc: 'امتلك أول ساعة', icon: 'Sunrise', hue: 'gold' },
  { id: 'sleep', label: 'النوم', desc: 'أساس الطاقة والتركيز', icon: 'Moon', hue: 'violet' },
  { id: 'motivation', label: 'التحفيز', desc: 'لأيام الانخفاض', icon: 'Flame', hue: 'rose' },
  { id: 'procrastination', label: 'التسويف', desc: 'كيف تبدأ حين تكره البدء', icon: 'Hourglass', hue: 'emerald' },
  { id: 'time', label: 'إدارة الوقت', desc: 'بومودورو وأولويات', icon: 'Clock', hue: 'gold' },
  { id: 'money', label: 'المال', desc: 'ادخار وميزانية بذكاء', icon: 'Wallet', hue: 'emerald' },
  { id: 'learning', label: 'التعلم', desc: 'ذاكرة ومهارات أسرع', icon: 'BookOpen', hue: 'violet' },
  { id: 'mindset', label: 'الصحة النفسية', desc: 'هدوء وصفاء ذهني', icon: 'HeartPulse', hue: 'rose' },
]

/* ─────────────── قاعدة المعارف الكاملة ─────────────── */

export const COACH_KNOWLEDGE: KnowledgeEntry[] = [...KB_PART_1, ...KB_PART_2]

export function entriesByTopic(topic: TopicId): KnowledgeEntry[] {
  return COACH_KNOWLEDGE.filter((e) => e.topic === topic)
}

export function getEntry(id: string): KnowledgeEntry | undefined {
  return COACH_KNOWLEDGE.find((e) => e.id === id)
}

export function getTopic(id: TopicId): CoachTopic | undefined {
  return COACH_TOPICS.find((t) => t.id === id)
}

/** أسئلة متابعة مقترحة بعد كل إجابة (أزرار بتتبعت) */
export function relatedTo(entry: KnowledgeEntry, limit = 4): KnowledgeEntry[] {
  const sameTopic = entriesByTopic(entry.topic).filter((e) => e.id !== entry.id)
  if (sameTopic.length >= limit) return sameTopic.slice(0, limit)
  const others = COACH_KNOWLEDGE.filter((e) => e.topic !== entry.topic)
  return [...sameTopic, ...others].slice(0, limit)
}

/* ─────────────── محرك المطابقة العربية ─────────────── */

const DIACRITICS = /[\u064B-\u0652\u0670\u0640]/g

/** تطبيع النص العربي: تشكيل، همزات، تاء مربوطة، ألف مقصورة، ترقيم ومسافات */
export function normalizeArabic(input: string): string {
  return (input || '')
    .toLowerCase()
    .replace(DIACRITICS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ؤ/g, 'و')
    .replace(/ئ|ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}\s%]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(s: string): string[] {
  return normalizeArabic(s).split(' ').filter((t) => t.length > 1)
}

export interface SearchResult {
  entry: KnowledgeEntry
  score: number
}

/**
 * بحث حر في قاعدة المعارف.
 * الوزن: تطابق وسم كامل 12 / كلمة عنوان 6 / كلمة وسم 4 / كتاب-مؤلف 4 / كلمة ملخص 2 / خطوة 1
 */
export function searchKnowledge(query: string, limit = 6): SearchResult[] {
  const q = normalizeArabic(query)
  if (!q || q.length < 2) return []
  const qTokens = tokens(q)
  if (qTokens.length === 0) return []

  const results: SearchResult[] = []

  for (const entry of COACH_KNOWLEDGE) {
    let score = 0

    // تطابق كامل مع وسوم مركّبة (سؤال كامل مثل "كسرت سلسلتي")
    for (const tag of entry.tags) {
      const nTag = normalizeArabic(tag)
      if (!nTag) continue
      if (q.includes(nTag)) score += 12
      else if (nTag.includes(q) && q.length >= 3) score += 7
    }

    // تطابق كلمات العنوان
    const titleTokens = new Set(tokens(entry.title))
    for (const t of qTokens) if (titleTokens.has(t)) score += 6

    // كلمات الوسوم
    const tagTokens = new Set(entry.tags.flatMap((t) => tokens(t)))
    for (const t of qTokens) if (tagTokens.has(t)) score += 4

    // كتاب/مؤلف
    const bookTokens = new Set(tokens(entry.book + ' ' + entry.author))
    for (const t of qTokens) if (bookTokens.has(t)) score += 4

    // الملخص والخطوات
    const summaryTokens = new Set(tokens(entry.summary))
    const stepTokens = new Set(entry.steps.flatMap((s) => tokens(s)))
    for (const t of qTokens) {
      if (summaryTokens.has(t)) score += 2
      if (stepTokens.has(t)) score += 1
    }

    if (score > 0) results.push({ entry, score })
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit)
}

/* إحصائيات الواجهة */
export function coachStats() {
  const books = new Set(COACH_KNOWLEDGE.map((e) => `${e.book}|${e.author}`))
  return { entries: COACH_KNOWLEDGE.length, books: books.size, topics: COACH_TOPICS.length }
}
