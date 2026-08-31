import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// P2#8: Error logging endpoint (receives client-side errors).
// TASK 20: errors now PERSIST to the error_logs table (migration 011) so the
// admin panel "الصحة والأخطاء" tab can show real user-facing errors.
// Degradation: if the table doesn't exist yet or DB is down → console only,
// always 200 (telemetry must never surface as a network error to users).

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

    const parsed = ErrorLogSchema.safeParse(body ?? {})
    if (parsed.success) {
      const { message, stack, context, url, timestamp } = parsed.data
      // Log to server console (Vercel captures this → viewable in dashboard)
      console.error('[Client Error]', JSON.stringify({ message, url, timestamp, context }))

      // Persist to error_logs via service role (RLS denies direct client access)
      try {
        const admin = await getSupabaseAdmin()
        if (admin) {
          // Attach the caller's user id when we can (best-effort, non-blocking)
          let userId: string | null = null
          try {
            const { requireAuth } = await import('@/lib/auth')
            userId = (await requireAuth(req)) || null
          } catch { /* anonymous errors are fine */ }

          await (admin as any).from('error_logs').insert({
            user_id: userId,
            message,
            stack: stack || null,
            url: url || null,
            context: context ? JSON.stringify(context).slice(0, 4000) : null,
          })
        }
      } catch (dbErr: any) {
        // Table not migrated yet / DB down — console already has it
        const m = String(dbErr?.message || dbErr || '')
        if (!m.includes('does not exist') && !m.includes('schema cache')) {
          console.warn('[error-log] persist skipped:', m.slice(0, 200))
        }
      }
    } else {
      console.error('[Client Error] (unparsed payload)', typeof body === 'string' ? body.slice(0, 500) : 'non-json')
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[error-log] failed:', error)
    return NextResponse.json({ ok: true })
  }
}
