"use client";

/**
 * RiseOS — Neo component library
 * Design language ported from the approved reference components:
 *  - VOLT KPI tiles (mono eyebrow, tabular value, delta pill, spark bars)
 *  - FORGE metric cards (forest/paper variants, chunky bars, hover lift)
 *  - Heart-rate bars (rose gradient + floating dot marker)
 *  - Vertical stepper (completed/active/pending circles + status pills)
 *  - Animated day/night theme toggle (sun ↔ moon, stars, clouds)
 * All colors come from the WCAG-AA-verified Neo token layer in globals.css.
 */

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

/* ============================================================
   SparkBars — mini bar chart shared by KPI tiles & metric cards
   ============================================================ */

export type SparkTone = "mist" | "lime" | "rose" | "forest" | "mixed";

const toneClasses: Record<SparkTone, { base: string; accent: string }> = {
  mist: { base: "bg-secondary", accent: "bg-foreground/80" },
  lime: { base: "bg-lime/30", accent: "bg-lime" },
  rose: { base: "bg-rose-accent/25", accent: "bg-rose-accent" },
  forest: { base: "bg-forest-light/30", accent: "bg-forest-light" },
  mixed: { base: "bg-secondary", accent: "bg-lime-deep" },
};

export function SparkBars({
  values,
  tone = "mist",
  highlight,
  className,
  barClassName,
  animated = true,
}: {
  values: number[];
  tone?: SparkTone;
  /** index of the accent bar (defaults to the max value) */
  highlight?: number;
  className?: string;
  barClassName?: string;
  animated?: boolean;
}) {
  const t = toneClasses[tone];
  const hi = highlight ?? values.indexOf(Math.max(...values));
  const max = Math.max(...values, 1);
  return (
    <div className={cn("flex items-end gap-1", className)} aria-hidden="true">
      {values.map((v, i) => (
        <div
          key={i}
          style={{
            height: `${Math.max(8, (v / max) * 100)}%`,
            animationDelay: animated ? `${i * 45}ms` : undefined,
          }}
          className={cn(
            "spark-bar min-w-[6px] flex-1",
            i === hi ? t.accent : t.base,
            barClassName
          )}
        />
      ))}
    </div>
  );
}

/* ============================================================
   Pill / LiveBadge
   ============================================================ */

