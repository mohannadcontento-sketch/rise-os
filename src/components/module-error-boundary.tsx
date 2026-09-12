'use client'

// ============================================================
// module-error-boundary.tsx — حاجز أخطاء الوحدات
//
// Class Boundary يغلّف كل وحدة تُحمَّل lazy في مُوجِّه الوحدات
// (src/app/app/page.tsx) — مثل Onboarding ووحدات MODULES —
// حتى لا يُسقط انهيار وحدة واحدة التطبيق كله؛ اسم الوحدة
// يُمرَّر عبر moduleName فيظهر في رسالة الخطأ وسجل console.
//
// البنية الداخلية:
//   1) getDerivedStateFromError / componentDidCatch — التقاط
//      الخطأ وتسجيله مع اسم الوحدة
//   2) handleRetry — تصفير الحالة فيُعاد عرض الأبناء
//   3) render — بطاقة زجاجية RTL: تنبيه + زر «إعادة المحاولة»
//
// مبادئ UX/تقنية: نص الرسالة عربي مع dir="rtl" صريح داخل
// بطاقة max-w-sm متمركزة؛ لا حالة إعادة محاولة كاملة — فقط
// إعادة عرض الأبناء (المؤثرات تعيد تشغيل نفسها).
// ============================================================

import { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
  moduleName?: string
}

interface State {
  hasError: boolean
}

export class ModuleErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error) {
    console.error(`[ModuleErrorBoundary] Error in ${this.props.moduleName || 'module'}:`, error)
  }

  handleRetry = () => {
    this.setState({ hasError: false })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center py-20" dir="rtl">
          <div className="glass rounded-2xl p-8 text-center max-w-sm mx-auto space-y-4 border border-white/10">
            <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-7 h-7 text-destructive" />
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-foreground">حدث خطأ في {this.props.moduleName || 'هذه الوحدة'}</h3>
              <p className="text-xs text-muted-foreground">جاري إعادة التحميل...</p>
            </div>
            <Button onClick={this.handleRetry} variant="outline" className="gap-2">
              <RefreshCw className="w-4 h-4" />
              إعادة المحاولة
            </Button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}