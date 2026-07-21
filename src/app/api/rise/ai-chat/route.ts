import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Smart fallback responses
const fallbackResponses: Record<string, string[]> = {
  'صباح': [
    '🌿 صباح الخير! ابدأ يومك بهدوء. خذ نفساً عميقاً، اشرب كوب ماء دافئ، وامنح نفسك 5 دقائق من التأمل قبل الانطلاق.',
    '☀️ تذكر: أول 60 دقيقة من يومك تحدد مساره. استثمرها فيما يهمك حقاً.',
    '🌅 "النجاح يبدأ من الصباح" — حدد 3 أولويات ليومك الآن وابدأ بالأهم.',
  ],
  'عادة': [
    '🎯 لا تحاول بناء عادات متعددة دفعة واحدة. ابدأ بعادة واحدة وثبتها لمدة 21 يوماً.',
    '📊 متوسط بناء عادة جديدة هو 66 يوماً. كن صبوراً مع نفسك.',
    '🔁 ربط العادة بعادة موجودة يزيد فرص نجاحها 3 أضعاف. مثلاً: بعد صلاة الفجر، اشرب ماء.',
  ],
  'تركيز': [
    '🧠 قاعدة العمل العميق: اختر مهمة واحدة، أغلق كل المشتتات، واعمل لمدة 50 دقيقة.',
    '⚡ تدرب يومياً على التركيز — ابدأ بـ 25 دقيقة وزِد تدريجياً.',
    '🔇 ضع هاتفك في وضع الطيران أثناء جلسات العمل العميق. التشتت الإلكتروني يقلل الذكاء بنسبة 10 نقاط.',
  ],
  'هدف': [
    '🎯 الأهداف الذكية: محددة، قابلة للقياس، واقعية، ومحددة بوقت.',
    '🚀 اقسم أهدافك الكبيرة إلى خطوات صغيرة يمكنك تنفيذها اليوم.',
    '📐 استخدم قاعدة 12 أسبوع: خطط كأنك تملك 12 أسبوعاً فقط. هذا يضاعف إنتاجيتك.',
  ],
  'صحة': [
    '😴 النوم هو أقوى أدواتك. 7-8 ساعات تزيد إنتاجيتك بنسبة 20%.',
    '💧 لا تقلل من شأن شرب الماء! الجفاف يقلل التركيز والطاقة.',
    '🏃 30 دقيقة مشي يومياً تكفي لتحسين المزاج والصحة العقلية بشكل ملحوظ.',
  ],
  'تحفيز': [
    '💪 كل شخص ناجح مر بلحظات إحباط. الفرق هو القدرة على الاستمرار.',
    '🌟 لا تقارن بدايتك بموسم حصاد الآخرين. 1% تحسن يومياً = 37 مرة أفضل بعد سنة.',
    '🔥 "الانضباط أقوى من الدافع" — حتى في الأيام التي لا تشعر فيها بالحماس، افعل الخطوة الصغيرة التالية.',
  ],
  'مراجعة': [
    '📊 حان وقت المراجعة! ما الذي سار بشكل جيد؟ ما الذي يمكن تحسينه؟',
    '🔄 في المراجعة الأسبوعية، انظر إلى أهدافك: كم منها حققت؟ ما الذي أعاقك؟',
    '📝 خصص 20 دقيقة كل أحد مساءً لمراجعة الأسبوع: الإنجازات، الدروس المستفادة، وخطة الأسبوع القادم.',
  ],
  'نوم': [
    '🌙 نم في نفس الوقت يومياً — حتى في عطلة نهاية الأسبوع. هذا ينظم ساعتك البيولوجية.',
    '📱 أبعش هاتفك عن سريرك بساعة على الأقل. الضوء الأزرق يتعارض مع الميلاتونين.',
  ],
  'مال': [
    '💰 قاعدة 50/30/20: 50% للاحتياجات، 30% للرغبات، 20% للادخار والاستثمار.',
    '📈 ابدأ صندوق طوارئ يغطي 3-6 أشهر من نفقاتك. هذا يمنحك راحة بالية لا تقدر بثمن.',
  ],
  'قراءة': [
    '📖 اقرأ 20 صفحة يومياً = 30 كتاب في السنة. المعرفة المتراكمة تغير حياتك.',
    '📚 بعد كل كتاب، اكتب 3 أفكار رئيسية وكيف ستطبقها في حياتك.',
  ],
}

function getFallbackResponse(message: string): string {
  const msg = message.toLowerCase()
  for (const [key, responses] of Object.entries(fallbackResponses)) {
    if (msg.includes(key)) {
      return responses[Math.floor(Math.random() * responses.length)]
    }
  }
  // Default contextual responses
  const defaults = [
    '🌟 أنا هنا لمساعدتك! يمكنك سؤالي عن: بناء العادات، زيادة التركيز، تحديد الأهداف، تحسين الصحة، إدارة المالية، أو الحصول على تحفيز.',
    '💡 فكّر في هذا: ما أهم شيء يمكنك إنجازه اليوم لتحقيق أهدافك؟',
    '🎯 تذكر: التقدم الصغير أفضل من الكمال المؤجل. ما الخطوة التالية؟',
    '🧠 نصيحة: قسم يومك إلى 3 أقسام — صباح للعمل العميق، ظهر للمهام الروتينية، مساء للتعلم والاسترخاء.',
  ]
  return defaults[Math.floor(Math.random() * defaults.length)]
}

