'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
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
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

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

const TYPE_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType; amountColor: string }> = {
  دخل: { label: 'الدخل', color: 'bg-emerald-accent/10 text-emerald-accent', icon: TrendingUp, amountColor: 'text-emerald-accent' },
  مصروف: { label: 'المصروفات', color: 'bg-orange-500/10 text-orange-500', icon: TrendingDown, amountColor: 'text-orange-500' },
  ادخار: { label: 'الادخار', color: 'bg-forest/10 text-forest', icon: PiggyBank, amountColor: 'text-forest' },
  استثمار: { label: 'الاستثمار', color: 'bg-sky-500/10 text-sky-500', icon: Landmark, amountColor: 'text-sky-500' },
  اشتراك: { label: 'الاشتراكات', color: 'bg-purple-500/10 text-purple-500', icon: CreditCard, amountColor: 'text-purple-500' },
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
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
}

const EMPTY_FORM = {
  type: 'مصروف',
  category: '',
  description: '',
  amount: 0,
  date: new Date().toISOString().split('T')[0],
  recurring: false,
}

/* ────────────── Component ────────────── */

export default function Finance() {
  const [data, setData] = useState<FinanceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const [form, setForm] = useState({ ...EMPTY_FORM })

  /* ─── Fetch ─── */
  const fetchFinance = useCallback(async () => {
    try {
      const res = await fetch('/api/rise/finance')
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
  }, [fetchFinance])

  /* ─── Save Record ─── */
  const handleSave = async () => {
    if (!form.category || !form.amount) {
      toast.error('يرجى ملء الفئة والمبلغ')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/rise/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        toast.success('تم إضافة السجل بنجاح ✨')
        setDialogOpen(false)
        setForm({ ...EMPTY_FORM, date: new Date().toISOString().split('T')[0] })
        fetchFinance()
      } else {
        toast.error('فشل في إضافة السجل')
      }
    } catch {
      toast.error('حدث خطأ أثناء الحفظ')
    } finally {
      setSaving(false)
    }
  }

  /* ─── Delete Record ─── */
  const handleDelete = async (id: string) => {
    setDeleting(id)
    try {
      const res = await fetch(`/api/rise/finance?id=${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('تم حذف السجل')
        fetchFinance()
      }
    } catch {
      toast.error('فشل في حذف السجل')
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
        month: d.toLocaleDateString('ar-SA', { month: 'short' }),
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
    return amount.toLocaleString('ar-SA', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
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
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-forest to-emerald-accent flex items-center justify-center shadow-lg">
            <Wallet className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">المالية</h2>
            <p className="text-xs text-muted-foreground">تتبع دخلك ومصروفاتك واستثماراتك</p>
          </div>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <motion.div whileTap={{ scale: 0.95 }}>
              <Button className="bg-gradient-to-l from-emerald-accent to-forest hover:opacity-90 text-white shadow-lg rounded-xl h-10 text-sm font-semibold">
                <Plus className="w-4 h-4 ml-1" />
                إضافة سجل
              </Button>
            </motion.div>
          </DialogTrigger>
          <DialogContent className="max-w-md glass border-0">
            <DialogHeader>
              <DialogTitle className="text-right flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-accent" />
                سجل مالي جديد
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              {/* Type */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">النوع</label>
                <Select
                  value={form.type}
                  onValueChange={(val) => updateForm('type', val)}
                >
                  <SelectTrigger className="rounded-xl border-0 bg-muted/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
                      <SelectItem key={key} value={key}>
                        {cfg.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Category */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">الفئة</label>
                <Input
                  value={form.category}
                  onChange={(e) => updateForm('category', e.target.value)}
                  className="rounded-xl border-0 bg-muted/50 focus:bg-muted text-sm"
                  placeholder="مثال: طعام، مواصلات..."
                  dir="rtl"
                />
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
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors">
                <input
                  type="checkbox"
                  checked={form.recurring}
                  onChange={(e) => updateForm('recurring', e.target.checked)}
                  className="w-4 h-4 rounded accent-emerald-accent"
                />
                <Repeat className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-foreground">مكرر شهرياً</span>
              </label>

              {/* Save */}
              <motion.div whileTap={{ scale: 0.98 }}>
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full bg-gradient-to-l from-emerald-accent to-forest hover:opacity-90 text-white shadow-lg rounded-xl h-12 text-sm font-semibold"
                >
                  {saving ? 'جاري الحفظ...' : 'حفظ السجل'}
                </Button>
              </motion.div>
            </div>
          </DialogContent>
        </Dialog>
      </motion.div>

      {/* Summary Cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {/* Income */}
        <Card className="glass border-0 shadow-sm">
          <CardContent className="p-4 flex flex-col items-center text-center gap-1">
            <div className="w-8 h-8 rounded-lg bg-emerald-accent/10 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-emerald-accent" />
            </div>
            <span className="text-xl font-bold text-emerald-accent count-up">
              {formatAmount(stats.income)}
            </span>
            <span className="text-[11px] text-muted-foreground">الدخل</span>
          </CardContent>
        </Card>

        {/* Expenses */}
        <Card className="glass border-0 shadow-sm">
          <CardContent className="p-4 flex flex-col items-center text-center gap-1">
            <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
              <TrendingDown className="w-4 h-4 text-orange-500" />
            </div>
            <span className="text-xl font-bold text-orange-500 count-up">
              {formatAmount(stats.expenses)}
            </span>
            <span className="text-[11px] text-muted-foreground">المصروفات</span>
          </CardContent>
        </Card>

        {/* Savings */}
        <Card className="glass border-0 shadow-sm">
          <CardContent className="p-4 flex flex-col items-center text-center gap-1">
            <div className="w-8 h-8 rounded-lg bg-forest/10 flex items-center justify-center">
              <PiggyBank className="w-4 h-4 text-forest" />
            </div>
            <span className="text-xl font-bold text-forest count-up">
              {formatAmount(stats.savings)}
            </span>
            <span className="text-[11px] text-muted-foreground">الادخار</span>
          </CardContent>
        </Card>

        {/* Investment */}
        <Card className="glass border-0 shadow-sm">
          <CardContent className="p-4 flex flex-col items-center text-center gap-1">
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 flex items-center justify-center">
              <Landmark className="w-4 h-4 text-sky-500" />
            </div>
            <span className="text-xl font-bold text-sky-500 count-up">
              {formatAmount(stats.investment)}
            </span>
            <span className="text-[11px] text-muted-foreground">الاستثمار</span>
          </CardContent>
        </Card>
      </motion.div>

      {/* Charts Row */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Expense Pie Chart */}
        <Card className="glass border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold">توزيع المصروفات حسب الفئة</CardTitle>
          </CardHeader>
          <CardContent>
            {expenseByCategory.length === 0 ? (
              <div className="text-center py-10">
                <Receipt className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">لا توجد مصروفات بعد</p>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <div className="h-52 w-full">
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
                      >
                        {expenseByCategory.map((_, index) => (
                          <Cell
                            key={index}
                            fill={PIE_COLORS[index % PIE_COLORS.length]}
                            stroke="none"
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(value: number) => [`${formatAmount(value)} ر.س`, 'المبلغ']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {/* Legend */}
                <div className="flex flex-wrap items-center gap-2 justify-center mt-2 px-2">
                  {expenseByCategory.map((entry, index) => (
                    <div key={entry.name} className="flex items-center gap-1.5">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
                      />
                      <span className="text-[10px] text-muted-foreground">{entry.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Income vs Expenses Bar Chart */}
        <Card className="glass border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold">الدخل مقابل المصروفات</CardTitle>
          </CardHeader>
          <CardContent>
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
                      `${formatAmount(value)} ر.س`,
                      name,
                    ]}
                  />
                  <Bar dataKey="دخل" fill="var(--color-emerald-accent)" radius={[4, 4, 0, 0]} opacity={0.85} />
                  <Bar dataKey="مصروفات" fill="var(--color-orange-500)" radius={[4, 4, 0, 0]} opacity={0.85} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Monthly Summary */}
      <motion.div variants={itemVariants}>
        <Card className="glass border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Receipt className="w-4 h-4 text-gold" />
              ملخص الشهر الحالي
            </CardTitle>
          </CardHeader>
          <CardContent>
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
                    <span className={cn('text-lg font-bold', net >= 0 ? 'text-emerald-accent' : 'text-orange-500')}>
                      {net >= 0 ? '+' : ''}{formatAmount(net)}
                    </span>
                  </div>
                  <div className="rounded-xl bg-muted/30 p-3 text-center">
                    <p className="text-[11px] text-muted-foreground mb-1">الاشتراكات</p>
                    <span className="text-lg font-bold text-purple-500">{formatAmount(mSubscriptions)}</span>
                  </div>
                  <div className="rounded-xl bg-muted/30 p-3 text-center">
                    <p className="text-[11px] text-muted-foreground mb-1">نسبة الادخار</p>
                    <span className="text-lg font-bold text-forest">{savingsRate}%</span>
                  </div>
                  <div className="rounded-xl bg-muted/30 p-3 text-center">
                    <p className="text-[11px] text-muted-foreground mb-1">عدد العمليات</p>
                    <span className="text-lg font-bold text-foreground">{monthRecords.length}</span>
                  </div>
                </div>
              )
            })()}
          </CardContent>
        </Card>
      </motion.div>

      {/* Transaction List */}
      <motion.div variants={itemVariants}>
        <Card className="glass border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold">سجل المعاملات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 max-h-[600px] overflow-y-auto">
              {Object.keys(groupedRecords).length === 0 ? (
                <div className="text-center py-10">
                  <Wallet className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
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
                        <Badge variant="secondary" className="text-[10px] rounded-full bg-muted text-muted-foreground border-0">
                          {records.length}
                        </Badge>
                        <span className="text-xs text-muted-foreground mr-auto">
                          {formatAmount(total)} ر.س
                        </span>
                      </div>

                      {/* Records */}
                      <div className="space-y-1.5 mb-4">
                        <AnimatePresence>
                          {records.map((record, index) => {
                            const CatIcon = CATEGORY_ICONS[record.category] || Receipt
                            const isPositive = record.type === 'دخل'
                            return (
                              <motion.div
                                key={record.id}
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                transition={{ delay: index * 0.02 }}
                                className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/30 transition-colors group"
                              >
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
                                      {new Date(record.date).toLocaleDateString('ar-SA', {
                                        month: 'short',
                                        day: 'numeric',
                                      })}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <div className="text-left">
                                    <span className={cn('text-sm font-bold', config.amountColor)}>
                                      {isPositive ? '+' : '-'}{formatAmount(record.amount)}
                                    </span>
                                  </div>
                                  <motion.button
                                    whileTap={{ scale: 0.9 }}
                                    onClick={() => handleDelete(record.id)}
                                    disabled={deleting === record.id}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
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
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}