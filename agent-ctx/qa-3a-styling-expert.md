# Task ID: qa-3a — Styling Expert

## Objective
Significantly enhance the visual styling of the Dashboard and Sidebar components to feel truly premium and Apple-like.

## Dashboard Enhancements Applied (`src/components/rise/dashboard.tsx`)

### 1. Hero Section
- Added a subtle gradient background (`from-forest/[0.04] via-emerald-accent/[0.03] to-transparent`) behind the greeting section
- Dark mode variant with stronger opacity (`from-emerald-accent/[0.06] via-forest/[0.04]`)
- Added a decorative glow blur effect behind the XP progress bar (`blur-sm opacity-60`)

### 2. Stat Cards (4 score cards)
- Created a reusable `PremiumGlass` component with refined glassmorphism:
  - `border border-white/10` for light mode, `border border-white/5` for dark mode
  - Inner shadow: `shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]` + subtle outer shadow
- Each card now has a `MiniSparkline` component at the bottom showing trend data (morning, task, habit, focus scores from `dailyScores`)
- Hover effect: `translateY(-2px)` with enhanced shadow on hover via `scaleHover` variant (`whileHover: { y: -2 }`)
- Icon containers got inner shadow for depth

### 3. Weekly Chart
- Wrapped in `PremiumGlass` component for refined glass styling
- Enhanced gradient fill: added 50% midpoint with reduced opacity for smoother visual transition
- Tooltip now uses `PremiumGlass` styling with `border-white/10` and `shadow-xl`
- Added small colored dot indicator in tooltip entries

### 4. Section Headers
- Created `SectionHeader` component with:
  - 3px emerald right-border accent (`border-r-[3px] border-r-emerald-accent pr-2.5`) — RTL aware
  - Slightly larger font (`text-[15px] font-bold tracking-tight`)
- Applied to all sections: Tasks, Goals, Habits, Achievements, Health, Reading, Quote, Focus Sessions, Projects

### 5. Task List Items
- Added `getPriorityBorderColor()` function returning `border-r-2` with priority-matched colors:
  - High: `border-r-red-500/60`
  - Medium: `border-r-gold/60`
  - Low: `border-r-emerald-accent/60`
- Hover state: `hover:bg-emerald-accent/[0.03] dark:hover:bg-emerald-accent/[0.05]`
- Removed old dot indicator, replaced with the border accent

### 6. Quote Card
- Added large decorative watermark quotation mark (`"`) using absolute positioning
  - `text-[120px]`, `opacity-[0.04]` light / `opacity-[0.06]` dark
  - `select-none pointer-events-none` for accessibility
  - Placed top-right corner (`absolute top-2 right-4`)
- Star icon container gets subtle gold glow: `shadow-[0_0_20px_oklch(0.78_0.12_85/0.1)]`

### 7. Habit Grid
- Completed habits now have `pulse-glow` class for the pulsing animation
- Each habit icon gets a colored shadow matching its color via inline style:
  - `boxShadow: habit.todayCompleted ? '0 0 12px ${habit.color}40' : 'none'`
- Smooth `transition-shadow duration-300` on the icon container

### 8. Achievements
- Each badge card now uses the `shine` class for the sweep animation
- Added `border border-white/10 dark:border-white/5` for refined glassmorphism
- Added `whileHover={{ y: -3 }}` via framer-motion for hover lift effect

## Sidebar Enhancements Applied (`src/components/rise/sidebar.tsx`)

### 1. Header Gradient Line
- Added gradient line below the header: `bg-gradient-to-l from-transparent via-emerald-accent/40 to-gold/30`
- Positioned absolutely at the bottom of the header container

### 2. Active Item Indicator
- Replaced the small dot (`w-1.5 h-1.5 rounded-full`) with a **right-side accent bar**:
  - `w-[3px] h-5 rounded-r-full bg-emerald-accent`
  - Positioned `absolute left-0 top-1/2 -translate-y-1/2`
  - Uses `layoutId="activeIndicator"` with spring animation (`stiffness: 350, damping: 30`)

### 3. Hover Effects
- All nav buttons already had `transition-all duration-200` — confirmed and maintained

### 4. Group Titles
- Changed from `font-semibold` to `font-bold`
- Added small emerald dot before the text: `w-1.5 h-1.5 rounded-full bg-emerald-accent/40`

### 5. Footer XP Bar
- Added gradient glow behind the bar: `absolute -inset-0.5 rounded-full bg-gradient-to-l from-gold/20 to-gold-light/10 blur-[2px]`
- Bar fill now uses 3-stop gradient: `from-gold via-gold to-gold-light`
- Added shadow glow on the fill: `shadow-[0_0_8px_oklch(0.78_0.12_85/0.3)]`
- Inner shadow on the track: `shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]`
- Glass card wrapping: `border border-white/10 dark:border-white/5` with inner shadow
- Avatar gets shadow: `shadow-md shadow-gold/20`

### 6. Overall Sidebar Depth
- Added inner shadow: `shadow-[inset_-1px_0_0_rgba(0,0,0,0.03)]` for light, combined dark variant
- Added gradient line above footer: `bg-gradient-to-l from-transparent via-sidebar-border to-transparent`
- Logo icon gets emerald glow shadow: `shadow-lg shadow-emerald-accent/20`
- Close button gets `transition-colors duration-200`

## New Components Created
- `MiniSparkline`: Renders a tiny bar chart from an array of numbers with animated bars
- `SectionHeader`: Reusable section title with emerald right-border accent, icon, and optional badge
- `PremiumGlass`: Enhanced glassmorphism wrapper with inner shadow, gradient border, and refined styling

## Verification
- ESLint: ✅ Passes cleanly
- All text remains in Arabic
- All existing functionality preserved
- Both light and dark mode supported
- Responsive design maintained
- Framer-motion used for all animations