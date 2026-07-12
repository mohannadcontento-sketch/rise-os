'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles,
  Send,
  Sun,
  TrendingUp,
  Target,
  Lightbulb,
  Trash2,
  User,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/* ────────────── Types ────────────── */

interface ChatMessage {
  id: string
  role: 'user' | 'ai'
  content: string
  timestamp: number
}

/* ────────────── Quick Actions & Responses ────────────── */

const quickActions = [
  {
    id: 'morning',
    label: 'نصيحة صباحية',
    icon: Sun,
    color: 'bg-gold/10 text-gold hover:bg-gold/20',
    responses: [
      'صباح الخير! ✨ ابدأ يومك بشكر الله على نعمة جديدة. تذكر: أفضل استثمار لوقتك هو الاستثمار في نفسك. ابدأ بأهم مهمة لديك الآن قبل أن تستهلكك المشتتات. أنت قادر على إنجاز عظيم اليوم!',
      'صباح النور! 🌅 نصيحتي لك اليوم: اختر 3 أولويات فقط وركز عليها. لا تحاول فعل كل شيء، بل افعل الشيء الصحيح. ابدأ بتمرين خفيف وشرب ماء دافئ، ثم انطلق نحو أهدافك!',
      'يوم جديد، بداية جديدة! 💪 تذكر أن النجاح ليس حدثاً بل عملية. كل صباح هو فرصة لتصبح نسخة أفضل من نفسك. خذ نفساً عميقاً، ابتسم، وابدأ!',
    ],
  },
  {
    id: 'review',
    label: 'مراجعة أسبوعية',
    icon: TrendingUp,
    color: 'bg-emerald-accent/10 text-emerald-accent hover:bg-emerald-accent/20',
    responses: [
      'مرحباً! دعنا نراجع أسبوعك 📊\n\nفي المراجعة الأسبوعية، اسأل نفسك:\n\n✅ ما الثلاثة أشياء التي سارت بشكل جيد؟\n📝 ما الذي يمكن تحسينه؟\n💡 ما أهم درس تعلمته؟\n🎯 ما الذي تريد التركيز عليه الأسبوع القادم؟\n\nخذ 10 دقائق واكتب إجاباتك. المراجعة المنتظمة هي سر التحسين المستمر!',
      'وقت المراجعة! 🔄\n\nانظر إلى أهدافك الأسبوعية:\n• كم منها حققت؟\n• ما الذي عطلك؟\n• ما المهارات التي طورتها؟\n\nالوعي الذاتي هو الخطوة الأولى نحو النمو. لا تحكم على نفسك بقسوة، بل تعلم من التجربة!',
    ],
  },
  {
    id: 'habits',
    label: 'اقتراح عادات',
    icon: Target,
    color: 'bg-forest/10 text-forest hover:bg-forest/20',
    responses: [
      'إليك بعض العادات القوية التي أقترحها عليك 🎯\n\n🔹 قراءة 20 صفحة يومياً - ستقرأ كتاباً شهرياً!\n🔹 التمرين 30 دقيقة - صحتك أغلى استثمار\n🔹 التخطيط الليلي - خطط لليوم التالي قبل النوم\n🔹 شرب 8 أكواب ماء - طاقة وتركيز أفضل\n🔹 كتابة 3 أشياء تشكر عليها - سعادة وإيجابية\n\nاختر عادة واحدة وابدأ بها اليوم. لا تحاول تغيير كل شيء دفعة واحدة!',
      'عادات ناجحة أقترحها 💡\n\n✨ قاعدة الدقيقتين: إذا استغرقت مهمة أقل من دقيقتين، افعلها فوراً\n✨ الاستيقاظ في نفس الوقت يومياً\n✨ 10 دقائق تأمل صباحي\n✨ تعلم شيء جديد كل يوم\n✨ مراجعة الأهداف أسبوعياً\n\nالسر ليس في العادات الكبيرة، بل في الاتساق في العادات الصغيرة!',
    ],
  },
  {
    id: 'productivity',
    label: 'نصيحة إنتاجية',
    icon: Lightbulb,
    color: 'bg-purple-500/10 text-purple-500 hover:bg-purple-500/20',
    responses: [
      'نصيحة إنتاجية مهمة! ⚡\n\nتقنية البومودورو: اشتغل 25 دقيقة بتركيز كامل، ثم استرح 5 دقائق. بعد 4 جولات، خذ استراحة طويلة 15-30 دقيقة.\n\nالسر هو أن التركيز المحدود الزمن يعطيك شعوراً بالإلحاح ويساعدك على تجنب المشتتات. جربها الآن!',
      'نصيحة ذهبية للإنتاجية 🏆\n\nقاعدة 80/20 (باريتو): 80% من نتائجك تأتي من 20% من جهودك. حدد المهام الأكثر تأثيراً وركز عليها أولاً!\n\nنصيحة أخرى: أغلق الإشعارات غير الضرورية. كل إشعار يقطع تركيزك يحتاج 23 دقيقة للعودة. احمِ وقتك!',
      'طريقة "أكل الضفدع" 🐸\n\nابدأ يومك بأصعب مهمة لديك (الضفدع!). عندما تنهيها، ستحس بإنجاز عظيم وبقية اليوم سيكون أسهل بكثير.\n\nتذكر: الإنتاجية ليست عن فعل المزيد، بل عن فعل الأشياء الصحيحة!',
    ],
  },
]

