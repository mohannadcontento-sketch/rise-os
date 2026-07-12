'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sun,
  CloudSun,
  Moon,
  Plus,
  X,
  Circle,
  CheckCircle2,
  Star,
  Clock,
  CalendarDays,
  Sparkles,
  Coffee,
  BookOpen,
  Briefcase,
  Utensils,
  Dumbbell,
  Flag,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Trash2,
  ListTodo,
  Highlighter,
  StickyNote,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

/* ────────────── Types ────────────── */

interface PlannerItem {
  id: string
  text: string
  done: boolean
  isPriority: boolean
  createdAt: string
  timeLabel?: string
}

interface PlannerSection {
  id: 'morning' | 'noon' | 'evening'
  title: string
  subtitle: string
  timeRange: string
  icon: React.ElementType
  color: string
  bgGradient: string
  iconBg: string
  accentColor: string
  hours: number[]
}

interface PlannerData {
  date: string
  items: PlannerItem[]
  priorities: string[]
}

interface QuickNote {
  id: string
  text: string
  createdAt: string
}

/* ────────────── Constants ────────────── */

const STORAGE_KEY = 'rise-daily-planner'
const NOTES_STORAGE_KEY = 'rise-quick-notes'

const SECTIONS: PlannerSection[] = [
  {
    id: 'morning',
    title: 'الصباح',
    subtitle: 'بداية يومك بإيجابية وتركيز',
    timeRange: '٦:٠٠ – ١٢:٠٠',
    icon: Sun,
    color: 'text-amber-600 dark:text-amber-400',
    bgGradient: 'from-amber-50/80 to-orange-50/30 dark:from-amber-950/20 dark:to-orange-950/10',
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    accentColor: 'border-amber-200/60 dark:border-amber-800/40',
    hours: [6, 7, 8, 9, 10, 11],
  },
  {
    id: 'noon',
    title: 'الظهر',
    subtitle: 'استمر في الإنتاجية والإنجاز',
    timeRange: '١٢:٠٠ – ١٧:٠٠',
    icon: CloudSun,
    color: 'text-emerald-accent',
    bgGradient: 'from-emerald-50/80 to-teal-50/30 dark:from-emerald-950/20 dark:to-teal-950/10',
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
    accentColor: 'border-emerald-accent/20 dark:border-emerald-accent/15',
    hours: [12, 13, 14, 15, 16],
  },
  {
    id: 'evening',
    title: 'المساء',
    subtitle: 'اختم يومك بهدوء واستعداد',
    timeRange: '١٧:٠٠ – ٢٢:٠٠',
    icon: Moon,
    color: 'text-forest',
    bgGradient: 'from-sky-50/80 to-indigo-50/30 dark:from-sky-950/20 dark:to-indigo-950/10',
    iconBg: 'bg-sky-100 dark:bg-sky-900/30',
    accentColor: 'border-forest/15 dark:border-forest/10',
    hours: [17, 18, 19, 20, 21, 22],
  },
]

const QUICK_SUGGESTIONS: Record<string, { text: string; icon: React.ElementType }[]> = {
  morning: [
    { text: 'صلاة الفجر وأذكار الصباح', icon: Sparkles },
    { text: 'روتين الرياضة والتمارين', icon: Dumbbell },
    { text: 'قراءة ٣٠ دقيقة', icon: BookOpen },
    { text: 'مراجعة أهداف اليوم', icon: Flag },
    { text: 'فطور صحي', icon: Coffee },
  ],
  noon: [
    { text: 'جلسة عمل عميق', icon: Briefcase },
    { text: 'مراجعة المهام المعلقة', icon: ListTodo },
    { text: 'غداء واستراحة قصيرة', icon: Utensils },
    { text: 'متابعة المشروع الحالي', icon: Briefcase },
    { text: 'تعلم شيء جديد', icon: BookOpen },
  ],
  evening: [
    { text: 'مراجعة إنجازات اليوم', icon: CheckCircle2 },
    { text: 'كتابة اليوميات', icon: Highlighter },
    { text: 'وقت العائلة', icon: Sparkles },
    { text: 'قراءة قبل النوم', icon: BookOpen },
    { text: 'تخطيط الغد', icon: CalendarDays },
  ],
}