export function Pill({
  tone = "muted",
  children,
  className,
}: {
  tone?: "success" | "info" | "muted" | "lime";
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={cn("pill", `pill-${tone}`, className)}>{children}</span>;
}

export function LiveBadge({ label = "مباشر" }: { label?: string }) {
  return (
    <span className="pill pill-success">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
      </span>
      {label}
    </span>
  );
}

/* ============================================================
   KpiTile — VOLT-style KPI tile (light surface)
   ============================================================ */

export function KpiTile({
  label,
  value,
  unit,
  delta,
  deltaDir = "up",
  spark,
  sparkTone = "lime",
  icon: Icon,
  footer,
  className,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  delta?: string;
  deltaDir?: "up" | "down" | "flat";
  spark?: number[];
  sparkTone?: SparkTone;
  icon?: React.ElementType;
  footer?: string;
  className?: string;
}) {
  const dirColor =
    deltaDir === "up" ? "pill-lime" : deltaDir === "down" ? "pill-info" : "pill-muted";
  return (
    <div className={cn("neo-card card-lift press p-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow-ar">{label}</span>
        {Icon ? (
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-forest/8 text-forest dark:bg-lime/10 dark:text-lime">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="num text-[2.25rem] font-bold leading-none text-foreground">
          {value}
          {unit ? (
            <span className="mr-1 text-base font-semibold text-muted-foreground">{unit}</span>
          ) : null}
        </p>
        {delta ? <span className={cn("pill", dirColor)}>{delta}</span> : null}
      </div>
      {spark && spark.length > 0 ? (
        <SparkBars values={spark} tone={sparkTone} className="mt-4 h-10" />
      ) : null}
      {footer ? <p className="mt-3 text-xs text-muted-foreground">{footer}</p> : null}
    </div>
  );
}

/* ============================================================
   MetricCard — FORGE-style metric card (forest / paper variants)
   ============================================================ */

export function MetricCard({
  title,
  value,
  unit,
  caption,
  bars,
  variant = "paper",
  pill,
  className,
}: {
  title: string;
  value: React.ReactNode;
  unit?: string;
  caption?: string;
  /** chunky bars; mark one as accent */
  bars?: { value: number; accent?: boolean }[];
  variant?: "paper" | "forest";
  pill?: React.ReactNode;
  className?: string;
}) {
  const isForest = variant === "forest";
  return (
    <div
      className={cn(
        "card-lift press rounded-[1.25rem] border p-5",
        isForest
          ? "border-forest-dark bg-forest text-paper-soft shadow-tile"
          : "neo-card",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3
          className={cn(
            "text-sm font-bold",
            isForest ? "text-paper-soft" : "text-foreground"
          )}
        >
          {title}
        </h3>
        {pill}
      </div>
      <p
        className={cn(
          "num mt-2 font-mono text-[2.75rem] font-bold leading-none",
          isForest ? "text-paper-soft" : "text-foreground"
        )}
      >
        {value}
        {unit ? (
          <span
            className={cn(
              "mr-1 text-base font-semibold",
              isForest ? "text-paper-soft/70" : "text-muted-foreground"
            )}
          >
            {unit}
          </span>
        ) : null}
      </p>
      {bars && bars.length > 0 ? (
        <div className="mt-4 flex h-14 items-end gap-1.5" aria-hidden="true">
          {bars.map((b, i) => (
            <div
              key={i}
              style={{ height: `${Math.max(10, b.value)}%`, animationDelay: `${i * 45}ms` }}
              className={cn(
                "spark-bar min-w-[8px] flex-1",
                b.accent
                  ? "bg-lime"
                  : isForest
                    ? "bg-paper-soft/25"
                    : "bg-secondary"
              )}
            />
          ))}
        </div>
      ) : null}
      {caption ? (
        <p className={cn("mt-3 text-xs", isForest ? "text-paper-soft/70" : "text-muted-foreground")}>
          {caption}
        </p>
      ) : null}
    </div>
  );
}

/* ============================================================
   Stepper — vertical progress steps (morning routine, goals)
   ============================================================ */

export type StepStatus = "completed" | "active" | "pending";

export function Stepper({
  steps,
  onStepClick,
  className,
}: {
  steps: { title: string; description?: string; status: StepStatus }[];
  onStepClick?: (index: number) => void;
  className?: string;
}) {
  return (
    <ol className={cn("relative space-y-0", className)}>
      {steps.map((step, i) => {
        const last = i === steps.length - 1;
        return (
          <li key={i} className="relative flex gap-4 pb-6 last:pb-0">
            {/* connector */}
            {!last ? (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-10 h-[calc(100%-2.5rem)] w-0.5 ltr:left-[19px] rtl:right-[19px]",
                  step.status === "completed" ? "bg-forest" : "bg-border"
                )}
              />
            ) : null}
            {/* circle */}
            <button
              type="button"
              onClick={() => onStepClick?.(i)}
              aria-current={step.status === "active" ? "step" : undefined}
              className={cn(
                "press relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full border-2",
                step.status === "completed" &&
                  "border-forest bg-forest text-paper-soft",
                step.status === "active" &&
                  "border-forest bg-card text-forest ring-4 ring-lime/40",
                step.status === "pending" && "border-border bg-card text-muted-foreground"
              )}
            >
              {step.status === "completed" ? (
                <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
                  <path
                    d="M5 10.5l3.2 3.2L15 7"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <span className="num text-xs font-bold">{i + 1}</span>
              )}
            </button>
            {/* text */}
            <div className="flex flex-1 items-start justify-between gap-2 pt-1.5">
              <div>
                <p
                  className={cn(
                    "text-sm font-bold",
                    step.status === "pending" ? "text-muted-foreground" : "text-foreground"
                  )}
                >
                  {step.title}
                </p>
                {step.description ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">{step.description}</p>
                ) : null}
              </div>
              {step.status === "completed" ? (
                <Pill tone="success">مكتمل</Pill>
              ) : step.status === "active" ? (
                <Pill tone="info">الآن</Pill>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ============================================================
   ThemeToggle — animated day/night switch (sun ↔ moon)
   ============================================================ */

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  // rAF-deferred mount flag: avoids synchronous setState-in-effect
  // (react-compiler lint rule) while preventing hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const isDark = mounted && resolvedTheme === "dark";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? "التبديل إلى الوضع النهاري" : "التبديل إلى الوضع الليلي"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(
        "press relative inline-flex h-[34px] w-[60px] shrink-0 items-center rounded-full border transition-colors duration-300",
        isDark ? "border-slate-600 bg-slate-800" : "border-slate-200 bg-sky-100",
        className
      )}
    >
      {/* stars (night only) */}
      <span
        className={cn(
          "pointer-events-none absolute inset-y-0 ltr:left-1.5 rtl:right-1.5 flex flex-col justify-center gap-1 transition-all duration-500",
          isDark ? "translate-y-0 opacity-100" : "-translate-y-8 opacity-0"
        )}
        aria-hidden="true"
      >
        <span className="block h-1 w-1 animate-star-twinkle rounded-full bg-white" />
        <span className="block h-1.5 w-1.5 animate-star-twinkle rounded-full bg-white/80 ltr:ml-2.5 rtl:mr-2.5" />
      </span>
      {/* clouds (day only) */}
      <span
        className={cn(
          "pointer-events-none absolute inset-y-0 ltr:left-2 rtl:right-2 flex items-center transition-all duration-500",
          isDark ? "translate-x-0 opacity-0" : "opacity-100"
        )}
        aria-hidden="true"
      >
        <span className="absolute h-2 w-4 animate-cloud-move rounded-full bg-slate-300/70 top-2" />
        <span className="absolute h-1.5 w-3 animate-cloud-move rounded-full bg-slate-300/50 bottom-2 ltr:ml-3 rtl:mr-3" />
      </span>
      {/* sun rays (day only) */}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 grid place-items-center transition-opacity duration-500",
          isDark ? "opacity-0" : "opacity-10"
        )}
      >
        <span className="block h-8 w-8 animate-sun-rays rounded-full bg-amber-400" />
      </span>
      {/* knob: sun (day) ↔ moon (night) */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-1/2 grid -translate-y-1/2 place-items-center rounded-full shadow-md transition-all duration-300 ease-spring ltr:left-1 ltr:translate-x-0 rtl:right-1",
          isDark
            ? "h-[26px] w-[26px] bg-slate-100 ltr:translate-x-[26px] rtl:-translate-x-[26px]"
            : "h-[26px] w-[26px] bg-amber-300 ltr:translate-x-0 rtl:translate-x-0"
        )}
      >
        {isDark ? (
          <>
            <span className="absolute h-3 w-3 rounded-full bg-slate-300/60 -top-0.5 ltr:-right-0.5 rtl:-left-0.5" />
            <span className="absolute h-2 w-2 rounded-full bg-slate-300/50 bottom-0 ltr:-left-0.5 rtl:-right-0.5" />
          </>
        ) : null}
      </span>
    </button>
  );
}

/* ============================================================
   NeoField — labeled field wrapper for every form input.
   Pairs with the .neo-input CSS class for the lime-focus look.
   ============================================================ */
export function NeoField({
  label,
  icon: Icon,
  hint,
  required,
  children,
  className,
}: {
  label: string
  icon?: React.ComponentType<{ className?: string }>
  hint?: string
  required?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <label className="neo-field-label">
        {Icon && (
          <span className="neo-field-lucide">
            <Icon className="h-3 w-3" />
          </span>
        )}
        <span>
          {label}
          {required && <span className="text-destructive"> *</span>}
        </span>
      </label>
      {children}
      {hint && <p className="neo-field-hint">{hint}</p>}
    </div>
  );
}
