'use client'

import { useState, useEffect } from 'react'
import { Zap, Download, Bluetooth, Wifi, WifiOff, Share2, CheckCircle2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { bluetoothShare, type BluetoothShareData } from '@/lib/bluetooth-share'

// Register service worker
export function registerServiceWorker() {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // SW registration failed - app still works without it
      })
    })
  }
}

// PWA Install Prompt
export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [showPrompt, setShowPrompt] = useState(false)

  const isInstalledStandalone = typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches
  const wasDismissedRecently = typeof window !== 'undefined' && (() => {
    const t = localStorage.getItem('rise-pwa-dismissed')
    return t ? (Date.now() - parseInt(t)) < 24 * 60 * 60 * 1000 : false
  })()

  useEffect(() => {
    if (isInstalledStandalone || wasDismissedRecently) return

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
      // Auto-show after 3 seconds
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
    if (outcome === 'accepted') {
      // App installed
    }
    setDeferredPrompt(null)
    setShowPrompt(false)
  }

  const handleDismiss = () => {
    setShowPrompt(false)
    localStorage.setItem('rise-pwa-dismissed', Date.now().toString())
  }

  if (isInstalledStandalone || wasDismissedRecently || !showPrompt) return null

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
              شغّل التطبيق بدون إنترنت واصله بالأجهزة الأخرى عبر البلوتوث
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

// Connection Status Indicator
export function ConnectionStatus() {
  const [isOnline, setIsOnline] = useState(() => typeof navigator !== 'undefined' ? navigator.onLine : true)

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

// Bluetooth Share Panel
export function BluetoothSharePanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [sharing, setSharing] = useState(false)
  const [receiving, setReceiving] = useState(false)
  const [lastShare, setLastShare] = useState<string | null>(null)
  const [receivedItems, setReceivedItems] = useState<BluetoothShareData[]>([])
  const [isSupported, setIsSupported] = useState(false)

  useEffect(() => {
    setIsSupported(bluetoothShare.isSupported())
    // Load received items from localStorage (simple approach)
    try {
      const stored = localStorage.getItem('rise-bt-shares')
      if (stored) setReceivedItems(JSON.parse(stored))
    } catch { /* ignore */ }
  }, [])

  const handleShare = async () => {
    setSharing(true)
    try {
      // Share current app state summary
      const shareData = {
        type: 'riseos-state',
        sender: 'RiseOS',
        timestamp: new Date().toISOString(),
        message: 'مشاركة من RiseOS',
      }
      await bluetoothShare.shareData(shareData, 'state')
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
      const data = await bluetoothShare.receiveData()
      if (data) {
        const newItems = [data, ...receivedItems]
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

        <div className="space-y-3">
          {/* Bluetooth Share */}
          <Button
            onClick={handleShare}
            disabled={sharing || !isSupported}
            variant="outline"
            className="w-full h-12 rounded-xl justify-start gap-3 text-right"
          >
            <Bluetooth className="w-5 h-5 text-blue-500 shrink-0" />
            <div className="flex-1 text-right">
              <p className="text-sm font-medium">إرسال عبر البلوتوث</p>
              <p className="text-[10px] text-muted-foreground">
                {isSupported ? 'أرسل بياناتك لجهاز قريب' : 'البلوتوث غير مدعوم في هذا المتصفح'}
              </p>
            </div>
            {sharing && <span className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />}
          </Button>

          {/* Bluetooth Receive */}
          <Button
            onClick={handleReceive}
            disabled={receiving || !isSupported}
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