const genericResponses = [
  'سؤال رائع! 💭 أنصحك بأخذ لحظة للتفكير في هذا الموضوع. كل تحدٍ هو فرصة للنمو والتطور. ثق بقدراتك واستمر في المحاولة!',
  'أقدر مشاركتك! 🌟 تذكر أن الرحلة الطويلة تبدأ بخطوة واحدة. لا تنتظر الكمال، بل ابدأ الآن وحسّن مع الوقت.',
  'فكرة ممتازة! ✨ أفضل طريقة للتحقق من فكرة هي تنفيذها. ضع خطة بسيطة وابدأ بخطوتك الأولى اليوم!',
  'شكراً لسؤالك! 🎯 تذكر دائماً أن التركيز على ما يمكنك التحكم فيه أهم من القلق مما لا تستطيع. ركز على خطوتك التالية فقط.',
  'أحب هذا التفكير! 💪 النجاح ليس خطاً مستقيماً بل هناك منعطفات وتحديات. المهم هو أن تستمر وتتعلم من كل تجربة.',
  'استمر! 🔥 أنت في الطريق الصحيح. تذكر أن الاتساق يتفوق على الكمال. كل يوم تخطو خطوة صغيرة تقربك من هدفك الكبير.',
]

/* ────────────── Component ────────────── */

