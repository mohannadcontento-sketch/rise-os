'use client'

import { useState, useEffect, useCallback } from 'react'
import { Zap, Download, Bluetooth, Wifi, WifiOff, Share2, CheckCircle2, X, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getBluetoothShare, type BluetoothShareData } from '@/lib/bluetooth-share'

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

// ─── Bluetooth Share Panel (standalone only) ─────────────────────────────

export function BluetoothSharePanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [sharing, setSharing] = useState(false)
  const [receiving, setReceiving] = useState(false)
  const [lastShare, setLastShare] = useState<string | null>(null)
  const [receivedItems, setReceivedItems] = useState<BluetoothShareData[]>([])
  const [isSupported, setIsSupported] = useState(false)
  const standalone = useIsStandalone()

  useEffect(() => {
    if (!standalone) return
    try {
      const bt = getBluetoothShare()
      setIsSupported(bt.isSupported())
      const stored = localStorage.getItem('rise-bt-shares')
      if (stored) setReceivedItems(JSON.parse(stored))
    } catch { /* ignore */ }
  }, [standalone])

  const handleShare = async () => {
    setSharing(true)
    try {
      const bt = getBluetoothShare()
      const shareData = {
        type: 'riseos-state',
        sender: 'RiseOS',
        timestamp: new Date().toISOString(),
        message: 'مشاركة من RiseOS',
      }
      await bt.shareData(shareData, 'state')
      setLastShare('تمت المشاركة بنجاح')
    } catch (err: any) {
      setLastShare(err.message || 'فشلت المشاركة')
    } finally {
      setSharing(false)
    }
  }

  const handleReceive = async () => {
    setReceiving(true)
    try {
      const bt = getBluetoothShare()
      const data = await bt.receiveData()
      if (data) {
        const newItems = [data, ...receivedItems] as any
        setReceivedItems(newItems)
        localStorage.setItem('rise-bt-shares', JSON.stringify(newItems))
        setLastShare('تم استلام البيانات بنجاح')
      }
    } catch (err: any) {
      setLastShare(err.message || 'فشل الاستلام')
    } finally {
      setReceiving(false)
    }
  }

  const handleWebShare = async () => {
    try {
      await navigator.share({
        title: 'RiseOS',
        text: 'جرب RiseOS — نظام حياتك التشغيلي',
        url: window.location.href,
      })
    } catch {
      // User cancelled or share not supported
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md mx-4 mb-4 sm:mb-0 glass rounded-2xl p-5 shadow-2xl border border-white/10 dark:border-white/5">
        <button
          onClick={onClose}
          className="absolute top-3 left-3 p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <Bluetooth className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <h3 className="text-base font-bold">المشاركة بين الأجهزة</h3>
            <p className="text-xs text-muted-foreground">شارك البيانات أوفلاين عبر البلوتوث</p>
          </div>
        </div>

        {/* Not standalone notice */}
        {!standalone && (
          <div className="mb-4 p-3 rounded-xl bg-muted/50 text-xs text-muted-foreground text-center">
            <p>ميزة البلوتوث متاحة فقط عند تثبيت التطبيق</p>
            <Button
              onClick={() => {
                onClose()
                // Trigger install prompt if available
                window.dispatchEvent(new Event('beforeinstallprompt'))
              }}
              variant="outline"
              size="sm"
              className="mt-2 h-8 text-xs rounded-lg"
            >
              <Download className="w-3.5 h-3.5 ml-1.5" />
              ثبّت التطبيق أولاً
            </Button>
          </div>
        )}

        <div className="space-y-3">
          {/* Bluetooth Share */}
          <Button
            onClick={handleShare}
            disabled={sharing || !isSupported || !standalone}
            variant="outline"
            className="w-full h-12 rounded-xl justify-start gap-3 text-right"
          >
            <Bluetooth className="w-5 h-5 text-blue-500 shrink-0" />
            <div className="flex-1 text-right">
              <p className="text-sm font-medium">إرسال عبر البلوتوث</p>
              <p className="text-[10px] text-muted-foreground">
                {!standalone ? 'ثبّت التطبيق أولاً' : isSupported ? 'أرسل بياناتك لجهاز قريب' : 'البلوتوث غير مدعوم في هذا المتصفح'}
              </p>
            </div>
            {sharing && <span className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />}
          </Button>

          {/* Bluetooth Receive */}
          <Button
            onClick={handleReceive}
            disabled={receiving || !isSupported || !standalone}
            variant="outline"
            className="w-full h-12 rounded-xl justify-start gap-3 text-right"
          >
            <Download className="w-5 h-5 text-emerald-accent shrink-0" />
            <div className="flex-1 text-right">
              <p className="text-sm font-medium">استقبال عبر البلوتوث</p>
              <p className="text-[10px] text-muted-foreground">ابحث عن أجهزة RiseOS قريبة</p>
            </div>
            {receiving && <span className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />}
          </Button>

          {/* Web Share Fallback */}
          <Button
            onClick={handleWebShare}
            variant="outline"
            className="w-full h-12 rounded-xl justify-start gap-3 text-right"
          >
            <Share2 className="w-5 h-5 text-gold shrink-0" />
            <div className="flex-1 text-right">
              <p className="text-sm font-medium">مشاركة عادية</p>
              <p className="text-[10px] text-muted-foreground">شارك رابط التطبيق عبر التطبيقات الأخرى</p>
            </div>
          </Button>
        </div>

        {/* Status message */}
        {lastShare && (
          <div className={cn(
            'mt-4 flex items-center gap-2 px-3 py-2 rounded-xl text-xs',
            lastShare.includes('نجاح') || lastShare.includes('بنجاح')
              ? 'bg-emerald-accent/10 text-emerald-accent'
              : 'bg-destructive/10 text-destructive'
          )}>
            {lastShare.includes('نجاح') || lastShare.includes('بنجاح')
              ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              : <X className="w-3.5 h-3.5 shrink-0" />
            }
            {lastShare}
          </div>
        )}

        {/* Received items */}
        {receivedItems.length > 0 && (
          <div className="mt-4 border-t border-border/50 pt-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">آخر الاستلامات</p>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {receivedItems.slice(0, 5).map((item, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 text-xs">
                  <Bluetooth className="w-3 h-3 text-blue-500 shrink-0" />
                  <span className="flex-1 truncate">{item.type} — {item.sender}</span>
                  <span className="text-muted-foreground shrink-0">
                    {new Date(item.receivedAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
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