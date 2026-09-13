import { NextRequest, NextResponse } from 'next/server'
import { getSystemConfig } from '@/lib/system-config'

export const dynamic = 'force-dynamic'

// ============================================================
// /api/rise/system/status — نقطة الحالة العامة (المرحلة 11)
//
// عرض غير سري لحالة النظام: وضع الصيانة + الرسالة + أعلام
// الميزات. يستخدمها تاب «النظام» في اللوحة، ويمكن لأي مونيتورينج
// خارجي (UptimeRobot/n8n/cron) قراءتها دون مصادقة — عمدًا لا
// نكشف هنا أي رقم أو معرف أو سر.
// تحت المظلة العامة /api/rise (حد 300/دقيقة لكل IP).
// ============================================================

export async function GET(_request: NextRequest) {
  try {
    const config = await getSystemConfig()
    return NextResponse.json({
      maintenance: config.maintenanceMode,
      message: config.maintenanceMode ? config.maintenanceMessage : null,
      flags: config.featureFlags,
      time: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[system/status] GET error:', error)
    return NextResponse.json(
      { maintenance: false, message: null, flags: {}, time: new Date().toISOString() },
      { status: 200 },
    )
  }
}
