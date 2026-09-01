'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Network,
  Plus,
  Search,
  Star,
  FolderOpen,
  Tag,
  Trash2,
  Edit3,
  Check,
  X,
  Lightbulb,
  BookMarked,
  FileText,
  FolderKanban,
  Briefcase,
  Beaker,
  Palette,
  Sparkles,
  Archive,
  Grid3X3,
  List,
  Zap,
  Heart,
  Shuffle,
  Clock,
  Eye,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { RiseIcon } from './icons'
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
import { apiFetch, apiPost, apiPut, apiDelete } from '@/lib/api-fetch'
import { useDataRefresh } from '@/hooks/use-data-refresh'
import { toast } from 'sonner'
import { toastSaved, toastDeleted, toastError, toastCreated } from '@/lib/toast-helpers'

/* ────────────── Types ────────────── */

interface KnowledgeItem {
  id: string
  type: string
  title: string
  content: string
  folder: string | null
  tags: string | null
  source: string | null
  isFavorite: boolean
  createdAt: string
  updatedAt: string
}

/* ────────────── Config ────────────── */

const typeConfig: Record<string, { label: string; icon: React.ElementType; color: string; stripColor: string; borderColor: string }> = {
  project: { label: 'مشاريع', icon: FolderKanban, color: 'bg-emerald-accent/10 text-emerald-accent', stripColor: 'bg-emerald-accent', borderColor: 'border-s-emerald-accent' },
  knowledge: { label: 'معرفة', icon: BookMarked, color: 'bg-glass/10 text-glass', stripColor: 'bg-glass', borderColor: 'border-s-glass' },
  idea: { label: 'أفكار', icon: Lightbulb, color: 'bg-gold/10 text-gold', stripColor: 'bg-gold', borderColor: 'border-s-gold' },
  resource: { label: 'موارد', icon: FileText, color: 'bg-[#06B6D4]/10 text-[#0E7490] dark:text-[#67E8F9]', stripColor: 'bg-[#06B6D4]', borderColor: 'border-s-[#06B6D4]' },
  bookmark: { label: 'مفضلات', icon: Star, color: 'bg-rose-accent/10 text-rose-accent', stripColor: 'bg-rose-accent', borderColor: 'border-s-rose-accent' },
  inspiration: { label: 'إلهام', icon: Sparkles, color: 'bg-violet-accent/10 text-violet-accent', stripColor: 'bg-violet-accent', borderColor: 'border-s-violet-accent' },
  research: { label: 'بحث', icon: Beaker, color: 'bg-forest/10 text-forest dark:text-[#6EE7B7]', stripColor: 'bg-forest', borderColor: 'border-s-forest' },
  design_ref: { label: 'مراجع تصميم', icon: Palette, color: 'bg-violet-accent/10 text-violet-accent', stripColor: 'bg-violet-accent', borderColor: 'border-s-violet-accent' },
}

const tagColors = [
  'bg-emerald-accent/15 text-emerald-accent',
  'bg-forest/15 text-forest dark:text-[#6EE7B7]',
  'bg-gold/15 text-gold',
  'bg-violet-accent/15 text-violet-accent',
  'bg-glass/15 text-glass',
  'bg-rose-accent/15 text-rose-accent',
  'bg-[#06B6D4]/15 text-[#0E7490] dark:text-[#67E8F9]',
  'bg-violet-accent/15 text-violet-accent',
  'bg-gold/15 text-gold',
  'bg-rose-accent/15 text-rose-accent',
]

const tagBorderColors = [
  'border-emerald-accent/25',
  'border-forest/25',
  'border-gold/25',
  'border-violet-accent/25',
  'border-glass/25',
  'border-rose-accent/25',
  'border-[#06B6D4]/25',
  'border-violet-accent/25',
  'border-gold/25',
  'border-rose-accent/25',
]

