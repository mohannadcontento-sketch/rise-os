"use client";

import { Card } from "@/components/ui/card";
import { Construction, Sparkles } from "lucide-react";
import { useAppStore } from "@/store/app-store";
import { MODULES } from "./modules";

/** Placeholder shown for modules not yet fully built. */
export function ComingSoon() {
  const { activeModule } = useAppStore();
  const mod = MODULES.find((m) => m.id === activeModule);
  return (
    <div className="fadeSlideUp">
      <Card className="premium-card relative overflow-hidden p-10 text-center">
        <div className="absolute inset-0 bg-gradient-to-bl from-[color-mix(in_oklch,var(--emerald)_8%,transparent)] to-[color-mix(in_oklch,var(--gold)_6%,transparent)]" />
        <div className="relative">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--emerald)] to-[var(--forest)] text-white">
            <Construction className="h-7 w-7" />
          </div>
          <h2 className="mb-2 text-xl font-extrabold">{mod?.label}</h2>
          <p className="mx-auto mb-1 max-w-md text-sm text-muted-foreground">{mod?.desc}</p>
          <p className="mx-auto max-w-md text-xs text-muted-foreground">
            هذه الوحدة قيد التطوير. الوحدات الأساسية (لوحة التحكم، المهام، العادات، الروتين الصباحي، العمل العميق، الإعدادات) جاهزة الآن.
          </p>
          <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_oklch,var(--gold)_15%,transparent)] px-3 py-1 text-xs font-semibold text-[var(--gold)]">
            <Sparkles className="h-3 w-3" /> قريباً
          </div>
        </div>
      </Card>
    </div>
  );
}
