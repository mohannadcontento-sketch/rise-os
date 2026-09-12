'use client'

// ============================================================
// admin-system-stats-tab.tsx — تاب «إحصاءات النظام»
//
// بطاقات إحصاء حيّة (المستخدمون/المستوى/السلاسل/الجداول) من
// /api/rise/admin/stats مع StatCard المحلي الموحّد الشكل.
// ============================================================

import { useState, useEffect, useCallback } from 'react'

import {
  Activity,
  BarChart3,
  BookOpen,
  Brain,
  CalendarDays,
  CheckSquare,
  Database,
  Flame,
  HardDrive,
  RefreshCw,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatsSkeleton } from './admin-shared'
import { apiFetch } from '@/lib/api-fetch'
import { SystemStats, toArabicNum, formatBytes, timeAgo } from './admin-panel-utils'

/* ═══════════════ System Stats Tab ═══════════════ */

export function SystemStatsTab() {
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


