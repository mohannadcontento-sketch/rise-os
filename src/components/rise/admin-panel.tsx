'use client'

// ============================================================
// admin-panel.tsx — لوحة الإدارة (القشرة الرئيسية)
//
// تاب-بار بثمانية أقسام؛ كل تاب مكوّن مستقل في ملفه الخاص
// (admin-*-tab.tsx) والقشرة هنا تملك فقط حالة التاب النشط وحوار
// البث الجماعي. الوصول للوحة كله عبر requireAdmin على مسارات API.
//
// التابات: النظرة العامة · المستخدمون · الاشتراكات · المجتمع ·
// الصحة والأخطاء · سجل الإدارة · الإحصاءات · قاعدة البيانات · المفاتيح
// ============================================================

import { useState } from 'react'

import {
  Shield,
  Users,
  Database,
  Key,
  Crown,
  BarChart3,
  Activity,
  TrendingUp,
} from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import { useRiseStore } from '@/store/app-store'
import { RiseIcon } from './icons'
import { UserManagementTab } from './admin-users-tab'
import { SystemStatsTab } from './admin-system-stats-tab'
import { DatabaseTab } from './admin-database-tab'
import { ApiKeysTab } from './admin-api-keys-tab'
import { HealthErrorsTab } from './admin-health-errors-tab'
import { OverviewTab } from './admin-overview-tab'
import { BroadcastDialog } from './admin-broadcast-dialog'
import { AuditTab } from './admin-audit-tab'
import { AdminCommunityTab } from './admin-community-tab'
import { AdminSubscriptionsTab } from './admin-subscriptions-tab'
import { SystemStats } from './admin-panel-utils'

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
          <TabsTrigger value="subscriptions" className="gap-1.5 text-xs sm:text-sm data-[state=active]:bg-background">
            <Crown className="w-3.5 h-3.5" />
            <span>الاشتراكات</span>
          </TabsTrigger>
          <TabsTrigger value="community" className="gap-1.5 text-xs sm:text-sm data-[state=active]:bg-background">
            <Users className="w-3.5 h-3.5" />
            <span>المجتمع</span>
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
        <TabsContent value="subscriptions">
          <AdminSubscriptionsTab />
        </TabsContent>
        <TabsContent value="community">
          <AdminCommunityTab />
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
