'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  PiggyBank,
  Landmark,
  Plus,
  Trash2,
  ArrowUpRight,
  ArrowDownRight,
  Repeat,
  CreditCard,
  Receipt,
  ShoppingBag,
  Utensils,
  Car,
  Home,
  Zap,
  Gift,
  GraduationCap,
  Briefcase,
  Heart,
  Sparkles,
  Shield,
  AlertTriangle,
  Target,
  DollarSign,
  Eye,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { apiFetch, apiPost, apiDelete, apiPut } from '@/lib/api-fetch'
import { useDataRefresh } from '@/hooks/use-data-refresh'
import { playSound } from '@/lib/sounds'
import { toast } from 'sonner'
import { toastSaved, toastDeleted, toastError, toastCreated } from '@/lib/toast-helpers'
import { getToday } from '@/lib/rise-utils'
import { RainbowCheckbox } from '@/components/rise/kit-v2'
import { RiseIcon } from '@/components/rise/icons'

/* ────────────── Types ────────────── */

interface FinanceRecord {
  id: string
  type: string
  category: string
  description: string
  amount: number
  date: string
  recurring: boolean
}

interface FinanceData {
  records: FinanceRecord[]
}

/* ────────────── Constants ────────────── */

// Finance identity = LIME (rule 5); expense = destructive, investment = glass, subscription = violet (rule 4 mapping)
const TYPE_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType; amountColor: string; borderColor: string; dotColor: string; trendValue?: number }> = {
  دخل: { label: 'الدخل', color: 'bg-lime-deep/10 text-lime-deep dark:text-lime', icon: TrendingUp, amountColor: 'text-lime-deep dark:text-lime', borderColor: 'border-s-lime-deep', dotColor: 'bg-lime-deep', trendValue: 12 },
  مصروف: { label: 'المصروفات', color: 'bg-destructive/10 text-destructive', icon: TrendingDown, amountColor: 'text-destructive', borderColor: 'border-s-destructive', dotColor: 'bg-destructive', trendValue: -5 },
  ادخار: { label: 'الادخار', color: 'bg-forest/10 text-forest', icon: PiggyBank, amountColor: 'text-forest', borderColor: 'border-s-forest', dotColor: 'bg-forest', trendValue: 8 },
  استثمار: { label: 'الاستثمار', color: 'bg-glass/10 text-glass', icon: Landmark, amountColor: 'text-glass', borderColor: 'border-s-glass', dotColor: 'bg-glass', trendValue: 15 },
  اشتراك: { label: 'الاشتراكات', color: 'bg-violet-accent/10 text-violet-accent', icon: CreditCard, amountColor: 'text-violet-accent', borderColor: 'border-s-violet-accent', dotColor: 'bg-violet-accent', trendValue: -3 },
}

const TYPE_CARD_CONFIG: Record<string, { label: string; icon: React.ElementType; bg: string; borderColor: string; activeBg: string }> = {
  دخل: { label: 'الدخل', icon: TrendingUp, bg: 'bg-lime-deep/5', borderColor: 'border-lime-deep/30', activeBg: 'bg-lime-deep/15 ring-lime-deep/40' },
  مصروف: { label: 'المصروفات', icon: TrendingDown, bg: 'bg-destructive/5', borderColor: 'border-destructive/30', activeBg: 'bg-destructive/15 ring-destructive/40' },
  ادخار: { label: 'الادخار', icon: PiggyBank, bg: 'bg-forest/5', borderColor: 'border-forest/30', activeBg: 'bg-forest/15 ring-forest/40' },
  استثمار: { label: 'الاستثمار', icon: Landmark, bg: 'bg-glass/5', borderColor: 'border-glass/30', activeBg: 'bg-glass/15 ring-glass/40' },
  اشتراك: { label: 'الاشتراكات', icon: CreditCard, bg: 'bg-violet-accent/5', borderColor: 'border-violet-accent/30', activeBg: 'bg-violet-accent/15 ring-violet-accent/40' },
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  راتب: Briefcase,
  حر: Sparkles,
  طعام: Utensils,
  مواصلات: Car,
  سكن: Home,
  فواتير: Zap,
  تسوق: ShoppingBag,
  هدايا: Gift,
  تعليم: GraduationCap,
  صحة: Heart,
  ترفيه: Gift,
  أخرى: Receipt,
}

const PIE_COLORS = [
  'var(--color-emerald-accent)',
  'var(--color-gold)',
  'var(--color-forest)',
  'var(--color-forest-light)',
  'var(--color-chart-5)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-1)',
  'var(--color-chart-2)',
]

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
}

const EMPTY_FORM = {
  type: 'مصروف',
  category: '',
  description: '',
  amount: 0,
  date: getToday(),
  recurring: false,
}

/* ────────────── Budget System ────────────── */

interface BudgetCategory {
  name: string
  limit: number
  icon: React.ElementType
}

const DEFAULT_BUDGET_CATEGORIES: BudgetCategory[] = [
  { name: 'سكن', limit: 2000, icon: Home },
  { name: 'طعام', limit: 1500, icon: Utensils },
  { name: 'مواصلات', limit: 800, icon: Car },
  { name: 'فواتير', limit: 500, icon: Zap },
  { name: 'تسوق', limit: 400, icon: ShoppingBag },
  { name: 'صحة', limit: 500, icon: Heart },
  { name: 'ترفيه', limit: 400, icon: Gift },
  { name: 'تعليم', limit: 600, icon: GraduationCap },
  { name: 'أخرى', limit: 500, icon: Receipt },
]

