'use client'

import { useState, useEffect } from 'react'
import { Zap, Download, Wifi, WifiOff, X, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'


// ─── Standalone Detection ────────────────────────────────────────────────

/**
 * Returns true only when the app is running as an installed PWA.
 * In browser mode, returns false.
 */
export function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true
}

/**
 * Hook that returns whether the app is in standalone (PWA) mode.
 */
export function useIsStandalone() {
  const [standalone, setStandalone] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true
  })

  useEffect(() => {
    const mq = window.matchMedia('(display-mode: standalone)')
    const handler = (e: MediaQueryListEvent) => setStandalone(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return standalone
}

// ─── PWA Install Prompt ─────────────────────────────────────────────────

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [showPrompt, setShowPrompt] = useState(false)

  const isInstalled = typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone)
  const wasDismissedRecently = typeof window !== 'undefined' && (() => {
    const t = localStorage.getItem('rise-pwa-dismissed')
    return t ? (Date.now() - parseInt(t)) < 24 * 60 * 60 * 1000 : false
  })()

  useEffect(() => {
    if (isInstalled || wasDismissedRecently) return

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setTimeout(() => setShowPrompt(true), 3000)
    }

    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', () => {
      setShowPrompt(false)
      setDeferredPrompt(null)
    })

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    setDeferredPrompt(null)
    setShowPrompt(false)
  }

  const handleDismiss = () => {
    setShowPrompt(false)
    localStorage.setItem('rise-pwa-dismissed', Date.now().toString())
  }

  if (isInstalled || wasDismissedRecently || !showPrompt) return null

  return (
    <div className="fixed bottom-20 right-4 left-4 sm:left-auto sm:w-80 z-50 animate-in slide-in-from-bottom-4">
      <div className="glass rounded-2xl p-4 shadow-2xl border border-white/10 dark:border-white/5">
        <button
          onClick={handleDismiss}
          className="absolute top-2 left-2 p-1 rounded-lg hover:bg-muted text-muted-foreground"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-accent to-forest flex items-center justify-center shadow-lg shrink-0">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-foreground">ثبّت RiseOS على جهازك</h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              ثبّت التطبيق عشان يشتغل بدون إنترنت ويتزامن مع السحابة
            </p>
            <Button
              onClick={handleInstall}
              size="sm"
              className="mt-3 h-9 rounded-xl text-xs bg-gradient-to-r from-emerald-accent to-forest text-white w-full"
            >
              <Download className="w-3.5 h-3.5 ml-1.5" />
              تثبيت التطبيق
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Connection Status Indicator ────────────────────────────────────────

export function ConnectionStatus() {
  const [isOnline, setIsOnline] = useState(() => typeof navigator !== 'undefined' ? navigator.onLine : true)
  const standalone = useIsStandalone()

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Don't show in browser mode — not relevant
  if (!standalone) return null

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-medium transition-all',
        isOnline
          ? 'bg-emerald-accent/10 text-emerald-accent'
          : 'bg-orange-500/10 text-orange-500'
      )}
    >
      {isOnline ? (
        <>
          <Wifi className="w-3 h-3" />
          <span className="hidden sm:inline">متصل</span>
        </>
      ) : (
        <>
          <WifiOff className="w-3 h-3" />
          <span className="hidden sm:inline">غير متصل</span>
        </>
      )}
    </div>
  )
}

// ─── Offline Banner (standalone only) ────────────────────────────────────

export function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(() => typeof navigator !== 'undefined' ? navigator.onLine : true)
  const standalone = useIsStandalone()

  useEffect(() => {
    const goOnline = () => setIsOnline(true)
    const goOffline = () => setIsOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  if (standalone && !isOnline) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[60] bg-orange-500 text-white text-center py-2 text-xs font-medium flex items-center justify-center gap-2">
        <WifiOff className="w-3.5 h-3.5" />
        <span>غير متصل بالإنترنت — البيانات محفوظة محلياً</span>
        <button
          onClick={() => window.location.reload()}
          className="mr-2 p-1 rounded hover:bg-white/20"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>
    )
  }

  return null
}