async function callAI(messages: { role: string; content: string }[]): Promise<string | null> {
  try {
    // Try z-ai-web-dev-sdk first (free, available in backend)
    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()

    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content: 'أنت مدرب حياة شخصي ذكي في تطبيق RiseOS. تتحدث بالعربية دائماً. أسلوبك محفز وداعم ومختصر. إجاباتك تكون عملية وقابلة للتطبيق (أقل من 120 كلمة). استخدم الإيموجي بشكل معتدل. لا تذكر أنك AI أو نموذج لغوي.',
        },
        ...(messages as any),
      ],
      thinking: { type: 'disabled' },
    })

    return completion.choices?.[0]?.message?.content || null
  } catch (err) {
    console.error('[ai-chat] z-ai-web-dev-sdk error:', err)
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request)
    if (!userId) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

    const { message, history } = await request.json()

    if (!message) {
      return NextResponse.json({ error: 'الرسالة مطلوبة' }, { status: 400 })
    }

    // Check AI usage limits via Supabase
    const now = new Date()
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    const supabase = await getSupabaseAdmin()
    const defaultLimit = 200
    let usage: { monthlyLimit: number; monthlyUsed: number; totalUsed: number } | null = null

    if (supabase) {
      try {
        const sb = supabase as any
        const { data: usageRow } = await sb
          .from('user_ai_usage')
          .select('*')
          .eq('user_id', userId)
          .single()

        if (usageRow) {
          usage = {
            monthlyLimit: usageRow.monthly_limit || defaultLimit,
            monthlyUsed: usageRow.monthly_used || 0,
            totalUsed: usageRow.total_used || 0,
          }
        }
      } catch (err) {
        console.error('[ai-chat] usage check error:', err)
      }
    }

    if (usage && usage.monthlyLimit > 0 && usage.monthlyUsed >= usage.monthlyLimit) {
      return NextResponse.json({
        response: getFallbackResponse(message),
        fallback: true,
        reason: 'limit_reached',
        usage: { used: usage.monthlyUsed, limit: usage.monthlyLimit, total: usage.totalUsed },
      })
    }

    // Build chat history
    const chatHistory = (history || []).slice(-8).map((m: { role: string; content: string }) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }))
    chatHistory.push({ role: 'user', content: message })

    // Call AI
    const aiResponse = await callAI(chatHistory)

    let responseText: string
    let isFallback = false

    if (aiResponse) {
      responseText = aiResponse
    } else {
      responseText = getFallbackResponse(message)
      isFallback = true
    }

    // Track usage (only for real API calls) via Supabase
    if (!isFallback && supabase) {
      try {
        const sb = supabase as any
        const newUsed = (usage?.monthlyUsed || 0) + 1
        const newTotal = (usage?.totalUsed || 0) + 1
        const limit = usage?.monthlyLimit || defaultLimit

        if (usage) {
          await sb
            .from('user_ai_usage')
            .update({
              monthly_used: newUsed,
              total_used: newTotal,
              monthly_limit: limit,
              month: monthKey,
            })
            .eq('user_id', userId)
        } else {
          await sb
            .from('user_ai_usage')
            .insert({
              user_id: userId,
              monthly_used: 1,
              total_used: 1,
              monthly_limit: defaultLimit,
              month: monthKey,
            })
        }
      } catch (err) {
        console.error('[ai-chat] usage tracking error:', err)
      }
    }

    // Get updated usage
    let updatedUsage = usage
    if (supabase && !isFallback) {
      try {
        const sb = supabase as any
        const { data: u } = await sb
          .from('user_ai_usage')
          .select('monthly_used, monthly_limit, total_used')
          .eq('user_id', userId)
          .single()
        if (u) {
          updatedUsage = {
            monthlyLimit: u.monthly_limit,
            monthlyUsed: u.monthly_used,
            totalUsed: u.total_used,
          }
        }
      } catch {
        // ignore
      }
    }

    return NextResponse.json({
      response: responseText,
      fallback: isFallback,
      usage: updatedUsage ? {
        used: updatedUsage.monthlyUsed,
        limit: updatedUsage.monthlyLimit,
        total: updatedUsage.totalUsed,
      } : { used: 0, limit: defaultLimit, total: 0 },
    })
  } catch (error) {
    console.error('[ai-chat] error:', error)
    return NextResponse.json({
      response: getFallbackResponse('default'),
      fallback: true,
      reason: 'error',
    })
  }
}