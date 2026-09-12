'use client'

// ============================================================
// admin-users-tab.tsx — تاب «إدارة المستخدمين»
//
// جدول المستخدمين مع فرز عمودي، بحث، وتحرير مباشر (الاسم/البريد/
// الدور/التعليق) عبر PUT، وحذف عبر AlertDialog تأكيدي. بيانات الجدول
// تُدار هنا محلياً (نسخة عميقة + تحديث الصف المعدَّل فقط).
// ============================================================

import { useState, useEffect, useCallback } from 'react'

import {
  Users,
  Search,
  RefreshCw,
  Pencil,
  Trash2,
  Check,
  X,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Brain,
  HardDrive,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
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
import { TableSkeleton } from './admin-shared'
import { useRiseStore } from '@/store/app-store'
import { cn } from '@/lib/utils'
import { apiFetch, apiPost } from '@/lib/api-fetch'
import { toast } from 'sonner'
import { AdminUser, toArabicNum, formatBytes, formatDate, formatDateTime } from './admin-panel-utils'

/* ═══════════════ User Management Tab ═══════════════ */

export function UserManagementTab() {
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
    if (!auth?.isAuthenticated) return
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
  }, [auth?.isAuthenticated])

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

