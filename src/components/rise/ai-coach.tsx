'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
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
  Brain,
  Heart,
  Moon,
  MessageCircle,
  Zap,
  AlertCircle,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useRiseStore } from '@/store/app-store'

/* ────────────── Types ────────────── */

interface ChatMessage {
  id: string
  role: 'user' | 'ai'
  content: string
  timestamp: number
  isFallback?: boolean
}

/* ────────────── Fallback Response Engine ────────────── */

function randomFrom(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)]
}

function generateFallbackResponse(message: string): string {
  const msg = message.toLowerCase()

  if (msg.includes('صباح') || msg.includes('صباحي')) {
    return randomFrom([
      '🌿 صباح الخير! ابدأ يومك بهدوء. خذ نفساً عميقاً، اشرب كوب ماء دافئ، وامنح نفسك 5 دقائق من التأمل قبل الانطلاق.',
      '☀️ تذكر: أول 60 دقيقة من يومك تحدد مساره. استثمرها فيما يهمك حقاً.',
      '💧 نصيحة صباحية: لا تفتح هاتفك خلال أول 30 دقيقة. اكتب 3 أشياء تشكر الله عليها.',
    ])
  }

  if (msg.includes('عادة') || msg.includes('عادات')) {
    return randomFrom([
      '🎯 لا تحاول بناء عادات متعددة دفعة واحدة. ابدأ بعادة واحدة صغيرة وثبتها لمدة 21 يوماً.',
      '📊 متوسط بناء عادة جديدة هو 66 يوماً. كن صبوراً مع نفسك.',
      '🔥 سر العادات: اجعلها سهلة جداً لدرجة أنك لا تستطيع رفضها.',
    ])
  }

  if (msg.includes('تركيز') || msg.includes('إنتاجي') || msg.includes('عمل')) {
    return randomFrom([
      '🧠 قاعدة العمل العميق: اختر مهمة واحدة، أغلق كل المشتتات، واعمل لمدة 50 دقيقة متواصلة.',
      '⚡ أهم مهارة في عصرنا: القدرة على التركيز العميق. تدرب يومياً.',
      '📋 في نهاية كل يوم، اكتب أهم 3 مهام للغد. هذه البساطة هي سر الإنتاجية.',
    ])
  }

  if (msg.includes('هدف') || msg.includes('أهداف')) {
    return randomFrom([
      '🎯 الأهداف الذكية: محددة، قابلة للقياس، واقعية، ومحددة بوقت.',
      '🚀 اقسم أهدافك الكبيرة إلى خطوات صغيرة يمكنك تنفيذها اليوم.',
    ])
  }

  if (msg.includes('نوم') || msg.includes('صحة') || msg.includes('صح')) {
    return randomFrom([
      '😴 النوم هو أقوى أدواتك. 7-8 ساعات تزيد إنتاجيتك بنسبة 20%.',
      '💧 لا تقلل من شرب الماء! الجفاف يقلل التركيز والطاقة.',
      '🏃 حتى 15 دقيقة من المشي تزيد إبداعك بنسبة 60%.',
    ])
  }

  if (msg.includes('تحفيز') || msg.includes('محبط') || msg.includes('صعب') || msg.includes('تعب')) {
    return randomFrom([
      '💪 تذكر: كل شخص ناجح مر بلحظات إحباط. الفرق هو القدرة على الاستمرار.',
      '🌟 لا تقارن بدايتك بموسم حصاد الآخرين. 1% تحسن يومياً = 37 مرة أفضل.',
      '🔥 "النجاح ليس نهائياً والفشل ليس قاتلاً. الشجاعة للاستمرار هي ما يهم."',
    ])
  }

  if (msg.includes('مراجعة') || msg.includes('مراجع')) {
    return randomFrom([
      '📊 حان وقت المراجعة! ما الذي سار بشكل جيد؟ ما الذي يمكن تحسينه؟',
      '🔄 قارن نفسك بنفسك الأسبوع الماضي. التقدم بالنسبة لنفسك هو المقياس الحقيقي.',
    ])
  }

  return randomFrom([
    '🌟 أنا هنا لمساعدتك! يمكنك سؤالي عن: بناء العادات، زيادة التركيز، تحديد الأهداف، تحسين الصحة، أو الحصول على تحفيز.',
    '💡 تذكير: أفضل استثمار هو الاستثمار في نفسك. خصص 30 دقيقة يومياً للتعلم والتطوير.',
    '🌱 نموذج 1%: إذا تحسنت 1% كل يوم، بعد سنة ستكون 37 مرة أفضل.',
    '🎯 لا تنتظر الدافع لتبدأ. ابدأ والدافع سيأتي.',
  ])
}

