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
   Habit Glyphs — professional 24×24 set for habit tiles
   ------------------------------------------------------------
   Habits used to store a raw emoji in `habit.icon`. Now the
   field stores a glyph key (or a legacy emoji, which maps via
   EMOJI_TO_GLYPH). Rendering goes through <HabitIcon/> so every
   habit gets the same bold duotone language as the rest of the
   app instead of random OS emojis.
   ============================================================ */

export type HabitGlyphKey =
  | "water"
  | "book"
  | "run"
  | "gym"
  | "sleep"
  | "pray"
  | "meditate"
  | "eat"
  | "study"
  | "sunrise"
  | "walk"
  | "code"
  | "music"
  | "language"
  | "heart"
  | "smokefree"
  | "target"
  | "quran"
  | "journal"
  | "money";

const habitGlyphNodes: Record<HabitGlyphKey, React.ReactNode> = {
  /* droplet with inner shine */
  water: (
    <g {...P}>
      <path d="M12 3.2c3.4 3.9 5.8 7 5.8 10a5.8 5.8 0 0 1-11.6 0c0-3 2.4-6.1 5.8-10Z" />
      <path d="M9.2 13.8a3 3 0 0 0 2.3 2.9" opacity=".55" />
    </g>
  ),
  /* open book */
  book: (
    <g {...P}>
      <path d="M12 6c-1.8-1.6-4.2-2-8-2v14c3.8 0 6.2.4 8 2 1.8-1.6 4.2-2 8-2V4c-3.8 0-6.2.4-8 2Z" />
      <path d="M12 6v14" />
    </g>
  ),
  /* sprinting figure */
  run: (
    <g {...P}>
      <circle cx="14.6" cy="4.4" r="1.9" />
      <path d="m13.9 8.1.8 3.7-3.4 7" />
      <path d="m14.7 11.8 2.3 2.9.3 3.4" />
      <path d="M13.9 9 10 10.6 8.4 13.8" />
      <path d="m14.3 9.5 3.7 1 2.4-1.4" />
    </g>
  ),
  /* dumbbell */
  gym: (
    <g {...P}>
      <path d="M6.5 7.5v9M3.5 9.5v5M17.5 7.5v9M20.5 9.5v5M6.5 12h11" />
    </g>
  ),
  /* crescent + sparkle */
  sleep: (
    <g {...P}>
      <path d="M19.5 14A8 8 0 1 1 10 4.5 6.3 6.3 0 0 0 19.5 14Z" />
      <path d="M17.5 3.2v3M16 4.7h3" opacity=".6" />
    </g>
  ),
  /* mosque dome with door */
  pray: (
    <g {...P}>
      <path d="M4.5 20.5v-7c0-4.2 3.2-6.6 7.5-9.5 4.3 2.9 7.5 5.3 7.5 9.5v7" />
      <path d="M10 20.5v-3a2 2 0 0 1 4 0v3" />
      <path d="M2.5 20.5h19" />
      <path d="M12 1.6v1.6" opacity=".55" />
    </g>
  ),
  /* meditating figure */
  meditate: (
    <g {...P}>
      <circle cx="12" cy="4.8" r="2" />
      <path d="M12 8.8v3.7" />
      <path d="m12 9.8-4.3 2.4M12 9.8l4.3 2.4" />
      <path d="M6.2 19.6c1.2-3.2 3.4-4.6 5.8-4.6s4.6 1.4 5.8 4.6" />
    </g>
  ),
  /* apple with stem */
  eat: (
    <g {...P}>
      <path d="M12 7.5c-1.2-1.6-3.1-2.1-4.7-1.2-2.4 1.4-2.4 5-.9 8.3C7.6 17.4 9.4 20 12 20s4.4-2.6 5.6-5.4c1.5-3.3 1.5-6.9-.9-8.3-1.6-.9-3.5-.4-4.7 1.2Z" />
      <path d="M12 7c0-2 .9-3.2 2.5-3.8" opacity=".7" />
    </g>
  ),
  /* pencil */
  study: (
    <g {...P}>
      <path d="m4.5 19.5 1-4L16.8 4.2a2.15 2.15 0 0 1 3 3L8.5 18.5l-4 1Z" />
      <path d="m14.5 6.5 3 3" />
    </g>
  ),
  /* sun over horizon */
  sunrise: (
    <g {...P}>
      <path d="M5 15a7 7 0 0 1 14 0" />
      <path d="M2 19h20" />
      <path d="M12 3v3" />
      <path d="M4.5 8.5 6 10" />
      <path d="M19.5 8.5 18 10" />
    </g>
  ),
  /* walking figure */
  walk: (
    <g {...P}>
      <circle cx="13" cy="4.3" r="1.9" />
      <path d="M13 8v4.6l-3 6.8" />
      <path d="m13 12.6 2.6 2.7.6 4.1" />
      <path d="M13 9.4 9.4 11 8 13.6" />
      <path d="m13 9.4 3.6 1.2 1.9 2.6" />
    </g>
  ),
  /* code chevrons */
  code: (
    <g {...P}>
      <path d="m8.5 8-4 4 4 4M15.5 8l4 4-4 4" />
    </g>
  ),
  /* double musical note */
  music: (
    <g {...P}>
      <path d="M9 17.5V6l10-2v11.5" />
      <circle cx="6.5" cy="17.5" r="2.5" />
      <circle cx="16.5" cy="15.5" r="2.5" />
    </g>
  ),
  /* chat bubble with letter */
  language: (
    <g {...P}>
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H12l-4.5 4v-4h-1A2.5 2.5 0 0 1 4 13.5v-7Z" />
      <path d="m8.6 11.6 1.5-3.6 1.5 3.6M9.2 10.3h1.8" opacity=".7" />
    </g>
  ),
  /* heart */
  heart: (
    <g {...P}>
      <path d="M12 20.5C6.5 16.5 3 13.2 3 9.3 3 6.4 5.2 4.5 7.7 4.5c1.7 0 3.3.9 4.3 2.5 1-1.6 2.6-2.5 4.3-2.5 2.5 0 4.7 1.9 4.7 4.8 0 3.9-3.5 7.2-9 11.2Z" />
    </g>
  ),
  /* shield-check (quit smoking / no sugar …) */
  smokefree: (
    <g {...P}>
      <path d="M12 2.5 20 6v6c0 5-3.4 8.2-8 9.5C7.4 20.2 4 17 4 12V6l8-3.5Z" />
      <path d="m9 12 2 2 4-4.5" />
    </g>
  ),
  /* target rings */
  target: (
    <g {...P}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </g>
  ),
  /* book with diamond ornament */
  quran: (
    <g {...P}>
      <path d="M12 6c-1.8-1.6-4.2-2-8-2v14c3.8 0 6.2.4 8 2 1.8-1.6 4.2-2 8-2V4c-3.8 0-6.2.4-8 2Z" />
      <path d="M12 6v14" />
      <path d="m16.2 8.8 1.3 2.1-1.3 2.1-1.3-2.1 1.3-2.1Z" opacity=".6" />
    </g>
  ),
  /* quill */
  journal: (
    <g {...P}>
      <path d="M19.5 4.5c-6.5.5-10.5 3-12.5 8l4.5 4.5c5-2 7.5-6 8-12.5Z" />
      <path d="M7 12.5 11.5 17" />
      <path d="M3 21c2.5-.5 4.5-1.5 6-3" />
    </g>
  ),
  /* coin stack with arrow (savings habit) */
  money: (
    <g {...P}>
      <ellipse cx="9" cy="6.5" rx="6" ry="2.8" />
      <path d="M3 6.5v5c0 1.5 2.7 2.8 6 2.8 1 0 2-.1 2.8-.3" />
      <path d="M3 11.5v5C3 18 5.7 19.3 9 19.3c.6 0 1.2 0 1.8-.1" />
      <circle cx="17" cy="16.5" r="4.5" />
      <path d="m15.4 16.7 1.2 1.2 2.2-2.6" />
    </g>
  ),
};

