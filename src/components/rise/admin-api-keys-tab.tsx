'use client'

// ============================================================
// admin-api-keys-tab.tsx — تاب «مفاتيح API»
//
// إدارة مفاتيح rise_* الخاصة بالمستخدمين: إنشاء/تدوير/إبطال عبر
// /api/rise/admin/api-keys مع عرض مقنَّع للمفتاح مرة واحدة عند إنشائه.
// ============================================================

import { useState, useEffect, useCallback } from 'react'

import {
  Key,
  Search,
  Copy,
  Loader2,
  AlertTriangle,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { TableSkeleton } from './admin-shared'
import { apiFetch, apiDelete } from '@/lib/api-fetch'
import { toast } from 'sonner'
import { ApiKeyInfo, toArabicNum, formatDate, timeAgo } from './admin-panel-utils'

/* ═══════════════ API Keys Tab ═══════════════ */

export function ApiKeysTab() {
  const [keys, setKeys] = useState<ApiKeyInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [revokeKey, setRevokeKey] = useState<ApiKeyInfo | null>(null)
  const [revoking, setRevoking] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const loadKeys = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/api/rise/admin/api-keys')
      if (res.ok) {
        const data = await res.json()
        setKeys(data.keys || [])
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadKeys()
  }, [loadKeys])

  const handleRevoke = async () => {
    if (!revokeKey) return
    setRevoking(true)
    try {
      const res = await apiDelete(`/api/rise/admin/api-keys?id=${revokeKey.id}`)
      if (res.ok) {
        toast.success(`تم إلغاء مفتاح: ${revokeKey.name}`)
        setRevokeKey(null)
        loadKeys()
      } else {
        toast.error('فشل إلغاء المفتاح')
      }
    } catch {
      toast.error('فشل الاتصال')
    } finally {
      setRevoking(false)
    }
  }

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key).then(
      () => toast.success('تم النسخ'),
      () => toast.error('فشل النسخ')
    )
  }

  const filteredKeys = keys.filter((k) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      (k.userName || '').toLowerCase().includes(q) ||
      (k.userEmail || '').toLowerCase().includes(q) ||
      (k.name || '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="pill bg-gold/10 text-gold gap-1.5">
          <Key className="w-3 h-3" />
          <span className="num" dir="ltr">{toArabicNum(keys.length)}</span> مفتاح API
        </span>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="بحث بالمستخدم أو اسم المفتاح..."
          className="ps-9 h-10 text-sm bg-card border-border text-foreground"
          dir="rtl"
        />
      </div>

      {/* Keys Table */}
      {loading ? (
        <TableSkeleton />
      ) : filteredKeys.length === 0 ? (
        <div className="text-center py-16">
          <span className="icon-well mx-auto mb-3 h-14 w-14 bg-secondary text-muted-foreground/50">
            <Key className="w-6 h-6" />
          </span>
          <p className="text-sm text-muted-foreground">
            {searchQuery ? 'لا توجد نتائج' : 'لا توجد مفاتيح API'}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto max-h-[480px] overflow-y-auto custom-scrollbar">
            <Table>
              <TableHeader className="sticky top-0 bg-background/95 backdrop-blur-sm z-10">
                <TableRow>
                  <TableHead className="text-start ps-3">المفتاح</TableHead>
                  <TableHead className="text-start">المستخدم</TableHead>
                  <TableHead className="text-start hidden sm:table-cell">البريد</TableHead>
                  <TableHead className="text-start hidden md:table-cell">آخر استخدام</TableHead>
                  <TableHead className="text-center w-[80px]">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredKeys.map((key) => (
                  <TableRow key={key.id} className="group">
                    <TableCell className="ps-3">
                      <div>
                        <p className="text-sm font-medium">{key.name}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <code className="text-[10px] text-muted-foreground font-mono max-w-[120px] truncate" dir="ltr">
                            {key.keyPreview}...
                          </code>
                          <button
                            onClick={() => copyKey(key.keyPreview)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                            aria-label="نسخ المفتاح"
                          >
                            <Copy className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                          </button>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-start">
                      <p className="text-sm">{key.userName || '—'}</p>
                      <p className="text-[10px] text-muted-foreground">{formatDate(key.createdAt)}</p>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-muted-foreground" dir="ltr">
                      {key.userEmail || '—'}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                      {timeAgo(key.lastUsed)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive"
                        onClick={() => setRevokeKey(key)}
                        title="إلغاء المفتاح"
                        aria-label="إلغاء مفتاح API"
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Revoke Confirmation */}
      <AlertDialog open={!!revokeKey} onOpenChange={(open) => !open && setRevokeKey(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              إلغاء مفتاح API
            </AlertDialogTitle>
            <AlertDialogDescription>
              سيتم إلغاء هذا المفتاح ولن يعود صالحاً للاستخدام.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {revokeKey && (
            <div className="p-3 rounded-xl border border-border bg-card space-y-1">
              <p className="text-sm font-medium">{revokeKey.name}</p>
              <p className="text-xs text-muted-foreground">{revokeKey.userName} ({revokeKey.userEmail})</p>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleRevoke}
              disabled={revoking}
            >
              {revoking ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : null}
              إلغاء المفتاح
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