/* ────────────── Quick Actions ────────────── */

const quickActions = [
  { id: 'morning', label: 'نصيحة صباحية', icon: Sun, color: 'bg-gold/10 text-gold hover:bg-gold/20', triggerWord: 'صباح' },
  { id: 'review', label: 'مراجعة أسبوعية', icon: TrendingUp, color: 'bg-emerald-accent/10 text-emerald-accent hover:bg-emerald-accent/20', triggerWord: 'مراجعة' },
  { id: 'habits', label: 'اقتراح عادات', icon: Target, color: 'bg-forest/10 text-forest hover:bg-forest/20', triggerWord: 'عادة' },
  { id: 'productivity', label: 'نصيحة إنتاجية', icon: Lightbulb, color: 'bg-purple-500/10 text-purple-500 hover:bg-purple-500/20', triggerWord: 'تركيز' },
]

/* ────────────── AI Avatar ────────────── */

function AIAvatar({ size = 40, isOnline = true }: { size?: number; isOnline?: boolean }) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <motion.div
        className="absolute inset-[-6px] rounded-full border border-dashed border-emerald-accent/30"
        animate={{ rotate: 360 }}
        transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
      />
      <motion.div
        className="absolute inset-[-10px] rounded-full border border-dashed border-gold/20"
        animate={{ rotate: -360 }}
        transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
      />
      <motion.div
        className="absolute w-2 h-2 rounded-full bg-emerald-accent"
        style={{ top: -6, left: '50%', marginLeft: -4 }}
        animate={{ rotate: 360 }}
        transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
      >
        <motion.div
          className="w-2 h-2 rounded-full bg-gold"
          animate={{ scale: [1, 1.3, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ type: 'tween', duration: 2, repeat: Infinity, repeatType: 'reverse' }}
        />
      </motion.div>
      <div className={cn(
        'relative z-10 rounded-full flex items-center justify-center',
        'bg-gradient-to-br from-emerald-accent via-forest to-emerald-accent',
        'shadow-lg shadow-emerald-accent/20'
      )} style={{ width: size, height: size }}>
        <Brain className={cn('text-white', size > 35 ? 'w-5 h-5' : 'w-3.5 h-3.5')} />
      </div>
      {/* Online indicator */}
      <div className={cn(
        'absolute -bottom-0.5 -left-0.5 w-3 h-3 rounded-full border-2 border-background',
        isOnline ? 'bg-emerald-accent' : 'bg-muted-foreground/50'
      )} />
    </div>
  )
}

const suggestedPrompts = [
  { icon: Brain, text: 'كيف أبني تركيزاً أعمق؟', color: 'text-emerald-accent' },
  { icon: Target, text: 'ساعدني في تحديد أهدافي', color: 'text-forest' },
  { icon: Heart, text: 'نصيحة للصحة النفسية', color: 'text-rose-400' },
  { icon: Moon, text: 'روتين مسائي مثالي', color: 'text-purple-400' },
]

/* ────────────── Component ────────────── */

