"use client";

// ============================================================
// src/components/rise/maintenance-watch.tsx — مراقبة نهاية الصيانة
//
// مكون client صغير (بلا تبعيات) لصفحة /maintenance:
//   1) يستطلع /api/rise/system/status كل 20 ثانية
//   2) يعرض رسالة الأدمن المخصصة إن وُجدت (maintenance_message)
//   3) بمجرد maintenance=false يعيد المستخدم إلى /app فورًا
// فشل الشبكة = تجاهل صامت وإعادة المحاولة في الدورة القادمة.
// ============================================================

import { useEffect, useState } from "react";

export function MaintenanceWatch() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    const check = async () => {
      try {
        const res = await fetch("/api/rise/system/status", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!alive || !data) return;

        if (typeof data.message === "string" && data.message.trim()) {
          setMessage(data.message);
        }
        // انتهت الصيانة؟ ارجع للتطبيق فورًا
        if (data.maintenance === false) {
          window.location.href = "/app";
        }
      } catch {
        /* شبكة غير متاحة — نعيد في الدورة القادمة */
      }
    };

    void check();
    const timer = setInterval(check, 20_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  if (!message) return null;

  return (
    <p
      className="mt-6 max-w-md rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-3.5 text-sm leading-relaxed text-foreground"
      role="status"
    >
      {message}
    </p>
  );
}
