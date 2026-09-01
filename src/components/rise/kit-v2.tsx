"use client";

/**
 * RiseOS — Kit v2: components ported from the user's latest reference batch
 * ---------------------------------------------------------------- them all re-skinned to the Neo token system:
 *  1. RainbowCheckbox — glow-spread checkbox (ref: instagram-glow checkbox)
 *  2. BellToggle       — bell regular ↔ solid morph (ref: bell checkbox)
 *  3. ComicButton      — bold bordered CTA with hard offset shadow (ref: comic button)
 *  4. PulseCard        — success notification card with pulsing circle (ref: order validated)
 *  5. ActivityRing     — conic-gradient progress ring (ref: smartwatch activity)
 *  6. HeartbeatChart   — rose gradient bars + average line (ref: heart-rate chart)
 *  7. BoltBadge        — lightning XP/energy accent (ref: yellow lightning card)
 * Every color flows from the token layer → automatic day/night adaptation.
 */

import { useState } from "react";
import { cn } from "@/lib/utils";

/* ============================================================
   1. RainbowCheckbox — checked state blooms a rainbow glow
   ============================================================ */

export function RainbowCheckbox({
  checked,
  onChange,
  label,
  className,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <label
      // TASK 25 ROOT-CAUSE FIX — "بعمل شيك بس بيرجع علطول":
      // clicking the checkbox inside a clickable parent (morning routine row,
      // planner card, …) fired BOTH the input's onChange AND the parent's
      // onClick → the item toggled TWICE (add → remove) → the check appeared
      // then instantly vanished, and the final save stored an EMPTY set.
      // Stopping propagation at the label makes every checkbox click toggle
      // EXACTLY ONCE regardless of where it is embedded.
      onClick={(e) => e.stopPropagation()}
      className={cn("group inline-flex cursor-pointer items-center gap-2", disabled && "cursor-not-allowed opacity-50", className)}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
        aria-label={label}
      />
      <span
        aria-hidden="true"
        className={cn(
          "relative grid h-6 w-6 place-items-center rounded-full transition-all duration-500",
          "bg-foreground",
          /* rainbow spread — symmetric so RTL never looks broken */
          "peer-checked:shadow-[0_-8px_16px_-2px_#8B5CF6,0_8px_16px_-2px_#F59E0B,8px_0_16px_-2px_#EC4899,-8px_0_16px_-2px_#22D3EE]",
          "peer-checked:bg-lime-deep",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background",
          "peer-checked:[&>.tick]:opacity-100 peer-checked:[&>.tick]:scale-100"
        )}
      >
        <svg
          viewBox="0 0 20 20"
          fill="none"
          className="tick h-3.5 w-3.5 scale-50 opacity-0 transition-all duration-300"
        >
          <path
            d="M5 10.5l3.2 3.2L15 7"
            stroke="#0B1015"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {label ? <span className="text-sm text-foreground">{label}</span> : null}
    </label>
  );
}

/* ============================================================
   2. BellToggle — regular ↔ solid bell morph
   ============================================================ */

export function BellToggle({
  enabled,
  onToggle,
  className,
}: {
  enabled: boolean;
  onToggle: (next: boolean) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={enabled ? "إيقاف التنبيهات" : "تشغيل التنبيهات"}
      onClick={() => onToggle(!enabled)}
      className={cn(
        "press relative grid h-10 w-10 place-items-center rounded-xl border transition-all duration-300",
        enabled
          ? "border-transparent bg-amber-500/15 text-amber-600 dark:bg-amber-400/10 dark:text-amber-300 dark:shadow-glow"
          : "border-border bg-card text-muted-foreground",
        className
      )}
    >
      {/* regular bell (off) */}
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        className={cn(
          "absolute transition-all duration-300",
          enabled ? "scale-50 opacity-0" : "scale-100 opacity-100"
        )}
      >
        <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M12 3a6 6 0 0 0-6 6v3.2c0 .8-.3 1.5-.9 2.1L4 15.5h16l-1.1-1.2a3 3 0 0 1-.9-2.1V9a6 6 0 0 0-6-6Z" />
          <path d="M9.8 18.5a2.3 2.3 0 0 0 4.4 0" />
        </g>
      </svg>
      {/* solid ringing bell (on) */}
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        className={cn(
          "absolute transition-all duration-300",
          enabled ? "scale-100 opacity-100" : "scale-50 opacity-0"
        )}
      >
        <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path
            d="M12 3a6 6 0 0 0-6 6v3.2c0 .8-.3 1.5-.9 2.1L4 15.5h16l-1.1-1.2a3 3 0 0 1-.9-2.1V9a6 6 0 0 0-6-6Z"
            fill="currentColor"
          />
          <path d="M9.8 18.5a2.3 2.3 0 0 0 4.4 0" fill="none" />
          <path d="M2.5 8 1.5 7" fill="none" />
          <path d="M21.5 8l1-1" fill="none" />
        </g>
      </svg>
    </button>
  );
}

