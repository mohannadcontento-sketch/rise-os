'use client'

import { useEffect } from 'react'
import { reportError } from '@/lib/error-monitoring'

// ============================================================
// P3#5: Performance monitoring — tracks FID only
// LCP/CLS disabled (lazy-loaded modules cause expected high values)
// ============================================================

interface VitalMetric {
  name: string
  value: number
  rating: 'good' | 'needs-improvement' | 'poor'
  page: string
  device: 'mobile' | 'desktop'
}

function getRating(name: string, value: number): VitalMetric['rating'] {
  if (name === 'FID' || name === 'INP') {
    if (value < 100) return 'good'
    if (value < 300) return 'needs-improvement'
    return 'poor'
  }
  return 'good'
}

function getDevice(): 'mobile' | 'desktop' {
  if (typeof window === 'undefined') return 'desktop'
  return window.innerWidth < 768 ? 'mobile' : 'desktop'
}

export function PerformanceMonitor() {
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Only track FID (First Input Delay) — actual user interaction delay
    const fidObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const metric: VitalMetric = {
          name: 'FID',
          value: (entry as any).processingStart - entry.startTime,
          rating: getRating('FID', (entry as any).processingStart - entry.startTime),
          page: window.location.pathname,
          device: getDevice(),
        }
        if (metric.rating !== 'good') {
          reportError(`Performance: ${metric.name}=${Math.round(metric.value)}ms (${metric.rating}, ${metric.device})`)
        }
      }
    })
    try { fidObserver.observe({ type: 'first-input', buffered: true }) } catch {}

    return () => {
      fidObserver.disconnect()
    }
  }, [])

  return null
}
