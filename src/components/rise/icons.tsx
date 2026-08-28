"use client";

/**
 * RiseOS — Neo Duotone Icon System
 * ------------------------------------------------------------
 * Distinctive hand-drawn glyphs (24×24 grid, bold rounded strokes)
 * living inside hue-tinted "wells" (.icon-well + .iw-* in globals.css).
 *
 * Day  : pastel tinted well + deep colored glyph, glassy top highlight.
 * Night: luminous tinted well + bright glyph + hue glow (CSS side).
 *
 * The wells make each module instantly recognizable by COLOR as well
 * as shape — the core of the "distinctive icons" requirement.
 */

import { cn } from "@/lib/utils";

export type RiseHue =
  | "lime"
  | "blue"
  | "violet"
  | "rose"
  | "amber"
  | "forest"
  | "cyan";

/* ============================================================
   Glyphs — hand-drawn on the 24×24 grid, stroke-based
   ============================================================ */

export type RiseGlyph =
  | "dashboard"
  | "sunrise"
  | "planner"
  | "tasks"
  | "projects"
  | "goals"
  | "habits"
  | "reading"
  | "brain"
  | "journal"
  | "health"
  | "focus"
  | "work"
  | "finance"
  | "calendar"
  | "analytics"
  | "review"
  | "coach"
  | "settings"
  | "bolt"
  | "flame"
  | "shield"
  | "trophy"
  | "bell";

const P = {
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  fill: "none",
};

