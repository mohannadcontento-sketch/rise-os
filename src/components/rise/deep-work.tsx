'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from 'recharts'
import {
  Brain,
  Play,
  Pause,
  RotateCcw,
  Square,
  CloudRain,
  TreePine,
  Coffee,
  Waves,
  Flame,
  Wind,
  Clock,
  Trophy,
  Zap,
  StickyNote,
  PartyPopper,
  Timer,
  TrendingUp,
  Target,
  Sparkles,
  Star,
  CheckCircle2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { notifyFocusComplete } from '@/lib/notifications'

/* ────────────── Types ────────────── */

interface FocusSession {
  id: string
  duration: number
  actualMin: number
  type: string
  completed: boolean
  startedAt: string
  completedAt: string | null
  notes: string
}

interface FocusData {
  sessions: FocusSession[]
}

/* ────────────── Constants ────────────── */

const DURATION_OPTIONS = [
  { label: 'بومودورو', value: 25, icon: Timer, color: 'text-rose-400', bgAccent: 'bg-rose-400/5' },
  { label: 'عميق ٥٠', value: 50, icon: Brain, color: 'text-emerald-accent', bgAccent: 'bg-emerald-accent/5' },
  { label: 'عميق ٩٠', value: 90, icon: Target, color: 'text-forest', bgAccent: 'bg-forest/5' },
  { label: 'عميق ١٢٠', value: 120, icon: Zap, color: 'text-gold', bgAccent: 'bg-gold/5' },
]

const AMBIENT_SOUNDS = [
  { label: 'مطر', icon: CloudRain, color: 'bg-blue-400/10 text-blue-400', waveColor: 'rgba(96, 165, 250, 0.08)' },
  { label: 'غابة', icon: TreePine, color: 'bg-emerald-accent/10 text-emerald-accent', waveColor: 'rgba(16, 185, 129, 0.08)' },
  { label: 'قهوة', icon: Coffee, color: 'bg-amber-600/10 text-amber-600', waveColor: 'rgba(217, 119, 6, 0.08)' },
  { label: 'محيط', icon: Waves, color: 'bg-cyan-500/10 text-cyan-500', waveColor: 'rgba(6, 182, 212, 0.08)' },
  { label: 'نار', icon: Flame, color: 'bg-orange-500/10 text-orange-500', waveColor: 'rgba(249, 115, 22, 0.08)' },
  { label: 'رياح', icon: Wind, color: 'bg-teal-400/10 text-teal-400', waveColor: 'rgba(45, 212, 191, 0.08)' },
]

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
}

/* ────────────── Helper ────────────── */

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

function getDurationLabel(min: number): string {
  return DURATION_OPTIONS.find((d) => d.value === min)?.label || `${min} دقيقة`
}

/* ────────────── Component ────────────── */

