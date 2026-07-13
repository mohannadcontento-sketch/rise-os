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
  Brain,
  Heart,
  Moon,
  MessageCircle,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/* ────────────── Types ────────────── */

interface ChatMessage {
  id: string
  role: 'user' | 'ai'
  content: string
  timestamp: number
}

/* ────────────── Response Engine ────────────── */

function randomFrom(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)]
}

function generateResponse(message: string): string {
  const msg = message.toLowerCase()

  // Morning advice
  if (msg.includes('صباح') || msg.includes('صباحي')) {
    return randomFrom([
      '🌿 صباح الخير! ابدأ يومك بهدوء. خذ نفساً عميقاً، اشرب كوب ماء دافئ، وامنح نفسك 5 دقائق من التأمل قبل الانطلاق. الصباح الهادئ يصنع يوماً مثمراً.',
      '☀️ تذكر: أول 60 دقيقة من يومك تحدد مساره. استثمرها فيما يهمك حقاً — لا في هاتفك. ابدأ بأهم مهمة قبل أن يبدأ العالم بطلب شيء منك.',
      '💧 نصيحة صباحية: لا تفتح هاتفك خلال أول 30 دقيقة. بدلاً من ذلك، اكتب 3 أشياء تشكر الله عليها وخطّط لثلاث مهمات رئيسية. هذا يضعك في وضع التحكم لا الاستجابة.',
    ])
  }

  // Habits
  if (msg.includes('عادة') || msg.includes('عادات')) {
    return randomFrom([
      '🎯 تذكر: لا تحاول بناء عادات متعددة دفعة واحدة. ابدأ بعادة واحدة صغيرة وثبتها لمدة 21 يوماً قبل إضافة أخرى. الاستمرارية أهم من الكثافة.',
      '📊 متوسط بناء عادة جديدة هو 66 يوماً، ليس 21. كن صبوراً مع نفسك. الأيام الصعبة هي التي تبني العادة، لا الأيام السهلة.',
      '🔥 سر العادات: اجعلها سهلة جداً لدرجة أنك لا تستطيع رفضها. إذا أردت القراءة، ضع الكتاب على وسادتك. إذا أردت التمرين، حضّر ملابسك من الليل.',
    ])
  }

  // Focus / productivity
  if (msg.includes('تركيز') || msg.includes('إنتاجي') || msg.includes('عمل')) {
    return randomFrom([
      '🧠 قاعدة العمل العميق: اختر مهمة واحدة، أغلق كل المشتتات (هاتف، إشعارات)، واعمل لمدة 50 دقيقة متواصلة. ثم خذ استراحة 10 دقائق. هذه الدورة تغيّر كل شيء.',
      '⚡ أهم مهارة في عصرنا: القدرة على التركيز العميق. تدرب يومياً — ابدأ بـ 25 دقيقة وزِد تدريجياً. بعد أسبوع ستلاحظ فرقاً هائلاً في جودة عملك.',
      '📋 نصيحة: في نهاية كل يوم، اكتب أهم 3 مهام للغد. في الصباح، ابدأ بالمهمة الأولى فوراً. هذه البساطة هي سر الأشخاص الأكثر إنتاجية في العالم.',
    ])
  }

  // Goals
  if (msg.includes('هدف') || msg.includes('أهداف')) {
    return randomFrom([
      '🎯 الأهداف الذكية تحتاج أن تكون: محددة، قابلة للقياس، واقعية، ومحددة بوقت. بدلاً من "أريد أن أصبح أفضل"، قل "سأقراءة كتابين هذا الشهر وأتمرن 4 مرات أسبوعياً".',
      '🚀 اقسم أهدافك الكبيرة إلى خطوات صغيرة يمكنك تنفيذها اليوم. هدف "كتابة كتاب" يبدأ بكتابة 300 كلمة اليوم. التقدم الصغير يبني الزخم الكبير.',
    ])
  }

  // Health / sleep
  if (msg.includes('نوم') || msg.includes('صحة') || msg.includes('صح')) {
    return randomFrom([
      '😴 النوم هو أقوى أداءتك. 7-8 ساعات من النوم الجيد تزيد إنتاجيتك بنسبة 20% على الأقل. ضع موعد نوم ثابت وحافظ عليه كأهم موعد في يومك.',
      '💧 لا تقلل من شرب الماء! الجفاف حتى بنسبة 2% يقلل التركيز والطاقة. ضع زجاجة ماء بجانبك دائماً وحدد هدفاً: 8 أكواب يومياً.',
      '🏃 الحركة ليست رفاهية — إنها ضرورة. حتى 15 دقيقة من المشي تزيد إبداعك بنسبة 60%. اجعل التمرين جزءاً غير قابل للتفاوض من يومك.',
    ])
  }

  // Motivation / general
  if (msg.includes('تحفيز') || msg.includes('محبط') || msg.includes('صعب') || msg.includes('تعب')) {
    return randomFrom([
      '💪 تذكر: كل شخص ناجح مر بلحظات إحباط. الفرق ليس عدم الشعور بالإحباط — بل القدرة على الاستمرار رغمه. أنت أقوى مما تعتقد.',
      '🌟 لا تقارن بدايتك بموسم حصاد الآخرين. كل شخص له رحلته الخاصة. ركّز على التحسن اليومي، ليس على الكمال. 1% تحسن يومياً = 37 مرة أفضل في نهاية السنة.',
      '🔥 "النجاح ليس نهائياً والفشل ليس قاتلاً. الشجاعة للاستمرار هي ما يهم." — ونستون تشرشل. استمر، فكل خطوة تقربك.',
    ])
  }

  // Weekly review
  if (msg.includes('مراجعة') || msg.includes('مراجع')) {
    return randomFrom([
      '📊 حان وقت المراجعة الأسبوعية! اسأل نفسك 3 أسئلة: ما الذي سار بشكل جيد؟ ما الذي يمكن تحسينه؟ ما أهم درس تعلمته؟ خذ 10 دقائق واكتب إجاباتك. المراجعة المنتظمة تضاعف أثر كل جهد تبذله.',
      '🔄 في المراجعة الأسبوعية، انظر إلى أهدافك: كم منها حققت؟ ما الذي عطلك؟ ما المهارات التي طورتها؟ الوعي الذاتي هو الخطوة الأولى نحو النمو. لا تحكم على نفسك بقسوة، بل تعلم من التجربة!',
      '📈 نصيحة المراجعة: قارن نفسك بنفسك الأسبوع الماضي، لا بالآخرين. التقدم بالنسبة لنفسك هو المقياس الحقيقي. حتى تحسن بسيط يستحق الاحتفال.',
    ])
  }

  // Default responses
  return randomFrom([
    '🌟 أنا هنا لمساعدتك! يمكنك سؤالي عن: بناء العادات، زيادة التركيز، تحديد الأهداف، تحسين الصحة، أو الحصول على تحفيز. ما الذي يشغل بالك الآن؟',
    '💡 تذكير: أفضل استثمار هو الاستثمار في نفسك. خصص 30 دقيقة يومياً للتعلم والتطوير. هذا الوقت سيعود عليك أضعافاً مضاعفة.',
    '🌱 نموذج 1%: إذا تحسنت 1% كل يوم، بعد سنة ستكون 37 مرة أفضل. ابدأ اليوم بخطوة صغيرة نحو النسخة الأفضل منك.',
    '🎯 السر: لا تنتظر الدافع لتبدأ. ابدأ والدفع سيأتي. الحركة تولّد الطاقة. حتى 5 دقائق من العمل على مهمتك ستكسر حاجز المماطلة.',
    '📊 راجع أسبوعك: ما الذي سار بشكل جيد؟ ما الذي يمكن تحسينه؟ ما أهم درس تعلمته؟ المراجعة الأسبوعية تضاعف أثر كل جهد تبذله.',
  ])
}