function arabicNum(n: number): string {
  const digits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩']
  return String(n).replace(/[0-9]/g, (d) => digits[parseInt(d)])
}

function getTodayStr() {
  return new Date().toISOString().split('T')[0]
}

function getArabicDate() {
  const now = new Date()
  const dayNames = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
  const monthNames = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
  ]
  const day = dayNames[now.getDay()]
  const date = arabicNum(now.getDate())
  const month = monthNames[now.getMonth()]
  const year = arabicNum(now.getFullYear())
  return day + '\u060C ' + date + ' ' + month + ' ' + year
}

function formatHour(h: number): string {
  const period = h < 12 ? 'ص' : 'م'
  const displayHour = h > 12 ? h - 12 : h === 0 ? 12 : h
  return `${arabicNum(displayHour)}:٠٠ ${period}`
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 7)
}

function getCurrentHour() {
  return new Date().getHours()
}

/* ────────────── Storage Helpers ────────────── */

function loadPlannerData(): PlannerData {
  if (typeof window === 'undefined') {
    return { date: getTodayStr(), items: [], priorities: [] }
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as PlannerData
      if (parsed.date === getTodayStr()) return parsed
    }
  } catch {
    // ignore
  }
  return { date: getTodayStr(), items: [], priorities: [] }
}

function savePlannerData(data: PlannerData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // ignore
  }
}

function loadNotes(): QuickNote[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(NOTES_STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return []
}

function saveNotes(notes: QuickNote[]) {
  try {
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes))
  } catch { /* ignore */ }
}

/* ────────────── Quick Suggest Button ────────────── */

function SuggestButton({
  text,
  icon: Icon,
  onAdd,
}: {
  text: string
  icon: React.ElementType
  onAdd: (text: string) => void
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      onClick={() => onAdd(text)}
      className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium
        bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground
        transition-all duration-200 border border-transparent hover:border-border/50"
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="truncate">{text}</span>
    </motion.button>
  )
}

/* ────────────── Empty State ────────────── */

function EmptyState({ section }: { section: PlannerSection }) {
  const Icon = section.icon
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-8 text-center"
    >
      <div className={cn('w-14 h-14 rounded-2xl flex items-center justify-center mb-3', section.iconBg)}>
        <Icon className={cn('w-7 h-7', section.color, 'opacity-40')} />
      </div>
      <p className="text-sm font-medium text-muted-foreground mb-1">لا توجد مهام بعد</p>
      <p className="text-xs text-muted-foreground/60">أضف مهامك أو اختر من الاقتراحات أدناه</p>
    </motion.div>
  )
}

/* ────────────── Planner Item ────────────── */

