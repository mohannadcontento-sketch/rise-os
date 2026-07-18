import { NextRequest, NextResponse } from 'next/server'

export async function POST(_request: NextRequest) {
  // No-op in local mode — email confirmation is not needed
  return NextResponse.json({ success: true })
}