export default function DeepWork() {
  const [data, setData] = useState<FocusData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Timer state
  const [selectedDuration, setSelectedDuration] = useState(25)
  const [timeRemaining, setTimeRemaining] = useState(25 * 60)
  const [isRunning, setIsRunning] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [sessionCompleted, setSessionCompleted] = useState(false)
  const [sessionStartTime, setSessionStartTime] = useState<string | null>(null)
  const [sessionNotes, setSessionNotes] = useState('')
  const [celebrateKey, setCelebrateKey] = useState(0)

  // Ambient sounds (visual only)
  const [activeSounds, setActiveSounds] = useState<Set<string>>(new Set())

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  /* ─── Fetch ─── */
  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/rise/focus')
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch {
      toast.error('فشل في تحميل جلسات العمل')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  /* ─── Timer Logic ─── */
  useEffect(() => {
    if (isRunning && !isPaused) {
      intervalRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            clearInterval(intervalRef.current!)
            setIsRunning(false)
            setIsPaused(false)
            setSessionCompleted(true)
            setCelebrateKey((k) => k + 1)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isRunning, isPaused])

  /* ─── Save Session ─── */
  const saveSession = async (completed: boolean) => {
    if (!sessionStartTime) return
    setSaving(true)
    try {
      const elapsedMin = Math.round((selectedDuration * 60 - timeRemaining) / 60)
      const res = await fetch('/api/rise/focus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          duration: selectedDuration,
          actualMin: elapsedMin,
          type: getDurationLabel(selectedDuration),
          completed,
          startedAt: sessionStartTime,
          completedAt: completed ? new Date().toISOString() : null,
          notes: sessionNotes,
        }),
      })
      if (res.ok) {
        if (completed) {
          const xp = Math.round(elapsedMin * 2)
          notifyFocusComplete(elapsedMin, xp)
          fetch('/api/rise/earn-xp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: Math.floor(elapsedMin / 10), reason: `focus:${selectedDuration}min` }) }).catch(() => {})
        } else {
          toast.success('تم حفظ الجلسة')
        }
        fetchSessions()
      }
    } catch {
      toast.error('فشل في حفظ الجلسة')
    } finally {
      setSaving(false)
    }
  }

  /* ─── Controls ─── */
  const handleStart = () => {
    if (!sessionStartTime) {
      setSessionStartTime(new Date().toISOString())
    }
    setIsRunning(true)
    setIsPaused(false)
    setSessionCompleted(false)
  }

  const handlePause = () => {
    setIsPaused(true)
  }

  const handleResume = () => {
    setIsPaused(false)
  }

  const handleReset = () => {
    setIsRunning(false)
    setIsPaused(false)
    setSessionCompleted(false)
    setTimeRemaining(selectedDuration * 60)
    setSessionStartTime(null)
  }

  const handleStop = () => {
    setIsRunning(false)
    setIsPaused(false)
    const elapsedMin = Math.round((selectedDuration * 60 - timeRemaining) / 60)
    if (elapsedMin > 0) {
      saveSession(false)
    }
    setTimeRemaining(selectedDuration * 60)
    setSessionStartTime(null)
  }

  const handleDurationSelect = (min: number) => {
    if (isRunning) return
    setSelectedDuration(min)
    setTimeRemaining(min * 60)
    setSessionCompleted(false)
    setSessionStartTime(null)
  }

  const toggleSound = (label: string) => {
    setActiveSounds((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  /* ─── Computed ─── */
  const totalSeconds = selectedDuration * 60
  const progress = totalSeconds > 0 ? ((totalSeconds - timeRemaining) / totalSeconds) * 100 : 0

  const circumference = 2 * Math.PI * 120
  const strokeDashoffset = circumference - (progress / 100) * circumference

  const stats = useMemo(() => {
    const sessions = data?.sessions || []
    const totalMin = sessions.reduce((sum, s) => sum + (s.actualMin || 0), 0)
    const todayStr = new Date().toISOString().split('T')[0]
    const todaySessions = sessions.filter((s) => s.startedAt?.startsWith(todayStr))
    const todayMin = todaySessions.reduce((sum, s) => sum + (s.actualMin || 0), 0)
    const avgMin = sessions.length
      ? Math.round(totalMin / sessions.length)
      : 0
    return { totalMin, todaySessions: todaySessions.length, todayMin, avgMin }
  }, [data])

  /* ─── Chart Data ─── */
  const chartData = useMemo(() => {
    const sessions = data?.sessions || []
    const days: Record<string, number> = {}
    for (let i = 13; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = d.toISOString().split('T')[0]
      days[key] = 0
    }
    sessions.forEach((s) => {
      const day = s.startedAt?.split('T')[0]
      if (day && days[day] !== undefined) {
        days[day] += s.actualMin || 0
      }
    })
    return Object.entries(days).map(([date, min]) => ({
      day: new Date(date).toLocaleDateString('ar-SA', { weekday: 'short', day: 'numeric' }),
      دقائق: min,
    }))
  }, [data])

  /* ─── Loading ─── */
  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-48" />
        <div className="flex justify-center">
          <Skeleton className="h-72 w-72 rounded-full" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-6 p-4 md:p-6"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-forest to-emerald-accent flex items-center justify-center shadow-lg">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">العمل العميق</h2>
            <p className="text-xs text-muted-foreground">ركّز وحقق أقصى إنتاجية</p>
          </div>
        </div>
      </motion.div>

      {/* Duration Selector with glow */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {DURATION_OPTIONS.map((opt) => {
          const Icon = opt.icon
          const isActive = selectedDuration === opt.value && !isRunning
          return (
            <motion.button
              key={opt.value}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => handleDurationSelect(opt.value)}
              disabled={isRunning}
              className={cn(
                'glass rounded-2xl p-4 text-center transition-all duration-200 relative overflow-hidden',
                isActive
                  ? 'ring-2 ring-emerald-accent/60 bg-emerald-accent/5 shadow-lg shadow-emerald-accent/10'
                  : 'hover:bg-muted/30',
                isRunning && 'opacity-50 cursor-not-allowed'
              )}
            >
              {isActive && (
                <motion.div
                  className="absolute inset-0 pointer-events-none"
                  animate={{
                    boxShadow: [
                      'inset 0 0 15px rgba(16,185,129,0.05)',
                      'inset 0 0 25px rgba(16,185,129,0.1)',
                      'inset 0 0 15px rgba(16,185,129,0.05)',
                    ],
                  }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                />
              )}
              <Icon className={cn('w-5 h-5 mx-auto mb-1.5', opt.color)} />
              <span className="text-sm font-bold text-foreground block">{opt.value} دقيقة</span>
              <span className="text-[11px] text-muted-foreground">{opt.label}</span>
            </motion.button>
          )
        })}
      </motion.div>

      {/* Timer with breathing glow */}
      <motion.div variants={itemVariants} className="flex justify-center">
        <div className="relative">
          <AnimatePresence>
            {sessionCompleted && (
              <motion.div
                key={celebrateKey}
                initial={{ opacity: 0, scale: 0.3 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                className="absolute inset-0 flex flex-col items-center justify-center z-10"
              >
                {/* Celebration burst particles */}
                {[...Array(8)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute w-2 h-2 rounded-full"
                    style={{
                      backgroundColor: i % 2 === 0 ? 'var(--color-gold)' : 'var(--color-emerald-accent)',
                    }}
                    initial={{ x: 0, y: 0, opacity: 1, scale: 0 }}
                    animate={{
                      x: Math.cos((i / 8) * Math.PI * 2) * 100,
                      y: Math.sin((i / 8) * Math.PI * 2) * 100,
                      opacity: 0,
                      scale: [0, 1.5, 0.5],
                    }}
                    transition={{ duration: 1.2, ease: 'easeOut' }}
                  />
                ))}
                <motion.div
                  animate={{ rotate: [0, -10, 10, -10, 0], scale: [1, 1.2, 1] }}
                  transition={{ duration: 0.5, repeat: 3 }}
                >
                  <PartyPopper className="w-12 h-12 text-gold mb-2" />
                </motion.div>
                <p className="text-lg font-bold text-foreground">أحسنت! 🎉</p>
                <p className="text-sm text-muted-foreground">أكملت جلسة العمل</p>
                <Button
                  onClick={() => {
                    setSessionCompleted(false)
                    saveSession(true)
                    setTimeRemaining(selectedDuration * 60)
                    setSessionStartTime(null)
                  }}
                  className="mt-4 bg-emerald-accent hover:bg-emerald-accent/90 text-white rounded-xl"
                  size="sm"
                >
                  <Trophy className="w-4 h-4 ml-1" />
                  حفظ الجلسة
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Breathing glow wrapper */}
          <motion.div
            animate={isRunning && !isPaused ? {
              boxShadow: [
                '0 0 20px rgba(16,185,129,0.15)',
                '0 0 40px rgba(16,185,129,0.25)',
                '0 0 20px rgba(16,185,129,0.15)',
              ],
            } : isPaused ? {
              boxShadow: [
                '0 0 15px rgba(234,179,8,0.1)',
                '0 0 25px rgba(234,179,8,0.18)',
                '0 0 15px rgba(234,179,8,0.1)',
              ],
            } : {}}
            transition={{
              duration: isPaused ? 3 : 2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="rounded-full"
          >
            <svg width="280" height="280" viewBox="0 0 280 280" className="transform -rotate-90">
              {/* Background circle */}
              <circle
                cx="140"
                cy="140"
                r="120"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                className="text-muted/50"
              />
              {/* Progress circle with gradient stroke */}
              <motion.circle
                cx="140"
                cy="140"
                r="120"
                fill="none"
                stroke="url(#timerGradient)"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                style={{
                  filter: isRunning && !isPaused
                    ? 'drop-shadow(0 0 6px var(--color-emerald-accent))'
                    : isPaused
                      ? 'drop-shadow(0 0 4px var(--color-gold))'
                      : 'none',
                }}
              />
              {/* Gradient def: emerald → gold */}
              <defs>
                <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="var(--color-emerald-accent)" />
                  <stop offset="100%" stopColor="var(--color-gold)" />
                </linearGradient>
              </defs>
            </svg>
          </motion.div>

          {/* Timer text overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <motion.span
              key={timeRemaining}
              initial={{ scale: 1.02 }}
              animate={{ scale: 1 }}
              className="text-5xl font-bold text-foreground tracking-tight tabular-nums"
              style={{ direction: 'ltr' }}
            >
              {formatTime(timeRemaining)}
            </motion.span>
            <span className="text-xs text-muted-foreground mt-1">
              {isRunning && !isPaused && 'جاري التركيز...'}
              {isPaused && 'متوقف مؤقتاً'}
              {!isRunning && !isPaused && !sessionCompleted && 'جاهز للبدء'}
            </span>
            {isRunning && !isPaused && (
              <motion.div
                className="w-2 h-2 rounded-full bg-emerald-accent mt-2"
                animate={{ opacity: [1, 0.3, 1], scale: [1, 1.3, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            )}
          </div>
        </div>
      </motion.div>

      {/* Controls */}
      <motion.div variants={itemVariants} className="flex items-center justify-center gap-3">
        {!isRunning && !sessionCompleted && (
          <motion.div whileTap={{ scale: 0.95 }} className="flex gap-3">
            <Button
              onClick={handleStart}
              className="bg-gradient-to-l from-emerald-accent to-forest hover:opacity-90 text-white shadow-lg rounded-xl h-12 px-8"
            >
              <Play className="w-5 h-5 ml-2" />
              ابدأ
            </Button>
            <Button
              onClick={handleReset}
              variant="outline"
              className="rounded-xl h-12 px-6"
            >
              <RotateCcw className="w-4 h-4 ml-1" />
              إعادة
            </Button>
          </motion.div>
        )}

        {isRunning && !isPaused && (
          <motion.div whileTap={{ scale: 0.95 }} className="flex gap-3">
            <Button
              onClick={handlePause}
              variant="outline"
              className="rounded-xl h-12 px-8 border-gold/30 text-gold hover:bg-gold/10"
            >
              <Pause className="w-5 h-5 ml-2" />
              استراحة
            </Button>
            <Button
              onClick={handleStop}
              variant="outline"
              className="rounded-xl h-12 px-6 border-destructive/30 text-destructive hover:bg-destructive/10"
            >
              <Square className="w-4 h-4 ml-1" />
              إنهاء
            </Button>
          </motion.div>
        )}

        {isPaused && (
          <motion.div whileTap={{ scale: 0.95 }} className="flex gap-3">
            <Button
              onClick={handleResume}
              className="bg-gradient-to-l from-emerald-accent to-forest hover:opacity-90 text-white shadow-lg rounded-xl h-12 px-8"
            >
              <Play className="w-5 h-5 ml-2" />
              استئناف
            </Button>
            <Button
              onClick={handleStop}
              variant="outline"
              className="rounded-xl h-12 px-6 border-destructive/30 text-destructive hover:bg-destructive/10"
            >
              <Square className="w-4 h-4 ml-1" />
              إنهاء
            </Button>
            <Button
              onClick={handleReset}
              variant="outline"
              className="rounded-xl h-12 px-6"
            >
              <RotateCcw className="w-4 h-4 ml-1" />
              إعادة
            </Button>
          </motion.div>
        )}
      </motion.div>

      {/* Session Notes */}
      {(isRunning || sessionCompleted) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md mx-auto"
        >
          <Card className="glass border-0 shadow-sm">
            <CardContent className="p-4">
              <label className="text-sm font-semibold text-foreground flex items-center gap-2 mb-2">
                <StickyNote className="w-4 h-4 text-gold" />
                ملاحظات الجلسة
              </label>
              <Textarea
                value={sessionNotes}
                onChange={(e) => setSessionNotes(e.target.value)}
                placeholder="اكتب ملاحظاتك عن الجلسة..."
                className="min-h-[80px] resize-none rounded-xl border-0 bg-muted/50 focus:bg-muted transition-colors text-sm"
                dir="rtl"
              />
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Ambient Sounds with unique colors and wave animation */}
      <motion.div variants={itemVariants}>
        <Card className="glass border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Waves className="w-4 h-4 text-emerald-accent" />
              أصوات محيطية
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
              {AMBIENT_SOUNDS.map((sound) => {
                const Icon = sound.icon
                const isActive = activeSounds.has(sound.label)
                return (
                  <motion.button
                    key={sound.label}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => toggleSound(sound.label)}
                    className={cn(
                      'rounded-2xl p-3 flex flex-col items-center gap-1.5 transition-all duration-200 border relative overflow-hidden',
                      isActive
                        ? 'border-emerald-accent/40 shadow-sm'
                        : 'border-transparent hover:bg-muted/30'
                    )}
                  >
                    {/* Wave animation background for active sounds */}
                    {isActive && (
                      <div className="absolute inset-0 overflow-hidden rounded-2xl">
                        <motion.div
                          className="absolute bottom-0 left-0 right-0 h-full"
                          style={{ backgroundColor: sound.waveColor }}
                          animate={{
                            backgroundPosition: ['0% 100%', '100% 0%', '0% 100%'],
                          }}
                          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                        />
                        {[...Array(3)].map((_, waveIdx) => (
                          <motion.div
                            key={waveIdx}
                            className="absolute bottom-0 left-0 right-0 rounded-full"
                            style={{
                              backgroundColor: sound.waveColor,
                              height: '40%',
                              transformOrigin: 'bottom',
                            }}
                            animate={{
                              scaleX: [0.3, 0.7, 0.3],
                              opacity: [0.3, 0.7, 0.3],
                              y: [0, -5, 0],
                            }}
                            transition={{
                              duration: 2,
                              repeat: Infinity,
                              ease: 'easeInOut',
                              delay: waveIdx * 0.4,
                            }}
                          />
                        ))}
                      </div>
                    )}

                    <div
                      className={cn(
                        'w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 relative z-10',
                        isActive ? sound.color : 'bg-muted text-muted-foreground'
                      )}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <span
                      className={cn(
                        'text-xs font-medium relative z-10',
                        isActive ? 'text-foreground' : 'text-muted-foreground'
                      )}
                    >
                      {sound.label}
                    </span>
                    {isActive && (
                      <motion.div
                        animate={{ scale: [1, 1.5, 1], opacity: [1, 0.3, 1] }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                        className="w-1.5 h-1.5 rounded-full bg-emerald-accent relative z-10"
                      />
                    )}
                  </motion.button>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Statistics with glass gradient borders */}
      <motion.div variants={itemVariants} className="grid grid-cols-3 gap-3 md:gap-4">
        <Card className="glass border-0 shadow-sm relative overflow-hidden">
          <div className="absolute inset-0 rounded-2xl p-[1px] bg-gradient-to-br from-emerald-accent/20 via-transparent to-gold/20 pointer-events-none" />
          <CardContent className="p-4 flex flex-col items-center text-center gap-1 relative">
            <div className="w-8 h-8 rounded-lg bg-emerald-accent/10 flex items-center justify-center">
              <Clock className="w-4 h-4 text-emerald-accent" />
            </div>
            <span className="text-2xl font-bold text-foreground count-up">{stats.totalMin}</span>
            <span className="text-[11px] text-muted-foreground">إجمالي الدقائق</span>
          </CardContent>
        </Card>
        <Card className="glass border-0 shadow-sm relative overflow-hidden">
          <div className="absolute inset-0 rounded-2xl p-[1px] bg-gradient-to-br from-gold/20 via-transparent to-emerald-accent/20 pointer-events-none" />
          <CardContent className="p-4 flex flex-col items-center text-center gap-1 relative">
            <div className="w-8 h-8 rounded-lg bg-gold/10 flex items-center justify-center">
              <Zap className="w-4 h-4 text-gold" />
            </div>
            <span className="text-2xl font-bold text-foreground count-up">{stats.todaySessions}</span>
            <span className="text-[11px] text-muted-foreground">جلسات اليوم</span>
          </CardContent>
        </Card>
        <Card className="glass border-0 shadow-sm relative overflow-hidden">
          <div className="absolute inset-0 rounded-2xl p-[1px] bg-gradient-to-br from-forest/20 via-transparent to-gold/20 pointer-events-none" />
          <CardContent className="p-4 flex flex-col items-center text-center gap-1 relative">
            <div className="w-8 h-8 rounded-lg bg-forest/10 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-forest" />
            </div>
            <span className="text-2xl font-bold text-foreground count-up">{stats.avgMin}</span>
            <span className="text-[11px] text-muted-foreground">متوسط الجلسة</span>
          </CardContent>
        </Card>
      </motion.div>

      {/* Focus Chart */}
      <motion.div variants={itemVariants}>
        <Card className="glass border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold">التركيز اليومي (آخر ١٤ يوم)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
                    axisLine={false}
                    tickLine={false}
                    width={30}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-popover)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '12px',
                      fontSize: '12px',
                      direction: 'rtl',
                    }}
                    labelStyle={{ color: 'var(--color-foreground)', fontWeight: 'bold' }}
                    formatter={(value: number) => [`${value} دقيقة`, 'التركيز']}
                  />
                  <Bar dataKey="دقائق" radius={[6, 6, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell
                        key={index}
                        fill={entry['دقائق'] > 0 ? 'var(--color-emerald-accent)' : 'var(--color-muted)'}
                        fillOpacity={entry['دقائق'] > 0 ? 0.8 : 0.3}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Session History */}
      <motion.div variants={itemVariants}>
        <Card className="glass border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold">سجل الجلسات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {(!data?.sessions || data.sessions.length === 0) ? (
                <div className="text-center py-10">
                  <Brain className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">لا توجد جلسات سابقة</p>
                </div>
              ) : (
                data.sessions.slice(0, 20).map((session, index) => (
                  <motion.div
                    key={session.id}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.03 }}
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/30 transition-colors"
                  >
                    <div
                      className={cn(
                        'w-9 h-9 rounded-lg flex items-center justify-center',
                        session.completed
                          ? 'bg-emerald-accent/10 text-emerald-accent'
                          : 'bg-gold/10 text-gold'
                      )}
                    >
                      {session.completed ? (
                        <Trophy className="w-4 h-4" />
                      ) : (
                        <Clock className="w-4 h-4" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {session.type}
                        </span>
                        <Badge
                          variant="secondary"
                          className={cn(
                            'text-[10px] rounded-full border-0',
                            session.completed
                              ? 'bg-emerald-accent/10 text-emerald-accent'
                              : 'bg-gold/10 text-gold'
                          )}
                        >
                          {session.completed ? 'مكتمل' : 'غير مكتمل'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span>{session.actualMin} دقيقة</span>
                        <span>•</span>
                        <span>
                          {new Date(session.startedAt).toLocaleDateString('ar-SA', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      {session.notes && (
                        <p className="text-xs text-muted-foreground/70 mt-1 truncate">
                          {session.notes}
                        </p>
                      )}
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}