const folders = [
  { id: 'all', label: 'الكل', icon: Archive },
  { id: 'general', label: 'عام', icon: FolderOpen },
  { id: 'work', label: 'العمل', icon: Briefcase },
  { id: 'personal', label: 'شخصي', icon: Star },
  { id: 'learning', label: 'تعلم', icon: BookMarked },
  { id: 'creative', label: 'إبداعي', icon: Palette },
]

/* ────────────── Component ────────────── */

export default function SecondBrain() {
  const [items, setItems] = useState<KnowledgeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeType, setActiveType] = useState('all')
  const [activeFolder, setActiveFolder] = useState('all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [addDialogOpen, setAddDialogOpen] = useState(false)

  // Quick Capture
  const [quickCapture, setQuickCapture] = useState('')
  const [isCapturing, setIsCapturing] = useState(false)

  // Add form
  const [newType, setNewType] = useState('note')
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [newFolder, setNewFolder] = useState('general')
  const [newTags, setNewTags] = useState('')
  const [newSource, setNewSource] = useState('')

  // Edit
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')

  const { refreshKey } = useDataRefresh()

  const fetchItems = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/rise/knowledge`)
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      // TASK 25 FIX — "الدماغ بياخد اللي بكتبه من التعلم والدورات ويحطه عنده":
      // the Learning module stores its goals/courses/skills/logs in the SAME
      // knowledge table (types learning-*), so they leaked into the Second
      // Brain list. The Second Brain shows ONLY its own items now.
      setItems((data.items || []).filter((i: any) => !String(i.type || '').startsWith('learning')))
    } catch {
      toast.error('فشل في تحميل البيانات')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchItems()
  }, [fetchItems, refreshKey])

  // Quick Capture handler
  const handleQuickCapture = useCallback(async () => {
    const text = quickCapture.trim()
    if (!text) return
    setIsCapturing(true)
    try {
      const res = await apiPost('/api/rise/knowledge', {
        type: 'idea',
        title: text,
        content: '',
        folder: 'general',
        tags: null,
        source: null,
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        toastError('الحفظ', errData.error || errData.details || 'حاول مرة أخرى')
        return
      }
      setQuickCapture('')
      fetchItems()
      toastCreated('الفكرة')
      // (fetchData removed — useDataRefresh handles background sync)
    } catch {
      toastError('الحفظ')
    } finally {
      setIsCapturing(false)
    }
  }, [quickCapture, fetchItems])

  const handleAdd = async () => {
    if (!newTitle.trim()) return
    try {
      const res = await apiPost('/api/rise/knowledge', {
        type: newType,
        title: newTitle,
        content: newContent,
        folder: newFolder,
        tags: newTags ? JSON.stringify(newTags.split(',').map((t) => t.trim()).filter(Boolean)) : null,
        source: newSource || null,
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        toastError('الإضافة', errData.error || errData.details || 'حاول مرة أخرى')
        return
      }
      toastCreated('العنصر')
      fetchItems()
      setNewTitle('')
      setNewContent('')
      setNewTags('')
      setNewSource('')
      setAddDialogOpen(false)
      fetchItems()
    } catch {
      toastError('الإضافة')
    }
  }

  const handleUpdate = async (id: string, data: Partial<KnowledgeItem>) => {
    // Dynamic: will be handled by fetchItems() after API success
    try {
      const res = await apiPut('/api/rise/knowledge', { id, ...data })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        toastError('التحديث', errData.error || errData.details || 'حاول مرة أخرى')
        return
      }
      toastSaved('العنصر')
      // (fetchData removed — useDataRefresh handles background sync)
    } catch {
      toastError('التحديث')
    }
  }

  const handleDelete = async (id: string) => {
    // Dynamic: will be handled by fetchItems() after API success
    try {
      const res = await apiDelete(`/api/rise/knowledge?id=${id}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        // Will be handled by fetchItems()
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      toastDeleted('العنصر')
      // (fetchData removed — useDataRefresh handles background sync)
    } catch (err) {
      // Will be handled by fetchItems()
      toastError('الحذف', err instanceof Error ? err.message : 'حاول مرة أخرى')
    }
  }

  const toggleFavorite = (id: string, current: boolean) => {
    handleUpdate(id, { isFavorite: !current })
  }

  // Random insight
  const [randomItem, setRandomItem] = useState<KnowledgeItem | null>(null)
  const [showInsight, setShowInsight] = useState(false)
  const handleRandomInsight = useCallback(() => {
    if (items.length === 0) return
    let pick = items[Math.floor(Math.random() * items.length)]
    if (randomItem && pick.id === randomItem.id && items.length > 1) {
      pick = items.find(i => i.id !== randomItem.id) || pick
    }
    setRandomItem(pick)
    setShowInsight(true)
  }, [items, randomItem])

  // Recently viewed
  const [recentlyViewed, setRecentlyViewed] = useState<string[]>([])
  const viewItem = useCallback((id: string) => {
    setRecentlyViewed(prev => [id, ...prev.filter(i => i !== id)].slice(0, 5))
  }, [])

  const startEdit = (item: KnowledgeItem) => {
    setEditingId(item.id)
    setEditTitle(item.title)
    setEditContent(item.content)
  }

  const saveEdit = () => {
    if (editingId) {
      handleUpdate(editingId, { title: editTitle, content: editContent })
      setEditingId(null)
    }
  }

  // Filter
  const filtered = items.filter((item) => {
    if (activeType !== 'all' && item.type !== activeType) return false
    if (activeFolder !== 'all' && item.folder !== activeFolder) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return item.title.toLowerCase().includes(q) || item.content.toLowerCase().includes(q)
    }
    return true
  })

  // All tags with counts
  const allTagsWithCount: { tag: string; count: number }[] = []
  items.forEach((item) => {
    if (item.tags) {
      try {
        const tags: string[] = JSON.parse(item.tags)
        tags.forEach((t) => {
          const existing = allTagsWithCount.find(a => a.tag === t)
          if (existing) existing.count++
          else allTagsWithCount.push({ tag: t, count: 1 })
        })
      } catch { /* ignore */ }
    }
  })
  allTagsWithCount.sort((a, b) => b.count - a.count)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <RiseIcon glyph="brain" hue="violet" size="md" lift />
            الدماغ الثاني
          </h2>
          <p className="text-sm text-muted-foreground mt-1">نظّم أفكارك ومعرفتك ومواريدك في مكان واحد</p>
        </div>
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 bg-forest text-paper-soft hover:bg-forest/90 dark:bg-lime dark:text-ink dark:hover:bg-lime/90">
              <Plus className="w-4 h-4" />
              إضافة
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg" dir="rtl">
            <DialogHeader><DialogTitle>إضافة عنصر جديد</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">النوع</label>
                  <Select value={newType} onValueChange={setNewType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(typeConfig).map(([key, cfg]) => (
                        <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">المجلد</label>
                  <Select value={newFolder} onValueChange={setNewFolder}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {folders.filter((f) => f.id !== 'all').map((f) => (
                        <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">العنوان</label>
                <Input placeholder="عنوان العنصر" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">المحتوى</label>
                <Textarea placeholder="اكتب المحتوى هنا..." value={newContent} onChange={(e) => setNewContent(e.target.value)} rows={5} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">الوسوم (مفصولة بفواصل)</label>
                  <Input placeholder="تصميم, تقنية, إنتاجية" value={newTags} onChange={(e) => setNewTags(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">المصدر</label>
                  <Input placeholder="رابط أو اسم المصدر" value={newSource} onChange={(e) => setNewSource(e.target.value)} />
                </div>
              </div>
              <Button onClick={handleAdd} className="w-full bg-forest text-paper-soft hover:bg-forest/90 dark:bg-lime dark:text-ink dark:hover:bg-lime/90" disabled={!newTitle.trim()}>
                إضافة
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleRandomInsight} disabled={items.length === 0} className="flex-1 gap-2">
                  <Shuffle className="w-4 h-4" />
                  فكرة عشوائية
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Recently Viewed */}
      {recentlyViewed.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <p className="text-xs font-semibold text-muted-foreground">شوهد مؤخراً</p>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
            {recentlyViewed.map(id => {
              const item = items.find(i => i.id === id)
              if (!item) return null
              const cfg = typeConfig[item.type] || typeConfig.knowledge
              const Icon = cfg.icon
              return (
                <motion.button
                  key={id}
                  whileHover={{ scale: 1.03 }}
                  onClick={() => { setActiveType('all'); setActiveFolder('all'); setSearchQuery(item.title) }}
                  className={cn("flex items-center gap-2 px-3 py-2 rounded-xl border shrink-0 transition-colors bg-muted/20 hover:bg-muted/40", cfg.borderColor)}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium max-w-[120px] truncate">{item.title}</span>
                </motion.button>
              )
            })}
          </div>
        </motion.div>
      )}

      {/* Random Insight */}
      <AnimatePresence>
        {showInsight && randomItem && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            className="premium-card rounded-2xl overflow-hidden relative"
          >
            <div className="noise-bg" />
            <div className="relative z-10 p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gold/15 flex items-center justify-center">
                    <Shuffle className="w-4 h-4 text-gold" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">فكرة عشوائية</p>
                    <p className="text-sm font-bold text-gold">💡</p>
                  </div>
                </div>
                <motion.button whileTap={{ scale: 0.9 }} onClick={() => setShowInsight(false)} className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground">
                  <X className="w-4 h-4" />
                </motion.button>
              </div>
              <h3 className="text-lg font-bold text-foreground mb-2">{randomItem.title}</h3>
              {randomItem.content && <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4">{randomItem.content}</p>}
              {randomItem.source && <p className="text-[10px] text-muted-foreground/60 mt-2">المصدر: {randomItem.source}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick Capture */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="neo-card card-lift overflow-hidden">
          <div className="bg-gradient-to-l from-violet-accent/8 via-violet-accent/3 to-transparent p-4">
            <div className="flex items-center gap-3 mb-3">
              <motion.div
                className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-accent to-[#7C3AED] flex items-center justify-center shadow-lg shadow-violet-accent/25"
                whileHover={{ scale: 1.05, rotate: -5 }}
              >
                <Zap className="w-4.5 h-4.5 text-white" />
              </motion.div>
              <div>
                <h3 className="text-sm font-bold">التقاط سريع</h3>
                <p className="text-[11px] text-muted-foreground">اكتب فكرة واضغط Enter للحفظ الفوري</p>
              </div>
            </div>
            <div className="relative">
              <Input
                placeholder="اكتب فكرتك أو ملاحظتك هنا..."
                value={quickCapture}
                onChange={(e) => setQuickCapture(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleQuickCapture()
                }}
                className={cn(
                  'pe-11 ps-4 h-11 text-sm rounded-xl transition-all duration-300',
                  'border-violet-accent/30 focus:border-violet-accent/60 focus:ring-violet-accent/20',
                  'bg-background/50 focus:bg-background',
                  quickCapture && !isCapturing && 'ring-2 ring-violet-accent/15 border-violet-accent/50'
                )}
                disabled={isCapturing}
              />
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={handleQuickCapture}
                disabled={!quickCapture.trim() || isCapturing}
                className={cn(
                  'absolute end-2 top-1/2 -translate-y-1/2 p-2 rounded-xl text-white transition-all duration-200',
                  quickCapture.trim() && !isCapturing
                    ? 'bg-violet-accent hover:bg-violet-accent/90 shadow-md shadow-violet-accent/25'
                    : 'bg-muted/70 text-muted-foreground'
                )}
              >
                {isCapturing ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
              </motion.button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Layout: Sidebar + Content */}
      <div className="flex gap-4 flex-col lg:flex-row">
        {/* Sidebar */}
        <div className="lg:w-56 shrink-0 space-y-4">
          {/* Type Filter */}
          <div className="neo-card">
            <div className="p-3">
              <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">النوع</p>
              <div className="space-y-0.5">
                <button
                  onClick={() => setActiveType('all')}
                  className={cn(
                    'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all text-start',
                    activeType === 'all'
                      ? 'bg-violet-accent/15 text-violet-accent shadow-sm shadow-violet-accent/10'
                      : 'text-muted-foreground hover:bg-muted/50'
                  )}
                >
                  <Archive className="w-3.5 h-3.5" />
                  الكل
                </button>
                {Object.entries(typeConfig).map(([key, cfg]) => {
                  const Icon = cfg.icon
                  return (
                    <button
                      key={key}
                      onClick={() => setActiveType(key)}
                      className={cn(
                        'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all text-start',
                        activeType === key
                          ? 'bg-violet-accent/15 text-violet-accent shadow-sm shadow-violet-accent/10'
                          : 'text-muted-foreground hover:bg-muted/50'
                      )}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {cfg.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Folders */}
          <div className="neo-card">
            <div className="p-3">
              <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">المجلدات</p>
              <div className="space-y-0.5">
                {folders.map((folder) => {
                  const Icon = folder.icon
                  return (
                    <button
                      key={folder.id}
                      onClick={() => setActiveFolder(folder.id)}
                      className={cn(
                        'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all text-start relative',
                        activeFolder === folder.id
                          ? 'bg-violet-accent/15 text-violet-accent shadow-sm shadow-violet-accent/10'
                          : 'text-muted-foreground hover:bg-muted/50'
                      )}
                    >
                      {activeFolder === folder.id && (
                        <motion.div
                          layoutId="folder-indicator"
                          className="absolute start-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-full bg-violet-accent"
                        />
                      )}
                      <Icon className="w-3.5 h-3.5" />
                      {folder.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Tags Cloud - sized pills */}
          {allTagsWithCount.length > 0 && (
            <div className="neo-card">
              <div className="p-3">
                <p className="text-xs font-semibold text-muted-foreground mb-2 px-1 flex items-center gap-1.5">
                  <Tag className="w-3 h-3" />
                  الوسوم
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {allTagsWithCount.map(({ tag, count }, i) => (
                    <motion.button
                      key={tag}
                      whileHover={{ scale: 1.08 }}
                      whileTap={{ scale: 0.92 }}
                      onClick={() => setSearchQuery(tag)}
                      className={cn(
                        'rounded-full px-2.5 py-0.5 cursor-pointer hover:opacity-80 transition-all font-medium border',
                        tagColors[i % tagColors.length],
                        tagBorderColors[i % tagBorderColors.length],
                        count >= 3 ? 'text-xs' : 'text-[10px]',
                        count >= 3 ? 'px-3 py-1' : 'px-2.5 py-0.5'
                      )}
                      style={count >= 3 ? { fontSize: `${10 + Math.min(count, 5) * 1.5}px` } : undefined}
                    >
                      {tag}
                      {count >= 2 && <span className="opacity-60 ms-0.5 num">{count}</span>}
                    </motion.button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Main Content */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Search + View Toggle */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="بحث في العناصر..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="ps-9"
              />
            </div>
            <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('grid')}
                className={cn('p-1.5 rounded-md transition-colors', viewMode === 'grid' ? 'bg-background shadow-sm' : 'text-muted-foreground')}
              >
                <Grid3X3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={cn('p-1.5 rounded-md transition-colors', viewMode === 'list' ? 'bg-background shadow-sm' : 'text-muted-foreground')}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Items */}
          {loading ? (
            <div className={cn('gap-3', viewMode === 'grid' ? 'grid sm:grid-cols-2' : 'flex flex-col')}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="neo-card p-4 space-y-3">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-20 text-center">
              <span className="icon-well h-16 w-16 bg-secondary text-muted-foreground/50 mb-4">
                <Network className="w-8 h-8" />
              </span>
              <p className="text-lg font-semibold text-muted-foreground">لا توجد عناصر</p>
              <p className="text-sm text-muted-foreground/70 mt-1">أضف أول عنصر أو استخدم التقاط السريع</p>
            </motion.div>
          ) : (
            <AnimatePresence mode="popLayout">
              <motion.div
                layout
                className={viewMode === 'grid' ? 'grid sm:grid-cols-2 gap-3' : 'flex flex-col gap-3'}
              >
                {filtered.map((item, i) => {
                  const cfg = typeConfig[item.type] || typeConfig.knowledge
                  const TypeIcon = cfg.icon
                  const tags: string[] = item.tags ? (typeof item.tags === 'string' ? JSON.parse(item.tags) : item.tags) : []

                  return (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ delay: i * 0.03 }}
                    >
                      <div className="neo-card card-lift group hover:shadow-lg transition-all overflow-hidden">
                        {/* Colored start strip */}
                        <div className="flex">
                          <div className={cn('w-1 rounded-s-lg shrink-0', cfg.stripColor)} />
                          <div className="p-4 flex-1">
                            {editingId === item.id ? (
                              <div className="space-y-3">
                                <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="text-sm font-semibold" />
                                <Textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={3} className="text-sm" />
                                <div className="flex gap-2">
                                  <Button size="sm" onClick={saveEdit} className="bg-forest text-paper-soft hover:bg-forest/90 dark:bg-lime dark:text-ink dark:hover:bg-lime/90 text-xs">
                                    <Check className="w-3 h-3 ms-1" /> حفظ
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={() => setEditingId(null)} className="text-xs">
                                    إلغاء
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <div className="flex items-start gap-2.5 flex-1 min-w-0">
                                    <div className={cn('p-2 rounded-lg shrink-0', cfg.color)}>
                                      <TypeIcon className="w-3.5 h-3.5" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <h3 className="font-semibold text-sm leading-snug truncate">{item.title}</h3>
                                      {item.content && (
                                        <p className={cn('text-xs text-muted-foreground mt-1', viewMode === 'grid' ? 'line-clamp-2' : 'line-clamp-1')}>
                                          {item.content}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-0.5 shrink-0">
                                    <button
                                      onClick={() => { toggleFavorite(item.id, item.isFavorite) }}
                                      className="p-1.5 rounded-lg transition-colors"
                                    >
                                      <motion.span
                                        animate={item.isFavorite ? { scale: [1, 1.4, 1] } : { scale: 1 }}
                                        transition={{ type: 'tween', stiffness: 400, damping: 10 }}
                                      >
                                        <Heart className={cn('w-3.5 h-3.5 transition-colors', item.isFavorite ? 'text-rose-accent fill-rose-accent' : 'text-muted-foreground/30 hover:text-rose-accent')} />
                                      </motion.span>
                                    </button>
                                    <button onClick={() => startEdit(item)} className="p-1.5 rounded-lg text-muted-foreground/30 hover:text-foreground hover:bg-muted/50 transition-colors opacity-0 group-hover:opacity-100">
                                      <Edit3 className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={() => handleDelete(item.id)} className="p-1.5 rounded-lg text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>

                                {tags.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-2">
                                    {tags.map((tag, ti) => (
                                      <span
                                        key={tag}
                                        className={cn(
                                          'pill border',
                                          tagColors[ti % tagColors.length],
                                          tagBorderColors[ti % tagBorderColors.length]
                                        )}
                                      >
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                                )}

                                {item.source && (
                                  <p className="text-[10px] text-muted-foreground/60 mt-2 truncate">المصدر: {item.source}</p>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )
                })}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  )
}
// Force recompile: 1785702715
