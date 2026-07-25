'use client'

import { useEffect } from 'react'
import { reportError } from '@/lib/error-monitoring'

// ============================================================
// P3#5: Performance monitoring — tracks Core Web Vitals
// ------------------------------------------------------------
// Tracks LCP (Largest Contentful Paint), FID (First Input Delay),
// CLS (Cumulative Layout Shift), and reports to /api/error-log.
// Helps identify mobile vs desktop performance issues.
// ============================================================

interface VitalMetric {
  name: string
  value: number
  rating: 'good' | 'needs-improvement' | 'poor'
  page: string
  device: 'mobile' | 'desktop'
}

function getRating(name: string, value: number): VitalMetric['rating'] {
  if (name === 'LCP') {
    if (value < 2500) return 'good'
    if (value < 4000) return 'needs-improvement'
    return 'poor'
  }
  if (name === 'FID' || name === 'INP') {
    if (value < 100) return 'good'
    if (value < 300) return 'needs-improvement'
    return 'poor'
  }
  if (name === 'CLS') {
    if (value < 0.1) return 'good'
    if (value < 0.25) return 'needs-improvement'
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

    // Track LCP
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries()
      const lastEntry = entries[entries.length - 1]
      if (lastEntry) {
        const metric: VitalMetric = {
          name: 'LCP',
          value: lastEntry.startTime,
          rating: getRating('LCP', lastEntry.startTime),
          page: window.location.pathname,
          device: getDevice(),
        }
        if (metric.rating !== 'good') {
          reportError(`Performance: ${metric.name}=${Math.round(metric.value)}ms (${metric.rating}, ${metric.device})`)
        }
      }
    })
    try { lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true }) } catch {}

    // Track CLS — only report if >0.25 (poor) and after page is fully loaded
    let clsValue = 0
    let clsReported = false
    const clsObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const layoutShift = entry as any
        if (!layoutShift.hadRecentInput) {
          clsValue += layoutShift.value
        }
      }
      // Only report once, after accumulation, and only if truly poor (>0.25)
      if (!clsReported && clsValue > 0.25 && document.readyState === 'complete') {
        clsReported = true
        const metric: VitalMetric = {
          name: 'CLS',
          value: clsValue,
          rating: getRating('CLS', clsValue),
          page: window.location.pathname,
          device: getDevice(),
        }
        if (metric.rating === 'poor') {
          reportError(`Performance: ${metric.name}=${clsValue.toFixed(3)} (${metric.rating}, ${metric.device})`)
        }
      }
    })
    try { clsObserver.observe({ type: 'layout-shift', buffered: true }) } catch {}

    // Track FID
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
      lcpObserver.disconnect()
      clsObserver.disconnect()
      fidObserver.disconnect()
    }
  }, [])

  return null // Invisible component — monitoring only
}
