import type { ModuleId } from "@/lib/types";
import {
  LayoutDashboard, Sunrise, CalendarDays, CheckSquare, FolderKanban,
  Target, Repeat, BookOpen, Brain, BookHeart, GraduationCap, HeartPulse,
  Wallet, Calendar, Lightbulb, ClipboardList, BarChart3, Bot, Settings,
  type LucideIcon,
} from "lucide-react";

export interface ModuleDef {
  id: ModuleId;
  label: string;
  icon: LucideIcon;
  group: "main" | "growth" | "manage" | "knowledge" | "review" | "ai" | "system";
  desc: string;
  ready?: boolean;
}

export const MODULE_GROUPS: Record<ModuleDef["group"], string> = {
  main: "الأساسية",
  growth: "النمو الشخصي",
  manage: "الإدارة",
  knowledge: "المعرفة",
  review: "المراجعة والتحليل",
  ai: "الذكاء",
  system: "النظام",
};

export const MODULES: ModuleDef[] = [
  { id: "dashboard", label: "لوحة التحكم", icon: LayoutDashboard, group: "main", desc: "نظرة شاملة على يومك", ready: true },
  { id: "morning", label: "الروتين الصباحي", icon: Sunrise, group: "main", desc: "٧ خطوات لصباح مثالي", ready: true },
  { id: "planner", label: "المخطط اليومي", icon: CalendarDays, group: "main", desc: "خطط صباحك ومساءك" },
  { id: "tasks", label: "المهام", icon: CheckSquare, group: "main", desc: "Kanban مع سحب وإفلات", ready: true },
  { id: "projects", label: "المشاريع", icon: FolderKanban, group: "main", desc: "تتبع تقدم مشاريعك", ready: true },
  { id: "goals", label: "الأهداف", icon: Target, group: "main", desc: "أهداف سنوية وشهرية", ready: true },
  { id: "habits", label: "العادات", icon: Repeat, group: "growth", desc: "خريطة حرارية وسلاسل", ready: true },
  { id: "journal", label: "اليوميات", icon: BookOpen, group: "growth", desc: "مزاجك وطاقتك يومياً", ready: true },
  { id: "deep-work", label: "العمل العميق", icon: Brain, group: "growth", desc: "بومودورو ووضع تركيز", ready: true },
  { id: "reading", label: "القراءة", icon: BookHeart, group: "growth", desc: "تتبع كتبك وقراءاتك" },
  { id: "learning", label: "التعلم", icon: GraduationCap, group: "growth", desc: "شجرة مهاراتك" },
  { id: "health", label: "الصحة", icon: HeartPulse, group: "growth", desc: "نوم وماء وخطوات" },
  { id: "finance", label: "المالية", icon: Wallet, group: "manage", desc: "إيرادات ومصروفات" },
  { id: "calendar", label: "التقويم", icon: Calendar, group: "manage", desc: "عرض شهري وأسبوعي" },
  { id: "second-brain", label: "الدماغ الثاني", icon: Lightbulb, group: "knowledge", desc: "التقاط سريع للأفكار" },
  { id: "weekly-review", label: "مراجعة أسبوعية", icon: ClipboardList, group: "review", desc: "مراجعة وحساب ختامي" },
  { id: "monthly-review", label: "مراجعة شهرية", icon: BarChart3, group: "review", desc: "الشهر في أرقام" },
  { id: "analytics", label: "التحليلات", icon: BarChart3, group: "review", desc: "درجة أدائك وتحليلات" },
  { id: "ai-coach", label: "المدرب الذكي", icon: Bot, group: "ai", desc: "مدربك الشخصي بالعربية", ready: true },
  { id: "settings", label: "الإعدادات", icon: Settings, group: "system", desc: "ملفك وتفضيلاتك", ready: true },
];

export const READY_MODULES = MODULES.filter((m) => m.ready).map((m) => m.id);
