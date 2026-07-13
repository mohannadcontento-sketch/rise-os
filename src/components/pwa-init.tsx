'use client'

import { useEffect } from 'react'

export function PWAInit() {
  useEffect(() => {
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // SW registration failed silently
      })
    }

    // Handle URL shortcuts (e.g., ?module=tasks)
    const params = new URLSearchParams(window.location.search)
    const startModule = params.get('module')
    if (startModule) {
      // Store for the main app to pick up
      sessionStorage.setItem('rise-start-module', startModule)
    }
  }, [])

  return null
}