function PlannerItemRow({
  item,
  section,
  index,
  onToggle,
  onDelete,
  onTogglePriority,
}: {
  item: PlannerItem
  section: PlannerSection
  index: number
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onTogglePriority: (id: string) => void
}) {
  const createdHour = new Date(item.createdAt).getHours()
  const period = createdHour < 12 ? 'ص' : 'م'
  const displayHour = createdHour > 12 ? createdHour - 12 : createdHour === 0 ? 12 : createdHour
  const timeStr = `${arabicNum(displayHour)}:${arabicNum(new Date(item.createdAt).getMinutes())} ${period}`

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20, transition: { duration: 0.2 } }}
      className={cn(
        'group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200',
        index % 2 === 0 ? 'bg-muted/20' : 'bg-transparent',
        'hover:bg-muted/40',
        item.done && 'opacity-60'
      )}
    >
      {/* Time indicator */}
      <div className="flex items-center gap-1 shrink-0 w-12">
        <Clock className="w-3 h-3 text-muted-foreground/40" />
        <span className="text-[10px] text-muted-foreground/50 font-mono tabular-nums">{timeStr}</span>
      </div>

      {/* Drag handle (visual only) */}
      <div className="opacity-0 group-hover:opacity-40 transition-opacity cursor-grab">
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
      </div>

      {/* Checkbox */}
      <motion.div whileTap={{ scale: 0.9 }}>
        <Checkbox
          checked={item.done}
          onCheckedChange={() => onToggle(item.id)}
          className={cn(
            'w-[18px] h-[18px] rounded-md border-2',
            item.done
              ? 'border-emerald-accent bg-emerald-accent text-white data-[state=checked]:bg-emerald-accent data-[state=checked]:border-emerald-accent'
              : 'border-muted-foreground/25'
          )}
        />
      </motion.div>

      {/* Text */}
      <span
        className={cn(
          'flex-1 text-sm transition-all duration-300 leading-relaxed',
          item.done ? 'line-through text-muted-foreground' : 'text-foreground'
        )}
      >
        {item.text}
      </span>

      {/* Priority star */}
      <motion.button
        whileTap={{ scale: 0.85 }}
        onClick={() => onTogglePriority(item.id)}
        className={cn(
          'p-1 rounded-lg transition-all duration-200',
          item.isPriority
            ? 'text-gold'
            : 'text-muted-foreground/0 group-hover:text-muted-foreground/30 hover:!text-gold/60'
        )}
      >
        {item.isPriority ? (
          <Star className="w-3.5 h-3.5 fill-gold" />
        ) : (
          <Star className="w-3.5 h-3.5" />
        )}
      </motion.button>

      {/* Delete button */}
      <motion.button
        whileTap={{ scale: 0.85 }}
        onClick={() => onDelete(item.id)}
        className="p-1 rounded-lg text-muted-foreground/0 group-hover:text-muted-foreground/40 hover:!text-destructive/70 hover:!bg-destructive/10 transition-all duration-200"
      >
        <X className="w-3.5 h-3.5" />
      </motion.button>
    </motion.div>
  )
}

/* ────────────── Section Card ────────────── */