const glyphs: Record<RiseGlyph, React.ReactNode> = {
  /* grid of 4 rounded tiles with a rising spark */
  dashboard: (
    <g {...P}>
      <rect x="3" y="3" width="8" height="8" rx="2.5" />
      <rect x="13" y="3" width="8" height="5" rx="2" />
      <rect x="3" y="13" width="8" height="8" rx="2.5" />
      <path d="M17 13v6" />
      <path d="M14 16h6" />
    </g>
  ),
  /* sun half-risen over a line, with a ray arc */
  sunrise: (
    <g {...P}>
      <path d="M5 15a7 7 0 0 1 14 0" />
      <path d="M2 19h20" />
      <path d="M12 3v3" />
      <path d="M4.5 8.5 6 10" />
      <path d="M19.5 8.5 18 10" />
      <path d="M9.5 19a2.5 2.5 0 0 1 5 0" />
    </g>
  ),
  /* calendar with a checkmark column */
  planner: (
    <g {...P}>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
      <path d="m8.5 15 2 2 4-4" />
    </g>
  ),
  /* bold check inside a square-cut shield */
  tasks: (
    <g {...P}>
      <path d="M12 2.5 20 6v6c0 5-3.4 8.2-8 9.5C7.4 20.2 4 17 4 12V6l8-3.5Z" />
      <path d="m8.5 12 2.5 2.5L16 9.5" />
    </g>
  ),
  /* stacked kanban layers */
  projects: (
    <g {...P}>
      <rect x="3" y="3" width="18" height="6" rx="2" />
      <rect x="3" y="13" width="8" height="8" rx="2" />
      <path d="M15 17h6" />
      <path d="M15 13v6" opacity="0" />
      <path d="M15 21v-4" />
    </g>
  ),
  /* rocket with window and fins */
  goals: (
    <g {...P}>
      <path d="M12 15c-1.5-1-2.5-3-2.5-6C9.5 5.5 11 3 12 2c1 1 2.5 3.5 2.5 7 0 3-1 5-2.5 6Z" />
      <circle cx="12" cy="8" r="1.4" />
      <path d="M9.5 12.5 7 15l-1 4 3.5-2" />
      <path d="m14.5 12.5 2.5 2.5 1 4-3.5-2" />
      <path d="M12 15v4" />
      <path d="M10 21c.7-.8 1.3-1.2 2-1.2s1.3.4 2 1.2" />
    </g>
  ),
  /* three stacked rings (habit loops) */
  habits: (
    <g {...P}>
      <circle cx="12" cy="7" r="4" />
      <circle cx="7.5" cy="15.5" r="4" />
      <circle cx="16.5" cy="15.5" r="4" />
      <path d="M12 7h.01" opacity="0" />
    </g>
  ),
  /* open book with sparkle */
  reading: (
    <g {...P}>
      <path d="M12 6c-1.8-1.6-4.2-2-8-2v14c3.8 0 6.2.4 8 2 1.8-1.6 4.2-2 8-2V4c-3.8 0-6.2.4-8 2Z" />
      <path d="M12 6v14" />
      <path d="M16.5 8.5c.9.2 1.6.5 2.5.9M16.5 12c.9.2 1.6.5 2.5.9" opacity=".55" />
    </g>
  ),
  /* brain with spark terminals */
  brain: (
    <g {...P}>
      <path d="M9.5 3.5A3 3 0 0 0 6.6 7 3.2 3.2 0 0 0 4 10.2c0 1.2.6 2.2 1.5 2.8A3.3 3.3 0 0 0 8 19c.4 1.2 1.9 2 4 2V3.5Z" />
      <path d="M14.5 3.5A3 3 0 0 1 17.4 7 3.2 3.2 0 0 1 20 10.2c0 1.2-.6 2.2-1.5 2.8A3.3 3.3 0 0 1 16 19c-.4 1.2-1.9 2-4 2" />
      <path d="M12 3.5V21" opacity="0" />
    </g>
  ),
  /* quill feather writing a line */
  journal: (
    <g {...P}>
      <path d="M19.5 4.5c-6.5.5-10.5 3-12.5 8l4.5 4.5c5-2 7.5-6 8-12.5Z" />
      <path d="M7 12.5 11.5 17" />
      <path d="M3 21c2.5-.5 4.5-1.5 6-3" />
    </g>
  ),
  /* heart with pulse line */
  health: (
    <g {...P}>
      <path d="M12 20.5C6.5 16.5 3 13.2 3 9.3 3 6.4 5.2 4.5 7.7 4.5c1.7 0 3.3.9 4.3 2.5 1-1.6 2.6-2.5 4.3-2.5 2.5 0 4.7 1.9 4.7 4.8 0 3.9-3.5 7.2-9 11.2Z" />
      <path d="M6.5 11.5h3l1.5-3 2.5 5 1.5-2h2.5" />
    </g>
  ),
  /* comet-timer: circle + swoosh */
  focus: (
    <g {...P}>
      <circle cx="13" cy="12" r="7" />
      <path d="M13 8.5V12l2.5 1.5" />
      <path d="M2.5 7.5 5 8.8" />
      <path d="M2.5 16.5 5 15.2" />
      <path d="M2 12h2.5" />
    </g>
  ),
  /* briefcase with bolt cut */
  work: (
    <g {...P}>
      <rect x="3" y="7.5" width="18" height="13" rx="3" />
      <path d="M9 7.5V6a3 3 0 0 1 3-3 3 3 0 0 1 3 3v1.5" />
      <path d="m13 11-2.5 4H14l-2.5 4" />
    </g>
  ),
  /* coin stack with rising arrow */
  finance: (
    <g {...P}>
      <ellipse cx="9" cy="6.5" rx="6" ry="2.8" />
      <path d="M3 6.5v5c0 1.5 2.7 2.8 6 2.8 1 0 2-.1 2.8-.3" />
      <path d="M3 11.5v5C3 18 5.7 19.3 9 19.3c.6 0 1.2 0 1.8-.1" />
      <circle cx="17" cy="16.5" r="4.5" />
      <path d="m15.4 16.7 1.2 1.2 2.2-2.6" />
    </g>
  ),
  /* calendar with orbit dot */
  calendar: (
    <g {...P}>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
      <circle cx="12" cy="15.5" r="2.2" />
    </g>
  ),
  /* bar chart with pulse spark */
  analytics: (
    <g {...P}>
      <path d="M4 20h16" />
      <path d="M6.5 20v-6" />
      <path d="M11 20V9" />
      <path d="M15.5 20v-8" />
      <path d="M20 20V5" />
      <path d="m3.5 8.5 4-3 4 2 5-4.5" opacity=".6" />
    </g>
  ),
  /* document with check circle */
  review: (
    <g {...P}>
      <path d="M6 3h9l4 4v14H6a2.5 2.5 0 0 1-2.5-2.5v-13A2.5 2.5 0 0 1 6 3Z" transform="translate(1.5 0)" />
      <path d="M15.5 3v4.5H20" />
      <path d="m8.5 14.5 2 2 4-4" />
    </g>
  ),
  /* chat sparkles (AI coach) */
  coach: (
    <g {...P}>
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H12l-4.5 4v-4h-1A2.5 2.5 0 0 1 4 14.5v-8Z" />
      <path d="m9.3 10.5 1.5-3 1.5 3 3 1.5-3 1.5-1.5 3-1.5-3-3-1.5 3-1.5Z" transform="translate(2.2 -0.6) scale(.82)" />
    </g>
  ),
  settings: (
    <g {...P}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8 13.2 5a7.3 7.3 0 0 1 2.4 1l2.5-.7 1.9 3.2-1.7 2a7.4 7.4 0 0 1 0 2.9l1.7 2-1.9 3.2-2.5-.7a7.3 7.3 0 0 1-2.4 1L12 21.2 10.8 19a7.3 7.3 0 0 1-2.4-1l-2.5.7L4 15.5l1.7-2a7.4 7.4 0 0 1 0-2.9L4 8.5l1.9-3.2 2.5.7a7.3 7.3 0 0 1 2.4-1L12 2.8Z" />
    </g>
  ),
  /* double bolt */
  bolt: (
    <g {...P}>
      <path d="M13.5 2 5 13.5h5L9.5 22 18 10.5h-5L13.5 2Z" />
    </g>
  ),
  flame: (
    <g {...P}>
      <path d="M12 21.5c-4 0-6.5-2.7-6.5-6 0-2.6 1.6-4.4 3-6.3.9-1.2 1.6-2.5 1.8-4.2 2 1.2 2.9 3 2.9 4.9 0 0 1-1 1.3-2.7 1.8 1.7 4 4.2 4 8.3 0 3.3-2.5 6-6.5 6Z" />
      <path d="M12 21.5c-1.6 0-2.8-1.2-2.8-2.8 0-1.5 1.2-2.4 2.8-4.3 1.6 1.9 2.8 2.8 2.8 4.3 0 1.6-1.2 2.8-2.8 2.8Z" />
    </g>
  ),
  shield: (
    <g {...P}>
      <path d="M12 2.5 20 6v6c0 5-3.4 8.2-8 9.5C7.4 20.2 4 17 4 12V6l8-3.5Z" />
      <path d="m9 12 2 2 4-4.5" />
    </g>
  ),
  /* trophy with star cut */
  trophy: (
    <g {...P}>
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M7 5.5H4.5A2.5 2.5 0 0 0 7 10c0-2 .5-3.5 0-4.5Z" opacity=".0" />
      <path d="M17 5.5h2.5a2.8 2.8 0 0 1-2.8 4.4" />
      <path d="M7 5.5H4.5a2.8 2.8 0 0 0 2.8 4.4" />
      <path d="M12 14v3" />
      <path d="M8.5 21h7" />
      <path d="M10 21c0-2 .8-3 2-3s2 1 2 3" />
    </g>
  ),
  bell: (
    <g {...P}>
      <path d="M12 3a6 6 0 0 0-6 6v3.2c0 .8-.3 1.5-.9 2.1L4 15.5h16l-1.1-1.2a3 3 0 0 1-.9-2.1V9a6 6 0 0 0-6-6Z" />
      <path d="M9.8 18.5a2.3 2.3 0 0 0 4.4 0" />
      <path d="M12 3V1.8" opacity="0" />
    </g>
  ),
};

