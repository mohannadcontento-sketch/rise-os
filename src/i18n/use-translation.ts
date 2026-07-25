'use client'

import { useState, useCallback, useEffect, useSyncExternalStore } from 'react'
import ar from '@/messages/ar.json'
import en from '@/messages/en.json'

// ============================================================
// P3#2: Lightweight i18n — Arabic (default) + English
// ------------------------------------------------------------
// No middleware required — preserves existing routing.
// Language stored in localStorage + cookie.
// ============================================================

type Messages = typeof ar
type Locale = 'ar' | 'en'

const messages: Record<Locale, Messages> = { ar, en }

let currentLocale: Locale = 'ar'

/** Get current locale (client-side). */
export function getLocale(): Locale {
  if (typeof window === 'undefined') return 'ar'
  try {
    const stored = localStorage.getItem('rise-locale') as Locale
    return stored || 'ar'
  } catch { return 'ar' }
}

/** Set locale and apply immediately (no reload needed). */
export function setLocale(locale: Locale) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('rise-locale', locale)
    document.documentElement.lang = locale
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr'
    window.dispatchEvent(new Event('rise-locale-changed'))
  }
}

/**
 * Translation hook. Returns t() function + current locale.
 * Usage: const { t, locale } = useTranslation()
 *        t('dashboard.title') → "لوحة التحكم" or "Dashboard"
 */
// External store for locale (avoids setState-in-effect)
const localeStore = {
  subscribe(callback: () => void) {
    if (typeof window !== 'undefined') {
      window.addEventListener('rise-locale-changed', callback)
      return () => window.removeEventListener('rise-locale-changed', callback)
    }
    return () => {}
  },
  getSnapshot(): Locale {
    if (typeof window === 'undefined') return 'ar'
    try {
      return (localStorage.getItem('rise-locale') as Locale) || 'ar'
    } catch { return 'ar' }
  },
}

export function useTranslation() {
  const locale = useSyncExternalStore(localeStore.subscribe, localeStore.getSnapshot, () => 'ar' as Locale)

  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr'
  }, [locale])

  const t = useCallback((key: string): string => {
    const parts = key.split('.')
    let result: any = messages[locale]
    for (const part of parts) {
      result = result?.[part]
      if (result === undefined) return key
    }
    return typeof result === 'string' ? result : key
  }, [locale])

  const changeLocale = useCallback((l: Locale) => {
    setLocale(l)
  }, [])

  return { t, locale, setLocale: changeLocale }
}
