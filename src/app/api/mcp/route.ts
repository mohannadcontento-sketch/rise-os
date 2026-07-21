import { NextRequest, NextResponse } from 'next/server'

// GET: Health check
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'RiseOS API is running',
    version: 'local',
  })
}

// POST: MCP is deprecated
export async function POST() {
  return NextResponse.json({
    status: 'deprecated',
    message: 'MCP is deprecated. Use the REST API instead.',
  })
}