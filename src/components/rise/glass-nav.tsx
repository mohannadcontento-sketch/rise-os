"use client";

/**
 * GlassNav — mobile bottom navigation (glassmorphism, component-a language)
 *
 * Phase 18 (UX_FOUNDATION §4.1): the bar carries 5 STRUCTURAL roles —
 * مركز (الرئيسية) · استكفاف (استكشف Hub) · إضافة (+ Quick Add) ·
 * اجتماعي (المجتمع) · ذات (حسابي → بطاقة الحساب).
 *
 * tasks/habits/planner left the bar — NOT deleted, relocated: the day
 * lives in Home/لقطة اليوم and the 18 modules live behind «استكشف»
 * (their hub). Every module is ≤ 2 taps away (§4.3 contract).
 *
 * Active logic (IA-true):
 *   • الرئيسية  → activeModule === 'dashboard'
 *   • استكشف    → explore itself OR any world module (the 18 modules
 *                 live under استكشف in the mobile IA — the highlight
 *                 doubles as the «back to hub» affordance)
 *   • المجتمع   → 'community' (independent point — ruling §9/4)
 *   • حسابي     → 'settings' or the account sheet open (ruling §9/6)
 *   • +         → action, never active (opens the Quick Add sheet)
 *
 * Visual system (Phase 17 polish, kept): active tab = soft glass zone
 * (white/13 + hairline ring), icon in its hue well with spring pop,
 * lime indicator bar hugging the pill's top edge; night = navy glass
 * + sky hairline + glow. The + sits in a permanent emerald gradient
 * well — the one loud element, because creating is the loudest intent.
 *
 * Bar-local hues (documented Phase-17 deviation): community = violet
 * and حسابي = amber — their forest identities would vanish on the
 * forest glass; the sidebar keeps the canonical hues.
 */

import { Fragment, useMemo } from "react";
import { Plus } from "lucide-react";
import { useRiseStore } from "@/store/app-store";
import type { ModuleId } from "@/store/app-store";
import { cn } from "@/lib/utils";
import { MODULE_ICONS, RiseGlyphIcon, type RiseGlyph, type RiseHue } from "./icons";
import { MODULE_LABELS } from "@/lib/module-labels";
import { WORLDS } from "@/lib/worlds";

/** الوحدات التي تعيش تحت «استكشف» في هندسة الجوال (١٨) */
const WORLD_MODULE_IDS = new Set<string>(WORLDS.flatMap((w) => w.items));

interface NavDestination {
  id: ModuleId;
  /** التسمية الظاهرة — من MODULE_LABELS (مصدر التسمية الوحيد) */
  label: string;
  glyph: RiseGlyph;
  hue: RiseHue;
  /** يفتح بطاقة الحساب بدل الانتقال المباشر (حسم §9/6) */
  opensAccount?: boolean;
}

const DESTINATIONS: NavDestination[] = [
  { id: "dashboard", label: MODULE_LABELS.dashboard, glyph: MODULE_ICONS.dashboard.glyph, hue: "lime" },
  { id: "explore", label: MODULE_LABELS.explore, glyph: MODULE_ICONS.explore.glyph, hue: "cyan" },
  { id: "community", label: MODULE_LABELS.community, glyph: MODULE_ICONS.community.glyph, hue: "violet" },
  { id: "settings", label: "حسابي", glyph: MODULE_ICONS.settings.glyph, hue: "amber", opensAccount: true },
];

