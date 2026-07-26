import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getDefaultUser } from "@/lib/default-user";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SYSTEM_PROMPT = `أنت "رِيس" (Rise)، مدرب الإنتاجية الشخصي بالعربية الفصحى المبسطة.

مهمتك:
- تساعد المستخدم على امتلاك صباحه وحياته عبر إدارة المهام، العادات، الأهداف، والعمل العميق.
- تعطي نصائح عملية، قصيرة، وواضحة (3-5 أسطر غالباً).
- تستخدم أسلوباً محفّزاً ودافئاً دون مبالغة.
- عندما يسأل عن شيء عام، اربطه بالأنظمة: مهام، عادات، تركيز، أهداف.
- إن سُئلت عن هدف غير واقعي، اقترح تقسيمه لخطوات صغيرة.
- لا تخترع أرقاماً أو إحصاءات. إن لم تعرف، قل ذلك.
- تجنب الكلام العام المفرط؛ كن محدداً وقابلاً للتنفيذ.

النبرة: صديق حكيم، ليس أستاذاً جامعياً. استخدم "أنت" و"ابدأ" و"جرّب".`;

const ChatSchema = z.object({
  message: z.string().min(1, "الرسالة فارغة").max(2000, "الرسالة طويلة جداً"),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().max(2000),
  })).max(20).optional().default([]),
});

const QUICK_PROMPTS = [
  "كيف أخطط ليومي؟",
  "أشعر بفقدان التركيز، ما الحل؟",
  "كيف أبني عادة صباحية؟",
  "اقترح لي 3 أهداف لهذا الأسبوع",
  "كيف أتغلب على التسويف؟",
];

/** GET /api/rise/ai-coach — returns quick prompts + usage stats. */
export async function GET() {
  try {
    const user = await getDefaultUser();
    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    // Count focus sessions this month as a proxy for activity (no separate AI usage table yet)
    const sessions = await db.focusSession.count({
      where: { userId: user.id, startedAt: { gte: monthStart } },
    });
    return NextResponse.json({
      quickPrompts: QUICK_PROMPTS,
      usageThisMonth: sessions,
      greeting: "مرحباً! أنا رِيس، مدربك الشخصي. كيف أساعدك اليوم؟",
    });
  } catch (e) {
    console.error("[ai-coach GET]", e);
    return NextResponse.json({ error: "فشل التحميل" }, { status: 500 });
  }
}

/** POST /api/rise/ai-coach — chat with the AI coach. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "جسم غير صالح" }, { status: 400 });
    const parsed = ChatSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" }, { status: 400 });
    }

    const { message, history } = parsed.data;

    // Dynamically import to avoid loading SDK on every cold start unnecessarily
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();

    const messages = [
      { role: "assistant" as const, content: SYSTEM_PROMPT },
      ...history.map((h) => ({ role: h.role, content: h.content })),
      { role: "user" as const, content: message },
    ];

    const completion = await zai.chat.completions.create({
      messages,
      thinking: { type: "disabled" },
    });

    const reply = completion.choices[0]?.message?.content?.trim();

    if (!reply) {
      return NextResponse.json({ error: "لم يصل رد من المدرب. حاول مرة أخرى." }, { status: 502 });
    }

    return NextResponse.json({ reply });
  } catch (e) {
    console.error("[ai-coach POST]", e);
    const msg = e instanceof Error ? e.message : "فشل الاتصال بالمدرب الذكي";
    return NextResponse.json(
      { error: "تعذّر الوصول للمدرب الذكي حالياً. تأكد من الاتصال بالإنترنت.", detail: msg },
      { status: 500 }
    );
  }
}
