"use client";

import { useEffect, useState, useMemo } from "react";
import { useAppStore } from "@/store/app-store";
import { MODULES, type ModuleDef } from "./modules";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator } from "@/components/ui/command";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Check, Search } from "lucide-react";
import { MODULE_GROUPS } from "./modules";

export function CommandPalette() {
  const { activeModule, setActiveModule } = useAppStore();
  const [open, setOpen] = useState(false);

  // Global keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      // Number shortcuts 1-9 for first 9 modules
      if ((e.metaKey || e.ctrlKey) && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const idx = parseInt(e.key, 10) - 1;
        const mod = MODULES[idx];
        if (mod) setActiveModule(mod.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setActiveModule]);

  const grouped = useMemo(() => {
    const g: Record<string, ModuleDef[]> = {};
    for (const m of MODULES) {
      (g[m.group] ??= []).push(m);
    }
    return g;
  }, []);

  const handleSelect = (id: ModuleDef["id"]) => {
    setActiveModule(id);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 shadow-2xl max-w-xl" aria-describedby={undefined}>
        <Command className="rounded-xl" loop>
          <div className="flex items-center gap-2 border-b border-border/60 px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <CommandInput
              placeholder="ابحث عن وحدة أو أمر..."
              className="h-12 border-0 ring-0 focus:ring-0"
            />
            <kbd className="hidden shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-block">
              ESC
            </kbd>
          </div>
          <CommandList className="max-h-[400px] overflow-y-auto">
            <CommandEmpty>لا توجد نتائج</CommandEmpty>
            {Object.entries(grouped).map(([group, items]) => (
              <CommandGroup key={group} heading={MODULE_GROUPS[group as keyof typeof MODULE_GROUPS]} className="text-sm">
                {items.map((m) => {
                  const Icon = m.icon;
                  const active = activeModule === m.id;
                  return (
                    <CommandItem
                      key={m.id}
                      value={`${m.label} ${m.desc}`}
                      onSelect={() => handleSelect(m.id)}
                      className="group flex cursor-pointer items-center gap-3 px-3 py-2 text-sm aria-selected:bg-accent"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground group-aria-selected:bg-[var(--emerald)] group-aria-selected:text-white">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{m.label}</span>
                          {m.ready && (
                            <span className="rounded-full bg-[color-mix(in_oklch,var(--emerald)_15%,transparent)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--emerald)]">
                              جاهز
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-muted-foreground">{m.desc}</span>
                      </div>
                      {active && <Check className="h-4 w-4 text-[var(--emerald)]" />}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
            <CommandSeparator />
            <CommandGroup heading="اختصارات">
              <div className="flex flex-wrap gap-2 px-3 py-2 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1"><kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">⌘K</kbd> فتح/إغلاق</span>
                <span className="flex items-center gap-1"><kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">⌘1-9</kbd> تبديل سريع</span>
                <span className="flex items-center gap-1"><kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">↑↓</kbd> تنقل</span>
              </div>
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
