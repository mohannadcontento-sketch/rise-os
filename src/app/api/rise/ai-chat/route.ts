import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseWithAuth, generateZhipuToken } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

// Fallback local responses
const fallbackResponses: Record<string, string[]> = {
  'صباح': [
    '🌿 صباح الخير! ابدأ يومك بهدوء. خذ نفساً عميقاً، اشرب كوب ماء دافئ، وامنح نفسك 5 دقائق من التأمل قبل الانطلاق.',
    '☀️ تذكر: أول 60 دقيقة من يومك تحدد مساره. استثمرها فيما يهمك حقاً.',
  ],
  'عادة': [
    '🎯 لا تحاول بناء عادات متعددة دفعة واحدة. ابدأ بعادة واحدة وثبتها لمدة 21 يوماً.',
    '📊 متوسط بناء عادة جديدة هو 66 يوماً. كن صبوراً مع نفسك.',
  ],
  'تركيز': [
    '🧠 قاعدة العمل العميق: اختر مهمة واحدة، أغلق كل المشتتات، واعمل لمدة 50 دقيقة.',
    '⚡ تدرب يومياً على التركيز — ابدأ بـ 25 دقيقة وزِد تدريجياً.',
  ],
  'هدف': [
    '🎯 الأهداف الذكية: محددة، قابلة للقياس، واقعية، ومحددة بوقت.',
    '🚀 اقسم أهدافك الكبيرة إلى خطوات صغيرة يمكنك تنفيذها اليوم.',
  ],
  'صحة': [
    '😴 النوم هو أقوى أدواتك. 7-8 ساعات تزيد إنتاجيتك بنسبة 20%.',
    '💧 لا تقلل من شرب الماء! الجفاف يقلل التركيز والطاقة.',
  ],
  'تحفيز': [
    '💪 كل شخص ناجح مر بلحظات إحباط. الفرق هو القدرة على الاستمرار.',
    '🌟 لا تقارن بدايتك بموسم حصاد الآخرين. 1% تحسن يومياً = 37 مرة أفضل.',
  ],
  'مراجعة': [
    '📊 حان وقت المراجعة! ما الذي سار بشكل جيد؟ ما الذي يمكن تحسينه؟',
    '🔄 في المراجعة الأسبوعية، انظر إلى أهدافك: كم منها حققت؟',
  ],
}

function getFallbackResponse(message: string): string {
  const msg = message.toLowerCase()
  for (const [key, responses] of Object.entries(fallbackResponses)) {
    if (msg.includes(key)) {
      return responses[Math.floor(Math.random() * responses.length)]
    }
  }
  return '🌟 أنا هنا لمساعدتك! يمكنك سؤالي عن: بناء العادات، زيادة التركيز، تحديد الأهداف، تحسين الصحة، أو الحصول على تحفيز.'
}

async function callZhipuAI(messages: { role: string; content: string }[]): Promise<string | null> {
  const token = generateZhipuToken()

  const res = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      model: 'glm-4-flash',
      messages: [
        {
          role: 'system',
          content: 'أنت مدرب حياة شخصي ذكي في تطبيق RiseOS. تتحدث بالعربية دائماً. أسلوبك محفز وداعم. إجاباتك مختصرة ومفيدة (أقل من 150 كلمة). استخدم الإيموجي بشكل معتدل.',
        },
        ...messages,
      ],
      max_tokens: 500,
      temperature: 0.7,
    }),
  })

  if (!res.ok) return null

  const data = await res.json()
  return data.choices?.[0]?.message?.content || null
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request)
    if (!userId) return NextResponse.json({ error: 'غير مصرح', offline: true }, { status: 401 })
    const supabase = getSupabaseWithAuth(req)

    const { message, history } = await request.json()

    if (!message) {
      return NextResponse.json({ error: 'الرسالة مطلوبة' }, { status: 400 })
    }

    // Check AI usage limits
    const now = new Date()
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    const { data: usage } = await supabase
      .from('UserAIUsage')
      .select('*')
      .eq('userId', userId)
      .single()

    const defaultLimit = 100

    if (usage && usage.monthlyLimit > 0 && usage.monthlyUsed >= usage.monthlyLimit) {
      return NextResponse.json({
        response: getFallbackResponse(message),
        fallback: true,
        reason: 'limit_reached',
        used: usage.monthlyUsed,
        limit: usage.monthlyLimit,
      })
    }

    // Try ZhipuAI
    const chatHistory = (history || []).slice(-6)
    chatHistory.push({ role: 'user', content: message })

    const aiResponse = await callZhipuAI(chatHistory)

    let responseText: string
    let isFallback = false

    if (aiResponse) {
      responseText = aiResponse
    } else {
      responseText = getFallbackResponse(message)
      isFallback = true
    }

    // Track usage (only for API calls, not fallback)
    if (!isFallback) {
      if (usage) {
        const newUsed = (usage.monthlyUsed || 0) + 1
        const newTotal = (usage.totalUsed || 0) + 1
        const limit = usage.monthlyLimit || defaultLimit

        await supabase.from('UserAIUsage').upsert({
          userId,
          monthlyUsed: newUsed,
          totalUsed: newTotal,
          monthlyLimit: limit,
          month: monthKey,
        })
      } else {
        await supabase.from('UserAIUsage').upsert({
          userId,
          monthlyUsed: 1,
          totalUsed: 1,
          monthlyLimit: defaultLimit,
          month: monthKey,
        })
      }
    }

    // Get updated usage
    const { data: updatedUsage } = await supabase
      .from('UserAIUsage')
      .select('*')
      .eq('userId', userId)
      .single()

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
    console.error('AI Chat error:', error)
    return NextResponse.json({
      response: getFallbackResponse('default'),
      fallback: true,
      reason: 'error',
    })
  }
}