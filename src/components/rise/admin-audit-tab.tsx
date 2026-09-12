'use client'

// ============================================================
// admin-audit-tab.tsx — تاب «سجل الإدارة» (ADMIN PRO)
//
// آخر إجراءات الإدارة (من AdminAudit RPC) مع نوع الإجراء والتفاصيل
// والوقت — للمراجعة والمساءلة.
// ============================================================

import { useState, useEffect, useCallback } from 'react'

import { Shield, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { TableSkeleton } from './admin-shared'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/api-fetch'
import { toArabicNum, timeAgo } from './admin-panel-utils'

/* ═══════════════ Audit Tab (ADMIN PRO) ═══════════════ */

interface AuditEntryItem {
  id: string
  adminId: string
  adminName: string
  action: string
  detail: string
  createdAt: string
}

export function AuditTab() {
  const [entries, setEntries] = useState<AuditEntryItem[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/api/rise/admin/audit')
      if (res.ok) {
        const data = await res.json()
        setEntries(data.entries || [])
      }
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="neo-card p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold flex items-center gap-2">
          <Shield className="w-4 h-4 text-rose-accent" />
          سجل عمليات الإدارة
          {entries.length > 0 && <span className="pill pill-muted text-[10px]" dir="ltr">{toArabicNum(entries.length)}</span>}
        </p>
        <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={load} disabled={loading}>
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          تحديث
        </Button>
      </div>
      {loading && entries.length === 0 ? (
        <TableSkeleton />
      ) : entries.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-10">لا عمليات إدارة مسجلة بعد — كل إجراء (ترقية، إيقاف، حذف، إعلان) سيُسجل هنا تلقائياً.</p>
      ) : (
        <div className="max-h-96 overflow-y-auto rounded-xl border border-border">
          <Table>
            <TableHeader className="sticky top-0 bg-background/95 backdrop-blur-sm z-10">
              <TableRow>
                <TableHead className="text-start ps-3 w-[100px]">الوقت</TableHead>
                <TableHead className="text-start">العملية</TableHead>
                <TableHead className="text-start hidden md:table-cell">التفاصيل</TableHead>
                <TableHead className="text-start hidden lg:table-cell w-[110px]">بواسطة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map(e => (
                <TableRow key={e.id}>
                  <TableCell className="ps-3 text-[11px] text-muted-foreground whitespace-nowrap">{timeAgo(e.createdAt)}</TableCell>
                  <TableCell>
                    <span className="pill pill-muted text-[10px]">{e.action.replace('Admin: ', '')}</span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-[11px] text-muted-foreground truncate max-w-[220px]" dir="ltr">{e.detail || '—'}</TableCell>
                  <TableCell className="hidden lg:table-cell text-[11px] text-muted-foreground">{e.adminName}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
