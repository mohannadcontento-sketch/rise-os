import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// P2#8: Error logging endpoint (receives client-side errors)
const ErrorLogSchema = z.object({
  message: z.string().max(1000),
  stack: z.string().max(5000).optional(),
  context: z.record(z.string(), z.any()).optional(),
  url: z.string().max(500).optional(),
  timestamp: z.string().optional(),
}).strict()

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)

    // Telemetry must NEVER surface as a console network error —
    // accept anything, sanitize what we can use, always 200.
    const parsed = ErrorLogSchema.safeParse(body ?? {})
    if (parsed.success) {
      // Log to server console (Vercel captures this → viewable in dashboard)
      console.error('[Client Error]', JSON.stringify({
        message: parsed.data.message,
        url: parsed.data.url,
        timestamp: parsed.data.timestamp,
        context: parsed.data.context,
      }))
    } else {
      console.error('[Client Error] (unparsed payload)', typeof body === 'string' ? body.slice(0, 500) : 'non-json')
    }

    // In production with Sentry DSN, this would forward to Sentry
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[error-log] failed:', error)
    return NextResponse.json({ ok: true })
  }
}
