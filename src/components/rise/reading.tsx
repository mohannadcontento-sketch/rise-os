'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BookOpen,
  Plus,
  Star,
  ChevronDown,
  ChevronUp,
  BookmarkCheck,
  Library,
  Search,
  FileText,
  Video,
  GraduationCap,
  Quote,
  Highlighter,
  StickyNote,
  TrendingUp,
  Flame,
  X,
  Calendar,
  BookMarked,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { apiFetch, apiPost, apiPut, signalDataChanged } from '@/lib/api-fetch'
import { useDataRefresh } from '@/hooks/use-data-refresh'
import { playSound } from '@/lib/sounds'
import { toast } from 'sonner'

/* ────────────── Types ────────────── */

interface Book {
  id: string
  title: string
  author: string | null
  type: string
  status: string
  currentPage: number
  totalPages: number | null
  progress: number
  rating: number | null
  favoriteQuote: string | null
  highlights: string | null
  startDate: string | null
  endDate: string | null
  notes: string | null
}

/* ────────────── Helpers ────────────── */

const typeLabels: Record<string, string> = {
  book: 'كتاب',
  article: 'مقال',
  course: 'دورة',
  video: 'فيديو',
}

const typeIcons: Record<string, React.ElementType> = {
  book: BookOpen,
  article: FileText,
  course: GraduationCap,
  video: Video,
}

const typeColors: Record<string, string> = {
  book: 'bg-emerald-accent/10 text-emerald-accent',
  article: 'bg-gold/10 text-gold',
  course: 'bg-blue-500/10 text-blue-500',
  video: 'bg-purple-500/10 text-purple-500',
}

const typeBorderColors: Record<string, string> = {
  book: 'border-r-emerald-accent',
  article: 'border-r-gold',
  course: 'border-r-blue-500',
  video: 'border-r-purple-500',
}

function arabicNum(n: number): string {
  const digits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩']
  return String(n).replace(/[0-9]/g, (d) => digits[parseInt(d)])
}

function StarRating({ rating, onRate, readonly = false }: { rating: number; onRate?: (r: number) => void; readonly?: boolean }) {
  const [hovered, setHovered] = useState(0)

  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <motion.button
          key={s}
          type="button"
          disabled={readonly}
          onClick={() => onRate?.(s)}
          onMouseEnter={() => !readonly && setHovered(s)}
          onMouseLeave={() => !readonly && setHovered(0)}
          whileHover={!readonly ? { scale: 1.2 } : {}}
          whileTap={!readonly ? { scale: 0.9 } : {}}
          className={cn('transition-all', !readonly && 'cursor-pointer', readonly && 'cursor-default')}
        >
          <Star
            className={cn(
              'w-4 h-4 transition-colors',
              s <= (hovered || rating) ? 'fill-gold text-gold' : 'text-muted-foreground/30'
            )}
          />
        </motion.button>
      ))}
    </div>
  )
}

/* ────────────── Component ────────────── */