/* ============================================================
   RiseIcon — glyph inside a hue-tinted well
   ============================================================ */

const hueClass: Record<RiseHue, string> = {
  lime: "iw-lime",
  blue: "iw-blue",
  violet: "iw-violet",
  rose: "iw-rose",
  amber: "iw-amber",
  forest: "iw-forest",
  cyan: "iw-cyan",
};

const sizePx = { sm: 32, md: 40, lg: 48 } as const;
const glyphPx = { sm: 17, md: 21, lg: 25 } as const;

export function RiseIcon({
  glyph,
  hue = "forest",
  size = "md",
  className,
  wellClassName,
  lift = false,
}: {
  glyph: RiseGlyph;
  hue?: RiseHue;
  size?: keyof typeof sizePx;
  className?: string;
  wellClassName?: string;
  lift?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      style={{ width: sizePx[size], height: sizePx[size] }}
      className={cn(
        "icon-well shrink-0",
        hueClass[hue],
        lift && "icon-well-lift",
        className
      )}
    >
      <svg
        viewBox="0 0 24 24"
        width={glyphPx[size]}
        height={glyphPx[size]}
        fill="none"
      >
        {glyphs[glyph]}
      </svg>
    </span>
  );
}

/* Bare glyph (no well) — for places that already have a colored surface */
export function RiseGlyphIcon({
  glyph,
  className,
  size = 20,
}: {
  glyph: RiseGlyph;
  className?: string;
  size?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className={className}
    >
      {glyphs[glyph]}
    </svg>
  );
}

/* ============================================================
   Module → icon/hue identity map (single source of truth)
   ============================================================ */

export const MODULE_ICONS: Record<string, { glyph: RiseGlyph; hue: RiseHue }> = {
  dashboard: { glyph: "dashboard", hue: "lime" },
  morning: { glyph: "sunrise", hue: "amber" },
  planner: { glyph: "planner", hue: "cyan" },
  "daily-planner": { glyph: "planner", hue: "cyan" },
  tasks: { glyph: "tasks", hue: "blue" },
  projects: { glyph: "projects", hue: "violet" },
  goals: { glyph: "goals", hue: "rose" },
  habits: { glyph: "habits", hue: "lime" },
  "habit-reminders": { glyph: "bell", hue: "amber" },
  reading: { glyph: "reading", hue: "amber" },
  brain: { glyph: "brain", hue: "violet" },
  "second-brain": { glyph: "brain", hue: "violet" },
  journal: { glyph: "journal", hue: "cyan" },
  health: { glyph: "health", hue: "rose" },
  deepwork: { glyph: "focus", hue: "violet" },
  "deep-work": { glyph: "focus", hue: "violet" },
  focus: { glyph: "focus", hue: "amber" },
  learning: { glyph: "brain", hue: "blue" },
  work: { glyph: "work", hue: "forest" },
  finance: { glyph: "finance", hue: "lime" },
  calendar: { glyph: "calendar", hue: "blue" },
  analytics: { glyph: "analytics", hue: "violet" },
  "monthly-review": { glyph: "review", hue: "cyan" },
  "weekly-review": { glyph: "review", hue: "blue" },
  notifications: { glyph: "bell", hue: "amber" },
  "ai-coach": { glyph: "coach", hue: "violet" },
  "admin-panel": { glyph: "shield", hue: "rose" },
  admin: { glyph: "shield", hue: "rose" },
  settings: { glyph: "settings", hue: "forest" },
};