/* ============================================================
   3. ComicButton — bold personality CTA (hard offset shadow)
   ============================================================ */

export function ComicButton({
  children,
  onClick,
  tone = "lime",
  className,
  disabled,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  tone?: "lime" | "rose" | "ink";
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const tones: Record<string, string> = {
    lime: "bg-lime text-ink border-ink hover:bg-lime-soft",
    rose: "bg-rose-accent text-white border-ink hover:bg-rose-accent/85",
    ink: "bg-foreground text-background border-foreground dark:bg-paper-soft dark:text-ink dark:border-ink hover:opacity-90",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 rounded-xl border-2 px-5 py-2.5 text-base font-extrabold",
        "shadow-[4px_4px_0_0_var(--comic-shadow,#0B1015)] transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-[5px_6px_0_0_var(--comic-shadow,#0B1015)]",
        "active:translate-y-1 active:shadow-none",
        "disabled:pointer-events-none disabled:opacity-50",
        tones[tone],
        className
      )}
      style={{ ["--comic-shadow" as string]: "rgba(11,16,21,0.9)" }}
    >
      {children}
    </button>
  );
}

/* ============================================================
   4. PulseCard — success notification with pulsing circle
   ============================================================ */

export function PulseCard({
  title,
  message,
  onClose,
  actionLabel,
  onAction,
  className,
}: {
  title: string;
  message?: string;
  onClose?: () => void;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "neo-card relative overflow-hidden p-5 text-center",
        className
      )}
    >
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق"
          className="absolute end-3 top-3 grid h-7 w-7 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-destructive hover:bg-destructive hover:text-white"
        >
          <svg viewBox="0 0 20 20" width="14" height="14" fill="none">
            <path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      ) : null}
      <div className="mx-auto grid h-12 w-12 place-items-center">
        {/* pulsing halo + static disc */}
        <span className="absolute h-12 w-12 animate-pulse-ring rounded-full bg-emerald-400/50" />
        <span className="relative grid h-12 w-12 place-items-center rounded-full bg-emerald-500/15">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
            <path d="M20 7 9.5 17.5 4 12.5" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
      <p className="mt-3 text-base font-bold text-emerald-700 dark:text-emerald-300">{title}</p>
      {message ? <p className="mt-1.5 text-sm text-muted-foreground">{message}</p> : null}
      {actionLabel ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 w-full rounded-lg bg-forest px-4 py-2.5 text-sm font-bold text-paper-soft transition-transform active:scale-[0.98] dark:bg-lime dark:text-ink"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

/* ============================================================
   5. ActivityRing — conic-gradient progress (smartwatch style)
   ============================================================ */

export function ActivityRing({
  percent,
  size = 96,
  thickness = 10,
  label,
  sublabel,
  hue = "lime",
  className,
}: {
  percent: number; // 0..100
  size?: number;
  thickness?: number;
  label?: React.ReactNode;
  sublabel?: string;
  hue?: "lime" | "violet" | "rose" | "blue";
  className?: string;
}) {
  const p = Math.max(0, Math.min(100, percent));
  const gradId = `ring-grad-${hue}`;
  const stops: Record<string, [string, string]> = {
    lime: ["#A8CC22", "#D6FF3D"],
    violet: ["#8B5CF6", "#C4B5FD"],
    rose: ["#FF5A76", "#FFA3B2"],
    blue: ["#007AFF", "#7FB8FF"],
  };
  const [c1, c2] = stops[hue];
  const r = (size - thickness) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <div
      className={cn("relative inline-grid place-items-center", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={typeof label === "string" ? `${label} ${p}%` : `${p}%`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={c1} />
            <stop offset="100%" stopColor={c2} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={thickness}
          className="stroke-secondary dark:stroke-surface-3"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={thickness}
          stroke={`url(#${gradId})`}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ - (p / 100) * circ}
          style={{
            transition: "stroke-dashoffset 0.8s cubic-bezier(0.22,1,0.36,1)",
            filter: "drop-shadow(0 0 6px color-mix(in srgb, currentColor 0%, transparent))",
          }}
          className={cn(
            hue === "lime" && "[filter:drop-shadow(0_0_5px_rgba(214,255,61,0.45))] dark:[filter:drop-shadow(0_0_8px_rgba(214,255,61,0.55))]",
            hue === "violet" && "dark:[filter:drop-shadow(0_0_8px_rgba(167,139,250,0.55))]",
            hue === "rose" && "dark:[filter:drop-shadow(0_0_8px_rgba(255,90,118,0.55))]",
            hue === "blue" && "dark:[filter:drop-shadow(0_0_8px_rgba(77,162,255,0.55))]"
          )}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="num text-xl font-extrabold leading-none text-foreground">{label}</p>
          {sublabel ? <p className="mt-1 text-[0.65rem] font-semibold text-muted-foreground">{sublabel}</p> : null}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   6. HeartbeatChart — rose gradient bars + average line + dot
   ============================================================ */

export function HeartbeatChart({
  values,
  labels,
  unit = "",
  className,
}: {
  values: number[];
  labels?: string[];
  unit?: string;
  className?: string;
}) {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, max);
  const avg = values.reduce((a, b) => a + b, 0) / Math.max(values.length, 1);
  const avgPct = (avg / max) * 100;
  const hi = values.indexOf(max);
  const hiPct = values.length > 1 ? (hi / (values.length - 1)) * 100 : 50;
  return (
    <div className={cn("w-full", className)}>
      <div className="relative h-24" aria-hidden="true">
        {/* average dashed line */}
        <div
          className="absolute inset-x-0 border-t border-dashed border-rose-accent/50"
          style={{ bottom: `calc(${Math.max(6, avgPct)}% * 0.88 + 6px)` }}
        >
          <span className="absolute -top-4 end-0 rounded-full bg-rose-accent/10 px-1.5 py-0.5 text-[0.6rem] font-bold text-rose-accent">
            <span className="num">{Math.round(avg)}</span>
            {unit}
          </span>
        </div>
        <div className="flex h-full items-end gap-1.5">
          {values.map((v, i) => (
            <div
              key={i}
              className="relative flex-1"
              style={{ height: `${Math.max(6, (v / max) * 88)}%` }}
            >
              <div
                className={cn(
                  "spark-bar h-full w-full rounded-t-md",
                  i === hi
                    ? "bg-gradient-to-t from-rose-accent/70 to-rose-accent"
                    : "bg-gradient-to-t from-rose-accent/30 to-rose-accent/60"
                )}
              />
              {i === hi ? (
                <span className="absolute -top-3 left-1/2 h-2 w-2 -translate-x-1/2 animate-float-dot rounded-full bg-rose-accent shadow-[0_0_10px_rgba(255,90,118,0.8)]" />
              ) : null}
            </div>
          ))}
        </div>
      </div>
      {labels ? (
        <div className="mt-2 flex gap-1.5 text-center text-[0.65rem] font-semibold text-muted-foreground" aria-hidden="true">
          {labels.map((l, i) => (
            <span key={i} className="num flex-1">{l}</span>
          ))}
        </div>
      ) : null}
      <span className="sr-only">
        {`أدنى قيمة ${Math.round(min)}، أعلى قيمة ${Math.round(max)}، المتوسط ${Math.round(avg)}${unit}`}
      </span>
    </div>
  );
}

/* ============================================================
   7. BoltBadge — lightning XP/energy chip (lightning card ref)
   ============================================================ */

export function BoltBadge({
  value,
  label,
  className,
}: {
  value: React.ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border-2 border-ink/85 bg-lime px-3 py-1 text-sm font-extrabold text-ink shadow-[3px_3px_0_0_rgba(11,16,21,0.85)] dark:border-lime/80 dark:shadow-[0_0_16px_-2px_rgba(214,255,61,0.5)]",
        className
      )}
    >
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">
        <path
          d="M13.5 2 5 13.5h5L9.5 22 18 10.5h-5L13.5 2Z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinejoin="round"
        />
      </svg>
      <span className="num">{value}</span>
      {label ? <span className="font-bold">{label}</span> : null}
    </span>
  );
}

/* ============================================================
   8. ThemeAwareLoader — orbiting dots (already in CSS) wrapped
   ============================================================ */

export function NeoLoader({ label = "جارٍ التحميل…", className }: { label?: string; className?: string }) {
  const [dotCount] = useState(3);
  return (
    <div role="status" aria-live="polite" className={cn("grid place-items-center gap-3 py-8", className)}>
      <div className="relative h-12 w-12">
        <span className="absolute inset-0 rounded-full border-2 border-border" />
        {Array.from({ length: dotCount }).map((_, i) => (
          <span
            key={i}
            className="orbit-dot-outer absolute inset-0 grid place-items-start justify-center"
            style={{ animationDelay: `${-0.6 * i}s` }}
          >
            <span className="h-2.5 w-2.5 rounded-full bg-lime-deep shadow-[0_0_10px_rgba(168,204,34,0.6)]" />
          </span>
        ))}
      </div>
      <span className="text-sm font-semibold text-muted-foreground">{label}</span>
    </div>
  );
}
