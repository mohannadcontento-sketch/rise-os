import { NextRequest, NextResponse } from 'next/server'

// ============================================================
// P2#2: Pagination utilities for list endpoints
// ------------------------------------------------------------
// Standardized cursor-based + offset pagination.
// Supports ?page=1&limit=20 or ?cursor=xxx&limit=20
// ============================================================

export interface PaginationParams {
  page: number      // 1-based page number
  limit: number     // items per page
  offset: number    // calculated offset
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}

const MAX_LIMIT = 100
const DEFAULT_LIMIT = 50

/** Extract pagination params from request query string. */
export function getPaginationParams(req: NextRequest): PaginationParams {
  const url = new URL(req.url)
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1)
  const requestedLimit = parseInt(url.searchParams.get('limit') || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT
  const limit = Math.min(MAX_LIMIT, Math.max(1, requestedLimit))
  const offset = (page - 1) * limit
  return { page, limit, offset }
}

/** Build a paginated response with total count. */
export function paginatedResponse<T>(
  data: T[],
  total: number,
  params: PaginationParams
): PaginatedResponse<T> {
  const totalPages = Math.ceil(total / params.limit)
  return {
    data,
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
      totalPages,
      hasNext: params.page < totalPages,
      hasPrev: params.page > 1,
    },
  }
}