/* ────────────── Quick Actions ────────────── */

const quickActions = [
  {
    id: 'morning',
    label: 'نصيحة صباحية',
    icon: Sun,
    color: 'bg-gold/10 text-gold hover:bg-gold/20',
    triggerWord: 'صباح',
  },
  {
    id: 'review',
    label: 'مراجعة أسبوعية',
    icon: TrendingUp,
    color: 'bg-emerald-accent/10 text-emerald-accent hover:bg-emerald-accent/20',
    triggerWord: 'مراجعة',
  },
  {
    id: 'habits',
    label: 'اقتراح عادات',
    icon: Target,
    color: 'bg-forest/10 text-forest hover:bg-forest/20',
    triggerWord: 'عادة',
  },
  {
    id: 'productivity',
    label: 'نصيحة إنتاجية',
    icon: Lightbulb,
    color: 'bg-purple-500/10 text-purple-500 hover:bg-purple-500/20',
    triggerWord: 'تركيز',
  },
]

/* ────────────── AI Avatar with Orbits ────────────── */

function AIAvatar({ size = 40 }: { size?: number }) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Orbiting ring 1 */}
      <motion.div
        className="absolute inset-[-6px] rounded-full border border-dashed border-emerald-accent/30"
        animate={{ rotate: 360 }}
        transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
      />
      {/* Orbiting ring 2 */}
      <motion.div
        className="absolute inset-[-10px] rounded-full border border-dashed border-gold/20"
        animate={{ rotate: -360 }}
        transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
      />
      {/* Orbiting dot */}
      <motion.div
        className="absolute w-2 h-2 rounded-full bg-emerald-accent"
        style={{ top: -6, left: '50%', marginLeft: -4 }}
        animate={{ rotate: 360 }}
        transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
      >
        <motion.div
          className="w-2 h-2 rounded-full bg-gold"
          animate={{ scale: [1, 1.3, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      </motion.div>
      {/* Main avatar */}
      <div className={cn(
        'relative z-10 rounded-full flex items-center justify-center',
        'bg-gradient-to-br from-emerald-accent via-forest to-emerald-accent',
        'shadow-lg shadow-emerald-accent/20'
      )} style={{ width: size, height: size }}>
        <Brain className={cn('text-white', size > 35 ? 'w-5 h-5' : 'w-3.5 h-3.5')} />
      </div>
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
  const STORAGE_KEY = 'rise-ai-chat'

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) return JSON.parse(stored)
    } catch {
      // ignore
    }
    return []
  })
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
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

  const addAIMessage = (content: string) => {
    setIsTyping(true)
    const delay = Math.min(content.length * 8, 2000)
    setTimeout(() => {
      setIsTyping(false)
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

    // Generate response via keyword matching using trigger word
    const response = generateResponse(action.triggerWord)
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

    const response = generateResponse(userMessage)
    addAIMessage(response)
  }

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
          <AIAvatar size={44} />
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-gradient-forest">المدرب الذكي</h2>
            <p className="text-sm text-muted-foreground mt-0.5">مساعدك الشخصي للنمو والتطوير</p>
          </div>
        </div>
        {hasMessages && (
          <Button variant="ghost" size="sm" onClick={clearChat} className="gap-1.5 text-xs text-muted-foreground hover:text-destructive">
            <Trash2 className="w-3.5 h-3.5" />
            مسح المحادثة
          </Button>
        )}
      </div>

      {/* Quick Actions with gradient borders */}
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
                  {/* Gradient border effect */}
                  <div className="absolute inset-0 rounded-2xl p-[1px] bg-gradient-to-br from-emerald-accent/20 via-transparent to-gold/20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                  <div className="p-2 rounded-xl bg-background/60">
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="font-semibold text-sm text-right">{action.label}</span>
                </motion.button>
              )
            })}
          </div>

          {/* Suggested Prompts */}
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
                      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'user', content: prompt.text, timestamp: Date.now() }])
                      addAIMessage(generateResponse(prompt.text))
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
              {msg.role === 'ai' ? <AIAvatar size={32} /> : (
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1 bg-muted/50">
                  <User className="w-4 h-4 text-muted-foreground" />
                </div>
              )}

              {/* Message Bubble with glass effect */}
              <div className={cn(
                'max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed backdrop-blur-sm',
                msg.role === 'ai'
                  ? 'glass rounded-tr-sm shadow-sm'
                  : 'bg-gradient-to-br from-emerald-accent to-forest text-white rounded-tl-sm shadow-md shadow-emerald-accent/10'
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