function SectionCard({
  section,
  items,
  suggestions,
  onAddItem,
  onToggleItem,
  onDeleteItem,
  onTogglePriority,
  isCurrentSection,
  index,
}: {
  section: PlannerSection
  items: PlannerItem[]
  suggestions: { text: string; icon: React.ElementType }[]
  onAddItem: (sectionId: string, text: string) => void
  onToggleItem: (id: string) => void
  onDeleteItem: (id: string) => void
  onTogglePriority: (id: string) => void
  isCurrentSection: boolean
  index: number
}) {
  const [inputValue, setInputValue] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const completedCount = items.filter((i) => i.done).length
  const totalCount = items.length
  const sectionProgress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0
  const allDone = totalCount > 0 && completedCount === totalCount

  const handleAdd = useCallback(() => {
    const trimmed = inputValue.trim()
    if (!trimmed) return
    onAddItem(section.id, trimmed)
    setInputValue('')
    inputRef.current?.focus()
  }, [inputValue, onAddItem, section.id])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleAdd()
  }

  const handleSuggestion = (text: string) => {
    onAddItem(section.id, text)
    setShowSuggestions(false)
  }

  const Icon = section.icon

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.05 + index * 0.08 }}
    >
      <Card
        className={cn(
          'overflow-hidden rounded-2xl border-0 shadow-sm hover:shadow-md transition-shadow duration-300 gap-0',
          isCurrentSection && 'ring-1 ring-emerald-accent/30'
        )}
      >
        {/* Section Header */}
        <div className={cn('px-5 pt-5 pb-3 bg-gradient-to-b', section.bgGradient)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', section.iconBg)}>
                <Icon className={cn('w-5 h-5', section.color)} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className={cn('text-lg font-bold', section.color)}>{section.title}</h3>
                  {isCurrentSection && (
                    <Badge className="text-[10px] px-1.5 py-0 bg-emerald-accent/15 text-emerald-accent border-emerald-accent/20">
                      الآن
                    </Badge>
                  )}
                  {allDone && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', damping: 12 }}
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-accent" />
                    </motion.div>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">{section.timeRange} · {section.subtitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {totalCount > 0 && (
                <span className={cn('text-sm font-semibold', allDone ? 'text-emerald-accent' : 'text-muted-foreground')}>
                  {arabicNum(completedCount)}/{arabicNum(totalCount)}
                </span>
              )}
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground transition-colors"
              >
                {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </motion.button>
            </div>
          </div>
          {/* Mini progress */}
          {totalCount > 0 && (
            <div className="mt-3 h-1 rounded-full bg-muted/40 overflow-hidden">
              <motion.div
                className={cn('h-full rounded-full', allDone ? 'bg-emerald-accent' : section.color.replace('text-', 'bg-'))}
                animate={{ width: `${sectionProgress}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              />
            </div>
          )}
        </div>

        <AnimatePresence>
          {!isCollapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
            >
              <CardContent className="p-3 space-y-0.5">
                {/* Items list */}
                <div className="min-h-[2rem]">
                  {items.length === 0 ? (
                    <EmptyState section={section} />
                  ) : (
                    <div className="space-y-0.5">
                      <AnimatePresence mode="popLayout">
                        {items.map((item, idx) => (
                          <PlannerItemRow
                            key={item.id}
                            item={item}
                            section={section}
                            index={idx}
                            onToggle={onToggleItem}
                            onDelete={onDeleteItem}
                            onTogglePriority={onTogglePriority}
                          />
                        ))}
                      </AnimatePresence>
                    </div>
                  )}
                </div>

                {/* Add Item Input */}
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 relative">
                    <Input
                      ref={inputRef}
                      dir="rtl"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={`أضف مهمة${totalCount > 0 ? ' أخرى' : ''}...`}
                      className="h-9 text-sm pr-9 rounded-xl border-dashed bg-transparent
                        focus:border-emerald-accent/50 focus:ring-emerald-accent/20
                        placeholder:text-muted-foreground/40"
                    />
                    <Plus className={cn(
                      'absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors',
                      inputValue ? 'text-emerald-accent' : 'text-muted-foreground/30'
                    )} />
                  </div>
                  {inputValue.trim() && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                    >
                      <Button
                        onClick={handleAdd}
                        size="sm"
                        className="h-9 px-3 rounded-xl bg-emerald-accent hover:bg-emerald-accent/90 text-white"
                      >
                        إضافة
                      </Button>
                    </motion.div>
                  )}
                </div>

                {/* Quick Suggestions */}
                {!showSuggestions && items.length === 0 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="pt-2"
                  >
                    <button
                      onClick={() => setShowSuggestions(true)}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mx-auto"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>اقتراحات سريعة</span>
                    </button>
                  </motion.div>
                )}

                <AnimatePresence>
                  {showSuggestions && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <div className="pt-2 border-t border-border/30">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-medium text-muted-foreground">اقتراحات</span>
                          <button
                            onClick={() => setShowSuggestions(false)}
                            className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                          >
                            إخفاء
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {suggestions.map((s) => (
                            <SuggestButton
                              key={s.text}
                              text={s.text}
                              icon={s.icon}
                              onAdd={handleSuggestion}
                            />
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  )
}

/* ────────────── Timeline View ────────────── */

function TimelineView({
  items,
  onToggleItem,
}: {
  items: PlannerItem[]
  onToggleItem: (id: string) => void
}) {
  const currentHour = getCurrentHour()
  const timelineHours = Array.from({ length: 17 }, (_, i) => i + 6)

  return (
    <div className="relative">
      <div className="space-y-0">
        {timelineHours.map((hour) => {
          const isNow = hour === currentHour

          return (
            <div
              key={hour}
              className={cn(
                'flex items-stretch gap-4 py-1.5 border-b border-border/20 last:border-0 relative',
                isNow && 'bg-emerald-accent/5 -mx-3 px-3 rounded-lg'
              )}
            >
              {/* Now line indicator */}
              {isNow && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="absolute right-0 top-0 bottom-0 w-0.5 bg-emerald-accent"
                />
              )}
              <div className="w-14 shrink-0 text-left flex items-center gap-1">
                <Clock className="w-3 h-3 text-muted-foreground/30" />
                <span className={cn(
                  'text-[11px] font-mono tabular-nums',
                  isNow ? 'text-emerald-accent font-bold' : 'text-muted-foreground/50'
                )}>
                  {formatHour(hour)}
                </span>
              </div>
              <div className="flex-1 min-h-[2rem] flex items-center">
                {isNow && (
                  <motion.div
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-2"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-accent" />
                    <span className="text-xs text-emerald-accent font-medium">الوقت الحالي</span>
                  </motion.div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ────────────── Main Component ────────────── */

export default function DailyPlanner() {
  const [data, setData] = useState<PlannerData>(() => loadPlannerData())
  const [activeView, setActiveView] = useState<'sections' | 'timeline'>('sections')
  const isFirstRender = useRef(true)

  // Quick Notes
  const [notes, setNotes] = useState<QuickNote[]>(() => loadNotes())
  const [noteDialogOpen, setNoteDialogOpen] = useState(false)
  const [newNoteText, setNewNoteText] = useState('')
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editNoteText, setEditNoteText] = useState('')

  // Save to localStorage on changes (skip first render)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    savePlannerData(data)
  }, [data])

  // Derive section items from flat list using createdAt hour
  const sectionItems = useMemo(() => {
    const morning: PlannerItem[] = []
    const noon: PlannerItem[] = []
    const evening: PlannerItem[] = []

    data.items.forEach((item) => {
      const h = new Date(item.createdAt).getHours()
      if (h < 12) morning.push(item)
      else if (h < 17) noon.push(item)
      else evening.push(item)
    })

    return { morning, noon, evening }
  }, [data.items])

  const addItem = useCallback((sectionId: string, text: string) => {
    const newItem: PlannerItem = {
      id: generateId(),
      text,
      done: false,
      isPriority: false,
      createdAt: new Date().toISOString(),
    }
    const adjustedItem = { ...newItem }
    if (sectionId === 'morning') {
      const d = new Date()
      d.setHours(8, 0, 0, 0)
      adjustedItem.createdAt = d.toISOString()
    } else if (sectionId === 'noon') {
      const d = new Date()
      d.setHours(14, 0, 0, 0)
      adjustedItem.createdAt = d.toISOString()
    } else {
      const d = new Date()
      d.setHours(19, 0, 0, 0)
      adjustedItem.createdAt = d.toISOString()
    }

    setData((prev) => ({
      ...prev,
      items: [...prev.items, adjustedItem],
    }))
  }, [])

  const toggleItem = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === id ? { ...item, done: !item.done } : item
      ),
    }))
  }, [])

  const deleteItem = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      items: prev.items.filter((item) => item.id !== id),
      priorities: prev.priorities.filter((pid) => pid !== id),
    }))
  }, [])

  const togglePriority = useCallback((id: string) => {
    setData((prev) => {
      const isPriority = prev.priorities.includes(id)
      return {
        ...prev,
        priorities: isPriority
          ? prev.priorities.filter((pid) => pid !== id)
          : [...prev.priorities, id],
        items: prev.items.map((item) =>
          item.id === id ? { ...item, isPriority: !isPriority } : item
        ),
      }
    })
  }, [])

  // Note handlers
  const handleAddNote = () => {
    if (!newNoteText.trim()) return
    const note: QuickNote = {
      id: generateId(),
      text: newNoteText.trim(),
      createdAt: new Date().toISOString(),
    }
    const updated = [note, ...notes]
    setNotes(updated)
    saveNotes(updated)
    setNewNoteText('')
    setNoteDialogOpen(false)
    toast.success('تمت إضافة الملاحظة')
  }

  const handleDeleteNote = (id: string) => {
    const updated = notes.filter((n) => n.id !== id)
    setNotes(updated)
    saveNotes(updated)
    toast.success('تم حذف الملاحظة')
  }

  const handleSaveNoteEdit = () => {
    if (!editingNoteId || !editNoteText.trim()) return
    const updated = notes.map((n) => n.id === editingNoteId ? { ...n, text: editNoteText.trim() } : n)
    setNotes(updated)
    saveNotes(updated)
    setEditingNoteId(null)
    setEditNoteText('')
    toast.success('تم تحديث الملاحظة')
  }

  const priorityItems = data.items.filter((item) => item.isPriority && !item.done)
  const totalItems = data.items.length
  const completedItems = data.items.filter((i) => i.done).length
  const overallProgress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0

  return (
    <div dir="rtl" className="space-y-6">
      {/* ── Date Header ── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="glass rounded-2xl p-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-accent to-forest flex items-center justify-center shadow-lg">
              <CalendarDays className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-foreground">{getArabicDate()}</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                {totalItems === 0
                  ? 'ابدأ بخطة يومك وأنجز أهدافك'
                  : `${arabicNum(completedItems)} من ${arabicNum(totalItems)} مهمة مكتملة`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* View toggle */}
            <div className="flex items-center bg-muted/60 rounded-xl p-1">
              <button
                onClick={() => setActiveView('sections')}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200',
                  activeView === 'sections'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                الأقسام
              </button>
              <button
                onClick={() => setActiveView('timeline')}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200',
                  activeView === 'timeline'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                الجدول الزمني
              </button>
            </div>

            {/* Overall progress indicator */}
            <div className="hidden sm:flex items-center gap-2">
              <div className="w-24 h-2 rounded-full bg-muted/60 overflow-hidden">
                <motion.div
                  className={cn(
                    'h-full rounded-full transition-colors',
                    overallProgress === 100 ? 'bg-emerald-accent' : 'bg-gradient-to-l from-emerald-accent to-forest-light'
                  )}
                  animate={{ width: `${overallProgress}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                />
              </div>
              <span className="text-xs font-semibold text-muted-foreground tabular-nums min-w-[3rem] text-left">
                {arabicNum(overallProgress)}٪
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Priority Tasks ── */}
      <AnimatePresence>
        {priorityItems.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <Card className="overflow-hidden rounded-2xl border-0 shadow-sm gap-0">
              <div className="px-5 pt-4 pb-2 bg-gradient-to-b from-gold/10 to-gold/5 dark:from-gold/5 dark:to-transparent">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-gold/15 flex items-center justify-center">
                    <Flag className="w-4 h-4 text-gold" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                      مهام ذات أولوية
                      <Badge className="text-[10px] px-1.5 py-0 bg-gold/15 text-gold border-gold/20">
                        {arabicNum(priorityItems.length)}
                      </Badge>
                    </h3>
                  </div>
                </div>
              </div>
              <CardContent className="p-3 pt-2 space-y-0.5">
                <AnimatePresence mode="popLayout">
                  {priorityItems.map((item) => (
                    <PlannerItemRow
                      key={item.id}
                      item={item}
                      section={SECTIONS[0]}
                      index={0}
                      onToggle={toggleItem}
                      onDelete={deleteItem}
                      onTogglePriority={togglePriority}
                    />
                  ))}
                </AnimatePresence>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main Content: Sections or Timeline ── */}
      <AnimatePresence mode="wait">
        {activeView === 'sections' ? (
          <motion.div
            key="sections"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-5"
          >
            {SECTIONS.map((section, index) => (
              <SectionCard
                key={section.id}
                section={section}
                items={sectionItems[section.id]}
                suggestions={QUICK_SUGGESTIONS[section.id]}
                onAddItem={addItem}
                onToggleItem={toggleItem}
                onDeleteItem={deleteItem}
                onTogglePriority={togglePriority}
                isCurrentSection={
                  (section.id === 'morning' && getCurrentHour() >= 6 && getCurrentHour() < 12) ||
                  (section.id === 'noon' && getCurrentHour() >= 12 && getCurrentHour() < 17) ||
                  (section.id === 'evening' && getCurrentHour() >= 17 && getCurrentHour() <= 22)
                }
                index={index}
              />
            ))}
          </motion.div>
        ) : (
          <motion.div
            key="timeline"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="overflow-hidden rounded-2xl border-0 shadow-sm gap-0">
              <div className="px-5 pt-4 pb-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-forest/10 flex items-center justify-center">
                    <Clock className="w-4 h-4 text-forest" />
                  </div>
                  <h3 className="text-sm font-bold text-foreground">الجدول الزمني</h3>
                  <span className="text-[11px] text-muted-foreground">٦:٠٠ ص – ١٠:٠٠ م</span>
                </div>
              </div>
              <CardContent className="p-4 pt-2">
                <TimelineView items={data.items} onToggleItem={toggleItem} />
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Quick Stats Footer ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
        className="grid grid-cols-2 sm:grid-cols-4 gap-3"
      >
        {[
          {
            label: 'إجمالي المهام',
            value: arabicNum(totalItems),
            icon: ListTodo,
            color: 'text-foreground',
            bg: 'bg-muted/50',
          },
          {
            label: 'مكتملة',
            value: arabicNum(completedItems),
            icon: CheckCircle2,
            color: 'text-emerald-accent',
            bg: 'bg-emerald-accent/10',
          },
          {
            label: 'أولوية',
            value: arabicNum(priorityItems.length + data.priorities.filter(p => data.items.find(i => i.id === p)?.done).length),
            icon: Star,
            color: 'text-gold',
            bg: 'bg-gold/10',
          },
          {
            label: 'متبقية',
            value: arabicNum(totalItems - completedItems),
            icon: Circle,
            color: 'text-muted-foreground',
            bg: 'bg-muted/50',
          },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.35 + i * 0.05 }}
            className="glass rounded-xl p-3 flex items-center gap-3"
          >
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', stat.bg)}>
              <stat.icon className={cn('w-4 h-4', stat.color)} />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">{stat.label}</p>
              <p className={cn('text-lg font-bold', stat.color)}>{stat.value}</p>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* ── Quick Notes Section ── */}
      {notes.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
        >
          <Card className="glass overflow-hidden">
            <div className="px-5 pt-4 pb-2 bg-gradient-to-b from-amber-50/50 to-transparent dark:from-amber-950/10 dark:to-transparent">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <StickyNote className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <h3 className="text-sm font-bold text-foreground">ملاحظات سريعة</h3>
                  <Badge className="text-[10px] px-1.5 py-0 bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/30">
                    {arabicNum(notes.length)}
                  </Badge>
                </div>
              </div>
            </div>
            <CardContent className="p-3 space-y-2">
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {notes.map((note) => (
                  <motion.div
                    key={note.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="relative group p-3 rounded-xl bg-amber-50/50 dark:bg-amber-950/10 border border-amber-200/30 dark:border-amber-800/20"
                  >
                    {editingNoteId === note.id ? (
                      <div className="space-y-2">
                        <Textarea
                          value={editNoteText}
                          onChange={(e) => setEditNoteText(e.target.value)}
                          rows={2}
                          className="text-sm resize-none"
                        />
                        <div className="flex gap-1">
                          <Button size="sm" onClick={handleSaveNoteEdit} className="h-6 text-[10px] px-2 bg-emerald-accent hover:bg-emerald-accent/90 text-white">حفظ</Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingNoteId(null)} className="h-6 text-[10px] px-2">إلغاء</Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm text-foreground leading-relaxed">{note.text}</p>
                        <p className="text-[10px] text-muted-foreground/60 mt-2">
                          {new Date(note.createdAt).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        <div className="absolute top-2 left-2 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => { setEditingNoteId(note.id); setEditNoteText(note.text) }}
                            className="p-1 rounded-md hover:bg-muted/80 text-muted-foreground transition-colors"
                          >
                            <Highlighter className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDeleteNote(note.id)}
                            className="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </>
                    )}
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ── Floating Quick Note Button ── */}
      <motion.div
        className="fixed bottom-6 left-6 z-50"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', delay: 0.5 }}
      >
        <Dialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen}>
          <DialogTrigger asChild>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-500 dark:from-amber-500 dark:to-amber-600 text-white shadow-xl shadow-amber-500/30 flex items-center justify-center relative"
            >
              <StickyNote className="w-6 h-6" />
              {notes.length > 0 && (
                <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {notes.length}
                </div>
              )}
            </motion.button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md" dir="rtl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <StickyNote className="w-5 h-5 text-amber-500" />
                ملاحظة سريعة
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <Textarea
                placeholder="اكتب ملاحظتك السريعة هنا..."
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                rows={4}
                className="text-sm resize-none"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddNote()
                }}
              />
              <Button
                onClick={handleAddNote}
                className="w-full bg-amber-500 hover:bg-amber-500/90 text-white"
                disabled={!newNoteText.trim()}
              >
                <StickyNote className="w-4 h-4 ml-2" />
                حفظ الملاحظة
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </motion.div>
    </div>
  )
}