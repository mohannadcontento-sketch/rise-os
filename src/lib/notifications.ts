import { toast } from 'sonner'
import { apiPost } from '@/lib/api-fetch'
import { isNotificationEnabled, showBrowserNotification } from '@/lib/notification-prefs'

// ============================================================
// RiseOS Notifications — with varied motivational messages
// Every celebration is gated by the user's Settings toggles
// (rise-settings.notifications) and also fires a browser
// notification when the tab is not focused.
// ============================================================

// Push notification to server (for persistence)
const CELEBRATION_PUSH_GAP_MS = 10 * 60 * 1000 // one stored celebration per type per 10 min
let lastCelebrationPushAt = 0

export async function pushNotification(data: { title: string; body?: string; type?: string; icon?: string; actionUrl?: string }) {
  try {
    // ANTI-SPAM FIX: الجرس كان بيتملي بصف لكل إنجاز (10 مهام = 10 إشعارات).
    // الاحتفالات الروتينية بتتخزن كحد أقصى مرة كل 10 دقايق — أما التذكيرات
    // المجدولة (type: 'reminder') فهي مفيدة وبتعدي دايماً.
    if ((data.type || 'success') === 'success') {
      const now = Date.now()
      if (now - lastCelebrationPushAt < CELEBRATION_PUSH_GAP_MS) return
      lastCelebrationPushAt = now
    }
    await apiPost('/api/rise/notifications', data)
  } catch { /* silent */ }
}

/** Shared celebration pipeline: respects prefs + notifies browser when unfocused */
function celebrate(opts: {
  prefKey: 'taskDone' | 'habitDone' | 'focusDone' | 'morning'
  message: string
  detail: string
  icon: string
  actionUrl?: string
  type?: string
}) {
  try {
    if (!isNotificationEnabled(opts.prefKey)) return
    // ANTI-SPAM FIX: الازدواج السريع (إنهاء 5 مهام ورا بعض) كان ينتج 5
    // toasts + 5 إشعارات متصفح + 5 صفوف في الجرس — بيتحول لمزعج.
    // من نفس النوع: toast واحد كل 10 ثواني كافية كتغذية راجعة.
    const now = Date.now()
    if (now - (lastCelebrateAt[opts.prefKey] || 0) < CELEBRATE_MIN_GAP_MS) return
    lastCelebrateAt[opts.prefKey] = now
    toast.success(opts.message, {
      description: opts.detail,
      duration: 4000,
    })
    showBrowserNotification(opts.message, { body: opts.detail, tag: `rise-${opts.prefKey}` })
    pushNotification({
      title: opts.message,
      body: opts.detail,
      type: opts.type || 'success',
      icon: opts.icon,
      actionUrl: opts.actionUrl,
    })
  } catch {
    // never break the UI
  }
}

// Throttle state for celebrate() — one celebration per type per 10s
const CELEBRATE_MIN_GAP_MS = 10_000
const lastCelebrateAt: Record<string, number> = {}

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
  celebrate({
    prefKey: 'morning',
    message: randomMessage(MORNING_MESSAGES),
    detail: `درجتك: ${score}% | +${xp} XP`,
    icon: '🌅',
    actionUrl: 'morning',
  })
}

// Show when user completes a task
export function notifyTaskComplete(title: string, xp: number) {
  celebrate({
    prefKey: 'taskDone',
    message: randomMessage(TASK_MESSAGES),
    detail: `${title} | +${xp} XP`,
    icon: '🎉',
    actionUrl: 'tasks',
  })
}

// Show when user completes a habit
export function notifyHabitComplete(name: string, streak: number) {
  const streakMsg = streak > 1 ? ` | 🔥 ${streak} يوم متتالي` : ''
  celebrate({
    prefKey: 'habitDone',
    message: randomMessage(HABIT_MESSAGES),
    detail: `${name}${streakMsg}`,
    icon: '🔥',
    actionUrl: 'habits',
  })
}

// Show when user completes a focus session
export function notifyFocusComplete(minutes: number, xp: number) {
  celebrate({
    prefKey: 'focusDone',
    message: randomMessage(FOCUS_MESSAGES),
    detail: `${minutes} دقيقة تركيز | +${xp} XP`,
    icon: '🧠',
    actionUrl: 'deepwork',
  })
}

// Show when user completes a work session ("الشغل")
export function notifyWorkComplete(activeMinutes: number, qualityScore: number, xp: number) {
  const hours = Math.floor(activeMinutes / 60)
  const mins = activeMinutes % 60
  const timeLabel = hours > 0 ? `${hours}س ${mins}د` : `${mins}د`
  celebrate({
    prefKey: 'focusDone',
    message: randomMessage(WORK_MESSAGES),
    detail: `${timeLabel} شغل فعلي | جودة ${qualityScore}٪ | +${xp} XP`,
    icon: '💼',
    actionUrl: 'work',
  })
}
