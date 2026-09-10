import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { data } from '@/lib/data'
import { withIdempotency } from '@/lib/idempotency'
import { parseBody, userNameSchema } from '@/lib/validators'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

  return withIdempotency(req, userId, async () => {
    const parsed = await parseBody(req, userNameSchema)
    if (!parsed.ok) return parsed.response!
    const { name } = parsed.data!
    const trimmed = name.trim()
    await data.profiles.update(userId, { name: trimmed })
    return NextResponse.json({ name: trimmed })
  
  })
  } catch (error) {
    console.error('[user/name] error:', error)
    return NextResponse.json({ error: 'Failed to update name' }, { status: 500 })
  }
}