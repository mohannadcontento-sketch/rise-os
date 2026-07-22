'use client'

import { Component, ReactNode } from 'react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <h2 className="text-lg font-semibold text-destructive mb-2">حدث خطأ غير متوقع</h2>
          <p className="text-sm text-muted-foreground mb-4">
            نعتذر عن هذا الخلل. يرجى محاولة تحديث الصفحة.
          </p>
          <Button onClick={() => window.location.reload()} variant="outline">
            إعادة تحميل الصفحة
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}