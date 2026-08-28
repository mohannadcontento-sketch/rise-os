"use client";

/**
 * GlassNav — mobile bottom navigation (glassmorphism, component-a language)
 * Forest-tinted glass keeps white labels ≥4.5:1 over any page content,
 * lime dot + white pill mark the active item, spring press feedback.
 */

import { useRiseStore } from "@/store/app-store";
import type { ModuleId } from "@/store/app-store";
import { cn } from "@/lib/utils";
import { MODULE_ICONS, RiseGlyphIcon, type RiseGlyph } from "./icons";

const NAV_ITEMS: { id: ModuleId; label: string; glyph: RiseGlyph }[] = [
  { id: "dashboard", label: "الرئيسية", glyph: MODULE_ICONS.dashboard.glyph },
  { id: "tasks", label: "المهام", glyph: MODULE_ICONS.tasks.glyph },
  { id: "habits", label: "العادات", glyph: MODULE_ICONS.habits.glyph },
  { id: "planner", label: "المخطط", glyph: MODULE_ICONS.planner.glyph },
  { id: "finance", label: "المالية", glyph: MODULE_ICONS.finance.glyph },
];

export function GlassNav() {
  const activeModule = useRiseStore((s) => s.activeModule);
  const setActiveModule = useRiseStore((s) => s.setActiveModule);

  return (
    <nav
      aria-label="التنقل السريع"
      className="glass-nav fixed bottom-3 z-50 flex items-center gap-1 p-1.5 ltr:left-1/2 ltr:-translate-x-1/2 rtl:right-1/2 rtl:translate-x-1/2 lg:hidden"
    >
      {NAV_ITEMS.map(({ id, label, glyph }) => {
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
            <RiseGlyphIcon
              glyph={glyph}
              size={18}
              className={cn(active ? "text-ink" : "text-white")}
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
