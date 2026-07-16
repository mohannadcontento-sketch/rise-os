/**
 * RiseOS Sound Effects System
 * All sounds generated programmatically using Web Audio API — no external files.
 */

/* ────────────── Types ────────────── */

export type SoundName =
  | 'task-complete'
  | 'habit-check'
  | 'success'
  | 'error'
  | 'click'
  | 'notification'
  | 'achievement'
  | 'timer-done'
  | 'delete'
  | 'message'

/* ────────────── Audio Context (lazy) ────────────── */

let ctx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!ctx) {
    ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

/* ────────────── Settings helpers ────────────── */

const STORAGE_KEY = 'rise-settings'

interface SoundSettings {
  sounds: boolean
  soundVolume: number // 0–1
}

function readSettings(): SoundSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      return {
        sounds: data.sounds ?? true,
        soundVolume: data.soundVolume ?? 0.5,
      }
    }
  } catch { /* ignore */ }
  return { sounds: true, soundVolume: 0.5 }
}

/* ────────────── Helpers ────────────── */

/** Pentatonic scale in C major — always sounds pleasant */
const FREQ = {
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  G4: 392.0,
  A4: 440.0,
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  G5: 783.99,
  A5: 880.0,
} as const

function createOsc(
  audioCtx: AudioContext,
  type: OscillatorType,
  freq: number,
  startAt: number,
  endAt: number,
  volume: number,
  masterGain: GainNode,
) {
  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, startAt)
  gain.gain.setValueAtTime(0, startAt)
  // Simple ADSR envelope
  const attackEnd = startAt + 0.01
  const decayEnd = startAt + 0.05
  const releaseStart = endAt - 0.03
  gain.gain.linearRampToValueAtTime(volume, attackEnd)
  gain.gain.linearRampToValueAtTime(volume * 0.7, decayEnd)
  if (releaseStart > decayEnd) {
    gain.gain.setValueAtTime(volume * 0.7, releaseStart)
  }
  gain.gain.linearRampToValueAtTime(0, endAt)
  osc.connect(gain).connect(masterGain)
  osc.start(startAt)
  osc.stop(endAt + 0.01)
}

/* ────────────── Sound Definitions ────────────── */

const soundFns: Record<SoundName, (audioCtx: AudioContext, master: GainNode, now: number) => void> = {
  /** Pleasant ascending 3-note chime — C5, E5, G5 */
  'task-complete': (ac, m, t) => {
    createOsc(ac, 'sine', FREQ.C5, t, t + 0.15, 0.3, m)
    createOsc(ac, 'sine', FREQ.E5, t + 0.08, t + 0.22, 0.3, m)
    createOsc(ac, 'sine', FREQ.G5, t + 0.16, t + 0.32, 0.3, m)
  },

  /** Soft single "ding" — C5 with gentle overtone */
  'habit-check': (ac, m, t) => {
    createOsc(ac, 'sine', FREQ.C5, t, t + 0.2, 0.25, m)
    createOsc(ac, 'sine', FREQ.C5 * 2, t, t + 0.12, 0.08, m)
  },

  /** Uplifting major chord — C4, E4, G4 */
  'success': (ac, m, t) => {
    createOsc(ac, 'sine', FREQ.C4, t, t + 0.25, 0.2, m)
    createOsc(ac, 'sine', FREQ.E4, t + 0.02, t + 0.27, 0.2, m)
    createOsc(ac, 'sine', FREQ.G4, t + 0.04, t + 0.3, 0.2, m)
  },

  /** Soft low tone — A3 region, brief */
  'error': (ac, m, t) => {
    createOsc(ac, 'sine', 220, t, t + 0.18, 0.2, m)
  },

  /** Very subtle micro-click — high freq, ultra short */
  'click': (ac, m, t) => {
    createOsc(ac, 'sine', 1800, t, t + 0.04, 0.08, m)
  },

  /** Gentle 2-note alert — E4, G4 */
  'notification': (ac, m, t) => {
    createOsc(ac, 'sine', FREQ.E4, t, t + 0.12, 0.2, m)
    createOsc(ac, 'sine', FREQ.G4, t + 0.1, t + 0.25, 0.2, m)
  },

  /** Celebratory arpeggio — C5, E5, G5, C6 */
  'achievement': (ac, m, t) => {
    createOsc(ac, 'sine', FREQ.C5, t, t + 0.15, 0.25, m)
    createOsc(ac, 'sine', FREQ.E5, t + 0.08, t + 0.23, 0.25, m)
    createOsc(ac, 'sine', FREQ.G5, t + 0.16, t + 0.35, 0.25, m)
    createOsc(ac, 'sine', FREQ.A5, t + 0.24, t + 0.48, 0.25, m)
  },

  /** Pleasant bell — C5 with harmonics */
  'timer-done': (ac, m, t) => {
    createOsc(ac, 'sine', FREQ.C5, t, t + 0.35, 0.3, m)
    createOsc(ac, 'sine', FREQ.E5, t + 0.01, t + 0.3, 0.15, m)
    createOsc(ac, 'sine', FREQ.G5, t + 0.02, t + 0.25, 0.1, m)
  },

  /** Descending soft whoosh — white noise + descending tone */
  'delete': (ac, m, t) => {
    // Descending sine
    const osc = ac.createOscillator()
    const g = ac.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(600, t)
    osc.frequency.exponentialRampToValueAtTime(150, t + 0.2)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.15, t + 0.02)
    g.gain.linearRampToValueAtTime(0, t + 0.22)
    osc.connect(g).connect(m)
    osc.start(t)
    osc.stop(t + 0.25)
  },

  /** Soft AI message — gentle two-tone */
  'message': (ac, m, t) => {
    createOsc(ac, 'sine', FREQ.D4, t, t + 0.1, 0.15, m)
    createOsc(ac, 'sine', FREQ.A4, t + 0.08, t + 0.2, 0.15, m)
  },
}

/* ────────────── Public API ────────────── */

/**
 * Play a sound effect by name.
 * Respects user settings (enabled/disabled, volume).
 * Call this from any component.
 */
export function playSound(name: SoundName): void {
  const s = readSettings()
  if (!s.sounds) return

  try {
    const ac = getCtx()
    const master = ac.createGain()
    master.gain.setValueAtTime(s.soundVolume * 0.6, ac.currentTime)
    master.connect(ac.destination)
    soundFns[name](ac, master, ac.currentTime)
    // Auto-cleanup master
    setTimeout(() => {
      try { master.disconnect() } catch { /* already disconnected */ }
    }, 1000)
  } catch {
    // Audio not available — silently fail
  }
}

/**
 * Check if sounds are currently enabled in settings.
 */
export function areSoundsEnabled(): boolean {
  return readSettings().sounds
}

/**
 * Get current volume (0–1).
 */
export function getSoundVolume(): number {
  return readSettings().soundVolume
}