import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { data, setCurrentAuthToken } from '@/lib/data'

export const dynamic = 'force-dynamic'

// P1#5: Zod validation — prevents negative amounts, malicious URLs, arbitrary fields
const FinanceCreateSchema = z.object({
  type: z.enum(['income', 'expense', 'دخل', 'مصروف'], { message: 'النوع يجب أن يكون دخلاً أو مصروفاً' }),
  amount: z.number().positive('المبلغ يجب أن يكون موجباً').max(999999999, 'المبلغ كبير جداً'),
  category: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'التاريخ يجب أن يكون بصيغة YYYY-MM-DD'),
  recurring: z.boolean().optional(),
}).strict()  // Reject unknown fields

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req)
    if (!userId) return NextResponse.json({ records: [], summary: { income: 0, expense: 0, balance: 0 } })

    const records = await data.financeRecords.list(userId)
    return NextResponse.json({ records })
  } catch (error) {
    console.error('Finance GET error:', error)
    return NextResponse.json({ records: [], summary: { income: 0, expense: 0, balance: 0 } })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'جسم غير صالح' }, { status: 400 })

    // P1#5: Validate input
    const parsed = FinanceCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'بيانات غير صالحة' },
        { status: 400 }
      )
    }

    // Strip metadata fields that should never come from client
    const { id, createdAt, updatedAt, userId: _uid, ...dataFields } = body
    const record = await data.financeRecords.create(userId, parsed.data)
    return NextResponse.json(record)
  } catch (error) {
    console.error('Finance POST error:', error)
    return NextResponse.json({ error: 'Failed to create finance record' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    setCurrentAuthToken(req)
    if (!userId) return NextResponse.json({ error: 'مطلوب تسجيل الدخول' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 })

    await data.financeRecords.remove(id, userId)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Finance DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete finance record' }, { status: 500 })
  }
}
