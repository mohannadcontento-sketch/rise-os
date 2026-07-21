import { toast } from 'sonner'
import { apiPost } from '@/lib/api-fetch'

// Push notification to server (for persistence)
export async function pushNotification(data: { title: string; body?: string; type?: string; icon?: string; actionUrl?: string }) {
  try {
    await apiPost('/api/rise/notifications', data)
  } catch { /* silent */ }
}

// Show when user completes all morning routine items
export function notifyMorningComplete(score: number, xp: number) {
  try {
    toast.success('🎉 صباح رائع!', {
      description: `درجتك: ${score}% | +${xp} XP`,
      duration: 4000,
    })
    pushNotification({
      title: 'صباح رائع!',
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
    toast.success('✅ مهمة مكتملة', {
      description: `${title} | +${xp} XP`,
      duration: 3000,
    })
    pushNotification({
      title: 'مهمة مكتملة',
      body: `${title} | +${xp} XP`,
      type: 'success',
      icon: '✅',
    })
  } catch {
    // never break the UI
  }
}

// Show when user completes a habit
export function notifyHabitComplete(name: string, streak: number) {
  try {
    const streakMsg = streak > 1 ? ` | 🔥 ${streak} يوم متتالي` : ''
    toast.success('عادة مكتملة', {
      description: `${name}${streakMsg}`,
      duration: 3000,
    })
    pushNotification({
      title: 'عادة مكتملة',
      body: `${name}${streakMsg}`,
      type: 'success',
      icon: '🔥',
    })
  } catch {
    // never break the UI
  }
}

// Show when focus session completes
export function notifyFocusComplete(minutes: number, xp: number) {
  try {
    toast.success('🧠 جلسة تركيز مكتملة', {
      description: `${minutes} دقيقة | +${xp} XP`,
      duration: 4000,
    })
    pushNotification({
      title: 'جلسة تركيز مكتملة',
      body: `${minutes} دقيقة | +${xp} XP`,
      type: 'success',
      icon: '🧠',
    })
  } catch {
    // never break the UI
  }
}

// Show when user reaches a new level
export function notifyLevelUp(level: number) {
  try {
    toast.success('🎊 مستوى جديد!', {
      description: `تهانينا! وصلت للمستوى ${level}`,
      duration: 5000,
    })
    pushNotification({
      title: 'مستوى جديد!',
      body: `تهانينا! وصلت للمستوى ${level}`,
      type: 'achievement',
      icon: '🎊',
    })
  } catch {
    // never break the UI
  }
}

// Show when user has been idle / motivational
export function notifyMotivation() {
  try {
    const messages = [
      '💪 لا تستسلم! كل خطوة تقرّبك من هدفك.',
      '🚀 استمر! النجاح يحتاج صبراً ومثابرة.',
      '🌟 أنت أقرب مما تعتقد. واصل العمل!',
      '🎯 تذكر لماذا بدأت. استمر!',
    ]
    const msg = messages[Math.floor(Math.random() * messages.length)]
    toast.info(msg, {
      duration: 4000,
    })
    // Don't push motivation to notifications (too frequent)
  } catch {
    // never break the UI
  }
}