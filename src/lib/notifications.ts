import { toast } from 'sonner'
import { apiPost } from '@/lib/api-fetch'

// ============================================================
// RiseOS Notifications — with varied motivational messages
// ============================================================

// Push notification to server (for persistence)
export async function pushNotification(data: { title: string; body?: string; type?: string; icon?: string; actionUrl?: string }) {
  try {
    await apiPost('/api/rise/notifications', data)
  } catch { /* silent */ }
}

// ─── Motivational message pools (50+ messages for variety) ───

const TASK_MESSAGES = [
  '🎉 أحسنت! مهمة أخرى منجزة!',
  '✨ رائع! أنت تتقدم بخطى ثابتة',
  '🔥 استمر! كل مهمة تقربك من أهدافك',
  '⭐ ممتاز! الإنجاز تلو الآخر',
  '💪 عظيم! أنت تبني عادة الإنجاز',
  '🚀 انطلاقة ممتازة! واصل التقدم',
  '🌟 مبهر! أنت على الطريق الصحيح',
  '🏆 فخر لك! مهمة مثيرة اكتملت',
  '💎 لامع! كل إنجاز هو جوهرة',
  '🌈 بداية رائعة! استمر في الإنجاز',
  '⚡ سريع كالبرق! مهمة منجزة',
  '🎯 إصابة مباشرة! هدف بعد هدف',
  '🌸 جميل! أنت تزهر بالإنجازات',
  '🦅 يحلق عالياً! واصل الصعود',
  '🔱 قوي! لا شيء يوقفك',
  '☀️ مشرق! يومك يزداد إنتاجية',
  '🎈 احتفل! كل مهمة تستحق',
  '🌺 متفتح! قدراتك تتوسع',
  '🏅 بطل! أنت تعرف ما تريد',
  '🎵 منسجم! الإنجاز أصبح عادة',
]

const HABIT_MESSAGES = [
  '🔥 عادة مثبتة! السلسلة تكبر',
  '🌟 مذهل! الاستمرارية سر النجاح',
  '💪 قوي! أنت تبني نسخة أفضل من نفسك',
  '⚡ طاقة إيجابية! عادة اليوم مكتملة',
  '🎯 تركيز! أنت تعرف ما تريد',
  '🌈 رائع! العادات تصنع المصير',
  '🌸 جميل! كل يوم خطوة جديدة',
  '🦅 يحلق! عاداتك ترتفع بك',
  '🏆 بطل العادات! استمر',
  '💎 لامع! الانضباط يصنع الذهب',
  '☀️ مشرق! عادتك اليومية تضيء يومك',
  '🌱 نامٍ! كل عادة هي بذرة لمستقبلك',
  '🎈 احتفل! عادة أخرى مكتملة',
  '🌺 متفتح! عاداتك تثمر',
  '🎵 منسجم! العادة أصبحت جزءاً منك',
  '🔱 قوي! لا شيء يكسر سلسلتك',
  '🚀 انطلاق! عاداتك وقودك',
  '⭐ ممتاز! أنت قدوة في الانضباط',
  '🏅 ذهبي! عادة اليوم مكتملة',
  '🔥 سلسلة تشتعل! لا تتوقف',
]

const FOCUS_MESSAGES = [
  '🧠 عبقري! جلسة تركيز عميق مكتملة',
  '⚡ تركيز خارق! عقلك في أفضل حالاته',
  '🎯 إصابة! عمق التركيز يصنع المعجزات',
  '💎 لامع! كل دقيقة تركيز استثمار',
  '🚀 انطلاق! أنت في منطقة الإنجاز',
  '🌟 مذهل! العمل العميق سر النجابين',
  '💪 قوي! عقلك يتمرن ويتقوى',
  '🏆 بطل التركيز! استمر',
  '🌸 جميل! الهدوء العميق يثمر',
  '🔥 احتراق! تركيزك يشعل الإنجاز',
]

