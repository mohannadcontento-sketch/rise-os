'use client'

// Global client error capture — feeds /api/error-log → error_logs table →
// admin panel "الصحة والأخطاء" tab. Without this, client crashes were only
// visible in the user's own console (invisible to the site owner).
import { useEffect, useRef } from 'react'
import { reportError } from '@/lib/error-monitoring'

const THROTTLE_MS = 30_000

export function ErrorCapture() {
  const lastSeen = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    const shouldReport = (key: string): boolean => {
      const now = Date.now()
      const prev = lastSeen.current.get(key) || 0
      if (now - prev < THROTTLE_MS) return false
      lastSeen.current.set(key, now)
      // keep the throttle map bounded
      if (lastSeen.current.size > 100) {
        const oldest = [...lastSeen.current.entries()].sort((a, b) => a[1] - b[1]).slice(0, 50)
        oldest.forEach(([k]) => lastSeen.current.delete(k))
      }
      return true
    }

    const onError = (e: ErrorEvent) => {
      const msg = typeof e.message === 'string' ? e.message : String(e.message || 'window.error')
      if (!shouldReport(msg)) return
      reportError(e.error || msg, {
        type: 'window.error',
        filename: e.filename || undefined,
        lineno: e.lineno || undefined,
      })
    }

    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason
      const key = reason instanceof Error ? reason.message : String(reason ?? 'unhandledrejection')
      if (!shouldReport(key)) return
      reportError(reason instanceof Error ? reason : key, { type: 'unhandledrejection' })
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  return null
}
