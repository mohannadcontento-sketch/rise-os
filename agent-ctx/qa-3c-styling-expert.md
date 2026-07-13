# Task ID: qa-3c
Agent: Styling Expert
Task: Significantly enhance the visual styling of Habits, Journal, Deep Work, and Finance components

## Work Log

### File 1: habits.tsx
- **Pulsing toggle**: Added animated `boxShadow` ring pulse on toggle button when habit is completed, using framer-motion infinite animation with habit color
- **Card flash**: Added `flashCard` state and `AnimatePresence` overlay that briefly flashes the card with the habit's color on toggle (400ms fade)
- **Flame icon**: Added 🔥 emoji next to streak count when `streak.current > 3`
- **Heatmap**: Replaced basic hover with `motion.div` spring scale (1.3x on hover), today's cell now has `ring-2 ring-emerald-accent` with `shadow-[0_0_8px]` glow, added `transition-all duration-300` on heat cells for smooth color transitions
- **Stats Cards**: Added gradient border overlays using `absolute inset-0 p-[1px] bg-gradient-to-br from-*` pattern (emerald↔gold, gold↔emerald, forest↔gold, gold↔forest) with `pointer-events-none`

### File 2: journal.tsx
- **Textarea accents**: Added `border-r-[3px]` colored accents per field type (emerald for journal, rose for gratitude, gold for wins, orange for challenges, yellow for ideas, forest-light for tomorrow plan) via `TEXTAREA_ACCENT_COLORS` mapping
- **Mood emojis spring**: Changed from simple `scale: 1.1` to `animate={form.mood === m.value ? { scale: [1, 1.35, 1.1] } : { scale: 1 }}` with `type: 'spring', stiffness: 400, damping: 10`; added per-mood ring color classes
- **Energy slider gradient**: Added red→yellow→green gradient bar behind the range input with `linear-gradient(to left, #ef4444, #f97316, #eab308, #22c55e, #10b981)` that fills proportionally
- **Paper texture**: Wrapped the form section in a div with `bg-[repeating-linear-gradient(0deg,transparent,transparent_27px,oklch(0.5_0_0/0.03)_27px,...)]` for subtle lined paper effect
- **Entry mood strips**: Added `MOOD_STRIP_COLORS` mapping (1=red, 2=gray, 3=gold, 4=emerald, 5=emerald) with `absolute right-0 w-1` colored strip on each entry card
- **Hover elevation**: Added `hover:shadow-md hover:-translate-y-0.5` on entry cards
- **Calendar icon**: Imported `CalendarDays` and added it next to each entry's date display

### File 3: deep-work.tsx
- **Breathing glow**: Wrapped SVG timer in `motion.div` with animated `boxShadow` cycling between emerald glow values (running) and gold glow values (paused), with different speeds (2s running, 3s paused)
- **Gradient stroke**: Changed gradient from `emerald→forest` to `emerald→gold` for more visual impact; added `drop-shadow` filter that's stronger when running
- **Celebration burst**: Added 8 particle elements that burst outward in a circle using `Math.cos/sin` with fade and scale animations on session complete; added `celebrateKey` state for re-triggering
- **Duration presets**: Selected preset now has `ring-2 ring-emerald-accent/60 shadow-lg shadow-emerald-accent/10` plus a subtle inner glow animation; added preset label text below the time value
- **Ambient sounds**: Each sound card has unique `waveColor`; active sounds show 3 overlapping wave bars animating scaleX and opacity; active indicator now pulses with scale+opacity
- **Stats**: Added gradient border overlays matching habits pattern

### File 4: finance.tsx
- **Summary colored borders**: Added `absolute top-0 right-0 bottom-0 w-1 bg-{color}` strips on each summary card (green for income, orange for expenses, forest for savings, sky for investments)
- **Trend arrows**: Added `ArrowUpRight`/`ArrowDownRight` icons next to amounts (green up for income/savings/investment, red down for expenses)
- **Alternating rows**: Added `index % 2 === 0 ? 'bg-muted/20' : 'bg-transparent'` on transaction rows
- **Colored dots**: Added `config.dotColor` dot (`w-2 h-2 rounded-full`) before each transaction icon
- **Delete animation**: Enhanced with `whileHover/tap` scale, exit animation with `opacity: 0, x: -30, scale: 0.9, height: 0` for smooth collapse, added loading spinner while deleting
- **Donut chart**: Added `strokeWidth={0}` on Pie, `stroke="var(--color-card)" strokeWidth={2}` on Cell for clean separation; added center label showing total; enhanced legend with percentage values
- **Visual type cards**: Replaced Select dropdown with 5-column grid of visual type cards, each with icon, label, color scheme, and `ring-1` active state with colored backgrounds

## Rules Verified
- ✅ Only existing CSS variables and classes used
- ✅ framer-motion for all animations
- ✅ All text Arabic, RTL
- ✅ 'use client' and export default preserved
- ✅ Responsive (grid cols adapt, max-h with overflow)
- ✅ Dark/light mode via CSS variables
- ✅ Zero lint errors
- ✅ No functionality broken (all state, fetch, handlers preserved)