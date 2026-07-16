'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('RiseOS Error Boundary:', error)
  }, [error])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4" dir="rtl">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Animated icon */}
        <div className="relative inline-flex">
          <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center animate-[pulse_2s_ease-in-out_infinite]">
            <AlertTriangle className="w-10 h-10 text-destructive" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">حدث خطأ غير متوقع</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            عذراً، حدث خطأ أثناء تحميل هذه الصفحة.
            يمكنك إعادة المحاولة أو العودة للصفحة الرئيسية.
          </p>
        </div>

        {error.message && (
          <div className="bg-destructive/5 border border-destructive/10 rounded-xl p-4 text-right">
            <p className="text-xs font-mono text-destructive/80 break-all">{error.message}</p>
          </div>
        )}

        <div className="flex items-center justify-center gap-3">
          <Button
            onClick={reset}
            className="gap-2 bg-gradient-to-l from-emerald-accent to-forest hover:opacity-90"
          >
            <RefreshCw className="w-4 h-4" />
            إعادة المحاولة
          </Button>
          <Button
            variant="outline"
            onClick={() => window.location.href = '/'}
          >
            الصفحة الرئيسية
          </Button>
        </div>
      </div>
    </div>
  )
}