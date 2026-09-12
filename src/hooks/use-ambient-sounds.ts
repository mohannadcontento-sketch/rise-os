'use client'

import { useCallback, useEffect, useRef } from 'react'
import { getUserStorage } from '@/lib/user-storage'

// ============================================================
// use-ambient-sounds.ts — أصوات الخلفية لجلسات العمل العميق
//
// يشغّل أصواتاً محيطية متكررة (loop) عبر HTMLAudioElement مع تلاشي
// تدريجي fadeIn/fadeOut، ويقرأ مستوى الصوت من تخزين المستخدم المعزول.
//
// المسؤوليات:
//   1) startSound/stopSound: دورة حياة صوت واحد بتلاشي حجم تدريجي.
//   2) مزامنة مستوى الصوت عند تغيّر الإعدادات أثناء التشغيل.
//   3) تنظيف كل المؤقتات والعناصر عند unmount.
// ============================================================

// ── القسم: كتالوج الأصوات الثمانية (label → ملف mp3) ──────────────────────────────────

const AMBIENT_SOUNDS = [
  { label: 'ضوء القمر', file: '/sounds/moonlight-sonata.mp3' },
  { label: 'مطر', file: '/sounds/rain.mp3' },
  { label: 'غابة', file: '/sounds/forest.mp3' },
  { label: 'محيط', file: '/sounds/ocean.mp3' },
  { label: 'نار', file: '/sounds/fire.mp3' },
  { label: 'رياح', file: '/sounds/wind.mp3' },
  { label: 'جدول ماء', file: '/sounds/stream.mp3' },
  { label: 'عاصفة', file: '/sounds/storm.mp3' },
] as const

const AMBIENT_SOUND_URLS: Record<string, string> = Object.fromEntries(AMBIENT_SOUNDS.map((sound) => [sound.label, sound.file]))

function readSoundSettings(): { sounds: boolean; soundVolume: number } {
  try {
    const raw = getUserStorage('rise-settings')
    if (raw) {
      const data = JSON.parse(raw)
      return { sounds: data.sounds ?? true, soundVolume: data.soundVolume ?? 0.5 }
    }
  } catch { /* ignore */ }
  return { sounds: true, soundVolume: 0.5 }
}

interface ActiveSound {
  audio: HTMLAudioElement
  targetVolume: number
  fadeInInterval: ReturnType<typeof setInterval> | null
  fadeOutInterval: ReturnType<typeof setInterval> | null
}

// ── القسم: الـ hook — تشغيل/إيقاف مع التلاشي ──────────────────────────────────

export function useAmbientSounds() {
  const audioMapRef = useRef<Map<string, ActiveSound>>(new Map())

  const startSound = useCallback((label: string) => {
    const url = AMBIENT_SOUND_URLS[label]
    if (!url) {
      console.warn('[ambient] no file mapped for label:', label)
      return
    }

    // صوت يعمل بنفس الاسم؟ أوقفه وابدأ نظيفاً — إعادة التشغيل لا تتراكم عناصر
    const existing = audioMapRef.current.get(label)
    if (existing) {
      if (existing.fadeInInterval) clearInterval(existing.fadeInInterval)
      if (existing.fadeOutInterval) clearInterval(existing.fadeOutInterval)
      try { existing.audio.pause() } catch { /* ok */ }
      audioMapRef.current.delete(label)
    }

    try {
      const audio = new Audio(url)
      audio.loop = true
      audio.preload = 'auto'
      audio.volume = 0
      const settings = readSoundSettings()
      // المحيطية أخفض من إعداد المستخدم (0.55) حتى لا تطغى على صوت الجلسة
      const targetVolume = Math.min(1, Math.max(0, settings.soundVolume * 0.55))
      const playPromise = audio.play()
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch((err) => {
          console.warn('[ambient] play() rejected for', label, err)
          audioMapRef.current.delete(label)
        })
      }

      // تلاشي دخول: 20 خطوة × 50ms = ثانية واحدة صعوداً إلى المستوى الهدف
      const fadeSteps = 20
      const fadeStepMs = 50
      const stepSize = targetVolume / fadeSteps
      let step = 0
      const fadeInInterval = setInterval(() => {
        step++
        const volume = Math.min(targetVolume, stepSize * step)
        try { audio.volume = volume } catch { /* ok */ }
        if (step >= fadeSteps) {
          clearInterval(fadeInInterval)
          const entry = audioMapRef.current.get(label)
          if (entry) entry.fadeInInterval = null
        }
      }, fadeStepMs)

      audioMapRef.current.set(label, { audio, targetVolume, fadeInInterval, fadeOutInterval: null })
    } catch (err) {
      console.error('[ambient] startSound error:', err)
    }
  }, [])

  const stopSound = useCallback((label: string) => {
    const entry = audioMapRef.current.get(label)
    if (!entry) return
    if (entry.fadeInInterval) { clearInterval(entry.fadeInInterval); entry.fadeInInterval = null }
    if (entry.fadeOutInterval) { clearInterval(entry.fadeOutInterval); entry.fadeOutInterval = null }

    // تلاشي خروج: 16 خطوة × 50ms ثم تحرير المورد كاملاً (pause + src='' + load)
    const startVolume = entry.audio.volume
    const fadeSteps = 16
    const fadeStepMs = 50
    const stepSize = startVolume / fadeSteps
    let step = 0
    entry.fadeOutInterval = setInterval(() => {
      step++
      const volume = Math.max(0, startVolume - stepSize * step)
      try { entry.audio.volume = volume } catch { /* ok */ }
      if (step >= fadeSteps) {
        try { entry.audio.pause(); entry.audio.src = ''; entry.audio.load() } catch { /* ok */ }
        if (entry.fadeOutInterval) clearInterval(entry.fadeOutInterval)
        audioMapRef.current.delete(label)
      }
    }, fadeStepMs)
  }, [])

  // ── القسم: مزامنة مستوى الصوت والتنظيف ──────────────────────────────────

  useEffect(() => {
    const handler = () => {
      const { soundVolume } = readSoundSettings()
      const target = Math.min(1, Math.max(0, soundVolume * 0.55))
      audioMapRef.current.forEach((entry) => {
        if (!entry.fadeOutInterval) {
          entry.targetVolume = target
          try { entry.audio.volume = target } catch { /* ok */ }
        }
      })
    }
    window.addEventListener('storage', handler)
    window.addEventListener('rise-settings-changed', handler)
    // شبكة أمان دورية: تغيّر الإعدادات قد لا يبث حدثاً في كل البيئات
    const interval = setInterval(handler, 2000)
    return () => {
      window.removeEventListener('storage', handler)
      window.removeEventListener('rise-settings-changed', handler)
      clearInterval(interval)
    }
  }, [])

  useEffect(() => () => {
    audioMapRef.current.forEach((entry) => {
      if (entry.fadeInInterval) clearInterval(entry.fadeInInterval)
      if (entry.fadeOutInterval) clearInterval(entry.fadeOutInterval)
      try { entry.audio.pause(); entry.audio.src = ''; entry.audio.load() } catch { /* ok */ }
    })
    audioMapRef.current.clear()
  }, [])

  return { startSound, stopSound }
}

export { AMBIENT_SOUNDS }