export default function AICoach() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [typingDots, setTypingDots] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const STORAGE_KEY = 'rise-ai-chat'

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) setMessages(JSON.parse(stored))
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
    }
  }, [messages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  // Typing animation
  useEffect(() => {
    if (!isTyping) return
    const interval = setInterval(() => {
      setTypingDots((prev) => (prev >= 3 ? 0 : prev + 1))
    }, 400)
    return () => clearInterval(interval)
  }, [isTyping])

  const addAIMessage = (content: string) => {
    setIsTyping(true)
    const delay = Math.min(content.length * 8, 2000)
    setTimeout(() => {
      setIsTyping(false)
      setTypingDots(0)
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'ai',
          content,
          timestamp: Date.now(),
        },
      ])
    }, delay)
  }

  const handleQuickAction = (actionId: string) => {
    const action = quickActions.find((a) => a.id === actionId)
    if (!action) return

    // Add user message
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: 'user',
        content: action.label,
        timestamp: Date.now(),
      },
    ])

    // Pick random response
    const response = action.responses[Math.floor(Math.random() * action.responses.length)]
    addAIMessage(response)
  }

  const handleSend = () => {
    if (!input.trim()) return
    const userMessage = input.trim()
    setInput('')

    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: 'user',
        content: userMessage,
        timestamp: Date.now(),
      },
    ])

    const response = genericResponses[Math.floor(Math.random() * genericResponses.length)]
    addAIMessage(response)
  }

  const clearChat = () => {
    setMessages([])
    localStorage.removeItem(STORAGE_KEY)
  }

  const hasMessages = messages.length > 0

  return (
    <div className="space-y-6 max-w-3xl mx-auto flex flex-col h-[calc(100vh-10rem)]">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-emerald-accent" />
            المدرب الذكي
          </h2>
          <p className="text-sm text-muted-foreground mt-1">مساعدك الشخصي للنمو والتطوير</p>
        </div>
        {hasMessages && (
          <Button variant="ghost" size="sm" onClick={clearChat} className="gap-1.5 text-xs text-muted-foreground hover:text-destructive">
            <Trash2 className="w-3.5 h-3.5" />
            مسح المحادثة
          </Button>
        )}
      </div>

      {/* Quick Actions (show when no messages or at top) */}
      {!hasMessages && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="shrink-0"
        >
          <div className="grid grid-cols-2 gap-3">
            {quickActions.map((action, i) => {
              const Icon = action.icon
              return (
                <motion.button
                  key={action.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleQuickAction(action.id)}
                  className={cn('flex items-center gap-3 p-4 rounded-2xl glass transition-all hover:shadow-lg', action.color)}
                >
                  <div className="p-2 rounded-xl bg-background/60">
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="font-semibold text-sm text-right">{action.label}</span>
                </motion.button>
              )
            })}
          </div>
        </motion.div>
      )}

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 min-h-0">
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn('flex gap-3', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}
            >
              {/* Avatar */}
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1',
                msg.role === 'ai'
                  ? 'bg-gradient-to-br from-emerald-accent to-forest text-white'
                  : 'bg-muted/50'
              )}>
                {msg.role === 'ai' ? (
                  <Sparkles className="w-4 h-4" />
                ) : (
                  <User className="w-4 h-4 text-muted-foreground" />
                )}
              </div>

              {/* Message Bubble */}
              <div className={cn(
                'max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
                msg.role === 'ai'
                  ? 'glass rounded-tl-sm'
                  : 'bg-emerald-accent text-white rounded-tr-sm'
              )}>
                <p className="whitespace-pre-wrap">{msg.content}</p>
                <p className={cn(
                  'text-[10px] mt-1.5',
                  msg.role === 'ai' ? 'text-muted-foreground/60' : 'text-white/60'
                )}>
                  {new Date(msg.timestamp).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Typing Indicator */}
        {isTyping && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 0 }}
            className="flex gap-3"
          >
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1 bg-gradient-to-br from-emerald-accent to-forest text-white">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="glass rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-2 h-2 rounded-full bg-emerald-accent"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{
                      duration: 1.2,
                      repeat: Infinity,
                      delay: i * 0.2,
                    }}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Actions Bar (show after messages) */}
      {hasMessages && (
        <div className="shrink-0 flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
          {quickActions.map((action) => {
            const Icon = action.icon
            return (
              <button
                key={action.id}
                onClick={() => handleQuickAction(action.id)}
                className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap glass transition-all hover:shadow-md', action.color)}
              >
                <Icon className="w-3.5 h-3.5" />
                {action.label}
              </button>
            )
          })}
        </div>
      )}

      {/* Input */}
      <div className="shrink-0">
        <div className="flex items-center gap-2 glass rounded-2xl p-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="اكتب رسالتك..."
            className="flex-1 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/50"
            dir="rtl"
            disabled={isTyping}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            className={cn(
              'p-2.5 rounded-xl transition-all',
              input.trim() && !isTyping
                ? 'bg-emerald-accent text-white hover:bg-emerald-accent/90'
                : 'bg-muted/50 text-muted-foreground/30'
            )}
          >
            <Send className="w-4 h-4 rotate-180" />
          </button>
        </div>
      </div>
    </div>
  )
}