export function GlassNav({
  onQuickAdd,
  onAccount,
  accountOpen,
}: {
  /** + يفتح الإضافة السريعة (sheet الصدفة — المرحلة 17) */
  onQuickAdd: () => void;
  /** حسابي يفتح بطاقة الحساب السريعة (حسم §9/6) */
  onAccount: () => void;
  accountOpen: boolean;
}) {
  const activeModule = useRiseStore((s) => s.activeModule);
  const setActiveModule = useRiseStore((s) => s.setActiveModule);

  const isActive = useMemo(
    () => ({
      dashboard: activeModule === "dashboard",
      explore: activeModule === "explore" || WORLD_MODULE_IDS.has(activeModule),
      community: activeModule === "community",
      settings: activeModule === "settings" || accountOpen,
    }),
    [activeModule, accountOpen],
  );

  return (
    <nav
      aria-label="التنقل السريع"
      className="glass-nav fixed z-50 flex items-center gap-1 p-[6px] ltr:left-1/2 ltr:-translate-x-1/2 rtl:right-1/2 rtl:translate-x-1/2 lg:hidden"
      style={{ bottom: "calc(0.875rem + env(safe-area-inset-bottom, 0px))" }}
    >
      {/* الرئيسية · استكشف · + · المجتمع · حسابي — الأدوار الخمسة
          (§4.1): البنية بلا حلقة حقن بديلة — + يُدرج بين استكشف
          والمجتمع والوجهات الأربع تُرسم كلها (خلل النسخة الأولية:
          الحقن بـ index كان يستبدل تاب المجتمع) */}
      {DESTINATIONS.map((dest, i) => (
        <Fragment key={dest.id}>
          {i === 2 && (
            <button
              type="button"
              onClick={onQuickAdd}
              aria-label="إضافة سريعة"
              className={cn(
                "relative flex h-[52px] min-w-[54px] flex-col items-center justify-center gap-[3px] rounded-[1.1rem] px-2 outline-none",
                "focus-visible:ring-2 focus-visible:ring-white/70 active:scale-95 transition-transform",
              )}
            >
              <span
                aria-hidden="true"
                className="nav-well icon-well size-[30px] rounded-[0.7rem]
                           bg-gradient-to-br from-emerald-accent to-forest text-white
                           shadow-[0_4px_14px_-4px_rgba(16,185,129,0.65)]"
              >
                <Plus className="w-[18px] h-[18px]" strokeWidth={2.5} />
              </span>
              <span className="text-[10px] leading-none font-bold text-white/85">أضف</span>
            </button>
          )}

          <NavTabButton dest={dest} active={isActive[dest.id]} onSelect={dest.opensAccount ? onAccount : () => setActiveModule(dest.id)} />
        </Fragment>
      ))}
    </nav>
  );
}

/** وجهة واحدة — نفس لغة التصميم المقاسة في المرحلة 17 */
function NavTabButton({
  dest,
  active,
  onSelect,
}: {
  dest: NavDestination;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "page" : undefined}
      aria-label={dest.opensAccount ? "بطاقة حسابي" : dest.label}
      className={cn(
        "glass-nav-item relative flex h-[52px] min-w-[54px] flex-col items-center justify-center gap-[3px] rounded-[1.1rem] px-2 outline-none",
        "focus-visible:ring-2 focus-visible:ring-white/70",
        active
          ? "bg-white/[0.13] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.16)]"
          : "text-white/80",
      )}
    >
      {active ? (
        <span
          aria-hidden="true"
          className={cn("icon-well nav-well size-[28px] rounded-[0.65rem]", `iw-${dest.hue}`)}
        >
          <RiseGlyphIcon glyph={dest.glyph} size={16} />
        </span>
      ) : (
        <RiseGlyphIcon glyph={dest.glyph} size={19} className="text-white/80" />
      )}
      <span
        className={cn(
          "max-w-[72px] truncate text-[10px] leading-none",
          active ? "font-extrabold text-white" : "font-bold text-white/70",
        )}
      >
        {dest.label}
      </span>
      {active ? (
        <span
          aria-hidden="true"
          className="nav-indicator absolute -top-[6px] left-1/2 h-[3px] w-7 rounded-full bg-lime shadow-[0_2px_10px_rgba(214,255,61,0.6)]"
        />
      ) : null}
    </button>
  );
}
