'use client'

import { useState, useEffect, useCallback } from 'react'

import {
  Shield,
  Users,
  Database,
  Key,
  BarChart3,
  Search,
  RefreshCw,
  Pencil,
  Trash2,
  Check,
  X,
  Eye,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Copy,
  Loader2,
  Activity,
  HardDrive,
  Brain,
  Target,
  BookOpen,
  Flame,
  CalendarDays,
  TrendingUp,
  Zap,
  CheckSquare,
  Megaphone,
  UserPlus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { useRiseStore } from '@/store/app-store'
import { RiseIcon } from './icons'
import { cn } from '@/lib/utils'
import { apiFetch, apiPost, apiDelete } from '@/lib/api-fetch'
import { toast } from 'sonner'

/* ═══════════════ Types ═══════════════ */

interface AdminUser {
  id: string
  email: string | null
  name: string
  createdAt: string
  isAdmin: boolean
  storageUsed: number
  storageLimit: number
  aiLimit: number
  aiUsed: number
  level?: number
  xp?: number
  streak?: number
  lastActive?: string
}

interface SystemStats {
  totalUsers: number
  activeUsers7d: number
  totalTasks: number
  totalHabits: number
  totalJournals: number
  totalGoals: number
  totalStorageUsed: number
  totalAiUsed: number
  userGrowth: { date: string; count: number }[]
  tableCounts: Record<string, number>
  recentActivity: { time: string; action: string; user: string }[]
}

interface ApiKeyInfo {
  id: string
  name: string
  userId: string
  userName: string
  userEmail: string
  keyPreview: string
  createdAt: string
  lastUsed: string | null
  usageCount: number
}

/* ═══════════════ Helpers ═══════════════ */

function toArabicNum(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '٠'
  return n.toString().replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[parseInt(d)])
}

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return '—'
  }
}

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'الآن'
  if (mins < 60) return `منذ ${toArabicNum(mins)} دقيقة`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `منذ ${toArabicNum(hours)} ساعة`
  const days = Math.floor(hours / 24)
  return `منذ ${toArabicNum(days)} يوم`
}

function timeAgoEn(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

/* ═══════════════ Loading Skeletons ═══════════════ */

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="neo-card p-4">
          <Skeleton className="h-5 w-5 mb-2 rounded" />
          <Skeleton className="h-7 w-16 mb-1" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  )
}

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  )
}

/* ═══════════════ User Management Tab ═══════════════ */

