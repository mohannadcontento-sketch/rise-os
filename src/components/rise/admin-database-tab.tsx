'use client'

// ============================================================
// admin-database-tab.tsx — تاب «قاعدة البيانات» (ADMIN PRO)
//
// استعلام SQL مقيد بقائمة allowlist (لا تنفيذ حر) عبر
// /api/rise/admin/query، مع فحص جداول مُعدّ وزمن استجابة DB.
// تنبيه: كل استعلام يمر بالـ allowlist على السيرفر — الحماية هناك.
// ============================================================

import { useState } from 'react'

import {
  Database,
  Key,
  Eye,
  AlertTriangle,
  Loader2,
  Users,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
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
import { apiPost } from '@/lib/api-fetch'
import { toast } from 'sonner'
import { toArabicNum } from './admin-panel-utils'

/* ═══════════════ Database Operations Tab ═══════════════ */

export function DatabaseTab() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ columns: string[]; rows: Record<string, unknown>[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [queryHistory, setQueryHistory] = useState<string[]>([])
  const [confirmDialog, setConfirmDialog] = useState(false)
  const [pendingQuery, setPendingQuery] = useState('')

  const executeQuery = async (sql: string) => {
    if (!sql.trim()) return

    const isDangerous = /^(DROP|DELETE|TRUNCATE|ALTER|CREATE|INSERT|UPDATE)\s/i.test(sql.trim())

    if (isDangerous) {
      setPendingQuery(sql)
      setConfirmDialog(true)
      return
    }

    await runQuery(sql)
  }

  const runQuery = async (sql: string) => {
    setLoading(true)
    setError('')
    setResults(null)

    try {
      const legacyQueryMap: Record<string, string> = {
        'SELECT tablename AS "الجدول", n_live_tup AS "عدد السجلات" FROM pg_stat_user_tables ORDER BY n_live_tup DESC;': 'table_counts',
        'SELECT * FROM "User" ORDER BY "createdAt" DESC LIMIT 10;': 'recent_users',
      }
      const normalized = sql.trim() + (sql.trim().endsWith(';') ? '' : ';')
      const queryId = legacyQueryMap[normalized]
      if (!queryId) {
        setError('لأسباب أمنية، محرر SQL الحر مغلق. استخدم أحد الاستعلامات الإدارية الجاهزة.')
        return
      }
      const res = await apiPost('/api/rise/admin/query', { queryId, limit: 100 })
      const data = await res.json()

      if (data.error) {
        setError(data.error)
      } else if (data.columns && data.rows) {
        setResults({ columns: data.columns, rows: data.rows })
        setQueryHistory((prev) => [sql, ...prev.slice(0, 19)])
        toast.success(`تم تنفيذ الاستعلام (${toArabicNum(data.rows.length)} صف)`)
      } else if (data.affectedRows !== undefined) {
        setResults({
          columns: ['النتيجة'],
          rows: [{ 'النتيجة': `${data.affectedRows} صف متأثر` }],
        })
        setQueryHistory((prev) => [sql, ...prev.slice(0, 19)])
        toast.success(`تم تنفيذ الاستعلام (${toArabicNum(data.affectedRows)} صف متأثر)`)
      }
    } catch {
      setError('فشل الاتصال بالخادم')
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmExecute = () => {
    setConfirmDialog(false)
    runQuery(pendingQuery)
  }

  const loadTableCounts = async () => {
    setQuery('SELECT tablename AS "الجدول", n_live_tup AS "عدد السجلات" FROM pg_stat_user_tables ORDER BY n_live_tup DESC;')
    executeQuery('SELECT tablename AS "الجدول", n_live_tup AS "عدد السجلات" FROM pg_stat_user_tables ORDER BY n_live_tup DESC;')
  }

  return (
    <div className="space-y-4">
      {/* Quick actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" className="gap-1.5 text-xs border-border bg-card hover:bg-secondary" onClick={loadTableCounts}>
          <Database className="w-3 h-3" />
          عدد سجلات الجداول
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs border-border bg-card hover:bg-secondary"
          onClick={() => {
            setQuery('SELECT * FROM "User" ORDER BY "createdAt" DESC LIMIT 10;')
          }}
        >
          <Users className="w-3 h-3" />
          آخر ١٠ مستخدمين
        </Button>
      </div>

      {/* Query Editor */}
      <div className="neo-card card-lift overflow-hidden">
        <div className="p-5 pb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Database className="w-4 h-4 text-forest" />
            قراءات قاعدة البيانات
            <span className="pill bg-forest/10 text-forest text-[9px]">
              🔒 Allowlist آمن
            </span>
          </h3>
        </div>
        <div className="px-5 pb-5 space-y-3">
          <Textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="اختر استعلامًا جاهزًا من الأزرار بالأعلى..."
            className="font-mono text-sm min-h-[120px] bg-surface-2 border-border text-foreground"
            dir="ltr"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault()
                executeQuery(query)
              }
            }}
          />
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground">
              القراءات الإدارية الجاهزة فقط — لا يتم تنفيذ SQL حر على السيرفر
            </p>
            <Button
              size="sm"
              className="gap-1.5 bg-forest text-paper-soft hover:bg-forest/90 dark:bg-lime dark:text-ink dark:hover:bg-lime/90"
              onClick={() => executeQuery(query)}
              disabled={loading || !query.trim()}
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              تنفيذ
            </Button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/5 border border-destructive/10 text-destructive text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="font-mono text-xs" dir="ltr">{error}</span>
        </div>
      )}

      {/* Results Table */}
      {results && (
        <div className="neo-card card-lift overflow-hidden">
          <div className="p-5 pb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Eye className="w-4 h-4 text-rose-accent" />
              النتائج
              <span className="pill pill-muted text-[10px]" dir="ltr">
                <span className="num">{toArabicNum(results.rows.length)}</span> صف
              </span>
            </h3>
          </div>
          <div className="px-5 pb-5">
            <div className="overflow-x-auto max-h-96 overflow-y-auto custom-scrollbar rounded-lg border border-border/30">
              <Table>
                <TableHeader className="sticky top-0 bg-background/95 backdrop-blur-sm z-10">
                  <TableRow>
                    <TableHead className="text-start ps-3 w-[40px] text-xs">#</TableHead>
                    {results.columns.map((col) => (
                      <TableHead key={col} className="text-start text-xs font-mono" dir="ltr">{col}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.rows.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="ps-3 text-xs text-muted-foreground" dir="ltr">
                        <span className="num">{toArabicNum(i + 1)}</span>
                      </TableCell>
                      {results.columns.map((col) => (
                        <TableCell key={col} className="text-xs font-mono max-w-[200px] truncate" dir="ltr">
                          {row[col] === null ? (
                            <span className="text-muted-foreground/40 italic">NULL</span>
                          ) : typeof row[col] === 'object' ? (
                            JSON.stringify(row[col])
                          ) : (
                            String(row[col])
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}

      {/* Query History */}
      {queryHistory.length > 0 && (
        <div className="neo-card card-lift overflow-hidden">
          <div className="p-5 pb-3">
            <h3 className="text-sm font-semibold">سجل الاستعلامات</h3>
          </div>
          <div className="px-5 pb-5">
            <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
              {queryHistory.map((q, i) => (
                <button
                  key={i}
                  onClick={() => setQuery(q)}
                  className="w-full text-start p-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors text-xs font-mono text-muted-foreground hover:text-foreground truncate"
                  dir="ltr"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Confirm Dialog for Dangerous Queries */}
      <AlertDialog open={confirmDialog} onOpenChange={setConfirmDialog}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              استعلام خطير
            </AlertDialogTitle>
            <AlertDialogDescription>
              هذا الاستعلام قد يُعدّل أو يحذف بيانات. هل أنت متأكد؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="p-3 rounded-xl bg-destructive/5 border border-destructive/10">
            <p className="text-xs font-mono" dir="ltr">{pendingQuery}</p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 gap-1.5"
              onClick={handleConfirmExecute}
            >
              <Zap className="w-3.5 h-3.5" />
              تنفيذ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