const WORK_MESSAGES = [
  '💼 شغل نضيف! جلسة شغل مكتملة',
  '🛠️ إنجاز حقيقي! ساعات شغل مثمرة',
  '📈 تقدم ملموس! استمر على نفس الوتيرة',
  '🔧 محترف! توازنت بين الشغل والاستراحة بذكاء',
  '🏗️ بنّاء! كل ساعة شغل تبني شيئاً',
  '⏱️ انضباط! وقتك تحت السيطرة',
  '🎯 دقة في التنفيذ! جلسة شغل قوية',
  '🚧 شغل جاد! خطوة تانية للأمام',
  '💪 إصرار! أنهيت اللي بدأته',
  '🌟 جودة عالية! شغلك بيتكلم عن نفسه',
]

const MORNING_MESSAGES = [
  '🌅 صباح رائع! بدأت يومك بقوة',
  '☀️ مشرق! صباحك يبشر بيوم مثمر',
  '🌟 مذهل! روتين صباحي مكتمل',
  '⚡ طاقة! أنت جاهز لاقتحام اليوم',
  '🌈 رائع! الصباح الذهب يصنع اليوم',
  '🌸 جميل! بداية منظمة ليوم ناجح',
  '🦅 يحلق! صباحك يرفعك عالياً',
  '💎 لامع! روتينك الصباحي ذهب',
  '🎯 تركيز! أنت تعرف كيف تبدأ',
  '🔥 شغف! صباحك يشعل طاقة اليوم',
]

function randomMessage(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)]
}

// Show when user completes all morning routine items
export function notifyMorningComplete(score: number, xp: number) {
  try {
    const msg = randomMessage(MORNING_MESSAGES)
    toast.success(msg, {
      description: `درجتك: ${score}% | +${xp} XP`,
      duration: 4000,
    })
    pushNotification({
      title: msg,
      body: `درجتك: ${score}% | +${xp} XP`,
      type: 'success',
      icon: '🌅',
    })
  } catch {
    // never break the UI
  }
}

// Show when user completes a task
export function notifyTaskComplete(title: string, xp: number) {
  try {
    const msg = randomMessage(TASK_MESSAGES)
    toast.success(msg, {
      description: `${title} | +${xp} XP`,
      duration: 4000,
    })
    pushNotification({
      title: msg,
      body: `${title} | +${xp} XP`,
      type: 'success',
      icon: '🎉',
    })
  } catch {
    // never break the UI
  }
}

// Show when user completes a habit
export function notifyHabitComplete(name: string, streak: number) {
  try {
    const msg = randomMessage(HABIT_MESSAGES)
    const streakMsg = streak > 1 ? ` | 🔥 ${streak} يوم متتالي` : ''
    toast.success(msg, {
      description: `${name}${streakMsg}`,
      duration: 4000,
    })
    pushNotification({
      title: msg,
      body: `${name}${streakMsg}`,
      type: 'success',
      icon: '🔥',
    })
  } catch {
    // never break the UI
  }
}

// Show when user completes a focus session
export function notifyFocusComplete(minutes: number, xp: number) {
  try {
    const msg = randomMessage(FOCUS_MESSAGES)
    toast.success(msg, {
      description: `${minutes} دقيقة تركيز | +${xp} XP`,
      duration: 4000,
    })
    pushNotification({
      title: msg,
      body: `${minutes} دقيقة تركيز | +${xp} XP`,
      type: 'success',
      icon: '🧠',
    })
  } catch {
    // never break the UI
  }
}

// Show when user completes a work session ("الشغل")
export function notifyWorkComplete(activeMinutes: number, qualityScore: number, xp: number) {
  try {
    const msg = randomMessage(WORK_MESSAGES)
    const hours = Math.floor(activeMinutes / 60)
    const mins = activeMinutes % 60
    const timeLabel = hours > 0 ? `${hours}س ${mins}د` : `${mins}د`
    toast.success(msg, {
      description: `${timeLabel} شغل فعلي | جودة ${qualityScore}٪ | +${xp} XP`,
      duration: 5000,
    })
    pushNotification({
      title: msg,
      body: `${timeLabel} شغل فعلي | جودة ${qualityScore}٪ | +${xp} XP`,
      type: 'success',
      icon: '💼',
    })
  } catch {
    // never break the UI
  }
}
