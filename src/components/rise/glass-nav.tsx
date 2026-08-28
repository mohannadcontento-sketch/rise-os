"use client";

/**
 * GlassNav — mobile bottom navigation (glassmorphism, component-a language)
 * Forest-tinted glass keeps white labels ≥4.5:1 over any page content,
 * lime dot + white pill mark the active item, spring press feedback.
 */

import { LayoutDashboard, CheckSquare, Flame, CalendarDays, Wallet } from "lucide-react";
import { useRiseStore } from "@/store/app-store";
import type { ModuleId } from "@/store/app-store";
import { cn } from "@/lib/utils";

const NAV_ITEMS: { id: ModuleId; label: string; icon: React.ElementType }[] = [
  { id: "dashboard", label: "الرئيسية", icon: LayoutDashboard },
  { id: "tasks", label: "المهام", icon: CheckSquare },
  { id: "habits", label: "العادات", icon: Flame },
  { id: "planner", label: "المخطط", icon: CalendarDays },
  { id: "finance", label: "المالية", icon: Wallet },
];

export function GlassNav() {
  const activeModule = useRiseStore((s) => s.activeModule);
  const setActiveModule = useRiseStore((s) => s.setActiveModule);

  return (
    <nav
      aria-label="التنقل السريع"
      className="glass-nav fixed bottom-3 z-50 flex items-center gap-1 p-1.5 ltr:left-1/2 ltr:-translate-x-1/2 rtl:right-1/2 rtl:translate-x-1/2 lg:hidden"
    >
      {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
        const active = activeModule === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setActiveModule(id)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "glass-nav-item relative flex min-w-[56px] flex-col items-center gap-0.5 rounded-[99rem] px-3 py-1.5",
              active ? "bg-white/90 shadow-sm" : "text-white/85"
            )}
          >
            <Icon
              className={cn("h-[18px] w-[18px]", active ? "text-ink" : "text-white")}
              aria-hidden="true"
            />
            <span
              className={cn(
                "text-[10px] font-bold leading-none",
                active ? "text-ink" : "text-white"
              )}
            >
              {label}
            </span>
            {active ? (
              <span aria-hidden="true" className="absolute -top-0.5 h-1 w-1 rounded-full bg-lime" />
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
