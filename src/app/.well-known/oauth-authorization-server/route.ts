import { NextResponse } from 'next/server'

/**
 * OAuth discovery endpoint for ChatGPT / OpenAI MCP integration.
 * Returns 404 so the client falls back to bearer token auth.
 */
export async function GET() {
  return new NextResponse(null, {
    status: 404,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  })
}