export default function AICoach() {
  const { auth } = useRiseStore()
  const STORAGE_KEY = 'rise-ai-chat'

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) return JSON.parse(stored)
    } catch { /* ignore */ }
    return []
  })
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [apiOnline, setApiOnline] = useState<boolean | null>(null)
  const [aiUsage, setAiUsage] = useState<{ used: number; limit: number; total: number } | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
    }
  }, [messages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  const sendToAI = useCallback(async (message: string, history: ChatMessage[]) => {
    if (auth?.accessToken === 'guest') {
      return { response: generateFallbackResponse(message), fallback: true }
    }

    try {
      const chatHistory = history.slice(-6).map(m => ({
        role: m.role,
        content: m.content,
      }))

      const res = await fetch('/api/rise/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          userId: auth?.userId || 'guest',
          history: chatHistory,
        }),
      })

      const data = await res.json()

      if (data.usage) {
        setAiUsage(data.usage)
      }

      // Detect API status
      if (apiOnline === null) {
        setApiOnline(!data.fallback)
      }

      return { response: data.response, fallback: data.fallback }
    } catch {
      return { response: generateFallbackResponse(message), fallback: true }
    }
  }, [auth, apiOnline])

  const addAIMessage = useCallback((content: string, isFallback = false) => {
    setIsTyping(true)
    const delay = isFallback ? Math.min(content.length * 5, 1000) : 1500
    setTimeout(() => {
      setIsTyping(false)
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'ai',
          content,
          timestamp: Date.now(),
          isFallback,
        },
      ])
    }, delay)
  }, [])

  const handleQuickAction = useCallback((actionId: string) => {
    const action = quickActions.find((a) => a.id === actionId)
    if (!action) return

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: action.label,
      timestamp: Date.now(),
    }

    setMessages((prev) => [...prev, userMsg])

    // Use local fallback for quick actions for instant response
    const response = generateFallbackResponse(action.triggerWord)
    addAIMessage(response, true)
  }, [addAIMessage])

  const handleSend = useCallback(async () => {
    if (!input.trim() || isTyping) return
    const userMessage = input.trim()
    setInput('')

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: userMessage,
      timestamp: Date.now(),
    }

    const newMessages = [...messages, userMsg]
    setMessages(newMessages)

    setIsTyping(true)
    const { response, fallback } = await sendToAI(userMessage, messages)
    setIsTyping(false)

    setMessages(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: 'ai',
        content: response,
        timestamp: Date.now(),
        isFallback: fallback,
      },
    ])
  }, [input, isTyping, messages, sendToAI])

  const clearChat = () => {
    setMessages([])
    localStorage.removeItem(STORAGE_KEY)
  }

  const hasMessages = messages.length > 0

  return (
    <div className="space-y-6 max-w-3xl mx-auto flex flex-col h-[calc(100vh-10rem)] relative overflow-hidden rounded-3xl">
      {/* Shifting gradient background */}
      <motion.div
        className="absolute inset-0 -z-10 rounded-3xl"
        animate={{
          background: [
            'linear-gradient(135deg, oklch(0.97 0.01 160 / 0.5), oklch(0.98 0.01 155 / 0.3))',
            'linear-gradient(135deg, oklch(0.96 0.02 85 / 0.4), oklch(0.97 0.01 160 / 0.3))',
            'linear-gradient(135deg, oklch(0.97 0.01 160 / 0.5), oklch(0.98 0.01 155 / 0.3))',
          ],
        }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
        style={{ backgroundSize: '300% 300%' }}
      />
      <div className="absolute inset-0 -z-10 noise-bg opacity-30 rounded-3xl" />

      {/* Header */}
      <div className="flex items-center justify-between shrink-0 relative z-10">
        <div className="flex items-center gap-3">
          <AIAvatar size={44} isOnline={apiOnline !== false} />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold tracking-tight text-gradient-forest">المدرب الذكي</h2>
              {apiOnline === false && (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
                  <WifiOff className="w-3 h-3" />
                  وضع محلي
                </span>
              )}
              {apiOnline === true && (
                <span className="flex items-center gap-1 text-[10px] text-emerald-accent bg-emerald-accent/10 px-2 py-0.5 rounded-full">
                  <Wifi className="w-3 h-3" />
                  متصل
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              مساعدك الشخصي للنمو والتطوير
              {aiUsage && (
                <span className="mr-2 text-xs opacity-70">
                  ({aiUsage.used}/{aiUsage.limit} رسالة)
                </span>
              )}
            </p>
          </div>
        </div>
        {hasMessages && (
          <Button variant="ghost" size="sm" onClick={clearChat} className="gap-1.5 text-xs text-muted-foreground hover:text-destructive">
            <Trash2 className="w-3.5 h-3.5" />
            مسح المحادثة
          </Button>
        )}
      </div>

      {/* Quick Actions */}
      {!hasMessages && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="shrink-0 relative z-10"
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
                  className="flex items-center gap-3 p-4 rounded-2xl glass transition-all hover:shadow-lg relative overflow-hidden group"
                >
                  <div className="absolute inset-0 rounded-2xl p-[1px] bg-gradient-to-br from-emerald-accent/20 via-transparent to-gold/20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                  <div className="p-2 rounded-xl bg-background/60">
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="font-semibold text-sm text-right">{action.label}</span>
                </motion.button>
              )
            })}
          </div>

          <div className="mt-6">
            <p className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
              <MessageCircle className="w-3.5 h-3.5" />
              جرّب هذه الأسئلة
            </p>
            <div className="space-y-2">
              {suggestedPrompts.map((prompt, i) => {
                const Icon = prompt.icon
                return (
                  <motion.button
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 + i * 0.1 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      const msg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: prompt.text, timestamp: Date.now() }
                      setMessages(prev => [...prev, msg])
                      setIsTyping(true)
                      sendToAI(prompt.text, [...messages, msg]).then(({ response, fallback }) => {
                        setIsTyping(false)
                        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'ai', content: response, timestamp: Date.now(), isFallback: fallback }])
                      })
                    }}
                    className="flex items-center gap-3 w-full p-3 rounded-xl glass hover:bg-muted/30 transition-all text-right group"
                  >
                    <div className="p-1.5 rounded-lg bg-muted/50 group-hover:bg-muted transition-colors">
                      <Icon className={cn('w-4 h-4', prompt.color)} />
                    </div>
                    <span className="text-sm text-foreground">{prompt.text}</span>
                  </motion.button>
                )
              })}
            </div>
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
              {msg.role === 'ai' ? <AIAvatar size={32} isOnline={!msg.isFallback} /> : (
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1 bg-muted/50">
                  <User className="w-4 h-4 text-muted-foreground" />
                </div>
              )}

              <div className={cn(
                'max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed backdrop-blur-sm',
                msg.role === 'ai'
                  ? 'glass rounded-tr-sm shadow-sm'
                  : 'bg-gradient-to-br from-emerald-accent to-forest text-white rounded-tl-sm shadow-md shadow-emerald-accent/10'
              )}>
                <p className="whitespace-pre-wrap">{msg.content}</p>
                <div className={cn(
                  'flex items-center gap-2 mt-1.5',
                  msg.role === 'ai' ? 'text-muted-foreground/60' : 'text-white/60'
                )}>
                  <p className="text-[10px]">
                    {new Date(msg.timestamp).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  {msg.isFallback && msg.role === 'ai' && (
                    <span className="flex items-center gap-0.5 text-[9px]">
                      <AlertCircle className="w-2.5 h-2.5" />
                      محلي
                    </span>
                  )}
                </div>
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
            <AIAvatar size={32} />
            <div className="glass rounded-2xl rounded-tr-sm px-4 py-3 shadow-sm">
              <div className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-2 h-2 rounded-full bg-emerald-accent"
                    animate={{ opacity: [0.3, 1, 0.3], y: [0, -6, 0] }}
                    transition={{
                      duration: 0.8,
                      repeat: Infinity,
                      delay: i * 0.15,
                      ease: 'easeInOut',
                    }}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Actions Bar */}
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