function toArabicNum(n: number | null | undefined | string | object): string {
  if (n == null || n === undefined || typeof n === 'object') return '٠'
  const num = typeof n === 'string' ? parseFloat(n) : n
  if (isNaN(num)) return '٠'
  return num.toString().replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[parseInt(d)])
}

/* ────────────── Component ────────────── */

export default function Finance() {
  const [data, setData] = useState<FinanceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const [form, setForm] = useState({ ...EMPTY_FORM })

  /* ─── Budget State ─── */
  const [budgetCategories, setBudgetCategories] = useState<BudgetCategory[]>(DEFAULT_BUDGET_CATEGORIES)
  const [budgetsLoading, setBudgetsLoading] = useState(true)
  const [editingBudget, setEditingBudget] = useState<string | null>(null)
  const budgetEditRef = useRef<HTMLInputElement>(null)
  const [budgetImpact, setBudgetImpact] = useState<{ category: string; remaining: number; over: boolean } | null>(null)

  const { refreshKey } = useDataRefresh()

  // Load budgets from API
  const fetchBudgets = useCallback(async () => {
    try {
      const res = await apiFetch('/api/rise/budgets')
      if (res.ok) {
        const json = await res.json()
        const serverBudgets: { category: string; limit: number }[] = json.budgets || []
        if (serverBudgets.length > 0) {
          const map: Record<string, number> = {}
          serverBudgets.forEach(b => { map[b.category] = b.limit })
          setBudgetCategories(prev =>
            prev.map(cat => ({
              ...cat,
              limit: map[cat.name] ?? cat.limit,
            }))
          )
        }
      }
    } catch { /* ignore — use defaults */ }
    finally {
      setBudgetsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBudgets()
  }, [fetchBudgets, refreshKey])

  // Save budgets to API
  const saveBudgets = useCallback(async (categories: BudgetCategory[]) => {
    try {
      const res = await apiPut('/api/rise/budgets', {
        budgets: categories.map(cat => ({ category: cat.name, limit: cat.limit })),
      })
      if (!res.ok) {
        toastError('حفظ الميزانية')
      } else {
        toastSaved('الميزانية')
      }
    } catch {
      toastError('حفظ الميزانية')
    }
  }, [])
  /* ─── Fetch ─── */
  const fetchFinance = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/rise/finance`)
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch {
      toast.error('فشل في تحميل البيانات المالية')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchFinance()
  }, [fetchFinance, refreshKey])

  /* ─── Save Record ─── */
  const handleSave = async () => {
    if (!form.category || !form.amount) {
      toast.error('يرجى ملء الفئة والمبلغ')
      return
    }
    setSaving(true)
    try {
      const res = await apiPost('/api/rise/finance', form)
      if (res.ok) {
        toastCreated('المعاملة')
        playSound('save')
        // Show budget impact
        if (form.type === 'مصروف' && form.category && form.amount > 0) {
          const budgetItem = budgetData.items.find(b => b.name === form.category)
          if (budgetItem) {
            const newRemaining = budgetItem.remaining - form.amount
            setBudgetImpact({
              category: form.category,
              remaining: newRemaining,
              over: newRemaining < 0,
            })
            setTimeout(() => setBudgetImpact(null), 4000)
          }
        }
        setDialogOpen(false)
        setForm({ ...EMPTY_FORM, date: getToday() })
        fetchFinance()
      } else {
        toastError('إضافة السجل')
      }
    } catch {
      toastError('الحفظ')
    } finally {
      setSaving(false)
    }
  }

  /* ─── Delete Record ─── */
  const handleDelete = async (id: string) => {
    playSound('delete')
    setDeleting(id)
    try {
      const res = await apiDelete(`/api/rise/finance?id=${id}`)
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `HTTP ${res.status}`)
      }
      toastDeleted('السجل')
      // (fetchData removed — useDataRefresh handles background sync)
    } catch (err) {
      toastError('حذف السجل', err instanceof Error ? err.message : 'حاول مرة أخرى')
    } finally {
      setDeleting(null)
    }
  }

  const updateForm = (field: string, value: string | number | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  /* ─── Computed Stats ─── */
  const stats = useMemo(() => {
    const records = data?.records || []
    const income = records.filter((r) => r.type === 'دخل').reduce((sum, r) => sum + r.amount, 0)
    const expenses = records.filter((r) => r.type === 'مصروف').reduce((sum, r) => sum + r.amount, 0)
    const savings = records.filter((r) => r.type === 'ادخار').reduce((sum, r) => sum + r.amount, 0)
    const investment = records.filter((r) => r.type === 'استثمار').reduce((sum, r) => sum + r.amount, 0)
    return { income, expenses, savings, investment }
  }, [data])

  /* ─── Budget Computation ─── */
  const budgetData = useMemo(() => {
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const monthExpenses = (data?.records || []).filter(
      (r) => r.type === 'مصروف' && r.date.startsWith(currentMonth)
    )

    const categorySpending: Record<string, number> = {}
    monthExpenses.forEach((r) => {
      categorySpending[r.category] = (categorySpending[r.category] || 0) + r.amount
    })

    let totalBudget = 0
    let totalSpent = 0
    let totalRemaining = 0
    let healthSum = 0
    let categoriesWithBudget = 0

    const items = budgetCategories.map((cat) => {
      const spent = categorySpending[cat.name] || 0
      const remaining = Math.max(cat.limit - spent, 0)
      const percentage = cat.limit > 0 ? (spent / cat.limit) * 100 : 0

      totalBudget += cat.limit
      totalSpent += spent
      totalRemaining += remaining
      categoriesWithBudget++

      // Health: 100 if 0% spent, 0 if >= 100% spent, linear in between
      const health = Math.max(0, Math.min(100, 100 - percentage))
      healthSum += health

      let barColor = 'bg-lime-deep'
      if (percentage >= 100) barColor = 'bg-destructive'
      else if (percentage >= 80) barColor = 'bg-gold'

      return { ...cat, spent, remaining, percentage, health, barColor }
    })

    const overallHealth = categoriesWithBudget > 0 ? Math.round(healthSum / categoriesWithBudget) : 100

    return { items, totalBudget, totalSpent, totalRemaining, overallHealth }
  }, [data, budgetCategories])

  /* ─── Savings Goal ─── */
  const [savingsGoal, setSavingsGoal] = useState(10000)
  const totalSavings = stats.savings + stats.investment
  const savingsProgress = Math.min(100, (totalSavings / savingsGoal) * 100)

  /* ─── Cash Flow Data ─── */
  const cashFlowData = useMemo(() => {
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const monthRecords = (data?.records || []).filter(r => r.date.startsWith(currentMonth))
    const income = monthRecords.filter(r => r.type === 'دخل').reduce((s, r) => s + r.amount, 0)
    const expenses = monthRecords.filter(r => r.type === 'مصروف').reduce((s, r) => s + r.amount, 0)
    const saved = monthRecords.filter(r => r.type === 'ادخار' || r.type === 'استثمار').reduce((s, r) => s + r.amount, 0)
    return [
      { name: 'الدخل', قيمة: income, fill: 'var(--color-lime-deep)' },
      { name: 'المصروفات', قيمة: -expenses, fill: 'var(--color-destructive)' },
      { name: 'المدخرات', قيمة: saved, fill: 'var(--color-forest)' },
    ]
  }, [data])

  /* ─── Monthly Category Sparklines ─── */
  const categoryMonthlyData = useMemo(() => {
    const records = data?.records || []
    const result: Record<string, number[]> = {}
    for (let i = 5; i >= 0; i--) {
      const d = new Date()
      d.setMonth(d.getMonth() - i)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      records.filter(r => r.type === 'مصروف' && r.date.startsWith(key)).forEach(r => {
        if (!result[r.category]) result[r.category] = []
        result[r.category].push(r.amount)
      })
    }
    return result
  }, [data])

  /* ─── Grouped Records ─── */
  const groupedRecords = useMemo(() => {
    const records = data?.records || []
    const groups: Record<string, FinanceRecord[]> = {}
    records.forEach((r) => {
      if (!groups[r.type]) groups[r.type] = []
      groups[r.type].push(r)
    })
    // Sort each group by date desc
    Object.values(groups).forEach((g) => g.sort((a, b) => b.date.localeCompare(a.date)))
    return groups
  }, [data])

  /* ─── Expense by Category (for pie chart) ─── */
  const expenseByCategory = useMemo(() => {
    const expenses = (data?.records || []).filter((r) => r.type === 'مصروف')
    const map: Record<string, number> = {}
    expenses.forEach((r) => {
      map[r.category] = (map[r.category] || 0) + r.amount
    })
    return Object.entries(map)
      .map(([name, value]) => ({ name, قيمة: value }))
      .sort((a, b) => b.قيمة - a.قيمة)
  }, [data])

  /* ─── Monthly Income vs Expenses ─── */
  const monthlyChartData = useMemo(() => {
    const records = data?.records || []
    const months: Record<string, { month: string; دخل: number; مصروفات: number }> = {}
    
    // Last 6 months
    for (let i = 5; i >= 0; i--) {
      const d = new Date()
      d.setMonth(d.getMonth() - i)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      months[key] = {
        month: d.toLocaleDateString('ar-EG', { month: 'short' }),
        دخل: 0,
        مصروفات: 0,
      }
    }

    records.forEach((r) => {
      const key = r.date.substring(0, 7)
      if (months[key]) {
        if (r.type === 'دخل') months[key].دخل += r.amount
        if (r.type === 'مصروف') months[key].مصروفات += r.amount
      }
    })

    return Object.values(months)
  }, [data])

  const tooltipStyle = {
    backgroundColor: 'var(--color-popover)',
    border: '1px solid var(--color-border)',
    borderRadius: '12px',
    fontSize: '12px',
    direction: 'rtl' as const,
  }

  const formatAmount = (amount: number) => {
    return amount.toLocaleString('ar-EG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  }

  /* ─── Loading ─── */
  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    )
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-6 p-4 md:p-6"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <RiseIcon glyph="finance" hue="lime" size="md" lift />
          <div>
            <h2 className="text-xl font-bold text-foreground">المالية</h2>
            <p className="text-xs text-muted-foreground">تتبع دخلك ومصروفاتك واستثماراتك</p>
          </div>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <motion.div whileTap={{ scale: 0.95 }}>
              <Button className="bg-forest text-paper-soft hover:bg-forest/90 dark:bg-lime dark:text-ink dark:hover:bg-lime/90 shadow-lg rounded-xl h-10 text-sm font-semibold">
                <Plus className="w-4 h-4 me-1" />
                إضافة سجل
              </Button>
            </motion.div>
          </DialogTrigger>
          <DialogContent className="max-w-md glass border-0">
            <DialogHeader>
              <DialogTitle className="text-start flex items-center gap-2">
                <Plus className="w-5 h-5 text-lime-deep dark:text-lime" />
                سجل مالي جديد
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              {/* Type - Visual Cards instead of dropdown */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">النوع</label>
                <div className="grid grid-cols-5 gap-2">
                  {Object.entries(TYPE_CARD_CONFIG).map(([key, cfg]) => {
                    const Icon = cfg.icon
                    const isActive = form.type === key
                    return (
                      <motion.button
                        key={key}
                        type="button"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => updateForm('type', key)}
                        className={cn(
                          'rounded-xl p-2.5 flex flex-col items-center gap-1 border transition-all duration-200',
                          isActive
                            ? `${cfg.activeBg} ring-1 shadow-sm`
                            : `${cfg.bg} ${cfg.borderColor} hover:shadow-sm`
                        )}
                      >
                        <Icon className={cn(
                          'w-4 h-4 transition-colors',
                          isActive ? cfg.activeBg.split(' ')[0].replace('bg-', 'text-').split('/')[0] : 'text-muted-foreground'
                        )} style={isActive ? { color: `var(--color-${key === 'دخل' ? 'lime-deep' : key === 'مصروف' ? 'destructive' : key === 'ادخار' ? 'forest' : key === 'استثمار' ? 'glass-blue' : 'violet'})` } : undefined} />
                        <span className={cn(
                          'text-[10px] font-medium leading-tight text-center',
                          isActive ? 'text-foreground' : 'text-muted-foreground'
                        )}>
                          {cfg.label}
                        </span>
                      </motion.button>
                    )
                  })}
                </div>
              </div>

              {/* Category - Icon Grid */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">الفئة</label>
                <div className="grid grid-cols-5 gap-2">
                  {Object.entries(CATEGORY_ICONS).map(([cat, Icon]) => (
                    <motion.button
                      key={cat}
                      type="button"
                      whileHover={{ scale: 1.08 }}
                      whileTap={{ scale: 0.92 }}
                      onClick={() => updateForm('category', cat)}
                      className={cn(
                        'rounded-xl p-2.5 flex flex-col items-center gap-1 border transition-all duration-200',
                        form.category === cat
                          ? 'border-lime-deep/40 bg-lime-deep/10 ring-1 ring-lime-deep/30'
                          : 'border-transparent bg-muted/30 hover:bg-muted/50'
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="text-[9px] font-medium leading-tight text-center">{cat}</span>
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">الوصف</label>
                <Input
                  value={form.description}
                  onChange={(e) => updateForm('description', e.target.value)}
                  className="rounded-xl border-0 bg-muted/50 focus:bg-muted text-sm"
                  placeholder="وصف اختياري..."
                  dir="rtl"
                />
              </div>

              {/* Amount & Date */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-foreground">المبلغ</label>
                  <Input
                    type="number"
                    value={form.amount || ''}
                    onChange={(e) => updateForm('amount', parseFloat(e.target.value) || 0)}
                    className="rounded-xl border-0 bg-muted/50 focus:bg-muted text-sm"
                    placeholder="٠"
                    min={0}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-foreground">التاريخ</label>
                  <Input
                    type="date"
                    value={form.date}
                    onChange={(e) => updateForm('date', e.target.value)}
                    className="rounded-xl border-0 bg-muted/50 focus:bg-muted text-sm"
                  />
                </div>
              </div>

              {/* Recurring toggle */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors">
                <RainbowCheckbox
                  checked={form.recurring}
                  onChange={(v) => updateForm('recurring', v)}
                  label="مكرر شهرياً"
                  className="flex-1"
                />
                <Repeat className="w-4 h-4 text-muted-foreground" />
              </div>

              {/* Save */}
              <motion.div whileTap={{ scale: 0.98 }}>
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full bg-forest text-paper-soft hover:bg-forest/90 dark:bg-lime dark:text-ink dark:hover:bg-lime/90 shadow-lg rounded-xl h-12 text-sm font-semibold"
                >
                  {saving ? 'جاري الحفظ...' : 'حفظ السجل'}
                </Button>
              </motion.div>
            </div>
          </DialogContent>
        </Dialog>
      </motion.div>

      {/* ══════════ Budget Section ══════════ */}
      <motion.div variants={itemVariants}>
        <div className="neo-card card-lift p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <span className="icon-well iw-lime w-8 h-8">
                <Target className="w-4 h-4" />
              </span>
              الميزانية الشهرية
            </h3>
              <div className="flex items-center gap-3">
                {/* Budget Health Indicator */}
                <div className="flex items-center gap-2">
                  <div className="relative w-8 h-8">
                    <svg className="w-8 h-8 -rotate-90" viewBox="0 0 32 32">
                      <circle cx="16" cy="16" r="13" fill="none" className="stroke-primary/10" strokeWidth="3" />
                      <motion.circle
                        cx="16"
                        cy="16"
                        r="13"
                        fill="none"
                        className={
                          budgetData.overallHealth >= 60 ? 'stroke-emerald-accent' :
                          budgetData.overallHealth >= 30 ? 'stroke-gold' : 'stroke-destructive'
                        }
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeDasharray={13 * 2 * Math.PI}
                        initial={{ strokeDashoffset: 13 * 2 * Math.PI }}
                        animate={{ strokeDashoffset: 13 * 2 * Math.PI * (1 - budgetData.overallHealth / 100) }}
                        transition={{ duration: 1, ease: 'easeOut' }}
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-foreground">
                      <span className="num" dir="ltr">{toArabicNum(budgetData.overallHealth)}</span>
                    </span>
                  </div>
                  <div className="text-start">
                    <p className="text-[10px] text-muted-foreground">صحة الميزانية</p>
                    <p className={cn(
                      'text-xs font-bold',
                      budgetData.overallHealth >= 60 ? 'text-emerald-accent' :
                      budgetData.overallHealth >= 30 ? 'text-gold' : 'text-destructive'
                    )}>
                      {budgetData.overallHealth >= 60 ? 'ممتازة' : budgetData.overallHealth >= 30 ? 'متوسطة' : 'حرجة'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          <div>
            {/* Budget Impact Alert */}
            <AnimatePresence>
              {budgetImpact && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className={cn(
                    'mb-4 p-3 rounded-xl flex items-center gap-2 text-sm font-medium',
                    budgetImpact.over
                      ? 'bg-destructive/10 text-destructive border border-destructive/20'
                      : 'bg-emerald-accent/10 text-emerald-accent border border-emerald-accent/20'
                  )}
                >
                  {budgetImpact.over ? (
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                  ) : (
                    <Shield className="w-4 h-4 shrink-0" />
                  )}
                  <span>
                    {budgetImpact.over
                      ? `تجاوزت ميزانية "${budgetImpact.category}"! المتبقي: ${toArabicNum(Math.abs(budgetImpact.remaining))}`
                      : `المتبقي من "${budgetImpact.category}": ${toArabicNum(budgetImpact.remaining)}`
                    }
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Total Remaining */}
            <div className="text-center mb-5">
              <p className="text-[11px] text-muted-foreground mb-1">المتبقي من الميزانية هذا الشهر</p>
              <p className={cn(
                'text-3xl font-black tracking-tight num',
                budgetData.totalRemaining > budgetData.totalBudget * 0.3
                  ? 'text-lime-deep dark:text-lime'
                  : budgetData.totalRemaining > 0
                    ? 'text-gold'
                    : 'text-destructive'
              )} dir="ltr">
                {toArabicNum(budgetData.totalRemaining)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                أنفقت {toArabicNum(budgetData.totalSpent)} من {toArabicNum(budgetData.totalBudget)}
              </p>
            </div>

            {/* Category Budget Bars */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {budgetData.items.map((item) => {
                const Icon = item.icon
                return (
                  <div
                    key={item.name}
                    className="rounded-2xl bg-muted/20 p-3 space-y-2 group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center">
                          <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                        <span className="text-sm font-medium text-foreground">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {editingBudget === item.name ? (
                          <input
                            ref={budgetEditRef}
                            type="number"
                            defaultValue={item.limit}
                            min={0}
                            className="w-20 h-6 text-xs text-left rounded-md bg-card border border-border px-1.5 focus:outline-none focus:ring-1 focus:ring-lime-deep/50"
                            dir="ltr"
                            onBlur={(e) => {
                              const val = parseFloat(e.target.value) || 0
                              const updated = budgetCategories.map(c =>
                                c.name === item.name ? { ...c, limit: val } : c
                              )
                              setBudgetCategories(updated)
                              saveBudgets(updated)
                              setEditingBudget(null)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                (e.target as HTMLInputElement).blur()
                              }
                            }}
                            autoFocus
                          />
                        ) : (
                          <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setEditingBudget(item.name)}
                            className="text-[10px] text-muted-foreground hover:text-foreground font-medium px-1.5 py-0.5 rounded hover:bg-secondary transition-colors"
                          >
                            <span className="num" dir="ltr">{toArabicNum(item.limit)}</span>
                          </motion.button>
                        )}
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="relative h-2 rounded-full bg-secondary overflow-hidden">
                      <motion.div
                        className={cn('h-full rounded-full', item.barColor)}
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(item.percentage, 100)}%` }}
                        transition={{ duration: 0.6, ease: 'easeOut' }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>أنفقت <span className="num" dir="ltr">{toArabicNum(Math.round(item.spent))}</span></span>
                      <span className={cn(
                        item.percentage >= 100 ? 'text-destructive font-semibold' :
                        item.percentage >= 80 ? 'text-gold font-medium' : ''
                      )}>
                        {item.percentage >= 100 ? 'تجاوز!' : `${toArabicNum(Math.round(100 - item.percentage))}٪ متبقي`}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Summary Cards with colored left borders and trend arrows */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {/* Income */}
        <div className="neo-card card-lift rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 start-0 bottom-0 w-1 bg-lime-deep rounded-s-2xl" />
          <div className="p-4 flex flex-col items-center text-center gap-1 relative">
            <div className="w-8 h-8 rounded-lg bg-lime-deep/10 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-lime-deep dark:text-lime" />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xl font-bold text-lime-deep dark:text-lime count-up">
                <span className="num" dir="ltr">{formatAmount(stats.income)}</span>
              </span>
              {stats.income > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center"
                >
                  <ArrowUpRight className="w-3.5 h-3.5 text-lime-deep dark:text-lime" />
                </motion.div>
              )}
            </div>
            <span className="text-[11px] text-muted-foreground">الدخل</span>
          </div>
        </div>

        {/* Expenses */}
        <div className="neo-card card-lift rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 start-0 bottom-0 w-1 bg-destructive rounded-s-2xl" />
          <div className="p-4 flex flex-col items-center text-center gap-1 relative">
            <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center">
              <TrendingDown className="w-4 h-4 text-destructive" />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xl font-bold text-destructive count-up">
                <span className="num" dir="ltr">{formatAmount(stats.expenses)}</span>
              </span>
              {stats.expenses > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center"
                >
                  <ArrowDownRight className="w-3.5 h-3.5 text-destructive" />
                </motion.div>
              )}
            </div>
            <span className="text-[11px] text-muted-foreground">المصروفات</span>
          </div>
        </div>

        {/* Savings */}
        <div className="neo-card card-lift rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 start-0 bottom-0 w-1 bg-forest rounded-s-2xl" />
          <div className="p-4 flex flex-col items-center text-center gap-1 relative">
            <div className="w-8 h-8 rounded-lg bg-forest/10 flex items-center justify-center">
              <PiggyBank className="w-4 h-4 text-forest" />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xl font-bold text-forest count-up">
                <span className="num" dir="ltr">{formatAmount(stats.savings)}</span>
              </span>
              {stats.savings > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center"
                >
                  <ArrowUpRight className="w-3.5 h-3.5 text-forest" />
                </motion.div>
              )}
            </div>
            <span className="text-[11px] text-muted-foreground">الادخار</span>
          </div>
        </div>

        {/* Investment */}
        <div className="neo-card card-lift rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 start-0 bottom-0 w-1 bg-glass rounded-s-2xl" />
          <div className="p-4 flex flex-col items-center text-center gap-1 relative">
            <div className="w-8 h-8 rounded-lg bg-glass/10 flex items-center justify-center">
              <Landmark className="w-4 h-4 text-glass" />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xl font-bold text-glass count-up">
                <span className="num" dir="ltr">{formatAmount(stats.investment)}</span>
              </span>
              {stats.investment > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center"
                >
                  <ArrowUpRight className="w-3.5 h-3.5 text-glass" />
                </motion.div>
              )}
            </div>
            <span className="text-[11px] text-muted-foreground">الاستثمار</span>
          </div>
        </div>
      </motion.div>

      {/* Savings Goal Tracker */}
      <motion.div variants={itemVariants}>
        <div className="neo-card card-lift p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <span className="icon-well iw-forest w-8 h-8">
                <PiggyBank className="w-4 h-4" />
              </span>
              هدف الادخار
            </h3>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setSavingsGoal(prev => prev + 5000)}
              className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-secondary transition-colors"
            >
              <DollarSign className="w-3 h-3 inline me-0.5" />
              زيادة الهدف
            </motion.button>
          </div>
          <div>
            <div className="relative h-6 rounded-full bg-secondary overflow-hidden mb-2">
              <motion.div
                className="h-full rounded-full bg-gradient-to-l from-lime-deep to-lime"
                initial={{ width: 0 }}
                animate={{ width: `${savingsProgress}%` }}
                transition={{ duration: 1, ease: 'easeOut' }}
              />
              {savingsProgress >= 100 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="absolute end-2 top-1/2 -translate-y-1/2 text-sm"
                >
                  🎉
                </motion.div>
              )}
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                <span className="font-bold text-lime-deep dark:text-lime"><span className="num" dir="ltr">{formatAmount(totalSavings)}</span></span> من <span className="font-medium"><span className="num" dir="ltr">{formatAmount(savingsGoal)}</span></span>
              </span>
              <span className="font-semibold text-lime-deep dark:text-lime"><span className="num" dir="ltr">{Math.round(savingsProgress)}%</span></span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Charts Row */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Cash Flow Waterfall */}
        <div className="neo-card card-lift p-5">
          <h3 className="text-sm font-bold flex items-center gap-2 mb-3">
            <span className="icon-well iw-lime w-8 h-8">
              <Eye className="w-4 h-4" />
            </span>
            التدفق النقدي (هذا الشهر)
          </h3>
          <div>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cashFlowData} barCategoryGap="10%">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }} axisLine={false} tickLine={false} width={45} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [`${formatAmount(Math.abs(value))}`, '']} />
                  <Bar dataKey="قيمة" radius={[4, 4, 0, 0]}>
                    {cashFlowData.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Expense Pie Chart with labels and legend */}
        <div className="neo-card card-lift p-5">
          <h3 className="text-sm font-bold mb-3">توزيع المصروفات حسب الفئة</h3>
          <div>
            {expenseByCategory.length === 0 ? (
              <div className="text-center py-10">
                <span className="icon-well bg-secondary w-12 h-12 mx-auto mb-3">
                  <Receipt className="w-5 h-5 text-muted-foreground" />
                </span>
                <p className="text-sm text-muted-foreground">لا توجد مصروفات بعد</p>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <div className="h-52 w-full relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={expenseByCategory}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={85}
                        paddingAngle={3}
                        dataKey="قيمة"
                        strokeWidth={0}
                      >
                        {expenseByCategory.map((_, index) => (
                          <Cell
                            key={index}
                            fill={PIE_COLORS[index % PIE_COLORS.length]}
                            stroke="var(--color-card)"
                            strokeWidth={2}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(value: number) => [`${formatAmount(value)}`, 'المبلغ']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Center label */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-xs text-muted-foreground">المجموع</span>
                    <span className="text-sm font-bold text-foreground"><span className="num" dir="ltr">{formatAmount(expenseByCategory.reduce((s, e) => s + e.قيمة, 0))}</span></span>
                  </div>
                </div>
                {/* Legend with labels and percentages */}
                <div className="flex flex-wrap items-start gap-x-4 gap-y-2 justify-center mt-3 px-2">
                  {expenseByCategory.map((entry, index) => {
                    const total = expenseByCategory.reduce((s, e) => s + e.قيمة, 0)
                    const pct = total > 0 ? Math.round((entry.قيمة / total) * 100) : 0
                    return (
                      <div key={entry.name} className="flex items-center gap-1.5">
                        <div
                          className="w-2.5 h-2.5 rounded-sm"
                          style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
                        />
                        <span className="text-[10px] text-muted-foreground">
                          {entry.name} ({pct}%)
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Income vs Expenses Bar Chart */}
        <div className="neo-card card-lift p-5">
          <h3 className="text-sm font-bold mb-3">الدخل مقابل المصروفات</h3>
          <div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyChartData} barCategoryGap="15%">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
                    axisLine={false}
                    tickLine={false}
                    width={45}
                    tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value: number, name: string) => [
                      `${formatAmount(value)}`,
                      name,
                    ]}
                  />
                  <Bar dataKey="دخل" fill="var(--color-lime-deep)" radius={[4, 4, 0, 0]} opacity={0.85} />
                  <Bar dataKey="مصروفات" fill="var(--color-destructive)" radius={[4, 4, 0, 0]} opacity={0.85} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Monthly Summary */}
      <motion.div variants={itemVariants}>
        <div className="neo-card card-lift p-5">
          <h3 className="text-sm font-bold flex items-center gap-2 mb-4">
            <span className="icon-well iw-amber w-8 h-8">
              <Receipt className="w-4 h-4" />
            </span>
            ملخص الشهر الحالي
          </h3>
          <div>
            {(() => {
              const now = new Date()
              const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
              const monthRecords = (data?.records || []).filter((r) => r.date.startsWith(currentMonth))
              const mIncome = monthRecords.filter((r) => r.type === 'دخل').reduce((s, r) => s + r.amount, 0)
              const mExpenses = monthRecords.filter((r) => r.type === 'مصروف').reduce((s, r) => s + r.amount, 0)
              const mSavings = monthRecords.filter((r) => r.type === 'ادخار').reduce((s, r) => s + r.amount, 0)
              const mInvestment = monthRecords.filter((r) => r.type === 'استثمار').reduce((s, r) => s + r.amount, 0)
              const mSubscriptions = monthRecords.filter((r) => r.type === 'اشتراك').reduce((s, r) => s + r.amount, 0)
              const net = mIncome - mExpenses - mSavings - mInvestment - mSubscriptions
              const savingsRate = mIncome > 0 ? Math.round(((mSavings + mInvestment) / mIncome) * 100) : 0

              return (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-xl bg-muted/30 p-3 text-center">
                    <p className="text-[11px] text-muted-foreground mb-1">صافي الرصيد</p>
                    <div className="flex items-center justify-center gap-1">
                      <span className={cn('text-lg font-bold num', net >= 0 ? 'text-lime-deep dark:text-lime' : 'text-destructive')} dir="ltr">
                        {net >= 0 ? '+' : ''}{formatAmount(net)}
                      </span>
                      {net >= 0 ? (
                        <ArrowUpRight className="w-3.5 h-3.5 text-lime-deep dark:text-lime" />
                      ) : (
                        <ArrowDownRight className="w-3.5 h-3.5 text-destructive" />
                      )}
                    </div>
                  </div>
                  <div className="rounded-xl bg-muted/30 p-3 text-center">
                    <p className="text-[11px] text-muted-foreground mb-1">الاشتراكات</p>
                    <span className="text-lg font-bold text-violet-accent"><span className="num" dir="ltr">{formatAmount(mSubscriptions)}</span></span>
                  </div>
                  <div className="rounded-xl bg-muted/30 p-3 text-center">
                    <p className="text-[11px] text-muted-foreground mb-1">نسبة الادخار</p>
                    <span className="text-lg font-bold text-forest"><span className="num" dir="ltr">{savingsRate}%</span></span>
                  </div>
                  <div className="rounded-xl bg-muted/30 p-3 text-center">
                    <p className="text-[11px] text-muted-foreground mb-1">عدد العمليات</p>
                    <span className="text-lg font-bold text-foreground"><span className="num" dir="ltr">{monthRecords.length}</span></span>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      </motion.div>

      {/* Transaction List with alternating rows, colored dots, smooth delete animation */}
      <motion.div variants={itemVariants}>
        <div className="neo-card card-lift p-5">
          <h3 className="text-sm font-bold mb-4">سجل المعاملات</h3>
          <div>
            <div className="space-y-4 max-h-[600px] overflow-y-auto">
              {Object.keys(groupedRecords).length === 0 ? (
                <div className="text-center py-10">
                  <span className="icon-well bg-secondary w-12 h-12 mx-auto mb-3">
                    <Wallet className="w-5 h-5 text-muted-foreground" />
                  </span>
                  <p className="text-sm text-muted-foreground">لا توجد معاملات بعد</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">اضغط &quot;إضافة سجل&quot; للبدء</p>
                </div>
              ) : (
                Object.entries(groupedRecords).map(([type, records]) => {
                  const config = TYPE_CONFIG[type]
                  if (!config) return null
                  const Icon = config.icon
                  const total = records.reduce((s, r) => s + r.amount, 0)

                  return (
                    <div key={type}>
                      {/* Group header */}
                      <div className="flex items-center gap-2 mb-2 px-1">
                        <div className={cn('w-6 h-6 rounded-md flex items-center justify-center', config.color)}>
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-sm font-semibold text-foreground">{config.label}</span>
                        <span className="pill pill-muted"><span className="num" dir="ltr">{records.length}</span></span>
                        <span className="text-xs text-muted-foreground ms-auto">
                          <span className="num" dir="ltr">{formatAmount(total)}</span>
                        </span>
                      </div>

                      {/* Records with alternating backgrounds and colored dots */}
                      <div className="space-y-1.5 mb-4">
                        <AnimatePresence mode="popLayout">
                          {records.map((record, index) => {
                            const CatIcon = CATEGORY_ICONS[record.category] || Receipt
                            const isPositive = record.type === 'دخل'
                            const isSavings = record.type === 'ادخار' || record.type === 'استثمار'
                            return (
                              <motion.div
                                key={record.id}
                                layout
                                initial={{ opacity: 0, y: 20, scale: 0.97 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, x: -30, scale: 0.9, height: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0, transition: { duration: 0.3, ease: 'easeIn' as const } }}
                                transition={{
                                  layout: { duration: 0.3 },
                                  delay: index * 0.03,
                                }}
                                className={cn(
                                  'flex items-center gap-3 p-3 rounded-xl transition-all duration-200 group relative overflow-hidden',
                                  index % 2 === 0 ? 'bg-muted/20' : 'bg-transparent',
                                  'hover:shadow-sm hover:bg-muted/30'
                                )}
                              >
                                {/* Colored type dot */}
                                <div className={cn('w-2 h-2 rounded-full shrink-0', config.dotColor)} />

                                <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', config.color)}>
                                  <CatIcon className="w-4 h-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-foreground truncate">
                                      {record.description || record.category}
                                    </span>
                                    {record.recurring && (
                                      <Repeat className="w-3 h-3 text-muted-foreground shrink-0" />
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                    <span>{record.category}</span>
                                    <span>•</span>
                                    <span>
                                      {new Date(record.date).toLocaleDateString('ar-EG', {
                                        month: 'short',
                                        day: 'numeric',
                                      })}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <div className="text-start">
                                    <span className={cn(
                                      'text-sm font-bold num',
                                      isPositive ? 'text-lime-deep dark:text-lime' : isSavings ? 'text-glass' : 'text-destructive'
                                    )} dir="ltr">
                                      {isPositive ? '+' : isSavings ? '+' : '-'}{formatAmount(record.amount)}
                                    </span>
                                    <div className="flex items-center gap-1 mt-0.5 justify-end">
                                      {isPositive && <span className="pill pill-lime">دخل</span>}
                                      {isSavings && <span className="pill pill-success">ادخار</span>}
                                      {!isPositive && !isSavings && <span className="pill bg-destructive/10 text-destructive">مصروف</span>}
                                    </div>
                                  </div>
                                  <motion.button
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.85 }}
                                    onClick={() => handleDelete(record.id)}
                                    disabled={deleting === record.id}
                                    className="opacity-0 group-hover:opacity-100 transition-all duration-200 p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                                  >
                                    {deleting === record.id ? (
                                      <motion.div
                                        animate={{ rotate: 360 }}
                                        transition={{ duration: 0.5, repeat: Infinity, ease: 'linear' }}
                                        className="w-3.5 h-3.5 border-2 border-destructive/30 border-t-destructive rounded-full"
                                      />
                                    ) : (
                                      <Trash2 className="w-3.5 h-3.5" />
                                    )}
                                  </motion.button>
                                </div>
                              </motion.div>
                            )
                          })}
                        </AnimatePresence>
                      </div>

                      <Separator className="my-2" />
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}// Force recompile: 1785702715