export default function Reading() {
  const [books, setBooks] = useState<Book[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('reading')
  const [expandedBook, setExpandedBook] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [addDialogOpen, setAddDialogOpen] = useState(false)

  // Add book form
  const [newTitle, setNewTitle] = useState('')
  const [newAuthor, setNewAuthor] = useState('')
  const [newType, setNewType] = useState('book')
  const [newTotalPages, setNewTotalPages] = useState('')

  // Update book
  const [editNotes, setEditNotes] = useState<Record<string, string>>({})
  const [editQuote, setEditQuote] = useState<Record<string, string>>({})
  const [editHighlight, setEditHighlight] = useState<Record<string, string>>({})
  const [editPage, setEditPage] = useState<Record<string, string>>({})

  const { refreshKey } = useDataRefresh()

  const fetchBooks = useCallback(async () => {
    try {
      const res = await apiFetch('/api/rise/books')
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setBooks(data.books || [])
    } catch {
      toast.error('فشل في تحميل الكتب')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBooks()
  }, [fetchBooks, refreshKey])

  const handleAddBook = async () => {
    if (!newTitle.trim()) return
    try {
      const res = await apiPost('/api/rise/books', {
        title: newTitle,
        author: newAuthor || null,
        type: newType,
        totalPages: newTotalPages ? parseInt(newTotalPages) : null,
        status: 'reading',
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        toast.error('فشل في إضافة الكتاب', { description: errData.error || errData.details || 'حاول مرة أخرى' })
        return
      }
      const newBook = await res.json()
      // Optimistically add to local state
      setBooks(prev => [newBook, ...prev])
      toast.success('تمت إضافة الكتاب بنجاح')
      setNewTitle('')
      setNewAuthor('')
      setNewType('book')
      setNewTotalPages('')
      setAddDialogOpen(false)
      signalDataChanged()
      setTimeout(() => { fetchBooks() }, 300)
    } catch {
      toast.error('فشل في إضافة الكتاب')
    }
  }

  const handleUpdateBook = async (id: string, data: Partial<Book>) => {
    try {
      const res = await apiPut('/api/rise/books', { id, ...data })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        toast.error('فشل في تحديث الكتاب', { description: errData.error || errData.details || 'حاول مرة أخرى' })
        return
      }
      toast.success('تم التحديث بنجاح')
      fetchBooks()
    } catch {
      toast.error('فشل في تحديث الكتاب')
    }
  }

  const handleLogReading = (bookId: string) => {
    const book = books.find((b) => b.id === bookId)
    if (!book || !book.totalPages) return
    const newPage = Math.min(book.currentPage + 1, book.totalPages)
    const progress = Math.min(100, Math.round((newPage / book.totalPages) * 100))
    const status = progress >= 100 ? 'completed' : 'reading'
    handleUpdateBook(bookId, {
      currentPage: newPage,
      progress,
      status,
      endDate: progress >= 100 ? new Date().toISOString().split('T')[0] : undefined,
    })
    if (progress >= 100) playSound('complete')
    else playSound('save')
    toast.success(progress >= 100 ? '🎉 أنهيت الكتاب!' : `صفحة ${arabicNum(newPage)}`)
  }

  const handleUpdateProgress = (bookId: string) => {
    const page = parseInt(editPage[bookId] || '0')
    const book = books.find((b) => b.id === bookId)
    if (!book || !book.totalPages) return
    const progress = Math.min(100, Math.round((page / book.totalPages) * 100))
    const status = progress >= 100 ? 'completed' : 'reading'
    handleUpdateBook(bookId, {
      currentPage: page,
      progress,
      status,
      endDate: progress >= 100 ? new Date().toISOString().split('T')[0] : undefined,
    })
    if (progress >= 100) playSound('complete')
    else playSound('save')
    setEditPage((prev) => {
      const next = { ...prev }
      delete next[bookId]
      return next
    })
  }

  const handleSaveNotes = (bookId: string) => {
    handleUpdateBook(bookId, { notes: editNotes[bookId] || null })
    setEditNotes((prev) => {
      const next = { ...prev }
      delete next[bookId]
      return next
    })
  }

  const handleSaveQuote = (bookId: string) => {
    handleUpdateBook(bookId, { favoriteQuote: editQuote[bookId] || null })
    setEditQuote((prev) => {
      const next = { ...prev }
      delete next[bookId]
      return next
    })
  }

  const handleSaveHighlight = (bookId: string) => {
    const book = books.find((b) => b.id === bookId)
    const existing: string[] = book?.highlights ? JSON.parse(book.highlights) : []
    const newHighlight = editHighlight[bookId]?.trim()
    if (newHighlight) {
      existing.push(newHighlight)
      handleUpdateBook(bookId, { highlights: JSON.stringify(existing) })
    }
    setEditHighlight((prev) => {
      const next = { ...prev }
      delete next[bookId]
      return next
    })
  }

  // Stats
  const readingBooks = books.filter((b) => b.status === 'reading')
  const completedBooks = books.filter((b) => b.status === 'completed')
  const totalBooks = books.length
  const totalPagesRead = completedBooks.reduce((sum, b) => sum + (typeof b.totalPages === 'number' ? b.totalPages : 0), 0) +
    readingBooks.reduce((sum, b) => sum + (typeof b.currentPage === 'number' ? b.currentPage : 0), 0)

  const filteredBooks = books
    .filter((b) => b.status === activeTab)
    .filter((b) => {
      if (!searchQuery) return true
      const q = searchQuery.toLowerCase()
      return b.title.toLowerCase().includes(q) || (b.author || '').toLowerCase().includes(q)
    })

  // Estimate completion date for the active book
  const getEstimatedCompletion = (book: Book): string | null => {
    if (!book.totalPages || !book.startDate) return null
    const pagesRead = book.currentPage
    if (pagesRead === 0) return null
    const startDate = new Date(book.startDate)
    const daysSinceStart = Math.max(1, (Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    const pagesPerDay = pagesRead / daysSinceStart
    if (pagesPerDay === 0) return null
    const pagesRemaining = book.totalPages - pagesRead
    const daysRemaining = Math.ceil(pagesRemaining / pagesPerDay)
    const completionDate = new Date()
    completionDate.setDate(completionDate.getDate() + daysRemaining)
    return completionDate.toLocaleDateString('ar', { month: 'short', day: 'numeric' })
  }

  return (
    <div dir="rtl" className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BookMarked className="w-6 h-6 text-emerald-accent" />
            القراءة
          </h2>
          <p className="text-sm text-muted-foreground mt-1">تتبع كتبك ومقالاتك ودوراتك التعليمية</p>
        </div>
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 bg-emerald-accent hover:bg-emerald-accent/90 text-white">
              <Plus className="w-4 h-4" />
              إضافة
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md" dir="rtl">
            <DialogHeader>
              <DialogTitle>إضافة كتاب جديد</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">العنوان</label>
                <Input
                  placeholder="عنوان الكتاب أو المقال"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">المؤلف</label>
                <Input
                  placeholder="اسم المؤلف"
                  value={newAuthor}
                  onChange={(e) => setNewAuthor(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">النوع</label>
                <Select value={newType} onValueChange={setNewType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="book">كتاب</SelectItem>
                    <SelectItem value="article">مقال</SelectItem>
                    <SelectItem value="course">دورة</SelectItem>
                    <SelectItem value="video">فيديو</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">عدد الصفحات</label>
                <Input
                  type="number"
                  placeholder="العدد الإجمالي للصفحات"
                  value={newTotalPages}
                  onChange={(e) => setNewTotalPages(e.target.value)}
                />
              </div>
              <Button onClick={handleAddBook} className="w-full bg-emerald-accent hover:bg-emerald-accent/90 text-white" disabled={!newTitle.trim()}>
                إضافة للقراءة
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'إجمالي الكتب', value: totalBooks, icon: Library, color: 'text-emerald-accent' },
          { label: 'قيد القراءة', value: readingBooks.length, icon: BookOpen, color: 'text-forest' },
          { label: 'صفحات مقروءة', value: totalPagesRead, icon: FileText, color: 'text-gold' },
          { label: 'مكتملة', value: completedBooks.length, icon: BookmarkCheck, color: 'text-emerald-accent' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
          >
            <Card className="glass">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={cn('p-2 rounded-xl bg-background/80', stat.color)}>
                    <stat.icon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Currently Reading Featured Section */}
      {readingBooks.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="glass border-emerald-accent/20 overflow-hidden">
            <div className="bg-gradient-to-l from-emerald-accent/5 via-emerald-accent/3 to-transparent p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-emerald-accent/15 flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-emerald-accent" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base">أقرأ الآن</h3>
                    <p className="text-xs text-muted-foreground">{arabicNum(readingBooks.length)} كتاب قيد القراءة</p>
                  </div>
                </div>
                <Flame className="w-5 h-5 text-gold" />
              </div>

              {/* Featured active book (first one with most progress) */}
              {(() => {
                const featured = readingBooks.sort((a, b) => (typeof b.progress === 'number' ? b.progress : 0) - (typeof a.progress === 'number' ? a.progress : 0))[0]
                if (!featured) return null
                const pagesRemaining = (typeof featured.totalPages === 'number' ? featured.totalPages : 0) - (typeof featured.currentPage === 'number' ? featured.currentPage : 0)
                const estDate = getEstimatedCompletion(featured)

                return (
                  <div className="bg-background/60 rounded-2xl p-5 border border-emerald-accent/10">
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-bold text-lg truncate">{featured.title}</h4>
                          <Badge variant="secondary" className={cn('text-[10px] shrink-0', typeColors[featured.type])}>
                            {typeLabels[featured.type]}
                          </Badge>
                        </div>
                        {featured.author && <p className="text-sm text-muted-foreground">{featured.author}</p>}
                      </div>
                      <motion.div whileTap={{ scale: 0.95 }}>
                        <Button
                          onClick={() => handleLogReading(featured.id)}
                          className="gap-2 bg-emerald-accent hover:bg-emerald-accent/90 text-white shrink-0"
                          size="sm"
                        >
                          <Plus className="w-4 h-4" />
                          تسجيل قراءة
                        </Button>
                      </motion.div>
                    </div>

                    {/* Large progress bar */}
                    <div className="space-y-2 mb-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          صفحة <span className="font-semibold text-foreground">{arabicNum(featured.currentPage)}</span> من <span className="font-semibold text-foreground">{arabicNum(featured.totalPages || 0)}</span>
                        </span>
                        <span className="font-bold text-emerald-accent text-lg">{Math.round(featured.progress)}٪</span>
                      </div>
                      <div className="h-3.5 rounded-full bg-muted overflow-hidden">
                        <motion.div
                          className="h-full rounded-full bg-gradient-to-l from-emerald-accent to-forest"
                          initial={{ width: 0 }}
                          animate={{ width: `${featured.progress}%` }}
                          transition={{ duration: 0.8, ease: 'easeOut' }}
                        />
                      </div>
                    </div>

                    {/* Meta info */}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      {featured.totalPages && (
                        <div className="flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5" />
                          <span>متبقي {arabicNum(pagesRemaining)} صفحة</span>
                        </div>
                      )}
                      {estDate && (
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>تقدير الإنهاء: {estDate}</span>
                        </div>
                      )}
                      {featured.startDate && (
                        <div className="flex items-center gap-1.5">
                          <TrendingUp className="w-3.5 h-3.5" />
                          <span>بدأ {new Date(featured.startDate).toLocaleDateString('ar', { month: 'short', day: 'numeric' })}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()}

              {/* Other reading books (compact) */}
              {readingBooks.length > 1 && (
                <div className="grid gap-3 sm:grid-cols-2 mt-4">
                  {readingBooks.slice(0, 3).map((book) => {
                    const pagesRemaining = (book.totalPages || 0) - book.currentPage
                    const estDate = getEstimatedCompletion(book)
                    return (
                      <div key={book.id} className="bg-background/60 rounded-xl p-3 space-y-2 border-r-4 border-r-emerald-accent/40">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm truncate">{book.title}</p>
                            <p className="text-xs text-muted-foreground">{book.author}</p>
                          </div>
                          <motion.button
                            whileTap={{ scale: 0.9 }}
                            onClick={() => handleLogReading(book.id)}
                            className="shrink-0 p-1.5 rounded-lg bg-emerald-accent/10 text-emerald-accent hover:bg-emerald-accent/20 transition-colors"
                            title="تسجيل صفحة"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </motion.button>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px] text-muted-foreground">
                            <span>{arabicNum(book.currentPage)} / {book.totalPages || '∞'}</span>
                            <span className="font-semibold text-foreground">{Math.round(book.progress)}%</span>
                          </div>
                          <Progress value={book.progress} className="h-2" />
                        </div>
                        {estDate && (
                          <p className="text-[10px] text-muted-foreground/60">تقدير الإنهاء: {estDate}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </Card>
        </motion.div>
      )}

      {/* Tabs + Search */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-muted/50">
            <TabsTrigger value="reading">للقراءة</TabsTrigger>
            <TabsTrigger value="completed">مكتملة</TabsTrigger>
            <TabsTrigger value="want_to_read">قائمة القراءة</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="بحث عن كتاب..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-9 w-full sm:w-64"
          />
        </div>
      </div>

      {/* Books Grid */}
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="glass">
              <CardContent className="p-5 space-y-3">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-2 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredBooks.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-20 text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
            <BookOpen className="w-8 h-8 text-muted-foreground/50" />
          </div>
          <p className="text-lg font-semibold text-muted-foreground">لا توجد كتب</p>
          <p className="text-sm text-muted-foreground/70 mt-1">أضف كتابك الأول لبدء التتبع</p>
        </motion.div>
      ) : (
        <motion.div
          layout
          className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          <AnimatePresence mode="popLayout">
            {filteredBooks.map((book, i) => {
              const TypeIcon = typeIcons[book.type] || BookOpen
              const isExpanded = expandedBook === book.id
              const highlights: string[] = book.highlights ? JSON.parse(book.highlights) : []

              return (
                <motion.div
                  key={book.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Card className={cn(
                    'glass overflow-hidden transition-shadow hover:shadow-lg',
                    isExpanded && 'ring-1 ring-emerald-accent/30',
                    typeBorderColors[book.type] || 'border-r-emerald-accent',
                    'border-r-4'
                  )}>
                    <CardContent className="p-5">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className={cn('p-2.5 rounded-xl shrink-0', typeColors[book.type])}>
                            <TypeIcon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-sm leading-snug truncate">{book.title}</h3>
                            {book.author && (
                              <p className="text-xs text-muted-foreground mt-0.5 truncate">{book.author}</p>
                            )}
                          </div>
                        </div>
                        <Badge variant="secondary" className={cn('text-[10px] shrink-0', typeColors[book.type])}>
                          {typeLabels[book.type]}
                        </Badge>
                      </div>

                      {/* Progress */}
                      {book.totalPages && (
                        <div className="space-y-1.5 mb-3">
                          <div className="flex justify-between text-[11px] text-muted-foreground">
                            <span>صفحة {book.currentPage} من {book.totalPages}</span>
                            <span className="font-semibold text-foreground">{Math.round(book.progress)}%</span>
                          </div>
                          <Progress value={book.progress} className="h-2" />
                        </div>
                      )}

                      {/* Rating (always interactive) */}
                      {book.status === 'completed' && (
                        <div className="mb-3">
                          <StarRating
                            rating={book.rating || 0}
                            onRate={(r) => handleUpdateBook(book.id, { rating: r })}
                          />
                        </div>
                      )}

                      {/* Favorite Quote */}
                      {book.favoriteQuote && (
                        <div className="mb-3 p-3 rounded-lg bg-gold/5 border border-gold/10">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Quote className="w-3 h-3 text-gold" />
                            <span className="text-[10px] font-semibold text-gold">اقتباس مفضل</span>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">&ldquo;{book.favoriteQuote}&rdquo;</p>
                        </div>
                      )}

                      {/* Expand Button */}
                      <button
                        onClick={() => setExpandedBook(isExpanded ? null : book.id)}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full justify-center pt-2 border-t border-border/50 mt-1"
                      >
                        <span>{isExpanded ? 'إخفاء' : 'التفاصيل'}</span>
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>

                      {/* Expanded Detail */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3 }}
                            className="overflow-hidden"
                          >
                            <div className="pt-4 space-y-4 border-t border-border/50 mt-3">
                              {/* Update Progress */}
                              {book.status === 'reading' && book.totalPages && (
                                <div className="space-y-2">
                                  <label className="text-xs font-semibold flex items-center gap-1.5">
                                    <TrendingUp className="w-3 h-3 text-emerald-accent" />
                                    تحديث الصفحة الحالية
                                  </label>
                                  <div className="flex gap-2">
                                    <Input
                                      type="number"
                                      min={0}
                                      max={book.totalPages}
                                      value={editPage[book.id] ?? book.currentPage}
                                      onChange={(e) => setEditPage((prev) => ({ ...prev, [book.id]: e.target.value }))}
                                      className="h-8 text-sm"
                                    />
                                    <Button
                                      size="sm"
                                      onClick={() => handleUpdateProgress(book.id)}
                                      className="h-8 bg-emerald-accent hover:bg-emerald-accent/90 text-white text-xs px-3"
                                    >
                                      تحديث
                                    </Button>
                                  </div>
                                </div>
                              )}

                              {/* Rating (completed) */}
                              {book.status === 'completed' && (
                                <div className="space-y-2">
                                  <label className="text-xs font-semibold flex items-center gap-1.5">
                                    <Star className="w-3 h-3 text-gold" />
                                    التقييم
                                  </label>
                                  <StarRating
                                    rating={book.rating || 0}
                                    onRate={(r) => handleUpdateBook(book.id, { rating: r })}
                                  />
                                </div>
                              )}

                              {/* Favorite Quote */}
                              <div className="space-y-2">
                                <label className="text-xs font-semibold flex items-center gap-1.5">
                                  <Quote className="w-3 h-3 text-gold" />
                                  الاقتباس المفضل
                                </label>
                                <div className="flex gap-2">
                                  <Input
                                    placeholder="أدخل اقتباسك المفضل..."
                                    value={editQuote[book.id] ?? book.favoriteQuote ?? ''}
                                    onChange={(e) => setEditQuote((prev) => ({ ...prev, [book.id]: e.target.value }))}
                                    className="h-8 text-sm"
                                  />
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleSaveQuote(book.id)}
                                    className="h-8 text-xs px-3"
                                  >
                                    حفظ
                                  </Button>
                                </div>
                              </div>

                              {/* Highlights */}
                              <div className="space-y-2">
                                <label className="text-xs font-semibold flex items-center gap-1.5">
                                  <Highlighter className="w-3 h-3 text-emerald-accent" />
                                  المقتطفات ({highlights.length})
                                </label>
                                <div className="flex gap-2">
                                  <Input
                                    placeholder="أضف مقتطف جديد..."
                                    value={editHighlight[book.id] ?? ''}
                                    onChange={(e) => setEditHighlight((prev) => ({ ...prev, [book.id]: e.target.value }))}
                                    className="h-8 text-sm"
                                    onKeyDown={(e) => e.key === 'Enter' && handleSaveHighlight(book.id)}
                                  />
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleSaveHighlight(book.id)}
                                    className="h-8 text-xs px-3"
                                  >
                                    أضف
                                  </Button>
                                </div>
                                {highlights.length > 0 && (
                                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                                    {highlights.map((h, hi) => (
                                      <div key={hi} className="text-xs p-2 rounded-lg bg-emerald-accent/5 border border-emerald-accent/10 text-muted-foreground leading-relaxed">
                                        {h}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Notes */}
                              <div className="space-y-2">
                                <label className="text-xs font-semibold flex items-center gap-1.5">
                                  <StickyNote className="w-3 h-3 text-forest" />
                                  ملاحظات
                                </label>
                                <Textarea
                                  placeholder="أضف ملاحظاتك هنا..."
                                  value={editNotes[book.id] ?? book.notes ?? ''}
                                  onChange={(e) => setEditNotes((prev) => ({ ...prev, [book.id]: e.target.value }))}
                                  rows={3}
                                  className="text-sm resize-none"
                                />
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleSaveNotes(book.id)}
                                  className="text-xs px-3"
                                >
                                  حفظ الملاحظات
                                </Button>
                              </div>

                              {/* Dates */}
                              <div className="flex gap-4 text-[11px] text-muted-foreground">
                                {book.startDate && (
                                  <span>بدأ: {new Date(book.startDate).toLocaleDateString('ar')}</span>
                                )}
                                {book.endDate && (
                                  <span>أنهى: {new Date(book.endDate).toLocaleDateString('ar')}</span>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  )
}