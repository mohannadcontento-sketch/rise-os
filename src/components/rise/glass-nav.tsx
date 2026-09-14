"use client";

/**
 * GlassNav — mobile bottom navigation (glassmorphism, component-a language)
 *
 * Visual system (Phase 17 polish, owner request «حسّن شكل البار السفلي»):
 *   • Active tab = soft glass zone (white/13 + hairline ring) — reads as a
 *     selected section, not a CTA/FAB (the old solid-white pill was ambiguous).
 *   • Active icon sits in its module-hue well (same identity as the desktop
 *     sidebar active row) with a spring pop-in.
 *   • A lime indicator bar hugs the pill's top edge over the active tab —
 *     the classic «selected tab» affordance, replacing the floating dot.
 *   • Inactive items: bare glyphs, slightly dimmed, press-scale feedback.
 *   • Day: forest glass + hairline + top highlight · Night: navy glass +
 *     sky hairline + ambient glow — both stay separated from page content.
 *
 * Labels: bar-width budget aliases. MODULE_LABELS stays the single source
 * for module names (title + sidebar); the bar alone shortens
 * «تتبع العادات» → «العادات» and «المخطط اليومي» → «المخطط» so the pill
 * fits 320px viewports without truncation.
 *
 * Community hue: locally violet — its forest identity would vanish on the
 * forest glass (sidebar keeps forest; backgrounds differ, so does the tint).
 */

import { useRiseStore } from "@/store/app-store";
import type { ModuleId } from "@/store/app-store";
import { cn } from "@/lib/utils";
import { MODULE_ICONS, RiseGlyphIcon, type RiseGlyph, type RiseHue } from "./icons";
import { MODULE_LABELS } from "@/lib/module-labels";

// Unified labels come from MODULE_LABELS (same names as desktop sidebar + page
// title) except the two width-budget aliases documented above.
// FIX (owner: «مش شايف تاب المجتمع»): community replaces finance in the 5-slot
// mobile bar — finance stays fully reachable via the sidebar («المال والمراجعة»).
const NAV_ITEMS: { id: ModuleId; label: string; glyph: RiseGlyph; hue: RiseHue }[] = [
  { id: "dashboard", label: MODULE_LABELS.dashboard, glyph: MODULE_ICONS.dashboard.glyph, hue: "lime" },
  { id: "tasks", label: MODULE_LABELS.tasks, glyph: MODULE_ICONS.tasks.glyph, hue: "blue" },
  { id: "habits", label: "العادات", glyph: MODULE_ICONS.habits.glyph, hue: "lime" },
  { id: "planner", label: "المخطط", glyph: MODULE_ICONS.planner.glyph, hue: "cyan" },
  { id: "community", label: MODULE_LABELS.community, glyph: MODULE_ICONS.community.glyph, hue: "violet" },
];

export function GlassNav() {
  const activeModule = useRiseStore((s) => s.activeModule);
  const setActiveModule = useRiseStore((s) => s.setActiveModule);

  return (
    <nav
      aria-label="التنقل السريع"
      className="glass-nav fixed z-50 flex items-center gap-1 p-[6px] ltr:left-1/2 ltr:-translate-x-1/2 rtl:right-1/2 rtl:translate-x-1/2 lg:hidden"
      style={{ bottom: "calc(0.875rem + env(safe-area-inset-bottom, 0px))" }}
    >
      {NAV_ITEMS.map(({ id, label, glyph, hue }) => {
        const active = activeModule === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setActiveModule(id)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "glass-nav-item relative flex h-[52px] min-w-[54px] flex-col items-center justify-center gap-[3px] rounded-[1.1rem] px-2 outline-none",
              "focus-visible:ring-2 focus-visible:ring-white/70",
              active
                ? "bg-white/[0.13] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.16)]"
                : "text-white/80"
            )}
          >
            {active ? (
              <span
                aria-hidden="true"
                className={cn("icon-well nav-well size-[28px] rounded-[0.65rem]", `iw-${hue}`)}
              >
                <RiseGlyphIcon glyph={glyph} size={16} />
              </span>
            ) : (
              <RiseGlyphIcon glyph={glyph} size={19} className="text-white/80" />
            )}
            <span
              className={cn(
                "max-w-[72px] truncate text-[10px] leading-none",
                active ? "font-extrabold text-white" : "font-bold text-white/70"
              )}
            >
              {label}
            </span>
            {active ? (
              <span
                aria-hidden="true"
                className="nav-indicator absolute -top-[6px] left-1/2 h-[3px] w-7 rounded-full bg-lime shadow-[0_2px_10px_rgba(214,255,61,0.6)]"
              />
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