function UserManagementTab() {
  const { auth } = useRiseStore()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)
  const [editingUser, setEditingUser] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editLevel, setEditLevel] = useState('')
  const [editXp, setEditXp] = useState('')
  const [editStorageLimit, setEditStorageLimit] = useState('')
  const [editAiLimit, setEditAiLimit] = useState('')
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<AdminUser | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [sortField, setSortField] = useState<'name' | 'createdAt' | 'aiUsed' | 'storageUsed'>('createdAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const loadUsers = useCallback(async (showLoading = true) => {
    if (!auth?.accessToken) return
    if (showLoading) setLoading(true)
    try {
      const res = await apiFetch('/api/rise/admin/users')
      if (res.ok) {
        const data = await res.json()
        if (data.users) setUsers(data.users)
      } else {
        toast.error('فشل في تحميل المستخدمين')
      }
    } catch {
      toast.error('فشل الاتصال بالخادم')
    } finally {
      setLoading(false)
    }
  }, [auth?.accessToken])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const filteredUsers = users
    .filter((u) => {
      if (!searchQuery) return true
      const q = searchQuery.toLowerCase()
      return (
        (u.email || '').toLowerCase().includes(q) ||
        (u.name || '').toLowerCase().includes(q)
      )
    })
    .sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'name':
          cmp = (a.name || '').localeCompare(b.name || '')
          break
        case 'createdAt':
          cmp = (a.createdAt || '').localeCompare(b.createdAt || '')
          break
        case 'aiUsed':
          cmp = (a.aiUsed || 0) - (b.aiUsed || 0)
          break
        case 'storageUsed':
          cmp = (a.storageUsed || 0) - (b.storageUsed || 0)
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

  const startEdit = (user: AdminUser) => {
    setEditingUser(user.id)
    setEditName(user.name || '')
    setEditLevel(String(user.level || 1))
    setEditXp(String(user.xp || 0))
    setEditStorageLimit(String(Math.round((user.storageLimit || 10485760) / (1024 * 1024))))
    setEditAiLimit(String(user.aiLimit || 100))
  }

  const saveEdit = async () => {
    if (!editingUser) return
    try {
      const res = await apiPost('/api/rise/admin/users', {
        supabaseUserId: editingUser,
        storageLimit: parseInt(editStorageLimit) * 1024 * 1024,
        aiLimit: parseInt(editAiLimit),
      })
      if (res.ok) {
        toast.success('تم تحديث الصلاحيات')
        setEditingUser(null)
        loadUsers(false)
      } else {
        toast.error('فشل التحديث')
      }
    } catch {
      toast.error('فشل الاتصال')
    }
  }

  const confirmDelete = async () => {
    if (!deleteConfirmUser) return
    setDeleting(true)
    try {
      const res = await apiFetch('/api/rise/admin/users', {
        method: 'DELETE',
        body: JSON.stringify({ supabaseUserId: deleteConfirmUser.id }),
      })
      if (res.ok) {
        toast.success(`تم حذف: ${deleteConfirmUser.email}`)
        setDeleteConfirmUser(null)
        if (selectedUser?.id === deleteConfirmUser.id) setSelectedUser(null)
        loadUsers(false)
      } else {
        toast.error('فشل حذف المستخدم')
      }
    } catch {
      toast.error('فشل الاتصال')
    } finally {
      setDeleting(false)
    }
  }

  const SortIcon = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return <ChevronDown className="w-3 h-3 opacity-30" />
    return sortDir === 'desc' ? (
      <ChevronDown className="w-3 h-3 text-rose-accent" />
    ) : (
      <ChevronUp className="w-3 h-3 text-rose-accent" />
    )
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="بحث بالاسم أو البريد..."
          className="ps-9 h-10 text-sm bg-card border-border text-foreground"
          dir="rtl"
        />
      </div>

      {/* Summary badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="pill bg-rose-accent/10 text-rose-accent gap-1.5">
          <Users className="w-3 h-3" />
          <span className="num" dir="ltr">{toArabicNum(users.length)}</span> مستخدم
        </span>
        <span className="pill bg-gold/10 text-gold gap-1.5">
          <Brain className="w-3 h-3" />
          <span className="num" dir="ltr">{toArabicNum(users.reduce((a, u) => a + (u.aiUsed || 0), 0))}</span> AI طلب
        </span>
        <span className="pill bg-forest/10 text-forest gap-1.5">
          <HardDrive className="w-3 h-3" />
          <span className="num" dir="ltr">{formatBytes(users.reduce((a, u) => a + (u.storageUsed || 0), 0))}</span> تخزين
        </span>
      </div>

      {/* Users Table */}
      {loading ? (
        <TableSkeleton />
      ) : filteredUsers.length === 0 ? (
        <div className="text-center py-16">
          <span className="icon-well mx-auto mb-3 h-14 w-14 bg-secondary text-muted-foreground/50">
            <Users className="w-6 h-6" />
          </span>
          <p className="text-sm text-muted-foreground">
            {searchQuery ? 'لا توجد نتائج' : 'لا يوجد مستخدمين بعد'}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto max-h-[480px] overflow-y-auto custom-scrollbar">
            <Table>
              <TableHeader className="sticky top-0 bg-background/95 backdrop-blur-sm z-10">
                <TableRow>
                  <TableHead className="text-start ps-3">المستخدم</TableHead>
                  <TableHead className="text-start cursor-pointer select-none" onClick={() => handleSort('name')}>
                    <span className="inline-flex items-center gap-1">الاسم <SortIcon field="name" /></span>
                  </TableHead>
                  <TableHead className="text-start hidden md:table-cell">المستوى</TableHead>
                  <TableHead className="text-start hidden lg:table-cell">الخبرة</TableHead>
                  <TableHead className="text-start hidden sm:table-cell cursor-pointer select-none" onClick={() => handleSort('aiUsed')}>
                    <span className="inline-flex items-center gap-1">AI <SortIcon field="aiUsed" /></span>
                  </TableHead>
                  <TableHead className="text-start hidden lg:table-cell cursor-pointer select-none" onClick={() => handleSort('storageUsed')}>
                    <span className="inline-flex items-center gap-1">التخزين <SortIcon field="storageUsed" /></span>
                  </TableHead>
                  <TableHead className="text-start hidden md:table-cell cursor-pointer select-none" onClick={() => handleSort('createdAt')}>
                    <span className="inline-flex items-center gap-1">الانضمام <SortIcon field="createdAt" /></span>
                  </TableHead>
                  <TableHead className="text-center w-[100px]">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow
                    key={user.id}
                    className="group hover:bg-rose-accent/[0.04] cursor-pointer"
                    onClick={() => setSelectedUser(user)}
                  >
                    <TableCell className="ps-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-rose-accent to-forest flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-paper-soft">
                          {String(user?.name || user?.email || '?').charAt(0).toUpperCase()}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-start">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium truncate max-w-[140px]">{user.name || 'مستخدم'}</p>
                          {user.isAdmin && (
                            <span className="pill bg-gold/15 text-gold text-[9px] shrink-0">
                              أدمن
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate max-w-[160px]">{user.email || '—'}</p>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="pill pill-muted text-[11px]" dir="ltr">
                        <span className="num">{toArabicNum(user.level || 1)}</span>
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground text-xs">
                      <span className="num" dir="ltr">{toArabicNum(user.xp || 0)} XP</span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <div className="text-xs num" dir="ltr">
                        <span className="font-medium">{user.aiUsed || 0}</span>
                        <span className="text-muted-foreground"> / {user.aiLimit || 100}</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                      {formatBytes(user.storageUsed)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                      {formatDate(user.createdAt)}
                    </TableCell>
                    <TableCell className="text-center">
                      <div
                        className="inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => startEdit(user)}
                          title="تعديل"
                          aria-label="تعديل المستخدم"
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                        {!user.isAdmin && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 hover:text-destructive"
                            onClick={() => setDeleteConfirmUser(user)}
                            title="حذف"
                            aria-label="حذف المستخدم"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* User Detail Dialog */}
      <Dialog open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <DialogContent className="sm:max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-rose-accent to-forest flex items-center justify-center">
                <span className="text-sm font-bold text-paper-soft">
                  {String(selectedUser?.name || '?').charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <p>{selectedUser?.name || 'مستخدم'}</p>
                <p className="text-xs text-muted-foreground font-normal">{selectedUser?.email}</p>
              </div>
            </DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="neo-card p-3 text-center">
                  <p className="text-lg font-bold num" dir="ltr">{toArabicNum(selectedUser.level || 1)}</p>
                  <p className="text-[10px] text-muted-foreground">المستوى</p>
                </div>
                <div className="neo-card p-3 text-center">
                  <p className="text-lg font-bold num" dir="ltr">{toArabicNum(selectedUser.xp || 0)}</p>
                  <p className="text-[10px] text-muted-foreground">الخبرة</p>
                </div>
                <div className="neo-card p-3 text-center">
                  <p className="text-lg font-bold num" dir="ltr">{toArabicNum(selectedUser.streak || 0)}</p>
                  <p className="text-[10px] text-muted-foreground">السلسلة</p>
                </div>
                <div className="neo-card p-3 text-center">
                  <p className="text-lg font-bold num" dir="ltr">{selectedUser.aiUsed || 0} / {selectedUser.aiLimit || 100}</p>
                  <p className="text-[10px] text-muted-foreground">AI استخدام</p>
                </div>
              </div>
              <Separator />
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">المعرف</span>
                  <span className="font-mono text-[11px] max-w-[240px] truncate" dir="ltr">{selectedUser.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">تاريخ الانضمام</span>
                  <span>{formatDateTime(selectedUser.createdAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">التخزين</span>
                  <span className="num" dir="ltr">{formatBytes(selectedUser.storageUsed)} / {formatBytes(selectedUser.storageLimit)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">الصلاحية</span>
                  <span className={cn('pill', selectedUser.isAdmin ? 'bg-gold/15 text-gold' : 'pill-muted')}>
                    {selectedUser.isAdmin ? 'أدمن' : 'مستخدم'}
                  </span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" className="border-border bg-card hover:bg-secondary">إغلاق</Button>
            </DialogClose>
            <Button
              variant="outline"
              className="gap-1.5 border-border bg-card hover:bg-secondary"
              onClick={() => {
                if (selectedUser) {
                  setSelectedUser(null)
                  startEdit(selectedUser)
                }
              }}
            >
              <Pencil className="w-3.5 h-3.5" />
              تعديل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent className="sm:max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-4 h-4 text-rose-accent" />
              تعديل صلاحيات المستخدم
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">الاسم</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="text-sm"
                dir="rtl"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">المستوى</label>
                <Input
                  type="number"
                  value={editLevel}
                  onChange={(e) => setEditLevel(e.target.value)}
                  className="text-sm text-center"
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">XP</label>
                <Input
                  type="number"
                  value={editXp}
                  onChange={(e) => setEditXp(e.target.value)}
                  className="text-sm text-center"
                  dir="ltr"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">التخزين (MB)</label>
                <Input
                  type="number"
                  value={editStorageLimit}
                  onChange={(e) => setEditStorageLimit(e.target.value)}
                  className="text-sm text-center"
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">حد AI</label>
                <Input
                  type="number"
                  value={editAiLimit}
                  onChange={(e) => setEditAiLimit(e.target.value)}
                  className="text-sm text-center"
                  dir="ltr"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="border-border bg-card hover:bg-secondary" onClick={() => setEditingUser(null)}>إلغاء</Button>
            <Button
              className="gap-1.5 bg-forest text-paper-soft hover:bg-forest/90 dark:bg-lime dark:text-ink dark:hover:bg-lime/90"
              onClick={saveEdit}
            >
              <Check className="w-3.5 h-3.5" />
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirmUser} onOpenChange={(open) => !open && setDeleteConfirmUser(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              تأكيد حذف المستخدم
            </AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف هذا المستخدم؟ هذا الإجراء <span className="text-destructive font-semibold">لا يمكن التراجع عنه</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteConfirmUser && (
            <div className="p-3 rounded-xl border border-border bg-card space-y-1">
              <p className="text-sm font-medium">{deleteConfirmUser.name}</p>
              <p className="text-xs text-muted-foreground">{deleteConfirmUser.email}</p>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 gap-1.5"
              onClick={confirmDelete}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              حذف نهائياً
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/* ═══════════════ System Stats Tab ═══════════════ */

function SystemStatsTab() {
  const [stats, setStats] = useState<SystemStats | null>(null)
  const [loading, setLoading] = useState(true)

  const loadStats = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/api/rise/admin/stats')
      if (res.ok) {
        const data = await res.json()
        setStats(data)
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  if (loading) return <StatsSkeleton />

  if (!stats) {
    return (
      <div className="text-center py-16">
        <span className="icon-well mx-auto mb-3 h-14 w-14 bg-secondary text-muted-foreground/50">
          <BarChart3 className="w-6 h-6" />
        </span>
        <p className="text-sm text-muted-foreground">فشل تحميل الإحصائيات</p>
        <Button variant="outline" size="sm" className="mt-3 border-border bg-card hover:bg-secondary" onClick={loadStats}>
          <RefreshCw className="w-3.5 h-3.5 me-1.5" />
          إعادة المحاولة
        </Button>
      </div>
    )
  }

  const maxGrowthCount = Math.max(...(stats.userGrowth || []).map((g) => g.count), 1)

  return (
    <div className="space-y-6">
      {/* Top Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={<Users className="w-5 h-5 text-emerald-accent" />}
          value={toArabicNum(stats.totalUsers)}
          label="إجمالي المستخدمين"
          sub={toArabicNum(stats.activeUsers7d) + ' نشط'}
        />
        <StatCard
          icon={<CheckSquare className="w-5 h-5 text-gold" />}
          value={toArabicNum(stats.totalTasks)}
          label="المهام"
        />
        <StatCard
          icon={<Flame className="w-5 h-5 text-gold" />}
          value={toArabicNum(stats.totalHabits)}
          label="العادات"
        />
        <StatCard
          icon={<BookOpen className="w-5 h-5 text-forest" />}
          value={toArabicNum(stats.totalJournals)}
          label="اليوميات"
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={<Target className="w-5 h-5 text-rose-accent" />}
          value={toArabicNum(stats.totalGoals)}
          label="الأهداف"
        />
        <StatCard
          icon={<HardDrive className="w-5 h-5 text-forest" />}
          value={formatBytes(stats.totalStorageUsed)}
          label="إجمالي التخزين"
        />
        <StatCard
          icon={<Brain className="w-5 h-5 text-gold" />}
          value={toArabicNum(stats.totalAiUsed)}
          label="AI طلبات هذا الشهر"
        />
        <StatCard
          icon={<CalendarDays className="w-5 h-5 text-emerald-accent" />}
          value={toArabicNum(stats.activeUsers7d)}
          label="نشط (آخر ٧ أيام)"
          sub={`من ${toArabicNum(stats.totalUsers)}`}
        />
      </div>

      {/* User Growth Chart (div-based bar chart) */}
      <div className="neo-card card-lift overflow-hidden">
        <div className="p-5 pb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-rose-accent" />
            نمو المستخدمين
          </h3>
        </div>
        <div className="px-5 pb-5">
          {stats.userGrowth && stats.userGrowth.length > 0 ? (
            <div className="flex items-end gap-1 h-40 pt-2">
              {stats.userGrowth.map((point, i) => (
                <div
                  key={i}
                  className="flex-1 flex flex-col items-center gap-1 group"
                >
                  <span className="text-[9px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity num" dir="ltr">
                    {point.count}
                  </span>
                  <div
                    className="w-full rounded-t-md bg-gradient-to-t from-rose-accent to-rose-accent/60 min-h-[4px] transition-all duration-500 group-hover:from-gold group-hover:to-gold/60"
                    style={{
                      height: `${Math.max((point.count / maxGrowthCount) * 120, 4)}px`,
                    }}
                  />
                  <span className="text-[8px] text-muted-foreground num" dir="ltr">
                    {point.date.slice(5)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">لا توجد بيانات نمو</p>
          )}
        </div>
      </div>

      {/* Table Row Counts */}
      {stats.tableCounts && Object.keys(stats.tableCounts).length > 0 && (
        <div className="neo-card card-lift overflow-hidden">
          <div className="p-5 pb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Database className="w-4 h-4 text-forest" />
              عدد السجلات في الجداول
            </h3>
          </div>
          <div className="px-5 pb-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {Object.entries(stats.tableCounts).map(([table, count]) => (
                <div
                  key={table}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border/30"
                >
                  <span className="text-xs text-muted-foreground truncate me-2 font-mono" dir="ltr">{table}</span>
                  <span className="pill pill-muted text-[11px] shrink-0" dir="ltr">
                    <span className="num">{toArabicNum(count)}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Recent Activity */}
      {stats.recentActivity && stats.recentActivity.length > 0 && (
        <div className="neo-card card-lift overflow-hidden">
          <div className="p-5 pb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4 text-gold" />
              النشاط الأخير
            </h3>
          </div>
          <div className="px-5 pb-5">
            <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
              {stats.recentActivity.map((activity, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-2.5 rounded-xl bg-secondary/40 hover:bg-secondary transition-colors"
                >
                  <div className="w-2 h-2 rounded-full bg-rose-accent shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground truncate">{activity.action}</p>
                    <p className="text-[10px] text-muted-foreground">{activity.user}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(activity.time)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-center">
        <Button variant="outline" size="sm" className="gap-1.5 border-border bg-card hover:bg-secondary" onClick={loadStats}>
          <RefreshCw className="w-3.5 h-3.5" />
          تحديث الإحصائيات
        </Button>
      </div>
    </div>
  )
}

function StatCard({
  icon,
  value,
  label,
  sub,
}: {
  icon: React.ReactNode
  value: string
  label: string
  sub?: string
}) {
  return (
    <div className="neo-card card-lift p-4 hover:border-rose-accent/30 transition-colors">
      <div className="mb-2">{icon}</div>
      <p className="text-xl font-bold tracking-tight num" dir="ltr">{value}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-rose-accent mt-0.5">{sub}</p>}
    </div>
  )
}



/* ═══════════════ Database Operations Tab ═══════════════ */

function DatabaseTab() {
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
      const res = await apiPost('/api/rise/admin/query', { sql })
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
            محرر الاستعلامات
            <span className="pill bg-destructive/10 text-destructive text-[9px]">
              ⚡ استعلام مباشر
            </span>
          </h3>
        </div>
        <div className="px-5 pb-5 space-y-3">
          <Textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="اكتب استعلام SQL هنا..."
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
              <kbd className="px-1.5 py-0.5 rounded bg-muted text-[9px] font-mono">Ctrl+Enter</kbd> للتنفيذ
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

/* ═══════════════ API Keys Tab ═══════════════ */

function ApiKeysTab() {
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
                  <TableHead className="text-start hidden lg:table-cell">الاستخدام</TableHead>
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
                    <TableCell className="hidden lg:table-cell">
                      <span className="pill pill-muted text-[11px]" dir="ltr">
                        <span className="num">{toArabicNum(key.usageCount)}</span>
                      </span>
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

/* ═══════════════ Health & Errors Tab (Task 20) ═══════════════ */

interface SiteHealth {
  ok: boolean
  db: { ok: boolean; latencyMs: number | null; error: string | null }
  config: { supabase: boolean; serviceKey: boolean; adminEmail: boolean; sentry: boolean }
  errors24h: number
  errorLogsMissing: boolean
  totalUsers: number | null
  serverTime: string
  commit: string | null
  checkedInMs: number
}

interface AdminError {
  id: string
  userId: string | null
  message: string
  url: string | null
  createdAt: string
}

function HealthErrorsTab() {
  const [health, setHealth] = useState<SiteHealth | null>(null)
  const [errors, setErrors] = useState<AdminError[]>([])
  const [topMessages, setTopMessages] = useState<{ message: string; count: number }[]>([])
  const [tableMissing, setTableMissing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [clearing, setClearing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [hRes, eRes] = await Promise.all([
        apiFetch('/api/rise/admin/health'),
        apiFetch('/api/rise/admin/errors'),
      ])
      if (hRes.ok) setHealth(await hRes.json())
      if (eRes.ok) {
        const data = await eRes.json()
        setErrors(data.errors || [])
        setTopMessages(data.topMessages || [])
        setTableMissing(!!data.tableMissing)
      }
    } catch {
      // silent — cards show stale/empty state
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    // تحديث تلقائي كل 60 ثانية — صاحب الموقع يشوف الأخطاء لحظة وقوعها
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [load])

  const handleClear = async () => {
    setClearing(true)
    try {
      const res = await apiFetch('/api/rise/admin/errors', { method: 'DELETE' })
      if (res.ok) {
        setErrors([])
        setTopMessages([])
        toast.success('تم مسح سجل الأخطاء')
      } else {
        toast.error('فشل مسح السجل')
      }
    } catch {
      toast.error('فشل الاتصال')
    } finally {
      setClearing(false)
    }
  }

  const configItems = health ? [
    { label: 'Supabase', ok: health.config.supabase },
    { label: 'مفتاح الخدمة', ok: health.config.serviceKey },
    { label: 'بريد الأدمن', ok: health.config.adminEmail },
    { label: 'Sentry', ok: health.config.sentry },
  ] : []

  return (
    <div className="space-y-4">
      {/* ── بطاقات الصحة ── */}
      {loading && !health ? (
        <StatsSkeleton />
      ) : health ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="neo-card p-4">
            <Activity className={cn('w-5 h-5 mb-2', health.db.ok ? 'text-emerald-accent' : 'text-destructive')} />
            <p className="text-lg font-bold">{health.db.ok ? 'قاعدة البيانات تعمل' : 'مشكلة بالاتصال'}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {health.db.ok ? `زمن الاستجابة ${toArabicNum(health.db.latencyMs ?? 0)} م.ث` : (health.db.error || '—').slice(0, 60)}
            </p>
          </div>
          <div className="neo-card p-4">
            <AlertTriangle className={cn('w-5 h-5 mb-2', health.errors24h > 0 ? 'text-gold' : 'text-emerald-accent')} />
            <p className="text-lg font-bold">{toArabicNum(health.errors24h)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">خطأ في آخر ٢٤ ساعة</p>
          </div>
          <div className="neo-card p-4">
            <Users className="w-5 h-5 mb-2 text-forest" />
            <p className="text-lg font-bold">{toArabicNum(health.totalUsers ?? 0)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">إجمالي المستخدمين</p>
          </div>
          <div className="neo-card p-4">
            <Shield className="w-5 h-5 mb-2 text-muted-foreground" />
            <div className="flex flex-wrap gap-1.5 mt-1">
              {configItems.map((c) => (
                <span key={c.label} className={cn('pill text-[10px]', c.ok ? 'bg-emerald-accent/15 text-emerald-accent' : 'bg-destructive/15 text-destructive')}>
                  {c.ok ? '✓' : '✗'} {c.label}
                </span>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">حالة التهيئة {health.commit ? `· ${health.commit}` : ''}</p>
          </div>
        </div>
      ) : (
        <div className="neo-card p-6 text-center text-sm text-muted-foreground">فشل تحميل حالة الصحة</div>
      )}

      {/* ── الأكثر تكراراً ── */}
      {topMessages.length > 0 && (
        <div className="neo-card p-4">
          <p className="text-sm font-semibold mb-2 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-gold" />الأكثر تكراراً</p>
          <div className="space-y-1.5">
            {topMessages.map((t, i) => (
              <div key={i} className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate text-muted-foreground" dir="auto">{t.message}</span>
                <span className="pill pill-muted text-[10px] shrink-0" dir="ltr">{toArabicNum(t.count)}×</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── جدول الأخطاء ── */}
      <div className="neo-card p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-accent" />
            آخر الأخطاء
            {errors.length > 0 && <span className="pill pill-muted text-[10px]" dir="ltr">{toArabicNum(errors.length)}</span>}
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={load} disabled={loading}>
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
              تحديث
            </Button>
            <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs hover:text-destructive" onClick={handleClear} disabled={clearing || errors.length === 0}>
              {clearing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              مسح السجل
            </Button>
          </div>
        </div>

        {tableMissing && (
          <div className="mb-3 p-3 rounded-xl border border-gold/30 bg-gold/10 text-xs text-foreground">
            جدول error_logs غير مُنشأ بعد — شغّل ملف <code dir="ltr" className="font-mono">supabase/migrations/011_error_logs.sql</code> في SQL Editor بـ Supabase لتشغيل تتبع الأخطاء.
          </div>
        )}

        {loading && errors.length === 0 ? (
          <TableSkeleton />
        ) : errors.length === 0 ? (
          <div className="text-center py-10">
            <Check className="w-8 h-8 mx-auto mb-2 text-emerald-accent" />
            <p className="text-sm text-muted-foreground">لا أخطاء مسجلة — كل شيء سليم</p>
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto rounded-xl border border-border">
            <Table>
              <TableHeader className="sticky top-0 bg-background/95 backdrop-blur-sm z-10">
                <TableRow>
                  <TableHead className="text-start ps-3 w-[110px]">الوقت</TableHead>
                  <TableHead className="text-start">الخطأ</TableHead>
                  <TableHead className="text-start hidden md:table-cell w-[180px]">الصفحة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {errors.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="ps-3 text-[11px] text-muted-foreground whitespace-nowrap">
                      {timeAgo(e.createdAt)}
                    </TableCell>
                    <TableCell>
                      <p className="text-xs font-medium break-all" dir="auto">{e.message}</p>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-[11px] text-muted-foreground truncate max-w-[180px]" dir="ltr">
                      {e.url ? e.url.replace(/^https?:\/\/[^/]+/, '') || '/' : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}

/* ═══════════════ Overview Tab (ADMIN PRO) ═══════════════ */

interface OverviewData {
  kpis: {
    usersTotal: number
    usersActiveToday: number
    usersActive7d: number
    usersNew7d: number
    usersSuspended: number
    usersAdmins: number
    errors24h: number
    tasksTotal: number
    habitsTotal: number
    journalsTotal: number
    focusTotal: number
  }
  errors7d: { date: string; count: number }[]
  recentSignups: { id: string; name: string; email: string; createdAt: string; role: string; suspended: boolean }[]
  recentAudit: { id: string; adminId: string; action: string; detail: string; createdAt: string }[]
  dbLatencyMs: number
}

function KpiCard({ label, value, hint, tone = 'default', icon: Icon }: { label: string; value: number; hint?: string; tone?: 'default' | 'good' | 'warn' | 'bad'; icon: any }) {
  const toneCls = tone === 'good' ? 'text-emerald-accent' : tone === 'warn' ? 'text-gold' : tone === 'bad' ? 'text-destructive' : 'text-foreground'
  return (
    <div className="neo-card p-4">
      <Icon className={cn('w-4.5 h-4.5 mb-2', tone === 'good' ? 'text-emerald-accent' : tone === 'warn' ? 'text-gold' : tone === 'bad' ? 'text-destructive' : 'text-muted-foreground')} />
      <p className={cn('text-2xl font-black tabular-nums', toneCls)}>{toArabicNum(value)}</p>
      <p className="text-xs font-medium text-foreground mt-0.5">{label}</p>
      {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  )
}

function OverviewTab({ onBroadcast }: { onBroadcast: () => void }) {
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/api/rise/admin/overview')
      if (res.ok) setData(await res.json())
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 90_000)
    return () => clearInterval(t)
  }, [load])

  if (loading && !data) return <StatsSkeleton />
  if (!data) {
    return <div className="neo-card p-6 text-center text-sm text-muted-foreground">فشل تحميل النظرة العامة</div>
  }

  const k = data.kpis
  const maxErr = Math.max(1, ...data.errors7d.map(e => e.count))
  const engagement7d = k.usersTotal > 0 ? Math.round((k.usersActive7d / k.usersTotal) * 100) : 0

  return (
    <div className="space-y-4">
      {/* ── Quick actions ── */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" className="h-8 gap-1.5 text-xs bg-forest text-paper-soft hover:bg-forest/90 dark:bg-lime dark:text-ink" onClick={onBroadcast}>
          <Megaphone className="w-3.5 h-3.5" />
          إعلان لكل المستخدمين
        </Button>
        <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={load} disabled={loading}>
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          تحديث
        </Button>
        <span className="text-[10px] text-muted-foreground ms-auto">
          قاعدة البيانات {toArabicNum(data.dbLatencyMs)} م.ث · تحديث تلقائي كل ٩٠ ث
        </span>
      </div>

      {/* ── KPI grid ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={Users} label="إجمالي المستخدمين" value={k.usersTotal} hint={`${toArabicNum(k.usersAdmins)} أدمن · ${toArabicNum(k.usersSuspended)} موقوف`} />
        <KpiCard icon={Activity} label="نشِط اليوم" value={k.usersActiveToday} tone={k.usersActiveToday > 0 ? 'good' : 'default'} hint={`${toArabicNum(k.usersActive7d)} خلال ٧ أيام`} />
        <KpiCard icon={TrendingUp} label="تفاعل أسبوعي" value={engagement7d} hint="٪ من المستخدمين نشِطوا هذا الأسبوع" tone={engagement7d >= 40 ? 'good' : engagement7d >= 15 ? 'warn' : 'bad'} />
        <KpiCard icon={UserPlus} label="جديد هذا الأسبوع" value={k.usersNew7d} tone={k.usersNew7d > 0 ? 'good' : 'default'} />
      </div>

      {/* ── Content volume + errors ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="neo-card p-4">
          <p className="text-sm font-semibold mb-3 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-forest" />حجم المحتوى</p>
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              { label: 'مهام', v: k.tasksTotal }, { label: 'عادات', v: k.habitsTotal },
              { label: 'يوميات', v: k.journalsTotal }, { label: 'جلسات تركيز', v: k.focusTotal },
            ].map(x => (
              <div key={x.label}>
                <p className="text-lg font-bold tabular-nums">{toArabicNum(x.v)}</p>
                <p className="text-[10px] text-muted-foreground">{x.label}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="neo-card p-4">
          <p className="text-sm font-semibold mb-3 flex items-center gap-2">
            <AlertTriangle className={cn('w-4 h-4', k.errors24h > 0 ? 'text-gold' : 'text-emerald-accent')} />
            أخطاء آخر ٧ أيام
            <span className="pill pill-muted text-[10px] ms-auto" dir="ltr">{toArabicNum(k.errors24h)} / اليوم</span>
          </p>
          <div className="flex items-end gap-1.5 h-16" dir="ltr">
            {data.errors7d.map(e => (
              <div key={e.date} className="flex-1 flex flex-col items-center gap-1" title={`${e.date}: ${e.count}`}>
                <div
                  className={cn('w-full rounded-t-md transition-all', e.count > 0 ? 'bg-gold/70' : 'bg-primary/10')}
                  style={{ height: `${Math.max(6, (e.count / maxErr) * 100)}%` }}
                />
                <span className="text-[8px] text-muted-foreground">{e.date.slice(8)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Recent signups + audit ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="neo-card p-4">
          <p className="text-sm font-semibold mb-2 flex items-center gap-2"><UserPlus className="w-4 h-4 text-forest" />أحدث الانضمامات</p>
          {data.recentSignups.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3">لا انضمامات جديدة هذا الأسبوع</p>
          ) : (
            <div className="space-y-1.5">
              {data.recentSignups.map(s => (
                <div key={s.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-medium">{s.name}</span>
                  <span className="text-muted-foreground truncate max-w-[140px]" dir="ltr">{s.email}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(s.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="neo-card p-4">
          <p className="text-sm font-semibold mb-2 flex items-center gap-2"><Shield className="w-4 h-4 text-rose-accent" />آخر عمليات الإدارة</p>
          {data.recentAudit.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3">لا عمليات مسجلة بعد</p>
          ) : (
            <div className="space-y-1.5">
              {data.recentAudit.map(a => (
                <div key={a.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-medium">{a.action.replace('Admin: ', '')}</span>
                  <span className="text-[10px] text-muted-foreground truncate max-w-[160px]" dir="ltr">{a.detail}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(a.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════ Broadcast Dialog (ADMIN PRO) ═══════════════ */

function BroadcastDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  const send = async () => {
    if (!title.trim() || !body.trim()) return
    setSending(true)
    try {
      const res = await apiFetch('/api/rise/admin/broadcast', {
        method: 'POST',
        body: JSON.stringify({ title: title.trim(), body: body.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success(`تم إرسال الإعلان إلى ${toArabicNum(data.sent || 0)} مستخدم`)
        setTitle('')
        setBody('')
        onOpenChange(false)
      } else {
        toast.error(data?.error || 'فشل الإرسال')
      }
    } catch {
      toast.error('فشل الاتصال')
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Megaphone className="w-4 h-4 text-forest" />
            إعلان لكل المستخدمين
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-xs text-muted-foreground">سيصل كإشعار 📣 في جرس الإشعارات عند فتح كل مستخدم للتطبيق.</p>
          <Input placeholder="العنوان (مثال: صيانة مجدولة الليلة)" value={title} onChange={e => setTitle(e.target.value)} maxLength={120} className="text-sm" dir="rtl" />
          <textarea
            placeholder="نص الإعلان..."
            value={body}
            onChange={e => setBody(e.target.value)}
            maxLength={1000}
            rows={4}
            className="w-full rounded-xl neo-input text-sm p-3 min-h-[90px] resize-none bg-transparent"
            dir="rtl"
          />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button
            onClick={send}
            disabled={sending || !title.trim() || !body.trim()}
            className="gap-1.5 bg-forest text-paper-soft hover:bg-forest/90 dark:bg-lime dark:text-ink"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Megaphone className="w-4 h-4" />}
            إرسال
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ═══════════════ Audit Tab (ADMIN PRO) ═══════════════ */

interface AuditEntryItem {
  id: string
  adminId: string
  adminName: string
  action: string
  detail: string
  createdAt: string
}

function AuditTab() {
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

/* ═══════════════ Main Admin Panel Component ═══════════════ */

export default function AdminPanel() {
  const { auth } = useRiseStore()
  const [broadcastOpen, setBroadcastOpen] = useState(false)

  // Non-admin users should never see this, but just in case
  if (!auth?.isAdmin) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <span className="icon-well mx-auto mb-3 h-14 w-14 bg-secondary text-muted-foreground/50">
            <Shield className="w-6 h-6" />
          </span>
          <p className="text-sm text-muted-foreground">غير مصرح</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 animate-[fadeSlideIn_0.3s_ease-out]">
      {/* Header */}
      <div className="flex items-center gap-3 neo-card card-lift p-4">
        <RiseIcon glyph="shield" hue="rose" size="md" lift />
        <div className="flex-1">
          <h3 className="text-base font-bold flex items-center gap-2">
            لوحة الإدارة
            <span className="pill bg-rose-accent/15 text-rose-accent text-[10px]">Admin Pro</span>
          </h3>
          <p className="text-xs text-muted-foreground">قيادة الموقع: المستخدمين، الصحة، الأخطاء، الإعلانات والتدقيق</p>
        </div>
      </div>

      {/* Broadcast Dialog */}
      <BroadcastDialog open={broadcastOpen} onOpenChange={setBroadcastOpen} />

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full" dir="rtl">
        <TabsList className="w-full justify-start bg-muted/50 h-10 p-1 rounded-xl overflow-x-auto">
          <TabsTrigger value="overview" className="gap-1.5 text-xs sm:text-sm data-[state=active]:bg-background">
            <BarChart3 className="w-3.5 h-3.5" />
            <span>نظرة عامة</span>
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-1.5 text-xs sm:text-sm data-[state=active]:bg-background">
            <Users className="w-3.5 h-3.5" />
            <span>المستخدمين</span>
          </TabsTrigger>
          <TabsTrigger value="health" className="gap-1.5 text-xs sm:text-sm data-[state=active]:bg-background">
            <Activity className="w-3.5 h-3.5" />
            <span>الصحة والأخطاء</span>
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5 text-xs sm:text-sm data-[state=active]:bg-background">
            <Shield className="w-3.5 h-3.5" />
            <span>سجل العمليات</span>
          </TabsTrigger>
          <TabsTrigger value="stats" className="gap-1.5 text-xs sm:text-sm data-[state=active]:bg-background">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>الإحصائيات</span>
          </TabsTrigger>
          <TabsTrigger value="database" className="gap-1.5 text-xs sm:text-sm data-[state=active]:bg-background">
            <Database className="w-3.5 h-3.5" />
            <span>قاعدة البيانات</span>
          </TabsTrigger>
          <TabsTrigger value="api-keys" className="gap-1.5 text-xs sm:text-sm data-[state=active]:bg-background">
            <Key className="w-3.5 h-3.5" />
            <span>مفاتيح API</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab onBroadcast={() => setBroadcastOpen(true)} />
        </TabsContent>
        <TabsContent value="users">
          <UserManagementTab />
        </TabsContent>
        <TabsContent value="stats">
          <SystemStatsTab />
        </TabsContent>
        <TabsContent value="health">
          <HealthErrorsTab />
        </TabsContent>
        <TabsContent value="audit">
          <AuditTab />
        </TabsContent>
        <TabsContent value="database">
          <DatabaseTab />
        </TabsContent>
        <TabsContent value="api-keys">
          <ApiKeysTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}