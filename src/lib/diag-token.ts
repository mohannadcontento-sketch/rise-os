// TEMPORARY helper for diag-idem v4 — direct access to the request token context.
// REMOVE together with diag-idem after diagnosis.
import { enterRequestContext, getRequestAuthToken } from '@/lib/request-context'
import type { NextRequest } from 'next/server'

export function setCurrentAuthToken(tokenOrReq: string | undefined | NextRequest) {
  enterRequestContext(tokenOrReq)
}

export function getRequestAuthTokenDirect(): string | undefined {
  return getRequestAuthToken()
}