/* Curated presets — the add/edit picker + their default hue */
export const HABIT_ICON_PRESETS: {
  key: HabitGlyphKey;
  label: string;
  hue: RiseHue;
  color: string;
}[] = [
  { key: "water", label: "ماء", hue: "cyan", color: "#06b6d4" },
  { key: "book", label: "قراءة", hue: "amber", color: "#eab308" },
  { key: "quran", label: "قرآن", hue: "forest", color: "#1B342B" },
  { key: "pray", label: "صلاة", hue: "forest", color: "#10b981" },
  { key: "meditate", label: "تأمل", hue: "violet", color: "#8b5cf6" },
  { key: "gym", label: "رياضة", hue: "violet", color: "#7c3aed" },
  { key: "run", label: "جري", hue: "rose", color: "#ec4899" },
  { key: "walk", label: "مشي", hue: "lime", color: "#84cc16" },
  { key: "sunrise", label: "استيقاظ مبكر", hue: "amber", color: "#f59e0b" },
  { key: "sleep", label: "نوم مبكر", hue: "blue", color: "#3b82f6" },
  { key: "eat", label: "أكل صحي", hue: "rose", color: "#f43f5e" },
  { key: "study", label: "دراسة", hue: "blue", color: "#6366f1" },
  { key: "code", label: "برمجة", hue: "cyan", color: "#0891b2" },
  { key: "language", label: "لغات", hue: "blue", color: "#0ea5e9" },
  { key: "journal", label: "يوميات", hue: "cyan", color: "#14b8a6" },
  { key: "money", label: "توفير", hue: "lime", color: "#059669" },
  { key: "smokefree", label: "إقلاع عن العادة", hue: "forest", color: "#16a34a" },
  { key: "heart", label: "صحة", hue: "rose", color: "#ef4444" },
  { key: "music", label: "موسيقى", hue: "violet", color: "#a855f7" },
  { key: "target", label: "هدف", hue: "lime", color: "#65a30d" },
];

