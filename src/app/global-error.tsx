'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0, backgroundColor: 'var(--background)', color: 'var(--foreground)', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div style={{
          display: 'flex',
          minHeight: '100vh',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          textAlign: 'center',
        }}>
          <div style={{ maxWidth: '24rem', width: '100%' }}>
            <div style={{
              width: '5rem',
              height: '5rem',
              borderRadius: '50%',
              background: 'rgba(239,68,68,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.5rem',
              fontSize: '2.5rem',
            }}>
              &#9888;&#65039;
            </div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.75rem' }}>
              خطأ في التطبيق
            </h1>
            <p style={{ fontSize: '0.875rem', opacity: 0.6, marginBottom: '1.5rem', lineHeight: 1.6 }}>
              عذراً، حدث خطأ غير متوقع. يرجى إعادة تحميل الصفحة.
            </p>
            <button
              onClick={reset}
              style={{
                padding: '0.625rem 1.5rem',
                borderRadius: '0.5rem',
                border: 'none',
                background: '#059669',
                color: 'white',
                fontSize: '0.875rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              إعادة التحميل
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}