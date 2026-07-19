'use client'

import { useState, useEffect, useCallback } from 'react'

import {
  Shield,
  ShieldCheck,
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
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
    return new Date(dateStr).toLocaleDateString('ar-SA', {
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
    return new Date(dateStr).toLocaleDateString('ar-SA', {
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
        <div key={i} className="p-4 rounded-xl bg-muted/30 border border-border/50">
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
      <ChevronDown className="w-3 h-3 text-emerald-accent" />
    ) : (
      <ChevronUp className="w-3 h-3 text-emerald-accent" />
    )
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="بحث بالاسم أو البريد..."
          className="pr-9 h-10 text-sm glass border-border/50"
          dir="rtl"
        />
      </div>

      {/* Summary badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="secondary" className="bg-emerald-accent/10 text-emerald-accent gap-1.5">
          <Users className="w-3 h-3" />
          {toArabicNum(users.length)} مستخدم
        </Badge>
        <Badge variant="secondary" className="bg-gold/10 text-gold gap-1.5">
          <Brain className="w-3 h-3" />
          {toArabicNum(users.reduce((a, u) => a + (u.aiUsed || 0), 0))} AI طلب
        </Badge>
        <Badge variant="secondary" className="bg-forest/10 text-forest gap-1.5">
          <HardDrive className="w-3 h-3" />
          {formatBytes(users.reduce((a, u) => a + (u.storageUsed || 0), 0))} تخزين
        </Badge>
      </div>

      {/* Users Table */}
      {loading ? (
        <TableSkeleton />
      ) : filteredUsers.length === 0 ? (
        <div className="text-center py-16">
          <Users className="w-12 h-12 mx-auto mb-3 text-muted-foreground/20" />
          <p className="text-sm text-muted-foreground">
            {searchQuery ? 'لا توجد نتائج' : 'لا يوجد مستخدمين بعد'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border/50 overflow-hidden glass">
          <div className="overflow-x-auto max-h-[480px] overflow-y-auto custom-scrollbar">
            <Table>
              <TableHeader className="sticky top-0 bg-background/95 backdrop-blur-sm z-10">
                <TableRow>
                  <TableHead className="text-right pr-3">المستخدم</TableHead>
                  <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort('name')}>
                    <span className="inline-flex items-center gap-1">الاسم <SortIcon field="name" /></span>
                  </TableHead>
                  <TableHead className="text-right hidden md:table-cell">المستوى</TableHead>
                  <TableHead className="text-right hidden lg:table-cell">الخبرة</TableHead>
                  <TableHead className="text-right hidden sm:table-cell cursor-pointer select-none" onClick={() => handleSort('aiUsed')}>
                    <span className="inline-flex items-center gap-1">AI <SortIcon field="aiUsed" /></span>
                  </TableHead>
                  <TableHead className="text-right hidden lg:table-cell cursor-pointer select-none" onClick={() => handleSort('storageUsed')}>
                    <span className="inline-flex items-center gap-1">التخزين <SortIcon field="storageUsed" /></span>
                  </TableHead>
                  <TableHead className="text-right hidden md:table-cell cursor-pointer select-none" onClick={() => handleSort('createdAt')}>
                    <span className="inline-flex items-center gap-1">الانضمام <SortIcon field="createdAt" /></span>
                  </TableHead>
                  <TableHead className="text-center w-[100px]">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow
                    key={user.id}
                    className="group hover:bg-emerald-accent/[0.03] cursor-pointer"
                    onClick={() => setSelectedUser(user)}
                  >
                    <TableCell className="pr-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-accent to-forest flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-white">
                          {String(user?.name || user?.email || '?').charAt(0).toUpperCase()}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium truncate max-w-[140px]">{user.name || 'مستخدم'}</p>
                          {user.isAdmin && (
                            <Badge className="bg-gold/20 text-gold text-[9px] px-1.5 py-0 shrink-0">
                              أدمن
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate max-w-[160px]">{user.email || '—'}</p>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge variant="outline" className="text-[11px] font-mono">
                        {toArabicNum(user.level || 1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground text-xs font-mono">
                      {toArabicNum(user.xp || 0)} XP
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <div className="text-xs">
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
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-accent to-forest flex items-center justify-center">
                <span className="text-sm font-bold text-white">
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
                <div className="p-3 rounded-xl bg-muted/30 text-center">
                  <p className="text-lg font-bold">{toArabicNum(selectedUser.level || 1)}</p>
                  <p className="text-[10px] text-muted-foreground">المستوى</p>
                </div>
                <div className="p-3 rounded-xl bg-muted/30 text-center">
                  <p className="text-lg font-bold">{toArabicNum(selectedUser.xp || 0)}</p>
                  <p className="text-[10px] text-muted-foreground">الخبرة</p>
                </div>
                <div className="p-3 rounded-xl bg-muted/30 text-center">
                  <p className="text-lg font-bold">{toArabicNum(selectedUser.streak || 0)}</p>
                  <p className="text-[10px] text-muted-foreground">السلسلة</p>
                </div>
                <div className="p-3 rounded-xl bg-muted/30 text-center">
                  <p className="text-lg font-bold">{selectedUser.aiUsed || 0} / {selectedUser.aiLimit || 100}</p>
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
                  <span>{formatBytes(selectedUser.storageUsed)} / {formatBytes(selectedUser.storageLimit)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">الصلاحية</span>
                  <Badge className={selectedUser.isAdmin ? 'bg-gold/20 text-gold' : 'bg-muted text-muted-foreground'}>
                    {selectedUser.isAdmin ? 'أدمن' : 'مستخدم'}
                  </Badge>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">إغلاق</Button>
            </DialogClose>
            <Button
              variant="outline"
              className="gap-1.5"
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
              <Pencil className="w-4 h-4 text-emerald-accent" />
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
            <Button variant="outline" onClick={() => setEditingUser(null)}>إلغاء</Button>
            <Button className="bg-emerald-accent hover:bg-emerald-accent/90 gap-1.5" onClick={saveEdit}>
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
            <div className="p-3 rounded-xl bg-muted/30 space-y-1">
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
        <BarChart3 className="w-12 h-12 mx-auto mb-3 text-muted-foreground/20" />
        <p className="text-sm text-muted-foreground">فشل تحميل الإحصائيات</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={loadStats}>
          <RefreshCw className="w-3.5 h-3.5 ml-1.5" />
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
          icon={<Flame className="w-5 h-5 text-orange-500" />}
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
          icon={<Target className="w-5 h-5 text-rose-500" />}
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
      <Card className="glass border-border/50 overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-accent" />
            نمو المستخدمين
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats.userGrowth && stats.userGrowth.length > 0 ? (
            <div className="flex items-end gap-1 h-40 pt-2">
              {stats.userGrowth.map((point, i) => (
                <div
                  key={i}
                  className="flex-1 flex flex-col items-center gap-1 group"
                >
                  <span className="text-[9px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity font-mono">
                    {point.count}
                  </span>
                  <div
                    className="w-full rounded-t-md bg-gradient-to-t from-emerald-accent to-emerald-accent/60 min-h-[4px] transition-all duration-500 group-hover:from-gold group-hover:to-gold/60"
                    style={{
                      height: `${Math.max((point.count / maxGrowthCount) * 120, 4)}px`,
                    }}
                  />
                  <span className="text-[8px] text-muted-foreground font-mono" dir="ltr">
                    {point.date.slice(5)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">لا توجد بيانات نمو</p>
          )}
        </CardContent>
      </Card>

      {/* Table Row Counts */}
      {stats.tableCounts && Object.keys(stats.tableCounts).length > 0 && (
        <Card className="glass border-border/50 overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Database className="w-4 h-4 text-forest" />
              عدد السجلات في الجداول
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {Object.entries(stats.tableCounts).map(([table, count]) => (
                <div
                  key={table}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border/30"
                >
                  <span className="text-xs text-muted-foreground truncate ml-2 font-mono" dir="ltr">{table}</span>
                  <Badge variant="secondary" className="text-[11px] font-mono shrink-0">{toArabicNum(count)}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Activity */}
      {stats.recentActivity && stats.recentActivity.length > 0 && (
        <Card className="glass border-border/50 overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="w-4 h-4 text-gold" />
              النشاط الأخير
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
              {stats.recentActivity.map((activity, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/20 hover:bg-muted/30 transition-colors"
                >
                  <div className="w-2 h-2 rounded-full bg-emerald-accent shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground truncate">{activity.action}</p>
                    <p className="text-[10px] text-muted-foreground">{activity.user}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(activity.time)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-center">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={loadStats}>
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
    <div className="p-4 rounded-xl bg-muted/30 border border-border/50 hover:border-emerald-accent/30 transition-colors">
      <div className="mb-2">{icon}</div>
      <p className="text-xl font-bold tracking-tight">{value}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-emerald-accent mt-0.5">{sub}</p>}
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
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={loadTableCounts}>
          <Database className="w-3 h-3" />
          عدد سجلات الجداول
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => {
            setQuery('SELECT * FROM "User" ORDER BY "createdAt" DESC LIMIT 10;')
          }}
        >
          <Users className="w-3 h-3" />
          آخر ١٠ مستخدمين
        </Button>
      </div>

      {/* Query Editor */}
      <Card className="glass border-border/50 overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Database className="w-4 h-4 text-forest" />
            محرر الاستعلامات
            <Badge variant="destructive" className="text-[9px] px-1.5 py-0">
              ⚡ استعلام مباشر
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="اكتب استعلام SQL هنا..."
            className="font-mono text-sm min-h-[120px] bg-background/50"
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
              className="gap-1.5 bg-emerald-accent hover:bg-emerald-accent/90"
              onClick={() => executeQuery(query)}
              disabled={loading || !query.trim()}
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              تنفيذ
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/5 border border-destructive/10 text-destructive text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="font-mono text-xs" dir="ltr">{error}</span>
        </div>
      )}

      {/* Results Table */}
      {results && (
        <Card className="glass border-border/50 overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Eye className="w-4 h-4 text-emerald-accent" />
              النتائج
              <Badge variant="secondary" className="text-[10px] font-mono">{toArabicNum(results.rows.length)} صف</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto max-h-96 overflow-y-auto custom-scrollbar rounded-lg border border-border/30">
              <Table>
                <TableHeader className="sticky top-0 bg-background/95 backdrop-blur-sm z-10">
                  <TableRow>
                    <TableHead className="text-right pr-3 w-[40px] text-xs">#</TableHead>
                    {results.columns.map((col) => (
                      <TableHead key={col} className="text-right text-xs font-mono" dir="ltr">{col}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.rows.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="pr-3 text-xs text-muted-foreground">{toArabicNum(i + 1)}</TableCell>
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
          </CardContent>
        </Card>
      )}

      {/* Query History */}
      {queryHistory.length > 0 && (
        <Card className="glass border-border/50 overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">سجل الاستعلامات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
              {queryHistory.map((q, i) => (
                <button
                  key={i}
                  onClick={() => setQuery(q)}
                  className="w-full text-right p-2 rounded-lg bg-muted/20 hover:bg-muted/30 transition-colors text-xs font-mono text-muted-foreground hover:text-foreground truncate"
                  dir="ltr"
                >
                  {q}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
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
        <Badge variant="secondary" className="bg-gold/10 text-gold gap-1.5">
          <Key className="w-3 h-3" />
          {toArabicNum(keys.length)} مفتاح API
        </Badge>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="بحث بالمستخدم أو اسم المفتاح..."
          className="pr-9 h-10 text-sm glass border-border/50"
          dir="rtl"
        />
      </div>

      {/* Keys Table */}
      {loading ? (
        <TableSkeleton />
      ) : filteredKeys.length === 0 ? (
        <div className="text-center py-16">
          <Key className="w-12 h-12 mx-auto mb-3 text-muted-foreground/20" />
          <p className="text-sm text-muted-foreground">
            {searchQuery ? 'لا توجد نتائج' : 'لا توجد مفاتيح API'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border/50 overflow-hidden glass">
          <div className="overflow-x-auto max-h-[480px] overflow-y-auto custom-scrollbar">
            <Table>
              <TableHeader className="sticky top-0 bg-background/95 backdrop-blur-sm z-10">
                <TableRow>
                  <TableHead className="text-right pr-3">المفتاح</TableHead>
                  <TableHead className="text-right">المستخدم</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">البريد</TableHead>
                  <TableHead className="text-right hidden md:table-cell">آخر استخدام</TableHead>
                  <TableHead className="text-right hidden lg:table-cell">الاستخدام</TableHead>
                  <TableHead className="text-center w-[80px]">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredKeys.map((key) => (
                  <TableRow key={key.id} className="group">
                    <TableCell className="pr-3">
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
                    <TableCell className="text-right">
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
                      <Badge variant="secondary" className="text-[11px] font-mono">
                        {toArabicNum(key.usageCount)}
                      </Badge>
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
            <div className="p-3 rounded-xl bg-muted/30 space-y-1">
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
              {revoking ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : null}
              إلغاء المفتاح
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/* ═══════════════ Main Admin Panel Component ═══════════════ */

export default function AdminPanel() {
  const { auth } = useRiseStore()

  // Non-admin users should never see this, but just in case
  if (!auth?.isAdmin) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <Shield className="w-12 h-12 mx-auto mb-3 text-muted-foreground/20" />
          <p className="text-sm text-muted-foreground">غير مصرح</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 animate-[fadeSlideIn_0.3s_ease-out]">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 rounded-xl glass border border-gold/20">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gold to-gold-light flex items-center justify-center shadow-lg shadow-gold/20">
          <ShieldCheck className="w-5 h-5 text-forest-dark" />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-bold flex items-center gap-2">
            لوحة الإدارة
            <Badge className="bg-gold/20 text-gold text-[10px] px-2 py-0">Admin</Badge>
          </h3>
          <p className="text-xs text-muted-foreground">إدارة النظام والمستخدمين والبيانات</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="users" className="w-full" dir="rtl">
        <TabsList className="w-full justify-start bg-muted/50 h-10 p-1 rounded-xl overflow-x-auto">
          <TabsTrigger value="users" className="gap-1.5 text-xs sm:text-sm data-[state=active]:bg-background">
            <Users className="w-3.5 h-3.5" />
            <span>المستخدمين</span>
          </TabsTrigger>
          <TabsTrigger value="stats" className="gap-1.5 text-xs sm:text-sm data-[state=active]:bg-background">
            <BarChart3 className="w-3.5 h-3.5" />
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

        <TabsContent value="users">
          <UserManagementTab />
        </TabsContent>
        <TabsContent value="stats">
          <SystemStatsTab />
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