/* Legacy habits store emojis — map the common ones to professional glyphs */
export const EMOJI_TO_GLYPH: Record<string, HabitGlyphKey> = {
  "💧": "water", "🚰": "water", "🥤": "water", "🚱": "water",
  "📖": "book", "📚": "book", "📗": "book", "📘": "book", "📕": "book", "📙": "book",
  "🕌": "pray", "🤲": "pray", "📿": "pray", "🕋": "pray", "🛐": "pray",
  "🧘": "meditate", "🧘‍♂️": "meditate", "🧘‍♀️": "meditate",
  "🏋️": "gym", "🏋️‍♂️": "gym", "🏋️‍♀️": "gym", "💪": "gym", "🤸": "gym",
  "🏃": "run", "🏃‍♂️": "run", "🏃‍♀️": "run", "👟": "run",
  "🚶": "walk", "🚶‍♂️": "walk", "🚶‍♀️": "walk",
  "😴": "sleep", "🛌": "sleep", "🌙": "sleep", "💤": "sleep",
  "🌅": "sunrise", "☀️": "sunrise", "🌞": "sunrise", "⏰": "sunrise", "🌄": "sunrise",
  "🍎": "eat", "🥗": "eat", "🥑": "eat", "🍏": "eat", "🍽️": "eat", "🥕": "eat",
  "✏️": "study", "📝": "study", "✍️": "study", "🖊️": "study", "🎒": "study", "🎓": "study",
  "💻": "code", "⌨️": "code", "🖥️": "code", "👨‍💻": "code",
  "🎵": "music", "🎶": "music", "🎧": "music", "🎸": "music",
  "💬": "language", "🗣️": "language", "🌐": "language", "🗣": "language",
  "❤️": "heart", "🫀": "heart", "💚": "heart", "🩺": "heart",
  "🚭": "smokefree", "🚫": "smokefree", "🛡️": "smokefree",
  "🎯": "target", "🏆": "target",
  "✍🏻": "journal", "📓": "journal", "📔": "journal", "🗒️": "journal",
  "💰": "money", "🪙": "money", "🏦": "money", "💵": "money",
};

function normalizeHabitIcon(raw: string): HabitGlyphKey | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  // Already a glyph key?
  if (trimmed in habitGlyphNodes) return trimmed as HabitGlyphKey
  // Legacy emoji?
  return EMOJI_TO_GLYPH[trimmed] || EMOJI_TO_GLYPH[trimmed.replace(/\uFE0F$/, "")] || null
}

/**
 * HabitGlyph — bare habit glyph svg (no well). Resolves glyph keys and
 * legacy emojis; renders nothing when unmapped.
 */
export function HabitGlyph({
  icon,
  className,
  size = 20,
}: {
  icon: string;
  className?: string;
  size?: number;
}) {
  const glyphKey = normalizeHabitIcon(icon);
  if (!glyphKey) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className={className}
    >
      {habitGlyphNodes[glyphKey]}
    </svg>
  );
}

/**
 * HabitIcon — professional glyph tile for habits.
 * Resolves `habit.icon` (glyph key or legacy emoji) to a bold duotone
 * glyph inside a tinted well colored by the habit's own color.
 * Falls back to the raw emoji when no mapping exists.
 */
export function HabitIcon({
  icon,
  color = "#10b981",
  size = 40,
  className,
  completed = false,
}: {
  icon: string;
  color?: string;
  size?: number;
  className?: string;
  completed?: boolean;
}) {
  const glyphKey = normalizeHabitIcon(icon);
  const glyphPx = Math.round(size * 0.55);

  if (glyphKey) {
    return (
      <span
        aria-hidden="true"
        style={{
          width: size,
          height: size,
          borderRadius: Math.max(10, Math.round(size * 0.3)),
          backgroundColor: completed ? color : `${color}1F`,
          color: completed ? "#fff" : color,
          boxShadow: completed ? `0 0 0 2px ${color}55` : undefined,
        }}
        className={cn("icon-well shrink-0", className)}
      >
        <svg viewBox="0 0 24 24" width={glyphPx} height={glyphPx} fill="none">
          {habitGlyphNodes[glyphKey]}
        </svg>
      </span>
    );
  }

  // Unmapped legacy icon — keep the emoji but dress it in the same tile
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(10, Math.round(size * 0.3)),
        backgroundColor: `${color}1F`,
        fontSize: Math.round(size * 0.52),
        lineHeight: 1,
      }}
      className={cn("shrink-0 flex items-center justify-center", className)}
    >
      {icon}
    </span>
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
