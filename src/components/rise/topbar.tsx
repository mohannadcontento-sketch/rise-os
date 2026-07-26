"use client";

import { useAppStore } from "@/store/app-store";
import { MODULES } from "./modules";
import { Button } from "@/components/ui/button";
import { Menu, Sun, Moon, Monitor, Flame, Trophy, Zap } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState, useSyncExternalStore } from "react";
import { formatArabicDate, greeting, levelProgress } from "@/lib/rise-utils";

/** Client-only mount flag without setState-in-effect (avoids hydration mismatch). */
function useMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

export function Topbar() {
  const { activeModule, setSidebarOpen, user } = useAppStore();
  const mod = MODULES.find((m) => m.id === activeModule);
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const cycleTheme = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  const lp = user ? levelProgress(user.xp, user.xpToNextLevel) : 0;

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/60 bg-background/80 px-4 backdrop-blur-xl lg:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden h-10 w-10"
        onClick={() => setSidebarOpen(true)}
        aria-label="فتح القائمة"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-base font-bold sm:text-lg">
            {mod?.label ?? "RiseOS"}
          </h1>
          <p className="hidden truncate text-xs text-muted-foreground sm:block">
            {mod?.desc ?? ""}
          </p>
        </div>
      </div>

      <div className="hidden items-center gap-3 md:flex">
        <div className="hidden text-left lg:block">
          <div className="text-xs font-semibold text-foreground">{greeting(now)}</div>
          <div className="text-[10px] text-muted-foreground">{formatArabicDate(now)}</div>
        </div>

        {user && (
          <div className="flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1.5">
            <Trophy className="h-3.5 w-3.5 text-[var(--gold)]" />
            <span className="text-xs font-bold">مستوى {user.level}</span>
            <div className="relative h-1.5 w-16 overflow-hidden rounded-full bg-muted">
              <div
                className="absolute inset-y-0 right-0 rounded-full bg-gradient-to-l from-[var(--emerald)] to-[var(--gold)] transition-all"
                style={{ width: `${lp}%` }}
              />
            </div>
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {user.xp}/{user.xpToNextLevel}
            </span>
          </div>
        )}

        {user && user.streak > 0 && (
          <div className="flex items-center gap-1.5 rounded-full border border-[color-mix(in_oklch,var(--gold)_40%,transparent)] bg-[color-mix(in_oklch,var(--gold)_12%,transparent)] px-3 py-1.5">
            <Flame className="h-3.5 w-3.5 text-[var(--gold)]" />
            <span className="text-xs font-bold tabular-nums">{user.streak}</span>
          </div>
        )}
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-10 w-10"
        onClick={cycleTheme}
        aria-label="تبديل المظهر"
      >
        {mounted ? <ThemeIcon className="h-5 w-5" /> : <Monitor className="h-5 w-5" />}
      </Button>
    </header>
  );
}
