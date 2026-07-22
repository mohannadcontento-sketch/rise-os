'use client'

import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

type CelebrationType = 'task' | 'habit' | 'achievement' | 'streak' | 'level-up'

interface CelebrationConfig {
  particleCount: number
  text: string
  colors: string[]
}

const CELEBRATION_CONFIGS: Record<CelebrationType, CelebrationConfig> = {
  task: {
    particleCount: 18,
    text: 'أحسنت! ✨',
    colors: ['#059669', '#10b981', '#34d399', '#f59e0b', '#fbbf24'],
  },
  habit: {
    particleCount: 22,
    text: 'عادة مكتملة! 🔥',
    colors: ['#064e3b', '#059669', '#10b981', '#f59e0b', '#d97706'],
  },
  achievement: {
    particleCount: 30,
    text: 'إنجاز جديد! 🏆',
    colors: ['#064e3b', '#059669', '#10b981', '#f59e0b', '#fbbf24', '#d97706'],
  },
  streak: {
    particleCount: 26,
    text: 'سلسلة مستمرة! 🔥',
    colors: ['#f59e0b', '#fbbf24', '#d97706', '#059669', '#10b981'],
  },
  'level-up': {
    particleCount: 40,
    text: 'مستوى جديد! 🎉',
    colors: ['#064e3b', '#059669', '#10b981', '#34d399', '#f59e0b', '#fbbf24', '#d97706'],
  },
}

interface ParticleData {
  id: number
  x: number
  y: number
  size: number
  color: string
  rotation: number
  shape: 'circle' | 'square' | 'triangle'
  velocityX: number
  velocityY: number
}

let celebrationCallback: ((type: CelebrationType, text?: string) => void) | null = null

export function triggerCelebration(type: string, text?: string) {
  const validType = type as CelebrationType
  celebrationCallback?.(validType, text)
}

function generateParticles(count: number, colors: string[]): ParticleData[] {
  const shapes: Array<'circle' | 'square' | 'triangle'> = ['circle', 'square', 'triangle']
  return Array.from({ length: count }, (_, i) => {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.8
    const speed = 120 + Math.random() * 200
    return {
      id: i,
      x: 0,
      y: 0,
      size: 6 + Math.random() * 8,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      shape: shapes[Math.floor(Math.random() * shapes.length)],
      velocityX: Math.cos(angle) * speed,
      velocityY: Math.sin(angle) * speed - 250,
    }
  })
}

function ParticleShape({ shape, color, size, rotation }: { shape: string; color: string; size: number; rotation: number }) {
  if (shape === 'circle') {
    return (
      <div
        className="rounded-full"
        style={{
          width: size,
          height: size,
          backgroundColor: color,
        }}
      />
    )
  }

  if (shape === 'square') {
    return (
      <div
        style={{
          width: size,
          height: size,
          backgroundColor: color,
          transform: `rotate(${rotation}deg)`,
          borderRadius: 2,
        }}
      />
    )
  }

  // triangle
  return (
    <div
      style={{
        width: 0,
        height: 0,
        borderLeft: `${size / 2}px solid transparent`,
        borderRight: `${size / 2}px solid transparent`,
        borderBottom: `${size}px solid ${color}`,
        transform: `rotate(${rotation}deg)`,
      }}
    />
  )
}

function CelebrationOverlayInner() {
  const [celebration, setCelebration] = useState<{ type: CelebrationType; text?: string } | null>(null)
  const [particles, setParticles] = useState<ParticleData[]>([])
  const [displayText, setDisplayText] = useState('')

  const handleTrigger = useCallback((type: CelebrationType, text?: string) => {
    const config = CELEBRATION_CONFIGS[type] || CELEBRATION_CONFIGS.task
    setParticles(generateParticles(config.particleCount, config.colors))
    setDisplayText(text || config.text)
    setCelebration({ type, text })

    // Auto dismiss after 2s
    setTimeout(() => {
      setCelebration(null)
      setParticles([])
    }, 2000)
  }, [])

  useEffect(() => {
    celebrationCallback = handleTrigger
    return () => {
      celebrationCallback = null
    }
  }, [handleTrigger])

  return (
    <AnimatePresence>
      {celebration && (
        <motion.div
          className="fixed inset-0 z-[9999] pointer-events-none flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {/* Floating text label */}
          <motion.div
            className="absolute bottom-1/3 text-xl md:text-2xl font-bold text-gold drop-shadow-lg"
            initial={{ opacity: 1, y: 0, scale: 0.8 }}
            animate={{
              opacity: [1, 1, 0],
              y: [0, -60, -100],
              scale: [0.8, 1.1, 1],
            }}
            transition={{ duration: 2, ease: 'easeOut', times: [0, 0.4, 1] }}
            dir="rtl"
          >
            {displayText}
          </motion.div>

          {/* Confetti particles */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2">
            {particles.map((p) => (
              <motion.div
                key={`${celebration.type}-${p.id}`}
                className="absolute"
                initial={{
                  x: 0,
                  y: 0,
                  opacity: 1,
                  scale: 0,
                }}
                animate={{
                  x: p.velocityX,
                  y: p.velocityY,
                  opacity: [1, 1, 0],
                  scale: [0, 1, 0.6],
                  rotate: p.rotation + 360,
                }}
                transition={{
                  duration: 1.8,
                  ease: [0.25, 0.46, 0.45, 0.94],
                  opacity: { duration: 2, times: [0, 0.6, 1] },
                }}
              >
                <ParticleShape shape={p.shape} color={p.color} size={p.size} rotation={p.rotation} />
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default function CelebrationOverlay() {
  return <CelebrationOverlayInner />
}
