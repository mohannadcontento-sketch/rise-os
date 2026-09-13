// ============================================================
// src/app/contact/page.tsx — تواصل معنا (المرحلة 11: Landing)
//
// قناة تواصل واحدة واضحة لكل الأغراض: الدعم، الفوترة، الأمان،
// والشؤون التجارية — مع التزامات زمن رد معلنة.
// ============================================================

import type { Metadata } from "next";
import LegalShell, { LegalSection, LegalList } from "@/components/rise/legal-shell";
import { SUPPORT_EMAIL, BUSINESS_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "تواصل معنا | أوج",
  description:
    "قنوات التواصل مع فريق أوج: الدعم الفني والفوترة والأمان والإبلاغ عن الثغرات والشراكات — مع أزمنة الرد المتوقعة.",
  alternates: { canonical: "/contact" },
};

const CHANNELS: Array<[string, string, string]> = [
  ["الدعم الفني والمشاكل", SUPPORT_EMAIL, "رد خلال ٢٤ ساعة"],
  ["الفوترة والاشتراكات والاسترجاع", SUPPORT_EMAIL, "رد خلال يوم عمل واحد"],
  ["الإبلاغ عن ثغرة أمنية", SUPPORT_EMAIL, "رد أولي خلال ١٢ ساعة"],
  ["الشراكات والشؤون التجارية", BUSINESS_EMAIL, "رد خلال ٢-٣ أيام عمل"],
];

export default function ContactPage() {
  return (
    <LegalShell
      showLastUpdated={false}
      title="تواصل معنا"
      description="بريد واحد يوصلنا بأي أمر — اختر الأنسب لرسالتك من القنوات أدناه وسنجيبك في الوقت المعلن لكل قناة."
    >
      <LegalSection title="قنوات التواصل">
        <div className="mt-4 overflow-hidden rounded-2xl border border-border/60">
          {CHANNELS.map(([label, email, sla], i) => (
            <a
              key={label}
              href={`mailto:${email}`}
              className={[
                "flex flex-col gap-1 px-5 py-4 transition-colors hover:bg-foreground/5",
                "sm:flex-row sm:items-center sm:justify-between sm:gap-4",
                i > 0 ? "border-t border-border/60" : "",
              ].join(" ")}
            >
              <span className="font-bold text-foreground">{label}</span>
              <span className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="font-bold text-emerald-500" dir="ltr">{email}</span>
                <span className="text-xs text-muted-foreground/70">{sla}</span>
              </span>
            </a>
          ))}
        </div>
      </LegalSection>

      <LegalSection title="قبل أن تراسلنا">
        <LegalList
          items={[
            "مشكلة في التطبيق؟ أرفق لقطة شاشة واسم المتصفح/الجهاز ورقم الحساب إن أمكن — يوفر علينا جولة استفسار كاملة.",
            "مشكلة اشتراك أو دفع؟ أرفق رقم المرجع (يظهر مع طلب الترقية داخل التطبيق) ولقطة إيصال الدفع.",
            "اقتراح ميزة؟ صف التجربة التي تريدها لا الحل التقني — التفاصيل التقنية عملنا.",
          ]}
        />
      </LegalSection>

      <LegalSection title="الإبلاغ عن ثغرة أمنية">
        <p>
          وجدت ما يبدو ثغرة؟ شكرًا لك مقدمًا — أرسلها خاصًا على بريد الدعم بعنوان
          يبدأ بكلمة «Security» ولا تنشرها في المجتمع أو أي مكان عام قبل إصلاحها.
          نتعامل مع البلاغات الأمنية بأولوية قصوى، وننسب الفضل لصاحبه في التحديثات
          إن رغب. الاستخدام المسيء المقصود لثغرة معروفة (على بيانات غيرك أو على
          استقرار الخدمة) يُعامل كخل جسيم بشروط الاستخدام.
        </p>
      </LegalSection>

      <LegalSection title="داخل التطبيق">
        <p>
          معظم أمور الحساب أسرع بيدك من رسالتنا: تصدير البيانات، حذف الحساب، تفضيلات
          الإشعارات، وإدارة مفاتيح MCP — كلها في شاشة الإعدادات دون انتظار رد أحد.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
